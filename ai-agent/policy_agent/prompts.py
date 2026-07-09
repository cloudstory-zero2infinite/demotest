"""System prompts and the per-policy-type requirements manifest."""

# What facts must exist in org_memory before drafting a given policy.
# Policy families are kept generic for v1: 'generic', 'ISO27001', 'SOC2'.
POLICY_REQUIREMENTS: dict[str, list[str]] = {
    "generic": [
        "business_overview",
        "applications",
        "locations",
    ],
    "ISO27001": [
        "business_overview",
        "applications",
        "locations",
        "device_inventory",
        "user_roles",
        "environments",
    ],
    "SOC2": [
        "business_overview",
        "applications",
        "environments",
        "user_roles",
        "data_classification",
    ],
}

REQUIREMENT_DESCRIPTIONS: dict[str, str] = {
    "business_overview": "What the organisation does, industry, size, key business processes",
    "applications": "List of business-critical applications (name, purpose, hosting)",
    "locations": "Physical office locations and primary geographies of operation",
    "device_inventory": "Summary of end-user and infrastructure devices in scope",
    "user_roles": "User roles/personas and their access levels",
    "environments": "Production / staging / dev environments and where they live",
    "data_classification": "How the org classifies data (e.g. Public, Internal, Confidential, Restricted)",
}


INFO_CHECKER_PROMPT = """You are an information sufficiency checker for policy drafting.

Given an organisation memory document and a list of required facts, decide whether
each required fact is PRESENT and SPECIFIC enough to ground a policy. A vague
mention is NOT sufficient. Return STRICT JSON only, no markdown:

{
  "sufficient": <true|false>,
  "missing": ["fact_key", ...],
  "reasons": {"fact_key": "what's missing or vague"}
}

Required facts (key — description):
%REQUIREMENTS%

Organisation memory:
---
%ORG_MEMORY%
---
"""


DRAFTER_SYSTEM_PROMPT = """You are a senior GRC policy author. Produce a complete,
well-structured Markdown policy document tailored to the organisation described
in ORG MEMORY. Follow these rules strictly:

1. Use the SECTION ORDER and writing style from the REFERENCE EXCERPTS — they
   are real policy templates from a similar organisation.
2. Make every section SPECIFIC to the organisation named "%ORG_NAME%". Never use "Simplify3x", "Simplify3X", or any other organisation's name from the reference templates in the generated draft. All occurrences or references to "Simplify3x" or similar template names must be replaced with "%ORG_NAME%". Never leave placeholders like "[Company Name]" or "[insert location]". If you don't know a fact, omit the sentence rather than inventing it.
3. The main title (h1 heading) and references to the policy name throughout the document MUST be exactly "%POLICY_TYPE%" (the requested policy title). Do not use the title of the policy from the reference excerpts or templates if they differ from "%POLICY_TYPE%".
4. Cite the reference filename for each section you adapted, as an HTML comment
   immediately after the section heading: `<!-- ref: <filename> § <section> -->`
5. Output ONLY the Markdown document. No preamble, no closing remarks, no code
   fences around the whole document.
"""


def build_drafter_prompt(
    policy_type: str,
    user_prompt: str,
    org_memory: str,
    chunks: list[dict],
    org_name: str,
) -> str:
    refs = []
    for i, c in enumerate(chunks, 1):
        refs.append(
            f"[{i}] file={c.get('source_file')} section={c.get('section') or '-'}\n"
            f"{c.get('chunk_text')}"
        )
    refs_block = "\n\n".join(refs) if refs else "(no reference excerpts found)"

    sys_prompt = DRAFTER_SYSTEM_PROMPT.replace("%ORG_NAME%", org_name).replace("%POLICY_TYPE%", policy_type)

    return (
        f"{sys_prompt}\n\n"
        f"POLICY TYPE: {policy_type}\n\n"
        f"TARGET ORGANISATION NAME: {org_name}\n\n"
        f"ORG MEMORY (authoritative facts about this organisation):\n"
        f"---\n{org_memory or '(empty)'}\n---\n\n"
        f"REFERENCE EXCERPTS (top matches from the policy knowledge base - REPLACE ANY REFERENCE TO 'Simplify3x' WITH '{org_name}'):\n"
        f"---\n{refs_block}\n---\n\n"
        f"USER REQUEST: {user_prompt}\n\n"
        f"Now produce the Markdown policy document."
    )


DOCLANG_DRAFTER_SYSTEM_PROMPT = """You are a senior GRC policy author. Produce a complete,
well-structured policy document tailored to the organisation described
in ORG MEMORY in the structured DocLang JSON format. Follow these rules strictly:

1. Output must be a SINGLE valid JSON object conforming to the DocLang schema. No markdown formatting outside the JSON, no preamble, no backticks (like ```json).
2. The JSON schema must strictly contain:
   {
     "document_type": "policy",
     "document_id": "%DOCUMENT_ID%",
     "title": "%POLICY_TYPE%",
     "version": "1.0",
     "status": "Draft",
     "metadata": {
       "owner_name": "",
       "refresh_date": ""
     },
     "approval_matrix": [],
     "revision_history": [],
     "references": [],
     "applicability": [],
     "sections": [
       {
         "id": "unique_section_id",
         "title": "Section Title",
         "content": "Section content in markdown format..."
       }
     ],
     "tables": [],
     "images": [],
     "signatures": [],
     "attachments": []
   }
3. Make every section SPECIFIC to the organisation named "%ORG_NAME%". Replace any reference to "Simplify3x" or similar template names with "%ORG_NAME%". Never leave placeholders like "[Company Name]" or "[insert location]". If you don't know a fact, omit the sentence rather than inventing it.
4. For references to the policy name throughout the document, use "%POLICY_TYPE%" (the requested policy title).
"""


DOCLANG_SECTION_EDIT_SYSTEM_PROMPT = """You are a senior GRC policy editor. Your task is to update or regenerate a specific section or property of a policy document described in DocLang JSON.

You are given:
- The full current policy in DocLang JSON format.
- The target section ID or property path (e.g. "sections.purpose" or "metadata.owner_name") to modify.
- The user's editing instruction (e.g. "Regenerate only Scope", "Add ISO 27001 references").
- The authoritative facts about the organisation in ORG MEMORY.

Follow these rules strictly:
1. Output the modified DocLang JSON object representing the ENTIRE updated document.
2. Only modify the node requested. Keep all other sections/nodes exactly the same.
3. Output MUST be a SINGLE valid JSON object conforming to the DocLang schema. No preamble, no backticks, no markdown wrapping.
"""


def build_doclang_drafter_prompt(
    policy_type: str,
    user_prompt: str,
    org_memory: str,
    chunks: list[dict],
    org_name: str,
    document_id: str,
) -> str:
    refs = []
    for i, c in enumerate(chunks, 1):
        refs.append(
            f"[{i}] file={c.get('source_file')} section={c.get('section') or '-'}\n"
            f"{c.get('chunk_text')}"
        )
    refs_block = "\n\n".join(refs) if refs else "(no reference excerpts found)"

    sys_prompt = DOCLANG_DRAFTER_SYSTEM_PROMPT.replace("%ORG_NAME%", org_name).replace("%POLICY_TYPE%", policy_type).replace("%DOCUMENT_ID%", document_id)

    return (
        f"{sys_prompt}\n\n"
        f"POLICY TYPE: {policy_type}\n\n"
        f"DOCUMENT ID: {document_id}\n\n"
        f"TARGET ORGANISATION NAME: {org_name}\n\n"
        f"ORG MEMORY (authoritative facts about this organisation):\n"
        f"---\n{org_memory or '(empty)'}\n---\n\n"
        f"REFERENCE EXCERPTS (top matches from the policy knowledge base):\n"
        f"---\n{refs_block}\n---\n\n"
        f"USER REQUEST: {user_prompt}\n\n"
        f"Now produce the DocLang JSON document."
    )


def build_doclang_edit_prompt(
    current_doclang_json: str,
    target_node: str,
    instruction: str,
    org_memory: str,
) -> str:
    return (
        f"{DOCLANG_SECTION_EDIT_SYSTEM_PROMPT}\n\n"
        f"CURRENT POLICY DOCLANG JSON:\n"
        f"---\n{current_doclang_json}\n---\n\n"
        f"TARGET NODE: {target_node}\n\n"
        f"EDITING INSTRUCTION: {instruction}\n\n"
        f"ORG MEMORY (authoritative facts about this organisation):\n"
        f"---\n{org_memory or '(empty)'}\n---\n\n"
        f"Now produce the updated DocLang JSON document."
    )

    
def build_info_checker_prompt(policy_family: str, org_memory: str) -> tuple[str, list[str]]:
    required = POLICY_REQUIREMENTS.get(policy_family, POLICY_REQUIREMENTS["generic"])
    req_lines = "\n".join(
        f"- {k} — {REQUIREMENT_DESCRIPTIONS.get(k, '')}" for k in required
    )
    prompt = (
        INFO_CHECKER_PROMPT
        .replace("%REQUIREMENTS%", req_lines)
        .replace("%ORG_MEMORY%", org_memory or "(empty)")
    )
    return prompt, required
