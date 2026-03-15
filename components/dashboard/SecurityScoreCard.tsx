import React from 'react';
import { ResponsiveContainer, RadialBarChart, RadialBar } from 'recharts';

interface SecurityScoreCardProps {
    score: number;
}

export const SecurityScoreCard: React.FC<SecurityScoreCardProps> = React.memo(({ score }) => {
    return (
        <div className="md:col-span-2 lg:col-span-3 p-4 bg-white dark:bg-gray-800 rounded-lg shadow flex flex-col items-center justify-center transition-all hover:shadow-md border border-transparent dark:border-gray-700">
             <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">Organisation Security Score</h3>
             <ResponsiveContainer width="100%" height={200}>
                <RadialBarChart innerRadius="70%" outerRadius="100%" data={[{ value: score }]} startAngle={180} endAngle={-180}>
                    <RadialBar dataKey='value' cornerRadius={10} background fill="#3b82f6" />
                    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-4xl font-bold fill-current text-gray-800 dark:text-gray-200">
                        {score}
                    </text>
                    <text x="50%" y="65%" textAnchor="middle" dominantBaseline="middle" className="text-sm fill-current text-gray-500 dark:text-gray-400">
                        / 100
                    </text>
                </RadialBarChart>
            </ResponsiveContainer>
             <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-2 italic px-4">
                Score based on Controls (30%), Program (25%), Vulnerabilities (20%), Assets (15%), and Policies (10%).
             </p>
        </div>
    );
});
