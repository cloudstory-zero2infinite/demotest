"""LLM-driven extraction for the 'policies' trigger.

Inputs: org_id.
Reads:  master policy (policy_documents where is_master=true) + sibling
        policies (is_master=false), scoped to org_id.
Calls:  Gemini with the prompt assembled from policy.yml.
Output: validated dict
        {
          "security_domains": [...],
          "child_policy_links": [...]
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
    # Children only need a thin projection — name/ref/document_type — for the LLM
    # to reason about. Keeping the prompt small avoids context-window pressure.
    with db_cursor() as cur:
        cur.execute(
            "SELECT policy_id, name, policy_ref, document_type "
            "FROM policy_documents "
            "WHERE org_id = %s AND is_master = false "
            "ORDER BY name",
            (org_id,),
        )
        return [dict(r) for r in cur.fetchall()]


def _build_prompt(master: dict[str, Any], children: list[dict[str, Any]]) -> str:
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

    return (
        f"{instructions}\n\n"
        f"=== JSON SCHEMA ===\n{schema}\n\n"
        f"=== MASTER POLICY ===\n"
        f"name: {master.get('name')}\n"
        f"policy_ref: {master.get('policy_ref')}\n"
        f"document_type: {master.get('document_type')}\n\n"
        f"--- markdown body ---\n{master.get('markdown') or '(no body)'}\n\n"
        f"=== CANDIDATE CHILD POLICIES ===\n{children_block}\n"
    )


def _strip_code_fences(text: str) -> str:
    # Gemini sometimes wraps JSON in ```json ... ``` despite being told not to.
    cleaned = text.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", cleaned, re.DOTALL)
    if fence:
        return fence.group(1).strip()
    return cleaned


def _validate(payload: dict[str, Any], allowed_child_ids: set[str]) -> dict[str, Any]:
    """Drop anything outside the contract before it reaches Neo4j."""
    domains_raw = payload.get("security_domains") or []
    links_raw = payload.get("child_policy_links") or []

    domains: list[dict[str, Any]] = []
    for d in domains_raw:
        if not isinstance(d, dict) or not d.get("name"):
            continue
        funcs = []
        for f in d.get("functions") or []:
            if isinstance(f, dict) and f.get("name"):
                funcs.append(
                    {
                        "name": str(f["name"]).strip(),
                        "description": (f.get("description") or "").strip() or None,
                        "confidence": float(f["confidence"]) if isinstance(f.get("confidence"), (int, float)) else None,
                    }
                )
        domains.append(
            {
                "name": str(d["name"]).strip(),
                "description": (d.get("description") or "").strip() or None,
                "confidence": float(d["confidence"]) if isinstance(d.get("confidence"), (int, float)) else None,
                "functions": funcs,
            }
        )

    links: list[dict[str, Any]] = []
    for l in links_raw:
        if not isinstance(l, dict):
            continue
        pid = l.get("policy_id")
        if pid not in allowed_child_ids:
            # The agent hallucinated a policy_id — drop it silently. Logged below.
            continue
        try:
            conf = float(l.get("confidence", 0))
        except (TypeError, ValueError):
            conf = 0.0
        links.append(
            {
                "policy_id": pid,
                "confidence": max(0.0, min(1.0, conf)),
                "rationale": (l.get("rationale") or "").strip() or None,
                "matched_on": (l.get("matched_on") or "").strip() or None,
                "covers_domains": [
                    str(c).strip() for c in (l.get("covers_domains") or []) if c
                ],
            }
        )

    return {"security_domains": domains, "child_policy_links": links}


def extract_for_org(org_id: str) -> dict[str, Any]:
    """Top-level entry point used by the router."""
    master = _fetch_master(org_id)
    children = _fetch_children(org_id)

    prompt = _build_prompt(master, children)
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

    allowed_ids = {c["policy_id"] for c in children}
    validated = _validate(payload, allowed_ids)

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
        "extraction": validated,
    }
