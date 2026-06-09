import React, { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import type { AnalyticsFeedback } from '../../types';
import { ChartPanel, PeriodSelect } from './ChartPanel';
import {
  Period,
  PERIODS,
  TYPE_COLORS,
  TYPE_LABELS,
  ACCENT,
  seriesTotal,
  withinPeriod,
} from './analyticsLogic';

export const FeedbackCharts: React.FC<{ feedback: AnalyticsFeedback[]; now: Date }> = ({
  feedback,
  now,
}) => {
  const [period, setPeriod] = useState<Period>('1Y');

  const dated = useMemo(() => feedback.map((f) => ({ ...f, date: f.created_at })), [feedback]);
  const inWindow = useMemo(() => withinPeriod(dated, period, now), [dated, period, now]);

  const line = useMemo(() => seriesTotal(inWindow, period, now), [inWindow, period, now]);

  const donut = useMemo(() => {
    const consultant = inWindow.filter((f) => f.type === 'consultant').length;
    const organisation = inWindow.length - consultant;
    return [
      { name: TYPE_LABELS.consultant, value: consultant, key: 'consultant' as const },
      { name: TYPE_LABELS.organisation, value: organisation, key: 'organisation' as const },
    ];
  }, [inWindow]);

  // Drill-in table: who said what, from which tenant.
  const tableRows = useMemo(
    () =>
      inWindow.map((f) => ({
        date: f.created_at?.slice(0, 10) ?? '',
        description: f.description ?? '',
        user: f.user_name ?? f.user_email ?? '',
        tenant: f.org_name ?? '',
        type: f.type,
        rating: f.rating ?? '',
      })),
    [inWindow]
  );

  const periodControl = <PeriodSelect value={period} onChange={setPeriod} options={PERIODS} />;

  return (
    <>
      <ChartPanel
        title="Feedback over time"
        subtitle="Click Table for who said what"
        tableRows={tableRows}
        filename={`feedback-trend-${period}`}
        controls={periodControl}
      >
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={line} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="count"
                name="Feedback"
                stroke={ACCENT}
                strokeWidth={2}
                dot={{ r: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartPanel>

      <ChartPanel
        title="Total feedback"
        subtitle="By tenant type, click Table for detail"
        tableRows={tableRows}
        filename={`feedback-total-${period}`}
        controls={periodControl}
      >
        <div className="relative h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={donut} dataKey="value" nameKey="name" innerRadius={70} outerRadius={100} paddingAngle={2}>
                {donut.map((d) => (
                  <Cell key={d.key} fill={TYPE_COLORS[d.key]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none -mt-6">
            <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">{inWindow.length}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">total feedback</span>
          </div>
        </div>
      </ChartPanel>
    </>
  );
};
