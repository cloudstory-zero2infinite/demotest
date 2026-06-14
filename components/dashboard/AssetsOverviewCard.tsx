import React, { useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { AssetCriticality } from '../../types';
import { ExpandableChartModal } from '../common/ExpandableChartModal';

interface AssetsOverviewCardProps {
    data: { name: string; value: number }[];
    governedPercent: number;
    filter: AssetCriticality | 'All';
    setFilter: (filter: AssetCriticality | 'All') => void;
}

const COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6'];

export const AssetsOverviewCard: React.FC<AssetsOverviewCardProps> = React.memo(({ data, governedPercent, filter, setFilter }) => {
    const [isExpanded, setIsExpanded] = useState<boolean>(false);
    const total = data.reduce((s, d) => s + d.value, 0);

    return (
        <>
            <div className="p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
                <div className="flex justify-between items-center mb-1">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Assets</h3>
                    <div className="flex items-center gap-2">
                        <select
                            value={filter}
                            onChange={e => setFilter(e.target.value as any)}
                            className="text-[10px] rounded border-gray-200 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 py-0.5 px-1"
                        >
                            <option value="All">All</option>
                            <option value="High">High</option>
                            <option value="Medium">Medium</option>
                            <option value="Low">Low</option>
                        </select>
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
            <div className="relative" style={{ height: '170px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={4} stroke="none">
                            {data.map((_entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px' }} />
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                    <span className="block text-xl font-bold text-gray-800 dark:text-gray-200">{governedPercent.toFixed(0)}%</span>
                    <span className="text-[9px] text-gray-400 uppercase tracking-wider">Governed</span>
                </div>
            </div>
            <div className="flex justify-center gap-3 mt-1">
                {data.map((d, i) => (
                    <span key={d.name} className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        {d.name} ({d.value})
                    </span>
                ))}
            </div>
        </div>

            {/* Expanded Chart Modal */}
            <ExpandableChartModal
                isOpen={isExpanded}
                onClose={() => setIsExpanded(false)}
                title="Assets Overview - Expanded View"
            >
                <div className="h-full flex flex-col">
                    {/* Filter Selection */}
                    <div className="flex justify-center mb-4">
                        <select
                            value={filter}
                            onChange={e => setFilter(e.target.value as any)}
                            className="text-sm rounded-lg border-gray-200 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 py-2 px-4"
                        >
                            <option value="All">All Assets</option>
                            <option value="High">High Criticality</option>
                            <option value="Medium">Medium Criticality</option>
                            <option value="Low">Low Criticality</option>
                        </select>
                    </div>

                    {/* Chart and Details Container */}
                    <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Expanded Pie Chart */}
                        <div className="relative">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={80} outerRadius={120} paddingAngle={4} stroke="none">
                                        {data.map((_entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px' }} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                                <span className="block text-3xl font-bold text-gray-800 dark:text-gray-200">{governedPercent.toFixed(0)}%</span>
                                <span className="text-xs text-gray-400 uppercase tracking-wider">Governed</span>
                            </div>
                        </div>

                        {/* Details Panel */}
                        <div className="space-y-4">
                            {/* Summary Statistics */}
                            <div className="grid grid-cols-3 gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{total}</div>
                                    <div className="text-xs text-gray-600 dark:text-gray-400">Total</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">{governedPercent.toFixed(0)}%</div>
                                    <div className="text-xs text-gray-600 dark:text-gray-400">Governed</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{(total * (1 - governedPercent/100)).toFixed(0)}</div>
                                    <div className="text-xs text-gray-600 dark:text-gray-400">Non-Governed</div>
                                </div>
                            </div>

                            {/* Expanded Asset Details */}
                            <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                                {data.map((d, i) => (
                                    <div key={d.name} className="text-center">
                                        <div className="flex items-center justify-center gap-2 mb-2">
                                            <span className="w-4 h-4 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                            <span className="text-sm font-medium text-gray-900 dark:text-white">{d.name}</span>
                                        </div>
                                        <div className="text-xl font-bold text-gray-900 dark:text-white">{d.value}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                            {total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </ExpandableChartModal>
        </>
    );
});
