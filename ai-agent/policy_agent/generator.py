"""Streaming policy generator — Gemini call producing Markdown chunks."""
import os
import google.generativeai as genai

_MODEL = None


def _model():
    global _MODEL
    if _MODEL is None:
        _MODEL = genai.GenerativeModel(os.environ.get("GEMINI_MODEL", "gemini-2.0-flash"))
    return _MODEL


def stream_markdown(prompt: str):
    """Yield text chunks as they arrive from Gemini."""
    response = _model().generate_content(prompt, stream=True)
    for chunk in response:
        text = getattr(chunk, "text", None)
        if text:
            yield text
