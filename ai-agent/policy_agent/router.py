"""FastAPI router for the Policy Creation Agent.

Mounted in ai-agent/main.py via:
    from policy_agent.router import router as policy_router
    app.include_router(policy_router, prefix="/policy")

Endpoints:
    POST /policy/draft               -> SSE stream of markdown chunks (or need_info JSON event)
    GET  /policy/org-memory          -> read current org_memory.content_md
    POST /policy/org-memory          -> submit a pending org_memory edit
    GET  /policy/org-memory/pending  -> list pending edits for an org
    POST /policy/org-memory/approve  -> approve a pending edit (peer review)
    POST /policy/org-memory/reject   -> reject a pending edit
"""
import json
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from . import org_memory as orgmem
from .info_checker import check_sufficiency
from .retriever import retrieve
from .generator import stream_markdown
from .prompts import build_drafter_prompt

router = APIRouter()

PolicyFamily = Literal["generic", "ISO27001", "SOC2"]


class DraftRequest(BaseModel):
    org_id: str
    policy_type: str                  # free text title, e.g. "Access Control Policy"
    policy_family: PolicyFamily = "generic"
    user_prompt: str                  # what the user typed in the AI box
    top_k: int = 8
    org_name: str | None = None


class OrgMemorySubmitRequest(BaseModel):
    org_id: str
    proposed_by: str
    diff_md: str
    rationale: str | None = None


class OrgMemoryReviewRequest(BaseModel):
    pending_id: str
    reviewer_id: str


def _sse(event: dict) -> bytes:
    return f"data: {json.dumps(event)}\n\n".encode("utf-8")


@router.post("/draft")
async def draft_policy(req: DraftRequest):
    """Stream a markdown policy draft via Server-Sent Events.

    Event types emitted:
        {"type":"need_info", "missing":[...], "prompts":{...}, "reasons":{...}}
        {"type":"start",     "citations":[{ref,file,section}, ...]}
        {"type":"chunk",     "text":"..."}
        {"type":"done"}
        {"type":"error",     "message":"..."}
    """

    def event_stream():
        try:
            # 1. Load org memory, name and run the info checker.
            org_mem = orgmem.get_org_memory(req.org_id)
            org_name = req.org_name or orgmem.get_org_name(req.org_id)
            check = check_sufficiency(req.policy_family, org_mem)

            if not check["sufficient"]:
                yield _sse({
                    "type": "need_info",
                    "missing": check["missing"],
                    "prompts": check["prompts"],
                    "reasons": check["reasons"],
                })
                return

            # 2. Retrieve top-k template chunks.
            chunks = retrieve(
                query=f"{req.policy_type}\n{req.user_prompt}",
                policy_family=req.policy_family if req.policy_family != "generic" else None,
                k=req.top_k,
            )
            citations = [
                {"ref": i + 1, "file": c["source_file"], "section": c.get("section")}
                for i, c in enumerate(chunks)
            ]
            yield _sse({"type": "start", "citations": citations})

            # 3. Stream the LLM draft.
            prompt = build_drafter_prompt(
                policy_type=req.policy_type,
                user_prompt=req.user_prompt,
                org_memory=org_mem,
                chunks=chunks,
                org_name=org_name,
            )
            for piece in stream_markdown(prompt):
                yield _sse({"type": "chunk", "text": piece})

            yield _sse({"type": "done"})
        except HTTPException as e:
            yield _sse({"type": "error", "message": e.detail})
        except Exception as e:
            yield _sse({"type": "error", "message": str(e)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable proxy buffering for true streaming
        },
    )


@router.get("/org-memory")
def read_org_memory(org_id: str):
    return {"org_id": org_id, "content_md": orgmem.get_org_memory(org_id)}


@router.post("/org-memory")
def submit_org_memory(req: OrgMemorySubmitRequest):
    pending_id = orgmem.submit_pending(
        org_id=req.org_id,
        proposed_by=req.proposed_by,
        diff_md=req.diff_md,
        rationale=req.rationale,
    )
    return {"pending_id": str(pending_id), "status": "pending"}


@router.get("/org-memory/pending")
def list_org_memory_pending(org_id: str):
    return {"org_id": org_id, "pending": orgmem.list_pending(org_id)}


@router.post("/org-memory/approve")
def approve_org_memory(req: OrgMemoryReviewRequest):
    try:
        return orgmem.approve_pending(req.pending_id, req.reviewer_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/org-memory/reject")
def reject_org_memory(req: OrgMemoryReviewRequest):
    try:
        return orgmem.reject_pending(req.pending_id, req.reviewer_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
