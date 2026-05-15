"""Writes the Mapper Agent's output to Neo4j Aura.

Strategy for Phase 1 (per policy.yml):
    mode  = wipe_and_rewrite
    scope = per_master

Every node carries `org_id` so multi-tenant reads stay clean. Every Cypher
statement uses MERGE so re-running the agent is idempotent.

The driver is created lazily so the import is cheap and the FastAPI app
starts even when NEO4J_* env vars are missing.
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Any

from neo4j import GraphDatabase, Driver

_driver: Driver | None = None


def _get_driver() -> Driver:
    global _driver
    if _driver is not None:
        return _driver
    uri = os.environ.get("NEO4J_URI", "")
    user = os.environ.get("NEO4J_USER", "neo4j")
    password = os.environ.get("NEO4J_PASSWORD", "")
    if not uri or not password:
        raise RuntimeError("NEO4J_URI / NEO4J_PASSWORD not configured")
    _driver = GraphDatabase.driver(uri, auth=(user, password))
    return _driver


@contextmanager
def _session():
    driver = _get_driver()
    with driver.session() as session:
        yield session


def write_policy_mapping(payload: dict[str, Any]) -> dict[str, Any]:
    """Wipe-and-rewrite the subgraph for one master policy.

    `payload` is the dict returned by policy_extractor.extract_for_org().
    Returns a small summary dict for the API response.
    """
    master = payload["master"]
    children = payload["children"]
    domains = payload["extraction"]["security_domains"]
    links = payload["extraction"]["child_policy_links"]

    org_id = master["org_id"]
    master_id = master["policy_id"]

    with _session() as s:
        # 1. Clear the previous run for this master.
        #    - Remove DEFINES/COVERS/CONTAINS edges + the SecurityDomain and
        #      SecurityFunction nodes they touch (LLM-inferred, safe to drop).
        #    - Remove HAS_CHILD edges from this master.
        #    - Strip stale :OrphanPolicy labels in this org.
        s.run(
            """
            MATCH (sd:SecurityDomain {org_id: $org_id})
            OPTIONAL MATCH (sd)-[:CONTAINS]->(sf:SecurityFunction)
            DETACH DELETE sd, sf
            """,
            org_id=org_id,
        )
        s.run(
            """
            MATCH (m:Policy {org_id: $org_id, policy_id: $master_id})-[r:HAS_CHILD]->()
            DELETE r
            """,
            org_id=org_id, master_id=master_id,
        )
        s.run(
            """
            MATCH (p:Policy:OrphanPolicy {org_id: $org_id})
            REMOVE p:OrphanPolicy
            """,
            org_id=org_id,
        )

        # 2. Upsert the master Policy node.
        s.run(
            """
            MERGE (p:Policy {org_id: $org_id, policy_id: $policy_id})
            SET   p.name = $name,
                  p.is_master = true,
                  p.policy_ref = $policy_ref,
                  p.document_type = $document_type,
                  p.owner_name = $owner_name,
                  p.policy_status = $policy_status
            """,
            org_id=org_id,
            policy_id=master_id,
            name=master.get("name"),
            policy_ref=master.get("policy_ref"),
            document_type=master.get("document_type"),
            owner_name=master.get("owner_name"),
            policy_status=master.get("policy_status"),
        )

        # 3. Upsert every child Policy node (Supabase is the source of truth
        #    for these — we don't delete them on re-run).
        for c in children:
            s.run(
                """
                MERGE (p:Policy {org_id: $org_id, policy_id: $policy_id})
                SET   p.name = $name,
                      p.is_master = false,
                      p.policy_ref = $policy_ref,
                      p.document_type = $document_type
                """,
                org_id=org_id,
                policy_id=c["policy_id"],
                name=c.get("name"),
                policy_ref=c.get("policy_ref"),
                document_type=c.get("document_type"),
            )

        # 4. Create SecurityDomain + DEFINES edges, plus SecurityFunction +
        #    CONTAINS edges.
        for d in domains:
            s.run(
                """
                MATCH (m:Policy {org_id: $org_id, policy_id: $master_id})
                MERGE (sd:SecurityDomain {org_id: $org_id, name: $name})
                SET   sd.description = $description,
                      sd.confidence = $confidence
                MERGE (m)-[r:DEFINES {org_id: $org_id}]->(sd)
                SET   r.confidence = $confidence
                """,
                org_id=org_id,
                master_id=master_id,
                name=d["name"],
                description=d.get("description"),
                confidence=d.get("confidence"),
            )
            for f in d.get("functions") or []:
                s.run(
                    """
                    MATCH (sd:SecurityDomain {org_id: $org_id, name: $domain_name})
                    MERGE (sf:SecurityFunction {org_id: $org_id, domain_name: $domain_name, name: $name})
                    SET   sf.description = $description,
                          sf.confidence = $confidence
                    MERGE (sd)-[r:CONTAINS {org_id: $org_id}]->(sf)
                    SET   r.confidence = $confidence
                    """,
                    org_id=org_id,
                    domain_name=d["name"],
                    name=f["name"],
                    description=f.get("description"),
                    confidence=f.get("confidence"),
                )

        # 5. Create HAS_CHILD edges from master to linked children, and
        #    optional COVERS edges from child to domain.
        linked_child_ids: set[str] = set()
        for l in links:
            linked_child_ids.add(l["policy_id"])
            s.run(
                """
                MATCH (m:Policy {org_id: $org_id, policy_id: $master_id})
                MATCH (c:Policy {org_id: $org_id, policy_id: $child_id})
                MERGE (m)-[r:HAS_CHILD {org_id: $org_id}]->(c)
                SET   r.confidence = $confidence,
                      r.rationale = $rationale,
                      r.matched_on = $matched_on
                """,
                org_id=org_id,
                master_id=master_id,
                child_id=l["policy_id"],
                confidence=l["confidence"],
                rationale=l.get("rationale"),
                matched_on=l.get("matched_on"),
            )
            for dom_name in l.get("covers_domains") or []:
                s.run(
                    """
                    MATCH (c:Policy {org_id: $org_id, policy_id: $child_id})
                    MATCH (sd:SecurityDomain {org_id: $org_id, name: $domain_name})
                    MERGE (c)-[r:COVERS {org_id: $org_id}]->(sd)
                    SET   r.confidence = $confidence
                    """,
                    org_id=org_id,
                    child_id=l["policy_id"],
                    domain_name=dom_name,
                    confidence=l.get("confidence"),
                )

        # 6. Tag unlinked children as :OrphanPolicy for visualizer rendering.
        orphan_ids = [c["policy_id"] for c in children if c["policy_id"] not in linked_child_ids]
        if orphan_ids:
            s.run(
                """
                UNWIND $ids AS pid
                MATCH (p:Policy {org_id: $org_id, policy_id: pid})
                SET p:OrphanPolicy
                """,
                org_id=org_id, ids=orphan_ids,
            )

    return {
        "domains": len(domains),
        "functions": sum(len(d.get("functions") or []) for d in domains),
        "child_links": len(links),
        "orphans": len(children) - len(linked_child_ids) if children else 0,
    }


def read_graph(org_id: str, master_policy_id: str | None = None) -> dict[str, Any]:
    """Return ReactFlow-shaped {nodes, edges} for the visualizer.

    If `master_policy_id` is given, returns the subgraph rooted at that master.
    Otherwise, returns every Policy/SecurityDomain in the org.

    NOTE: we issue one query per relationship type. Combining them in a single
    Cypher with stacked OPTIONAL MATCH clauses creates a Cartesian product —
    every HAS_CHILD edge gets emitted once per (DEFINES × CONTAINS × COVERS)
    combination, blowing up the edge count.
    """
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    seen_nodes: set[str] = set()
    seen_edges: set[str] = set()

    def _push_node(node_id: str, label: str, data: dict[str, Any]) -> None:
        if node_id in seen_nodes:
            return
        seen_nodes.add(node_id)
        nodes.append({"id": node_id, "type": label, "data": data})

    def _push_edge(edge: dict[str, Any]) -> None:
        if edge["id"] in seen_edges:
            return
        seen_edges.add(edge["id"])
        edges.append(edge)

    with _session() as s:
        # 1. Master policy node(s) — anchor of the subgraph.
        if master_policy_id:
            master_q = "MATCH (m:Policy {org_id: $org_id, policy_id: $master_id, is_master: true}) RETURN m"
            master_params = {"org_id": org_id, "master_id": master_policy_id}
        else:
            master_q = "MATCH (m:Policy {org_id: $org_id, is_master: true}) RETURN m"
            master_params = {"org_id": org_id}
        for record in s.run(master_q, **master_params):
            m = record["m"]
            if m is not None:
                _push_node(f"policy:{m['policy_id']}", "MasterPolicy", dict(m.items()))

        # 2. DEFINES — master → SecurityDomain.
        for record in s.run(
            "MATCH (m:Policy {org_id: $org_id, is_master: true})-[d:DEFINES]->(sd:SecurityDomain) "
            + ("WHERE m.policy_id = $master_id " if master_policy_id else "")
            + "RETURN m.policy_id AS master_id, sd, d",
            **master_params,
        ):
            sd = record["sd"]
            d = record["d"]
            _push_node(f"domain:{sd['name']}", "SecurityDomain", dict(sd.items()))
            _push_edge({
                "id": f"e:DEFINES:{record['master_id']}->{sd['name']}",
                "source": f"policy:{record['master_id']}",
                "target": f"domain:{sd['name']}",
                "label": "DEFINES",
                "data": {"confidence": d.get("confidence")},
            })

        # 3. CONTAINS — SecurityDomain → SecurityFunction.
        for record in s.run(
            "MATCH (sd:SecurityDomain {org_id: $org_id})-[cn:CONTAINS]->(sf:SecurityFunction) "
            "RETURN sd, sf, cn",
            org_id=org_id,
        ):
            sd = record["sd"]
            sf = record["sf"]
            cn = record["cn"]
            _push_node(f"function:{sf['domain_name']}:{sf['name']}", "SecurityFunction", dict(sf.items()))
            _push_edge({
                "id": f"e:CONTAINS:{sd['name']}->{sf['name']}",
                "source": f"domain:{sd['name']}",
                "target": f"function:{sf['domain_name']}:{sf['name']}",
                "label": "CONTAINS",
                "data": {"confidence": cn.get("confidence")},
            })

        # 4. HAS_CHILD — master → child Policy.
        for record in s.run(
            "MATCH (m:Policy {org_id: $org_id, is_master: true})-[r:HAS_CHILD]->(c:Policy) "
            + ("WHERE m.policy_id = $master_id " if master_policy_id else "")
            + "RETURN m.policy_id AS master_id, c, r, labels(c) AS clabels",
            **master_params,
        ):
            c = record["c"]
            is_orphan = "OrphanPolicy" in (record["clabels"] or [])
            _push_node(
                f"policy:{c['policy_id']}",
                "OrphanPolicy" if is_orphan else "ChildPolicy",
                dict(c.items()),
            )
            r = record["r"]
            _push_edge({
                "id": f"e:HAS_CHILD:{record['master_id']}->{c['policy_id']}",
                "source": f"policy:{record['master_id']}",
                "target": f"policy:{c['policy_id']}",
                "label": "HAS_CHILD",
                "data": {
                    "confidence": r.get("confidence"),
                    "rationale": r.get("rationale"),
                    "matched_on": r.get("matched_on"),
                },
            })

        # 5. COVERS — child Policy → SecurityDomain.
        for record in s.run(
            "MATCH (c:Policy {org_id: $org_id, is_master: false})-[cv:COVERS]->(sd:SecurityDomain) "
            "RETURN c, sd, cv",
            org_id=org_id,
        ):
            c = record["c"]
            sd = record["sd"]
            cv = record["cv"]
            # Make sure both endpoints exist as nodes (defensive — usually
            # added by HAS_CHILD / DEFINES already).
            _push_node(f"policy:{c['policy_id']}", "ChildPolicy", dict(c.items()))
            _push_node(f"domain:{sd['name']}", "SecurityDomain", dict(sd.items()))
            _push_edge({
                "id": f"e:COVERS:{c['policy_id']}->{sd['name']}",
                "source": f"policy:{c['policy_id']}",
                "target": f"domain:{sd['name']}",
                "label": "COVERS",
                "data": {"confidence": cv.get("confidence")},
            })

        # 6. Orphan children — not linked from master, render as standalone.
        for record in s.run(
            "MATCH (p:Policy:OrphanPolicy {org_id: $org_id}) RETURN p",
            org_id=org_id,
        ):
            p = record["p"]
            _push_node(f"policy:{p['policy_id']}", "OrphanPolicy", dict(p.items()))

    return {"nodes": nodes, "edges": edges}
