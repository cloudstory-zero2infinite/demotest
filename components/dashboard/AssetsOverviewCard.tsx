import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { AssetCriticality } from '../../types';

interface AssetsOverviewCardProps {
    data: { name: string; value: number }[];
    governedPercent: number;
    filter: AssetCriticality | 'All';
    setFilter: (filter: AssetCriticality | 'All') => void;
}

const COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6'];

export const AssetsOverviewCard: React.FC<AssetsOverviewCardProps> = React.memo(({ data, governedPercent, filter, setFilter }) => {
    const total = data.reduce((s, d) => s + d.value, 0);

    return (
        <div className="p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
            <div className="flex justify-between items-center mb-1">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Assets</h3>
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
            </div>
            <div className="relative flex-1" style={{ height: '170px' }}>
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
    );
});
