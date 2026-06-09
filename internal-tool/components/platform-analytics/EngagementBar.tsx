import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import type { AnalyticsUser } from '../../types';
import { ChartPanel } from './ChartPanel';
import {
  TYPE_COLORS,
  TYPE_LABELS,
  engagementBucket,
  EngagementBucket,
} from './analyticsLogic';

const BUCKET_META: { key: EngagementBucket; label: string; hint: string }[] = [
  { key: 'active', label: 'Active', hint: 'logged in ≤ 7 days' },
  { key: 'less', label: 'Less active', hint: 'logged in ≤ 30 days' },
  { key: 'inactive', label: 'Inactive', hint: 'no login > 30 days / never' },
];

export const EngagementBar: React.FC<{ users: AnalyticsUser[]; now: Date }> = ({ users, now }) => {
  const data = useMemo(() => {
    const zero = () => ({ consultant: 0, organisation: 0, orphan: 0 });
    const tally: Record<EngagementBucket, ReturnType<typeof zero>> = {
      active: zero(),
      less: zero(),
      inactive: zero(),
    };
    for (const u of users) {
      const b = engagementBucket(u.last_login, now);
      tally[b][u.type] += 1;
    }
    return BUCKET_META.map((m) => ({
      bucket: m.label,
      hint: m.hint,
      consultant: tally[m.key].consultant,
      organisation: tally[m.key].organisation,
      orphan: tally[m.key].orphan,
    }));
  }, [users, now]);

  const tableRows = useMemo(
    () =>
      data.map((d) => ({
        bucket: d.bucket,
        definition: d.hint,
        consultant: d.consultant,
        organisation: d.organisation,
        orphan: d.orphan,
        total: d.consultant + d.organisation + d.orphan,
      })),
    [data]
  );

  return (
    <ChartPanel
      title="User engagement"
      subtitle="Active vs less active vs inactive, by tenant type"
      tableRows={tableRows}
      filename="engagement"
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="consultant" stackId="a" name={TYPE_LABELS.consultant} fill={TYPE_COLORS.consultant} />
            <Bar dataKey="organisation" stackId="a" name={TYPE_LABELS.organisation} fill={TYPE_COLORS.organisation} />
            <Bar dataKey="orphan" stackId="a" name={TYPE_LABELS.orphan} fill={TYPE_COLORS.orphan}>
              <LabelList
                position="top"
                style={{ fontSize: 11, fill: '#6b7280' }}
                valueAccessor={(entry: any) => {
                  const p = entry?.payload ?? {};
                  return (p.consultant ?? 0) + (p.organisation ?? 0) + (p.orphan ?? 0) || '';
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartPanel>
  );
};
