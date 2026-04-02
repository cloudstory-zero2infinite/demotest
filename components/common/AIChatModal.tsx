import React, { useState, useRef, useEffect } from 'react';
import { BotIcon, XIcon } from '../Icons';

interface AIChatModalProps {
    isOpen: boolean;
    onClose: () => void;
    module: 'assets' | 'asset_relationships' | 'compliances' | 'vulnerabilities' | 'policies';
    onConfirm: (records: Record<string, unknown>[]) => Promise<void>;
    context?: Record<string, unknown>;  // optional context passed to the AI (e.g. { asset_ids: [...] })
}

const AI_AGENT_URL = ((import.meta as any).env.VITE_AI_AGENT_URL as string);

const MODULE_LABELS: Record<string, string> = {
    assets: 'Asset',
    asset_relationships: 'Asset Relationship',
    compliances: 'Compliance Framework',
    vulnerabilities: 'Vulnerability',
    policies: 'Policy Document',
};

const MODULE_HINTS: Record<string, string> = {
    assets: 'e.g. "20 laptops connect to Building-1 access point, medium criticality"',
    asset_relationships: 'e.g. "AST-CL-001 depends on AST-CL-002, and AST-CL-003 communicates with AST-CL-004"',
    compliances: 'e.g. "ISO 27001 framework with controls A.11.1.1, A.12.1.2, status In Progress"',
    vulnerabilities: 'e.g. "Critical SQL injection vulnerability in web application, CVE-2023-1234"',
    policies: 'e.g. "Information Security Policy with version 1.0, published today, status Published"',
};

export const AIChatModal: React.FC<AIChatModalProps> = ({ isOpen, onClose, module, onConfirm, context }) => {
    const [message, setMessage] = useState('');
    const [records, setRecords] = useState<Record<string, unknown>[]>([]);
    const [columns, setColumns] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [phase, setPhase] = useState<'input' | 'review'>('input');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (isOpen) {
            setMessage('');
            setRecords([]);
            setColumns([]);
            setError(null);
            setPhase('input');
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && phase === 'input') {
            setTimeout(() => textareaRef.current?.focus(), 100);
        }
    }, [isOpen, phase]);

    const handleGenerate = async () => {
        if (!message.trim()) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${AI_AGENT_URL}/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ module, message: message.trim(), context: context ?? null }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: res.statusText }));
                throw new Error(err.detail || 'AI agent returned an error');
            }
            const data = await res.json();
            const rows: Record<string, unknown>[] = data.records || [];
            if (rows.length === 0) throw new Error('AI returned no records — try rephrasing your input.');
            const cols = Object.keys(rows[0]);
            setRecords(rows);
            setColumns(cols);
            setPhase('review');
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    const handleCellChange = (rowIdx: number, col: string, value: string) => {
        setRecords(prev =>
            prev.map((r, i) => (i === rowIdx ? { ...r, [col]: value } : r))
        );
    };

    const handleRemoveRow = (rowIdx: number) => {
        setRecords(prev => prev.filter((_, i) => i !== rowIdx));
    };

    const handleConfirm = async () => {
        if (records.length === 0) return;
        setSaving(true);
        setError(null);
        try {
            await onConfirm(records);
            onClose();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to save records');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    const label = MODULE_LABELS[module] || module;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
            <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg">
                            <BotIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                                AI {label} Assistant
                            </h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Describe your data in plain English — AI will generate structured records
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-md p-1"
                    >
                        <XIcon className="h-5 w-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                    {/* Input phase */}
                    {phase === 'input' && (
                        <div className="space-y-3">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Describe the {label.toLowerCase()}(s) you want to add
                            </label>
                            <textarea
                                ref={textareaRef}
                                rows={4}
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleGenerate();
                                }}
                                placeholder={MODULE_HINTS[module]}
                                className="block w-full rounded-lg border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white resize-none focus:ring-indigo-500 focus:border-indigo-500"
                            />
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                                Tip: Press Ctrl+Enter to generate
                            </p>
                            {error && (
                                <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-4 py-3">
                                    {error}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Review phase — editable table */}
                    {phase === 'review' && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Review &amp; edit {records.length} generated record{records.length !== 1 ? 's' : ''} before saving
                                </p>
                                <button
                                    onClick={() => { setPhase('input'); setRecords([]); }}
                                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                                >
                                    ← Back to input
                                </button>
                            </div>
                            {error && (
                                <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-4 py-3">
                                    {error}
                                </div>
                            )}
                            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-xs">
                                    <thead className="bg-gray-50 dark:bg-gray-900">
                                        <tr>
                                            {columns.map(col => (
                                                <th
                                                    key={col}
                                                    className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap"
                                                >
                                                    {col}
                                                </th>
                                            ))}
                                            <th className="px-3 py-2 text-right font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Remove
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
                                        {records.map((row, rowIdx) => (
                                            <tr key={rowIdx}>
                                                {columns.map(col => (
                                                    <td key={col} className="px-2 py-1">
                                                        <input
                                                            type="text"
                                                            value={row[col] === null || row[col] === undefined ? '' : String(row[col])}
                                                            onChange={e => handleCellChange(rowIdx, col, e.target.value)}
                                                            className="w-full min-w-[80px] rounded border-gray-200 dark:border-gray-600 bg-transparent dark:text-white text-xs focus:ring-1 focus:ring-indigo-400 px-1 py-0.5"
                                                        />
                                                    </td>
                                                ))}
                                                <td className="px-3 py-1 text-right">
                                                    <button
                                                        onClick={() => handleRemoveRow(rowIdx)}
                                                        className="text-gray-300 hover:text-red-500 dark:hover:text-red-400"
                                                        title="Remove row"
                                                    >
                                                        <XIcon className="h-4 w-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3 flex-shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-500"
                    >
                        Cancel
                    </button>
                    {phase === 'input' && (
                        <button
                            type="button"
                            onClick={handleGenerate}
                            disabled={loading || !message.trim()}
                            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                        >
                            {loading ? (
                                <>
                                    <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                                    <span>Generating…</span>
                                </>
                            ) : (
                                <>
                                    <BotIcon className="h-4 w-4" />
                                    <span>Generate</span>
                                </>
                            )}
                        </button>
                    )}
                    {phase === 'review' && (
                        <button
                            type="button"
                            onClick={handleConfirm}
                            disabled={saving || records.length === 0}
                            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                        >
                            {saving ? (
                                <>
                                    <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                                    <span>Saving…</span>
                                </>
                            ) : (
                                <span>Add {records.length} record{records.length !== 1 ? 's' : ''}</span>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
