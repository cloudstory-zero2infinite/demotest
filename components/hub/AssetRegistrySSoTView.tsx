import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as SupabaseService from '../../services/supabase';
import type { AssetRegistryRow, AssetRegistryDiffRow, UserRole } from '../../types';

const statusBadge = (status: string): string => {
  switch (status) {
    case 'pending': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
    case 'imported': return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300';
    case 'discarded': return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
    default: return 'bg-gray-100 text-gray-700';
  }
};

const fmtDate = (s?: string | null): string => (s ? new Date(s).toLocaleString() : '—');

export const AssetRegistrySSoTView: React.FC<{ isActive?: boolean, userRole?: UserRole | null }> = ({ isActive = true, userRole }) => {
  const isReadOnly = userRole === 'read-only';
  const [rows, setRows] = useState<AssetRegistryRow[]>([]);
  const [diff, setDiff] = useState<AssetRegistryDiffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // registry row id -> 'approve' | 'discard', default approve for every pending row
  const [decisions, setDecisions] = useState<Record<string, 'approve' | 'discard'>>({});
  const [committing, setCommitting] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rowList, diffList] = await Promise.all([
        SupabaseService.getAssetRegistry(),
        SupabaseService.getAssetRegistryDiff(),
      ]);
      setRows(rowList);
      setDiff(diffList);
      setDecisions((prev) => {
        const next: Record<string, 'approve' | 'discard'> = {};
        diffList.forEach((d) => { next[d.incoming.id] = prev[d.incoming.id] || 'approve'; });
        return next;
      });
    } catch (e: any) {
      setError(e.message || 'Failed to load Asset Registry - SSoT');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isActive) fetchAll();
  }, [isActive, fetchAll]);

  const diffById = useMemo(() => {
    const m = new Map<string, AssetRegistryDiffRow>();
    diff.forEach((d) => m.set(d.incoming.id, d));
    return m;
  }, [diff]);

  const counts = useMemo(() => {
    const approve = Object.values(decisions).filter((d) => d === 'approve').length;
    const discard = Object.values(decisions).filter((d) => d === 'discard').length;
    const pending = rows.filter((r) => r.review_status === 'pending').length;
    return { approve, discard, pending };
  }, [decisions, rows]);

  const commit = useCallback(async () => {
    setCommitting(true);
    setError(null);
    try {
      const approve = Object.entries(decisions).filter(([, d]) => d === 'approve').map(([id]) => id);
      const discard = Object.entries(decisions).filter(([, d]) => d === 'discard').map(([id]) => id);
      const res = await SupabaseService.importAssetRegistry(approve, discard);
      await fetchAll();
      alert(`Imported ${res.imported} asset(s) into the register${res.discarded ? `, discarded ${res.discarded}` : ''}.`);
    } catch (e: any) {
      setError(e.message || 'Import failed');
    } finally {
      setCommitting(false);
    }
  }, [decisions, fetchAll]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Asset Registry - SSoT</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Agents synced by <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">zti ingest wazuh</code> land here first. Review and approve to create/update the asset under its integration category (e.g. Wazuh); discard to drop it.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {counts.pending} pending · {counts.approve} to import · {counts.discard} to discard
          </span>
          <button onClick={fetchAll} className="px-3 py-2 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
            Refresh
          </button>
          <button
            onClick={commit}
            disabled={committing || counts.pending === 0 || isReadOnly}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {committing ? 'Importing…' : 'Approve & import'}
          </button>
        </div>
      </div>

      {error && <div className="mb-3 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="text-sm text-gray-500 py-8 text-center">Loading Asset Registry - SSoT…</div>
      ) : rows.length === 0 ? (
        <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Nothing synced yet.</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Run <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">zti ingest wazuh</code>, then click Refresh.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                <th className="px-4 py-3">Integration</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Synced</th>
                <th className="px-4 py-3">Review</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
              {rows.map((r) => {
                const d = diffById.get(r.id);
                const decision = decisions[r.id] || 'approve';
                const isPending = r.review_status === 'pending';
                return (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                        {r.integration}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">
                      {r.name}
                      {d?.conflict && (
                        <div className="text-[11px] uppercase tracking-wide text-red-600 dark:text-red-400 font-semibold mt-0.5">
                          Existing asset will be updated
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.ip_address || '—'}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.status || '—'}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.category || '—'}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">{fmtDate(r.updated_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(r.review_status)}`}>{r.review_status}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isPending ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setDecisions((p) => ({ ...p, [r.id]: 'approve' }))}
                            disabled={isReadOnly}
                            className={`px-3 py-1 text-xs font-medium rounded ${decision === 'approve' ? 'bg-green-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600'} disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            Import
                          </button>
                          <button
                            onClick={() => setDecisions((p) => ({ ...p, [r.id]: 'discard' }))}
                            disabled={isReadOnly}
                            className={`px-3 py-1 text-xs font-medium rounded ${decision === 'discard' ? 'bg-gray-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600'} disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            Discard
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
