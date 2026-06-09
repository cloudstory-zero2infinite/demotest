import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import type { ReleaseRecord, ReleaseEnvironment, ReleaseStatus } from '../../types';
import { listReleases, updateReleaseNotes } from '../../services/api';
import { useToast } from '../common/Toast';
import { ChartPanel, PeriodSelect } from './ChartPanel';
import { Period, PERIODS, seriesByCategory } from './analyticsLogic';

const STATUS_COLORS: Record<ReleaseStatus, string> = {
  success: '#10b981', // emerald
  failed: '#ef4444', // red
};
const STATUS_CATS: ReleaseStatus[] = ['success', 'failed'];

const fmtWhen = (iso: string) => iso.replace('T', ' ').slice(0, 16); // YYYY-MM-DD HH:MM

export const ReleasesCard: React.FC<{ now: Date }> = ({ now }) => {
  const { push } = useToast();
  const [releases, setReleases] = useState<ReleaseRecord[]>([]);
  const [env, setEnv] = useState<ReleaseEnvironment>('prod');
  const [period, setPeriod] = useState<Period>('1Q');
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    listReleases()
      .then(setReleases)
      .catch((e) => push(e.message || 'Failed to load releases', 'error'));
  }, [push]);

  const scoped = useMemo(() => releases.filter((r) => r.environment === env), [releases, env]);

  const chartData = useMemo(
    () =>
      seriesByCategory(
        scoped.map((r) => ({ date: r.released_at, category: r.status })),
        STATUS_CATS,
        period,
        now
      ),
    [scoped, period, now]
  );

  const tableRows = useMemo(
    () =>
      scoped.map((r) => ({
        version: r.version ?? '',
        released_at: fmtWhen(r.released_at),
        pushed_by: r.pushed_by ?? '',
        status: r.status,
        notes: r.notes ?? '',
        commit: r.commit_sha?.slice(0, 7) ?? '',
      })),
    [scoped]
  );

  const saveNotes = async (id: string) => {
    try {
      const updated = await updateReleaseNotes(id, editText);
      setReleases((cur) => cur.map((r) => (r.id === id ? updated : r)));
      setEditId(null);
      push('Release notes updated', 'success');
    } catch (e: any) {
      push(e.message || 'Failed to update notes', 'error');
    }
  };

  const controls = (
    <>
      <div className="inline-flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden text-xs">
        {(['prod', 'pre-prod'] as ReleaseEnvironment[]).map((e) => (
          <button
            key={e}
            onClick={() => setEnv(e)}
            className={`px-2.5 py-1 ${
              env === e
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'
            } ${e === 'pre-prod' ? 'border-l border-gray-300 dark:border-gray-600' : ''}`}
          >
            {e}
          </button>
        ))}
      </div>
      <PeriodSelect value={period} onChange={setPeriod} options={PERIODS} />
    </>
  );

  const renderTable = () => (
    <div className="overflow-auto max-h-96 border border-gray-200 dark:border-gray-700 rounded">
      <table className="min-w-full text-xs">
        <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
          <tr>
            {['Version', 'When', 'Pushed by', 'Status', 'Release notes (PR title)', ''].map((h) => (
              <th
                key={h}
                className="text-left font-medium px-3 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {scoped.map((r) => (
            <tr key={r.id} className="border-t border-gray-100 dark:border-gray-700 align-top">
              <td className="px-3 py-1.5 font-mono text-gray-700 dark:text-gray-200 whitespace-nowrap">
                {r.version}
              </td>
              <td className="px-3 py-1.5 text-gray-700 dark:text-gray-200 whitespace-nowrap">
                {fmtWhen(r.released_at)}
              </td>
              <td className="px-3 py-1.5 text-gray-700 dark:text-gray-200 whitespace-nowrap">
                {r.pushed_by}
              </td>
              <td className="px-3 py-1.5 whitespace-nowrap">
                <span
                  className="inline-block px-1.5 py-0.5 rounded text-white text-[10px]"
                  style={{ background: STATUS_COLORS[r.status] }}
                >
                  {r.status}
                </span>
              </td>
              <td className="px-3 py-1.5 text-gray-700 dark:text-gray-200 min-w-[16rem]">
                {editId === r.id ? (
                  <div className="flex gap-1">
                    <input
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveNotes(r.id)}
                      className="flex-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1.5 py-0.5"
                      autoFocus
                    />
                    <button onClick={() => saveNotes(r.id)} className="text-green-600 px-1">
                      ✓
                    </button>
                    <button onClick={() => setEditId(null)} className="text-gray-400 px-1">
                      ✕
                    </button>
                  </div>
                ) : (
                  <span>{r.notes}</span>
                )}
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap">
                {editId !== r.id && (
                  <button
                    onClick={() => {
                      setEditId(r.id);
                      setEditText(r.notes ?? '');
                    }}
                    className="text-blue-600 dark:text-blue-400 text-[11px] hover:underline"
                  >
                    Edit
                  </button>
                )}
              </td>
            </tr>
          ))}
          {!scoped.length && (
            <tr>
              <td className="px-3 py-3 text-gray-400" colSpan={6}>
                No releases
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <ChartPanel
      title="Releases"
      subtitle={`Deploys to ${env} over time — green success, red failed`}
      tableRows={tableRows}
      filename={`releases-${env}-${period}`}
      controls={controls}
      renderTable={renderTable}
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="success" stackId="a" name="Success" fill={STATUS_COLORS.success} />
            <Bar dataKey="failed" stackId="a" name="Failed" fill={STATUS_COLORS.failed} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartPanel>
  );
};
