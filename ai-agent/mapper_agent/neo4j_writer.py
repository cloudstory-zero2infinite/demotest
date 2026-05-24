"""Writes the Mapper Agent's output to Neo4j Aura.

Phase 2 (per policy.yml v2):
    mode  = wipe_and_rewrite
    scope = per_master

Graph shape produced for the "policies" trigger:

    (Policy:master) -[:DEFINES]->     (SecurityObjective)
    (SecurityObjective) -[:MAPS_TO]-> (SCFDomain {scf_id, domain_name})
    (Policy:master) -[:HAS_CHILD]->   (Policy:child)
    (Policy:child)  -[:COVERS]->      (SCFDomain)

SCFDomain is materialised per-org (org_id is required on every node) so the
visualizer's per-tenant queries stay clean. The 33 canonical SCF domains live
in Supabase public.scf_domains (uploaded by the SME via the internal tool).
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
    """
    master = payload["master"]
    children = payload["children"]
    scf_index: dict[str, dict[str, Any]] = payload.get("scf_index") or {}
    objectives = payload["extraction"]["security_objectives"]
    links = payload["extraction"]["child_policy_links"]

    org_id = master["org_id"]
    master_id = master["policy_id"]

    # Every scf_id that anything in this run will reference (objective targets
    # + child COVERS targets). Used to MERGE the relevant SCFDomain nodes only.
    referenced_scf_ids: set[str] = set()
    for o in objectives:
        for sid in o.get("scf_ids") or []:
            referenced_scf_ids.add(sid)
    for l in links:
        for sid in l.get("covers_scf_ids") or []:
            referenced_scf_ids.add(sid)

    with _session() as s:
        # 1. Clear the previous run for this master.
        #    a. Legacy v1 cleanup: drop any SecurityDomain / SecurityFunction
        #       nodes left over from before the SCF rewrite. Safe across orgs
        #       because the wipe is scoped on org_id.
        s.run(
            """
            MATCH (sd:SecurityDomain {org_id: $org_id})
            OPTIONAL MATCH (sd)-[:CONTAINS]->(sf:SecurityFunction)
            DETACH DELETE sd, sf
            """,
            org_id=org_id,
        )
        #    b. v2: drop SecurityObjective nodes for this master (their edges
        #       are removed via DETACH).
        s.run(
            """
            MATCH (so:SecurityObjective {org_id: $org_id, master_policy_id: $master_id})
            DETACH DELETE so
            """,
            org_id=org_id, master_id=master_id,
        )
        #    c. v2: drop HAS_CHILD edges from this master.
        s.run(
            """
            MATCH (m:Policy {org_id: $org_id, policy_id: $master_id})-[r:HAS_CHILD]->()
            DELETE r
            """,
            org_id=org_id, master_id=master_id,
        )
        #    d. v2: drop COVERS edges from child Policies in this org (we
        #       re-derive them from the LLM output every run).
        s.run(
            """
            MATCH (c:Policy {org_id: $org_id, is_master: false})-[r:COVERS]->(:SCFDomain {org_id: $org_id})
            DELETE r
            """,
            org_id=org_id,
        )
        #    e. v2: strip stale OrphanPolicy labels.
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
        #    for these — we never delete them on re-run).
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

        # 4. MERGE the SCFDomain nodes referenced in this run (per-org).
        for scf_id in referenced_scf_ids:
            meta = scf_index.get(scf_id) or {}
            s.run(
                """
                MERGE (sd:SCFDomain {org_id: $org_id, scf_id: $scf_id})
                SET   sd.domain_name = $domain_name,
                      sd.principle = $principle,
                      sd.sort_order = $sort_order
                """,
                org_id=org_id,
                scf_id=scf_id,
                domain_name=meta.get("domain_name"),
                principle=meta.get("principle"),
                sort_order=meta.get("sort_order"),
            )

        # 5. Create SecurityObjective nodes + DEFINES (master → objective) +
        #    MAPS_TO (objective → SCFDomain).
        for o in objectives:
            s.run(
                """
                MATCH (m:Policy {org_id: $org_id, policy_id: $master_id})
                MERGE (so:SecurityObjective {
                    org_id: $org_id,
                    master_policy_id: $master_id,
                    name: $name
                })
                SET   so.description = $description,
                      so.confidence = $confidence
                MERGE (m)-[r:DEFINES {org_id: $org_id}]->(so)
                SET   r.confidence = $confidence
                """,
                org_id=org_id,
                master_id=master_id,
                name=o["name"],
                description=o.get("description"),
                confidence=o.get("confidence"),
            )
            for scf_id in o.get("scf_ids") or []:
                s.run(
                    """
                    MATCH (so:SecurityObjective {
                        org_id: $org_id,
                        master_policy_id: $master_id,
                        name: $name
                    })
                    MATCH (sd:SCFDomain {org_id: $org_id, scf_id: $scf_id})
                    MERGE (so)-[r:MAPS_TO {org_id: $org_id}]->(sd)
                    SET   r.confidence = $confidence
                    """,
                    org_id=org_id,
                    master_id=master_id,
                    name=o["name"],
                    scf_id=scf_id,
                    confidence=o.get("confidence"),
                )

        # 6. Create HAS_CHILD edges from master to linked children + optional
        #    COVERS edges from child → SCFDomain.
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
            for scf_id in l.get("covers_scf_ids") or []:
                s.run(
                    """
                    MATCH (c:Policy {org_id: $org_id, policy_id: $child_id})
                    MATCH (sd:SCFDomain {org_id: $org_id, scf_id: $scf_id})
                    MERGE (c)-[r:COVERS {org_id: $org_id}]->(sd)
                    SET   r.confidence = $confidence
                    """,
                    org_id=org_id,
                    child_id=l["policy_id"],
                    scf_id=scf_id,
                    confidence=l.get("confidence"),
                )

        # 7. Tag unlinked children as :OrphanPolicy for visualizer rendering.
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
        "objectives": len(objectives),
        "scf_domains": len(referenced_scf_ids),
        "child_links": len(links),
        "orphans": len(children) - len(linked_child_ids) if children else 0,
    }


def write_controls_mapping(payload: dict[str, Any]) -> dict[str, Any]:
    """Rebuild the SCFDomain → Control → Capability → Asset chain for one org.

    Wipe scope: Control, Capability, Asset nodes for this org are deleted
    (DETACH-DELETE removes IMPLEMENTED_BY/ENFORCED_BY/PROVIDED_BY edges).
    SCFDomain, SecurityObjective and Policy nodes are preserved — they
    belong to the 'policies' trigger.

    `payload` is the dict returned by controls_extractor.extract_for_org().
    """
    org_id = payload["org_id"]
    controls    = payload["controls"]
    capabilities = payload["capabilities"]
    assets      = payload["assets"]
    enforced    = payload["enforced_by_edges"]
    provided    = payload["provided_by_edges"]

    with _session() as s:
        # 1. Wipe prior run for this org (Control/Capability/Asset + their edges).
        s.run(
            """
            MATCH (n {org_id: $org_id})
            WHERE n:Control OR n:Capability OR n:Asset
            DETACH DELETE n
            """,
            org_id=org_id,
        )

        # 2. MERGE Control nodes and attach to the matching SCFDomain via
        #    IMPLEMENTED_BY. Controls whose SCFDomain isn't in the graph
        #    were already filtered out by the extractor.
        for c in controls:
            s.run(
                """
                MATCH (sd:SCFDomain {org_id: $org_id, scf_id: $scf_id})
                MERGE (ctl:Control {org_id: $org_id, scf_control_id: $scf_control_id})
                SET   ctl.ctl_id      = $ctl_id,
                      ctl.ctl_name    = $ctl_name,
                      ctl.ctl_status  = $ctl_status,
                      ctl.scf_id      = $scf_id
                MERGE (sd)-[r:IMPLEMENTED_BY {org_id: $org_id}]->(ctl)
                """,
                org_id=org_id,
                scf_id=c["scf_id"],
                scf_control_id=c["scf_control_id"],
                ctl_id=c["ctl_id"],
                ctl_name=c["ctl_name"],
                ctl_status=c.get("ctl_status"),
            )

        # 3. MERGE Capability nodes used by at least one Control.
        for cap in capabilities:
            s.run(
                """
                MERGE (cp:Capability {org_id: $org_id, capab_id: $capab_id})
                SET   cp.capab_name  = $capab_name,
                      cp.capab_owner = $capab_owner
                """,
                org_id=org_id,
                capab_id=cap["capab_id"],
                capab_name=cap.get("capab_name"),
                capab_owner=cap.get("capab_owner"),
            )

        # 4. ENFORCED_BY — Control → Capability.
        for e in enforced:
            s.run(
                """
                MATCH (ctl:Control    {org_id: $org_id, scf_control_id: $scf_control_id})
                MATCH (cp:Capability  {org_id: $org_id, capab_id: $capab_id})
                MERGE (ctl)-[r:ENFORCED_BY {org_id: $org_id}]->(cp)
                SET   r.matched_on = $matched_on
                """,
                org_id=org_id,
                scf_control_id=e["scf_control_id"],
                capab_id=e["capab_id"],
                matched_on=e["matched_on"],
            )

        # 5. MERGE Asset nodes used by at least one Capability.
        for a in assets:
            s.run(
                """
                MERGE (ast:Asset {org_id: $org_id, asset_id: $asset_id})
                SET   ast.name     = $name,
                      ast.category = $category
                """,
                org_id=org_id,
                asset_id=a["asset_id"],
                name=a.get("name"),
                category=a.get("category"),
            )

        # 6. PROVIDED_BY — Capability → Asset.
        for p in provided:
            s.run(
                """
                MATCH (cp:Capability {org_id: $org_id, capab_id: $capab_id})
                MATCH (ast:Asset     {org_id: $org_id, asset_id: $asset_id})
                MERGE (cp)-[r:PROVIDED_BY {org_id: $org_id}]->(ast)
                SET   r.matched_on = $matched_on
                """,
                org_id=org_id,
                capab_id=p["capab_id"],
                asset_id=p["asset_id"],
                matched_on=p["matched_on"],
            )

    stats = payload.get("stats") or {}
    return {
        "controls":               len(controls),
        "capabilities":           len(capabilities),
        "assets":                 len(assets),
        "implemented_by_edges":   len(controls),
        "enforced_by_edges":      len(enforced),
        "provided_by_edges":      len(provided),
        "controls_with_capabilities": stats.get("controls_with_capabilities", 0),
        "total_standard_controls":    stats.get("total_standard_controls", 0),
    }


def read_graph(org_id: str, master_policy_id: str | None = None) -> dict[str, Any]:
    """Return ReactFlow-shaped {nodes, edges} for the visualizer.

    Emitted node types:
        MasterPolicy      — the master Policy
        ChildPolicy       — a linked child Policy
        OrphanPolicy      — an unlinked child Policy
        SecurityObjective — LLM-extracted objective, scoped per master
        SCFDomain         — one of the 33 SCF domains (per-org materialisation)
        Control           — agent-managed control_registry row
        Capability        — capability_register row used by ≥1 Control
        Asset             — assets row used by ≥1 Capability

    Emitted edge labels: DEFINES, MAPS_TO, HAS_CHILD, COVERS,
                          IMPLEMENTED_BY, ENFORCED_BY, PROVIDED_BY.

    NOTE: one query per relationship type — combining them in a single Cypher
    with stacked OPTIONAL MATCH clauses creates a Cartesian product and blows
    up the edge count.
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
        # 1. Master policy node(s).
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

        # 2. DEFINES — master → SecurityObjective.
        for record in s.run(
            "MATCH (m:Policy {org_id: $org_id, is_master: true})-[d:DEFINES]->(so:SecurityObjective) "
            + ("WHERE m.policy_id = $master_id " if master_policy_id else "")
            + "RETURN m.policy_id AS master_id, so, d",
            **master_params,
        ):
            so = record["so"]
            d = record["d"]
            obj_id = f"objective:{record['master_id']}:{so['name']}"
            _push_node(obj_id, "SecurityObjective", dict(so.items()))
            _push_edge({
                "id": f"e:DEFINES:{record['master_id']}->{so['name']}",
                "source": f"policy:{record['master_id']}",
                "target": obj_id,
                "label": "DEFINES",
                "data": {"confidence": d.get("confidence")},
            })

        # 3. MAPS_TO — SecurityObjective → SCFDomain.
        for record in s.run(
            "MATCH (so:SecurityObjective {org_id: $org_id})-[mt:MAPS_TO]->(sd:SCFDomain) "
            + ("WHERE so.master_policy_id = $master_id " if master_policy_id else "")
            + "RETURN so, sd, mt",
            **master_params,
        ):
            so = record["so"]
            sd = record["sd"]
            mt = record["mt"]
            obj_id = f"objective:{so['master_policy_id']}:{so['name']}"
            dom_id = f"scfdomain:{sd['scf_id']}"
            _push_node(dom_id, "SCFDomain", dict(sd.items()))
            _push_edge({
                "id": f"e:MAPS_TO:{so['master_policy_id']}:{so['name']}->{sd['scf_id']}",
                "source": obj_id,
                "target": dom_id,
                "label": "MAPS_TO",
                "data": {"confidence": mt.get("confidence")},
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

        # 5. COVERS — child Policy → SCFDomain.
        for record in s.run(
            "MATCH (c:Policy {org_id: $org_id, is_master: false})-[cv:COVERS]->(sd:SCFDomain) "
            "RETURN c, sd, cv",
            org_id=org_id,
        ):
            c = record["c"]
            sd = record["sd"]
            cv = record["cv"]
            _push_node(f"policy:{c['policy_id']}", "ChildPolicy", dict(c.items()))
            _push_node(f"scfdomain:{sd['scf_id']}", "SCFDomain", dict(sd.items()))
            _push_edge({
                "id": f"e:COVERS:{c['policy_id']}->{sd['scf_id']}",
                "source": f"policy:{c['policy_id']}",
                "target": f"scfdomain:{sd['scf_id']}",
                "label": "COVERS",
                "data": {"confidence": cv.get("confidence")},
            })

        # 6. Orphan children — render as standalone in case they weren't
        #    surfaced by the HAS_CHILD pass (defensive).
        for record in s.run(
            "MATCH (p:Policy:OrphanPolicy {org_id: $org_id}) RETURN p",
            org_id=org_id,
        ):
            p = record["p"]
            _push_node(f"policy:{p['policy_id']}", "OrphanPolicy", dict(p.items()))

        # 7. IMPLEMENTED_BY — SCFDomain → Control.
        for record in s.run(
            "MATCH (sd:SCFDomain {org_id: $org_id})-[r:IMPLEMENTED_BY]->(ctl:Control) "
            "RETURN sd, ctl, r",
            org_id=org_id,
        ):
            sd = record["sd"]; ctl = record["ctl"]
            dom_id = f"scfdomain:{sd['scf_id']}"
            ctl_id = f"control:{ctl['scf_control_id']}"
            _push_node(dom_id, "SCFDomain", dict(sd.items()))
            _push_node(ctl_id, "Control", dict(ctl.items()))
            _push_edge({
                "id": f"e:IMPLEMENTED_BY:{sd['scf_id']}->{ctl['scf_control_id']}",
                "source": dom_id,
                "target": ctl_id,
                "label": "IMPLEMENTED_BY",
                "data": {},
            })

        # 8. ENFORCED_BY — Control → Capability.
        for record in s.run(
            "MATCH (ctl:Control {org_id: $org_id})-[r:ENFORCED_BY]->(cp:Capability) "
            "RETURN ctl, cp, r",
            org_id=org_id,
        ):
            ctl = record["ctl"]; cp = record["cp"]; r = record["r"]
            ctl_id = f"control:{ctl['scf_control_id']}"
            cap_id = f"capability:{cp['capab_id']}"
            _push_node(ctl_id, "Control", dict(ctl.items()))
            _push_node(cap_id, "Capability", dict(cp.items()))
            _push_edge({
                "id": f"e:ENFORCED_BY:{ctl['scf_control_id']}->{cp['capab_id']}",
                "source": ctl_id,
                "target": cap_id,
                "label": "ENFORCED_BY",
                "data": {"matched_on": r.get("matched_on")},
            })

        # 9. PROVIDED_BY — Capability → Asset.
        for record in s.run(
            "MATCH (cp:Capability {org_id: $org_id})-[r:PROVIDED_BY]->(ast:Asset) "
            "RETURN cp, ast, r",
            org_id=org_id,
        ):
            cp = record["cp"]; ast = record["ast"]; r = record["r"]
            cap_id = f"capability:{cp['capab_id']}"
            ast_id = f"asset:{ast['asset_id']}"
            _push_node(cap_id, "Capability", dict(cp.items()))
            _push_node(ast_id, "Asset", dict(ast.items()))
            _push_edge({
                "id": f"e:PROVIDED_BY:{cp['capab_id']}->{ast['asset_id']}",
                "source": cap_id,
                "target": ast_id,
                "label": "PROVIDED_BY",
                "data": {"matched_on": r.get("matched_on")},
            })

    return {"nodes": nodes, "edges": edges}
