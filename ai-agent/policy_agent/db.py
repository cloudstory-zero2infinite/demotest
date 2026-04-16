"""Shared psycopg2 connection helper for the policy_agent package.

Mirrors the connection logic in ai-agent/main.py so the package is self-contained
and can be imported without creating circular references when its router is
mounted on the main FastAPI app.
"""
import os
import psycopg2
import psycopg2.extras
from contextlib import contextmanager
from fastapi import HTTPException


@contextmanager
def db_cursor(dict_rows: bool = True):
    # Read DATABASE_URL at call time (not import time) so .env loaded later still works.
    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url:
        raise HTTPException(status_code=500, detail="DATABASE_URL not configured")
    try:
        conn = psycopg2.connect(database_url, connect_timeout=10)
    except psycopg2.OperationalError as e:
        raise HTTPException(status_code=500, detail=f"Database connection failed: {e}")
    try:
        factory = psycopg2.extras.RealDictCursor if dict_rows else None
        with conn.cursor(cursor_factory=factory) as cur:
            yield cur
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
