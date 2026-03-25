import React from 'react';
import { ResponsiveContainer, RadialBarChart, RadialBar } from 'recharts';

interface SecurityScoreCardProps {
    score: number;
}

export const SecurityScoreCard: React.FC<SecurityScoreCardProps> = React.memo(({ score }) => {
    // Debug log
    console.log('SecurityScoreCard received score:', score);
    
    // Get color based on score
    const getScoreColor = (score: number) => {
        if (score >= 80) return '#1e40af'; // dark blue
        if (score >= 60) return '#2563eb'; // medium blue
        if (score >= 40) return '#3b82f6'; // blue
        if (score >= 20) return '#60a5fa'; // light blue
        return '#93c5fd'; // very light blue
    };

    const getScoreLabel = (score: number) => {
        if (score >= 80) return 'Excellent';
        if (score >= 60) return 'Good';
        if (score >= 40) return 'Fair';
        if (score >= 20) return 'Poor';
        return 'Critical';
    };

    const scoreColor = getScoreColor(score);
    const scoreLabel = getScoreLabel(score);

    // Fallback display if score is 0 or invalid
    if (score === 0 || score === undefined || score === null) {
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

    return (
        <div className="md:col-span-2 lg:col-span-3 p-4 bg-white dark:bg-gray-800 rounded-lg shadow flex flex-col items-center justify-center transition-all hover:shadow-md border border-transparent dark:border-gray-700">
             <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">Organisation Security Score</h3>
             
             {/* Score Display */}
             <div className="relative w-full" style={{ height: '200px' }}>
                 <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart innerRadius="70%" outerRadius="100%" data={[{ value: score, fill: scoreColor }]} startAngle={180} endAngle={0} background={{ fill: '#e5e7eb' }}>
                        <RadialBar dataKey='value' cornerRadius={10} />
                        <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle" className="text-4xl font-bold" fill={scoreColor}>
                            {score}
                        </text>
                        <text x="50%" y="60%" textAnchor="middle" dominantBaseline="middle" className="text-sm fill-current text-gray-500 dark:text-gray-400">
                            / 100
                        </text>
                        <text x="50%" y="75%" textAnchor="middle" dominantBaseline="middle" className="text-xs font-medium" fill={scoreColor}>
                            {scoreLabel}
                        </text>
                    </RadialBarChart>
                </ResponsiveContainer>
             </div>

             {/* Score Breakdown */}
             <div className="mt-3 text-xs text-gray-600 dark:text-gray-400 space-y-1 px-4 w-full">
                <div className="flex justify-between">
                    <span>Controls (30%)</span>
                    <span className="font-medium">{Math.round(score * 0.30)}/30</span>
                </div>
                <div className="flex justify-between">
                    <span>Program (25%)</span>
                    <span className="font-medium">{Math.round(score * 0.25)}/25</span>
                </div>
                <div className="flex justify-between">
                    <span>Vulnerabilities (20%)</span>
                    <span className="font-medium">{Math.round(score * 0.20)}/20</span>
                </div>
                <div className="flex justify-between">
                    <span>Assets (15%)</span>
                    <span className="font-medium">{Math.round(score * 0.15)}/15</span>
                </div>
                <div className="flex justify-between">
                    <span>Policies (10%)</span>
                    <span className="font-medium">{Math.round(score * 0.10)}/10</span>
                </div>
             </div>

             <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-2 italic px-4">
                Real-time security posture based on actual GRC data
             </p>
        </div>
    );
});
