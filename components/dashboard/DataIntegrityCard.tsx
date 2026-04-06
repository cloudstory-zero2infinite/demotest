import React from 'react';
import { Asset } from '../../types';

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
        <div className="p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
            <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Data Integrity</h3>
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ color, backgroundColor: `${color}18` }}>
                    {average}%
                </span>
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
    );
});
