"""Loads and validates the Mapper Agent ontology YAMLs at import time.

Exposes a single `ONTOLOGY` object the rest of the package reads. Any
deviation from the ontology (unknown entity label, unknown relationship
type, property not in the allow-list) raises before a Cypher write hits
Neo4j — this is the contract enforcement point.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any

import yaml

ONTOLOGY_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "ontology")


@dataclass
class EntityDef:
    name: str
    neo4j_label: str
    source_type: str                # supabase | llm_inferred | derived
    source_table: str | None
    source_columns: list[str]
    properties: list[str]
    required_properties: list[str]
    id_keys: list[str]


@dataclass
class RelationshipDef:
    name: str
    neo4j_type: str
    from_entity: str
    to_entity: str
    derivation: str
    properties: list[str]
    required_properties: list[str]


@dataclass
class RecipeDef:
    trigger: str
    inputs: dict[str, Any]
    output_entities: list[str]
    output_relationships: list[str]
    extraction: dict[str, Any]
    write_strategy: dict[str, Any]


@dataclass
class Ontology:
    entities: dict[str, EntityDef] = field(default_factory=dict)
    relationships: dict[str, RelationshipDef] = field(default_factory=dict)
    recipes: dict[str, RecipeDef] = field(default_factory=dict)

    def entity(self, name: str) -> EntityDef:
        if name not in self.entities:
            raise ValueError(f"Unknown entity '{name}' — not in entities.yml")
        return self.entities[name]

    def relationship(self, name: str) -> RelationshipDef:
        if name not in self.relationships:
            raise ValueError(f"Unknown relationship '{name}' — not in relationships.yml")
        return self.relationships[name]

    def recipe(self, trigger: str) -> RecipeDef:
        if trigger not in self.recipes:
            raise ValueError(f"No mapper recipe for trigger '{trigger}'")
        return self.recipes[trigger]


def _load_yaml(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def _parse_entities(raw: dict) -> dict[str, EntityDef]:
    out: dict[str, EntityDef] = {}
    for name, body in (raw.get("entities") or {}).items():
        src = body.get("source") or {}
        props_raw = body.get("properties") or []
        prop_names = [p["name"] for p in props_raw]
        required = [p["name"] for p in props_raw if p.get("required")]
        id_keys = ((body.get("id_strategy") or {}).get("keys") or [])
        out[name] = EntityDef(
            name=name,
            neo4j_label=body.get("neo4j_label", name),
            source_type=src.get("type", "llm_inferred"),
            source_table=src.get("table"),
            source_columns=list(body.get("source_columns") or []),
            properties=prop_names,
            required_properties=required,
            id_keys=list(id_keys),
        )
    return out


def _parse_relationships(raw: dict) -> dict[str, RelationshipDef]:
    out: dict[str, RelationshipDef] = {}
    for name, body in (raw.get("relationships") or {}).items():
        props_raw = body.get("properties") or []
        out[name] = RelationshipDef(
            name=name,
            neo4j_type=body.get("neo4j_type", name),
            from_entity=body["from_entity"],
            to_entity=body["to_entity"],
            derivation=body.get("derivation", "llm_inferred"),
            properties=[p["name"] for p in props_raw],
            required_properties=[p["name"] for p in props_raw if p.get("required")],
        )
    return out


def _parse_recipe(raw: dict) -> RecipeDef:
    return RecipeDef(
        trigger=raw["trigger"],
        inputs=raw.get("inputs") or {},
        output_entities=list((raw.get("outputs") or {}).get("entities") or []),
        output_relationships=list((raw.get("outputs") or {}).get("relationships") or []),
        extraction=raw.get("extraction") or {},
        write_strategy=raw.get("write_strategy") or {},
    )


def load_ontology() -> Ontology:
    """Reads all YAML files under ai-agent/ontology/ into a typed Ontology."""
    ont = Ontology(
        entities=_parse_entities(_load_yaml(os.path.join(ONTOLOGY_DIR, "entities.yml"))),
        relationships=_parse_relationships(_load_yaml(os.path.join(ONTOLOGY_DIR, "relationships.yml"))),
    )
    # Every other YAML in the directory is treated as a trigger recipe.
    for fname in os.listdir(ONTOLOGY_DIR):
        if fname in ("entities.yml", "relationships.yml") or not fname.endswith(".yml"):
            continue
        recipe = _parse_recipe(_load_yaml(os.path.join(ONTOLOGY_DIR, fname)))
        # Sanity: every referenced entity/relationship must exist.
        for ent in recipe.output_entities:
            ont.entity(ent)
        for rel in recipe.output_relationships:
            ont.relationship(rel)
        ont.recipes[recipe.trigger] = recipe
    return ont


# Loaded once at import time. If a YAML is malformed the import fails fast,
# which is what we want — the agent must never run against a broken contract.
ONTOLOGY = load_ontology()
