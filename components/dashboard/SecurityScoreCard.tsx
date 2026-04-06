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
    { key: 'vulnerabilities', label: 'Vulnerabilities', max: 20 },
    { key: 'assets', label: 'Assets', max: 15 },
    { key: 'policies', label: 'Policies', max: 10 },
];

const getScoreColor = (score: number) => {
    if (score >= 80) return { fill: '#10b981', stroke: '#059669', label: 'Excellent' };
    if (score >= 60) return { fill: '#0ea5e9', stroke: '#0284c7', label: 'Good' };
    if (score >= 40) return { fill: '#f59e0b', stroke: '#d97706', label: 'Fair' };
    if (score >= 20) return { fill: '#f97316', stroke: '#ea580c', label: 'Poor' };
    return { fill: '#ef4444', stroke: '#dc2626', label: 'Critical' };
};

export const SecurityScoreCard: React.FC<SecurityScoreCardProps> = React.memo(({ scoreBreakdown }) => {
    const score = scoreBreakdown.total;
    const { fill, stroke, label } = getScoreColor(score);

    if (!scoreBreakdown.hasData || score === undefined || score === null) {
        return (
            <div className="md:col-span-2 lg:col-span-3 p-4 bg-white dark:bg-gray-800 rounded-lg shadow flex flex-col items-center justify-center transition-all hover:shadow-md border border-transparent dark:border-gray-700">
                 <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">Organisation Security Score</h3>
                 <div className="flex flex-col items-center justify-center" style={{ height: '200px' }}>
                     <div className="text-6xl font-bold text-gray-400">--</div>
                     <div className="text-sm text-gray-500 mt-2">No Data Available</div>
                 </div>
                 <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-2 italic px-4">
                    Add GRC data to see security score calculation
                 </p>
            </div>
        );
    }

    // Normalize each category to 0–100 scale for the radar chart
    const radarData = CATEGORY_META.map(({ key, label, max }) => ({
        category: label,
        value: max > 0 ? Math.round(((scoreBreakdown[key] as number) / max) * 100) : 0,
        raw: scoreBreakdown[key] as number,
        max,
    }));

    return (
        <div className="md:col-span-2 lg:col-span-3 p-4 bg-white dark:bg-gray-800 rounded-lg shadow flex flex-col items-center justify-center transition-all hover:shadow-md border border-transparent dark:border-gray-700">
             <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">Organisation Security Score</h3>

             {/* Spider chart with centered score */}
             <div className="relative w-full" style={{ height: '240px' }}>
                 <ResponsiveContainer width="100%" height="100%">
                     <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                         <PolarGrid stroke="#d1d5db" strokeDasharray="3 3" />
                         <PolarAngleAxis
                             dataKey="category"
                             tick={{ fill: '#6b7280', fontSize: 11 }}
                         />
                         <PolarRadiusAxis
                             angle={90}
                             domain={[0, 100]}
                             tick={false}
                             axisLine={false}
                         />
                         <Radar
                             dataKey="value"
                             stroke={stroke}
                             fill={fill}
                             fillOpacity={0.3}
                             strokeWidth={2}
                         />
                     </RadarChart>
                 </ResponsiveContainer>

                 {/* Centered score overlay */}
                 <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                     <span className="text-3xl font-bold" style={{ color: stroke }}>{score}</span>
                     <span className="text-xs font-medium" style={{ color: stroke }}>{label}</span>
                 </div>
             </div>

             {/* Score Breakdown */}
             <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 space-y-1 px-4 w-full">
                {CATEGORY_META.map(({ key, label, max }) => (
                    <div key={key} className="flex justify-between">
                        <span>{label} ({max}%)</span>
                        <span className="font-medium">{scoreBreakdown[key] as number}/{max}</span>
                    </div>
                ))}
             </div>

             <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-2 italic px-4">
                Real-time security posture based on actual GRC data
             </p>
        </div>
    );
});
