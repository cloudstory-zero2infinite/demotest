

import React, { useState } from 'react';
import { Asset } from '../../types';
import { ExpandableChartModal } from '../common/ExpandableChartModal';
import { RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis } from 'recharts';

interface DataIntegrityCardProps {
    assets: Asset[];
}

function getAssetIntegrityScore(source: string | null | undefined): number {
    const s = (source || '').trim().toLowerCase();
    if (s === 'api') return 100;
    if (s.includes('file upload') || s.includes('csv') || s.includes('import') || s.includes('export')) return 75;
    if (s === 'manual') return 50;
    if (s === 'ai') return 20;
    return 0;
}

function scoreToColor(score: number): string {
    if (score >= 80) return '#22c55e';
    if (score >= 50) return '#84cc16';
    if (score >= 25) return '#f59e0b';
    return '#ef4444';
}

export const DataIntegrityCard: React.FC<DataIntegrityCardProps> = React.memo(({ assets }) => {
    const [isExpanded, setIsExpanded] = useState<boolean>(false);
    const { average, breakdown } = React.useMemo(() => {
        if (assets.length === 0) return { average: 0, breakdown: { ai: 0, manual: 0, api: 0, fileUpload: 0, unknown: 0 } };
        let total = 0;
        const counts = { ai: 0, manual: 0, api: 0, fileUpload: 0, unknown: 0 };
        assets.forEach(a => {
            const s = (a.source || '').trim().toLowerCase();
            total += getAssetIntegrityScore(a.source);
            if (s === 'ai') counts.ai++;
            else if (s === 'manual') counts.manual++;
            else if (s === 'api') counts.api++;
            else if (s.includes('file upload') || s.includes('csv') || s.includes('import') || s.includes('export')) counts.fileUpload++;
            else counts.unknown++;
        });
        return { average: Math.round(total / assets.length), breakdown: counts };
    }, [assets]);

    const color = scoreToColor(average);

    // Gauge arc
    const cx = 100, cy = 85, r = 65;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const arcPath = (from: number, to: number, radius: number) => {
        const x1 = cx + radius * Math.cos(toRad(from));
        const y1 = cy + radius * Math.sin(toRad(from));
        const x2 = cx + radius * Math.cos(toRad(to));
        const y2 = cy + radius * Math.sin(toRad(to));
        const largeArc = Math.abs(to - from) > 180 ? 1 : 0;
        return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
    };
    const filledEndAngle = -180 + (average / 100) * 180;
    const needleAngle = -90 + (average / 100) * 180;
    const needleX = cx + (r - 8) * Math.cos(toRad(needleAngle - 90));
    const needleY = cy + (r - 8) * Math.sin(toRad(needleAngle - 90));

    const sourceItems = [
        { label: 'API', count: breakdown.api, color: '#22c55e' },
        { label: 'File', count: breakdown.fileUpload, color: '#3b82f6' },
        { label: 'Manual', count: breakdown.manual, color: '#f59e0b' },
        { label: 'AI', count: breakdown.ai, color: '#6366f1' },
        { label: 'Other', count: breakdown.unknown, color: '#9ca3af' },
    ];

    return (
        <>
            <div className="p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
                <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Data Integrity</h3>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ color, backgroundColor: `${color}18` }}>
                            {average}%
                        </span>
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

            <div className="flex justify-center" style={{ height: '120px' }}>
                <svg viewBox="0 0 200 100" className="w-44 h-auto">
                    <path d={arcPath(-180, 0, r)} fill="none" stroke="#e5e7eb" strokeWidth={12} strokeLinecap="round" className="dark:stroke-gray-700" />
                    {average > 0 && (
                        <path d={arcPath(-180, filledEndAngle, r)} fill="none" stroke={color} strokeWidth={12} strokeLinecap="round" style={{ transition: 'all 0.6s ease' }} />
                    )}
                    <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={color} strokeWidth={2} strokeLinecap="round" style={{ transition: 'all 0.6s ease' }} />
                    <circle cx={cx} cy={cy} r={4} fill={color} />
                    <text x={cx - r - 5} y={cy + 3} fontSize={7} fill="#9ca3af" textAnchor="middle">0</text>
                    <text x={cx + r + 5} y={cy + 3} fontSize={7} fill="#9ca3af" textAnchor="middle">100</text>
                </svg>
            </div>

            <div className="grid grid-cols-5 gap-1 mt-auto">
                {sourceItems.map(item => (
                    <div key={item.label} className="text-center">
                        <span className="block w-2 h-2 rounded-full mx-auto mb-0.5" style={{ backgroundColor: item.color }} />
                        <div className="text-[9px] text-gray-400 truncate">{item.label}</div>
                        <div className="text-[10px] font-semibold text-gray-600 dark:text-gray-300">{item.count}</div>
                    </div>
                ))}
            </div>
        </div>

            {/* Expanded Chart Modal */}
            <ExpandableChartModal
                isOpen={isExpanded}
                onClose={() => setIsExpanded(false)}
                title="Data Integrity - Expanded View"
            >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Expanded Gauge Chart */}
                    <div className="flex flex-col items-center justify-center">
                        <div className="relative w-full h-[350px] flex items-center justify-center">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadialBarChart 
                                    cx="50%" 
                                    cy="60%" 
                                    innerRadius="60%" 
                                    outerRadius="90%" 
                                    barSize={20}
                                    data={[{ name: 'Score', value: average, fill: color }]}
                                    startAngle={180}
                                    endAngle={0}
                                >
                                    <PolarAngleAxis
                                        type="number"
                                        domain={[0, 100]}
                                        angleAxisId={0}
                                        tick={false}
                                    />
                                    <RadialBar
                                        background
                                        dataKey="value"
                                        cornerRadius={10}
                                        fill={color}
                                    />
                                </RadialBarChart>
                            </ResponsiveContainer>
                            <div className="absolute top-[60%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                                <div className="text-4xl font-bold" style={{ color }}>{average}%</div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">Data Integrity Score</div>
                            </div>
                            <div className="absolute bottom-8 left-0 right-0 flex justify-between text-gray-500 dark:text-gray-400 text-sm px-8">
                                <span>0</span>
                                <span>100</span>
                            </div>
                        </div>
                    </div>

                    {/* Source Details Panel */}
                    <div className="space-y-6">
                        {/* Summary Stats */}
                        <div className="grid grid-cols-2 gap-4 p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                            <div className="text-center">
                                <div className="text-3xl font-bold" style={{ color }}>{average}%</div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">Overall Score</div>
                            </div>
                            <div className="text-center">
                                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{assets.length}</div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">Total Assets</div>
                            </div>
                        </div>

                        {/* Expanded Source Breakdown */}
                        <div className="grid grid-cols-2 gap-4 p-6 bg-gray-50 dark:bg-gray-700 rounded-lg">
                            {sourceItems.map(item => (
                                <div key={item.label} className="text-center">
                                    <div className="flex items-center justify-center mb-2">
                                        <span className="w-4 h-4 rounded-full" style={{ backgroundColor: item.color }} />
                                    </div>
                                    <div className="text-sm font-medium text-gray-900 dark:text-white mb-1">{item.label}</div>
                                    <div className="text-xl font-bold text-gray-900 dark:text-white">{item.count}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">assets</div>
                                    <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                                        {assets.length > 0 ? ((item.count / assets.length) * 100).toFixed(1) : 0}%
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                    {/* Detailed Source Analysis */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                            <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Source Quality Analysis</h4>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">API Sources</span>
                                    <span className="text-sm font-bold text-green-600">{breakdown.api} assets (100% integrity)</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">File Uploads</span>
                                    <span className="text-sm font-bold text-blue-600">{breakdown.fileUpload} assets (75% integrity)</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">Manual Entry</span>
                                    <span className="text-sm font-bold text-amber-600">{breakdown.manual} assets (50% integrity)</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">AI Generated</span>
                                    <span className="text-sm font-bold text-indigo-600">{breakdown.ai} assets (20% integrity)</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">Other Sources</span>
                                    <span className="text-sm font-bold text-gray-600">{breakdown.unknown} assets (0% integrity)</span>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                            <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Integrity Recommendations</h4>
                            <div className="space-y-3">
                                <div className={`p-3 rounded-lg ${average >= 80 ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-gray-50 dark:bg-gray-700'}`}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className={`w-3 h-3 rounded-full ${average >= 80 ? 'bg-green-500' : 'bg-gray-400'}`} />
                                        <span className="text-sm font-medium text-gray-900 dark:text-white">Overall Health</span>
                                    </div>
                                    <p className="text-xs text-gray-600 dark:text-gray-400">
                                        {average >= 80 ? 'Excellent data integrity with reliable sources' :
                                         average >= 60 ? 'Good data integrity with room for improvement' :
                                         average >= 40 ? 'Fair data integrity, consider source optimization' :
                                         'Poor data integrity, immediate attention needed'}
                                    </p>
                                </div>
                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="w-3 h-3 rounded-full bg-blue-500" />
                                        <span className="text-sm font-medium text-gray-900 dark:text-white">Best Practice</span>
                                    </div>
                                    <p className="text-xs text-gray-600 dark:text-gray-400">
                                        Prioritize API integrations for highest data integrity
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
            </ExpandableChartModal>
        </>
    );
});
