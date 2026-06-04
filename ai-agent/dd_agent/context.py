"""Compact, org-scoped knowledge builders for the Due Diligence agent.

Every query filters on org_id (parameterised). The output is plain text laid out
for an LLM prompt — we deliberately compact long fields and summarise counts so a
few hundred rows fit comfortably in Gemini's context without embeddings/RAG.
"""
from __future__ import annotations

from typing import Any

from policy_agent.db import db_cursor

# Soft caps so a pathological tenant can't blow up the prompt. If a table exceeds
# its cap we include the first N rows and note the truncation.
MAX_CONTROLS = 800
MAX_ASSETS = 500
MAX_POLICIES = 300
MAX_VULNS = 400
MAX_CAPABILITIES = 300

_DESC_LIMIT = 220


def _trunc(text: Any, limit: int = _DESC_LIMIT) -> str:
    s = ("" if text is None else str(text)).replace("\r", " ").replace("\n", " ").strip()
    return s if len(s) <= limit else s[: limit - 1].rstrip() + "…"


def _frameworks(ctl_ref_fw: Any) -> str:
    if isinstance(ctl_ref_fw, list):
        return ", ".join(str(x) for x in ctl_ref_fw if x)
    return _trunc(ctl_ref_fw, 80)


# ── Control registry (primary grounding for the questionnaire) ───────────────
def fetch_controls(org_id: str) -> list[dict[str, Any]]:
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT ctl_id, ctl_name, ctl_status, ctl_type, enforcement_type,
                   ctl_description, ctl_ref_fw, evidence_metadata
              FROM control_registry
             WHERE org_id = %s
             ORDER BY ctl_name
            """,
            (org_id,),
        )
        return [dict(r) for r in cur.fetchall()]


def render_controls(controls: list[dict[str, Any]]) -> str:
    if not controls:
        return "(no controls in the registry for this organisation)"
    lines: list[str] = []
    shown = controls[:MAX_CONTROLS]
    for c in shown:
        ev = c.get("evidence_metadata")
        has_ev = bool(ev) and (not isinstance(ev, (list, dict)) or len(ev) > 0)
        lines.append(
            f"[{c.get('ctl_id')}] {c.get('ctl_name')} "
            f"| status={c.get('ctl_status')} "
            f"| type={c.get('ctl_type')} "
            f"| enforcement={c.get('enforcement_type')} "
            f"| frameworks={_frameworks(c.get('ctl_ref_fw')) or '-'} "
            f"| evidence={'yes' if has_ev else 'no'} "
            f":: {_trunc(c.get('ctl_description'))}"
        )
    if len(controls) > len(shown):
        lines.append(f"... (+{len(controls) - len(shown)} more controls omitted)")
    return "\n".join(lines)


# ── Other domains (chat grounding) ───────────────────────────────────────────
def _fetch(org_id: str, sql: str) -> list[dict[str, Any]]:
    with db_cursor() as cur:
        cur.execute(sql, (org_id,))
        return [dict(r) for r in cur.fetchall()]


def render_assets(org_id: str) -> str:
    rows = _fetch(
        org_id,
        """
        SELECT asset_id, name, category, criticality, asset_owner,
               business_unit, governed_status, status
          FROM assets
         WHERE org_id = %s
         ORDER BY name
        """,
    )
    total = len(rows)
    if total == 0:
        return "ASSETS: none recorded."
    with_owner = sum(1 for r in rows if (r.get("asset_owner") or "").strip())
    classified = sum(1 for r in rows if (r.get("criticality") or "").strip() or (r.get("category") or "").strip())
    header = (
        f"ASSETS (inventory): {total} total; {with_owner} have an assigned owner; "
        f"{classified} have a category/criticality classification."
    )
    lines = [
        f"[{r.get('asset_id')}] {r.get('name')} | category={r.get('category') or '-'} "
        f"| criticality={r.get('criticality') or '-'} | owner={r.get('asset_owner') or '-'} "
        f"| governed={r.get('governed_status') or '-'}"
        for r in rows[:MAX_ASSETS]
    ]
    if total > MAX_ASSETS:
        lines.append(f"... (+{total - MAX_ASSETS} more assets omitted)")
    return header + "\n" + "\n".join(lines)


def render_policies(org_id: str) -> str:
    rows = _fetch(
        org_id,
        """
        SELECT name, policy_status, document_type, is_master
          FROM policy_documents
         WHERE org_id = %s
         ORDER BY is_master DESC, name
        """,
    )
    if not rows:
        return "POLICIES: none recorded."
    lines = [
        f"- {r.get('name')} | status={r.get('policy_status') or '-'} "
        f"| type={r.get('document_type') or '-'}{' | MASTER' if r.get('is_master') else ''}"
        for r in rows[:MAX_POLICIES]
    ]
    extra = "" if len(rows) <= MAX_POLICIES else f"\n... (+{len(rows) - MAX_POLICIES} more)"
    return f"POLICIES ({len(rows)}):\n" + "\n".join(lines) + extra


def render_vulnerabilities(org_id: str) -> str:
    rows = _fetch(
        org_id,
        """
        SELECT name, status, derived_from, asset_id
          FROM vulnerability_management
         WHERE org_id = %s
         ORDER BY name
        """,
    )
    if not rows:
        return "VULNERABILITIES: none recorded."
    lines = [
        f"- {r.get('name')} | status={r.get('status') or '-'} "
        f"| source={r.get('derived_from') or '-'} | asset={r.get('asset_id') or '-'}"
        for r in rows[:MAX_VULNS]
    ]
    extra = "" if len(rows) <= MAX_VULNS else f"\n... (+{len(rows) - MAX_VULNS} more)"
    return f"VULNERABILITIES ({len(rows)}):\n" + "\n".join(lines) + extra


def render_capabilities(org_id: str) -> str:
    rows = _fetch(
        org_id,
        """
        SELECT capab_name, capab_owner, capab_provider
          FROM capability_register
         WHERE org_id = %s
         ORDER BY capab_name
        """,
    )
    if not rows:
        return "CAPABILITIES: none recorded."
    lines = []
    for r in rows[:MAX_CAPABILITIES]:
        prov = r.get("capab_provider")
        prov_s = ", ".join(str(x) for x in prov if x) if isinstance(prov, list) else (_trunc(prov, 60) or "-")
        lines.append(f"- {r.get('capab_name')} | owner={r.get('capab_owner') or '-'} | providers={prov_s or '-'}")
    extra = "" if len(rows) <= MAX_CAPABILITIES else f"\n... (+{len(rows) - MAX_CAPABILITIES} more)"
    return f"CAPABILITIES ({len(rows)}):\n" + "\n".join(lines) + extra


def control_context(org_id: str) -> str:
    """Control-registry-only context — primary grounding for the questionnaire."""
    return "=== CONTROL REGISTRY ===\n" + render_controls(fetch_controls(org_id))


def org_knowledge(org_id: str) -> str:
    """Broad context across all GRC domains — grounding for the chat endpoint."""
    return "\n\n".join(
        [
            "=== CONTROL REGISTRY ===\n" + render_controls(fetch_controls(org_id)),
            "=== " + render_assets(org_id),
            "=== " + render_policies(org_id),
            "=== " + render_vulnerabilities(org_id),
            "=== " + render_capabilities(org_id),
        ]
    )
