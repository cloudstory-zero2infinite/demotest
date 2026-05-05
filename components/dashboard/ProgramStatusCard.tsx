import React, { useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { ExpandableChartModal } from '../common/ExpandableChartModal';

interface ProgramStatusCardProps {
    data: { name: string; value: number }[];
}

const STATUS_COLORS: Record<string, string> = {
    Completed: '#10b981',
    Planned: '#8b5cf6',
    Blocked: '#f43f5e',
    InProgress: '#0ea5e9',
};

const LABEL_MAP: Record<string, string> = {
    InProgress: 'In Progress',
};

export const ProgramStatusCard: React.FC<ProgramStatusCardProps> = React.memo(({ data }) => {
    const [isExpanded, setIsExpanded] = useState<boolean>(false);
    const coloredData = data.map(d => ({ ...d, fill: STATUS_COLORS[d.name] || '#3b82f6' }));
    const total = data.reduce((s, d) => s + d.value, 0);

    return (
        <>
            <div className="p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Program Status</h3>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{total} milestones</span>
                        <button
                            onClick={() => setIsExpanded(true)}
                            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            aria-label="Expand chart"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                            </svg>
                        </button>
                    </div>
                </div>

            {/* Mini stat pills */}
            <div className="flex flex-wrap gap-1.5 mb-3">
                {coloredData.map(d => (
                    <span key={d.name} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: `${d.fill}15`, color: d.fill }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: d.fill }} />
                        {LABEL_MAP[d.name] || d.name} {d.value}
                    </span>
                ))}
            </div>

            <div className="flex-1 min-h-0" style={{ height: '180px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={coloredData} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={80} stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} tickFormatter={v => LABEL_MAP[v] || v} />
                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px' }} />
                        <Bar dataKey="value" barSize={14} radius={[0, 6, 6, 0]}>
                            {coloredData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>

            {/* Expanded Chart Modal */}
            <ExpandableChartModal
                isOpen={isExpanded}
                onClose={() => setIsExpanded(false)}
                title="Program Status - Expanded View"
            >
                <div className="space-y-6">
                    {/* Expanded Chart */}
                    <div className="h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={coloredData} layout="vertical" margin={{ left: 120, right: 40, top: 20, bottom: 20 }}>
                                <XAxis type="number" stroke="#6b7280" fontSize={14} />
                                <YAxis type="category" dataKey="name" width={120} stroke="#6b7280" fontSize={16} tickLine={false} axisLine={false} tickFormatter={v => LABEL_MAP[v] || v} />
                                <Tooltip contentStyle={{ backgroundColor: '#1f2937', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px' }} />
                                <Bar dataKey="value" barSize={24} radius={[0, 8, 8, 0]}>
                                    {coloredData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Expanded Summary Statistics */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-6 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        {coloredData.map(d => (
                            <div key={d.name} className="text-center">
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{LABEL_MAP[d.name] || d.name}</p>
                                <p className="text-2xl font-bold" style={{ color: d.fill }}>{d.value}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </ExpandableChartModal>
        </>
    );
});
