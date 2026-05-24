"""FastAPI router for the Mapper Agent.

Mounted in ai-agent/main.py via:
    from mapper_agent.router import router as mapper_router
    app.include_router(mapper_router, prefix="/mapper")

Endpoints:
    POST /mapper/run    — runs the mapper for one trigger (Phase 1: "policies")
    GET  /mapper/graph  — returns ReactFlow-shaped {nodes, edges} for the visualizer
    GET  /mapper/health — readiness check (Neo4j reachable + ontology loaded)
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from .ontology_loader import ONTOLOGY
from .policy_extractor import (
    extract_for_org,
    NeedsMasterError,
    MultipleMastersError,
    NoScfReferenceError,
)
from .controls_extractor import (
    extract_for_org as extract_controls_for_org,
    NeedsPoliciesFirstError,
)
from .neo4j_writer import write_policy_mapping, write_controls_mapping, read_graph

router = APIRouter()


SUPPORTED_TRIGGERS = {"policies", "controls"}


class RunRequest(BaseModel):
    org_id: str
    trigger: str = "policies"


@router.post("/run")
async def run_mapping(req: RunRequest):
    if req.trigger not in SUPPORTED_TRIGGERS:
        raise HTTPException(
            status_code=400,
            detail=f"Trigger '{req.trigger}' not supported. Allowed: {sorted(SUPPORTED_TRIGGERS)}",
        )

    if req.trigger == "policies":
        return await _run_policies(req)
    if req.trigger == "controls":
        return await _run_controls(req)

    raise HTTPException(status_code=500, detail="Unreachable")


async def _run_policies(req: RunRequest):
    try:
        payload = extract_for_org(req.org_id)
    except NeedsMasterError:
        return {
            "status": "needs_master",
            "message": "No master policy marked for this org. Mark a policy as master and re-run.",
        }
    except NoScfReferenceError as e:
        return {
            "status": "needs_scf_reference",
            "message": str(e),
        }
    except MultipleMastersError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {e}")

    try:
        summary = write_policy_mapping(payload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Neo4j write failed: {e}")

    return {
        "status": "ok",
        "trigger": req.trigger,
        "master_policy_id": payload["master"]["policy_id"],
        "summary": summary,
        "extraction": payload["extraction"],
    }


async def _run_controls(req: RunRequest):
    try:
        payload = extract_controls_for_org(req.org_id)
    except NeedsPoliciesFirstError as e:
        # The 'controls' trigger anchors on SCFDomain nodes built by the
        # 'policies' trigger. If those aren't in Neo4j yet, tell the user.
        return {
            "status": "needs_policies_first",
            "message": str(e),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Controls extraction failed: {e}")

    try:
        summary = write_controls_mapping(payload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Neo4j write failed: {e}")

    return {
        "status": "ok",
        "trigger": req.trigger,
        "summary": summary,
    }


@router.get("/graph")
async def get_graph(
    org_id: str = Query(...),
    master_policy_id: str | None = Query(default=None),
):
    try:
        return read_graph(org_id=org_id, master_policy_id=master_policy_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Neo4j read failed: {e}")


@router.get("/health")
async def health():
    return {
        "status": "ok",
        "entities": list(ONTOLOGY.entities.keys()),
        "relationships": list(ONTOLOGY.relationships.keys()),
        "recipes": list(ONTOLOGY.recipes.keys()),
    }
