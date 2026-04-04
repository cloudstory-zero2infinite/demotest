import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useUnifiedRefresh } from '../../hooks/useUnifiedRefresh';
import { marked } from 'marked';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import { PolicyV2, PolicyWorkflowStatus, PolicyApproval, AllActivityLog } from '../../types';
import * as SupabaseService from '../../services/supabase';
import { EyeIcon, PlusIcon, UploadIcon, DownloadIcon, BotIcon, HistoryIcon, TrashIcon } from '../Icons';

// ─── Markdown config ─────────────────────────────────────────────────────────
marked.setOptions({ gfm: true, breaks: true });
const renderMarkdown = (md: string): string => String(marked.parse(md || ''));

// ─── Inline prose styles injected once into <head> ───────────────────────────
const PROSE_STYLE = `
.policy-prose h1{font-size:1.5rem;font-weight:700;margin:1rem 0 .5rem}
.policy-prose h2{font-size:1.2rem;font-weight:600;margin:.9rem 0 .4rem}
.policy-prose h3{font-size:1rem;font-weight:600;margin:.8rem 0 .3rem}
.policy-prose p{margin:.5rem 0;line-height:1.6}
.policy-prose ul,.policy-prose ol{margin:.5rem 0 .5rem 1.5rem}
.policy-prose li{margin:.25rem 0}
.policy-prose table{border-collapse:collapse;width:100%;margin:.75rem 0;font-size:.85rem}
.policy-prose th,.policy-prose td{border:1px solid #d1d5db;padding:.4rem .6rem;text-align:left}
.policy-prose th{background:#f3f4f6;font-weight:600}
.policy-prose code{background:#f3f4f6;padding:.1rem .3rem;border-radius:.2rem;font-size:.85em}
.policy-prose pre{background:#1e293b;color:#e2e8f0;padding:1rem;border-radius:.4rem;overflow:auto;margin:.5rem 0}
.policy-prose blockquote{border-left:4px solid #3b82f6;padding:.5rem 1rem;background:#eff6ff;margin:.5rem 0}
.policy-prose hr{border:none;border-top:1px solid #e5e7eb;margin:1rem 0}
.policy-prose strong{font-weight:700}
`;

// ─── Status helpers ───────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; border: string; badge: string; dot: string }> = {
    draft:       { label: 'Draft',       border: 'border-l-blue-500',   badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',       dot: 'bg-blue-500' },
    in_review:   { label: 'In Review',   border: 'border-l-purple-500', badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300', dot: 'bg-purple-500' },
    in_approval: { label: 'In Approval', border: 'border-l-yellow-500', badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300', dot: 'bg-yellow-500' },
    approved:    { label: 'Approved',    border: 'border-l-green-500',  badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',     dot: 'bg-green-500' },
    expired:     { label: 'Expired',     border: 'border-l-red-500',    badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',             dot: 'bg-red-500' },
};

const isExpired = (p: PolicyV2) =>
    p.policy_status === 'approved' && !!p.refresh_date && new Date(p.refresh_date) < new Date();

const effectiveStatus = (p: PolicyV2) => (isExpired(p) ? 'expired' : p.policy_status);

const StatusBadge: React.FC<{ policy: PolicyV2 }> = ({ policy }) => {
    const s = effectiveStatus(policy);
    const meta = STATUS_META[s] || STATUS_META.draft;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${meta.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
        </span>
    );
};

// ─── History action labels ────────────────────────────────────────────────────
const ACTION_LABELS: Record<string, string> = {
    policy_created:                'Policy created',
    policy_status_changed:         'Status changed',
    policy_content_updated:        'Content updated',
    policy_submitted_for_approval: 'Submitted for approval',
    policy_approved:               'Approved',
    policy_rejected:               'Rejected',
    policy_deleted:                'Policy deleted',
};

const ACTION_COLORS: Record<string, string> = {
    policy_created:                'bg-blue-500',
    policy_status_changed:         'bg-purple-500',
    policy_content_updated:        'bg-gray-400',
    policy_submitted_for_approval: 'bg-yellow-500',
    policy_approved:               'bg-green-500',
    policy_rejected:               'bg-red-500',
    policy_deleted:                'bg-red-700',
};

// ─── HistoryModal ─────────────────────────────────────────────────────────────
const HistoryModal: React.FC<{ policy: PolicyV2; onClose: () => void }> = ({ policy, onClose }) => {
    const [entries, setEntries] = useState<AllActivityLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        SupabaseService.getPolicyHistory(policy.policy_id)
            .then(setEntries)
            .finally(() => setLoading(false));
    }, [policy.policy_id]);

    const fmt = (iso: string) => new Date(iso).toLocaleString();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
                    <div>
                        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Policy History</h2>
                        <p className="text-xs text-gray-500 mt-0.5">{policy.name}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">&times;</button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    {loading ? (
                        <p className="text-sm text-gray-400 text-center py-8">Loading...</p>
                    ) : entries.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-8">No history yet.</p>
                    ) : (
                        <ol className="relative border-l border-gray-200 dark:border-gray-700 space-y-6 ml-3">
                            {entries.map(e => {
                                const ed = (e.event_data || {}) as Record<string, any>;
                                const actorName = ed.actor_name || e.email || e.user_id || 'Unknown';
                                const fromStatus = ed.from_status as string | null;
                                const toStatus   = ed.to_status   as string | null;
                                const comment    = ed.comment     as string | null;
                                const dotColor   = ACTION_COLORS[e.action] || 'bg-gray-400';
                                return (
                                    <li key={e.id} className="ml-4">
                                        <span className={`absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full ${dotColor} ring-4 ring-white dark:ring-gray-800`} />
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                                            {ACTION_LABELS[e.action] || e.action}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            by <span className="font-medium">{actorName}</span>
                                            {fromStatus && toStatus && fromStatus !== toStatus && (
                                                <span className="ml-1 text-gray-400">· {fromStatus} → {toStatus}</span>
                                            )}
                                        </p>
                                        {comment && (
                                            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300 italic">"{comment}"</p>
                                        )}
                                        <time className="text-[10px] text-gray-400">{fmt(e.created_at)}</time>
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── ApproverModal ────────────────────────────────────────────────────────────
interface ApproverModalProps {
    onClose: () => void;
    onConfirm: (approver: { approver_id?: string; approver_name: string; approver_email: string }) => void;
}
const ApproverModal: React.FC<ApproverModalProps> = ({ onClose, onConfirm }) => {
    const [search, setSearch] = useState('');
    const [members, setMembers] = useState<any[]>([]);
    const [selected, setSelected] = useState<any | null>(null);

    useEffect(() => {
        SupabaseService.getOrganizationUsers().then(setMembers);
    }, []);

    const filtered = useMemo(() =>
        search.trim() === ''
            ? members
            : members.filter(m => m.email?.toLowerCase().includes(search.toLowerCase())),
        [members, search]
    );

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white">Select Approver</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">&times;</button>
                </div>
                <div className="p-6 space-y-4">
                    <input
                        type="text"
                        placeholder="Search by email..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                    />
                    <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-md divide-y dark:divide-gray-700">
                        {filtered.length === 0 ? (
                            <p className="p-3 text-sm text-gray-400 text-center">No members found</p>
                        ) : (
                            filtered.map((m, i) => (
                                <button
                                    key={m.id || i}
                                    onClick={() => setSelected(m)}
                                    className={`w-full text-left px-3 py-2.5 transition-colors ${selected?.id === m.id ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                                >
                                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{m.email}</p>
                                    <p className="text-xs text-gray-400">{m.role}</p>
                                </button>
                            ))
                        )}
                    </div>
                    {selected && (
                        <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 px-3 py-2 text-sm text-blue-700 dark:text-blue-300">
                            Approver: <span className="font-medium">{selected.email}</span>
                        </div>
                    )}
                    <div className="flex justify-end gap-3 pt-2">
                        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800">Cancel</button>
                        <button
                            disabled={!selected}
                            onClick={() => selected && onConfirm({
                                approver_id: selected.user_id || undefined,
                                approver_name: selected.email,
                                approver_email: selected.email,
                            })}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                            Send for Approval
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── ViewModal ────────────────────────────────────────────────────────────────
interface ViewModalProps {
    policy: PolicyV2;
    currentUserId: string | null;
    currentUserEmail: string | null;
    onClose: () => void;
    onApproved: () => void;
}
const ViewModal: React.FC<ViewModalProps> = ({ policy, currentUserId, currentUserEmail, onClose, onApproved }) => {
    const [pendingApproval, setPendingApproval] = useState<PolicyApproval | null>(null);
    const [comment, setComment] = useState('');
    const [showRejectInput, setShowRejectInput] = useState(false);
    const [saving, setSaving] = useState(false);
    const html = useMemo(() => renderMarkdown(policy.markdown || ''), [policy.markdown]);

    useEffect(() => {
        if (policy.policy_status === 'in_approval') {
            SupabaseService.getPolicyApproval(policy.policy_id).then(setPendingApproval);
        }
    }, [policy.policy_id, policy.policy_status]);

    const isApprover = pendingApproval && (
        (pendingApproval.approver_id && pendingApproval.approver_id === currentUserId) ||
        (pendingApproval.approver_email && pendingApproval.approver_email === currentUserEmail)
    );

    const handleApprove = async () => {
        setSaving(true);
        try {
            await SupabaseService.approvePolicy(policy.policy_id, comment || undefined);
            onApproved();
            onClose();
        } catch (err: any) { alert(err.message); }
        finally { setSaving(false); }
    };

    const handleReject = async () => {
        if (!comment.trim()) return;
        setSaving(true);
        try {
            await SupabaseService.rejectPolicy(policy.policy_id, comment);
            onApproved();
            onClose();
        } catch (err: any) { alert(err.message); }
        finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700 flex-shrink-0">
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{policy.name}</h2>
                            <StatusBadge policy={policy} />
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                            {policy.policy_id}
                            {policy.policy_ref && ` · ${policy.policy_ref}`}
                            {policy.version && ` · ${policy.version}`}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none ml-4">&times;</button>
                </div>

                <div className="flex-1 overflow-y-auto px-8 py-6">
                    <div className="policy-prose text-gray-800 dark:text-gray-200" dangerouslySetInnerHTML={{ __html: html }} />
                </div>

                {isApprover && (
                    <div className="flex-shrink-0 px-6 py-4 border-t dark:border-gray-700 bg-yellow-50 dark:bg-yellow-900/10">
                        <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300 mb-3">
                            Your approval is requested for this policy.
                        </p>
                        {showRejectInput ? (
                            <div className="space-y-3">
                                <textarea
                                    value={comment}
                                    onChange={e => setComment(e.target.value)}
                                    placeholder="Reason for rejection (required)"
                                    rows={2}
                                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-400"
                                />
                                <div className="flex gap-2">
                                    <button onClick={() => setShowRejectInput(false)} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300">Cancel</button>
                                    <button
                                        onClick={handleReject}
                                        disabled={!comment.trim() || saving}
                                        className="px-4 py-1.5 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                                    >
                                        {saving ? 'Rejecting...' : 'Confirm Reject'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex gap-3">
                                <textarea
                                    value={comment}
                                    onChange={e => setComment(e.target.value)}
                                    placeholder="Optional comment..."
                                    rows={2}
                                    className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                                />
                                <div className="flex flex-col gap-2">
                                    <button onClick={handleApprove} disabled={saving} className="px-4 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-300">
                                        {saving ? '...' : 'Approve'}
                                    </button>
                                    <button onClick={() => setShowRejectInput(true)} className="px-4 py-1.5 text-sm font-medium text-white bg-red-500 rounded-md hover:bg-red-600">
                                        Reject
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── EditorModal ──────────────────────────────────────────────────────────────
interface EditorModalProps {
    policy?: PolicyV2 | null;
    onClose: () => void;
    onSaved: () => void;
}
const EditorModal: React.FC<EditorModalProps> = ({ policy, onClose, onSaved }) => {
    const [markdown, setMarkdown] = useState(policy?.markdown || '');
    const [status, setStatus] = useState<PolicyWorkflowStatus>(policy?.policy_status || 'draft');
    const [saving, setSaving] = useState(false);
    const [showApprover, setShowApprover] = useState(false);
    const previewHtml = useMemo(() => renderMarkdown(markdown), [markdown]);
    const isEdit = !!policy;

    const handleSave = async () => {
        setSaving(true);
        try {
            if (isEdit) {
                await SupabaseService.updatePolicy(policy!.policy_id, { markdown, policy_status: status });
            } else {
                await SupabaseService.addPolicy(markdown, status);
            }
            onSaved();
            onClose();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleSendForApproval = () => {
        if (!markdown.trim()) { alert('Please add some content first.'); return; }
        setShowApprover(true);
    };

    const handleApproverConfirm = async (approver: { approver_id?: string; approver_name: string; approver_email: string }) => {
        setShowApprover(false);
        setSaving(true);
        try {
            let policyId = policy?.policy_id;
            if (!isEdit) {
                const created = await SupabaseService.addPolicy(markdown, 'draft');
                policyId = created.policy_id;
            } else {
                await SupabaseService.updatePolicy(policy!.policy_id, { markdown });
            }
            await SupabaseService.submitPolicyForApproval(policyId!, approver);
            onSaved();
            onClose();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

                    {/* Header bar */}
                    <div className="flex items-center justify-between px-6 py-3 border-b dark:border-gray-700 flex-shrink-0 gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <h2 className="text-base font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                                {isEdit ? 'Edit Policy' : 'New Policy'}
                            </h2>
                            <select
                                value={status}
                                onChange={e => setStatus(e.target.value as PolicyWorkflowStatus)}
                                className="text-xs border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                                <option value="draft">Draft</option>
                                <option value="in_review">In Review</option>
                                <option value="in_approval">In Approval</option>
                                <option value="approved">Approved</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-300">
                                {saving ? 'Saving...' : 'Save'}
                            </button>
                            <button onClick={handleSendForApproval} disabled={saving} className="px-4 py-1.5 text-sm font-medium text-white bg-yellow-500 rounded-md hover:bg-yellow-600 disabled:bg-gray-300">
                                Send for Approval
                            </button>
                            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none ml-1">&times;</button>
                        </div>
                    </div>

                    {/* Two-panel editor */}
                    <div className="flex flex-1 overflow-hidden">
                        <div className="w-1/2 flex flex-col border-r dark:border-gray-700">
                            <div className="px-4 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wider border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex-shrink-0">
                                Markdown
                            </div>
                            <textarea
                                value={markdown}
                                onChange={e => setMarkdown(e.target.value)}
                                className="flex-1 p-4 text-sm font-mono text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 resize-none focus:outline-none"
                                placeholder="Paste or type your markdown policy here..."
                                spellCheck={false}
                            />
                        </div>
                        <div className="w-1/2 flex flex-col overflow-hidden">
                            <div className="px-4 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wider border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex-shrink-0">
                                Preview
                            </div>
                            <div className="flex-1 overflow-y-auto p-5">
                                <div className="policy-prose text-gray-800 dark:text-gray-200" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {showApprover && (
                <ApproverModal onClose={() => setShowApprover(false)} onConfirm={handleApproverConfirm} />
            )}
        </>
    );
};

// ─── PolicyCard ────────────────────────────────────────────────────────────────
interface PolicyCardProps {
    policy: PolicyV2;
    selected: boolean;
    onToggleSelect: () => void;
    onView: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onHistory: () => void;
}
const PolicyCard: React.FC<PolicyCardProps> = ({ policy, selected, onToggleSelect, onView, onEdit, onDelete, onHistory }) => {
    const s = effectiveStatus(policy);
    const meta = STATUS_META[s] || STATUS_META.draft;
    const expired = isExpired(policy);

    return (
        <div className={`relative bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 border-l-4 ${meta.border} transition-shadow hover:shadow-md`}>
            <div className="absolute top-3 right-3">
                <input
                    type="checkbox"
                    checked={selected}
                    onChange={onToggleSelect}
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 cursor-pointer"
                />
            </div>

            <div className="p-4 pr-8">
                <p className="text-[10px] font-mono text-gray-400 dark:text-gray-500 mb-1 truncate">
                    {policy.policy_id}
                    {policy.policy_ref && <span className="ml-1 opacity-60">· {policy.policy_ref}</span>}
                </p>

                <h3 className="text-sm font-semibold text-gray-900 dark:text-white leading-snug mb-3 line-clamp-2">
                    {policy.name}
                </h3>

                <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <StatusBadge policy={policy} />
                    {policy.refresh_date && (
                        <span className={`text-[10px] ${expired ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                            {expired ? '⚠ Expired' : 'Refresh'}: {new Date(policy.refresh_date).toLocaleDateString()}
                        </span>
                    )}
                </div>

                {(policy.version || policy.owner_name) && (
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 mb-3 truncate">
                        {policy.version && <span>v{policy.version}</span>}
                        {policy.version && policy.owner_name && <span> · </span>}
                        {policy.owner_name && <span>{policy.owner_name}</span>}
                    </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-0.5">
                        <button onClick={onView} title="View" className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">
                            <EyeIcon className="h-4 w-4" />
                        </button>
                        <button onClick={onEdit} title="Edit" className="p-1.5 text-gray-400 hover:text-green-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" />
                            </svg>
                        </button>
                        <button onClick={onDelete} title="Delete" className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">
                            <TrashIcon className="h-4 w-4" />
                        </button>
                    </div>
                    <button onClick={onHistory} title="View History" className="p-1.5 text-gray-400 hover:text-purple-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">
                        <HistoryIcon className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── PoliciesView (main) ──────────────────────────────────────────────────────
export const PoliciesView: React.FC<{ isActive?: boolean }> = ({ isActive = true }) => {
    const [policies, setPolicies] = useState<PolicyV2[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isDownloading, setIsDownloading] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

    // Modal targets
    const [editorTarget, setEditorTarget] = useState<{ policy?: PolicyV2 } | null>(null);
    const [viewTarget, setViewTarget] = useState<PolicyV2 | null>(null);
    const [historyTarget, setHistoryTarget] = useState<PolicyV2 | null>(null);

    // Inject prose styles once
    useEffect(() => {
        if (!document.getElementById('policy-prose-styles')) {
            const s = document.createElement('style');
            s.id = 'policy-prose-styles';
            s.textContent = PROSE_STYLE;
            document.head.appendChild(s);
        }
    }, []);

    // Get current user
    useEffect(() => {
        SupabaseService.getOrgMe().then(me => {
            if (me) { setCurrentUserId(me.userId); setCurrentUserEmail(me.email); }
        });
    }, []);

    const fetchPolicies = useCallback(async () => {
        setError(null);
        try {
            const data = await SupabaseService.getPolicies();
            setPolicies(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useUnifiedRefresh(isActive, fetchPolicies);

    const filtered = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return q
            ? policies.filter(p =>
                p.name.toLowerCase().includes(q) ||
                (p.policy_id || '').toLowerCase().includes(q) ||
                (p.policy_ref || '').toLowerCase().includes(q)
            )
            : policies;
    }, [policies, searchQuery]);

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleDelete = async (policy: PolicyV2) => {
        if (!confirm(`Delete "${policy.name}"? This cannot be undone.`)) return;
        try {
            await SupabaseService.deletePolicy(policy.policy_id);
            fetchPolicies();
        } catch (err: any) { alert(err.message); }
    };

    // ── PDF Export ──────────────────────────────────────────────────────────
    const handleDownload = async () => {
        const selected = policies.filter(p => selectedIds.has(p.policy_id));
        if (selected.length === 0) return;
        setIsDownloading(true);
        try {
            const pdfs: { name: string; blob: Blob }[] = [];

            for (const policy of selected) {
                const html = renderMarkdown(policy.markdown || `# ${policy.name}\n\nNo content.`);
                const container = document.createElement('div');
                container.style.cssText = 'position:absolute;left:-9999px;top:0;width:794px;padding:48px;background:#fff;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#111';
                // Apply prose styles inline for PDF rendering (no dark mode)
                container.innerHTML = `<style>
                  h1{font-size:22px;font-weight:700;margin:14px 0 7px}
                  h2{font-size:18px;font-weight:600;margin:12px 0 6px}
                  h3{font-size:14px;font-weight:600;margin:10px 0 5px}
                  p{margin:7px 0;line-height:1.6}
                  ul,ol{margin:7px 0 7px 22px}
                  li{margin:4px 0}
                  table{border-collapse:collapse;width:100%;margin:10px 0;font-size:11px}
                  th,td{border:1px solid #d1d5db;padding:5px 8px;text-align:left}
                  th{background:#f3f4f6;font-weight:600}
                  code{background:#f3f4f6;padding:1px 4px;border-radius:3px;font-size:11px}
                  blockquote{border-left:4px solid #3b82f6;padding:6px 12px;background:#eff6ff;margin:7px 0}
                  hr{border:none;border-top:1px solid #e5e7eb;margin:14px 0}
                  strong{font-weight:700}
                </style>${html}`;
                document.body.appendChild(container);

                const canvas = await html2canvas(container, { scale: 1.5, useCORS: true });
                document.body.removeChild(container);

                const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
                const pageW = pdf.internal.pageSize.getWidth();
                const pageH = pdf.internal.pageSize.getHeight();
                const imgW = pageW;
                const imgH = (canvas.height * pageW) / canvas.width;

                let remaining = imgH;
                let yOffset = 0;
                while (remaining > 0) {
                    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, -yOffset, imgW, imgH);
                    remaining -= pageH;
                    yOffset += pageH;
                    if (remaining > 0) pdf.addPage();
                }

                pdfs.push({ name: `${policy.policy_id}.pdf`, blob: pdf.output('blob') });
            }

            if (pdfs.length === 1) {
                const url = URL.createObjectURL(pdfs[0].blob);
                const a = document.createElement('a');
                a.href = url; a.download = pdfs[0].name; a.click();
                URL.revokeObjectURL(url);
            } else {
                const zip = new JSZip();
                pdfs.forEach(({ name, blob }) => zip.file(name, blob));
                const zipBlob = await zip.generateAsync({ type: 'blob' });
                const url = URL.createObjectURL(zipBlob);
                const a = document.createElement('a');
                a.href = url; a.download = `policies-${Date.now()}.zip`; a.click();
                URL.revokeObjectURL(url);
            }
        } catch (err: any) {
            alert('PDF export failed: ' + err.message);
        } finally {
            setIsDownloading(false);
        }
    };

    // ── Render ──────────────────────────────────────────────────────────────
    return (
        <div>
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <div className="w-full sm:w-1/3">
                    <input
                        type="text"
                        placeholder="Search policies..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        aria-label="Search policies"
                    />
                </div>
                <div className="flex items-center space-x-2">
                    <button disabled title="AI Assistant (coming soon)" className="p-2 text-gray-300 dark:text-gray-600 rounded-md cursor-not-allowed">
                        <BotIcon className="h-5 w-5" />
                    </button>
                    <button disabled title="Upload (coming soon)" className="p-2 text-gray-300 dark:text-gray-600 rounded-md cursor-not-allowed">
                        <UploadIcon className="h-5 w-5" />
                    </button>
                    <button
                        onClick={handleDownload}
                        disabled={selectedIds.size === 0 || isDownloading}
                        title={selectedIds.size === 0 ? 'Select policies to download as PDF' : `Download ${selectedIds.size} as PDF`}
                        className={`p-2 rounded-md transition-colors ${
                            selectedIds.size > 0
                                ? 'text-gray-500 hover:text-purple-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                                : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                        }`}
                    >
                        <DownloadIcon className="h-5 w-5" />
                    </button>
                    <button
                        onClick={() => setEditorTarget({})}
                        title="Add Policy"
                        className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    >
                        <PlusIcon className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {/* Selection bar */}
            {selectedIds.size > 0 && (
                <div className="mb-4 flex items-center gap-3 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                    <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                        {selectedIds.size} {selectedIds.size === 1 ? 'policy' : 'policies'} selected
                    </span>
                    <button onClick={() => setSelectedIds(new Set())} className="text-xs text-blue-500 hover:text-blue-700 underline">
                        Clear
                    </button>
                    <button
                        onClick={handleDownload}
                        disabled={isDownloading}
                        className="ml-auto px-3 py-1 text-xs font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:bg-gray-300"
                    >
                        {isDownloading ? 'Generating PDFs...' : 'Download as PDF'}
                    </button>
                </div>
            )}

            {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">{error}</div>
            )}

            {/* Card grid */}
            {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 border-l-4 border-l-gray-300 p-4 animate-pulse">
                            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-3" />
                            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-4" />
                            <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-24" />
                        </div>
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm">
                        {searchQuery ? `No policies matching "${searchQuery}"` : 'No policies yet. Click + to add your first policy.'}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filtered.map(policy => (
                        <PolicyCard
                            key={policy.policy_id}
                            policy={policy}
                            selected={selectedIds.has(policy.policy_id)}
                            onToggleSelect={() => toggleSelect(policy.policy_id)}
                            onView={() => setViewTarget(policy)}
                            onEdit={() => setEditorTarget({ policy })}
                            onDelete={() => handleDelete(policy)}
                            onHistory={() => setHistoryTarget(policy)}
                        />
                    ))}
                </div>
            )}

            {/* Modals */}
            {editorTarget !== null && (
                <EditorModal
                    policy={editorTarget.policy}
                    onClose={() => setEditorTarget(null)}
                    onSaved={fetchPolicies}
                />
            )}
            {viewTarget && (
                <ViewModal
                    policy={viewTarget}
                    currentUserId={currentUserId}
                    currentUserEmail={currentUserEmail}
                    onClose={() => setViewTarget(null)}
                    onApproved={fetchPolicies}
                />
            )}
            {historyTarget && (
                <HistoryModal
                    policy={historyTarget}
                    onClose={() => setHistoryTarget(null)}
                />
            )}
        </div>
    );
};
