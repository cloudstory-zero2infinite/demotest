"""Info checker — gates policy drafting on org_memory sufficiency."""
import json
import re
import google.generativeai as genai

from .prompts import build_info_checker_prompt, REQUIREMENT_DESCRIPTIONS

_MODEL = None


def _model():
    global _MODEL
    if _MODEL is None:
        import os
        _MODEL = genai.GenerativeModel(os.environ.get("GEMINI_MODEL", "gemini-2.0-flash"))
    return _MODEL


def _strip_fences(text: str) -> str:
    text = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.MULTILINE)
    text = re.sub(r"\s*```$", "", text.strip(), flags=re.MULTILINE)
    return text.strip()


def check_sufficiency(policy_family: str, org_memory: str) -> dict:
    """Return {sufficient: bool, missing: [...], reasons: {...}, prompts: {...}}.

    `prompts` is a UI-friendly dict mapping each missing fact key to a
    human-readable description, used to render the red window.
    """
    prompt, required = build_info_checker_prompt(policy_family, org_memory)

    # If org_memory is completely empty, short-circuit — every required fact missing.
    if not (org_memory or "").strip():
        return {
            "sufficient": False,
            "missing": required,
            "reasons": {k: "org memory is empty" for k in required},
            "prompts": {k: REQUIREMENT_DESCRIPTIONS.get(k, k) for k in required},
        }

    try:
        resp = _model().generate_content(prompt)
        data = json.loads(_strip_fences(resp.text))
    except Exception as e:
        import traceback
        traceback.print_exc()
        # Fail-open is dangerous here  fail-closed so we never draft on bad context.
        return {
            "sufficient": False,
            "missing": required,
            "reasons": {k: "info checker failed to evaluate" for k in required},
            "prompts": {k: REQUIREMENT_DESCRIPTIONS.get(k, k) for k in required},
        }

    missing = data.get("missing", []) or []
    return {
        "sufficient": bool(data.get("sufficient", False)) and not missing,
        "missing": missing,
        "reasons": data.get("reasons", {}) or {},
        "prompts": {k: REQUIREMENT_DESCRIPTIONS.get(k, k) for k in missing},
    }
