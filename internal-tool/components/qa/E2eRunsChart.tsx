import React, { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import { listQaRuns } from '../../services/api';
import { QaRunRecord } from '../../types';
import { useToast } from '../common/Toast';

type Period = '1W' | '1M' | '1Q' | 'all';
const PERIODS: { id: Period; label: string; days: number }[] = [
  { id: '1W', label: 'Last week', days: 7 },
  { id: '1M', label: 'Last month', days: 30 },
  { id: '1Q', label: 'Last quarter', days: 90 },
  { id: 'all', label: 'All time', days: Infinity },
];

// Distinct color per environment (extend if more are added later).
const ENV_COLORS: Record<string, string> = {
  'pre-prod': '#6366f1', // indigo
  prod: '#10b981', // emerald
};
const colorFor = (env: string, i: number) =>
  ENV_COLORS[env] || ['#f59e0b', '#ec4899', '#0ea5e9'][i % 3];

const dayKey = (iso: string | null) => (iso || '').slice(0, 10); // YYYY-MM-DD
// Weekday + date + 12-hour AM/PM, kept in UTC (the timezone runs are stored in).
const fmtWhen = (iso: string | null) => {
  if (!iso) return '—';
  let s = iso.includes('T') ? iso : iso.replace(' ', 'T');
  if (/[+-]\d\d$/.test(s)) s += ':00'; // normalize "+00" → "+00:00"
  const d = new Date(s);
  if (isNaN(d.getTime())) return iso.slice(0, 16);
  const wd = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  let h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${wd}, ${d.toISOString().slice(0, 10)} ${h}:${m} ${ampm} UTC`;
};

export const E2eRunsChart: React.FC<{ environment?: string }> = ({ environment }) => {
  const { push } = useToast();
  const [runs, setRuns] = useState<QaRunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('1M');

  useEffect(() => {
    listQaRuns()
      .then((r) => setRuns(r.runs))
      .catch((e) => push(e?.message || 'Failed to load E2E runs', 'error'))
      .finally(() => setLoading(false));
  }, [push]);

  const filtered = useMemo(() => {
    const p = PERIODS.find((x) => x.id === period)!;
    const cutoff = p.days === Infinity ? -Infinity : Date.now() - p.days * 24 * 60 * 60 * 1000;
    return runs.filter((r) => {
      if (environment && (r.environment || '') !== environment) return false;
      const t = new Date(r.finished_at || r.created_at).getTime();
      return !isNaN(t) && t >= cutoff;
    });
  }, [runs, period, environment]);

  const environments = useMemo(
    () => Array.from(new Set(filtered.map((r) => r.environment || 'unknown'))).sort(),
    [filtered]
  );

  const data = useMemo(() => {
    const byDay = new Map<string, Record<string, any>>();
    for (const r of filtered) {
      const d = dayKey(r.finished_at || r.created_at);
      if (!d) continue;
      if (!byDay.has(d)) byDay.set(d, { date: d, _runs: [], _passed: 0, _failed: 0 });
      const row = byDay.get(d)!;
      const env = r.environment || 'unknown';
      row[env] = (row[env] || 0) + 1;
      row._passed += r.passed || 0;
      row._failed += r.failed || 0;
      row._runs.push({ env, version: r.app_version, pct: r.success_pct, passed: r.passed, failed: r.failed });
    }
    const rows = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
    for (const row of rows) {
      for (const e of environments) if (row[e] == null) row[e] = 0; // zero-fill bars
      const pcts = row._runs.map((x: any) => x.pct).filter((v: any) => v != null).map(Number);
      row.successPct = pcts.length ? Math.round((pcts.reduce((a: number, b: number) => a + b, 0) / pcts.length) * 10) / 10 : null;
      row.label = row.date.slice(5); // MM-DD
    }
    return rows;
  }, [filtered, environments]);

  // KPIs respect the selected environment (but not the chart's period window).
  const envRuns = useMemo(
    () => (environment ? runs.filter((r) => (r.environment || '') === environment) : runs),
    [runs, environment]
  );
  const total = filtered.length;
  const last7 = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return envRuns.filter((r) => new Date(r.finished_at || r.created_at).getTime() >= cutoff).length;
  }, [envRuns]);
  const lastRunAt = useMemo(() => {
    if (!envRuns.length) return null;
    return envRuns.reduce((m, r) => {
      const t = r.finished_at || r.created_at;
      return !m || t > m ? t : m;
    }, '' as string);
  }, [envRuns]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4 mb-6">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            E2E runs over time
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Runs per environment (bars) + average pass % (line) — from GitHub Actions
          </p>
        </div>
        <div className="inline-flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden text-xs">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-2.5 py-1 border-l first:border-l-0 border-gray-300 dark:border-gray-600 ${
                period === p.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="flex flex-wrap gap-3 mb-3">
        <Kpi label="Total runs" value={total} />
        <Kpi label="Last 7 days" value={last7} />
        <Kpi label="Last run" value={fmtWhen(lastRunAt)} small />
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading runs…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">
          No runs recorded yet for this period. Runs appear here after a deploy to main (or a manual GitHub Action run).
        </p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis
                yAxisId="count"
                allowDecimals={false}
                tick={{ fontSize: 11 }}
                label={{ value: 'runs', angle: -90, position: 'insideLeft', fontSize: 10 }}
              />
              <YAxis
                yAxisId="pct"
                orientation="right"
                domain={[0, 100]}
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              {environments.map((env, i) => (
                <Bar key={env} yAxisId="count" dataKey={env} name={env} fill={colorFor(env, i)} radius={[2, 2, 0, 0]} />
              ))}
              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="successPct"
                name="Avg pass %"
                stroke="#111827"
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

// Tooltip: bucket totals + per-run pass % so you see each run's result.
const ChartTooltip: React.FC<any> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const runs = row._runs || [];
  return (
    <div className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs shadow max-w-[260px]">
      <div className="font-semibold text-gray-900 dark:text-gray-100">{row.date}</div>
      <div className="text-gray-600 dark:text-gray-300">
        {runs.length} run{runs.length !== 1 ? 's' : ''} · avg{' '}
        <b>{row.successPct == null ? '—' : `${row.successPct}%`}</b> pass
      </div>
      <div className="text-gray-500 dark:text-gray-400 mb-1">
        <span className="text-green-600 dark:text-green-400">{row._passed} passed</span>
        {row._failed > 0 && <span className="text-red-600 dark:text-red-400"> · {row._failed} failed</span>}
      </div>
      {runs.slice(0, 10).map((r: any, i: number) => (
        <div key={i} className="text-gray-500 dark:text-gray-400 truncate">
          {r.env} {r.version || ''} — {r.pct == null ? '—' : `${r.pct}%`} ({r.passed}✓{r.failed ? ` ${r.failed}✗` : ''})
        </div>
      ))}
      {runs.length > 10 && <div className="text-gray-400">…and {runs.length - 10} more</div>}
    </div>
  );
};

const Kpi: React.FC<{ label: string; value: React.ReactNode; small?: boolean }> = ({ label, value, small }) => (
  <div className="rounded-md bg-gray-50 dark:bg-gray-900 px-3 py-2 min-w-[96px]">
    <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    <div className={`font-semibold text-gray-800 dark:text-gray-100 ${small ? 'text-sm' : 'text-lg'}`}>{value}</div>
  </div>
);
