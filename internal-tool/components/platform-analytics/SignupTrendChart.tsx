import React, { useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { AnalyticsTenant, AnalyticsUser, UserType, CampaignMarker } from '../../types';
import { listCampaignMarkers, createCampaignMarker, deleteCampaignMarker } from '../../services/api';
import { useToast } from '../common/Toast';
import { ChartPanel, PeriodSelect } from './ChartPanel';
import {
  Period,
  PERIODS,
  TYPE_COLORS,
  TYPE_LABELS,
  seriesByCategory,
  bucketLabelForDate,
} from './analyticsLogic';

type Mode = 'users' | 'tenants';

const USER_CATS: UserType[] = ['consultant', 'organisation', 'orphan'];
const TENANT_CATS: UserType[] = ['consultant', 'organisation'];
const MARKER_COLOR = '#f59e0b'; // amber

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const SignupTrendChart: React.FC<{
  tenants: AnalyticsTenant[];
  users: AnalyticsUser[];
  now: Date;
}> = ({ tenants, users, now }) => {
  const { push } = useToast();
  const [period, setPeriod] = useState<Period>('1M');
  const [mode, setMode] = useState<Mode>('users');

  const [markers, setMarkers] = useState<CampaignMarker[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newDate, setNewDate] = useState(ymd(now));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listCampaignMarkers()
      .then(setMarkers)
      .catch((e) => push(e.message || 'Failed to load campaign tags', 'error'));
  }, [push]);

  const cats = mode === 'users' ? USER_CATS : TENANT_CATS;

  const data = useMemo(() => {
    const rows =
      mode === 'users'
        ? users.map((u) => ({ date: u.first_seen, category: u.type }))
        : tenants.map((t) => ({ date: t.created_at, category: t.type as UserType }));
    return seriesByCategory(rows, cats, period, now);
  }, [mode, cats, period, tenants, users, now]);

  const tableRows = useMemo(
    () =>
      data.map((d) => {
        const row: Record<string, any> = { period: d.label };
        let total = 0;
        for (const c of cats) {
          row[c] = (d as any)[c];
          total += (d as any)[c];
        }
        row.total = total;
        return row;
      }),
    [data, cats]
  );

  // Group markers onto the bucket label they fall in for the current period.
  const markersByBucket = useMemo(() => {
    const map = new Map<string, CampaignMarker[]>();
    for (const m of markers) {
      const label = bucketLabelForDate(m.event_date, period, now);
      if (!label) continue; // outside the visible window
      const arr = map.get(label) || [];
      arr.push(m);
      map.set(label, arr);
    }
    return map;
  }, [markers, period, now]);

  const addMarker = async () => {
    const label = newLabel.trim();
    if (!label || !newDate) return;
    setSaving(true);
    try {
      const created = await createCampaignMarker({ label, event_date: newDate });
      setMarkers((cur) => [...cur, created].sort((a, b) => a.event_date.localeCompare(b.event_date)));
      setNewLabel('');
      setShowForm(false);
      push('Campaign tag added', 'success');
    } catch (e: any) {
      push(e.message || 'Failed to add tag', 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeMarker = async (id: string) => {
    try {
      await deleteCampaignMarker(id);
      setMarkers((cur) => cur.filter((m) => m.id !== id));
    } catch (e: any) {
      push(e.message || 'Failed to delete tag', 'error');
    }
  };

  const controls = (
    <>
      <div className="inline-flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden text-xs">
        {(['users', 'tenants'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-2.5 py-1 capitalize ${
              mode === m
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'
            } ${m === 'tenants' ? 'border-l border-gray-300 dark:border-gray-600' : ''}`}
          >
            {m}
          </button>
        ))}
      </div>
      <PeriodSelect value={period} onChange={setPeriod} options={PERIODS} />
      <button
        onClick={() => setShowForm((s) => !s)}
        className="text-xs px-2.5 py-1 rounded border border-amber-400 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30"
      >
        + Campaign tag
      </button>
    </>
  );

  return (
    <ChartPanel
      title="Signup trend"
      subtitle={`New ${mode} over time, by tenant type — amber markers = campaigns/events`}
      tableRows={tableRows}
      filename={`signups-${mode}-${period}`}
      controls={controls}
    >
      {showForm && (
        <div className="flex flex-wrap items-center gap-2 mb-3 p-2 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
          />
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addMarker()}
            placeholder="e.g. YouTube video, WhatsApp blast to 10 groups"
            className="text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 flex-1 min-w-[12rem]"
          />
          <button
            onClick={addMarker}
            disabled={saving || !newLabel.trim()}
            className="text-xs px-3 py-1 rounded bg-amber-600 text-white disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 4, right: 12, top: 24, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            {[...markersByBucket.entries()].map(([label, ms]) => (
              <ReferenceLine
                key={label}
                x={label}
                stroke={MARKER_COLOR}
                strokeDasharray="4 2"
                label={{
                  value: ms.map((m) => m.label).join(' · '),
                  position: 'top',
                  fill: '#b45309',
                  fontSize: 10,
                }}
              />
            ))}
            {cats.map((c) => (
              <Line
                key={c}
                type="monotone"
                dataKey={c}
                name={TYPE_LABELS[c]}
                stroke={TYPE_COLORS[c]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {markers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {markers.map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200"
              title={m.created_by ? `Added by ${m.created_by}` : undefined}
            >
              <span className="font-medium">{m.event_date}</span>
              <span>{m.label}</span>
              <button
                onClick={() => removeMarker(m.id)}
                className="ml-0.5 text-amber-600 hover:text-amber-900 dark:hover:text-amber-100"
                aria-label="Delete tag"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </ChartPanel>
  );
};
