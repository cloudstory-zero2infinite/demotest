"""One-shot ingestion: PDF/DOCX reference policies -> chunks -> embeddings -> pgvector.

Two source modes:

  1. LOCAL DIRECTORY (default for testing):
       python -m policy_agent.ingest --dir ./corpus

  2. SUPABASE STORAGE BUCKET (production):
       python -m policy_agent.ingest --bucket policy-corpus

Each file is parsed by section heading (best-effort), chunked, embedded with
Gemini text-embedding-004, and upserted into public.policy_kb_chunks.

Filename convention used to derive policy_family / doc_type:
    *ISO27001*  -> family ISO27001
    *SOC2*      -> family SOC2
    *POL*       -> doc_type sample_policy
    *TEMPLATE*  -> doc_type template
    *PRO*       -> doc_type standard_clause (procedures)
    default     -> doc_type sample_policy, family generic
"""
import argparse
import os
import re
import sys
from pathlib import Path

# Load .env BEFORE importing modules that read env vars.
from dotenv import load_dotenv
load_dotenv()

from .db import db_cursor
from .embeddings import embed_batch

# Section heading regex — matches markdown-style or numbered headings.
HEADING_RE = re.compile(
    r"^(?:\d+(?:\.\d+)*\s+|#+\s+)([A-Z][A-Za-z0-9 \-/&,]{2,80})\s*$",
    re.MULTILINE,
)

MAX_CHARS = 3000        # ~750 tokens per chunk
OVERLAP_CHARS = 300


def _classify(filename: str) -> tuple[str, str]:
    name = filename.upper()
    if "ISO27001" in name or "ISO 27001" in name or "ISMS" in name:
        family = "ISO27001"
    elif "SOC2" in name or "SOC 2" in name:
        family = "SOC2"
    else:
        family = "generic"

    if "TEMPLATE" in name:
        doc_type = "template"
    elif "PRO-" in name or "PROCEDURE" in name:
        doc_type = "standard_clause"
    else:
        doc_type = "sample_policy"

    return doc_type, family


SUPPORTED_SUFFIXES = {".pdf", ".docx", ".md", ".txt"}


def _extract_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        from pypdf import PdfReader
        reader = PdfReader(str(path))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    if suffix in (".docx",):
        import docx
        d = docx.Document(str(path))
        return "\n".join(p.text for p in d.paragraphs)
    if suffix in (".md", ".txt"):
        return path.read_text(encoding="utf-8", errors="ignore")
    raise ValueError(f"Unsupported file type: {path}")


def _split_into_sections(text: str) -> list[tuple[str, str]]:
    """Return list of (section_title, section_body). Falls back to one big block."""
    matches = list(HEADING_RE.finditer(text))
    if not matches:
        return [("", text)]
    sections: list[tuple[str, str]] = []
    for i, m in enumerate(matches):
        title = m.group(1).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[start:end].strip()
        if body:
            sections.append((title, body))
    return sections


def _chunk(body: str) -> list[str]:
    """Sliding-window chunk a section body."""
    body = body.strip()
    if len(body) <= MAX_CHARS:
        return [body]
    chunks: list[str] = []
    start = 0
    while start < len(body):
        end = min(start + MAX_CHARS, len(body))
        chunks.append(body[start:end])
        if end == len(body):
            break
        start = end - OVERLAP_CHARS
    return chunks


def _ingest_file(path: Path, source_label: str | None = None) -> int:
    label = source_label or path.name
    if path.suffix.lower() not in SUPPORTED_SUFFIXES:
        print(f"  - skip (unsupported type): {label}")
        return 0
    doc_type, family = _classify(label)
    text = _extract_text(path)
    if not text.strip():
        print(f"  ! empty: {label}")
        return 0

    rows: list[tuple] = []
    chunk_texts: list[str] = []
    meta: list[tuple[str, str]] = []  # (section, chunk_text) before embedding

    for section_title, body in _split_into_sections(text):
        for c in _chunk(body):
            chunk_texts.append(c)
            meta.append((section_title, c))

    # Embed in batches of 64 (Gemini limit-friendly).
    BATCH = 64
    embeddings: list[list[float]] = []
    for i in range(0, len(chunk_texts), BATCH):
        embeddings.extend(embed_batch(chunk_texts[i : i + BATCH]))

    for (section, chunk_text), vec in zip(meta, embeddings):
        rows.append((label, doc_type, family, section, chunk_text,
                     "[" + ",".join(f"{v:.6f}" for v in vec) + "]",
                     len(chunk_text) // 4))

    with db_cursor() as cur:
        # Replace any existing rows for this file (idempotent re-ingest).
        cur.execute("DELETE FROM public.policy_kb_chunks WHERE source_file = %s", (label,))
        for r in rows:
            cur.execute(
                """
                INSERT INTO public.policy_kb_chunks
                    (source_file, doc_type, policy_family, section, chunk_text, embedding, token_count)
                VALUES (%s, %s, %s, %s, %s, %s::vector, %s)
                """,
                r,
            )
    print(f"  + {label}: {len(rows)} chunks  [{doc_type}/{family}]")
    return len(rows)


def ingest_dir(directory: str) -> None:
    base = Path(directory)
    if not base.exists():
        sys.exit(f"directory not found: {directory}")
    files = [p for p in base.iterdir() if p.suffix.lower() in (".pdf", ".docx", ".md", ".txt")]
    print(f"Ingesting {len(files)} files from {directory}")
    total = 0
    for p in sorted(files):
        total += _ingest_file(p)
    print(f"Done. {total} chunks inserted.")


def ingest_bucket(bucket: str) -> None:
    """Download every object in a Supabase Storage bucket via REST and ingest it."""
    import tempfile
    import urllib.request
    import urllib.parse

    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        sys.exit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for bucket mode")

    list_url = f"{supabase_url}/storage/v1/object/list/{bucket}"
    req = urllib.request.Request(
        list_url,
        method="POST",
        data=b'{"prefix":"","limit":1000}',
        headers={
            "Authorization": f"Bearer {service_key}",
            "apikey": service_key,
            "Content-Type": "application/json",
        },
    )
    import json as _json
    with urllib.request.urlopen(req) as resp:
        objects = _json.loads(resp.read().decode("utf-8"))

    print(f"Found {len(objects)} objects in bucket '{bucket}'")
    total = 0
    with tempfile.TemporaryDirectory() as tmp:
        for obj in objects:
            name = obj.get("name")
            if not name:
                continue
            # URL-encode each path segment so spaces, parens, '&' etc. are safe.
            encoded_name = "/".join(urllib.parse.quote(seg, safe="") for seg in name.split("/"))
            dl_url = f"{supabase_url}/storage/v1/object/{bucket}/{encoded_name}"
            dl_req = urllib.request.Request(
                dl_url,
                headers={"Authorization": f"Bearer {service_key}", "apikey": service_key},
            )
            local = Path(tmp) / Path(name).name
            if local.suffix.lower() not in SUPPORTED_SUFFIXES:
                print(f"  - skip (unsupported type): {name}")
                continue
            with urllib.request.urlopen(dl_req) as r, open(local, "wb") as f:
                f.write(r.read())
            total += _ingest_file(local, source_label=name)
    print(f"Done. {total} chunks inserted.")


def main():
    parser = argparse.ArgumentParser()
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument("--dir", help="Local directory of PDF/DOCX files")
    src.add_argument("--bucket", help="Supabase Storage bucket name")
    args = parser.parse_args()

    if args.dir:
        ingest_dir(args.dir)
    else:
        ingest_bucket(args.bucket)


if __name__ == "__main__":
    main()
