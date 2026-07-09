import React, { useState, useEffect, useCallback, useMemo } from 'react';

import * as SupabaseService from '../../services/supabase';
import { RiskRegisterEntry, RiskLevel, ManualRiskInput, UserRole } from '../../types';
import { ArrowPathIcon, ExclamationTriangleIcon, BotIcon, PlusIcon, PencilIcon, TrashIcon, XIcon } from '../Icons';

const LEVELS: RiskLevel[] = ['Critical', 'High', 'Medium', 'Low'];
const ALL_LEVELS: RiskLevel[] = ['Critical', 'High', 'Medium', 'Low', 'None'];

const LEVEL_BADGE: Record<string, string> = {
  Critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  High: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  Medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  Low: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  None: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

const LEVEL_CARD: Record<string, string> = {
  Critical: 'border-red-200 dark:border-red-900/50',
  High: 'border-orange-200 dark:border-orange-900/50',
  Medium: 'border-yellow-200 dark:border-yellow-900/50',
  Low: 'border-green-200 dark:border-green-900/50',
};

const LevelBadge: React.FC<{ level: string | null }> = ({ level }) => (
  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${LEVEL_BADGE[level || 'None']}`}>
    {level || 'None'}
  </span>
);

const EMPTY_FORM: ManualRiskInput = {
  risk_name: '',
  risk_grouping: '',
  risk_description: '',
  nist_csf_function: '',
  inherent_level: 'Medium',
  residual_level: 'Medium',
};

interface Props {
  isActive?: boolean;
  userRole?: UserRole | null;
}

export const RiskRegistryView: React.FC<Props> = ({ isActive = true, userRole }) => {
  const isReadOnly = userRole === 'read-only';
  const [register, setRegister] = useState<RiskRegisterEntry[]>([]);
  const [computedAt, setComputedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');

  // Manual-risk modal state.
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ManualRiskInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await SupabaseService.getRiskRegister();
      setRegister(res.register || []);
      setComputedAt(res.computed_at);
    } catch (err: any) {
      setError(err.message || 'Failed to load the risk register.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isActive) load();
  }, [isActive, load]);

  const compute = async () => {
    setComputing(true);
    setError(null);
    try {
      const res = await SupabaseService.computeRisk();
      // computeRisk only returns computed rows; reload to keep manual rows too.
      await load();
      setComputedAt(res.computed_at);
    } catch (err: any) {
      setError(err.message || 'Failed to compute risk.');
    } finally {
      setComputing(false);
    }
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (r: RiskRegisterEntry) => {
    setEditingId(r.id);
    setForm({
      risk_name: r.risk_name || '',
      risk_grouping: r.risk_grouping || '',
      risk_description: r.risk_description || '',
      nist_csf_function: r.nist_csf_function || '',
      inherent_level: (r.inherent_level || 'Medium') as RiskLevel,
      residual_level: (r.residual_level || 'Medium') as RiskLevel,
    });
    setModalOpen(true);
  };

  const saveManual = async () => {
    if (!form.risk_name.trim()) {
      setError('Risk name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingId) await SupabaseService.updateManualRisk(editingId, form);
      else await SupabaseService.addManualRisk(form);
      setModalOpen(false);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to save risk.');
    } finally {
      setSaving(false);
    }
  };

  const deleteManual = async (r: RiskRegisterEntry) => {
    if (!window.confirm(`Delete manual risk "${r.risk_name}"?`)) return;
    try {
      await SupabaseService.deleteManualRisk(r.id);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to delete risk.');
    }
  };

  const groupings = useMemo(
    () => Array.from(new Set(register.map((r) => r.risk_grouping).filter(Boolean))).sort() as string[],
    [register],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0, None: 0 };
    register.forEach((r) => { c[r.residual_level || 'None'] = (c[r.residual_level || 'None'] || 0) + 1; });
    return c;
  }, [register]);

  const filtered = useMemo(
    () =>
      register.filter(
        (r) =>
          (levelFilter === 'all' || (r.residual_level || 'None') === levelFilter) &&
          (groupFilter === 'all' || r.risk_grouping === groupFilter),
      ),
    [register, levelFilter, groupFilter],
  );

  const hasManual = register.some((r) => r.source === 'manual');
  const fmtPct = (n: number) => `${Math.round(n * 100)}%`;

  const field = (k: keyof ManualRiskInput, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Risk Registry</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Inherent &amp; residual risk derived from your control enforcement against the SCF risk catalog, plus risks you add manually.
            {computedAt && (
              <span className="ml-1">Last computed {new Date(computedAt).toLocaleString()}.</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openAdd}
            disabled={isReadOnly}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PlusIcon className="w-4 h-4" /> Add Risk
          </button>
          <button
            onClick={compute}
            disabled={computing || isReadOnly}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {computing ? <BotIcon className="w-4 h-4 animate-pulse" /> : <ArrowPathIcon className="w-4 h-4" />}
            {computing ? 'Computing…' : 'Compute Risk'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
          <ExclamationTriangleIcon className="w-4 h-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
        </div>
      )}

      {/* Summary cards (residual level) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {LEVELS.map((lvl) => (
          <button
            key={lvl}
            onClick={() => setLevelFilter(levelFilter === lvl ? 'all' : lvl)}
            className={`text-left rounded-lg border bg-white dark:bg-gray-800 px-4 py-3 transition-shadow hover:shadow-sm ${LEVEL_CARD[lvl]} ${levelFilter === lvl ? 'ring-2 ring-blue-500' : ''}`}
          >
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{counts[lvl]}</div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{lvl} residual</div>
          </button>
        ))}
      </div>

      {/* Empty state */}
      {!loading && register.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            No risks yet. Click <span className="font-semibold">Compute Risk</span> to derive inherent &amp;
            residual risk from your controls, or <span className="font-semibold">Add Risk</span> to enter one manually.
          </p>
          <p className="text-xs text-gray-400 mt-2 max-w-lg mx-auto">
            Computed risk uses framework-derived (Standard) controls. If a compute returns nothing, your org may have
            no Standard controls yet — run Settings → Organisation → “Recompute Control Registry and Save” first.
          </p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5"
            >
              <option value="all">All residual levels</option>
              {ALL_LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5"
            >
              <option value="all">All groupings</option>
              {groupings.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <span className="text-xs text-gray-400">{filtered.length} of {register.length} risks</span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr className="text-left text-xs font-semibold text-gray-500">
                  <th className="px-3 py-2 whitespace-nowrap">Risk #</th>
                  <th className="px-3 py-2 whitespace-nowrap">Grouping</th>
                  <th className="px-3 py-2">Risk</th>
                  <th className="px-3 py-2 whitespace-nowrap">Inherent</th>
                  <th className="px-3 py-2 whitespace-nowrap">Residual</th>
                  <th className="px-3 py-2 whitespace-nowrap">Controls</th>
                  <th className="px-3 py-2 whitespace-nowrap">Coverage</th>
                  {hasManual && <th className="px-3 py-2 whitespace-nowrap" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtered.map((r) => {
                  const manual = r.source === 'manual';
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-gray-600 dark:text-gray-300">
                        {r.risk_id}
                        {manual && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 align-middle">Manual</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-300">{r.risk_grouping || '—'}</td>
                      <td className="px-3 py-2 max-w-md">
                        <div className="font-medium text-gray-800 dark:text-gray-100">{r.risk_name || '—'}</div>
                        {r.risk_description && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{r.risk_description}</div>
                        )}
                      </td>
                      <td className="px-3 py-2"><LevelBadge level={r.inherent_level} /></td>
                      <td className="px-3 py-2"><LevelBadge level={r.residual_level} /></td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-300">
                        {manual ? '—' : `${r.enforced_controls}/${r.total_controls}`}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-300">
                        {r.total_weight > 0 ? fmtPct(r.enforced_weight / r.total_weight) : '—'}
                      </td>
                      {hasManual && (
                        <td className="px-3 py-2 whitespace-nowrap text-right">
                          {manual && (
                            <div className="flex gap-1 justify-end">
                              <button
                                onClick={() => openEdit(r)}
                                disabled={isReadOnly}
                                title="Edit"
                                className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <PencilIcon className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => deleteManual(r)}
                                disabled={isReadOnly}
                                title="Delete"
                                className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Add/Edit manual risk modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                {editingId ? 'Edit Risk' : 'Add Risk'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Risk name *</label>
                <input
                  value={form.risk_name}
                  onChange={(e) => field('risk_name', e.target.value)}
                  readOnly={isReadOnly}
                  className="w-full text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="e.g. Unencrypted data flow between services"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Grouping</label>
                  <input
                    value={form.risk_grouping}
                    onChange={(e) => field('risk_grouping', e.target.value)}
                    readOnly={isReadOnly}
                    className="w-full text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="e.g. Data Security"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">NIST CSF function</label>
                  <input
                    value={form.nist_csf_function}
                    onChange={(e) => field('nist_csf_function', e.target.value)}
                    readOnly={isReadOnly}
                    className="w-full text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="e.g. Protect"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                <textarea
                  value={form.risk_description}
                  onChange={(e) => field('risk_description', e.target.value)}
                  readOnly={isReadOnly}
                  rows={3}
                  className="w-full text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Inherent level</label>
                  <select
                    value={form.inherent_level}
                    onChange={(e) => field('inherent_level', e.target.value)}
                    disabled={isReadOnly}
                    className="w-full text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {ALL_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Residual level</label>
                  <select
                    value={form.residual_level}
                    onChange={(e) => field('residual_level', e.target.value)}
                    disabled={isReadOnly}
                    className="w-full text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {ALL_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setModalOpen(false)}
                disabled={saving}
                className="px-3 py-2 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={saveManual}
                disabled={saving || isReadOnly}
                className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add risk'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
