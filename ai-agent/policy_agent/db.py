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
    
    import socket
    import time
    import urllib.parse
    
    # Parse the DATABASE_URL to extract hostname
    try:
        parsed = urllib.parse.urlparse(database_url)
        hostname = parsed.hostname
        original_url = database_url
    except Exception:
        raise HTTPException(status_code=500, detail="Invalid DATABASE_URL format")
    
    # Try different connection strategies
    connection_attempts = [
        # 1. Original URL
        original_url,
        # 2. Try with IPv4 only (disable IPv6)
        None,  # Will be constructed if needed
        # 3. Try with different timeout settings
        None,  # Will be constructed if needed
    ]
    
    conn = None
    for attempt, url in enumerate(connection_attempts):
        if url is None and attempt == 1:
            # Try with IPv4 only by setting socket preference
            original_socket = socket.socket
            socket.socket = lambda *args, **kwargs: original_socket(socket.AF_INET, *args[1:], **kwargs)
            url = original_url
        elif url is None and attempt == 2:
            # Try with longer timeout
            url = original_url
            continue  # Will be handled with different timeout below
        elif url is None:
            continue
            
        try:
            if attempt == 2:
                # Try with longer timeout
                conn = psycopg2.connect(url, connect_timeout=30)
            else:
                conn = psycopg2.connect(url, connect_timeout=10)
            
            # Reset socket if we modified it
            if attempt == 1 and 'original_socket' in locals():
                socket.socket = original_socket
                
            break  # Connection successful
            
        except psycopg2.OperationalError as e:
            # Reset socket if we modified it
            if attempt == 1 and 'original_socket' in locals():
                socket.socket = original_socket
                
            print(f"Connection attempt {attempt + 1} failed: {str(e)}")
            if attempt == len(connection_attempts) - 1:
                # Last attempt failed, raise detailed error
                error_msg = f"Database connection failed after {len(connection_attempts)} attempts.\n"
                error_msg += f"Original error: {str(e)}\n"
                error_msg += f"Hostname: {hostname}\n"
                error_msg += "Possible solutions:\n"
                error_msg += "1. Check network connectivity and DNS resolution\n"
                error_msg += "2. Verify Supabase project is active\n"
                error_msg += "3. Check if firewall is blocking the connection\n"
                error_msg += "4. Try using direct IP address instead of hostname"
                
                raise HTTPException(status_code=500, detail=error_msg)
            
            # Wait before retry
            time.sleep(1)
            
        except Exception as e:
            # Reset socket if we modified it
            if attempt == 1 and 'original_socket' in locals():
                socket.socket = original_socket
            raise HTTPException(
                status_code=500,
                detail=f"Unexpected database error: {str(e)}"
            )
    
    if conn is None:
        raise HTTPException(status_code=500, detail="All connection attempts failed")
    
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
