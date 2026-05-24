import React, { useEffect, useMemo, useState } from 'react';
import { PolicyV2, MapperRunResult } from '../../types';
import * as SupabaseService from '../../services/supabase';
import { StarIcon } from '../Icons';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    policies: PolicyV2[];
    onMasterUpdated?: () => void;     // parent refetches policies after master change
    onOpenVisualizer?: (masterPolicyId: string) => void;
}

type Phase = 'idle' | 'picking_master' | 'running' | 'done' | 'error';

export const MapperRunModal: React.FC<Props> = ({
    isOpen,
    onClose,
    policies,
    onMasterUpdated,
    onOpenVisualizer,
}) => {
    const [phase, setPhase] = useState<Phase>('idle');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [result, setResult] = useState<MapperRunResult | null>(null);
    const [pickedMasterId, setPickedMasterId] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    const masterPolicy = useMemo(
        () => policies.find(p => p.is_master) || null,
        [policies],
    );

    useEffect(() => {
        if (!isOpen) {
            setPhase('idle');
            setErrorMsg(null);
            setResult(null);
            setPickedMasterId(null);
            setSearch('');
        }
    }, [isOpen]);

    const candidates = useMemo(() => {
        const q = search.toLowerCase();
        return q
            ? policies.filter(p =>
                p.name.toLowerCase().includes(q) ||
                (p.policy_ref || '').toLowerCase().includes(q),
            )
            : policies;
    }, [policies, search]);

    const handleRun = async () => {
        setPhase('running');
        setErrorMsg(null);
        try {
            const res = await SupabaseService.runMapper('policies');
            setResult(res);
            if (res.status === 'needs_master') {
                setPhase('picking_master');
            } else if (res.status === 'needs_scf_reference') {
                setErrorMsg(
                    res.message ||
                        'No SCF reference uploaded yet. Ask an internal SME to upload the latest SCF workbook via the ZTI Internal Tool → SME → Control Framework tab, then re-run the mapper.'
                );
                setPhase('error');
            } else {
                setPhase('done');
            }
        } catch (e: any) {
            setErrorMsg(e?.message || 'Mapper run failed');
            setPhase('error');
        }
    };

    const handleSetMaster = async (policyId: string) => {
        try {
            await SupabaseService.setPolicyMaster(policyId, true);
            onMasterUpdated?.();
            await handleRun();
        } catch (e: any) {
            setErrorMsg(e?.message || 'Failed to mark master policy');
            setPhase('error');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Mapper Agent — Policy
                        </h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            Reads your master Information Security policy, extracts Security Objectives, and maps each to the SCF (Secure Controls Framework) domains. Also links related child policies.
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>

                <div className="px-6 py-5 overflow-y-auto">
                    {phase === 'idle' && (
                        <div className="space-y-4">
                            <div className="rounded border border-gray-200 dark:border-gray-700 p-3">
                                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                    Master policy
                                </div>
                                {masterPolicy ? (
                                    <div className="mt-1 flex items-center gap-2">
                                        <StarIcon className="h-4 w-4 text-amber-500" />
                                        <span className="font-medium text-gray-900 dark:text-white">{masterPolicy.name}</span>
                                        {masterPolicy.policy_ref && (
                                            <span className="text-xs text-gray-500">({masterPolicy.policy_ref})</span>
                                        )}
                                    </div>
                                ) : (
                                    <div className="mt-1 text-sm text-amber-600 dark:text-amber-400">
                                        No master policy marked yet. The agent will ask you to pick one before mapping.
                                    </div>
                                )}
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                Running the mapper will wipe and rewrite the policy subgraph in Neo4j for this organisation.
                                Child policies in Supabase are never deleted.
                            </p>
                            <div className="flex justify-end gap-2 pt-2">
                                <button onClick={onClose} className="px-4 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
                                    Cancel
                                </button>
                                <button
                                    onClick={masterPolicy ? handleRun : () => setPhase('picking_master')}
                                    className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
                                >
                                    {masterPolicy ? 'Run mapping' : 'Pick master policy'}
                                </button>
                            </div>
                        </div>
                    )}

                    {phase === 'picking_master' && (
                        <div className="space-y-3">
                            <div className="text-sm text-gray-700 dark:text-gray-200">
                                Pick the policy that should be marked as the organisation's <strong>master Information Security policy</strong>.
                                The mapper will run automatically after you select.
                            </div>
                            <input
                                type="text"
                                placeholder="Search policies..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            />
                            <div className="max-h-72 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded">
                                {candidates.length === 0 ? (
                                    <div className="p-4 text-sm text-gray-500">No policies match your search.</div>
                                ) : candidates.map(p => (
                                    <button
                                        key={p.policy_id}
                                        onClick={() => setPickedMasterId(p.policy_id)}
                                        className={`w-full text-left px-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0 flex items-center gap-2 ${
                                            pickedMasterId === p.policy_id
                                                ? 'bg-blue-50 dark:bg-blue-900/30'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        {p.is_master && <StarIcon className="h-4 w-4 text-amber-500" />}
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</div>
                                            <div className="text-xs text-gray-500 truncate">{p.policy_ref || '—'} · {p.document_type || 'Policy'}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button onClick={() => setPhase('idle')} className="px-4 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
                                    Back
                                </button>
                                <button
                                    disabled={!pickedMasterId}
                                    onClick={() => pickedMasterId && handleSetMaster(pickedMasterId)}
                                    className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300"
                                >
                                    Mark as master & run
                                </button>
                            </div>
                        </div>
                    )}

                    {phase === 'running' && (
                        <div className="py-8 flex flex-col items-center gap-3 text-gray-700 dark:text-gray-200">
                            <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
                            <div className="text-sm">Reading the master policy, extracting Security Objectives, and mapping them to SCF domains…</div>
                        </div>
                    )}

                    {phase === 'done' && result && (
                        <div className="space-y-4">
                            <div className="rounded border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3 text-sm text-green-800 dark:text-green-200">
                                Mapping complete. The graph has been rewritten in Neo4j.
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <SummaryCard label="Security objectives" value={result.summary?.objectives ?? 0} />
                                <SummaryCard label="SCF domains" value={result.summary?.scf_domains ?? 0} />
                                <SummaryCard label="Child links" value={result.summary?.child_links ?? 0} />
                                <SummaryCard label="Orphans" value={result.summary?.orphans ?? 0} />
                            </div>
                            {result.extraction && result.extraction.security_objectives.length > 0 && (
                                <details className="text-sm">
                                    <summary className="cursor-pointer text-gray-600 dark:text-gray-300">Show extracted objectives</summary>
                                    <ul className="mt-2 space-y-1">
                                        {result.extraction.security_objectives.map(o => (
                                            <li key={o.name} className="text-gray-700 dark:text-gray-200">
                                                <span className="font-medium">{o.name}</span>
                                                {o.scf_ids?.length > 0 && (
                                                    <span className="ml-2 text-xs text-gray-500 font-mono">→ {o.scf_ids.join(', ')}</span>
                                                )}
                                                {typeof o.confidence === 'number' && (
                                                    <span className="ml-2 text-xs text-gray-500">conf {o.confidence.toFixed(2)}</span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                            <div className="flex justify-end gap-2 pt-2">
                                <button onClick={onClose} className="px-4 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
                                    Close
                                </button>
                                {result.master_policy_id && onOpenVisualizer && (
                                    <button
                                        onClick={() => result.master_policy_id && onOpenVisualizer(result.master_policy_id)}
                                        className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
                                    >
                                        Open in Mapper Visualizer
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {phase === 'error' && (
                        <div className="space-y-4">
                            <div className="rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-800 dark:text-red-200">
                                {errorMsg || 'Mapper run failed.'}
                            </div>
                            <div className="flex justify-end gap-2">
                                <button onClick={() => setPhase('idle')} className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">
                                    Try again
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const SummaryCard: React.FC<{label: string; value: number}> = ({ label, value }) => (
    <div className="rounded border border-gray-200 dark:border-gray-700 p-3 text-center">
        <div className="text-2xl font-semibold text-gray-900 dark:text-white">{value}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</div>
    </div>
);
