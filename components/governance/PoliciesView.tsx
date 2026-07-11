import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useUnifiedRefresh } from '../../hooks/useUnifiedRefresh';
import { marked } from 'marked';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import { PolicyV2, PolicyWorkflowStatus, PolicyApproval, AllActivityLog } from '../../types';
import * as SupabaseService from '../../services/supabase';
import { EyeIcon, PencilIcon, PlusIcon, UploadIcon, DownloadIcon, BotIcon, HistoryIcon, TrashIcon, PhotoIcon, MapperIcon } from '../Icons';
import { PolicyAIDraftModal } from './PolicyAIDraftModal';
import { MapperRunModal } from './MapperRunModal';
import { PolicyEditor, parseDocumentText } from './PolicyEditor';
import { DocLangPreview } from './DocLangPreview';

// ─── Markdown config ─────────────────────────────────────────────────────────
marked.setOptions({ gfm: true, breaks: true });
const renderMarkdown = (md: string): string => String(marked.parse(md || ''));

interface MiniPolicy {
    policy_id: string;
    policy_ref: string | null;
    name: string;
}

export function findMatchingPolicy(href: string, text: string, allPolicies?: MiniPolicy[]): MiniPolicy | null {
  if (!allPolicies || allPolicies.length === 0) return null;
  const cleanHref = href.toLowerCase().trim();
  const cleanText = text.toLowerCase().trim();
  
  for (const policy of allPolicies) {
    const pId = (policy.policy_id || '').toLowerCase().trim();
    const pRef = (policy.policy_ref || '').toLowerCase().trim();
    const pName = (policy.name || '').toLowerCase().trim();
    
    if (
      (pId && (cleanHref === pId || cleanHref.includes(pId))) ||
      (pRef && (cleanHref === pRef || cleanHref.includes(pRef) || cleanHref.startsWith(pRef) || cleanText.includes(pRef))) ||
      (pName && (cleanHref === pName || cleanText === pName))
    ) {
      return policy;
    }
    
    const strippedHref = cleanHref.replace(/\.(md|pdf|docx|txt)$/, '').split('/').pop();
    if (strippedHref && (strippedHref === pId || strippedHref === pRef || strippedHref === pName)) {
      return policy;
    }
  }
  return null;
}

export function processMarkdownLinks(md: string, allPolicies?: MiniPolicy[], isBackend = false): string {
  if (!md) return md;
  const linkRegex = /(^|[^!])\[(.*?)\]\((.*?)\)/g;
  
  return md.replace(linkRegex, (match, prefix, text, href) => {
    const isExternal = href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:');
    const matchedPolicy = findMatchingPolicy(href, text, allPolicies);
    
    if (matchedPolicy) {
      if (isBackend) {
        return `${prefix}<a href="?policyId=${matchedPolicy.policy_id}" style="color: #2563eb; text-decoration: underline;">${text}</a>`;
      } else {
        return `${prefix}<a href="javascript:void(0)" onclick="window.parent.postMessage({type:'OPEN_POLICY',policyId:'${matchedPolicy.policy_id}'},'*'); window.postMessage({type:'OPEN_POLICY',policyId:'${matchedPolicy.policy_id}'},'*'); event.stopPropagation();" class="text-blue-600 dark:text-blue-400 hover:underline font-medium">${text}</a>`;
      }
    } else {
      if (isExternal) {
        return match;
      }
      return `${prefix}${text}`;
    }
  });
}

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
.policy-prose pre code{background:transparent;padding:0;border-radius:0;color:inherit;font-size:inherit}
.policy-prose blockquote{border-left:4px solid #3b82f6;padding:.5rem 1rem;background:#eff6ff;margin:.5rem 0}
.policy-prose hr{border:none;border-top:1px solid #e5e7eb;margin:1rem 0}
.policy-prose strong{font-weight:700}
.policy-prose img{max-width:100%;height:auto;border-radius:.375rem;box-shadow:0 1px 3px 0 rgba(0,0,0,.1),0 1px 2px 0 rgba(0,0,0,.06);margin:.5rem 0}
.policy-prose img[src$="#thumbnail"]{max-width:200px;max-height:200px;object-fit:cover}

/* Dark mode overrides */
.dark .policy-prose th,.dark .policy-prose td{border-color:#374151}
.dark .policy-prose th{background:#1f2937;color:#f3f4f6}
.dark .policy-prose code{background:#1f2937;color:#e5e7eb}
.dark .policy-prose blockquote{background:#1e3a8a20;border-left-color:#3b82f6;color:#bfdbfe}
.dark .policy-prose hr{border-top-color:#374151}
`;

// ─── Status helpers ───────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; border: string; badge: string; dot: string }> = {
    draft:       { label: 'Draft',       border: 'border-l-blue-500',   badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',       dot: 'bg-blue-500' },
    to_review:   { label: 'In Review',   border: 'border-l-purple-500', badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300', dot: 'bg-purple-500' },
    in_approval: { label: 'In Approval', border: 'border-l-yellow-500', badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300', dot: 'bg-yellow-500' },
    approved:    { label: 'Approved',    border: 'border-l-green-500',  badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',     dot: 'bg-green-500' },
    reviewed:    { label: 'Reviewed',    border: 'border-l-blue-500',   badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',         dot: 'bg-blue-500' },
    overdue:     { label: 'Overdue',     border: 'border-l-red-600',    badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',             dot: 'bg-red-600' },
};

// A policy is overdue once its due date has lapsed. The cron flips approved →
// 'overdue', but we also treat an approved policy whose date has just passed
// (before the cron runs) as overdue so the UI is never stale. Only 'approved'
// policies carry a due date, so 'reviewed'/others can never be overdue.
const isExpired = (p: PolicyV2) =>
    p.policy_status === 'approved' && !!p.refresh_date && new Date(p.refresh_date) < new Date();

const effectiveStatus = (p: PolicyV2) => (p.policy_status === 'overdue' || isExpired(p)) ? 'overdue' : p.policy_status;

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
    policy_submitted_for_review:   'Submitted for review',
    policy_submitted_for_approval: 'Submitted for approval',
    policy_approved:               'Approved',
    policy_reviewed:               'Reviewed',
    policy_rejected:               'Rejected',
    policy_deleted:                'Policy deleted',
};

const ACTION_COLORS: Record<string, string> = {
    policy_created:                'bg-blue-500',
    policy_status_changed:         'bg-purple-500',
    policy_content_updated:        'bg-gray-400',
    policy_submitted_for_review:   'bg-orange-400',
    policy_submitted_for_approval: 'bg-yellow-500',
    policy_approved:               'bg-green-500',
    policy_reviewed:               'bg-blue-500',
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
                                        <p className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                                            {ACTION_LABELS[e.action] || e.action}
                                            {ed.version && (
                                                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-650 dark:text-gray-300">
                                                    v{ed.version}
                                                </span>
                                            )}
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

// ─── DownloadModal ─────────────────────────────────────────────────────────────
interface DownloadModalProps {
    policy: PolicyV2;
    onClose: () => void;
    userRole?: string | null;
}
const DownloadModal: React.FC<DownloadModalProps> = ({ policy, onClose, userRole }) => {
    const [templates, setTemplates] = useState<any[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [format, setFormat] = useState<'pdf' | 'docx'>('pdf');
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState(false);
    const [previewHtml, setPreviewHtml] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const isAdmin = ['admin', 'tenant_admin', 'cxo'].includes(userRole || '');

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        Promise.all([
            SupabaseService.getPolicyTemplates(),
            SupabaseService.getOrgSettings()
        ]).then(([temps, settings]) => {
            setTemplates(temps || []);
            setSelectedTemplateId(settings?.selected_template_id || '');
        }).catch(() => {}).finally(() => setLoading(false));
    }, []);

    const handleDownload = async () => {
        setDownloading(true);
        try {
            await SupabaseService.downloadPolicyDocument(policy.policy_id, selectedTemplateId || undefined, format);
            onClose();
        } catch (err: any) {
            alert('Failed to generate document: ' + err.message);
        } finally {
            setDownloading(false);
        }
    };

    const handlePreview = async (templateId: string) => {
        setPreviewLoading(true);
        try {
            const html = await SupabaseService.getPolicyDocumentPreview(policy.policy_id, templateId || undefined);
            setPreviewHtml(html);
        } catch (err: any) {
            alert('Failed to load preview: ' + err.message);
        } finally {
            setPreviewLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white">Download Policy</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">&times;</button>
                </div>
                <div className="p-6 space-y-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-6">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                        </div>
                    ) : (
                        <div className="space-y-4">


                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 font-semibold">
                                    Select Format
                                </label>
                                <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-1 bg-gray-50/50 dark:bg-gray-900/20 w-full">
                                    <button
                                        type="button"
                                        onClick={() => setFormat('pdf')}
                                        className={`flex-1 py-1.5 px-4 rounded-md text-sm font-medium transition-all ${
                                            format === 'pdf'
                                                ? 'bg-blue-600 text-white shadow-sm'
                                                : 'text-gray-650 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                        }`}
                                    >
                                        PDF (Recommended)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormat('docx')}
                                        className={`flex-1 py-1.5 px-4 rounded-md text-sm font-medium transition-all ${
                                            format === 'docx'
                                                ? 'bg-blue-600 text-white shadow-sm'
                                                : 'text-gray-650 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                        }`}
                                    >
                                        DOCX Word Document
                                    </button>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t dark:border-gray-700">
                                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800">
                                    Cancel
                                </button>

                                <button
                                    onClick={handleDownload}
                                    disabled={downloading}
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
                                >
                                    {downloading ? (
                                        <>
                                            <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                                            Generating...
                                        </>
                                    ) : (
                                        'Download'
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Document Preview Modal */}
            {previewHtml && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 animate-fade-in" onClick={() => setPreviewHtml(null)}>
                    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-800 flex-shrink-0">
                            <div>
                                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Document Layout Preview</h3>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Preview of generated layout with injected tenant and policy variables.</p>
                            </div>
                            <button onClick={() => setPreviewHtml(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-250 text-xl leading-none">&times;</button>
                        </div>
                        <div className="flex-1 overflow-hidden bg-gray-100 dark:bg-slate-950 p-6 flex justify-center">
                            <iframe 
                                srcDoc={previewHtml}
                                title="Document Preview"
                                className="bg-white border border-gray-200 dark:border-slate-800 shadow-xl max-w-[900px] w-full h-full"
                                style={{ border: 'none' }}
                            />
                        </div>
                        <div className="px-6 py-3.5 border-t dark:border-gray-800 flex justify-end flex-shrink-0">
                            <button 
                                onClick={() => setPreviewHtml(null)} 
                                className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 font-semibold shadow-sm transition-colors"
                            >
                                Close Preview
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Loading Indicator Overlay */}
            {previewLoading && (
                <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
                    <div className="bg-white dark:bg-gray-850 rounded-xl p-5 shadow-2xl flex items-center gap-3 border dark:border-gray-800">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Generating document preview...</span>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── UserSelectionModal ─────────────────────────────────────────────────────────
interface UserSelectionModalProps {
    title?: string;
    buttonText?: string;
    onClose: () => void;
    onConfirm: (user: { user_id?: string; user_name: string; user_email: string }) => void;
}
const UserSelectionModal: React.FC<UserSelectionModalProps> = ({ title = 'Select User', buttonText = 'Select', onClose, onConfirm }) => {
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
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
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
                            Selected: <span className="font-medium">{selected.email}</span>
                        </div>
                    )}
                    <div className="flex justify-end gap-3 pt-2">
                        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800">Cancel</button>
                        <button
                            disabled={!selected}
                            onClick={() => selected && onConfirm({
                                user_id: selected.user_id || undefined,
                                user_name: selected.email,
                                user_email: selected.email,
                            })}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                            {buttonText}
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
    onEdit?: () => void;
    onDelete?: () => void;
    onHistory?: () => void;
    onDownload?: () => void;
    isReadOnly?: boolean;
    allPolicies?: PolicyV2[];
}
const ViewModal: React.FC<ViewModalProps> = ({ policy, currentUserId, currentUserEmail, onClose, onApproved, onEdit, onDelete, onHistory, onDownload, isReadOnly = false, allPolicies = [] }) => {
    const [pendingApproval, setPendingApproval] = useState<PolicyApproval | null>(null);
    const [comment, setComment] = useState('');
    const [showRejectInput, setShowRejectInput] = useState(false);
    const [saving, setSaving] = useState(false);
    const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!policy?.doc_lang?.images || !Array.isArray(policy.doc_lang.images) || policy.doc_lang.images.length === 0) {
            return;
        }

        const fetchUrls = async () => {
            const urlsMap: Record<string, string> = {};
            for (const img of policy.doc_lang.images) {
                if (img.file_path) {
                    try {
                        const { data, error } = await SupabaseService.supabase.storage
                            .from('policy-images')
                            .createSignedUrl(img.file_path, 3600);
                        if (!error && data?.signedUrl) {
                            urlsMap[img.name] = data.signedUrl;
                            const nameWithoutExt = img.name.replace(/\.[^/.]+$/, "");
                            urlsMap[nameWithoutExt] = data.signedUrl;
                        }
                    } catch (err) {
                        console.error('Error generating signed URL:', err);
                    }
                }
            }
            setSignedUrls(urlsMap);
        };

        fetchUrls();
    }, [policy]);

    const viewRenderMarkdown = (md: string) => {
        if (!md) return '';
        try {
            let processed = md;

            // 1. Replace [Image: Name] with HTML Image referencing signed URL
            const imageRegex = /\[Image:\s*(.+?)\]/g;
            processed = processed.replace(imageRegex, (match, name) => {
                const signedUrl = signedUrls[name.trim()];
                if (signedUrl) {
                    return `<img src="${signedUrl}" alt="${name}" class="my-4 max-h-[400px] w-auto rounded border border-gray-200 dark:border-gray-800 shadow-sm" />`;
                }
                return `<div class="p-2 border border-dashed border-gray-300 dark:border-gray-700 text-xs text-gray-400 rounded my-2">Image "${name}" loading or private</div>`;
            });

            // 2. Replace standard markdown image tags ![Alt](images/filename.png) with signed URL matching filename
            const markdownImageRegex = /!\[(.*?)\]\((.*?)\)/g;
            processed = processed.replace(markdownImageRegex, (match, alt, url) => {
                const filename = url.split('/').pop() || '';
                const signedUrl = signedUrls[filename.trim()];
                if (signedUrl) {
                    return `<img src="${signedUrl}" alt="${alt || filename}" class="my-4 max-h-[400px] w-auto rounded border border-gray-200 dark:border-gray-800 shadow-sm" />`;
                }
                return match;
            });

            const processedLinks = processMarkdownLinks(processed, allPolicies, false);
            return renderMarkdown(processedLinks);
        } catch {
            const processedLinks = processMarkdownLinks(md, allPolicies, false);
            return renderMarkdown(processedLinks);
        }
    };

    const html = useMemo(() => viewRenderMarkdown(policy.markdown || ''), [policy.markdown, signedUrls, allPolicies]);
    const [previewHtml, setPreviewHtml] = useState<string | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);

    useEffect(() => {
        if (policy.policy_status === 'in_approval' || policy.policy_status === 'to_review') {
            SupabaseService.getPolicyApproval(policy.policy_id).then(setPendingApproval);
        }
    }, [policy.policy_id, policy.policy_status]);

    useEffect(() => {
        let isMounted = true;
        setLoadingPreview(true);
        SupabaseService.getOrgSettings()
            .then(async (settings) => {
                if (settings && settings.selected_template_id) {
                    try {
                        const htmlPreview = await SupabaseService.getPolicyDocumentPreview(
                            policy.policy_id,
                            settings.selected_template_id
                        );
                        if (isMounted) {
                            setPreviewHtml(htmlPreview);
                        }
                    } catch (err) {
                        console.error("Failed to load templated preview", err);
                    }
                }
            })
            .catch((err) => {
                console.error("Failed to load org settings", err);
            })
            .finally(() => {
                if (isMounted) {
                    setLoadingPreview(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [policy.policy_id]);

    const isApprover = pendingApproval && (
        (pendingApproval.approver_id && pendingApproval.approver_id === currentUserId) ||
        (pendingApproval.approver_email && pendingApproval.approver_email === currentUserEmail)
    );

    const handleApprove = async () => {
        setSaving(true);
        try {
            if (policy.policy_status === 'to_review') {
                await SupabaseService.reviewPolicy(policy.policy_id, comment || undefined);
            } else {
                await SupabaseService.approvePolicy(policy.policy_id, comment || undefined);
            }
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
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
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
                    <div className="flex items-center gap-1 ml-4">
                        <button
                            onClick={() => { onClose(); onEdit?.(); }}
                            disabled={isReadOnly}
                            title="Edit"
                            className="p-1.5 text-gray-400 hover:text-yellow-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <PencilIcon className="h-4 w-4" />
                        </button>
                        <button onClick={() => onDownload?.() } title="Download PDF" className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">
                            <DownloadIcon className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => { onClose(); onDelete?.(); }}
                            disabled={isReadOnly}
                            title="Delete"
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <TrashIcon className="h-4 w-4" />
                        </button>
                        <button onClick={() => { onClose(); onHistory?.(); }} title="History" className="p-1.5 text-gray-400 hover:text-purple-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">
                            <HistoryIcon className="h-4 w-4" />
                        </button>
                        <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">&times;</button>
                    </div>
                </div>

                <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                    {loadingPreview ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12 bg-gray-50 dark:bg-gray-900/10">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                            <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">Loading templated view...</span>
                        </div>
                    ) : previewHtml ? (
                        <div className="flex-1 bg-gray-105 dark:bg-slate-950 p-6 flex justify-center overflow-hidden">
                            <iframe 
                                srcDoc={previewHtml}
                                title="Document Preview"
                                className="bg-white border border-gray-200 dark:border-slate-800 shadow-xl max-w-[900px] w-full h-full"
                                style={{ border: 'none' }}
                            />
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto px-8 py-6">
                            <div className="policy-prose text-gray-800 dark:text-gray-200" dangerouslySetInnerHTML={{ __html: html }} />
                        </div>
                    )}
                </div>

                {isApprover && (
                    <div className="flex-shrink-0 px-6 py-4 border-t dark:border-gray-700 bg-yellow-50 dark:bg-yellow-900/10">
                        <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300 mb-3">
                            {policy.policy_status === 'to_review' 
                                ? 'Your review is requested for this policy.' 
                                : 'Your approval is requested for this policy.'}
                        </p>
                        {showRejectInput ? (
                            <div className="space-y-3">
                                <textarea
                                    value={comment}
                                    onChange={e => setComment(e.target.value)}
                                    placeholder="Reason for rejection (required)"
                                    rows={2}
                                    disabled={isReadOnly}
                                    className="w-full rounded-md border border-gray-300 dark:border-gray-650 px-3 py-2 text-sm dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-60 disabled:cursor-not-allowed"
                                />
                                <div className="flex gap-2">
                                    <button onClick={() => setShowRejectInput(false)} disabled={isReadOnly} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed">Cancel</button>
                                    <button
                                        onClick={handleReject}
                                        disabled={!comment.trim() || saving || isReadOnly}
                                        className="px-4 py-1.5 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
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
                                    disabled={isReadOnly}
                                    className="flex-1 rounded-md border border-gray-300 dark:border-gray-650 px-3 py-2 text-sm dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-60 disabled:cursor-not-allowed"
                                />
                                <div className="flex flex-col gap-2">
                                    <button 
                                        onClick={handleApprove} 
                                        disabled={saving || isReadOnly} 
                                        className={`px-4 py-1.5 text-sm font-medium text-white rounded-md transition-colors disabled:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed ${
                                            policy.policy_status === 'to_review' 
                                                ? 'bg-blue-600 hover:bg-blue-700' 
                                                : 'bg-green-600 hover:bg-green-700'
                                        }`}
                                    >
                                        {saving ? '...' : (policy.policy_status === 'to_review' ? 'Complete Review' : 'Approve')}
                                    </button>
                                    <button onClick={() => setShowRejectInput(true)} disabled={isReadOnly} className="px-4 py-1.5 text-sm font-medium text-white bg-red-500 rounded-md hover:bg-red-650 disabled:opacity-50 disabled:cursor-not-allowed">
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
    initialMarkdown?: string;
    initialDocLang?: any;
    onClose: () => void;
    onSaved: () => void;
    orgId: string;
    orgName: string;
    currentUserEmail: string | null;
    isReadOnly?: boolean;
    policies?: PolicyV2[];
}

const convertDocLangToMarkdown = (dl: any) => {
    if (!dl) return '';
    let md = `# ${dl.title || 'Untitled Policy'}\n\n`;
    if (dl.metadata) {
        md += `| Metadata | Value |\n| --- | --- |\n`;
        if (dl.document_id) md += `| **Document ID:** | ${dl.document_id} |\n`;
        if (dl.metadata.owner_name) md += `| **Owner:** | ${dl.metadata.owner_name} |\n`;
        if (dl.version) md += `| **Version:** | ${dl.version} |\n`;
        if (dl.status) md += `| **Status:** | ${dl.status} |\n`;
        if (dl.metadata.refresh_date) md += `| **Next Review Date:** | ${dl.metadata.refresh_date} |\n`;
        md += `\n`;
    }
    if (dl.sections && Array.isArray(dl.sections)) {
        for (const sec of dl.sections) {
            md += `## ${sec.title}\n\n${sec.content}\n\n`;
        }
    }
    return md.trim();
};

const EditorModal: React.FC<EditorModalProps> = ({ policy, initialMarkdown, initialDocLang, onClose, onSaved, orgId, orgName, currentUserEmail, isReadOnly = false, policies = [] }) => {
    const [docLang, setDocLang] = useState<any>(() => {
        const currentUserName = sessionStorage.getItem("grcUserName") || currentUserEmail || 'Policy Owner';

        if (policy?.doc_lang) return policy.doc_lang;
        if (initialDocLang) {
            const dl = { ...initialDocLang };
            if (!dl.metadata) dl.metadata = {};
            const originalOwner = dl.metadata.owner_name;
            
            // Always set owner to the creating user's name
            dl.metadata.owner_name = currentUserName;
            
            if (dl.sections && Array.isArray(dl.sections)) {
                dl.sections = dl.sections.map((sec: any) => {
                    if (sec.content && typeof sec.content === 'string') {
                        let updatedContent = sec.content.replace(/\[Author Name\]/gi, currentUserName);
                        if (originalOwner && originalOwner.trim() !== '') {
                            const escapedOwner = originalOwner.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                            updatedContent = updatedContent.replace(new RegExp(escapedOwner, 'g'), currentUserName);
                        }
                        return {
                            ...sec,
                            content: updatedContent
                        };
                    }
                    return sec;
                });
            }
            return dl;
        }
        return {
            document_type: 'policy',
            document_id: policy?.policy_ref || 'POL-TEMP',
            title: policy?.name || 'New Policy Document',
            version: policy?.version || '1.0',
            status: policy?.policy_status || 'draft',
            metadata: {
                owner_name: currentUserName,
                refresh_date: policy?.refresh_date || null
            },
            sections: [],
            approval_matrix: [],
            revision_history: [],
            references: [],
            applicability: [],
            tables: [],
            images: [],
            signatures: [],
            attachments: []
        };
    });

    const [status, setStatus] = useState<PolicyWorkflowStatus>(policy?.policy_status || 'draft');
    const [saving, setSaving] = useState(false);
    const [showApprover, setShowApprover] = useState(false);
    const [showReviewer, setShowReviewer] = useState(false);
    const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
    const [includeSignature, setIncludeSignature] = useState<boolean>(true);

    useEffect(() => {
        Promise.all([
            SupabaseService.getOrgSettings(),
            SupabaseService.getPolicyTemplates()
        ]).then(([settings, templates]) => {
            if (settings) {
                setLogoUrl(settings.logo_url || null);
                setSignatureUrl(settings.signature_url || null);
                const selectedTemplateId = settings.selected_template_id || 'standard';
                if (selectedTemplateId === 'standard') {
                    const standardTemplate = templates?.find(t => t.name === 'Standard Template');
                    if (standardTemplate && standardTemplate.placeholders) {
                        setIncludeSignature(standardTemplate.placeholders.include_signature !== false);
                    } else {
                        setIncludeSignature(true);
                }
                } else {
                    setIncludeSignature(false);
                }
            }
        }).catch(() => {});
    }, []);
    const isEdit = !!policy;
    const isApproved = isEdit && (policy?.policy_status === 'approved' || policy?.policy_status === 'reviewed');
    const isPolicyExpired = isEdit && policy ? isExpired(policy) : false;
    const isFrozen = isApproved || isPolicyExpired;

    const handleSave = async () => {
        setSaving(true);
        try {
            const currentMarkdown = convertDocLangToMarkdown(docLang);
            if (isEdit) {
                if (isFrozen) {
                    await SupabaseService.updatePolicy(policy!.policy_id, { policy_status: status });
                } else {
                    await SupabaseService.updatePolicy(policy!.policy_id, { 
                        markdown: currentMarkdown, 
                        doc_lang: docLang, 
                        policy_status: status 
                    });
                }
            } else {
                await SupabaseService.addPolicy(currentMarkdown, status, docLang);
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
          const currentMarkdown = convertDocLangToMarkdown(docLang);
        if (!currentMarkdown.trim()) { alert('Please add some content first.'); return; }
        setShowApprover(true);
    };

    const handleSendForReview = () => {
        const currentMarkdown = convertDocLangToMarkdown(docLang);
        if (!currentMarkdown.trim()) { alert('Please add some content first.'); return; }
        setShowReviewer(true);
    };

    const handleApproverConfirm = async (user: { user_id?: string; user_name: string; user_email: string }) => {
        setShowApprover(false);
        setSaving(true);
        try {
            let policyId = policy?.policy_id;
            const currentMarkdown = convertDocLangToMarkdown(docLang);
            if (!isEdit) {
                const created = await SupabaseService.addPolicy(currentMarkdown, 'draft', docLang);
                policyId = created.policy_id;
            } else {
                  await SupabaseService.updatePolicy(policy!.policy_id, { 
                    markdown: currentMarkdown, 
                    doc_lang: docLang 
                });
            }
            await SupabaseService.submitPolicyForApproval(policyId!, {
                approver_id: user.user_id,
                approver_name: user.user_name,
                approver_email: user.user_email
            });
            onSaved();
            onClose();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleReviewerConfirm = async (user: { user_id?: string; user_name: string; user_email: string }) => {
        setShowReviewer(false);
        setSaving(true);
        try {
            let policyId = policy?.policy_id;
            const currentMarkdown = convertDocLangToMarkdown(docLang);
            if (!isEdit) {
                const created = await SupabaseService.addPolicy(currentMarkdown, 'draft', docLang);
                policyId = created.policy_id;
            } else {
                await SupabaseService.updatePolicy(policy!.policy_id, { 
                    markdown: currentMarkdown, 
                    doc_lang: docLang 
                });
            }
            await SupabaseService.submitPolicyForReview(policyId!, {
                reviewer_id: user.user_id,
                reviewer_name: user.user_name,
                reviewer_email: user.user_email
            });
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

                    <div className="flex items-center justify-between px-6 py-3 border-b dark:border-gray-700 flex-shrink-0 gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <h2 className="text-base font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                                {isEdit ? 'Edit Policy' : 'New Policy'}
                            </h2>
                            <select
                                value={status}
                                onChange={e => setStatus(e.target.value as PolicyWorkflowStatus)}
                                disabled={isReadOnly}
                                className="text-xs border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                <option value="draft">Draft</option>
                                <option value="to_review">In Review</option>
                                <option value="in_approval">In Approval</option>
                                <option value="reviewed">Reviewed</option>
                                <option value="approved">Approved</option>
                            </select>
                 
                            <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 ml-4">
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('edit')}
                                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                                        activeTab === 'edit'
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'text-gray-650 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                                    }`}
                                >
                                    Edit Policy
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('preview')}
                                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                                        activeTab === 'preview'
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'text-gray-650 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                                    }`}
                                >
                                    Live Preview
                                </button>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            {isFrozen && status !== policy?.policy_status ? (
                                <button onClick={handleSave} disabled={saving || isReadOnly} className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed">
                                    {saving ? 'Updating...' : 'Update Status'}
                                </button>
                            ) : (
                                <>
                                    {!isFrozen && (
                                        <>
                                            <button onClick={handleSave} disabled={saving || isReadOnly} className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed">
                                                {saving ? 'Saving...' : 'Save'}
                                            </button>
                                            <button onClick={handleSendForReview} disabled={saving || isReadOnly} className="px-4 py-1.5 text-sm font-medium text-white bg-orange-500 rounded-md hover:bg-orange-600 disabled:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed">
                                                Send for Review
                                            </button>
                                            <button onClick={handleSendForApproval} disabled={saving || isReadOnly} className="px-4 py-1.5 text-sm font-medium text-white bg-yellow-500 rounded-md hover:bg-yellow-600 disabled:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed">
                                                Send for Approval
                                            </button>
                                        </>
                                    )}
                                    {isFrozen && status === 'reviewed' && (
                                        <button onClick={handleSendForApproval} disabled={saving || isReadOnly} className="px-4 py-1.5 text-sm font-medium text-white bg-yellow-500 rounded-md hover:bg-yellow-600 disabled:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed">
                                            Send for Approval
                                        </button>
                                    )}
                                </>
                            )}
                            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none ml-1">&times;</button>
                        </div>
                    </div>
                    {/* Content view toggle */}
                    <div className="flex-1 overflow-y-auto p-6 min-h-0 bg-gray-50/50 dark:bg-gray-900/50">
                        {activeTab === 'edit' ? (
                            <PolicyEditor key={`${docLang.document_id || 'editor'}_${docLang.sections?.length || 0}`} docLang={docLang} onChange={setDocLang} orgId={orgId} isReadOnly={isReadOnly} />
                        ) : (
                            <DocLangPreview docLang={docLang} orgName={orgName} logoUrl={logoUrl} signatureUrl={signatureUrl} includeSignature={includeSignature} allPolicies={policies} />
                            )}

                    </div>
                </div>
            </div>

            {showApprover && (
                <UserSelectionModal title="Select Approver" buttonText="Send for Approval" onClose={() => setShowApprover(false)} onConfirm={handleApproverConfirm} />
            )}
            {showReviewer && (
                <UserSelectionModal title="Select Reviewer" buttonText="Send for Review" onClose={() => setShowReviewer(false)} onConfirm={handleReviewerConfirm} />
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
}
const PolicyCard: React.FC<PolicyCardProps> = ({ policy, selected, onToggleSelect, onView }) => {
    const s = effectiveStatus(policy);
    const meta = STATUS_META[s] || STATUS_META.draft;
    const expired = s === 'overdue';

    return (
        <div
            onClick={onView}
            className={`relative bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 border-l-4 ${meta.border} transition-shadow hover:shadow-md cursor-pointer`}
        >
            <div className="absolute top-3 right-3" onClick={e => e.stopPropagation()}>
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
                            {expired ? '⚠ Overdue' : 'Refresh'}: {new Date(policy.refresh_date).toLocaleDateString()}
                        </span>
                    )}
                </div>

                {(policy.version || policy.owner_name) && (
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                        {policy.version && <span>v{policy.version}</span>}
                        {policy.version && policy.owner_name && <span> · </span>}
                        {policy.owner_name && <span>{policy.owner_name}</span>}
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── PoliciesView (main) ──────────────────────────────────────────────────────
import { UserRole } from '../../types';

interface PoliciesViewProps {
    isActive?: boolean;
    autoOpenPolicyId?: string | null;
    onAutoOpenConsumed?: () => void;
    userRole?: UserRole | null;
}

export const PoliciesView: React.FC<PoliciesViewProps> = ({ isActive = true, autoOpenPolicyId, onAutoOpenConsumed, userRole }) => {
    const isReadOnly = userRole === 'read-only';
    const [policies, setPolicies] = useState<PolicyV2[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isDownloading, setIsDownloading] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
    const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
    const [orgId, setOrgId] = useState<string>('');
    const [orgName, setOrgName] = useState<string>('');

    // Modal targets
    const [editorTarget, setEditorTarget] = useState<{ policy?: PolicyV2; initialMarkdown?: string; initialDocLang?: any } | null>(null);
    const [aiDraftOpen, setAiDraftOpen] = useState(false);
    const [mapperOpen, setMapperOpen] = useState(false);
    const [viewTarget, setViewTarget] = useState<PolicyV2 | null>(null);
    const [historyTarget, setHistoryTarget] = useState<PolicyV2 | null>(null);
    const [downloadTarget, setDownloadTarget] = useState<PolicyV2 | null>(null);

    const [parsingFile, setParsingFile] = useState(false);
    const policyImportInputRef = useRef<HTMLInputElement>(null);

    const handlePolicyFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setParsingFile(true);
        try {
            const extractedText = await SupabaseService.parsePolicyDocumentFile(file);
            const currentUserName = sessionStorage.getItem("grcUserName") || currentUserEmail || 'Policy Owner';
            const defaultDocLang = {
                document_type: 'policy',
                document_id: 'POL-TEMP',
                title: file.name.replace(/\.[^/.]+$/, ""),
                version: '1.0',
                status: 'draft',
                metadata: {
                    owner_name: currentUserName,
                    refresh_date: null
                },
                sections: [],
                approval_matrix: [],
                revision_history: [],
                references: [],
                applicability: [],
                tables: [],
                images: [],
                signatures: [],
                attachments: []
            };
            const parsed = parseDocumentText(extractedText, defaultDocLang);
            if (parsed) {
                setEditorTarget({ initialDocLang: parsed });
            } else {
                alert('Could not parse any content from the document.');
            }
        } catch (err: any) {
            alert(err.message || 'Failed to parse file.');
        } finally {
            setParsingFile(false);
            if (policyImportInputRef.current) {
                policyImportInputRef.current.value = '';
            }
        }
    };

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
            if (me) { 
                setCurrentUserId(me.userId); 
                setCurrentUserEmail(me.email); 
                setCurrentUserRole(me.role);
                setOrgId(me.orgId || '');
                setOrgName(me.orgName || '');
            }
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

    useEffect(() => {
        const handleOpenPolicyMessage = (e: MessageEvent) => {
            if (e.data && e.data.type === 'OPEN_POLICY') {
                const targetPolicy = policies.find(p => p.policy_id === e.data.policyId);
                if (targetPolicy) {
                    setViewTarget(targetPolicy);
                }
            }
        };
        window.addEventListener('message', handleOpenPolicyMessage);
        return () => window.removeEventListener('message', handleOpenPolicyMessage);
    }, [policies]);

    // Auto-open a specific policy from notification click
    const pendingAutoOpenRef = useRef<string | null>(null);
    useEffect(() => {
        if (autoOpenPolicyId) {
            pendingAutoOpenRef.current = autoOpenPolicyId;
            fetchPolicies();
            onAutoOpenConsumed?.();
        }
    }, [autoOpenPolicyId]);

    useEffect(() => {
        if (pendingAutoOpenRef.current && policies.length > 0) {
            const target = policies.find(p => p.policy_id === pendingAutoOpenRef.current);
            if (target) {
                setViewTarget(target);
            }
            pendingAutoOpenRef.current = null;
        }
    }, [policies]);

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

    const handleDownloadSingle = async (policy: PolicyV2) => {
        try {
            const html = renderMarkdown(policy.markdown || `# ${policy.name}\n\nNo content.`);
            const container = document.createElement('div');
            container.style.cssText = 'position:absolute;left:-9999px;top:0;width:794px;padding:48px;background:#fff;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#111';
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

            const url = URL.createObjectURL(pdf.output('blob'));
            const a = document.createElement('a');
            a.href = url; a.download = `${policy.policy_id}.pdf`; a.click();
            URL.revokeObjectURL(url);
        } catch (err: any) {
            alert('PDF export failed: ' + err.message);
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
                    <button
                        onClick={() => setAiDraftOpen(true)}
                        disabled={isReadOnly}
                        title="AI Policy Drafter"
                        className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <BotIcon className="h-5 w-5" />
                    </button>
                    <button
                        onClick={() => setMapperOpen(true)}
                        disabled={isReadOnly}
                        title="Mapper Agent — map this policy to security domains + child policies"
                        className="p-2 text-gray-400 hover:text-purple-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <MapperIcon className="h-5 w-5" />
                    </button>
                    <button
                        onClick={() => policyImportInputRef.current?.click()}
                        disabled={parsingFile || isReadOnly}
                        title="Upload policy document (.md, .pdf, .docx, .txt)"
                        className={`p-2 rounded-md transition-colors ${
                            parsingFile || isReadOnly
                                ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed opacity-50'
                                : 'text-gray-400 hover:text-purple-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                    >
                        {parsingFile ? (
                            <svg className="animate-spin h-5 w-5 text-purple-500" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                        ) : (
                            <UploadIcon className="h-5 w-5" />
                        )}
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
                        disabled={isReadOnly}
                        title="Add Policy"
                        className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                    <span className="text-xs text-blue-300 dark:text-blue-700 font-normal">•</span>
                    <button 
                        onClick={() => setSelectedIds(new Set(filtered.map(p => p.policy_id)))} 
                        className="text-xs text-blue-500 hover:text-blue-700 underline"
                    >
                        Select All
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
                        />
                    ))}
                </div>
            )}

            {/* Modals */}
            {editorTarget !== null && (
                <EditorModal
                    policy={editorTarget.policy}
                    initialMarkdown={editorTarget.initialMarkdown}
                    initialDocLang={editorTarget.initialDocLang}
                    onClose={() => setEditorTarget(null)}
                    onSaved={fetchPolicies}
                    orgId={orgId}
                    orgName={orgName}
                    currentUserEmail={currentUserEmail}
                    isReadOnly={isReadOnly}
                    policies={policies}
                />
            )}
            <PolicyAIDraftModal
                isOpen={aiDraftOpen}
                onClose={() => setAiDraftOpen(false)}
                onUseDraft={(md, dl) => setEditorTarget({ initialMarkdown: md, initialDocLang: dl })}
            />
            <MapperRunModal
                isOpen={mapperOpen}
                onClose={() => setMapperOpen(false)}
                policies={policies}
                onMasterUpdated={fetchPolicies}
                onOpenVisualizer={(masterId) => {
                    setMapperOpen(false);
                    // GovernanceTab listens for this event and switches subtabs.
                    window.dispatchEvent(new CustomEvent('governance-navigate', {
                        detail: { subTab: 'mapper_visualizer', masterPolicyId: masterId },
                    }));
                }}
            />

            {viewTarget && (
                <ViewModal
                    policy={viewTarget}
                    currentUserId={currentUserId}
                    currentUserEmail={currentUserEmail}
                    onClose={() => setViewTarget(null)}
                    onApproved={fetchPolicies}
                    onEdit={() => { setViewTarget(null); setEditorTarget({ policy: viewTarget }); }}
                    onDelete={() => { setViewTarget(null); handleDelete(viewTarget); }}
                    onHistory={() => { setViewTarget(null); setHistoryTarget(viewTarget); }}
                    onDownload={() => setDownloadTarget(viewTarget)}
                    isReadOnly={isReadOnly}
                    allPolicies={policies}
                />
            )}
            {historyTarget && (
                <HistoryModal
                    policy={historyTarget}
                    onClose={() => setHistoryTarget(null)}
                />
            )}
            {downloadTarget && (
                <DownloadModal
                    policy={downloadTarget}
                    onClose={() => setDownloadTarget(null)}
                    userRole={currentUserRole}
                />
            )}
            <input
                type="file"
                ref={policyImportInputRef}
                onChange={handlePolicyFileUpload}
                accept=".md,.pdf,.docx,.txt"
                className="hidden"
            />
        </div>
    );
};
