import React, { useEffect, useMemo, useState } from 'react';
import * as SupabaseService from '../../services/supabase';
import { ScfFramework, FwcrPreview, FwcrApplyResult, NnPreview } from '../../types';

interface OrgSettingsTabProps {
    isActive?: boolean;
    readOnly?: boolean;
}

type RecomputeUiState =
    | { kind: 'idle' }
    | { kind: 'previewing' }
    | { kind: 'confirm'; preview: FwcrPreview; nn: NnPreview }
    | { kind: 'applying' }
    | { kind: 'done'; result: FwcrApplyResult; nnAdded: number }
    | { kind: 'error'; message: string };

export const OrgSettingsTab: React.FC<OrgSettingsTabProps> = ({ isActive = true, readOnly = false }) => {
    const [policyRefreshMonths, setPolicyRefreshMonths] = useState(3);
    const [frameworks, setFrameworks] = useState<ScfFramework[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [savedSelected, setSavedSelected] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<string | null>(null);
    const [recomputeState, setRecomputeState] = useState<RecomputeUiState>({ kind: 'idle' });

    useEffect(() => {
        if (!isActive) return;
        setLoading(true);
        Promise.all([
            SupabaseService.getOrgSettings(),
            SupabaseService.getScfFrameworks(),
        ])
            .then(([settings, fws]) => {
                setPolicyRefreshMonths(settings.policy_refresh_months);
                const saved = new Set(settings.needed_framework || []);
                setSelected(saved);
                setSavedSelected(new Set(saved));
                setFrameworks(fws || []);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [isActive]);

    const commonFrameworks = useMemo(() => frameworks.filter((f) => f.is_common), [frameworks]);
    const allByRegion = useMemo(() => {
        const groups: Record<string, ScfFramework[]> = {};
        for (const f of frameworks) (groups[f.region] = groups[f.region] || []).push(f);
        return groups;
    }, [frameworks]);

    const searchHits = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return [] as ScfFramework[];
        return frameworks
            .filter((f) => f.display_name.toLowerCase().includes(q))
            .slice(0, 30);
    }, [frameworks, search]);

    // Selected frameworks that are NOT in the catalog (legacy values stored
    // before the SCF picker existed). Surface them so admins can see + remove.
    const orphanSelected = useMemo(() => {
        const names = new Set(frameworks.map((f) => f.name));
        return [...selected].filter((s) => !names.has(s));
    }, [frameworks, selected]);

    const hasUnsavedSelection = useMemo(() => {
        if (selected.size !== savedSelected.size) return true;
        for (const v of selected) if (!savedSelected.has(v)) return true;
        return false;
    }, [selected, savedSelected]);

    const toggle = (name: string) => {
        if (readOnly) return;
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const handleSaveSettings = async () => {
        setSaving(true);
        setSaveMsg(null);
        try {
            const prevSelected = new Set(savedSelected);
            const res = await SupabaseService.updateOrgSettings({
                policy_refresh_months: policyRefreshMonths,
                needed_framework: [...selected],
            });
            setPolicyRefreshMonths(res.policy_refresh_months);
            const newSaved = new Set(res.needed_framework || []);
            setSavedSelected(newSaved);
            setSelected(new Set(newSaved));

            // Activity log: capture the framework delta so the audit trail
            // says what actually changed, not just "settings touched".
            const added = [...newSaved].filter((f) => !prevSelected.has(f));
            const removed = [...prevSelected].filter((f) => !newSaved.has(f));
            await SupabaseService.logAllActivity({
                action: 'Updated Org Settings',
                module: 'Organisation',
                event_data: {
                    policy_refresh_months: res.policy_refresh_months,
                    frameworks_added: added,
                    frameworks_removed: removed,
                    frameworks_total: newSaved.size,
                },
            });

            setSaveMsg('Settings saved.');
            setTimeout(() => setSaveMsg(null), 3000);
        } catch (e: any) {
            setSaveMsg(e?.message || 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const handleRecompute = async () => {
        // Always save the selection first so the agent reads fresh data.
        if (hasUnsavedSelection) {
            await handleSaveSettings();
        }
        setRecomputeState({ kind: 'previewing' });
        try {
            // Framework standards (fwcr agent) + NN baseline gap, in parallel.
            const [preview, nn] = await Promise.all([
                SupabaseService.recomputeControlRegistryPreview(),
                SupabaseService.recomputeNnPreview(),
            ]);
            setRecomputeState({ kind: 'confirm', preview, nn });
        } catch (e: any) {
            setRecomputeState({ kind: 'error', message: e?.message || 'Preview failed' });
        }
    };

    const handleConfirmApply = async () => {
        setRecomputeState({ kind: 'applying' });
        try {
            // Apply the framework-standard diff and re-seed any missing NN
            // baseline controls. NN seeding is idempotent + additive (never
            // deletes), so it only fills gaps — safe to run on every recompute.
            const [result, nnRes] = await Promise.all([
                SupabaseService.recomputeControlRegistry(),
                SupabaseService.reseedNnControls(),
            ]);
            const nnAdded = typeof nnRes?.data === 'number' ? nnRes.data : 0;
            // Activity log: single summary row per recompute (don't spam one
            // per affected control). The agent's per-row diff is recoverable
            // from event_data + the preview if needed.
            await SupabaseService.logAllActivity({
                action: 'Recomputed Control Registry',
                module: 'Governance',
                event_data: {
                    selected_frameworks: result.selected_frameworks,
                    added: result.applied.added,
                    updated: result.applied.updated,
                    deleted: result.applied.deleted,
                    kept_orphan_enforced: result.kept_orphan_enforced,
                    nn_added: nnAdded,
                },
            });
            setRecomputeState({ kind: 'done', result, nnAdded });
        } catch (e: any) {
            setRecomputeState({ kind: 'error', message: e?.message || 'Apply failed' });
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Organisation Settings</h2>

            {/* Policy Settings */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-4">Policy Settings</h3>
                <div className="flex items-center gap-4">
                    <label htmlFor="policy-refresh-months" className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        Policy Refresh / Expiry Time Frame
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            id="policy-refresh-months"
                            type="number"
                            min={1}
                            max={120}
                            value={policyRefreshMonths}
                            onChange={(e) => setPolicyRefreshMonths(Math.max(1, parseInt(e.target.value) || 1))}
                            disabled={readOnly}
                            className={`w-20 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
                        />
                        <span className="text-sm text-gray-500 dark:text-gray-400">months</span>
                    </div>
                </div>
                <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                    Approved policies will automatically expire and move to "In Review" status after this period.
                </p>
            </div>

            {/* Frameworks & Regulations */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
                <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Framework, Regulations &amp; NN controls
                    </h3>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                        {selected.size} selected + NN baseline · {frameworks.length} available in SCF catalog
                    </span>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
                    Picks the frameworks your organisation must comply with. Non-Negotiables (NN) are baseline
                    controls applied to every organisation and cannot be removed. Drives the Compliance tab and the
                    Control Registry recompute below.
                </p>

                {frameworks.length === 0 ? (
                    <p className="text-sm text-amber-600 dark:text-amber-400 italic">
                        No SCF framework catalog found. Ask an SME to upload the SCF reference workbook via
                        the internal tool's Control Framework tab. The NN baseline still applies and can be
                        recomputed below.
                    </p>
                ) : (
                    <>
                        {/* Common chips */}
                        {commonFrameworks.length > 0 && (
                            <div className="mb-4">
                                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Common</div>
                                <div className="flex flex-wrap gap-2">
                                    {commonFrameworks.map((f) => (
                                        <FwChip key={f.name} fw={f} selected={selected.has(f.name)} onToggle={toggle} readOnly={readOnly} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Search */}
                        <div className="mb-4">
                            <input
                                type="text"
                                placeholder="Search 250+ frameworks (e.g. NIST 800-171, HIPAA, DORA)…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                disabled={readOnly}
                                className="block w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            {search.trim() && (
                                <div className="mt-2 max-h-56 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md divide-y divide-gray-100 dark:divide-gray-700">
                                    {searchHits.length === 0 ? (
                                        <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No matches.</div>
                                    ) : (
                                        searchHits.map((f) => (
                                            <button
                                                key={f.name}
                                                onClick={() => toggle(f.name)}
                                                disabled={readOnly}
                                                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/60 ${selected.has(f.name) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                                            >
                                                <span>{f.display_name}</span>
                                                <span className="text-xs text-gray-400">{f.region}{selected.has(f.name) ? ' · selected' : ''}</span>
                                            </button>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Selected panel */}
                        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Selected ({selected.size} + NN baseline)</div>
                            <div className="flex flex-wrap gap-2">
                                {/* Non-Negotiables: baseline, always applied, cannot be removed. */}
                                <span
                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-gray-200 text-gray-500 border border-gray-300 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600"
                                    title="Non-Negotiables are baseline controls applied to every organisation. Always selected — cannot be removed."
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                    Non-Negotiables
                                </span>
                                {[...selected].sort().map((name) => {
                                    const fw = frameworks.find((f) => f.name === name);
                                    const label = fw?.display_name || name;
                                    return (
                                        <span key={name} className="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full text-sm bg-blue-600 text-white">
                                            {label}
                                            {!readOnly && (
                                                <button
                                                    onClick={() => toggle(name)}
                                                    className="ml-1 w-5 h-5 rounded-full hover:bg-white/20 inline-flex items-center justify-center"
                                                    title="Remove"
                                                >
                                                    ×
                                                </button>
                                            )}
                                        </span>
                                    );
                                })}
                            </div>
                            {selected.size === 0 && (
                                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 italic">No frameworks selected — the NN baseline still applies.</p>
                            )}
                            {orphanSelected.length > 0 && (
                                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                                    {orphanSelected.length} legacy framework name(s) not in current SCF catalog. They'll match nothing during recompute. Consider removing.
                                </p>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Save + Recompute */}
            {readOnly ? (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                    You have view-only access to settings. Contact your admin to make changes.
                </p>
            ) : (
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        onClick={handleSaveSettings}
                        disabled={saving}
                        className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
                    >
                        {saving ? 'Saving…' : 'Save Settings'}
                    </button>
                    {/* Always available: recompute re-seeds the NN baseline (covering a
                        new NN release or accidental deletion) and rebuilds framework
                        standards — even when the framework selection hasn't changed. */}
                    <button
                        onClick={handleRecompute}
                        disabled={saving || recomputeState.kind === 'previewing' || recomputeState.kind === 'applying'}
                        className="px-4 py-1.5 text-sm font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:bg-gray-300 transition-colors"
                        title="Saves selection, re-seeds the NN baseline, and rebuilds framework-standard controls (shows a diff to confirm first)"
                    >
                        Recompute Control Registry and Save
                    </button>
                    {saveMsg && <span className="text-sm text-gray-600 dark:text-gray-300">{saveMsg}</span>}
                </div>
            )}

            {/* Recompute modal */}
            {recomputeState.kind !== 'idle' && (
                <RecomputeModal
                    state={recomputeState}
                    onClose={() => setRecomputeState({ kind: 'idle' })}
                    onConfirm={handleConfirmApply}
                />
            )}
        </div>
    );
};

// ── Chip ─────────────────────────────────────────────────────────────────────
const FwChip: React.FC<{ fw: ScfFramework; selected: boolean; onToggle: (name: string) => void; readOnly: boolean }> = ({
    fw, selected, onToggle, readOnly,
}) => (
    <button
        type="button"
        onClick={() => onToggle(fw.name)}
        disabled={readOnly}
        className={`px-3 py-1.5 text-sm font-medium rounded-full border transition-all duration-200 ${
            readOnly
                ? selected
                    ? 'bg-blue-600/60 text-white border-blue-600/60 cursor-not-allowed'
                    : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500 dark:border-gray-600'
                : selected
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:border-blue-500'
        }`}
    >
        {selected && (
            <svg className="inline-block w-3.5 h-3.5 mr-1 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
        )}
        {fw.display_name}
    </button>
);

// ── Recompute modal ──────────────────────────────────────────────────────────
const RecomputeModal: React.FC<{
    state: RecomputeUiState;
    onClose: () => void;
    onConfirm: () => void;
}> = ({ state, onClose, onConfirm }) => {
    if (state.kind === 'idle') return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-xl mx-4 max-h-[85vh] overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                        Recompute Control Registry
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="px-6 py-5 overflow-y-auto text-sm text-gray-700 dark:text-gray-200">
                    {state.kind === 'previewing' && (
                        <div className="py-4 flex items-center gap-3"><Spinner /> Computing diff…</div>
                    )}
                    {state.kind === 'applying' && (
                        <div className="py-4 flex items-center gap-3"><Spinner /> Applying changes…</div>
                    )}
                    {state.kind === 'error' && (
                        <div className="rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-red-800 dark:text-red-200">
                            {state.message}
                        </div>
                    )}
                    {state.kind === 'confirm' && (
                        <>
                            <p className="mb-3">
                                The Fw-ControlRegistry agent will apply these changes for the {' '}
                                <span className="font-semibold">{state.preview.selected_frameworks.length}</span>{' '}
                                selected framework(s):
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                                <SummaryCard label="To add" value={state.preview.summary.to_add} tone="green" />
                                <SummaryCard label="To update" value={state.preview.summary.to_update} tone="blue" />
                                <SummaryCard label="Unenforced — to delete" value={state.preview.summary.to_delete_unenforced} tone="red" />
                                <SummaryCard label="Enforced — keep as-is" value={state.preview.summary.keep_orphan_enforced} tone="amber" />
                                <SummaryCard label="Unchanged" value={state.preview.summary.unchanged} tone="gray" />
                                <SummaryCard label="NN — to (re)add" value={state.nn.to_add} tone="green" />
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                                Enforced controls (status ≠ NotEnforced OR evidence attached) survive even when their
                                framework is deselected. Their <span className="font-mono">ctl_ref_fw</span> retains the
                                original framework names.
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                                <span className="font-semibold">NN baseline:</span> {state.nn.to_add === 0
                                    ? 'all Non-Negotiable controls are already present — nothing to add.'
                                    : `${state.nn.to_add} Non-Negotiable control(s) missing for this org will be re-added. NN is only ever added, never removed.`}
                            </p>
                            <details className="text-xs">
                                <summary className="cursor-pointer text-gray-500 dark:text-gray-400">Show sample changes (max 10 per bucket)</summary>
                                <SamplePreview samples={state.preview.samples} />
                            </details>
                        </>
                    )}
                    {state.kind === 'done' && (
                        <div className="space-y-3">
                            <div className="rounded border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3 text-green-800 dark:text-green-200">
                                Control registry rebuilt successfully.
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                <SummaryCard label="Added"   value={state.result.applied.added}   tone="green" />
                                <SummaryCard label="Updated" value={state.result.applied.updated} tone="blue" />
                                <SummaryCard label="Deleted" value={state.result.applied.deleted} tone="red" />
                                <SummaryCard label="Kept (enforced)" value={state.result.kept_orphan_enforced} tone="amber" />
                                <SummaryCard label="NN added" value={state.nnAdded} tone="green" />
                            </div>
                        </div>
                    )}
                </div>
                <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
                    {state.kind === 'confirm' && (
                        <>
                            <button onClick={onClose} className="px-4 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
                                Cancel
                            </button>
                            <button onClick={onConfirm} className="px-4 py-2 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700">
                                Apply
                            </button>
                        </>
                    )}
                    {(state.kind === 'done' || state.kind === 'error') && (
                        <button onClick={onClose} className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">
                            Close
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const TONE_CLASSES: Record<string, string> = {
    green: 'border-green-200 text-green-700 dark:border-green-800 dark:text-green-300',
    blue:  'border-blue-200  text-blue-700  dark:border-blue-800  dark:text-blue-300',
    red:   'border-red-200   text-red-700   dark:border-red-800   dark:text-red-300',
    amber: 'border-amber-200 text-amber-700 dark:border-amber-800 dark:text-amber-300',
    gray:  'border-gray-200  text-gray-700  dark:border-gray-700  dark:text-gray-300',
};

const SummaryCard: React.FC<{ label: string; value: number; tone: keyof typeof TONE_CLASSES }> = ({ label, value, tone }) => (
    <div className={`rounded border p-2 text-center ${TONE_CLASSES[tone] || TONE_CLASSES.gray}`}>
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-[10px] uppercase tracking-wide mt-0.5">{label}</div>
    </div>
);

const Spinner: React.FC = () => (
    <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" />
);

const SamplePreview: React.FC<{ samples: FwcrPreview['samples'] }> = ({ samples }) => (
    <div className="mt-3 space-y-3">
        {(['to_add', 'to_update', 'to_delete_unenforced', 'keep_orphan_enforced'] as const).map((bucket) => {
            const rows = samples[bucket];
            if (!rows.length) return null;
            return (
                <div key={bucket}>
                    <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1">{bucket}</div>
                    <ul className="ml-4 list-disc text-gray-600 dark:text-gray-400 space-y-0.5">
                        {rows.map((r: any) => (
                            <li key={r.scf_control_id} className="font-mono text-[11px] truncate">
                                {r.ctl_name || r.scf_control_id}
                                {r.ctl_ref_fw_new && (
                                    <span className="ml-2 text-gray-400">→ {r.ctl_ref_fw_new.join(', ')}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            );
        })}
    </div>
);
