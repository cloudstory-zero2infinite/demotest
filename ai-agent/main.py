import os
import json
import re
from dotenv import load_dotenv
load_dotenv()  # loads .env from current directory

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
import psycopg2
import psycopg2.extras

app = FastAPI(title="ZTI AI Agent Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
DATABASE_URL = os.environ.get("DATABASE_URL", "")

genai.configure(api_key=GEMINI_API_KEY)
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
gemini = genai.GenerativeModel(GEMINI_MODEL)

MODULE_TABLE_MAP = {
    "assets": "assets",
    "asset_relationships": "asset_relationships",
}

# Columns managed by the system — exclude from AI generation
EXCLUDED_COLUMNS = {"id", "created_at", "org_id", "user_id", "owner_id"}

MODULE_SYSTEM_PROMPTS = {
    "assets": (
        "You are a GRC data assistant. Convert natural language descriptions into structured asset data "
        "for a Governance, Risk & Compliance platform.\n\n"
        "Rules:\n"
        "- Generate realistic values based on the description\n"
        "- Always set source to \"AI\" for every generated record\n"
        "- Generate unique asset_id values like AST-001, AST-002 (start from 001 unless context says otherwise)\n"
        "- criticality: High / Medium / Low (infer from context, default Low)\n"
        "- category: Technology / Information / Service (infer from context)\n"
        "- exposure: Internal / External / DMZ (infer from context, default Internal)\n"
        "- governed_status: Governed / Non-Governed (default Non-Governed)\n"
        "- vulnerability_count: default 0\n"
        "- name: derive from the description (e.g. 'Laptop-001', 'Laptop-002')\n"
        "- Return ONLY a valid JSON array, no markdown, no explanation"
    ),
    "asset_relationships": (
        "You are a GRC data assistant. Convert natural language descriptions into asset relationship records.\n\n"
        "Rules:\n"
        "- relationship_type must be exactly one of: Depends On, Hosts, Communicates With, Contains, "
        "Owned By, Managed By, Connected To, Backs Up, Replicates To\n"
        "- source_asset_id and target_asset_id must be asset IDs (e.g. AST-001) inferred from the input\n"
        "- If multiple assets connect to one target, create one record per connection\n"
        "- Return ONLY a valid JSON array, no markdown, no explanation"
    ),
}


def get_db_connection():
    return psycopg2.connect(DATABASE_URL)


def get_schema(table_name: str) -> list[dict]:
    """Fetch column definitions from information_schema dynamically."""
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = %s
                ORDER BY ordinal_position
                """,
                (table_name,),
            )
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_check_constraints(table_name: str) -> dict[str, str]:
    """Fetch CHECK constraint clauses per column to surface allowed values."""
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT DISTINCT kcu.column_name, cc.check_clause
                FROM information_schema.check_constraints cc
                JOIN information_schema.constraint_column_usage ccu
                    ON cc.constraint_name = ccu.constraint_name
                    AND cc.constraint_schema = ccu.constraint_schema
                LEFT JOIN information_schema.key_column_usage kcu
                    ON cc.constraint_name = kcu.constraint_name
                WHERE ccu.table_name = %s
                  AND ccu.table_schema = 'public'
                  AND kcu.column_name IS NOT NULL
                """,
                (table_name,),
            )
            return {r["column_name"]: r["check_clause"] for r in cur.fetchall()}
    finally:
        conn.close()


def build_schema_description(table_name: str) -> str:
    columns = get_schema(table_name)
    constraints = get_check_constraints(table_name)
    lines = []
    for col in columns:
        if col["column_name"] in EXCLUDED_COLUMNS:
            continue
        line = f"  {col['column_name']} ({col['data_type']}"
        if col["is_nullable"] == "NO":
            line += ", REQUIRED"
        if col["column_name"] in constraints:
            line += f", CHECK: {constraints[col['column_name']]}"
        line += ")"
        lines.append(line)
    return "\n".join(lines)


def parse_ai_json(text: str) -> list[dict]:
    """Strip markdown fences and parse JSON array from LLM response."""
    text = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.MULTILINE)
    text = re.sub(r"\s*```$", "", text.strip(), flags=re.MULTILINE)
    data = json.loads(text.strip())
    return data if isinstance(data, list) else [data]


class ProcessRequest(BaseModel):
    module: str
    message: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/process")
async def process(req: ProcessRequest):
    table_name = MODULE_TABLE_MAP.get(req.module)
    if not table_name:
        raise HTTPException(status_code=400, detail=f"Unknown module: {req.module}")

    try:
        schema_desc = build_schema_description(table_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Schema fetch failed: {str(e)}")

    system_prompt = MODULE_SYSTEM_PROMPTS.get(
        req.module, "Convert user input to structured JSON matching the schema."
    )

    prompt = (
        f"{system_prompt}\n\n"
        f"TABLE SCHEMA ({table_name}):\n{schema_desc}\n\n"
        f"USER INPUT: {req.message}\n\n"
        "Return ONLY a valid JSON array:"
    )

    try:
        response = gemini.generate_content(prompt)
        records = parse_ai_json(response.text)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"AI response could not be parsed as JSON: {e}",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation error: {str(e)}")

    return {"records": records, "module": req.module, "table": table_name}
