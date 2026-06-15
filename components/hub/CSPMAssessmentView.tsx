import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as SupabaseService from '../../services/supabase';
import type { CspmScanJob, CspmPreviewRow } from '../../types';

const statusBadge = (status: string): string => {
  switch (status) {
    case 'running': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
    case 'completed': return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    case 'staged': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
    case 'imported': return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300';
    case 'failed': return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
    default: return 'bg-gray-100 text-gray-700';
  }
};

// per-control result verdict color
const resultColor = (s: string): string => {
  switch (s) {
    case 'pass': return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
    case 'partial': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
    case 'fail': return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
    default: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
  }
};

const ctlStatusColor = (s?: string | null): string => {
  switch (s) {
    case 'Enforced': return 'text-green-700 dark:text-green-400';
    case 'NotEnforced': return 'text-red-700 dark:text-red-400';
    case 'In-Review': return 'text-yellow-700 dark:text-yellow-400';
    default: return 'text-gray-500 dark:text-gray-400';
  }
};

const scopeText = (j: CspmScanJob): string => {
  if (j.scope_type === 'all') return 'All controls';
  if (j.scope_type === 'framework') return `Framework: ${j.scope_value || ''}`.trim();
  if (j.scope_type === 'control') return `Control: ${j.scope_value || ''}`.trim();
  return `Provider: ${j.scope_value || j.provider || ''}`.trim();
};

const fmtDate = (s?: string | null): string => (s ? new Date(s).toLocaleString() : '—');

export const CSPMAssessmentView: React.FC<{ isActive?: boolean }> = ({ isActive = true }) => {
  const [jobs, setJobs] = useState<CspmScanJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedJob, setSelectedJob] = useState<CspmScanJob | null>(null);
  const [preview, setPreview] = useState<CspmPreviewRow[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, 'approve' | 'discard'>>({});
  const [committing, setCommitting] = useState(false);

  // Peer reviewer for the controls that pass any checks (enter the In-Review gate).
  const [members, setMembers] = useState<any[]>([]);
  const [reviewerId, setReviewerId] = useState<string>('');

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setJobs(await SupabaseService.getCspmScanJobs());
    } catch (e: any) {
      setError(e.message || 'Failed to load CSPM scans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isActive) fetchJobs();
  }, [isActive, fetchJobs]);

  const openReview = useCallback(async (job: CspmScanJob) => {
    setSelectedJob(job);
    setPreview([]);
    setDecisions({});
    setReviewerId('');
    setPreviewLoading(true);
    try {
      const [rows, mem] = await Promise.all([
        SupabaseService.getCspmScanPreview(job.id),
        SupabaseService.getOrganizationUsers(),
      ]);
      setPreview(rows);
      setMembers(mem || []);
      const init: Record<string, 'approve' | 'discard'> = {};
      rows.forEach((r) => { init[r.result.id] = r.matched ? 'approve' : 'discard'; });
      setDecisions(init);
    } catch (e: any) {
      setError(e.message || 'Failed to load review');
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const counts = useMemo(() => {
    const approve = Object.values(decisions).filter((d) => d === 'approve').length;
    const discard = Object.values(decisions).filter((d) => d === 'discard').length;
    return { approve, discard };
  }, [decisions]);

  // Does any approved row enter the peer-review path (pass_pct > 0)?
  const needsReviewer = useMemo(
    () => preview.some((r) => decisions[r.result.id] === 'approve' && r.result.pass_pct > 0),
    [preview, decisions]
  );

  const commit = useCallback(async () => {
    if (!selectedJob) return;
    if (needsReviewer && !reviewerId) {
      setError('Select a peer reviewer for the controls that passed checks.');
      return;
    }
    setCommitting(true);
    setError(null);
    try {
      const approve = Object.entries(decisions).filter(([, d]) => d === 'approve').map(([id]) => id);
      const discard = Object.entries(decisions).filter(([, d]) => d === 'discard').map(([id]) => id);
      const reviewer = members.find((m) => (m.user_id || m.id) === reviewerId);
      const res = await SupabaseService.importCspmResults(selectedJob.id, approve, discard, reviewer ? {
        reviewer_id: reviewer.user_id || undefined,
        reviewer_name: reviewer.name || reviewer.email,
        reviewer_email: reviewer.email,
      } : undefined);
      setSelectedJob(null);
      setPreview([]);
      await fetchJobs();
      const parts = [
        `${res.enforced_in_review} sent for peer review`,
        `${res.not_enforced} marked NotEnforced`,
      ];
      if (res.skipped_unmatched) parts.push(`${res.skipped_unmatched} unmatched (skipped)`);
      if (res.skipped_in_review) parts.push(`${res.skipped_in_review} already in review (skipped)`);
      if (res.discarded) parts.push(`${res.discarded} discarded`);
      alert(`CSPM import complete: ${parts.join(', ')}.`);
    } catch (e: any) {
      setError(e.message || 'Import failed');
    } finally {
      setCommitting(false);
    }
  }, [selectedJob, decisions, members, reviewerId, needsReviewer, fetchJobs]);

  // ── Review screen ───────────────────────────────────────────────────────────
  if (selectedJob) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <button onClick={() => setSelectedJob(null)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">← Back to scans</button>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
              Review &amp; import — {scopeText(selectedJob)}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Job {selectedJob.id} · {fmtDate(selectedJob.created_at)}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 dark:text-gray-300">{counts.approve} to import · {counts.discard} to discard</span>
            <button
              onClick={commit}
              disabled={committing || preview.length === 0}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {committing ? 'Importing…' : 'Approve & import'}
            </button>
          </div>
        </div>

        <div className="mb-4 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-md p-3">
          On import, each control's maturity is set to its pass rate. Controls passing <strong>any</strong> checks go to <strong>In-Review</strong> and are sent for mandatory peer review before being enforced. Controls passing <strong>nothing</strong> are set <span className="text-red-600 dark:text-red-400 font-semibold">NotEnforced</span> directly.
        </div>

        {needsReviewer && (
          <div className="mb-4 flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Peer reviewer (tenant admin):</label>
            <select
              value={reviewerId}
              onChange={(e) => setReviewerId(e.target.value)}
              className="px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">Select a reviewer…</option>
              {members.map((m) => (
                <option key={m.id || m.user_id} value={m.user_id || m.id}>
                  {(m.name ? `${m.name} · ` : '')}{m.email}{m.role ? ` (${m.role})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && <div className="mb-3 text-sm text-red-600">{error}</div>}

        {previewLoading ? (
          <div className="text-sm text-gray-500 py-8 text-center">Loading review…</div>
        ) : preview.length === 0 ? (
          <div className="text-sm text-gray-500 py-8 text-center">Nothing pending review for this scan.</div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                  <th className="px-4 py-3">Control</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Pass rate</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Current → Proposed</th>
                  <th className="px-4 py-3 text-right">Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
                {preview.map((row) => {
                  const r = row.result;
                  const decision = decisions[r.id] || 'approve';
                  return (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{row.current?.ctl_name || r.control_name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {r.scf_control_id || r.nn_ctl_name}{row.current ? ` · ${row.current.ctl_id}` : ''}
                          {!row.matched && <span className="ml-1 text-amber-600 dark:text-amber-400">· no matching control</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.provider || '—'}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.checks_passed}/{r.checks_passed + r.checks_failed} <span className="font-semibold">({r.pass_pct}%)</span>{r.checks_na ? <span className="text-xs text-gray-400"> · {r.checks_na} n/a</span> : null}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${resultColor(r.result_status)}`}>{r.result_status}</span></td>
                      <td className="px-4 py-3 text-xs">
                        {row.current ? (
                          <span className={ctlStatusColor(row.current.ctl_status)}>{row.current.ctl_status} ({row.current.maturity_score ?? 0}%)</span>
                        ) : <span className="text-gray-400">—</span>}
                        <span className="mx-1 text-gray-400">→</span>
                        <span className={`font-semibold ${ctlStatusColor(row.proposed.ctl_status)}`}>{row.proposed.ctl_status} ({row.proposed.maturity_score}%)</span>
                        {row.proposed.needs_review && <span className="ml-1 text-[10px] uppercase tracking-wide text-blue-600 dark:text-blue-400">peer review</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setDecisions((p) => ({ ...p, [r.id]: 'approve' }))}
                            disabled={!row.matched}
                            className={`px-3 py-1 text-xs font-medium rounded ${decision === 'approve' ? 'bg-green-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600'} disabled:opacity-40`}
                          >
                            Import
                          </button>
                          <button
                            onClick={() => setDecisions((p) => ({ ...p, [r.id]: 'discard' }))}
                            className={`px-3 py-1 text-xs font-medium rounded ${decision === 'discard' ? 'bg-gray-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600'}`}
                          >
                            Discard
                          </button>
                        </div>
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
  }

  // ── Jobs list ─────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">CSPM — Cloud Security Posture</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Prowler check-control results pushed from the <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">zti cspm scan</code> CLI. Review and import into the Control Registry with automated maturity.
          </p>
        </div>
        <button onClick={fetchJobs} className="px-3 py-2 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
          Refresh
        </button>
      </div>

      {error && <div className="mb-3 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="text-sm text-gray-500 py-8 text-center">Loading scans…</div>
      ) : jobs.length === 0 ? (
        <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">No CSPM scans yet.</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Run <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">zti cspm scan</code>, then <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">zti cspm report</code> and choose “send to workspace”.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Controls</th>
                <th className="px-4 py-3">Posture</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
              {jobs.map((j) => (
                <tr key={j.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">{fmtDate(j.created_at)}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">{scopeText(j)}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(j.status)}`}>{j.status}</span></td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {j.result_count}{j.pending_count > 0 && <span className="ml-1 text-amber-600 dark:text-amber-400">({j.pending_count} pending)</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                    {j.summary ? (
                      <span className="flex gap-2">
                        {!!j.summary.fully_passed && <span className="text-green-600 font-semibold">{j.summary.fully_passed}✓</span>}
                        {!!j.summary.partially_passed && <span className="text-yellow-600 font-semibold">{j.summary.partially_passed}◑</span>}
                        {!!j.summary.failed && <span className="text-red-600 font-semibold">{j.summary.failed}✗</span>}
                        {!!j.summary.na && <span className="text-gray-400">{j.summary.na}·</span>}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {j.is_mock
                      ? <span className="px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">mock</span>
                      : <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">Prowler</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {j.pending_count > 0 ? (
                      <button onClick={() => openReview(j)} className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700">
                        Review &amp; import
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">{j.status === 'imported' ? 'Imported' : '—'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
