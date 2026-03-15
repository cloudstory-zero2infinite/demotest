import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

interface ProgramStatusCardProps {
    data: { name: string; value: number }[];
}

export const ProgramStatusCard: React.FC<ProgramStatusCardProps> = React.memo(({ data }) => {
    return (
        <div className="md:col-span-2 lg:col-span-3 p-4 bg-white dark:bg-gray-800 rounded-lg shadow transition-all hover:shadow-md border border-transparent dark:border-gray-700">
             <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">Program Status</h3>
            <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30, top: 10, bottom: 10 }}>
                        <XAxis type="number" hide />
                        <YAxis 
                            type="category" 
                            dataKey="name" 
                            width={100} 
                            stroke="#6b7280" 
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                        />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#1f2937', color: '#fff', border: 'none', borderRadius: '8px' }}
                            itemStyle={{ color: '#60a5fa' }}
                        />
                        <Bar dataKey="value" fill="#3b82f6" barSize={15} radius={[0, 4, 4, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
});
