"""FastAPI router for the Fw-ControlRegistry Agent.

Mounted in ai-agent/main.py via:
    from fwcr_agent.router import router as fwcr_router
    app.include_router(fwcr_router, prefix="/fwcr")

Endpoints:
    POST /fwcr/recompute-preview  — dry-run; returns the add/update/delete diff
    POST /fwcr/recompute          — applies the diff
    GET  /fwcr/health             — readiness check
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .recomputer import recompute_preview, recompute_apply

router = APIRouter()


class RecomputeRequest(BaseModel):
    org_id: str


@router.post("/recompute-preview")
async def preview(req: RecomputeRequest):
    try:
        return recompute_preview(req.org_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recompute preview failed: {e}")


@router.post("/recompute")
async def apply(req: RecomputeRequest):
    try:
        return recompute_apply(req.org_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recompute failed: {e}")


@router.get("/health")
async def health():
    return {"status": "ok", "agent": "fw-control-registry"}
