"""Mapper Agent — builds the Governance knowledge graph in Neo4j.

Phase 1: triggered from the Policy tab. Reads the org's master Information
Security policy plus its sibling policies, extracts security domains and
HAS_CHILD links via Gemini, and writes the result to Neo4j Aura.

The agent is bound by the ontology YAMLs in `ai-agent/ontology/`:
    entities.yml      — what node labels + properties are allowed
    relationships.yml — what edge types + properties are allowed
    policy.yml        — the per-trigger recipe (Supabase inputs, LLM
                        instructions, write strategy)

Future triggers (capabilities, controls, ...) will add their own recipe
file alongside `policy.yml`.
"""
