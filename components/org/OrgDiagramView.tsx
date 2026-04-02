import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Asset, AssetRelationship } from '../../types';
import * as SupabaseService from '../../services/supabase';

// --- ORGANISATION: VIEW YOUR ORG ---

const GROUP_BY_OPTIONS: { value: keyof Asset; label: string }[] = [
    { value: 'category', label: 'Category' },
    { value: 'exposure', label: 'Exposure' },
    { value: 'business_unit', label: 'Business Unit' },
    { value: 'physical_location', label: 'Location' },
    { value: 'criticality', label: 'Criticality' },
];

function buildMermaidCode(assets: Asset[], relationships: AssetRelationship[], groupBy: keyof Asset): string {
    if (assets.length === 0) return 'flowchart LR\n    empty["No assets found"]';

    // Prefix with 'n' so IDs never start with a digit; strip all non-alphanumeric
    const safeId = (s: string) => 'n' + s.replace(/[^a-zA-Z0-9]/g, '_');
    // For node labels in quotes: escape inner quotes and strip newlines
    const safeLabel = (s: string) => s.replace(/"/g, "'").replace(/\r?\n/g, ' ');
    // For edge labels (between pipes): strip pipes, quotes, and brackets
    const safeEdgeLabel = (s: string) => s.replace(/[|"<>[\]{}]/g, '').trim();

    const groups = new Map<string, Asset[]>();
    assets.forEach(asset => {
        const val = String(asset[groupBy] || 'Unknown').trim() || 'Unknown';
        if (!groups.has(val)) groups.set(val, []);
        groups.get(val)!.push(asset);
    });

    const lines: string[] = ['flowchart LR'];
    groups.forEach((groupAssets, groupName) => {
        const sgId = 'sg_' + groupName.replace(/[^a-zA-Z0-9]/g, '_');
        lines.push(`    subgraph ${sgId}["${safeLabel(groupName)}"]`);
        groupAssets.forEach(asset => {
            lines.push(`        ${safeId(asset.asset_id)}["${safeLabel(asset.name)}"]`);
        });
        lines.push('    end');
        lines.push('');
    });

    relationships.forEach(rel => {
        const src = safeId(rel.source_asset_id);
        const tgt = safeId(rel.target_asset_id);
        if (rel.relationship_type) {
            const lbl = safeEdgeLabel(rel.relationship_type);
            lines.push(`    ${src} -->|${lbl}| ${tgt}`);
        } else {
            lines.push(`    ${src} --> ${tgt}`);
        }
    });

    return lines.join('\n');
}

const OrgDiagramView: React.FC = () => {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [relationships, setRelationships] = useState<AssetRelationship[]>([]);
    const [groupBy, setGroupBy] = useState<keyof Asset>('category');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [scale, setScale] = useState(1);
    const [translate, setTranslate] = useState({ x: 20, y: 20 });
    const [isDragging, setIsDragging] = useState(false);
    const lastPos = useRef({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);
    const mermaidRef = useRef<HTMLDivElement>(null);
    const renderIdRef = useRef(0);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                setError(null);
                const [a, r] = await Promise.all([
                    SupabaseService.getAssets(),
                    SupabaseService.getAssetRelationships(),
                ]);
                setAssets(a);
                setRelationships(r);
            } catch (err) {
                console.error('Error loading from API:', err);
                setError('Failed to load organization data. Please try again.');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const filteredRelationships = useMemo(() => {
        const validIds = new Set(assets.map(a => a.asset_id));
        return relationships.filter(r => validIds.has(r.source_asset_id) && validIds.has(r.target_asset_id));
    }, [assets, relationships]);

    const mermaidCode = useMemo(
        () => buildMermaidCode(assets, filteredRelationships, groupBy),
        [assets, filteredRelationships, groupBy]
    );

    useEffect(() => {
        if (!mermaidCode || !mermaidRef.current) return;
        const el = mermaidRef.current;

        const renderDiagram = async () => {
            try {
                const { default: mermaid } = await import('mermaid');
                const isDark = document.documentElement.classList.contains('dark');

                mermaid.initialize({
                    startOnLoad: false,
                    theme: isDark ? 'dark' : 'default',
                    securityLevel: 'loose',
                    flowchart: { useMaxWidth: false, htmlLabels: true, curve: 'basis' },
                });

                // Use mermaid.run() on a temporary pre element — most reliable in v10/v11
                const container = document.createElement('div');
                container.style.position = 'absolute';
                container.style.visibility = 'hidden';
                document.body.appendChild(container);

                const pre = document.createElement('pre');
                pre.className = 'mermaid';
                pre.textContent = mermaidCode;
                container.appendChild(pre);

                await mermaid.run({ nodes: [pre], suppressErrors: false });

                const svgEl = container.querySelector('svg');
                if (svgEl && el === mermaidRef.current) {
                    svgEl.style.maxWidth = 'none';
                    el.innerHTML = '';
                    el.appendChild(svgEl);
                }

                document.body.removeChild(container);
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error('Mermaid render error:', msg);
                if (el === mermaidRef.current) {
                    el.innerHTML = `<pre style="color:#ef4444;padding:12px;font-size:11px;white-space:pre-wrap;max-width:600px">${msg}</pre>`;
                }
            }
        };

        renderDiagram();
    }, [mermaidCode]);

    // Wheel zoom — attached via addEventListener to allow preventDefault
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            setScale(prev => Math.min(Math.max(prev - e.deltaY * 0.0008, 0.15), 5));
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        setIsDragging(true);
        lastPos.current = { x: e.clientX, y: e.clientY };
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDragging) return;
        const dx = e.clientX - lastPos.current.x;
        const dy = e.clientY - lastPos.current.y;
        lastPos.current = { x: e.clientX, y: e.clientY };
        setTranslate(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    };

    const handlePointerUp = () => setIsDragging(false);

    const resetView = () => { setScale(1); setTranslate({ x: 20, y: 20 }); };

    return (
        <div className="flex flex-col h-screen">
            {/* Toolbar */}
            <div className="flex items-center gap-3 mb-3 p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Group by:</label>
                <select
                    value={groupBy}
                    onChange={e => setGroupBy(e.target.value as keyof Asset)}
                    className="rounded-md border-gray-300 shadow-sm text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white py-1 px-2"
                >
                    {GROUP_BY_OPTIONS.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
                </select>

                <div className="ml-auto flex items-center gap-2">
                    <button onClick={() => setScale(s => Math.min(s + 0.15, 5))} className="w-8 h-8 flex items-center justify-center text-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-200 font-bold">+</button>
                    <span className="text-sm text-gray-500 dark:text-gray-400 w-14 text-center tabular-nums">{Math.round(scale * 100)}%</span>
                    <button onClick={() => setScale(s => Math.max(s - 0.15, 0.15))} className="w-8 h-8 flex items-center justify-center text-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-200 font-bold">−</button>
                    <button onClick={resetView} className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-300">Reset</button>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">Scroll to zoom · Drag to pan</p>
            </div>

            {/* Canvas */}
            {loading ? (
                <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950">Loading org diagram...</div>
            ) : error ? (
                <div className="flex-1 flex items-center justify-center text-red-500 bg-white dark:bg-gray-950">{error}</div>
            ) : (
                <div
                    ref={containerRef}
                    className="flex-1 overflow-hidden border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 select-none"
                    style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                >
                    <div
                        style={{
                            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
                            transformOrigin: '0 0',
                            display: 'inline-block',
                            willChange: 'transform',
                        }}
                    >
                        <div ref={mermaidRef} />
                    </div>
                </div>
            )}
        </div>
    );
};

export { OrgDiagramView };
