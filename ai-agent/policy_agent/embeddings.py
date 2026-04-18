"""Gemini embedding wrapper — direct REST call to the Generative Language API.

Bypasses the deprecated `google.generativeai` SDK (which pins itself to v1beta
and has lost access to current embedding models on some accounts). Uses the
public REST endpoint:

    POST https://generativelanguage.googleapis.com/v1beta/{model}:embedContent
    POST https://generativelanguage.googleapis.com/v1beta/{model}:batchEmbedContents

Default model: text-embedding-004 (768 dims). Override via GEMINI_EMBED_MODEL.
"""
import json
import os
import urllib.error
import urllib.request

EMBED_MODEL = os.environ.get("GEMINI_EMBED_MODEL", "models/gemini-embedding-001")
EMBED_DIM = int(os.environ.get("GEMINI_EMBED_DIM", "768"))
# Try both API versions; some keys only have one enabled.
API_VERSIONS = ("v1beta", "v1")
API_HOST = "https://generativelanguage.googleapis.com"


def _api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        raise RuntimeError("GEMINI_API_KEY not set")
    return key


def _http(method: str, url: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if data is not None else {}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="ignore")
        raise _ApiError(e.code, body_text) from e


class _ApiError(RuntimeError):
    def __init__(self, code: int, body: str):
        super().__init__(f"Embedding API error {code}: {body}")
        self.code = code
        self.body = body


def list_supported_models() -> list[str]:
    """Return models on this API key that support embedContent."""
    out: list[str] = []
    for version in API_VERSIONS:
        try:
            res = _http("GET", f"{API_HOST}/{version}/models?key={_api_key()}")
        except _ApiError:
            continue
        for m in res.get("models", []):
            if "embedContent" in (m.get("supportedGenerationMethods") or []):
                out.append(f"{version}::{m.get('name')}")
    return out


def _resolve_endpoint(method: str) -> tuple[str, str]:
    """Try each API version + the configured model. Return (version, url_template).
    Raises with a helpful message listing what IS available if nothing works."""
    last_err: _ApiError | None = None
    for version in API_VERSIONS:
        # Probe with a tiny embedContent call (always single, even when resolving batch).
        url = f"{API_HOST}/{version}/{EMBED_MODEL}:embedContent?key={_api_key()}"
        probe_body = {
            "model": EMBED_MODEL,
            "content": {"parts": [{"text": "ping"}]},
            "outputDimensionality": EMBED_DIM,
        }
        try:
            _http("POST", url, probe_body)
            return version, f"{API_HOST}/{version}/{EMBED_MODEL}:{method}?key={_api_key()}"
        except _ApiError as e:
            last_err = e
            continue
    available = list_supported_models()
    hint = ("\nAvailable embedding-capable models on this key:\n  - "
            + "\n  - ".join(available)) if available else \
           "\n(ListModels also returned nothing — the API key may be region-restricted or lack the Generative Language API.)"
    raise RuntimeError(
        f"Could not find {EMBED_MODEL} on any API version.\n"
        f"Last error: {last_err}\n"
        f"Set GEMINI_EMBED_MODEL=<one of the names below> in ai-agent/.env."
        f"{hint}"
    )


_RESOLVED_BATCH_URL: str | None = None
_RESOLVED_SINGLE_URL: str | None = None


def _post(url: str, body: dict) -> dict:
    return _http("POST", url, body)


def _l2_normalize(vec: list[float]) -> list[float]:
    """L2-normalize. Recommended when using Matryoshka downsizing
    (e.g. gemini-embedding-001 native 3072 -> outputDimensionality 768)."""
    s = sum(v * v for v in vec)
    if s <= 0:
        return vec
    inv = 1.0 / (s ** 0.5)
    return [v * inv for v in vec]


def embed_text(text: str, task_type: str = "RETRIEVAL_QUERY") -> list[float]:
    """Embed a single string. task_type is one of:
    RETRIEVAL_QUERY, RETRIEVAL_DOCUMENT, SEMANTIC_SIMILARITY, CLASSIFICATION,
    CLUSTERING, QUESTION_ANSWERING, FACT_VERIFICATION.
    """
    global _RESOLVED_SINGLE_URL
    if not text or not text.strip():
        return [0.0] * EMBED_DIM
    if _RESOLVED_SINGLE_URL is None:
        _, _RESOLVED_SINGLE_URL = _resolve_endpoint("embedContent")
    body = {
        "model": EMBED_MODEL,
        "content": {"parts": [{"text": text}]},
        "taskType": task_type.upper(),
        "outputDimensionality": EMBED_DIM,
    }
    result = _post(_RESOLVED_SINGLE_URL, body)
    return _l2_normalize(result["embedding"]["values"])


def embed_batch(texts: list[str], task_type: str = "RETRIEVAL_DOCUMENT") -> list[list[float]]:
    """Embed many strings via batchEmbedContents."""
    global _RESOLVED_BATCH_URL
    if not texts:
        return []
    if _RESOLVED_BATCH_URL is None:
        _, _RESOLVED_BATCH_URL = _resolve_endpoint("batchEmbedContents")
    body = {
        "requests": [
            {
                "model": EMBED_MODEL,
                "content": {"parts": [{"text": t}]},
                "taskType": task_type.upper(),
                "outputDimensionality": EMBED_DIM,
            }
            for t in texts
        ]
    }
    result = _post(_RESOLVED_BATCH_URL, body)
    return [_l2_normalize(e["values"]) for e in result["embeddings"]]
