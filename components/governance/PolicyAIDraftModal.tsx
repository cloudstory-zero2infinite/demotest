import React, { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import { BotIcon, XIcon } from '../Icons';
import * as SupabaseService from '../../services/supabase';

const AI_AGENT_URL = ((import.meta as any).env.VITE_AI_AGENT_URL as string) || '';

type PolicyFamily = 'generic' | 'ISO27001' | 'SOC2';

interface NeedInfo {
    missing: string[];
    prompts: Record<string, string>;
    reasons: Record<string, string>;
}

interface Citation {
    ref: number;
    file: string;
    section: string | null;
}

interface PolicyAIDraftModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUseDraft: (markdown: string) => void;
}

export const PolicyAIDraftModal: React.FC<PolicyAIDraftModalProps> = ({ isOpen, onClose, onUseDraft }) => {
    const [policyType, setPolicyType] = useState('Access Control Policy');
    const [policyFamily, setPolicyFamily] = useState<PolicyFamily>('generic');
    const [userPrompt, setUserPrompt] = useState('');
    const [streaming, setStreaming] = useState(false);
    const [markdown, setMarkdown] = useState('');
    const [citations, setCitations] = useState<Citation[]>([]);
    const [needInfo, setNeedInfo] = useState<NeedInfo | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [orgMemoryDiff, setOrgMemoryDiff] = useState('');
    const [orgMemorySaving, setOrgMemorySaving] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        if (!isOpen) {
            setMarkdown('');
            setCitations([]);
            setNeedInfo(null);
            setError(null);
            setStreaming(false);
            setUserPrompt('');
            setOrgMemoryDiff('');
            abortRef.current?.abort();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleGenerate = async () => {
        setError(null);
        setNeedInfo(null);
        setMarkdown('');
        setCitations([]);
        setStreaming(true);

        try {
            const orgId = await SupabaseService.getUserOrgId();
            if (!orgId) {
                setError('No organisation found for current user.');
                setStreaming(false);
                return;
            }

            abortRef.current = new AbortController();
            const resp = await fetch(`${AI_AGENT_URL}/policy/draft`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    org_id: orgId,
                    policy_type: policyType,
                    policy_family: policyFamily,
                    user_prompt: userPrompt,
                }),
                signal: abortRef.current.signal,
            });

            if (!resp.ok || !resp.body) {
                throw new Error(`Draft request failed: ${resp.status}`);
            }

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            // SSE parser: events separated by blank line, each starts with "data: "
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                let idx;
                while ((idx = buffer.indexOf('\n\n')) !== -1) {
                    const raw = buffer.slice(0, idx);
                    buffer = buffer.slice(idx + 2);
                    const line = raw.split('\n').find(l => l.startsWith('data: '));
                    if (!line) continue;
                    const payload = line.slice(6);
                    let evt: any;
                    try { evt = JSON.parse(payload); } catch { continue; }
                    if (evt.type === 'need_info') {
                        setNeedInfo({ missing: evt.missing, prompts: evt.prompts, reasons: evt.reasons });
                        setStreaming(false);
                        return;
                    } else if (evt.type === 'start') {
                        setCitations(evt.citations || []);
                    } else if (evt.type === 'chunk') {
                        setMarkdown(prev => prev + (evt.text || ''));
                    } else if (evt.type === 'done') {
                        setStreaming(false);
                    } else if (evt.type === 'error') {
                        setError(evt.message || 'Unknown error');
                        setStreaming(false);
                        return;
                    }
                }
            }
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                setError(err.message || String(err));
            }
        } finally {
            setStreaming(false);
        }
    };

    const handleSubmitOrgMemory = async () => {
        if (!orgMemoryDiff.trim()) {
            alert('Please add the missing information first.');
            return;
        }
        setOrgMemorySaving(true);
        try {
            const orgId = await SupabaseService.getUserOrgId();
            const me = await SupabaseService.getOrgMe();
            const userId = me?.userId;
            if (!orgId || !userId) {
                alert('No organisation/user context.');
                return;
            }
            // 1. Submit pending entry
            const submitResp = await fetch(`${AI_AGENT_URL}/policy/org-memory`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    org_id: orgId,
                    proposed_by: userId,
                    diff_md: orgMemoryDiff,
                    rationale: `Required for ${policyType} (${policyFamily}) draft`,
                }),
            });
            const submitJson = await submitResp.json();
            if (!submitResp.ok) throw new Error(submitJson.detail || 'Submit failed');

            // 2. Auto-approve (peer-review relaxed: anyone, even self)
            const approveResp = await fetch(`${AI_AGENT_URL}/policy/org-memory/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pending_id: submitJson.pending_id,
                    reviewer_id: userId,
                }),
            });
            if (!approveResp.ok) {
                const j = await approveResp.json();
                throw new Error(j.detail || 'Approval failed');
            }

            // 3. Clear and re-try draft
            setOrgMemoryDiff('');
            setNeedInfo(null);
            await handleGenerate();
        } catch (err: any) {
            alert('Saving organisation memory failed: ' + err.message);
        } finally {
            setOrgMemorySaving(false);
        }
    };

    const previewHtml = String(marked.parse(markdown || ''));

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
                    <div className="flex items-center gap-2">
                        <BotIcon className="h-5 w-5 text-blue-500" />
                        <h2 className="text-lg font-semibold dark:text-white">AI Policy Drafter</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                        <XIcon className="h-5 w-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    {/* Inputs */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Policy title</label>
                            <input
                                type="text"
                                value={policyType}
                                onChange={e => setPolicyType(e.target.value)}
                                className="w-full rounded-md border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Family</label>
                            <select
                                value={policyFamily}
                                onChange={e => setPolicyFamily(e.target.value as PolicyFamily)}
                                className="w-full rounded-md border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                            >
                                <option value="generic">Generic</option>
                                <option value="ISO27001">ISO 27001</option>
                                <option value="SOC2">SOC 2</option>
                            </select>
                        </div>
                        <div className="flex items-end">
                            <button
                                onClick={handleGenerate}
                                disabled={streaming}
                                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400"
                            >
                                {streaming ? 'Generating…' : 'Generate Draft'}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Additional context (optional)</label>
                        <textarea
                            value={userPrompt}
                            onChange={e => setUserPrompt(e.target.value)}
                            rows={2}
                            placeholder="e.g. Focus on cloud workloads, exclude on-prem sections."
                            className="w-full rounded-md border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                        />
                    </div>

                    {/* Red window: need_info */}
                    {needInfo && (
                        <div className="border-2 border-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                            <div className="flex items-start justify-between mb-2">
                                <h3 className="text-sm font-semibold text-red-700 dark:text-red-300">
                                    Insufficient organisation information
                                </h3>
                            </div>
                            <p className="text-xs text-red-700 dark:text-red-300 mb-3">
                                The following information will be added to your organisation memory.
                                Please provide as much accurate detail as possible — or close this window.
                            </p>
                            <ul className="text-xs text-red-800 dark:text-red-200 list-disc list-inside space-y-1 mb-3">
                                {needInfo.missing.map(key => (
                                    <li key={key}>
                                        <strong>{key}</strong>: {needInfo.prompts[key]}
                                        {needInfo.reasons[key] && (
                                            <span className="italic"> — {needInfo.reasons[key]}</span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                            <textarea
                                value={orgMemoryDiff}
                                onChange={e => setOrgMemoryDiff(e.target.value)}
                                rows={6}
                                placeholder="Provide the missing organisation details here in plain markdown…"
                                className="w-full rounded-md border-red-300 bg-white dark:bg-gray-700 dark:text-white text-sm mb-2"
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={handleSubmitOrgMemory}
                                    disabled={orgMemorySaving}
                                    className="px-3 py-1.5 bg-red-600 text-white rounded-md text-xs font-medium hover:bg-red-700 disabled:bg-gray-400"
                                >
                                    {orgMemorySaving ? 'Saving…' : 'Save & Retry'}
                                </button>
                                <button
                                    onClick={onClose}
                                    className="px-3 py-1.5 border border-red-300 text-red-700 dark:text-red-300 rounded-md text-xs font-medium hover:bg-red-100 dark:hover:bg-red-900/30"
                                >
                                    Close Window
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="border border-red-300 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-md p-3 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Streaming preview */}
                    {(markdown || streaming) && (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-sm font-semibold dark:text-white">Draft preview</h3>
                                {streaming && <span className="text-xs text-blue-500 animate-pulse">streaming…</span>}
                            </div>
                            <div
                                className="policy-prose border dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-900 max-h-96 overflow-y-auto text-sm dark:text-gray-200"
                                dangerouslySetInnerHTML={{ __html: previewHtml }}
                            />
                            {citations.length > 0 && (
                                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                    Sources:{' '}
                                    {citations.map(c => (
                                        <span key={c.ref} className="inline-block mr-2">
                                            [{c.ref}] {c.file}{c.section ? ` § ${c.section}` : ''}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t dark:border-gray-700 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => { onUseDraft(markdown); onClose(); }}
                        disabled={!markdown || streaming}
                        className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400"
                    >
                        Use this draft
                    </button>
                </div>
            </div>
        </div>
    );
};
