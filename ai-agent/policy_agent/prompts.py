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
