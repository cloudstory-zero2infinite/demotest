"""FastAPI router for the Due Diligence & TPRM agent.

Mounted in ai-agent/main.py via:
    from dd_agent.router import router as dd_router
    app.include_router(dd_router, prefix="/dd")

Endpoints:
    POST /dd/answer-questionnaire — auto-answer an uploaded questionnaire,
                                    grounded in the org's control_registry.
    POST /dd/ask                  — short (≤2 sentence) Q&A about the org's
                                    posture, grounded across all GRC domains.

Both are stateless: they read Supabase and return a response, writing nothing.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any

import google.generativeai as genai
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import context as ctx

router = APIRouter()

# Number of questions sent to the model per generate_content call. Keeps each
# JSON response small enough to avoid truncation on large questionnaires
QUESTION_BATCH = 20
# The four canonical answer fields we fill for every question.
ANSWER_FIELDS = ["answer", "comments", "evidence", "rationale"]


def _model() -> genai.GenerativeModel:
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(os.environ.get("GEMINI_MODEL", "gemini-2.0-flash"))


def _strip_fences(text: str) -> str:
    t = (text or "").strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z]*\n?", "", t)
        t = re.sub(r"\n?```$", "", t)
    return t.strip()


def _gen_json(prompt: str, temperature: float = 0.2) -> Any:
    # Wrap the Gemini call so API failures (quota/credits, bad key, model not
    # found, safety blocks) surface as a clean JSON error with a real message
    # instead of an opaque unhandled 500 (FastAPI plain-text "Internal Server
    # Error", which the Express proxy can't parse and reports as {} 500).
    try:
        resp = _model().generate_content(
            prompt,
            generation_config={"temperature": temperature, "response_mime_type": "application/json"},
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI request failed: {e}")

    try:
        raw = _strip_fences(resp.text or "")
    except Exception as e:
        # resp.text raises when the model returned no usable text part
        # (blocked, safety filter, or MAX_TOKENS). Report rather than crash.
        raise HTTPException(status_code=502, detail=f"AI returned no usable response: {e}")

    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"AI returned invalid JSON: {e}")


# ─────────────────────────────── /answer-questionnaire ──────────────────────
class QuestionnaireRequest(BaseModel):
    org_id: str
    headers: list[str]
    rows: list[dict[str, Any]]
    question_column: str | None = None


def _detect_layout(headers: list[str], rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Ask the model which column holds the question and which existing columns
    (if any) map to our answer/comments/evidence/rationale fields."""
    sample = rows[:3]
    prompt = (
        "You are analysing the layout of a security due-diligence questionnaire "
        "spreadsheet so it can be auto-filled.\n"
        f"COLUMN HEADERS (in order): {json.dumps(headers)}\n"
        f"SAMPLE ROWS: {json.dumps(sample, default=str)[:2000]}\n\n"
        "Return JSON with this exact shape:\n"
        '{"question_column": "<the header whose cells contain the question/'
        'requirement text>", "column_map": {"answer": <header or null>, '
        '"comments": <header or null>, "evidence": <header or null>, '
        '"rationale": <header or null>}}\n'
        "Rules:\n"
        "- question_column MUST be one of the headers.\n"
        "- For column_map, pick an EXISTING header that is clearly meant for that "
        "field (e.g. a 'Response'/'Yes/No' column -> answer; 'Comments'/'Remarks' "
        "-> comments; 'Evidence'/'Reference' -> evidence; 'Rationale'/'Justification' "
        "-> rationale). Use null when no suitable column exists. Never reuse the "
        "question_column and never map two fields to the same header."
    )
    data = _gen_json(prompt)
    qcol = data.get("question_column")
    if qcol not in headers:
        # Fallback: the header whose sampled cells have the longest text.
        qcol = max(
            headers,
            key=lambda h: max((len(str(r.get(h) or "")) for r in sample), default=0),
        ) if headers else None
    cmap_in = data.get("column_map") or {}
    column_map: dict[str, Any] = {}
    used = {qcol}
    for f in ANSWER_FIELDS:
        v = cmap_in.get(f)
        column_map[f] = v if (v in headers and v not in used) else None
        if column_map[f]:
            used.add(column_map[f])
    return {"question_column": qcol, "column_map": column_map}


def _answer_batch(control_ctx: str, batch: list[dict[str, Any]]) -> list[dict[str, Any]]:
    prompt = (
        "You are a GRC analyst answering a third-party security due-diligence "
        "questionnaire on behalf of the organisation. Answer ONLY from the control "
        "registry evidence below — never invent controls or evidence.\n\n"
        f"{control_ctx}\n\n"
        "=== QUESTIONS ===\n"
        f"{json.dumps(batch, default=str)}\n\n"
        "For each question return an object with:\n"
        '- "row_index": echo the row_index from the input.\n'
        '- "answer": "Yes", "No", "Partial", or "N/A" — chosen from the actual '
        "control status/evidence. Use the phrasing the question expects; if it is "
        "not a yes/no question, give the most direct short answer.\n"
        '- "comments": one or two sentences phrased to directly address the '
        "question.\n"
        '- "evidence": the supporting control id(s)/name(s) and framework '
        "reference(s), or empty string if none apply.\n"
        '- "rationale": a brief reason the answer was given, tying the control '
        "data to the question.\n"
        'Return JSON: {"answers": [ ... ]}. Keep comments and rationale concise.'
    )
    data = _gen_json(prompt)
    return data.get("answers") or []


@router.post("/answer-questionnaire")
async def answer_questionnaire(req: QuestionnaireRequest):
    if not req.headers or not req.rows:
        raise HTTPException(status_code=400, detail="headers and rows are required")

    if req.question_column and req.question_column in req.headers:
        layout = {
            "question_column": req.question_column,
            "column_map": {f: None for f in ANSWER_FIELDS},
        }
    else:
        layout = _detect_layout(req.headers, req.rows)

    qcol = layout["question_column"]
    if not qcol:
        raise HTTPException(status_code=422, detail="Could not identify the question column.")

    # Build the question list (skip rows whose question cell is empty).
    questions: list[dict[str, Any]] = []
    for i, row in enumerate(req.rows):
        qtext = str(row.get(qcol) or "").strip()
        if qtext:
            questions.append({"row_index": i, "question": qtext})

    if not questions:
        raise HTTPException(status_code=422, detail="No questions found in the selected column.")

    control_ctx = ctx.control_context(req.org_id)

    answers: list[dict[str, Any]] = []
    for start in range(0, len(questions), QUESTION_BATCH):
        batch = questions[start : start + QUESTION_BATCH]
        for a in _answer_batch(control_ctx, batch):
            ri = a.get("row_index")
            if not isinstance(ri, int):
                continue
            answers.append(
                {
                    "row_index": ri,
                    "answer": str(a.get("answer") or "").strip(),
                    "comments": str(a.get("comments") or "").strip(),
                    "evidence": str(a.get("evidence") or "").strip(),
                    "rationale": str(a.get("rationale") or "").strip(),
                }
            )

    return {
        "status": "ok",
        "question_column": qcol,
        "column_map": layout["column_map"],
        "answers": answers,
        "questions_answered": len(answers),
    }


# ─────────────────────────────────────── /ask ──────────────────────────────
class AskRequest(BaseModel):
    org_id: str
    question: str
    history: list[dict[str, str]] | None = None


@router.post("/ask")
async def ask(req: AskRequest):
    if not (req.question or "").strip():
        raise HTTPException(status_code=400, detail="question is required")

    knowledge = ctx.org_knowledge(req.org_id)
    history_block = ""
    if req.history:
        turns = [
            f"{(h.get('role') or 'user').upper()}: {h.get('text') or ''}"
            for h in req.history[-6:]
        ]
        history_block = "=== RECENT CONVERSATION ===\n" + "\n".join(turns) + "\n\n"

    prompt = (
        "You are the organisation's security posture assistant. Answer the question "
        "in AT MOST 2 short sentences, using only the data below. If the data does "
        "not cover it, say so plainly. Do not speculate.\n\n"
        f"{knowledge}\n\n"
        f"{history_block}"
        f"QUESTION: {req.question}\n\n"
        "Return JSON: {\"answer\": \"<= 2 sentences\", \"sources\": [\"short labels of "
        "what you used, e.g. 'control_registry: GOV-01.1', 'assets'\"]}."
    )
    data = _gen_json(prompt, temperature=0.3)
    return {
        "status": "ok",
        "answer": str(data.get("answer") or "").strip(),
        "sources": [str(s) for s in (data.get("sources") or []) if s],
    }
