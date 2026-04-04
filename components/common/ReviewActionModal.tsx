import React, { useState } from 'react';
import { XIcon } from '../Icons';

export interface ReviewAttachment {
    name: string;
    url: string | null;
    original_name: string;
}

export interface ReviewActionModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    /** Who submitted and when */
    submittedBy: string;
    submittedAt: string;
    /** The submitter's comment */
    submitterComment?: string | null;
    /** Status badge text + color */
    statusLabel: string;
    statusColor: 'yellow' | 'green' | 'red' | 'blue';
    /** Files to display with download links */
    attachments?: ReviewAttachment[];
    /** Whether the current user is allowed to approve/reject */
    canAct: boolean;
    /** Callbacks */
    onApprove: (comment?: string) => Promise<void>;
    onReject: (comment: string) => Promise<void>;
    /** If true, the item was already actioned (show result, hide buttons) */
    isResolved?: boolean;
    resolvedLabel?: string;
    resolvedComment?: string | null;
    /** Extra info rows */
    infoRows?: { label: string; value: string }[];
}

const STATUS_BG: Record<string, string> = {
    yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    green: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    red: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
};

export const ReviewActionModal: React.FC<ReviewActionModalProps> = ({
    isOpen, onClose, title, subtitle, submittedBy, submittedAt, submitterComment,
    statusLabel, statusColor, attachments, canAct, onApprove, onReject,
    isResolved, resolvedLabel, resolvedComment, infoRows,
}) => {
    const [mode, setMode] = useState<'idle' | 'approve' | 'reject'>('idle');
    const [comment, setComment] = useState('');
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleApprove = async () => {
        setProcessing(true);
        setError(null);
        try {
            await onApprove(comment || undefined);
            onClose();
        } catch (err: any) {
            setError(err?.message || 'Action failed.');
        } finally {
            setProcessing(false);
        }
    };

    const handleReject = async () => {
        if (!comment.trim()) { setError('A comment is required for rejection.'); return; }
        setProcessing(true);
        setError(null);
        try {
            await onReject(comment);
            onClose();
        } catch (err: any) {
            setError(err?.message || 'Action failed.');
        } finally {
            setProcessing(false);
        }
    };

    const reset = () => { setMode('idle'); setComment(''); setError(null); };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[400] flex justify-center items-center p-4" onClick={onClose} aria-modal="true" role="dialog">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex justify-between items-start p-5 border-b dark:border-gray-700">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
                        {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg p-1.5 ml-4" aria-label="Close">
                        <XIcon className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                    {error && <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}

                    {/* Status + Submission Info */}
                    <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BG[statusColor]}`}>{statusLabel}</span>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500 dark:text-gray-400">Submitted by</span>
                            <span className="font-medium text-gray-900 dark:text-white">{submittedBy}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500 dark:text-gray-400">Date</span>
                            <span className="text-gray-700 dark:text-gray-300">{new Date(submittedAt).toLocaleString()}</span>
                        </div>
                        {infoRows?.map((row, i) => (
                            <div key={i} className="flex justify-between text-sm">
                                <span className="text-gray-500 dark:text-gray-400">{row.label}</span>
                                <span className="text-gray-700 dark:text-gray-300">{row.value}</span>
                            </div>
                        ))}
                    </div>

                    {submitterComment && (
                        <div>
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Comment</p>
                            <div className="bg-gray-50 dark:bg-gray-700/50 rounded px-3 py-2 text-sm text-gray-700 dark:text-gray-300 italic">
                                &ldquo;{submitterComment}&rdquo;
                            </div>
                        </div>
                    )}

                    {/* Attachments */}
                    {attachments && attachments.length > 0 && (
                        <div>
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Evidence Files</p>
                            <div className="flex flex-wrap gap-2">
                                {attachments.map((a, i) => (
                                    a.url ? (
                                        <a
                                            key={i}
                                            href={a.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                                            title={a.original_name}
                                        >
                                            <span>&#128206;</span> {a.name}
                                        </a>
                                    ) : (
                                        <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400" title={a.original_name}>
                                            <span>&#128206;</span> {a.name}
                                        </span>
                                    )
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Resolved state */}
                    {isResolved && (
                        <div className={`rounded-lg p-3 ${resolvedLabel?.toLowerCase().includes('approved') ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
                            <p className="text-sm font-medium">{resolvedLabel}</p>
                            {resolvedComment && <p className="text-sm mt-1 italic">&ldquo;{resolvedComment}&rdquo;</p>}
                        </div>
                    )}

                    {/* Actions — only for approver, only when not resolved */}
                    {canAct && !isResolved && (
                        <div className="border-t dark:border-gray-700 pt-4 space-y-3">
                            {mode === 'idle' && (
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => { reset(); setMode('approve'); }}
                                        className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                                    >
                                        Approve
                                    </button>
                                    <button
                                        onClick={() => { reset(); setMode('reject'); }}
                                        className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                                    >
                                        Reject
                                    </button>
                                </div>
                            )}

                            {mode === 'approve' && (
                                <div className="space-y-2">
                                    <textarea
                                        value={comment}
                                        onChange={e => setComment(e.target.value)}
                                        placeholder="Optional comment..."
                                        rows={3}
                                        className="block w-full rounded-lg border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-green-500 focus:border-green-500"
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={handleApprove} disabled={processing} className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors">
                                            {processing ? 'Approving...' : 'Confirm Approve'}
                                        </button>
                                        <button onClick={() => setMode('idle')} disabled={processing} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 transition-colors">
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}

                            {mode === 'reject' && (
                                <div className="space-y-2">
                                    <textarea
                                        value={comment}
                                        onChange={e => setComment(e.target.value)}
                                        placeholder="Reason for rejection (required)..."
                                        rows={3}
                                        className="block w-full rounded-lg border-red-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-red-600 dark:text-white focus:ring-red-500 focus:border-red-500"
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={handleReject} disabled={processing || !comment.trim()} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:bg-gray-400 transition-colors">
                                            {processing ? 'Rejecting...' : 'Confirm Reject'}
                                        </button>
                                        <button onClick={() => setMode('idle')} disabled={processing} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 transition-colors">
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
