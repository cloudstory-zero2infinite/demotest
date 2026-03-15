import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

interface CapabilityMappingCardProps {
    data: { name: string; value: number }[];
    enforcedPercent: number;
}

export const CapabilityMappingCard: React.FC<CapabilityMappingCardProps> = React.memo(({ data, enforcedPercent }) => {
    return (
        <div className="md:col-span-2 lg:col-span-2 p-4 bg-white dark:bg-gray-800 rounded-lg shadow transition-all hover:shadow-md border border-transparent dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">Capability Mapping</h3>
            <div className="h-[250px] relative">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie 
                            data={data} 
                            dataKey="value" 
                            nameKey="name" 
                            cx="50%" 
                            cy="50%" 
                            innerRadius={60} 
                            outerRadius={80} 
                            paddingAngle={5}
                            stroke="none"
                        >
                            {data.map((entry) => {
                                let color = '#6b7280';
                                if (entry.name === 'Enforced') color = '#10b981';
                                if (entry.name === 'InProgress') color = '#f59e0b';
                                if (entry.name === 'Not-Enforced') color = '#ef4444';
                                return <Cell key={`cell-${entry.name}`} fill={color} />;
                            })}
                        </Pie>
                        <Tooltip />
                        <Legend verticalAlign="bottom" height={36}/>
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                    <span className="block text-2xl font-bold text-gray-800 dark:text-gray-200">{`${enforcedPercent.toFixed(0)}%`}</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-tight">Enforced</span>
                </div>
            </div>
        </div>
    );
});
