"""Vector retriever — pgvector similarity search over policy_kb_chunks."""
from .db import db_cursor
from .embeddings import embed_text


def retrieve(query: str, policy_family: str | None = None, k: int = 8) -> list[dict]:
    """Return top-k chunks most similar to `query`.

    If policy_family is provided (e.g. 'ISO27001'), the search is restricted to
    chunks tagged with that family. Falls back to global search when None.
    """
    query_vec = embed_text(query, task_type="retrieval_query")
    # pgvector accepts a Python list cast to vector via the ::vector cast.
    vec_literal = "[" + ",".join(f"{v:.6f}" for v in query_vec) + "]"

    with db_cursor() as cur:
        cur.execute(
            """
            SELECT id, source_file, doc_type, policy_family, section, chunk_text,
                   1 - (embedding <=> %s::vector) AS similarity
            FROM public.policy_kb_chunks
            WHERE %s::text IS NULL OR policy_family = %s
            ORDER BY embedding <=> %s::vector
            LIMIT %s
            """,
            (vec_literal, policy_family, policy_family, vec_literal, k),
        )
        return [dict(r) for r in cur.fetchall()]
