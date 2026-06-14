import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { AnalyticsTenant } from '../../types';
import { ChartPanel } from './ChartPanel';
import { TYPE_COLORS, TYPE_LABELS } from './analyticsLogic';

export const TenantsDonut: React.FC<{ tenants: AnalyticsTenant[] }> = ({ tenants }) => {
  const { data, total, rows } = useMemo(() => {
    const consultant = tenants.filter((t) => t.type === 'consultant').length;
    const organisation = tenants.length - consultant;
    return {
      total: tenants.length,
      data: [
        { name: TYPE_LABELS.consultant, value: consultant, key: 'consultant' as const },
        { name: TYPE_LABELS.organisation, value: organisation, key: 'organisation' as const },
      ],
      rows: tenants.map((t) => ({
        tenant: t.name,
        type: t.type,
        users: t.user_count,
        created_at: t.created_at?.slice(0, 10) ?? '',
      })),
    };
  }, [tenants]);

  return (
    <ChartPanel title="Tenants" subtitle="Consultants vs organisations" tableRows={rows} filename="tenants">
      <div className="relative h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={70} outerRadius={100} paddingAngle={2}>
              {data.map((d) => (
                <Cell key={d.key} fill={TYPE_COLORS[d.key]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none -mt-6">
          <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">{total}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">total tenants</span>
        </div>
      </div>
    </ChartPanel>
  );
};
