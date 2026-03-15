import React, { useState, useEffect, useRef } from 'react';
import * as SupabaseService from '../../services/supabase';

interface GraphNode {
  id: string;
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GraphLink {
  source: string;
  target: string;
  label: string;
}

const CyberGraph: React.FC<{ data: { nodes: any[], links: GraphLink[] } }> = ({ data }) => {
  const canvasRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const width = 800;
  const height = 600;

  useEffect(() => {
    const initialNodes: GraphNode[] = data.nodes.map((n) => ({
        ...(n as any),
        x: width / 2 + (Math.random() - 0.5) * 400,
        y: height / 2 + (Math.random() - 0.5) * 400,
        vx: 0,
        vy: 0
    } as GraphNode));
    setNodes(initialNodes);
    setLinks(data.links);
  }, [data]);

  useEffect(() => {
    let animationFrameId: number;
    const simulate = () => {
      setNodes(prevNodes => {
        const nextNodes = prevNodes.map(n => ({ ...n }));
        const nodeMap = new Map<string, GraphNode>(nextNodes.map(n => [n.id, n] as [string, GraphNode]));

        const k = 0.05; // attraction
        const r = 1000; // repulsion
        const centerK = 0.01;

        for (let i = 0; i < nextNodes.length; i++) {
          for (let j = i + 1; j < nextNodes.length; j++) {
            const dx = nextNodes[i].x - nextNodes[j].x;
            const dy = nextNodes[i].y - nextNodes[j].y;
            const distSq = dx * dx + dy * dy + 0.1;
            const dist = Math.sqrt(distSq);
            if (dist < 200) {
              const force = r / distSq;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;
              nextNodes[i].vx += fx;
              nextNodes[i].vy += fy;
              nextNodes[j].vx -= fx;
              nextNodes[j].vy -= fy;
            }
          }
        }

        links.forEach((l: GraphLink) => {
            const s = nodeMap.get(l.source);
            const t = nodeMap.get(l.target);
            if (s && t) {
                const dx = t.x - s.x;
                const dy = t.y - s.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
                const force = (dist - 100) * k;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                s.vx += fx;
                s.vy += fy;
                t.vx -= fx;
                t.vy -= fy;
            }
        });

        nextNodes.forEach(n => {
          n.vx += (width / 2 - n.x) * centerK;
          n.vy += (height / 2 - n.y) * centerK;
          n.vx *= 0.9;
          n.vy *= 0.9;
          n.x += n.vx;
          n.y += n.vy;
          n.x = Math.max(20, Math.min(width - 20, n.x));
          n.y = Math.max(20, Math.min(height - 20, n.y));
        });

        return nextNodes;
      });
      animationFrameId = requestAnimationFrame(simulate);
    };

    if (nodes.length > 0) {
      animationFrameId = requestAnimationFrame(simulate);
    }
    return () => cancelAnimationFrame(animationFrameId);
  }, [links, nodes.length]);

  return (
    <div className="w-full h-full relative overflow-hidden bg-white rounded-lg">
      <svg ref={canvasRef} viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="15" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#cbd5e1" />
          </marker>
        </defs>
        {links.map((link, i) => {
          const s = nodes.find(n => n.id === link.source);
          const t = nodes.find(n => n.id === link.target);
          if (!s || !t) return null;
          return (
            <g key={i}>
              <line x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="#e2e8f0" strokeWidth="1" markerEnd="url(#arrowhead)" />
            </g>
          );
        })}
        {nodes.map((node, i) => (
          <g key={i} className="cursor-pointer group">
            <circle cx={node.x} cy={node.y} r="8" fill="#3b82f6" className="transition-all duration-200 group-hover:scale-125" />
            <text x={node.x} y={node.y - 12} textAnchor="middle" className="text-[10px] font-bold fill-gray-600 group-hover:fill-blue-600 pointer-events-none drop-shadow-sm select-none">
              {node.id}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};

export const ThreatViewTab: React.FC = () => {
    const [csvData, setCsvData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [systemMsg, setSystemMsg] = useState({ text: 'Select filters and launch an orbit.', color: 'text-green-600 dark:text-green-400' });
    const [filters, setFilters] = useState({ source_type: 'campaign', relationship_type: 'uses', target_type: 'malware' });
    const [graphData, setGraphData] = useState<{ nodes: any[], links: any[] } | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                let csvUrl = '';
                try {
                    csvUrl = await SupabaseService.createSignedUrl('ThreatData', 'df33.csv', 60 * 60);
                } catch (err) {
                    console.error('Failed to get signed URL for ThreatData/df33.csv', err);
                    try {
                        csvUrl = SupabaseService.getStoragePublicUrl('ThreatData', 'df33.csv');
                    } catch (e) {
                        console.error('Failed to get public URL for ThreatData/df33.csv', e);
                    }
                }

                if (!csvUrl) {
                    setCsvData([]);
                    setLoading(false);
                    return;
                }

                const res = await fetch(csvUrl);
                const text = await res.text();
                const lines = text.split('\n');
                const headers = lines[0].split(',').map(h => h.trim());
                const parsed = lines.slice(1).map(line => {
                    const values = line.split(',');
                    const obj: any = {};
                    headers.forEach((h, i) => obj[h] = values[i]?.trim());
                    return obj;
                }).filter(row => row.source_ref);
                setCsvData(parsed);
                setLoading(false);
            } catch (err) {
                console.error("CSV Load Error:", err);
                setSystemMsg({ text: 'Failed to load MITRE dataset.', color: 'text-red-600 dark:text-red-500' });
            }
        };
        fetchData();
    }, []);

    const launchOrbit = (f: typeof filters) => {
        setSystemMsg({ text: 'Satellite is launching...', color: 'text-yellow-600 dark:text-yellow-400' });
        
        const filtered = csvData.filter(row => 
            row.source_ref_type === f.source_type &&
            row.relationship_type === f.relationship_type &&
            row.target_ref_type === f.target_type
        ).slice(0, 150);

        if (filtered.length === 0) {
            setSystemMsg({ text: 'No relationships found with the selected criteria.', color: 'text-red-600 dark:text-red-400' });
            setGraphData(null);
            return;
        }

        const nodesMap = new Map();
        const links: any[] = [];

        filtered.forEach(row => {
            if (!nodesMap.has(row.source_ref)) nodesMap.set(row.source_ref, { id: row.source_ref, type: row.source_ref_type });
            if (!nodesMap.has(row.target_ref)) nodesMap.set(row.target_ref, { id: row.target_ref, type: row.target_ref_type });
            links.push({ source: row.source_ref, target: row.target_ref, label: row.relationship_type });
        });

        setGraphData({ nodes: Array.from(nodesMap.values()), links });
        setSystemMsg({ text: 'Orbit stable. Visualization loaded!', color: 'text-green-600 dark:text-green-400' });
    };

    return (
        <div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white p-6 rounded-xl min-h-[800px] border border-gray-200 dark:border-gray-700 font-sans shadow-lg mt-6">
            <h1 className="text-3xl font-black mb-8 text-center bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent uppercase tracking-tight">
                MITRE ATT&CK Cyber Space Explorer
            </h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full">
                <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm flex flex-col gap-6">
                    <div className="space-y-4">
                            <h2 className="text-sm font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-2">Configuration</h2>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-gray-400 dark:text-gray-500 mb-1">Source Type</label>
                                    <select 
                                        className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white shadow-sm"
                                        value={filters.source_type}
                                        onChange={e => setFilters({...filters, source_type: e.target.value})}
                                    >
                                        {['malware', 'course-of-action', 'x-mitre-tactic', 'attack-pattern', 'intrusion-set', 'campaign'].map(v => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1).replace(/-/g, ' ')}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-gray-400 dark:text-gray-500 mb-1">Relationship</label>
                                    <select 
                                        className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white shadow-sm"
                                        value={filters.relationship_type}
                                        onChange={e => setFilters({...filters, relationship_type: e.target.value})}
                                    >
                                        {['uses', 'detects', 'mitigates'].map(v => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-gray-400 dark:text-gray-500 mb-1">Target Type</label>
                                    <select 
                                        className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white shadow-sm"
                                        value={filters.target_type}
                                        onChange={e => setFilters({...filters, target_type: e.target.value})}
                                    >
                                        {['malware', 'course-of-action', 'x-mitre-tactic', 'attack-pattern', 'intrusion-set', 'campaign'].map(v => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1).replace(/-/g, ' ')}</option>)}
                                    </select>
                                </div>
                            </div>
                            <button 
                                onClick={() => launchOrbit(filters)}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest py-3.5 rounded-lg transition-all shadow-lg hover:shadow-blue-500/20 mt-4 active:scale-[0.98]"
                            >
                                Launch Orbit
                            </button>
                        </div>
                    <div className={`mt-auto text-center font-black text-[10px] uppercase tracking-widest ${systemMsg.color} border-t border-gray-100 dark:border-gray-600 pt-4 animate-pulse`}>
                        {systemMsg.text}
                    </div>
                </div>

                <div className="lg:col-span-2 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm relative flex flex-col overflow-hidden">
                    <div className="bg-gray-100 dark:bg-gray-800 p-3.5 flex justify-between items-center border-b border-gray-200 dark:border-gray-700">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Cyber Visualization Viewer</span>
                        <div className="flex gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-400/50"></div>
                            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/50"></div>
                            <div className="w-2.5 h-2.5 rounded-full bg-green-400/50"></div>
                        </div>
                    </div>
                    
                    <div className="flex-grow bg-white dark:bg-gray-900 relative overflow-hidden flex items-center justify-center shadow-inner">
                        {!graphData && !loading && (
                            <div className="text-gray-200 dark:text-gray-800 text-center uppercase tracking-tighter opacity-80 text-5xl font-black italic select-none">
                                Waiting for Signal
                            </div>
                        )}
                        {loading && (
                            <div className="flex flex-col items-center">
                                <div className="w-10 h-10 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                <span className="mt-4 text-[10px] font-black uppercase tracking-[0.3em] text-blue-600 dark:text-blue-400">Decrypting Dataset...</span>
                            </div>
                        )}
                        {graphData && (
                            <CyberGraph data={graphData} />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
