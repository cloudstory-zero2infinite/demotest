import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listControlChecks,
  createControlCheck,
  updateControlCheck,
  deleteControlCheck,
  listScfControls,
  listNNControls,
  listCheckAssociations,
  attachCheck,
  detachCheck,
  autoAssignGcpChecks,
} from '../../services/api';
import { ControlCheck, ControlCheckAssociation, ScfControl, NNControlTemplate } from '../../types';
import { useToast } from '../common/Toast';

const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const PROVIDERS = ['gcp', 'aws', 'azure', 's3'];

const emptyForm = {
  check_id: '',
  title: '',
  description: '',
  provider: 'gcp',
  service: '',
  severity: 'medium',
  source: 'custom',
  remediation: '',
};
type CheckForm = typeof emptyForm;

function severityBadge(sev: string | null): string {
  switch (sev) {
    case 'critical':
      return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
    case 'high':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300';
    case 'low':
      return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
    default:
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300';
  }
}

export const ControlChecksLibraryTab: React.FC = () => {
  const { push } = useToast();
  const [checks, setChecks] = useState<ControlCheck[]>([]);
  const [controls, setControls] = useState<ScfControl[]>([]);
  const [nnControls, setNnControls] = useState<NNControlTemplate[]>([]);
  const [associations, setAssociations] = useState<ControlCheckAssociation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Catalogue editor modal
  const [editing, setEditing] = useState<{ id: string | null; form: CheckForm } | null>(null);

  // Association manager
  const [assocMode, setAssocMode] = useState<'scf' | 'nn'>('scf');
  const [controlQuery, setControlQuery] = useState('');
  const [selectedControl, setSelectedControl] = useState<ScfControl | null>(null);
  const [selectedNn, setSelectedNn] = useState<NNControlTemplate | null>(null);
  const [attachPick, setAttachPick] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [chk, ctrls, nn, assoc] = await Promise.all([
        listControlChecks(),
        listScfControls(),
        listNNControls(),
        listCheckAssociations(),
      ]);
      setChecks(chk);
      setControls(ctrls);
      setNnControls(nn);
      setAssociations(assoc);
    } catch (e: any) {
      push(e?.message || 'Failed to load control checks', 'error');
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ───── catalogue CRUD ─────
  const saveCheck = async () => {
    if (!editing) return;
    const f = editing.form;
    if (!f.check_id.trim() || !f.title.trim()) {
      push('check_id and title are required', 'error');
      return;
    }
    setBusy(true);
    try {
      if (editing.id) {
        await updateControlCheck(editing.id, {
          title: f.title,
          description: f.description || null,
          provider: f.provider,
          service: f.service || null,
          severity: f.severity,
          source: f.source,
          remediation: f.remediation || null,
        });
        push('Check updated', 'success');
      } else {
        await createControlCheck({
          check_id: f.check_id.trim(),
          title: f.title.trim(),
          description: f.description || null,
          provider: f.provider,
          service: f.service || null,
          severity: f.severity,
          source: f.source,
          remediation: f.remediation || null,
        });
        push('Check created', 'success');
      }
      setEditing(null);
      await refresh();
    } catch (e: any) {
      push(e?.message || 'Save failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const removeCheck = async (c: ControlCheck) => {
    if (!confirm(`Delete check "${c.check_id}"?\n\nThis also detaches it from every SCF control.`))
      return;
    setBusy(true);
    try {
      await deleteControlCheck(c.id);
      push('Check deleted', 'success');
      await refresh();
    } catch (e: any) {
      push(e?.message || 'Delete failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  // ───── associations ─────
  const onAutoAssign = async () => {
    setBusy(true);
    try {
      const r = await autoAssignGcpChecks();
      push(`Auto-assign complete — ${r.inserted} new association(s)`, 'success');
      await refresh();
    } catch (e: any) {
      push(e?.message || 'Auto-assign failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  // Currently selected target (SCF control id or NN ctl_name) + display name.
  const selectedKey = assocMode === 'scf' ? selectedControl?.scf_control_id ?? null : selectedNn?.ctl_name ?? null;
  const selectedName = assocMode === 'scf' ? selectedControl?.control_name ?? null : selectedNn?.ctl_name ?? null;

  const controlAssociations = useMemo(() => {
    if (!selectedKey) return [];
    return associations.filter((a) =>
      assocMode === 'scf' ? a.scf_control_id === selectedKey : a.nn_ctl_name === selectedKey
    );
  }, [associations, assocMode, selectedKey]);

  const attachedCheckIds = useMemo(
    () => new Set(controlAssociations.map((a) => a.check_id)),
    [controlAssociations]
  );

  const filteredControls = useMemo(() => {
    const q = controlQuery.trim().toLowerCase();
    if (!q) return controls.slice(0, 50);
    return controls
      .filter(
        (c) =>
          c.scf_control_id.toLowerCase().includes(q) ||
          (c.control_name || '').toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [controls, controlQuery]);

  const filteredNn = useMemo(() => {
    const q = controlQuery.trim().toLowerCase();
    if (!q) return nnControls.slice(0, 50);
    return nnControls
      .filter((c) => c.ctl_name.toLowerCase().includes(q) || (c.ctl_description || '').toLowerCase().includes(q))
      .slice(0, 50);
  }, [nnControls, controlQuery]);

  const assocCountByScf = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of associations) if (a.scf_control_id) m.set(a.scf_control_id, (m.get(a.scf_control_id) || 0) + 1);
    return m;
  }, [associations]);

  const assocCountByNn = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of associations) if (a.nn_ctl_name) m.set(a.nn_ctl_name, (m.get(a.nn_ctl_name) || 0) + 1);
    return m;
  }, [associations]);

  const doAttach = async () => {
    if (!selectedKey || !attachPick) return;
    setBusy(true);
    try {
      await attachCheck(
        assocMode === 'scf' ? { scf_control_id: selectedKey } : { nn_ctl_name: selectedKey },
        attachPick
      );
      setAttachPick('');
      await refresh();
    } catch (e: any) {
      push(e?.message || 'Attach failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const doDetach = async (a: ControlCheckAssociation) => {
    setBusy(true);
    try {
      await detachCheck(a.id);
      await refresh();
    } catch (e: any) {
      push(e?.message || 'Detach failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const checkById = useMemo(() => {
    const m = new Map<string, ControlCheck>();
    for (const c of checks) m.set(c.check_id, c);
    return m;
  }, [checks]);

  return (
    <div className="space-y-6">
      {/* ───── Catalogue ───── */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Control Checks Library ({checks.length})</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Global catalogue of Prowler-based checks. Tenants run these against their cloud via
              the <span className="font-mono">zti-hub</span> CLI. Shared across all tenants.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => refresh()}
              disabled={loading || busy}
              className="text-sm px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              Refresh
            </button>
            <button
              onClick={() => setEditing({ id: null, form: { ...emptyForm } })}
              disabled={busy}
              className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              + New check
            </button>
          </div>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center text-gray-500 dark:text-gray-400">Loading…</div>
        ) : checks.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-500 dark:text-gray-400">
            No checks yet. Add one or seed via Auto-assign.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-5 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Check</th>
                  <th className="px-5 py-2 text-left font-medium text-gray-600 dark:text-gray-300 w-24">Provider</th>
                  <th className="px-5 py-2 text-left font-medium text-gray-600 dark:text-gray-300 w-24">Severity</th>
                  <th className="px-5 py-2 text-right font-medium text-gray-600 dark:text-gray-300 w-32">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {checks.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30 align-top">
                    <td className="px-5 py-2">
                      <div className="font-medium">{c.title}</div>
                      <div className="font-mono text-xs text-gray-500 dark:text-gray-400 break-all">{c.check_id}</div>
                      {c.description && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{c.description}</div>
                      )}
                    </td>
                    <td className="px-5 py-2">
                      <span className="uppercase font-mono text-xs">{c.provider}</span>
                      {c.service && <span className="text-gray-400"> / {c.service}</span>}
                    </td>
                    <td className="px-5 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${severityBadge(c.severity)}`}>
                        {c.severity}
                      </span>
                    </td>
                    <td className="px-5 py-2 text-right">
                      <button
                        onClick={() =>
                          setEditing({
                            id: c.id,
                            form: {
                              check_id: c.check_id,
                              title: c.title,
                              description: c.description || '',
                              provider: c.provider,
                              service: c.service || '',
                              severity: c.severity,
                              source: c.source,
                              remediation: c.remediation || '',
                            },
                          })
                        }
                        className="text-blue-600 hover:underline mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => removeCheck(c)}
                        disabled={busy}
                        className="text-red-600 hover:underline disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ───── Associations ───── */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Check ↔ Control Associations</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Map checks to SCF controls and Non-Negotiable (NN) controls. The main app shows a ▶ run
              button only on controls that have at least one associated check.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* SCF / NN segmented toggle */}
            <div className="inline-flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden text-sm">
              {(['scf', 'nn'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => { setAssocMode(m); setAttachPick(''); }}
                  className={`px-3 py-1.5 ${
                    assocMode === m
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {m === 'scf' ? 'SCF Controls' : 'NN Controls'}
                </button>
              ))}
            </div>
            <button
              onClick={onAutoAssign}
              disabled={busy}
              className="text-sm px-3 py-1.5 rounded border border-emerald-500 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 disabled:opacity-50"
            >
              Auto-assign GCP checks
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-gray-200 dark:divide-gray-700">
          {/* control picker */}
          <div className="p-5 space-y-3">
            <input
              type="text"
              value={controlQuery}
              onChange={(e) => setControlQuery(e.target.value)}
              placeholder={assocMode === 'scf' ? 'Search SCF control (id or name)…' : 'Search NN control (name)…'}
              className="w-full text-sm px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
            />
            <div className="max-h-80 overflow-y-auto border border-gray-100 dark:border-gray-700 rounded">
              {assocMode === 'scf' ? (
                filteredControls.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-gray-500 dark:text-gray-400">No matching controls.</div>
                ) : (
                  filteredControls.map((c) => {
                    const n = assocCountByScf.get(c.scf_control_id) || 0;
                    const active = selectedControl?.scf_control_id === c.scf_control_id;
                    return (
                      <button
                        key={c.scf_control_id}
                        onClick={() => setSelectedControl(c)}
                        className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 dark:border-gray-700 last:border-0 ${
                          active ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-900/30'
                        }`}
                      >
                        <span className="font-mono">{c.scf_control_id}</span>
                        <span className="text-gray-600 dark:text-gray-300"> — {c.control_name || '—'}</span>
                        {n > 0 && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            {n} check{n > 1 ? 's' : ''}
                          </span>
                        )}
                      </button>
                    );
                  })
                )
              ) : filteredNn.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-gray-500 dark:text-gray-400">No matching NN controls.</div>
              ) : (
                filteredNn.map((c) => {
                  const n = assocCountByNn.get(c.ctl_name) || 0;
                  const active = selectedNn?.ctl_name === c.ctl_name;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedNn(c)}
                      className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 dark:border-gray-700 last:border-0 ${
                        active ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-900/30'
                      }`}
                    >
                      <span className="px-1.5 py-0.5 mr-1.5 rounded text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">NN</span>
                      <span className="text-gray-700 dark:text-gray-200">{c.ctl_name}</span>
                      {n > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                          {n} check{n > 1 ? 's' : ''}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* attached checks for selected control */}
          <div className="p-5 space-y-3">
            {!selectedKey ? (
              <div className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
                Select a {assocMode === 'scf' ? 'SCF' : 'NN'} control to manage its checks.
              </div>
            ) : (
              <>
                <div>
                  <div className="text-sm font-semibold flex items-center gap-1.5">
                    {assocMode === 'nn' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">NN</span>
                    )}
                    <span className={assocMode === 'scf' ? 'font-mono' : ''}>{selectedKey}</span>
                  </div>
                  {assocMode === 'scf' && selectedName && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">{selectedName}</div>
                  )}
                </div>

                {controlAssociations.length === 0 ? (
                  <div className="text-xs text-gray-500 dark:text-gray-400">No checks attached yet.</div>
                ) : (
                  <ul className="space-y-1.5">
                    {controlAssociations.map((a) => {
                      const c = checkById.get(a.check_id);
                      return (
                        <li
                          key={a.id}
                          className="flex items-center justify-between gap-2 px-3 py-1.5 rounded border border-gray-100 dark:border-gray-700"
                        >
                          <div className="min-w-0">
                            <div className="text-sm truncate">{a.title || a.check_id}</div>
                            <div className="font-mono text-[11px] text-gray-500 dark:text-gray-400 truncate">
                              {a.check_id}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {c && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${severityBadge(c.severity)}`}>
                                {c.severity}
                              </span>
                            )}
                            <button
                              onClick={() => doDetach(a)}
                              disabled={busy}
                              className="text-red-600 hover:underline text-xs disabled:opacity-50"
                            >
                              Detach
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                  <select
                    value={attachPick}
                    onChange={(e) => setAttachPick(e.target.value)}
                    className="flex-1 text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
                  >
                    <option value="">+ Attach a check…</option>
                    {checks
                      .filter((c) => !attachedCheckIds.has(c.check_id))
                      .map((c) => (
                        <option key={c.id} value={c.check_id}>
                          [{c.provider}] {c.title}
                        </option>
                      ))}
                  </select>
                  <button
                    onClick={doAttach}
                    disabled={busy || !attachPick}
                    className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Attach
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ───── Editor modal ───── */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-base font-semibold">
                {editing.id ? 'Edit check' : 'New check'}
              </h3>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <label className="block">
                <span className="text-xs text-gray-500 dark:text-gray-400">Check ID (Prowler check name)</span>
                <input
                  value={editing.form.check_id}
                  disabled={!!editing.id}
                  onChange={(e) => setEditing({ ...editing, form: { ...editing.form, check_id: e.target.value } })}
                  className="w-full mt-1 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 font-mono disabled:opacity-60"
                  placeholder="e.g. cloudstorage_bucket_public_access"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500 dark:text-gray-400">Title</span>
                <input
                  value={editing.form.title}
                  onChange={(e) => setEditing({ ...editing, form: { ...editing.form, title: e.target.value } })}
                  className="w-full mt-1 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500 dark:text-gray-400">Description</span>
                <textarea
                  value={editing.form.description}
                  onChange={(e) => setEditing({ ...editing, form: { ...editing.form, description: e.target.value } })}
                  rows={2}
                  className="w-full mt-1 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
                />
              </label>
              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Provider</span>
                  <select
                    value={editing.form.provider}
                    onChange={(e) => setEditing({ ...editing, form: { ...editing.form, provider: e.target.value } })}
                    className="w-full mt-1 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Service</span>
                  <input
                    value={editing.form.service}
                    onChange={(e) => setEditing({ ...editing, form: { ...editing.form, service: e.target.value } })}
                    className="w-full mt-1 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
                    placeholder="compute"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Severity</span>
                  <select
                    value={editing.form.severity}
                    onChange={(e) => setEditing({ ...editing, form: { ...editing.form, severity: e.target.value } })}
                    className="w-full mt-1 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
                  >
                    {SEVERITIES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="text-xs text-gray-500 dark:text-gray-400">Remediation</span>
                <textarea
                  value={editing.form.remediation}
                  onChange={(e) => setEditing({ ...editing, form: { ...editing.form, remediation: e.target.value } })}
                  rows={2}
                  className="w-full mt-1 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
                />
              </label>
            </div>
            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                disabled={busy}
                className="text-sm px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={saveCheck}
                disabled={busy}
                className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
