"""LLM-driven extraction for the 'policies' trigger.

Inputs: org_id.
Reads:
    - Master policy (policy_documents where is_master=true)
    - Sibling policies (is_master=false) for the same org
    - Global SCF domain list (public.scf_domains) — uploaded by the SME via
      the internal-tool Control Framework tab. Used to constrain the LLM so
      Security Objectives can only be mapped to known SCF identifiers.
Calls:  Gemini with the prompt assembled from policy.yml.
Output: validated dict
        {
          "security_objectives": [...],   # each carries scf_ids: [str, ...]
          "child_policy_links":  [...]
        }
"""
from __future__ import annotations

import json
import os
import re
from typing import Any

import google.generativeai as genai

from policy_agent.db import db_cursor

from .ontology_loader import ONTOLOGY


class NeedsMasterError(Exception):
    """Raised when the org has no master policy marked yet."""


class MultipleMastersError(Exception):
    """Raised when more than one policy is marked is_master=true."""


class NoScfReferenceError(Exception):
    """Raised when public.scf_domains is empty (no SCF file uploaded yet)."""


def _gemini() -> genai.GenerativeModel:
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not configured")
    genai.configure(api_key=api_key)
    model_name = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
    return genai.GenerativeModel(model_name)


def _fetch_master(org_id: str) -> dict[str, Any]:
    ent = ONTOLOGY.entity("Policy")
    cols = ",".join(ent.source_columns)
    with db_cursor() as cur:
        cur.execute(
            f"SELECT {cols} FROM policy_documents "
            "WHERE org_id = %s AND is_master = true",
            (org_id,),
        )
        rows = cur.fetchall()
    if not rows:
        raise NeedsMasterError("No master policy marked for this org")
    if len(rows) > 1:
        raise MultipleMastersError(f"{len(rows)} master policies found for org {org_id}")
    return dict(rows[0])


def _fetch_children(org_id: str) -> list[dict[str, Any]]:
    with db_cursor() as cur:
        cur.execute(
            "SELECT policy_id, name, policy_ref, document_type "
            "FROM policy_documents "
            "WHERE org_id = %s AND is_master = false "
            "ORDER BY name",
            (org_id,),
        )
        return [dict(r) for r in cur.fetchall()]


def _fetch_scf_domains() -> list[dict[str, Any]]:
    """Read the 33 SCF domains. Global table, no org scoping."""
    with db_cursor() as cur:
        cur.execute(
            "SELECT scf_id, domain_name, principle, sort_order "
            "FROM scf_domains ORDER BY sort_order NULLS LAST, scf_id"
        )
        return [dict(r) for r in cur.fetchall()]


def _build_prompt(
    master: dict[str, Any],
    children: list[dict[str, Any]],
    scf_domains: list[dict[str, Any]],
) -> str:
    recipe = ONTOLOGY.recipe("policies")
    instructions = recipe.extraction.get("instructions", "").strip()
    schema = json.dumps(recipe.extraction.get("json_schema", {}), indent=2)

    children_block = json.dumps(
        [
            {
                "policy_id": c.get("policy_id"),
                "name": c.get("name"),
                "policy_ref": c.get("policy_ref"),
                "document_type": c.get("document_type"),
            }
            for c in children
        ],
        indent=2,
    )

    # Compact, structured rendering of the SCF list so the LLM treats it as a
    # closed enum. Principle text gives semantic anchor but is optional.
    scf_block = json.dumps(
        [
            {
                "scf_id": d["scf_id"],
                "domain_name": d.get("domain_name"),
                "principle": d.get("principle"),
            }
            for d in scf_domains
        ],
        indent=2,
    )

    return (
        f"{instructions}\n\n"
        f"=== JSON SCHEMA ===\n{schema}\n\n"
        f"=== SCF DOMAINS (closed list — only these scf_ids are valid) ===\n"
        f"{scf_block}\n\n"
        f"=== MASTER POLICY ===\n"
        f"name: {master.get('name')}\n"
        f"policy_ref: {master.get('policy_ref')}\n"
        f"document_type: {master.get('document_type')}\n\n"
        f"--- markdown body ---\n{master.get('markdown') or '(no body)'}\n\n"
        f"=== CANDIDATE CHILD POLICIES ===\n{children_block}\n"
    )


def _strip_code_fences(text: str) -> str:
    cleaned = text.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", cleaned, re.DOTALL)
    if fence:
        return fence.group(1).strip()
    return cleaned


def _validate(
    payload: dict[str, Any],
    allowed_child_ids: set[str],
    allowed_scf_ids: set[str],
) -> dict[str, Any]:
    """Drop anything outside the contract before it reaches Neo4j."""
    objectives_raw = payload.get("security_objectives") or []
    links_raw = payload.get("child_policy_links") or []

    objectives: list[dict[str, Any]] = []
    for o in objectives_raw:
        if not isinstance(o, dict) or not o.get("name"):
            continue
        scf_ids = [
            str(s).strip()
            for s in (o.get("scf_ids") or [])
            if isinstance(s, str) and str(s).strip() in allowed_scf_ids
        ]
        if not scf_ids:
            # An objective with no valid SCF mapping is useless to the graph.
            continue
        objectives.append(
            {
                "name": str(o["name"]).strip(),
                "description": (o.get("description") or "").strip() or None,
                "confidence": float(o["confidence"]) if isinstance(o.get("confidence"), (int, float)) else None,
                "scf_ids": scf_ids,
            }
        )

    links: list[dict[str, Any]] = []
    for l in links_raw:
        if not isinstance(l, dict):
            continue
        pid = l.get("policy_id")
        if pid not in allowed_child_ids:
            continue
        try:
            conf = float(l.get("confidence", 0))
        except (TypeError, ValueError):
            conf = 0.0
        covers = [
            str(c).strip()
            for c in (l.get("covers_scf_ids") or [])
            if isinstance(c, str) and str(c).strip() in allowed_scf_ids
        ]
        links.append(
            {
                "policy_id": pid,
                "confidence": max(0.0, min(1.0, conf)),
                "rationale": (l.get("rationale") or "").strip() or None,
                "matched_on": (l.get("matched_on") or "").strip() or None,
                "covers_scf_ids": covers,
            }
        )

    return {"security_objectives": objectives, "child_policy_links": links}


def extract_for_org(org_id: str) -> dict[str, Any]:
    """Top-level entry point used by the router."""
    master = _fetch_master(org_id)
    children = _fetch_children(org_id)
    scf_domains = _fetch_scf_domains()
    if not scf_domains:
        raise NoScfReferenceError(
            "public.scf_domains is empty — upload an SCF reference workbook via "
            "the internal-tool Control Framework tab before running the mapper."
        )

    prompt = _build_prompt(master, children, scf_domains)
    recipe = ONTOLOGY.recipe("policies")
    temperature = float(recipe.extraction.get("model_temperature", 0.2))

    model = _gemini()
    response = model.generate_content(
        prompt,
        generation_config={
            "temperature": temperature,
            "response_mime_type": "application/json",
        },
    )
    raw_text = _strip_code_fences(response.text or "")
    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"LLM did not return valid JSON: {e}\n---\n{raw_text[:1000]}")

    allowed_child_ids = {c["policy_id"] for c in children}
    allowed_scf_ids = {d["scf_id"] for d in scf_domains}
    validated = _validate(payload, allowed_child_ids, allowed_scf_ids)

    # Index of scf_id -> domain metadata so the writer can hydrate SCFDomain
    # node properties (`domain_name`, `sort_order`) without a second DB hit.
    scf_index = {
        d["scf_id"]: {
            "domain_name": d.get("domain_name"),
            "principle": d.get("principle"),
            "sort_order": d.get("sort_order"),
        }
        for d in scf_domains
    }

    return {
        "master": {
            "policy_id": master["policy_id"],
            "name": master.get("name"),
            "policy_ref": master.get("policy_ref"),
            "document_type": master.get("document_type"),
            "owner_name": master.get("owner_name"),
            "policy_status": master.get("policy_status"),
            "is_master": True,
            "org_id": str(master["org_id"]),
        },
        "children": [
            {
                "policy_id": c["policy_id"],
                "name": c.get("name"),
                "policy_ref": c.get("policy_ref"),
                "document_type": c.get("document_type"),
                "is_master": False,
                "org_id": org_id,
            }
            for c in children
        ],
        "scf_index": scf_index,
        "extraction": validated,
    }
