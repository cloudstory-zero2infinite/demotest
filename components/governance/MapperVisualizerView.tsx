import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    MarkerType,
    type Node as RFNode,
    type Edge as RFEdge,
    type NodeProps,
    Handle,
    Position,
    useNodesState,
    useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
    forceSimulation,
    forceLink,
    forceManyBody,
    forceCenter,
    forceCollide,
    type SimulationNodeDatum,
    type SimulationLinkDatum,
} from 'd3-force';

import * as SupabaseService from '../../services/supabase';
import { MapperGraph, MapperGraphNode, MapperGraphEdge } from '../../types';
import { useUnifiedRefresh } from '../../hooks/useUnifiedRefresh';
import { MapperContextMenu, ContextMenuItem } from './MapperContextMenu';

interface Props {
    isActive?: boolean;
    focusMasterPolicyId?: string | null;
    onFocusConsumed?: () => void;
}

// Tracks whether the app is currently in dark mode. App.tsx toggles the
// `dark` class on document.body — we watch that with a MutationObserver so
// the visualizer follows the user's choice instead of being locked to dark.
function useIsDarkMode(): boolean {
    const [isDark, setIsDark] = useState(() =>
        typeof document !== 'undefined' && document.body.classList.contains('dark'),
    );
    useEffect(() => {
        if (typeof document === 'undefined') return;
        const observer = new MutationObserver(() => {
            setIsDark(document.body.classList.contains('dark'));
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);
    return isDark;
}

// ── Config ────────────────────────────────────────────────────────────────
const GROUP_THRESHOLD = 3;
const CONF_THRESHOLD = 0.5;
// Tree relationships build the visible spine: master -DEFINES-> objective
// -MAPS_TO-> SCFDomain, and master -HAS_CHILD-> child policy. COVERS is a
// cross-link overlay (child -> SCFDomain) and is NOT part of the tree.
const TREE_RELATIONS = new Set(['DEFINES', 'MAPS_TO', 'HAS_CHILD']);

const HUB_LABELS: Record<string, string> = {
    DEFINES:   'objectives',
    MAPS_TO:   'SCF domains',
    HAS_CHILD: 'child policies',
    COVERS:    'domains covered',
};

// Per-node-type colour for icon background.
const ICON_BG: Record<string, string> = {
    MasterPolicy: 'bg-amber-500',
    ChildPolicy: 'bg-blue-500',
    OrphanPolicy: 'bg-gray-500',
    SecurityObjective: 'bg-purple-500',
    SCFDomain: 'bg-emerald-500',
};
const ICON_RING: Record<string, string> = {
    MasterPolicy: 'ring-amber-300',
    ChildPolicy: 'ring-blue-300',
    OrphanPolicy: 'ring-gray-500',
    SecurityObjective: 'ring-purple-300',
    SCFDomain: 'ring-emerald-300',
};

const HUB_STYLE: Record<string, { bg: string; ring: string; text: string }> = {
    DEFINES:   { bg: 'bg-purple-700',  ring: 'ring-purple-400',  text: 'text-purple-50' },
    MAPS_TO:   { bg: 'bg-emerald-700', ring: 'ring-emerald-400', text: 'text-emerald-50' },
    HAS_CHILD: { bg: 'bg-blue-700',    ring: 'ring-blue-400',    text: 'text-blue-50' },
    COVERS:    { bg: 'bg-slate-700',   ring: 'ring-slate-400',   text: 'text-slate-50' },
};

const EDGE_COLOR: Record<string, string> = {
    DEFINES:   '#a855f7',
    MAPS_TO:   '#10b981',
    HAS_CHILD: '#3b82f6',
    COVERS:    '#94a3b8',
};

// ── Icons (Lucide-style) ──────────────────────────────────────────────────
const FileIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="9" y1="13" x2="15" y2="13" />
        <line x1="9" y1="17" x2="13" y2="17" />
    </svg>
);
const ShieldIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <polyline points="9 12 11 14 15 10" />
    </svg>
);
const FileQuestionIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="M10 14a2 2 0 1 1 3.4 1.4L12 17" />
        <circle cx="12" cy="20" r="0.5" />
    </svg>
);
const FolderIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
);
const TargetIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
);

const ICONS: Record<string, React.FC<{ className?: string }>> = {
    MasterPolicy: ShieldIcon,
    ChildPolicy: FileIcon,
    OrphanPolicy: FileQuestionIcon,
    SecurityObjective: TargetIcon,
    SCFDomain: FolderIcon,
};

// ── Handles ──────────────────────────────────────────────────────────────
// A single source + target handle at the visual CENTER of the node. ReactFlow
// computes the edge endpoint from the handle's DOM position, so positioning
// the handle at the node centre means edges go centre-to-centre. The solid
// node background then hides the part of the line inside the node, making
// it look like the line emerges precisely from the node's edge (VT-style).
const CENTER_HANDLE_STYLE: React.CSSProperties = {
    opacity: 0,
    width: 1,
    height: 1,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'transparent',
    border: 'none',
    pointerEvents: 'none',
};
const CenterHandles: React.FC = () => (
    <>
        <Handle id="c-s" type="source" position={Position.Right} style={CENTER_HANDLE_STYLE} />
        <Handle id="c-t" type="target" position={Position.Left}  style={CENTER_HANDLE_STYLE} />
    </>
);

// ── Node renderers (icon + label, VT-style) ──────────────────────────────
const IconNode: React.FC<NodeProps> = ({ data }) => {
    const kind = (data.kind as string) || 'ChildPolicy';
    const Icon = ICONS[kind] || FileIcon;
    const bg = ICON_BG[kind] || 'bg-gray-500';
    const ring = ICON_RING[kind] || 'ring-gray-400';
    const expanded = !!data.expanded;
    const hasChildren = !!data.hasChildren;
    const isMaster = kind === 'MasterPolicy';
    const size = isMaster ? 52 : 40;
    return (
        <div className="flex flex-col items-center cursor-pointer select-none" style={{ width: 110 }}>
            <CenterHandles />
            <div className="relative">
                <div
                    className={`rounded-full ring-2 shadow-lg ${bg} ${ring} flex items-center justify-center`}
                    style={{ width: size, height: size }}
                >
                    <Icon className="text-white" />
                </div>
                {hasChildren && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white dark:bg-gray-900 ring-1 ring-gray-400 dark:ring-gray-500 flex items-center justify-center">
                        <svg className={`w-2.5 h-2.5 text-gray-700 dark:text-white transition-transform ${expanded ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                )}
            </div>
            <div className="mt-1 text-[10px] text-center text-gray-700 dark:text-gray-200 leading-tight" style={{
                maxWidth: 110,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
            }}>
                {data.label as string}
            </div>
        </div>
    );
};

const HubNode: React.FC<NodeProps> = ({ data }) => {
    const relation = data.relation as string;
    const count = data.count as number;
    const expanded = !!data.expanded;
    const style = HUB_STYLE[relation] || HUB_STYLE.HAS_CHILD;
    const labelWord = HUB_LABELS[relation] || 'items';
    return (
        <div className="flex flex-col items-center cursor-pointer select-none" style={{ width: 110 }}>
            <CenterHandles />
            <div className="relative">
                <div
                    className={`rounded-full ring-2 shadow-lg ${style.bg} ${style.ring} flex items-center justify-center`}
                    style={{ width: 48, height: 48 }}
                >
                    <span className="text-base font-bold text-white">{count}</span>
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white dark:bg-gray-900 ring-1 ring-gray-400 dark:ring-gray-500 flex items-center justify-center">
                    <svg className={`w-2.5 h-2.5 text-gray-700 dark:text-white transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>
            <div className="mt-1 text-[10px] text-center text-gray-700 dark:text-gray-200 leading-tight">
                <div className="font-bold tracking-wide">{relation}</div>
                <div className="opacity-70">{labelWord}</div>
            </div>
        </div>
    );
};

const nodeTypes = {
    icon: IconNode,
    hub: HubNode,
};

// ── Tree model ────────────────────────────────────────────────────────────
interface TreeNode {
    id: string;
    rfType: 'icon' | 'hub';
    raw: any;
    label: string;
    kind?: string;          // for icon nodes: MasterPolicy / ChildPolicy / OrphanPolicy / SecurityObjective / SCFDomain
    relation?: string;      // for hubs
    count?: number;         // for hubs
    children: TreeNode[];
}

function labelFor(n: MapperGraphNode): string {
    const d: any = n.data || {};
    if (n.type === 'SCFDomain' && d.scf_id) {
        return d.domain_name ? `${d.scf_id} — ${d.domain_name}` : d.scf_id;
    }
    if (n.type === 'SecurityObjective') {
        return d.name || n.id;
    }
    return d.name || d.policy_id || n.id;
}
function rfTypeFor(n: MapperGraphNode): 'icon' {
    return 'icon';   // all non-hub nodes use the icon renderer
}

function buildTree(graph: MapperGraph, hiddenNodes: Set<string>): TreeNode | null {
    const edgeById = new Map<string, MapperGraphEdge>();
    for (const e of graph.edges) if (!edgeById.has(e.id)) edgeById.set(e.id, e);

    const nodeById = new Map<string, MapperGraphNode>(graph.nodes.map(n => [n.id, n]));
    const treeEdgesBySource = new Map<string, MapperGraphEdge[]>();
    for (const e of edgeById.values()) {
        if (!TREE_RELATIONS.has(e.label)) continue;
        const arr = treeEdgesBySource.get(e.source) || [];
        arr.push(e);
        treeEdgesBySource.set(e.source, arr);
    }

    const built = new Map<string, TreeNode>();
    function make(nodeId: string): TreeNode | null {
        if (built.has(nodeId)) return built.get(nodeId)!;
        if (hiddenNodes.has(nodeId)) return null;
        const n = nodeById.get(nodeId);
        if (!n) return null;

        const outgoing = treeEdgesBySource.get(nodeId) || [];
        const byRel = new Map<string, MapperGraphEdge[]>();
        for (const e of outgoing) {
            const arr = byRel.get(e.label) || [];
            arr.push(e);
            byRel.set(e.label, arr);
        }

        const children: TreeNode[] = [];
        for (const [relation, edges] of byRel) {
            const visibleEdges = edges.filter(e => !hiddenNodes.has(e.target));
            if (visibleEdges.length === 0) continue;
            if (visibleEdges.length >= GROUP_THRESHOLD) {
                const hubId = `hub:${nodeId}:${relation}`;
                const hubChildren: TreeNode[] = [];
                for (const e of visibleEdges) {
                    const sub = make(e.target);
                    if (sub) hubChildren.push(sub);
                }
                children.push({
                    id: hubId,
                    rfType: 'hub',
                    raw: { source_id: nodeId },
                    label: relation,
                    relation,
                    count: visibleEdges.length,
                    children: hubChildren,
                });
            } else {
                for (const e of visibleEdges) {
                    const sub = make(e.target);
                    if (sub) children.push(sub);
                }
            }
        }

        const node: TreeNode = {
            id: nodeId,
            rfType: rfTypeFor(n),
            raw: n.data,
            label: labelFor(n),
            kind: n.type,
            children,
        };
        built.set(nodeId, node);
        return node;
    }

    const master = graph.nodes.find(n => n.type === 'MasterPolicy');
    if (!master) return null;
    return make(master.id);
}

// ── Force layout ─────────────────────────────────────────────────────────
interface SimNode extends SimulationNodeDatum {
    id: string;
    treeNode: TreeNode;
}
interface SimLink extends SimulationLinkDatum<SimNode> {
    type: 'tree' | 'covers';
    distance: number;
    strength?: number;
}

interface PlacedNode {
    id: string;
    rfType: TreeNode['rfType'];
    position: { x: number; y: number };          // RELATIVE to parentId (or world when no parent)
    absolutePosition: { x: number; y: number };  // world coords (used for handle picking)
    parentId?: string;
    data: any;
}

function runForceLayout(
    root: TreeNode,
    expanded: Set<string>,
    coversEdges: MapperGraphEdge[],
    prevPositions: Map<string, { x: number; y: number }>,
): { placed: PlacedNode[]; visibleIds: Set<string> } {
    // 1. Collect visible nodes + tree links. Also record each node's tree
    //    parent for parentId rendering AND each spoke's hub+grandparent so
    //    we can push spokes to the outward side of the hub.
    const simNodes: SimNode[] = [];
    const simNodeById = new Map<string, SimNode>();
    const visibleIds = new Set<string>();
    const treeLinks: SimLink[] = [];
    const treeParentById = new Map<string, string>();
    // For each spoke under a hub: { hub, hubParent } — hubParent is the node
    // that the hub itself hangs off (master / domain / etc.). Spokes should
    // sit on the side of the hub OPPOSITE to hubParent.
    const spokeOutward = new Map<string, { hubId: string; hubParentId: string }>();

    const addNode = (n: TreeNode) => {
        if (visibleIds.has(n.id)) return;
        const sn: SimNode = { id: n.id, treeNode: n };
        const prev = prevPositions.get(n.id);
        if (prev) { sn.x = prev.x; sn.y = prev.y; }
        simNodes.push(sn);
        simNodeById.set(n.id, sn);
        visibleIds.add(n.id);
    };
    addNode(root);

    function walk(n: TreeNode, hubParentId: string | null) {
        if (!expanded.has(n.id)) return;
        for (const c of n.children) {
            addNode(c);
            treeParentById.set(c.id, n.id);
            if (n.rfType === 'hub' && hubParentId) {
                spokeOutward.set(c.id, { hubId: n.id, hubParentId });
            }
            const isSpokeLink = n.rfType === 'hub';
            const isHubLink = c.rfType === 'hub';
            // Tuned: deeper clusters slightly more compact than VT-style.
            const distance = isSpokeLink ? 110 : isHubLink ? 220 : 170;
            const strength = isSpokeLink ? 1.0 : 0.8;
            treeLinks.push({ source: n.id, target: c.id, type: 'tree', distance, strength });
            walk(c, c.rfType === 'hub' ? n.id : c.id);
        }
    }
    walk(root, null);

    // 2. COVERS cross-links — weak so they don't disturb tree layout.
    const coverLinks: SimLink[] = [];
    for (const e of coversEdges) {
        if (!visibleIds.has(e.source) || !visibleIds.has(e.target)) continue;
        coverLinks.push({ source: e.source, target: e.target, type: 'covers', distance: 240, strength: 0.04 });
    }

    // 3. Seed initial positions on the OUTWARD side of the parent so new
    //    nodes appear from the correct direction (not the opposite side).
    for (const sn of simNodes) {
        if (typeof sn.x === 'number' && typeof sn.y === 'number') continue;
        const meta = spokeOutward.get(sn.id);
        if (meta) {
            const hub = simNodeById.get(meta.hubId);
            const hubParent = simNodeById.get(meta.hubParentId);
            if (hub && hubParent && typeof hub.x === 'number' && typeof hubParent.x === 'number') {
                const dx = (hub.x ?? 0) - (hubParent.x ?? 0);
                const dy = (hub.y ?? 0) - (hubParent.y ?? 0);
                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                const ux = dx / len, uy = dy / len;
                // Random spread on a 180° arc on the outward side.
                const ang = Math.atan2(uy, ux) + (Math.random() - 0.5) * Math.PI;
                sn.x = (hub.x ?? 0) + Math.cos(ang) * 80 + (Math.random() - 0.5) * 10;
                sn.y = (hub.y ?? 0) + Math.sin(ang) * 80 + (Math.random() - 0.5) * 10;
                continue;
            }
        }
        const parentId = treeParentById.get(sn.id);
        const parent = parentId ? simNodeById.get(parentId) : null;
        if (parent && typeof parent.x === 'number') {
            const a = Math.random() * Math.PI * 2;
            sn.x = (parent.x ?? 0) + Math.cos(a) * 60 + (Math.random() - 0.5) * 10;
            sn.y = (parent.y ?? 0) + Math.sin(a) * 60 + (Math.random() - 0.5) * 10;
        } else {
            sn.x = (Math.random() - 0.5) * 80;
            sn.y = (Math.random() - 0.5) * 80;
        }
    }

    // 4. Pin master at origin AND pin its immediate hub children at evenly
    //    spaced angles around it. This is what VT does — hubs sit at clear
    //    angular positions and the force only operates on deeper levels.
    const master = simNodes.find(n => n.treeNode.kind === 'MasterPolicy');
    if (master) { master.fx = 0; master.fy = 0; }
    const masterHubs = root.children.filter(c => c.rfType === 'hub' && expanded.has(root.id));
    const HUB_RING_RADIUS = 340;
    masterHubs.forEach((hub, i) => {
        const N = masterHubs.length;
        // First hub at top (-π/2), then evenly distributed.
        const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(N, 1);
        const sn = simNodeById.get(hub.id);
        if (sn) {
            sn.fx = Math.cos(angle) * HUB_RING_RADIUS;
            sn.fy = Math.sin(angle) * HUB_RING_RADIUS;
        }
    });

    // 5. Custom directional force — pull each spoke toward the OUTWARD side
    //    of its hub (the side opposite the hub's own parent). This is what
    //    turns "spokes scattered in all directions" into "spokes on outward
    //    side only", VT-style.
    const directionalForce = (alpha: number) => {
        for (const [spokeId, meta] of spokeOutward) {
            const spoke = simNodeById.get(spokeId);
            const hub = simNodeById.get(meta.hubId);
            const hubParent = simNodeById.get(meta.hubParentId);
            if (!spoke || !hub || !hubParent) continue;
            if (spoke.x == null || hub.x == null || hubParent.x == null) continue;
            const dx = (hub.x ?? 0) - (hubParent.x ?? 0);
            const dy = (hub.y ?? 0) - (hubParent.y ?? 0);
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 1) continue;
            const ux = dx / len, uy = dy / len;
            // Strong target: pull spoke to a point ~110 px past the hub in
            // the outward direction. Repulsion from siblings spreads them
            // around this target into a fan.
            const TARGET = 110;
            const tx = (hub.x ?? 0) + ux * TARGET;
            const ty = (hub.y ?? 0) + uy * TARGET;
            const PULL = 0.35;
            spoke.vx = (spoke.vx ?? 0) + (tx - (spoke.x ?? 0)) * alpha * PULL;
            spoke.vy = (spoke.vy ?? 0) + (ty - (spoke.y ?? 0)) * alpha * PULL;
            // If still on the wrong side after the pull, kick it across.
            const proj = ((spoke.x ?? 0) - (hub.x ?? 0)) * ux + ((spoke.y ?? 0) - (hub.y ?? 0)) * uy;
            if (proj < 0) {
                const KICK = 0.6;
                spoke.vx = (spoke.vx ?? 0) + ux * (-proj + 30) * alpha * KICK;
                spoke.vy = (spoke.vy ?? 0) + uy * (-proj + 30) * alpha * KICK;
            }
        }
    };

    // 6. Run the simulation. Master + its hubs are pinned (via fx/fy above);
    //    everything else flows around them.
    const sim = forceSimulation(simNodes)
        .force('charge', forceManyBody().strength(-500).distanceMax(900))
        .force('link', forceLink<SimNode, SimLink>([...treeLinks, ...coverLinks])
            .id(d => d.id)
            .distance(l => l.distance)
            .strength(l => l.strength ?? 0.8))
        // No center force — pinned master already anchors the layout.
        .force('collide', forceCollide<SimNode>(d => (d.treeNode.kind === 'MasterPolicy' ? 75 : d.treeNode.rfType === 'hub' ? 60 : 60)).strength(0.95))
        .force('outward', directionalForce)
        .alpha(1)
        .alphaDecay(0.035)
        .stop();

    for (let i = 0; i < 400; i++) sim.tick();

    // 7. Materialise placed nodes with absolute + relative positions.
    //    parentId comes from the tree (NOT the force structure), so dragging
    //    a hub in ReactFlow moves all its descendants as one unit.
    const absoluteById = new Map<string, { x: number; y: number }>();
    for (const sn of simNodes) {
        absoluteById.set(sn.id, { x: sn.x ?? 0, y: sn.y ?? 0 });
    }
    const placed: PlacedNode[] = simNodes.map(sn => {
        const abs = absoluteById.get(sn.id)!;
        const parentId = treeParentById.get(sn.id);
        const parentAbs = parentId ? absoluteById.get(parentId) : undefined;
        const relPos = parentAbs
            ? { x: abs.x - parentAbs.x, y: abs.y - parentAbs.y }
            : abs;
        return {
            id: sn.id,
            rfType: sn.treeNode.rfType,
            position: relPos,
            absolutePosition: abs,
            parentId,
            data: {
                label: sn.treeNode.label,
                kind: sn.treeNode.kind,
                raw: sn.treeNode.raw,
                relation: sn.treeNode.relation,
                count: sn.treeNode.count,
                expanded: expanded.has(sn.id),
                hasChildren: sn.treeNode.children.length > 0,
            },
        };
    });

    return { placed, visibleIds };
}

// ── Main view ─────────────────────────────────────────────────────────────
export const MapperVisualizerView: React.FC<Props> = ({ isActive = true, focusMasterPolicyId, onFocusConsumed }) => {
    const isDark = useIsDarkMode();
    const [graph, setGraph] = useState<MapperGraph | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showLowConfidence, setShowLowConfidence] = useState(false);

    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [hiddenNodes, setHiddenNodes] = useState<Set<string>>(new Set());
    const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

    const [selected, setSelected] = useState<RFNode | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId?: string } | null>(null);

    const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>([]);

    const treeRef = useRef<TreeNode | null>(null);
    // Remember last-computed positions so the simulation has a warm start
    // when state changes (avoids the whole graph jumping around).
    const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

    const fetchGraph = useCallback(async () => {
        setError(null);
        try {
            const g = await SupabaseService.getMapperGraph(focusMasterPolicyId || undefined);
            setGraph(g);
        } catch (e: any) {
            setError(e?.message || 'Failed to load graph');
        } finally {
            setLoading(false);
        }
    }, [focusMasterPolicyId]);

    useUnifiedRefresh(isActive, fetchGraph);
    useEffect(() => {
        if (focusMasterPolicyId) onFocusConsumed?.();
    }, [focusMasterPolicyId]);

    // Rebuild on any state change.
    useEffect(() => {
        if (!graph) return;
        const tree = buildTree(graph, hiddenNodes);
        treeRef.current = tree;
        if (!tree) {
            setNodes([]);
            setEdges([]);
            return;
        }

        const coversEdges = graph.edges.filter(e => {
            if (e.label !== 'COVERS') return false;
            const c = e.data?.confidence;
            return showLowConfidence || typeof c !== 'number' || c >= CONF_THRESHOLD;
        });

        const { placed, visibleIds } = runForceLayout(tree, expanded, coversEdges, positionsRef.current);

        // Persist ABSOLUTE positions so the next simulation has a warm start
        // (using relative positions here would break for non-root nodes).
        const nextPositions = new Map<string, { x: number; y: number }>();
        for (const p of placed) nextPositions.set(p.id, p.absolutePosition);
        positionsRef.current = nextPositions;

        // Focus filter
        let allowed: Set<string> | null = null;
        if (focusedNodeId && visibleIds.has(focusedNodeId)) {
            allowed = new Set([focusedNodeId]);
            const adj = new Map<string, Set<string>>();
            for (const e of graph.edges) {
                const a = adj.get(e.source) || new Set<string>();
                a.add(e.target);
                adj.set(e.source, a);
                const b = adj.get(e.target) || new Set<string>();
                b.add(e.source);
                adj.set(e.target, b);
            }
            const stack = [focusedNodeId];
            while (stack.length) {
                const cur = stack.pop()!;
                for (const next of adj.get(cur) || []) {
                    if (!allowed.has(next) && visibleIds.has(next)) {
                        allowed.add(next);
                        stack.push(next);
                    }
                }
            }
        }
        const isAllowed = (id: string) => !allowed || allowed.has(id);

        const rfNodes: RFNode[] = placed
            .filter(p => isAllowed(p.id))
            .map(p => ({
                id: p.id,
                type: p.rfType,
                position: p.position,            // relative to parentId
                parentId: p.parentId,            // makes spokes follow the hub on drag
                data: p.data,
            }));

        // Edges between visible nodes — all use the center handle, so the
        // line is centre-to-centre and visually emerges from the node edge
        // because the colored circle covers the inside part. Arrowhead at
        // the target end.
        const visible = new Set(rfNodes.map(n => n.id));
        const centerHandles = { sourceHandle: 'c-s', targetHandle: 'c-t' };

        const rfEdges: RFEdge[] = [];
        function walkEdges(node: TreeNode) {
            if (!expanded.has(node.id)) return;
            for (const child of node.children) {
                if (visible.has(node.id) && visible.has(child.id)) {
                    const relation = child.rfType === 'hub' ? (child.relation || '') : (node.relation || '');
                    const color = EDGE_COLOR[relation] || '#94a3b8';
                    rfEdges.push({
                        id: `tree:${node.id}->${child.id}`,
                        source: node.id,
                        target: child.id,
                        ...centerHandles,
                        style: { stroke: color, strokeWidth: child.rfType === 'hub' ? 2 : 1.2 },
                        markerEnd: { type: MarkerType.ArrowClosed, color, width: 12, height: 12 },
                    });
                }
                walkEdges(child);
            }
        }
        walkEdges(tree);

        // COVERS cross-links — faint dashed, no arrowhead.
        for (const e of coversEdges) {
            if (!visible.has(e.source) || !visible.has(e.target)) continue;
            rfEdges.push({
                id: e.id,
                source: e.source,
                target: e.target,
                ...centerHandles,
                style: { stroke: EDGE_COLOR.COVERS, strokeWidth: 1, strokeDasharray: '4 3', opacity: 0.45 },
            });
        }

        setNodes(rfNodes);
        setEdges(rfEdges);
    }, [graph, expanded, hiddenNodes, focusedNodeId, showLowConfidence, setNodes, setEdges]);

    // ── Click + context menu handlers ─────────────────────────────────────
    const toggle = useCallback((id: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(id)) { next.delete(id); return next; }
            next.add(id);
            const tree = treeRef.current;
            if (!tree) return next;
            // When opening a non-hub, auto-open immediate hub children so
            // hub + spokes appear together.
            const visit = (n: TreeNode): boolean => {
                if (n.id === id) {
                    if (n.rfType !== 'hub') {
                        for (const c of n.children) if (c.rfType === 'hub') next.add(c.id);
                    }
                    return true;
                }
                for (const c of n.children) if (visit(c)) return true;
                return false;
            };
            visit(tree);
            return next;
        });
    }, []);

    const onNodeClick = useCallback((_: React.MouseEvent, node: RFNode) => {
        toggle(node.id);
        setSelected(node);
    }, [toggle]);

    const onNodeContextMenu = useCallback((event: React.MouseEvent, node: RFNode) => {
        event.preventDefault();
        setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
    }, []);
    const onPaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
        (event as any).preventDefault?.();
        setContextMenu({ x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY });
    }, []);

    const allExpandableIds = useCallback((): string[] => {
        const ids: string[] = [];
        function walk(n: TreeNode) {
            if (n.children.length > 0) ids.push(n.id);
            for (const c of n.children) walk(c);
        }
        if (treeRef.current) walk(treeRef.current);
        return ids;
    }, []);

    const menuItems = useMemo<ContextMenuItem[]>(() => {
        if (!contextMenu) return [];
        if (!contextMenu.nodeId) {
            return [
                { label: 'Expand all',   onClick: () => setExpanded(new Set(allExpandableIds())) },
                { label: 'Collapse all', onClick: () => setExpanded(new Set()) },
                { label: 'Reset view',  onClick: () => { setExpanded(new Set()); setHiddenNodes(new Set()); setFocusedNodeId(null); positionsRef.current = new Map(); }, danger: true },
            ];
        }
        const node = nodes.find(n => n.id === contextMenu.nodeId);
        if (!node) return [];
        const isExpanded = expanded.has(contextMenu.nodeId);
        const items: ContextMenuItem[] = [];
        if ((node.data as any).hasChildren) items.push({ label: isExpanded ? 'Collapse' : 'Expand', onClick: () => toggle(contextMenu.nodeId!) });
        items.push({
            label: focusedNodeId === contextMenu.nodeId ? 'Clear focus' : 'Focus on this node',
            onClick: () => setFocusedNodeId(focusedNodeId === contextMenu.nodeId ? null : contextMenu.nodeId!),
        });
        items.push({ label: 'Show details', onClick: () => setSelected(node) });
        items.push({ label: 'Hide this node', danger: true, onClick: () => setHiddenNodes(prev => new Set(prev).add(contextMenu.nodeId!)) });
        return items;
    }, [contextMenu, nodes, expanded, focusedNodeId, toggle, allExpandableIds]);

    const expandAll = useCallback(() => setExpanded(new Set(allExpandableIds())), [allExpandableIds]);
    const collapseAll = useCallback(() => setExpanded(new Set()), []);
    const resetView = useCallback(() => {
        setExpanded(new Set());
        setHiddenNodes(new Set());
        setFocusedNodeId(null);
        positionsRef.current = new Map();
    }, []);

    const stats = useMemo(() => {
        if (!graph) return null;
        return {
            policies: graph.nodes.filter(n => n.type === 'MasterPolicy' || n.type === 'ChildPolicy' || n.type === 'OrphanPolicy').length,
            objectives: graph.nodes.filter(n => n.type === 'SecurityObjective').length,
            domains: graph.nodes.filter(n => n.type === 'SCFDomain').length,
            orphans: graph.nodes.filter(n => n.type === 'OrphanPolicy').length,
            hidden: hiddenNodes.size,
        };
    }, [graph, hiddenNodes]);

    return (
        <div className="flex flex-col gap-3 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg p-4 -mx-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Mapper Visualizer</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Click any node to expand its children. Drag nodes to rearrange. Force-based clustering arranges everything else automatically.
                    </p>
                </div>
                <div className="flex items-center gap-3 text-xs flex-wrap">
                    {stats && (
                        <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                            <span><strong>{stats.policies}</strong> policies</span>
                            <span><strong>{stats.objectives}</strong> objectives</span>
                            <span><strong>{stats.domains}</strong> SCF domains</span>
                            <span><strong>{stats.orphans}</strong> orphans</span>
                            {stats.hidden > 0 && <span className="text-amber-600 dark:text-amber-400"><strong>{stats.hidden}</strong> hidden</span>}
                            {focusedNodeId && <span className="text-blue-600 dark:text-blue-400">focused</span>}
                        </div>
                    )}
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={showLowConfidence} onChange={e => setShowLowConfidence(e.target.checked)} className="rounded border-gray-300 dark:border-gray-600" />
                        <span className="text-gray-700 dark:text-gray-200">Show low-confidence edges</span>
                    </label>
                    <button onClick={expandAll} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">Expand all</button>
                    <button onClick={collapseAll} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">Collapse all</button>
                    <button onClick={resetView} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">Reset view</button>
                    <button onClick={fetchGraph} className="px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">Refresh</button>
                </div>
            </div>

            {error && (
                <div className="rounded border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 px-3 py-2 text-sm text-red-800 dark:text-red-200">{error}</div>
            )}

            <div className="relative" style={{ height: '70vh', minHeight: 500 }}>
                {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-500">Loading…</div>
                ) : graph && graph.nodes.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
                        No graph yet. Run the Mapper Agent from the Policy tab.
                    </div>
                ) : (
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onNodeClick={onNodeClick}
                        onNodeContextMenu={onNodeContextMenu}
                        onPaneContextMenu={onPaneContextMenu as any}
                        nodeTypes={nodeTypes}
                        nodeOrigin={[0.5, 0.5]}
                        fitView
                        minZoom={0.05}
                        maxZoom={2}
                        colorMode={isDark ? 'dark' : 'light'}
                        defaultEdgeOptions={{ type: 'straight' }}
                        proOptions={{ hideAttribution: true }}
                        style={{ background: isDark ? '#0b1220' : '#f8fafc' }}
                    >
                        <Background gap={20} color={isDark ? '#1e293b' : '#cbd5e1'} />
                        <MiniMap
                            pannable
                            zoomable
                            maskColor={isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)'}
                            style={{ background: isDark ? '#0b1220' : '#f8fafc' }}
                        />
                        <Controls />
                    </ReactFlow>
                )}

                {contextMenu && menuItems.length > 0 && (
                    <MapperContextMenu x={contextMenu.x} y={contextMenu.y} items={menuItems} onClose={() => setContextMenu(null)} />
                )}

                {selected && (
                    <div className="absolute top-2 right-2 w-80 max-h-[60%] overflow-y-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 text-sm">
                        <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                                <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{(selected.data as any).kind || (selected.data as any).relation}</div>
                                <div className="font-semibold text-gray-900 dark:text-white">{(selected.data as any).label}</div>
                            </div>
                            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <dl className="space-y-1">
                            {Object.entries((selected.data as any).raw || {}).map(([k, v]) => (
                                <div key={k} className="flex gap-2">
                                    <dt className="text-gray-500 dark:text-gray-400 min-w-[6.5rem]">{k}</dt>
                                    <dd className="text-gray-800 dark:text-gray-200 break-all">{String(v ?? '—')}</dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                )}
            </div>
        </div>
    );
};
