import React from 'react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

interface ScoreBreakdown {
    total: number;
    controls: number;
    program: number;
    vulnerabilities: number;
    assets: number;
    policies: number;
    hasData: boolean;
}

interface SecurityScoreCardProps {
    scoreBreakdown: ScoreBreakdown;
}

const CATEGORY_META: { key: keyof ScoreBreakdown; label: string; max: number }[] = [
    { key: 'controls', label: 'Controls', max: 30 },
    { key: 'program', label: 'Program', max: 25 },
    { key: 'vulnerabilities', label: 'Vulns', max: 20 },
    { key: 'assets', label: 'Assets', max: 15 },
    { key: 'policies', label: 'Policies', max: 10 },
];

const getScoreColor = (score: number) => {
    if (score >= 80) return { fill: '#10b981', stroke: '#059669', label: 'Excellent', bg: 'from-emerald-500/10 to-emerald-500/5' };
    if (score >= 60) return { fill: '#0ea5e9', stroke: '#0284c7', label: 'Good', bg: 'from-sky-500/10 to-sky-500/5' };
    if (score >= 40) return { fill: '#f59e0b', stroke: '#d97706', label: 'Fair', bg: 'from-amber-500/10 to-amber-500/5' };
    if (score >= 20) return { fill: '#f97316', stroke: '#ea580c', label: 'Poor', bg: 'from-orange-500/10 to-orange-500/5' };
    return { fill: '#ef4444', stroke: '#dc2626', label: 'Critical', bg: 'from-red-500/10 to-red-500/5' };
};

export const SecurityScoreCard: React.FC<SecurityScoreCardProps> = React.memo(({ scoreBreakdown }) => {
    const score = scoreBreakdown.total;
    const { fill, stroke, label, bg } = getScoreColor(score);

    if (!scoreBreakdown.hasData || score === undefined || score === null) {
        return (
            <div className="p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm flex flex-col items-center justify-center border border-gray-100 dark:border-gray-700 min-h-[280px]">
                 <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Security Score</h3>
                 <div className="text-4xl font-bold text-gray-300">--</div>
                 <div className="text-xs text-gray-400 mt-1">No data</div>
            </div>
        );
    }

    const radarData = CATEGORY_META.map(({ key, label, max }) => ({
        category: label,
        value: max > 0 ? Math.round(((scoreBreakdown[key] as number) / max) * 100) : 0,
    }));

    return (
        <div className={`p-3 bg-gradient-to-br ${bg} bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col`}>
             <div className="flex items-center justify-between mb-1">
                 <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Security Score</h3>
                 <div className="flex items-baseline gap-1">
                     <span className="text-2xl font-bold" style={{ color: stroke }}>{score}</span>
                     <span className="text-[10px] font-medium" style={{ color: stroke }}>{label}</span>
                 </div>
             </div>

             <div className="relative flex-1 min-h-0" style={{ height: '180px' }}>
                 <ResponsiveContainer width="100%" height="100%">
                     <RadarChart cx="50%" cy="50%" outerRadius="68%" data={radarData}>
                         <PolarGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                         <PolarAngleAxis dataKey="category" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                         <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                         <Radar dataKey="value" stroke={stroke} fill={fill} fillOpacity={0.25} strokeWidth={2} />
                     </RadarChart>
                 </ResponsiveContainer>
             </div>

             <div className="grid grid-cols-5 gap-1 mt-1">
                {CATEGORY_META.map(({ key, label, max }) => (
                    <div key={key} className="text-center">
                        <div className="text-[10px] text-gray-400 truncate">{label}</div>
                        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">{scoreBreakdown[key] as number}<span className="text-gray-400 font-normal">/{max}</span></div>
                    </div>
                ))}
             </div>
        </div>
    );
});
