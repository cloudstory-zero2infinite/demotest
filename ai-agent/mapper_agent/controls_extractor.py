"""Deterministic extractor for the 'controls' mapper trigger.

Builds the SCFDomain → Control → Capability → Asset chain by SQL join, no
LLM involvement. Match rules are intentionally loose because the underlying
fields (control_registry.ctld_by, capability_register.capab_cmdb_id) are
free-text JSON arrays / Postgres arrays — not FKs.

Returns a payload consumed by neo4j_writer.write_controls_mapping().
"""
from __future__ import annotations

from typing import Any

from policy_agent.db import db_cursor


class NeedsPoliciesFirstError(Exception):
    """Raised when the 'controls' trigger is invoked before 'policies' has
    run (no SCFDomain nodes exist for the org). The router converts this to
    a needs_policies_first response so the frontend can prompt the user."""


def _scf_id_from_control_id(scf_control_id: str) -> str:
    """'TDA-09.5' -> 'TDA'. Mirrors the rule in the SCF parser."""
    return (scf_control_id or '').split('-', 1)[0].strip()


def _fetch_standard_controls(org_id: str) -> list[dict[str, Any]]:
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT id, ctl_id, ctl_name, ctl_status, scf_control_id, ctld_by, ctl_ref_fw
              FROM control_registry
             WHERE org_id = %s
               AND ctl_type = 'Standard'
               AND scf_control_id IS NOT NULL
            """,
            (org_id,),
        )
        rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r["scf_id"] = _scf_id_from_control_id(r.get("scf_control_id") or "")
        # ctld_by may come back as a list (psycopg2 decodes JSONB) — defensive cast.
        cb = r.get("ctld_by")
        if cb is None:
            r["ctld_by"] = []
        elif isinstance(cb, list):
            r["ctld_by"] = [str(x).strip() for x in cb if x is not None and str(x).strip()]
        else:
            r["ctld_by"] = [str(cb).strip()] if str(cb).strip() else []
    return rows


def _fetch_capabilities(org_id: str) -> list[dict[str, Any]]:
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT capab_id, capab_name, capab_provider, capab_owner, capab_cmdb_id
              FROM capability_register
             WHERE org_id = %s
            """,
            (org_id,),
        )
        rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r["capab_provider"] = list(r.get("capab_provider") or [])
        r["capab_cmdb_id"]  = list(r.get("capab_cmdb_id") or [])
    return rows


def _fetch_assets(org_id: str) -> list[dict[str, Any]]:
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT id, asset_id, name, category
              FROM assets
             WHERE org_id = %s AND asset_id IS NOT NULL
            """,
            (org_id,),
        )
        return [dict(r) for r in cur.fetchall()]


def _fetch_scf_domains_in_graph_for_org(org_id: str) -> set[str]:
    """Read SCFDomain.scf_id values from Neo4j for this org. Returns the
    set of scf_ids already in the graph so we can skip Controls whose
    domain isn't visible (Cypher would create a dangling node otherwise)."""
    # Import here to avoid coupling on neo4j when controls trigger isn't used.
    from .neo4j_writer import _session
    out: set[str] = set()
    with _session() as s:
        for record in s.run(
            "MATCH (sd:SCFDomain {org_id: $org_id}) RETURN sd.scf_id AS scf_id",
            org_id=org_id,
        ):
            sid = record["scf_id"]
            if sid:
                out.add(sid)
    return out


def _match_capabilities(ctld_tokens: list[str], caps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """For each ctld_by token, find the first capability where the token
    matches (case-insensitive) capab_name, any capab_provider element, or
    capab_owner. Returns the de-duplicated list of {capab_id, matched_on}.
    """
    if not ctld_tokens:
        return []
    out: dict[str, dict[str, Any]] = {}    # capab_id -> {capab_id, matched_on}
    lower_caps = [
        {
            "row": c,
            "name": (c.get("capab_name") or "").strip().lower(),
            "providers": [str(p).strip().lower() for p in c.get("capab_provider") or [] if str(p).strip()],
            "owner": (c.get("capab_owner") or "").strip().lower(),
        }
        for c in caps
    ]
    for token in ctld_tokens:
        t = token.strip().lower()
        if not t:
            continue
        matched: dict[str, Any] | None = None
        # Priority: name > provider > owner. First hit wins.
        for c in lower_caps:
            if c["name"] and c["name"] == t:
                matched = {"capab_id": c["row"]["capab_id"], "matched_on": "capab_name"}
                break
        if not matched:
            for c in lower_caps:
                if t in c["providers"]:
                    matched = {"capab_id": c["row"]["capab_id"], "matched_on": "capab_provider"}
                    break
        if not matched:
            for c in lower_caps:
                if c["owner"] and c["owner"] == t:
                    matched = {"capab_id": c["row"]["capab_id"], "matched_on": "capab_owner"}
                    break
        if matched and matched["capab_id"] not in out:
            out[matched["capab_id"]] = matched
    return list(out.values())


def _match_assets(cmdb_tokens: list[str], assets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """For each capab_cmdb_id token, find assets where the token matches
    asset_id (case-insensitive) or assets.name (case-insensitive). Returns
    de-duplicated {asset_id, matched_on}."""
    if not cmdb_tokens:
        return []
    out: dict[str, dict[str, Any]] = {}
    lower_assets = [
        {
            "row": a,
            "asset_id_l": (a.get("asset_id") or "").strip().lower(),
            "name_l": (a.get("name") or "").strip().lower(),
        }
        for a in assets
    ]
    for token in cmdb_tokens:
        t = str(token).strip().lower()
        if not t:
            continue
        matched: dict[str, Any] | None = None
        for a in lower_assets:
            if a["asset_id_l"] and a["asset_id_l"] == t:
                matched = {"asset_id": a["row"]["asset_id"], "matched_on": "asset_id"}
                break
        if not matched:
            for a in lower_assets:
                if a["name_l"] and a["name_l"] == t:
                    matched = {"asset_id": a["row"]["asset_id"], "matched_on": "asset_name"}
                    break
        if matched and matched["asset_id"] not in out:
            out[matched["asset_id"]] = matched
    return list(out.values())


def extract_for_org(org_id: str) -> dict[str, Any]:
    domains_in_graph = _fetch_scf_domains_in_graph_for_org(org_id)
    if not domains_in_graph:
        raise NeedsPoliciesFirstError(
            "No SCFDomain nodes found for this org. Run the policies mapper first."
        )

    controls = _fetch_standard_controls(org_id)
    caps = _fetch_capabilities(org_id)
    assets = _fetch_assets(org_id)

    # Build the join graph in memory.
    control_payloads: list[dict[str, Any]] = []
    capabilities_used: dict[str, dict[str, Any]] = {}    # capab_id -> row
    assets_used: dict[str, dict[str, Any]] = {}          # asset_id -> row
    enforced_by_edges: list[dict[str, Any]] = []         # control->capability
    provided_by_edges: list[dict[str, Any]] = []         # capability->asset
    cap_by_id = {c["capab_id"]: c for c in caps}

    for ctrl in controls:
        # Only attach Controls whose SCFDomain is already in the graph;
        # otherwise the edge would dangle.
        if ctrl["scf_id"] not in domains_in_graph:
            continue
        control_payloads.append({
            "ctl_id": ctrl["ctl_id"],
            "ctl_name": ctrl["ctl_name"],
            "ctl_status": ctrl["ctl_status"],
            "scf_control_id": ctrl["scf_control_id"],
            "scf_id": ctrl["scf_id"],
        })
        for cap_match in _match_capabilities(ctrl["ctld_by"], caps):
            cap_row = cap_by_id[cap_match["capab_id"]]
            capabilities_used.setdefault(cap_row["capab_id"], cap_row)
            enforced_by_edges.append({
                "scf_control_id": ctrl["scf_control_id"],
                "capab_id": cap_row["capab_id"],
                "matched_on": cap_match["matched_on"],
            })
            for asset_match in _match_assets(cap_row.get("capab_cmdb_id") or [], assets):
                # Find the asset_id we used (already canonical case from DB).
                # Avoid duplicates per (capability, asset) pair.
                if not any(
                    e for e in provided_by_edges
                    if e["capab_id"] == cap_row["capab_id"] and e["asset_id"] == asset_match["asset_id"]
                ):
                    provided_by_edges.append({
                        "capab_id": cap_row["capab_id"],
                        "asset_id": asset_match["asset_id"],
                        "matched_on": asset_match["matched_on"],
                    })
                if asset_match["asset_id"] not in assets_used:
                    asset_row = next(
                        (a for a in assets if a.get("asset_id") == asset_match["asset_id"]),
                        None,
                    )
                    if asset_row:
                        assets_used[asset_match["asset_id"]] = asset_row

    return {
        "org_id": str(org_id),
        "controls": control_payloads,
        "capabilities": [
            {
                "capab_id": c["capab_id"],
                "capab_name": c.get("capab_name"),
                "capab_owner": c.get("capab_owner"),
            }
            for c in capabilities_used.values()
        ],
        "assets": [
            {
                "asset_id": a["asset_id"],
                "name": a.get("name"),
                "category": a.get("category"),
            }
            for a in assets_used.values()
        ],
        "enforced_by_edges": enforced_by_edges,
        "provided_by_edges": provided_by_edges,
        # Bookkeeping for the summary returned to the UI.
        "stats": {
            "total_standard_controls": len(controls),
            "controls_attached": len(control_payloads),
            "controls_with_capabilities": sum(
                1 for c in control_payloads
                if any(e["scf_control_id"] == c["scf_control_id"] for e in enforced_by_edges)
            ),
            "capabilities_used": len(capabilities_used),
            "assets_used": len(assets_used),
        },
    }
