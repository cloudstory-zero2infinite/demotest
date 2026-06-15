"""Deterministic recompute of an org's standard control registry.

Inputs:
  - org_id
  - organizations.needed_framework (JSONB array of framework canonical names)
  - public.scf_controls + public.scf_control_frameworks (SCF reference tables)
  - public.control_registry rows for this org with scf_control_id IS NOT NULL

The agent does NOT touch:
  - control_registry rows where scf_control_id IS NULL (NN / legacy / manual)
  - control_registry rows where ctl_type != 'standard'

Behaviour for the rows it owns:
  - Add:    SCF controls now selected that don't yet exist in the registry
  - Update: existing rows whose ctl_ref_fw list changed (FW added/removed)
  - Delete: rows whose SCF control is no longer selected AND aren't enforced
  - Keep (orphan): rows whose SCF control is no longer selected BUT are
    enforced — the row survives untouched (its ctl_ref_fw still names the
    frameworks that originally claimed it, as a paper trail)

"Enforced" = ctl_status != 'NotEnforced' OR evidence_metadata is non-empty.
"""
from __future__ import annotations

import json
from typing import Any

from policy_agent.db import db_cursor


# ─── DB reads ───────────────────────────────────────────────────────────────

def fetch_selected_frameworks(org_id: str) -> list[str]:
    with db_cursor() as cur:
        cur.execute(
            "SELECT needed_framework FROM organizations WHERE id = %s",
            (org_id,),
        )
        row = cur.fetchone()
    if not row:
        return []
    val = row["needed_framework"] if isinstance(row, dict) else row[0]
    if not val:
        return []
    if isinstance(val, str):
        try:
            val = json.loads(val)
        except json.JSONDecodeError:
            return []
    return [str(x) for x in val if x]


def fetch_target_controls(framework_names: list[str]) -> dict[str, dict[str, Any]]:
    """Return a {scf_control_id: {control_name, control_description, scf_id, fws[]}}
    map for every SCF control claimed by at least one selected framework."""
    if not framework_names:
        return {}
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT c.scf_control_id, c.control_name, c.control_description, c.scf_id,
                   array_agg(DISTINCT cf.framework_name) AS fws
              FROM scf_controls c
              JOIN scf_control_frameworks cf USING (scf_control_id)
             WHERE cf.framework_name = ANY(%s)
             GROUP BY c.scf_control_id, c.control_name, c.control_description, c.scf_id
            """,
            (framework_names,),
        )
        rows = cur.fetchall()
    out: dict[str, dict[str, Any]] = {}
    for r in rows:
        rd = dict(r)
        out[rd["scf_control_id"]] = {
            "scf_control_id": rd["scf_control_id"],
            "scf_id": rd["scf_id"],
            "control_name": rd["control_name"] or "",
            "control_description": rd["control_description"] or "",
            "fws": sorted(rd["fws"] or []),
        }
    return out


def fetch_existing_managed_rows(org_id: str) -> dict[str, dict[str, Any]]:
    """Return a {scf_control_id: existing_row_dict} for control_registry rows
    this agent owns (scf_control_id IS NOT NULL)."""
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT id, scf_control_id, ctl_id, ctl_name, ctl_description, ctl_status,
                   ctl_ref_fw, evidence_metadata
              FROM control_registry
             WHERE org_id = %s AND scf_control_id IS NOT NULL
            """,
            (org_id,),
        )
        rows = cur.fetchall()
    out: dict[str, dict[str, Any]] = {}
    for r in rows:
        rd = dict(r)
        out[rd["scf_control_id"]] = rd
    return out


# ─── Helpers ────────────────────────────────────────────────────────────────

def is_enforced(row: dict[str, Any]) -> bool:
    status = (row.get("ctl_status") or "").strip()
    if status and status != "NotEnforced":
        return True
    em = row.get("evidence_metadata")
    if em is None:
        return False
    if isinstance(em, list):
        return len(em) > 0
    if isinstance(em, str):
        try:
            parsed = json.loads(em)
            return isinstance(parsed, list) and len(parsed) > 0
        except json.JSONDecodeError:
            return False
    return False


def compose_ctl_name(scf_control_id: str, control_name: str) -> str:
    """Per spec: '<SCF#>-<Control Name>', e.g. 'GOV-01.1-Steering Committee & Program Oversight'."""
    base = (control_name or "").strip()
    return f"{scf_control_id}-{base}" if base else scf_control_id


def fw_lists_equal(a: list[str] | None, b: list[str] | None) -> bool:
    aa = sorted(a or [])
    bb = sorted(b or [])
    return aa == bb


# ─── Diff ───────────────────────────────────────────────────────────────────

def compute_diff(
    target: dict[str, dict[str, Any]],
    existing: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    to_add: list[dict[str, Any]] = []
    to_update: list[dict[str, Any]] = []           # existing rows w/ changed ctl_ref_fw
    to_delete: list[dict[str, Any]] = []           # rows no longer claimed AND not enforced
    keep_orphan: list[dict[str, Any]] = []         # rows no longer claimed but enforced
    unchanged: list[dict[str, Any]] = []

    target_ids = set(target.keys())
    existing_ids = set(existing.keys())

    for sid in sorted(target_ids - existing_ids):
        t = target[sid]
        to_add.append({
            "scf_control_id": sid,
            "ctl_id": sid,
            "ctl_name": compose_ctl_name(sid, t["control_name"]),
            "ctl_description": t["control_description"],
            "ctl_ref_fw": t["fws"],
        })

    for sid in sorted(target_ids & existing_ids):
        t = target[sid]
        e = existing[sid]
        existing_fws = e.get("ctl_ref_fw") or []
        if isinstance(existing_fws, str):
            try:
                existing_fws = json.loads(existing_fws)
            except json.JSONDecodeError:
                existing_fws = []
        if fw_lists_equal(existing_fws, t["fws"]):
            unchanged.append({"scf_control_id": sid, "id": str(e["id"])})
        else:
            to_update.append({
                "id": str(e["id"]),
                "scf_control_id": sid,
                "ctl_ref_fw_old": sorted(existing_fws),
                "ctl_ref_fw_new": t["fws"],
            })

    for sid in sorted(existing_ids - target_ids):
        e = existing[sid]
        item = {
            "id": str(e["id"]),
            "scf_control_id": sid,
            "ctl_name": e.get("ctl_name"),
            "ctl_status": e.get("ctl_status"),
        }
        if is_enforced(e):
            keep_orphan.append(item)
        else:
            to_delete.append(item)

    return {
        "to_add": to_add,
        "to_update": to_update,
        "to_delete": to_delete,
        "keep_orphan": keep_orphan,
        "unchanged": unchanged,
    }


# ─── Apply ──────────────────────────────────────────────────────────────────

def apply_diff(org_id: str, diff: dict[str, Any]) -> dict[str, int]:
    """Apply add/update/delete in a single transaction."""
    counts = {"added": 0, "updated": 0, "deleted": 0}

    with db_cursor() as cur:
        # INSERT new rows. ctl_type='standard'; ctl_status default ('NotAssessed').
        for item in diff["to_add"]:
            # ctl_type must match the CHECK constraint values exactly:
            # 'NN' | 'Regulatory' | 'Standard' | 'Custom'. Capital S.
            cur.execute(
                """
                INSERT INTO control_registry (
                    org_id, scf_control_id, ctl_id, ctl_name, ctl_description,
                    ctl_type, ctl_ref_fw
                ) VALUES (
                    %s, %s, %s, %s, %s, 'Standard', %s::jsonb
                )
                """,
                (
                    org_id,
                    item["scf_control_id"],
                    item["ctl_id"],
                    item["ctl_name"],
                    item["ctl_description"],
                    json.dumps(item["ctl_ref_fw"]),
                ),
            )
            counts["added"] += 1

        # UPDATE ctl_ref_fw only — don't touch user-edited fields.
        for item in diff["to_update"]:
            cur.execute(
                """
                UPDATE control_registry
                   SET ctl_ref_fw = %s::jsonb,
                       updated_at = now()
                 WHERE id = %s AND org_id = %s
                """,
                (json.dumps(item["ctl_ref_fw_new"]), item["id"], org_id),
            )
            counts["updated"] += 1

        # DELETE unenforced rows whose SCF control fell out of the selection.
        for item in diff["to_delete"]:
            cur.execute(
                "DELETE FROM control_registry WHERE id = %s AND org_id = %s",
                (item["id"], org_id),
            )
            counts["deleted"] += 1

    return counts


# ─── Top-level entrypoints ──────────────────────────────────────────────────

def recompute_preview(org_id: str) -> dict[str, Any]:
    selected = fetch_selected_frameworks(org_id)
    target = fetch_target_controls(selected)
    existing = fetch_existing_managed_rows(org_id)
    diff = compute_diff(target, existing)
    return {
        "selected_frameworks": selected,
        "summary": {
            "to_add": len(diff["to_add"]),
            "to_update": len(diff["to_update"]),
            "to_delete_unenforced": len(diff["to_delete"]),
            "keep_orphan_enforced": len(diff["keep_orphan"]),
            "unchanged": len(diff["unchanged"]),
        },
        # Bounded preview slices so the UI can show a confirmation prompt
        # without dumping thousands of rows. Full data lives in the DB after apply.
        "samples": {
            "to_add": diff["to_add"][:10],
            "to_update": diff["to_update"][:10],
            "to_delete_unenforced": diff["to_delete"][:10],
            "keep_orphan_enforced": diff["keep_orphan"][:10],
        },
    }


def recompute_apply(org_id: str) -> dict[str, Any]:
    selected = fetch_selected_frameworks(org_id)
    target = fetch_target_controls(selected)
    existing = fetch_existing_managed_rows(org_id)
    diff = compute_diff(target, existing)
    counts = apply_diff(org_id, diff)
    return {
        "selected_frameworks": selected,
        "applied": counts,
        "kept_orphan_enforced": len(diff["keep_orphan"]),
        "unchanged": len(diff["unchanged"]),
    }
