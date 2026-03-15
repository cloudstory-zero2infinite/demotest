import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { AssetCriticality } from '../../types';

interface AssetsOverviewCardProps {
    data: { name: string; value: number }[];
    governedPercent: number;
    filter: AssetCriticality | 'All';
    setFilter: (filter: AssetCriticality | 'All') => void;
}

const COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6'];

export const AssetsOverviewCard: React.FC<AssetsOverviewCardProps> = React.memo(({ data, governedPercent, filter, setFilter }) => {
    return (
        <div className="md:col-span-2 lg:col-span-2 p-4 bg-white dark:bg-gray-800 rounded-lg shadow transition-all hover:shadow-md border border-transparent dark:border-gray-700">
            <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Assets Overview</h3>
                <select 
                    value={filter} 
                    onChange={e => setFilter(e.target.value as any)} 
                    className="text-xs rounded border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 focus:ring-blue-500 focus:border-blue-500"
                >
                    <option value="All">All Criticality</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                </select>
            </div>
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
                            {data.map((_entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                        </Pie>
                         <Tooltip />
                        <Legend verticalAlign="bottom" height={36}/>
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                    <span className="block text-2xl font-bold text-gray-800 dark:text-gray-200">{`${governedPercent.toFixed(0)}%`}</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-tight">Governed</span>
                </div>
            </div>
        </div>
    );
});
