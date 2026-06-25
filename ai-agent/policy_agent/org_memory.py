"""Org memory store — read/write the per-org 'org_mem.md' equivalent.

Writes go through a peer-review queue (org_memory_pending). For v1, peer review
is relaxed: any approver (even self) can approve a pending entry.
"""
from datetime import datetime, timezone
from .db import db_cursor


def get_org_memory(org_id: str) -> str:
    with db_cursor() as cur:
        cur.execute(
            "SELECT content_md FROM public.org_memory WHERE org_id = %s",
            (org_id,),
        )
        row = cur.fetchone()
        return (row["content_md"] if row else "") or ""


def get_org_name(org_id: str) -> str:
    with db_cursor() as cur:
        cur.execute(
            "SELECT name FROM public.organizations WHERE id = %s",
            (org_id,),
        )
        row = cur.fetchone()
        return row["name"] if row else "the organisation"


def submit_pending(org_id: str, proposed_by: str, diff_md: str, rationale: str | None) -> str:
    with db_cursor() as cur:
        cur.execute(
            """
            INSERT INTO public.org_memory_pending (org_id, proposed_by, diff_md, rationale)
            VALUES (%s, %s, %s, %s)
            RETURNING id
            """,
            (org_id, proposed_by, diff_md, rationale),
        )
        return cur.fetchone()["id"]


def list_pending(org_id: str) -> list[dict]:
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT id, proposed_by, diff_md, rationale, status, created_at
            FROM public.org_memory_pending
            WHERE org_id = %s AND status = 'pending'
            ORDER BY created_at ASC
            """,
            (org_id,),
        )
        return [dict(r) for r in cur.fetchall()]


def approve_pending(pending_id: str, reviewer_id: str) -> dict:
    """Approve a pending entry and append its diff into org_memory.content_md."""
    now = datetime.now(timezone.utc)
    with db_cursor() as cur:
        cur.execute(
            "SELECT org_id, diff_md, status FROM public.org_memory_pending WHERE id = %s",
            (pending_id,),
        )
        row = cur.fetchone()
        if not row:
            raise ValueError(f"pending_id {pending_id} not found")
        if row["status"] != "pending":
            raise ValueError(f"pending entry already {row['status']}")

        org_id = row["org_id"]
        diff_md = row["diff_md"]

        # Append-merge into org_memory (upsert).
        cur.execute(
            """
            INSERT INTO public.org_memory (org_id, content_md, updated_at, updated_by)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (org_id) DO UPDATE
              SET content_md = COALESCE(public.org_memory.content_md, '') ||
                               E'\n\n' || EXCLUDED.content_md,
                  updated_at = EXCLUDED.updated_at,
                  updated_by = EXCLUDED.updated_by
            """,
            (org_id, diff_md, now, reviewer_id),
        )
        cur.execute(
            """
            UPDATE public.org_memory_pending
               SET status = 'approved', reviewed_by = %s, reviewed_at = %s
             WHERE id = %s
            """,
            (reviewer_id, now, pending_id),
        )
        return {"org_id": str(org_id), "pending_id": str(pending_id), "status": "approved"}


def reject_pending(pending_id: str, reviewer_id: str) -> dict:
    now = datetime.now(timezone.utc)
    with db_cursor() as cur:
        cur.execute(
            """
            UPDATE public.org_memory_pending
               SET status = 'rejected', reviewed_by = %s, reviewed_at = %s
             WHERE id = %s AND status = 'pending'
            RETURNING id
            """,
            (reviewer_id, now, pending_id),
        )
        row = cur.fetchone()
        if not row:
            raise ValueError(f"pending_id {pending_id} not found or not pending")
        return {"pending_id": str(pending_id), "status": "rejected"}