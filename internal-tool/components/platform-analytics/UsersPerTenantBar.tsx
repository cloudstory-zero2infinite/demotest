import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';
import type { AnalyticsTenant } from '../../types';
import { ChartPanel } from './ChartPanel';
import { TYPE_COLORS, TYPE_LABELS } from './analyticsLogic';

export const UsersPerTenantBar: React.FC<{ tenants: AnalyticsTenant[]; orphanCount: number }> = ({
  tenants,
  orphanCount,
}) => {
  const data = useMemo(
    () =>
      tenants
        .filter((t) => t.user_count > 0)
        .sort((a, b) => b.user_count - a.user_count)
        .map((t) => ({ name: t.name, users: t.user_count, type: t.type })),
    [tenants]
  );

  const rows = useMemo(
    () => data.map((d) => ({ tenant: d.name, type: d.type, users: d.users })),
    [data]
  );

  // Height grows with the number of tenants so bars stay readable.
  const height = Math.max(240, data.length * 26 + 40);
  const totalMembers = useMemo(() => data.reduce((s, d) => s + d.users, 0), [data]);

  return (
    <ChartPanel
      title="Users per tenant"
      subtitle={`${totalMembers} members (matches Manage Members) · ${orphanCount} orphan users not in any tenant`}
      tableRows={rows}
      filename="users-per-tenant"
    >
      <div className="overflow-y-auto max-h-[28rem]">
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 16, right: 28, top: 4, bottom: 4 }}>
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={140}
                tick={{ fontSize: 11 }}
                interval={0}
              />
              <Tooltip />
              <Bar dataKey="users" radius={[0, 3, 3, 0]}>
                {data.map((d, i) => (
                  <Cell key={i} fill={TYPE_COLORS[d.type]} />
                ))}
                <LabelList dataKey="users" position="right" style={{ fontSize: 11, fill: '#6b7280' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="flex gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: TYPE_COLORS.consultant }} />
          {TYPE_LABELS.consultant}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: TYPE_COLORS.organisation }} />
          {TYPE_LABELS.organisation}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
        Orphan = a signed-in user who isn't on any tenant's member list (e.g. ZTI staff or an abandoned
        onboarding); they aren't counted against any tenant above.
      </p>
    </ChartPanel>
  );
};
