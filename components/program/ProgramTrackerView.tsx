import React, { useState, useEffect, useRef, ChangeEvent, useCallback, useMemo } from 'react';
import { ProgramTask, ProgramTaskCreate, ProgramTaskUpdate, ProgramStatus, ActivityLog, AllActivityLog, OrgContact, formatOrgContact } from '../../types';
import * as SupabaseService from '../../services/supabase';
import { EyeIcon, PencilIcon, TrashIcon, PlusIcon, UploadIcon, DownloadIcon, SortUpDownIcon, SortUpIcon, SortDownIcon, HistoryIcon, MessageCircleIcon } from '../Icons';
import { Modal } from '../common/Modal';
import { StatusBadge } from '../common/StatusBadge';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';
import { useTableSelection } from '../../hooks/useTableSelection';
import { SelectionActionBar } from '../common/SelectionActionBar';
import { parseCSVLine, parseCSVText } from '../../utils/csvParser';
import { useDataRefresh } from '../../hooks/useDataRefresh';
import { BulkProgressModal, BulkProgress } from '../common/BulkProgressModal';

// ─── Assignee Search+Select (same pattern as OwnerSelect in CapabilityRegisterView) ───

interface AssigneeSelectProps {
    value: string;
    onChange: (value: string) => void;
    contacts: OrgContact[];
    onContactCreated?: (c: OrgContact) => void;
    readOnly?: boolean;
}

const AssigneeSelect: React.FC<AssigneeSelectProps> = ({ value, onChange, contacts, onContactCreated, readOnly }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newDept, setNewDept] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) { setIsOpen(false); setSearch(''); }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = contacts.filter(c => {
        const display = formatOrgContact(c).toLowerCase();
        const s = search.toLowerCase();
        return display.includes(s) || c.email.toLowerCase().includes(s);
    });

    const handleCreate = async () => {
        if (!newName.trim() || !newEmail.trim()) return;
        setCreating(true);
        try {
            const created = await SupabaseService.addOrgContact({ name: newName.trim(), email: newEmail.trim(), department: newDept.trim() });
            onContactCreated?.(created);
            onChange(formatOrgContact(created));
            setShowCreate(false);
            setNewName(''); setNewEmail(''); setNewDept('');
            setIsOpen(false);
            setSearch('');
        } catch (err: any) {
            alert(err.message || 'Failed to create contact');
        } finally {
            setCreating(false);
        }
    };

    if (readOnly) {
        return (
            <div className="mt-1 px-3 py-2 rounded-md bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm text-gray-900 dark:text-white min-h-[38px]">
                {value || '—'}
            </div>
        );
    }

    return (
        <div ref={ref} className="relative mt-1">
            <input
                ref={inputRef}
                type="text"
                value={isOpen ? search : value}
                onChange={e => { setSearch(e.target.value); setIsOpen(true); }}
                onFocus={() => { setIsOpen(true); setSearch(''); }}
                placeholder="Type to search contacts..."
                className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
            {isOpen && (
                <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg">
                    {filtered.map(c => {
                        const display = formatOrgContact(c);
                        return (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() => { onChange(display); setIsOpen(false); setSearch(''); }}
                                className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${value === display ? 'bg-blue-50 dark:bg-blue-900/20 font-medium' : 'text-gray-900 dark:text-white'}`}
                            >
                                <span>{c.name}</span>
                                {c.department && <span className="text-gray-400 ml-1">({c.department})</span>}
                                <span className="block text-xs text-gray-400">{c.email}</span>
                            </button>
                        );
                    })}
                    {filtered.length === 0 && !showCreate && (
                        <div className="px-3 py-2 text-sm text-gray-400">No matching contacts</div>
                    )}
                    <div className="border-t border-gray-200 dark:border-gray-600">
                        {showCreate ? (
                            <div className="px-3 py-2 space-y-2">
                                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name *" className="w-full text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
                                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Email *" className="w-full text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
                                <input type="text" value={newDept} onChange={e => setNewDept(e.target.value)} placeholder="Department" className="w-full text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
                                <div className="flex gap-2">
                                    <button type="button" onClick={handleCreate} disabled={creating || !newName.trim() || !newEmail.trim()} className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-300">
                                        {creating ? '...' : 'Create'}
                                    </button>
                                    <button type="button" onClick={() => { setShowCreate(false); setNewName(''); setNewEmail(''); setNewDept(''); }} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <button type="button" onClick={() => setShowCreate(true)} className="w-full px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 text-left font-medium">
                                + Create new contact
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// Helper function to sanitize input
const sanitizeInput = (input: string): string => {
    return input
        .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
        .replace(/javascript:/gi, '') // Remove javascript protocols
        .replace(/on\w+\s*=/gi, '') // Remove event handlers
        .trim();
};

// Derive status from progress
const deriveStatus = (progress: number): ProgramStatus => {
    if (progress === 0) return 'Planned';
    if (progress >= 100) return 'Completed';
    return 'InProgress';
};

// ─── History action labels & colors ──────────────────────────────────────────
const PROGRAM_ACTION_LABELS: Record<string, string> = {
    'Created Task':  'Task created',
    'Updated Task':  'Task updated',
    'Deleted Task':  'Task deleted',
    'Imported Tasks': 'Tasks imported',
    program_created: 'Task created',
    program_updated: 'Task updated',
    status_changed: 'Status changed',
    assignee_changed: 'Assignee changed',
    progress_updated: 'Progress updated',
    description_updated: 'Description updated',
    due_date_updated: 'Due date updated',
    comment_added: 'Comment added',
    comment: 'Comment added',
    comment_edited: 'Comment updated',
    comment_deleted: 'Comment deleted',
    program_deleted: 'Task deleted',
    child_attached: 'Attached as child task',
    child_detached: 'Detached from parent',
    'program_blocked':    'Blocked',
    'program_unblocked':  'Unblocked',
};

const PROGRAM_ACTION_COLORS: Record<string, string> = {
    'Created Task':  'bg-blue-500',
    'Updated Task':  'bg-purple-500',
    'Deleted Task':  'bg-red-700',
    'Imported Tasks': 'bg-teal-500',
    program_created: 'bg-blue-500',
    program_updated: 'bg-gray-400',
    status_changed: 'bg-purple-500',
    assignee_changed: 'bg-orange-400',
    progress_updated: 'bg-green-500',
    description_updated: 'bg-indigo-400',
    due_date_updated: 'bg-amber-400',
    comment_added: 'bg-blue-400',
    comment: 'bg-blue-400',
    comment_edited: 'bg-yellow-500',
    comment_deleted: 'bg-gray-400',
    program_deleted: 'bg-red-700',
    child_attached: 'bg-cyan-500',
    child_detached: 'bg-gray-400',
    'program_blocked':    'bg-red-500',
    'program_unblocked':  'bg-green-500',
};

interface ProgramModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (task: ProgramTaskCreate | ProgramTaskUpdate) => void;
    taskToEdit: ProgramTask | null;
    mode: 'add' | 'edit' | 'view';
    contacts: OrgContact[];
    onContactCreated?: (c: OrgContact) => void;
    onEdit?: () => void;
    onDelete?: () => void;
    onSaveComment?: (comment: string) => void;
    onEditComment?: (commentId: string, comment: string) => void;
    onDeleteComment?: (commentId: string) => void;
    currentUserId?: string;
    isReadOnly?: boolean;
}

const ProgramModal: React.FC<ProgramModalProps> = ({ isOpen, onClose, onSave, taskToEdit, mode, contacts, onContactCreated, onEdit, onDelete, onSaveComment, onEditComment, onDeleteComment, currentUserId, isReadOnly = false }) => {
    const [formData, setFormData] = useState<ProgramTaskCreate | ProgramTaskUpdate>({});
    const [history, setHistory] = useState<AllActivityLog[]>([]);
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editCommentText, setEditCommentText] = useState('');

    useEffect(() => {
        if (isOpen) {
            if (taskToEdit?.id) {
                SupabaseService.getProgramHistory(taskToEdit.id).then(setHistory);
            } else {
                setHistory([]);
            }
        }
    }, [isOpen, taskToEdit?.id, taskToEdit]);

    const formatRelativeTime = (iso: string) => {
        const d = new Date(iso);
        const diff = Math.floor((Date.now() - d.getTime()) / 1000);
        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff / 60)} mins ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
        return `${Math.floor(diff / 86400)} days ago`;
    };
    const [newComment, setNewComment] = useState('');
    const isViewMode = mode === 'view';
    const isFieldsDisabled = isViewMode || isReadOnly;

    useEffect(() => {
        if (taskToEdit) {
            setFormData({
                program_name: taskToEdit.program_name,
                description: taskToEdit.description,
                month: taskToEdit.month,
                due_date: taskToEdit.due_date || '',
                assignee: taskToEdit.assignee || '',
                status: taskToEdit.status,
                progress_percent: taskToEdit.progress_percent
            });
            setNewComment('');
        } else {
            setFormData({
                program_name: '', description: '', month: 'January', due_date: '', assignee: '', status: 'Planned', progress_percent: 0
            });
            setNewComment('');
        }
    }, [taskToEdit, isOpen, mode]);

    const isEscalated = formData.status === 'Escalated';

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'progress_percent') {
            const progress = Number(value);
            setFormData(prev => ({ ...prev, progress_percent: progress, status: deriveStatus(progress) }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const toggleEscalated = () => {
        setFormData(prev => {
            if (prev.status === 'Escalated') {
                const newStatus = deriveStatus(prev.progress_percent || 0);
                return { ...prev, status: newStatus };
            }
            return { ...prev, status: 'Escalated' as ProgramStatus };
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const cleaned = {
            ...formData,
            due_date: formData.due_date || null,
            assignee: formData.assignee || null,
        };
        onSave(cleaned);
    };

    const title = mode === 'add' ? 'Add New Task' : mode === 'edit' ? 'Edit Task' : 'View Task';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}
            headerActions={isViewMode && (
                <>
                    <button
                        onClick={() => { onClose(); onEdit?.(); }}
                        disabled={isReadOnly}
                        title="Edit"
                        className="p-1.5 text-gray-400 hover:text-yellow-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => { onClose(); onDelete?.(); }}
                        disabled={isReadOnly}
                        title="Delete"
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <TrashIcon className="h-4 w-4" />
                    </button>
                </>
            )}
        >
            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Task Name</label>
                        <input type="text" name="program_name" value={formData.program_name || ''} onChange={handleChange} readOnly={isFieldsDisabled} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Assignee</label>
                        <AssigneeSelect
                            value={formData.assignee || ''}
                            onChange={val => setFormData(prev => ({ ...prev, assignee: val }))}
                            contacts={contacts}
                            onContactCreated={onContactCreated}
                            readOnly={isFieldsDisabled}
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                        <textarea name="description" value={formData.description || ''} onChange={handleChange} readOnly={isFieldsDisabled} rows={3} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"></textarea>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                        <div className="mt-1 flex items-center gap-3">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                formData.status === 'Escalated' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300' :
                                formData.status === 'Completed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' :
                                formData.status === 'InProgress' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' :
                                'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                            }`}>{formData.status || 'Planned'}</span>
                            {!isViewMode && (
                                <button
                                    type="button"
                                    onClick={toggleEscalated}
                                    disabled={isReadOnly}
                                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                                        isEscalated
                                            ? 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-900/30'
                                            : 'border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-600 dark:text-purple-300 dark:hover:bg-purple-900/30'
                                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                                >
                                    {isEscalated ? 'Remove Escalation' : 'Escalate to CXO'}
                                </button>
                            )}
                        </div>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Progress (%)</label>
                        <input type="range" name="progress_percent" min="0" max="100" value={formData.progress_percent || 0} onChange={handleChange} disabled={isFieldsDisabled || isEscalated} className="mt-1 block w-full" />
                        <span className="text-sm dark:text-gray-300">{formData.progress_percent || 0}%</span>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Due Date</label>
                        <input type="date" name="due_date" value={formData.due_date || ''} onChange={handleChange} readOnly={isFieldsDisabled} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                </div>

                {/* Comments Section */}
                <div className="mt-6 border-t pt-4 dark:border-gray-700">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        <MessageCircleIcon className="h-4 w-4 text-gray-400" />
                        Comments
                    </label>
                    <textarea
                        name="newComment"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        disabled={isReadOnly}
                        rows={3}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        placeholder="Add a comment..."
                    ></textarea>

                    {newComment.trim() !== '' && (
                        <div className="mt-2 flex justify-end">
                            <button
                                type="button"
                                onClick={() => {
                                    onSaveComment?.(newComment);
                                    setNewComment('');
                                }}
                                disabled={isReadOnly}
                                className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Save Comment
                            </button>
                        </div>
                    )}

                    {/* Recent Comments List */}
                    {history.filter(h => h.action === 'comment_added').length > 0 && (
                        <div className="mt-4 space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                            {history
                                .filter(h => h.action === 'comment_added')
                                .map(h => {
                                    const ed = (h.event_data || {}) as any;
                                    const isAuthor = currentUserId && (h.user_id === currentUserId);
                                    const isEditing = editingCommentId === h.id;
                                    return (
                                        <div key={h.id} className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 border dark:border-gray-800">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                                                    {ed.actor_name || ed.user_email || 'Unknown'}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] text-gray-400">
                                                        {formatRelativeTime(h.created_at)}
                                                        {ed.edited && ' (edited)'}
                                                    </span>
                                                    {isAuthor && !isEditing && (
                                                        <div className="flex items-center gap-2">
                                                            <button type="button" disabled={isReadOnly} onClick={() => { setEditingCommentId(h.id); setEditCommentText(typeof ed.comment === 'string' ? ed.comment : (ed.comment?.text || '')); }} className="text-[10px] text-blue-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed">Edit</button>
                                                            <button type="button" disabled={isReadOnly} onClick={() => onDeleteComment?.(h.id)} className="text-[10px] text-red-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed">Delete</button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            {isEditing ? (
                                                <div className="space-y-2">
                                                    <textarea value={editCommentText} onChange={e => setEditCommentText(e.target.value)} className="w-full text-sm p-2 rounded dark:bg-gray-800 dark:text-white border" rows={2} />
                                                    <div className="flex gap-2">
                                                        <button type="button" onClick={() => { onEditComment?.(h.id, editCommentText); setEditingCommentId(null); }} className="px-2 py-1 text-[10px] bg-blue-600 text-white rounded">Save</button>
                                                        <button type="button" onClick={() => setEditingCommentId(null)} className="px-2 py-1 text-[10px] text-gray-500">Cancel</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                                                    {typeof ed.comment === 'string' ? ed.comment : (ed.comment?.text || JSON.stringify(ed.comment))}
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </div>
                {!isViewMode && (
                <div className="mt-6 flex justify-end space-x-3">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>
                    <button type="submit" disabled={isReadOnly} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">Save</button>
                </div>
                )}
            </form>
        </Modal>
    );
};


const HistoryModal: React.FC<{ task: ProgramTask; onClose: () => void }> = ({ task, onClose }) => {
    const [entries, setEntries] = useState<AllActivityLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        SupabaseService.getProgramHistory(task.id)
            .then(setEntries)
            .finally(() => setLoading(false));
    }, [task.id]);

    const fmt = (iso: string) => new Date(iso).toLocaleString();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
                    <div>
                        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Task History</h2>
                        <p className="text-xs text-gray-500 mt-0.5">{task.program_name}</p>
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
                                const actorName = ed.actor_name || ed.user_email || e.user_id || 'Unknown';
                                const fromStatus = ed.from_status as string | null;
                                const toStatus = ed.to_status as string | null;
                                const fromAssignee = ed.from_assignee as string | null;
                                const toAssignee = ed.to_assignee as string | null;
                                const fromProgress = ed.from_progress !== undefined ? ed.from_progress : undefined;
                                const toProgress = ed.to_progress !== undefined ? ed.to_progress : undefined;
                                const fromDate = ed.from_date as string | null;
                                const toDate = ed.to_date as string | null;
                                const fromDesc = ed.from_description as string | null;
                                const toDesc = ed.to_description as string | null;

                                const dotColor = PROGRAM_ACTION_COLORS[e.action] || 'bg-gray-400';
                                return (
                                    <li key={e.id} className="ml-4">
                                        <span className={`absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full ${dotColor} ring-4 ring-white dark:ring-gray-800`} />
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                                            {PROGRAM_ACTION_LABELS[e.action] || e.action}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            by <span className="font-medium">{actorName}</span>
                                            {fromStatus && toStatus && fromStatus !== toStatus && (
                                                <span className="ml-1 text-gray-400">· {fromStatus} → {toStatus}</span>
                                            )}
                                            {fromAssignee !== undefined && toAssignee !== undefined && fromAssignee !== toAssignee && (
                                                <span className="ml-1 text-gray-400">· {fromAssignee || '—'} → {toAssignee || '—'}</span>
                                            )}
                                            {fromProgress !== undefined && toProgress !== undefined && fromProgress !== toProgress && (
                                                <span className="ml-1 text-gray-400">· {fromProgress}% → {toProgress}%</span>
                                            )}
                                            {fromDate && toDate && fromDate !== toDate && (
                                                <span className="ml-1 text-gray-400">· {new Date(fromDate).toLocaleDateString()} → {new Date(toDate).toLocaleDateString()}</span>
                                            )}
                                        </p>
                                        {fromDesc !== undefined && toDesc !== undefined && fromDesc !== toDesc && (
                                            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300 italic">
                                                "{toDesc || 'No description'}"
                                            </p>
                                        )}
                                        {ed.old_comment && ed.new_comment ? (
                                            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300 italic">
                                                <span className="font-semibold mr-1">Updated comment:</span>
                                                "{ed.old_comment}" → "{ed.new_comment}"
                                            </p>
                                        ) : ed.comment ? (
                                            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300 italic">
                                                {e.action === 'comment_edited' && <span className="font-semibold mr-1">Updated comment:</span>}
                                                "{typeof ed.comment === 'string' ? ed.comment : (ed.comment?.text || JSON.stringify(ed.comment))}"
                                            </p>
                                        ) : null}
                                        {ed.note && (
                                            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300 italic">{ed.note}</p>
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

const CommentModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (comment: string) => void;
    task: ProgramTask | null;
    onEditComment?: (id: string, text: string) => void;
    onDeleteComment?: (id: string) => void;
    currentUserId?: string;
}> = ({ isOpen, onClose, onSave, task, onEditComment, onDeleteComment, currentUserId }) => {
    const [comment, setComment] = useState('');
    const [history, setHistory] = useState<AllActivityLog[]>([]);
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editCommentText, setEditCommentText] = useState('');

    useEffect(() => {
        if (isOpen) {
            setComment('');
            if (task?.id) {
                SupabaseService.getProgramHistory(task.id).then(setHistory);
            }
        }
    }, [isOpen, task?.id, task]);

    const formatRelativeTime = (iso: string) => {
        const d = new Date(iso);
        const diff = Math.floor((Date.now() - d.getTime()) / 1000);
        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff / 60)} mins ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
        return `${Math.floor(diff / 86400)} days ago`;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (comment.trim()) {
            onSave(comment.trim());
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add Comment">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Task: <span className="font-semibold text-blue-600 dark:text-blue-400">{task?.program_name}</span>
                    </label>
                    <textarea
                        autoFocus
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Type your comment here..."
                        className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        rows={4}
                        required
                    />
                </div>
                <div className="flex justify-end space-x-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                        Save Comment
                    </button>
                </div>

                {/* Recent Comments List */}
                {history.filter(h => h.action === 'comment_added').length > 0 && (
                    <div className="mt-4 border-t pt-4 dark:border-gray-700">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Recent Comments</h4>
                        <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                            {history
                                .filter(h => h.action === 'comment_added')
                                .map(h => {
                                    const ed = (h.event_data || {}) as any;
                                    const isAuthor = currentUserId && (h.user_id === currentUserId);
                                    const isEditing = editingCommentId === h.id;
                                    return (
                                        <div key={h.id} className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 border dark:border-gray-800">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                                                    {ed.actor_name || ed.user_email || 'Unknown'}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] text-gray-400">
                                                        {formatRelativeTime(h.created_at)}
                                                        {ed.edited && ' (edited)'}
                                                    </span>
                                                    {isAuthor && !isEditing && (
                                                        <div className="flex items-center gap-2">
                                                            <button type="button" onClick={() => { setEditingCommentId(h.id); setEditCommentText(typeof ed.comment === 'string' ? ed.comment : (ed.comment?.text || '')); }} className="text-[10px] text-blue-600 hover:underline">Edit</button>
                                                            <button type="button" onClick={() => onDeleteComment?.(h.id)} className="text-[10px] text-red-600 hover:underline">Delete</button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            {isEditing ? (
                                                <div className="space-y-2">
                                                    <textarea value={editCommentText} onChange={e => setEditCommentText(e.target.value)} className="w-full text-sm p-2 rounded dark:bg-gray-800 dark:text-white border" rows={2} />
                                                    <div className="flex gap-2">
                                                        <button type="button" onClick={() => { onEditComment?.(h.id, editCommentText); setEditingCommentId(null); SupabaseService.getProgramHistory(task?.id!).then(setHistory); }} className="px-2 py-1 text-[10px] bg-blue-600 text-white rounded">Save</button>
                                                        <button type="button" onClick={() => setEditingCommentId(null)} className="px-2 py-1 text-[10px] text-gray-500">Cancel</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                                                    {ed.current_comment ? (typeof ed.current_comment === 'string' ? ed.current_comment : JSON.stringify(ed.current_comment)) : (typeof ed.comment === 'string' ? ed.comment : (ed.comment?.text || JSON.stringify(ed.comment)))}
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                )}
            </form>
        </Modal>
    );
};


// ─── Add / attach child task modal ───────────────────────────────────────────
const AddChildModal: React.FC<{
    parent: ProgramTask;
    allTasks: ProgramTask[];
    onClose: () => void;
    onCreate: (data: ProgramTaskCreate) => void;
    onAttach: (childId: string) => void;
}> = ({ parent, allTasks, onClose, onCreate, onAttach }) => {
    const [tab, setTab] = useState<'create' | 'attach'>('create');
    const [name, setName] = useState('');
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<string>('');

    // A task can only become a child if it has no sub-tasks of its own (two-level rule).
    const childParentIds = useMemo(
        () => new Set(allTasks.filter(t => t.parent_id).map(t => t.parent_id as string)),
        [allTasks],
    );
    const candidates = useMemo(
        () => allTasks.filter(t => t.id !== parent.id && t.parent_id !== parent.id && !childParentIds.has(t.id)),
        [allTasks, parent.id, childParentIds],
    );
    const filtered = candidates.filter(t => {
        const q = search.toLowerCase();
        return t.program_name.toLowerCase().includes(q) || (t.task_code || '').toLowerCase().includes(q);
    });

    const submitCreate = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        onCreate({ program_name: name.trim(), description: '', month: 'January', due_date: null, assignee: null, status: 'Planned', progress_percent: 0 });
    };

    return (
        <Modal isOpen={true} onClose={onClose} title="Add Child Task">
            <div className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                Parent: <span className="font-semibold text-gray-800 dark:text-gray-200">{parent.program_name}</span>
                {parent.task_code && <span className="ml-2 font-mono text-xs text-gray-400">{parent.task_code}</span>}
            </div>
            <div className="flex gap-2 mb-4 border-b dark:border-gray-700">
                <button type="button" onClick={() => setTab('create')} className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px ${tab === 'create' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500'}`}>Create new</button>
                <button type="button" onClick={() => setTab('attach')} className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px ${tab === 'attach' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500'}`}>Attach existing</button>
            </div>
            {tab === 'create' ? (
                <form onSubmit={submitCreate} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Task Name</label>
                        <input autoFocus type="text" value={name} onChange={e => setName(e.target.value)} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500">Cancel</button>
                        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">Create child task</button>
                    </div>
                </form>
            ) : (
                <div className="space-y-4">
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks by name or code..." className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    <div className="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md divide-y divide-gray-100 dark:divide-gray-700">
                        {filtered.length === 0 ? (
                            <p className="px-3 py-3 text-sm text-gray-400">No eligible tasks. A task can only be attached if it has no sub-tasks of its own.</p>
                        ) : filtered.map(t => (
                            <button key={t.id} type="button" onClick={() => setSelectedId(t.id)} className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/60 ${selectedId === t.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                                <span>{t.program_name}{t.parent_id && <span className="ml-2 text-[10px] text-amber-500">(currently a child — will move)</span>}</span>
                                <span className="text-xs font-mono text-gray-400">{t.task_code || ''}</span>
                            </button>
                        ))}
                    </div>
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500">Cancel</button>
                        <button type="button" disabled={!selectedId} onClick={() => selectedId && onAttach(selectedId)} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-300">Attach as child</button>
                    </div>
                </div>
            )}
        </Modal>
    );
};

export const ProgramTrackerView: React.FC<{ isActive?: boolean; hideEscalated?: boolean; isCxo?: boolean; userRole?: UserRole | null }> = ({ isActive = true, hideEscalated = false, isCxo = false, userRole }) => {
    const isReadOnly = userRole === 'read-only';
    const [tasks, setTasks] = useState<ProgramTask[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [modalState, setModalState] = useState<{ type: 'add' | 'edit' | 'view' | 'delete' | 'log' | 'comment' | 'add-child' | null; task?: ProgramTask | null }>({ type: null });
    // CXO-only "show escalated issues only" toggle — defaults ON, persisted per session
    // (sessionStorage is cleared on logout, so it returns to ON on the next login).
    const [escalatedOnly, setEscalatedOnly] = useState<boolean>(() => {
        if (!isCxo) return false;
        const stored = sessionStorage.getItem('program_escalated_only');
        return stored === null ? true : stored === 'true';
    });
    useEffect(() => {
        if (isCxo) sessionStorage.setItem('program_escalated_only', String(escalatedOnly));
    }, [isCxo, escalatedOnly]);
    const [filter, setFilter] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof ProgramTask; direction: 'ascending' | 'descending' } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [orgContacts, setOrgContacts] = useState<OrgContact[]>([]);
    const [currentUserId, setCurrentUserId] = useState<string>();
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState<BulkProgress>({ total: 0, completed: 0, failed: 0, status: 'idle' });

    const {
        selectedIds, isEditing, editValues, isConfirmingDelete, isSaving, bulkProgress,
        setIsConfirmingDelete, setIsSaving, startBulkOperation, incrementBulkProgress, finishBulkOperation, resetBulkProgress,
        toggle, toggleAll, clearAll, startEdit, updateField, cancelEdit,
    } = useTableSelection<ProgramTask>();

    useEffect(() => {
        SupabaseService.getUser().then(u => setCurrentUserId(u?.id));
    }, []);

    const editInputCls = "w-full border border-blue-300 dark:border-blue-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400";

    const fetchTasks = useCallback(async () => {
        const data = await SupabaseService.getTasks();
        setTasks(data);
        return data;
    }, []);

    const fetchContacts = useCallback(async () => {
        const data = await SupabaseService.getOrgContacts();
        setOrgContacts(data);
    }, []);

    const { data: tasksData, loading: tasksLoading, error: tasksError, refresh } = useDataRefresh(fetchTasks, [], isActive);

    useEffect(() => { fetchContacts(); }, [fetchContacts]);

    useMemo(() => {
        if (tasksData) setTasks(tasksData);
        if (tasksError) setError(tasksError);
    }, [tasksData, tasksError]);

    useMemo(() => {
        setLoading(tasksLoading);
    }, [tasksLoading]);

    const closeModal = () => setModalState({ type: null });

    const handleSaveTask = async (formData: ProgramTaskCreate | ProgramTaskUpdate) => {
        try {
            if (modalState.type === 'edit' && modalState.task) {
                await SupabaseService.updateTask(modalState.task.id, formData);
            } else if (modalState.type === 'add') {
                await SupabaseService.addTask(formData as ProgramTaskCreate);
            }
            fetchTasks();
            closeModal();
        } catch (err) {
            setError('Failed to save task.');
        }
    };

    const handleDeleteTask = async () => {
        if (modalState.type === 'delete' && modalState.task) {
            try {
                await SupabaseService.deleteTask(modalState.task.id);
                fetchTasks();
                closeModal();
            } catch (err: any) {
                setError('Failed to delete task.');
            }
        }
    };

    const handleCreateChild = async (parentId: string, formData: ProgramTaskCreate) => {
        try {
            await SupabaseService.addTask({ ...formData, parent_id: parentId });
            fetchTasks();
            closeModal();
        } catch (err: any) {
            setError(err?.message || 'Failed to create child task.');
        }
    };

    const handleAttachChild = async (parentId: string, childId: string) => {
        try {
            await SupabaseService.setTaskParent(childId, parentId);
            fetchTasks();
            closeModal();
        } catch (err: any) {
            setError(err?.message || 'Failed to attach child task.');
        }
    };

    const handleDetachChild = async (childId: string) => {
        try {
            await SupabaseService.setTaskParent(childId, null);
            fetchTasks();
        } catch (err: any) {
            setError(err?.message || 'Failed to detach task.');
        }
    };

    const handleSaveComment = async (comment: string) => {
        if (modalState.task) {
            try {
                await SupabaseService.addActivityLog(modalState.task.id, {
                    action: 'comment_added',
                    event_data: { comment }
                });
                fetchTasks();
                if (modalState.type === 'comment') {
                    closeModal();
                } else {
                    const task = await SupabaseService.getTaskById(modalState.task.id);
                    setModalState(prev => ({ ...prev, task }));
                }
            } catch (err) {
                setError('Failed to save comment.');
            }
        }
    };

    const handleEditComment = async (activityId: string, comment: string) => {
        if (modalState.task) {
            try {
                await SupabaseService.updateActivityLog(modalState.task.id, activityId, {
                    action: 'comment_added',
                    event_data: { comment }
                });
                fetchTasks();
                const task = await SupabaseService.getTaskById(modalState.task.id);
                setModalState(prev => ({ ...prev, task }));
            } catch (err) {
                setError('Failed to update comment.');
            }
        }
    };

    const handleDeleteComment = async (activityId: string) => {
        if (modalState.task && window.confirm('Are you sure you want to delete this comment?')) {
            try {
                await SupabaseService.deleteActivityLog(modalState.task.id, activityId);
                fetchTasks();
                const task = await SupabaseService.getTaskById(modalState.task.id);
                setModalState(prev => ({ ...prev, task }));
            } catch (err) {
                setError('Failed to delete comment.');
            }
        }
    };

    const handleImportCSV = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            if(!text) return;

            const { rows } = parseCSVText(text);
            if (rows.length === 0) return;
            
            const importedTasks: ProgramTaskCreate[] = rows
                .map(row => {
                    const program_name = row.program_name || row.Program_Name || '';
                    if (!program_name.trim()) return null;

                    const description = row.description || row.Description || '';
                    const due_date = row.due_date || row.Due_Date || '';
                    const assignee = row.assignee || row.Assignee || '';
                    const status = row.status || row.Status || '';
                    const progress_percent = row.progress_percent || row.Progress_Percent || '0';
                    const id = row.id || row.ID || null;

                    return {
                        id: id ? id.trim() : undefined,
                        program_name: sanitizeInput(program_name.trim()),
                        description: description ? sanitizeInput(description.trim()) : '',
                        month: 'January',
                        due_date: (due_date && !isNaN(Date.parse(due_date.trim()))) ? due_date.trim() : null,
                        assignee: assignee ? sanitizeInput(assignee.trim()) : null,
                        status: status ? (sanitizeInput(status.trim()) as ProgramStatus) : deriveStatus(Number(progress_percent) || 0),
                        progress_percent: Number(progress_percent) || 0,
                    } as ProgramTaskCreate;
                })
                .filter((task): task is ProgramTaskCreate => task !== null);

            // Filter to only include new or updated tasks
            const tasksToProcess = importedTasks.filter(newTask => {
                // Find existing by ID or Name
                const existing = tasks.find(t => 
                    (newTask.id && t.id === newTask.id) || 
                    (!newTask.id && t.program_name.trim().toLowerCase() === newTask.program_name.trim().toLowerCase())
                );

                if (!existing) return true; // Brand new

                // Check for differences
                const hasNameChange = newTask.program_name.trim() !== existing.program_name.trim();
                const hasDescChange = (newTask.description || '') !== (existing.description || '');
                const hasAssigneeChange = (newTask.assignee || '') !== (existing.assignee || '');
                const hasStatusChange = newTask.status !== existing.status;
                const hasProgressChange = Number(newTask.progress_percent) !== Number(existing.progress_percent);
                
                // Date comparison
                const newDate = newTask.due_date ? new Date(newTask.due_date).toISOString().split('T')[0] : null;
                const existingDate = existing.due_date ? new Date(existing.due_date).toISOString().split('T')[0] : null;
                const hasDateChange = newDate !== existingDate;

                const changed = hasNameChange || hasDescChange || hasAssigneeChange || hasStatusChange || hasProgressChange || hasDateChange;
                
                // If matched by name, ensure ID is set for update
                if (changed && !newTask.id) {
                    newTask.id = existing.id;
                }
                
                return changed;
            });

            if (tasksToProcess.length > 0) {
                setIsImporting(true);
                setImportProgress({ total: tasksToProcess.length, completed: 0, failed: 0, status: 'processing' });
                
                try {
                    const CHUNK_SIZE = 50;
                    for (let i = 0; i < tasksToProcess.length; i += CHUNK_SIZE) {
                        const chunk = tasksToProcess.slice(i, i + CHUNK_SIZE);
                        try {
                            await SupabaseService.bulkAddTasks(chunk);
                            setImportProgress(prev => ({
                                ...prev,
                                completed: prev.completed + chunk.length
                            }));
                        } catch (chunkErr) {
                            console.error('Chunk import error:', chunkErr);
                            setImportProgress(prev => ({
                                ...prev,
                                failed: prev.failed + chunk.length
                            }));
                        }
                    }
                    
                    fetchTasks();
                    setImportProgress(prev => ({
                        ...prev,
                        status: prev.failed > 0 ? (prev.completed > 0 ? 'warning' : 'error') : 'done'
                    }));
                } catch (err: any) {
                    console.error('Import error:', err);
                    setImportProgress(prev => ({ ...prev, status: 'error' }));
                    alert(`Failed to import: ${err.message}`);
                }
            } else {
                alert('No new or updated tasks found in the CSV.');
            }
        };
        reader.readAsText(file);
        if(fileInputRef.current) fileInputRef.current.value = '';
    };

    // Display rows are flattened parent→child groups (two levels). Each carries its
    // nesting depth and, for parents, the number of children so the UI can render them.
    const displayRows = useMemo(() => {
        const q = filter.toLowerCase().trim();
        const matches = (t: ProgramTask) =>
            !q ||
            t.program_name.toLowerCase().includes(q) ||
            (t.description || '').toLowerCase().includes(q) ||
            (t.task_code || '').toLowerCase().includes(q);
        const sortItems = (arr: ProgramTask[]) => {
            if (!sortConfig) return arr;
            return [...arr].sort((a, b) => {
                const aVal = a[sortConfig.key] as any;
                const bVal = b[sortConfig.key] as any;
                if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        };

        // CXO "escalated only": flat list of escalated tasks, no nesting.
        if (isCxo && escalatedOnly) {
            return sortItems(tasks.filter(t => t.status === 'Escalated' && matches(t)))
                .map(task => ({ task, depth: 0, childCount: 0 }));
        }

        const byParent = new Map<string, ProgramTask[]>();
        const top: ProgramTask[] = [];
        for (const t of tasks) {
            if (t.parent_id) {
                const arr = byParent.get(t.parent_id) || [];
                arr.push(t);
                byParent.set(t.parent_id, arr);
            } else {
                top.push(t);
            }
        }
        const topIds = new Set(top.map(t => t.id));
        const rows: { task: ProgramTask; depth: number; childCount: number }[] = [];
        for (const p of sortItems(top)) {
            const kids = byParent.get(p.id) || [];
            const parentMatches = matches(p);
            const visibleKids = q ? kids.filter(matches) : kids;
            if (q && !parentMatches && visibleKids.length === 0) continue;
            rows.push({ task: p, depth: 0, childCount: kids.length });
            for (const k of sortItems(visibleKids)) rows.push({ task: k, depth: 1, childCount: 0 });
        }
        // Defensive: children whose parent isn't a current top-level row show standalone.
        for (const t of tasks) {
            if (t.parent_id && !topIds.has(t.parent_id) && matches(t)) {
                rows.push({ task: t, depth: 0, childCount: 0 });
            }
        }
        return rows;
    }, [tasks, filter, sortConfig, isCxo, escalatedOnly]);

    const filteredAndSortedTasks = useMemo(() => displayRows.map(r => r.task), [displayRows]);

    const requestSort = (key: keyof ProgramTask) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') direction = 'descending';
        setSortConfig({ key, direction });
    };

    const getSortIconFor = (key: keyof ProgramTask) => {
        if (!sortConfig || sortConfig.key !== key) return <SortUpDownIcon className="h-4 w-4 ml-1 text-gray-400" />;
        return sortConfig.direction === 'ascending' ? <SortUpIcon className="h-4 w-4 ml-1" /> : <SortDownIcon className="h-4 w-4 ml-1" />;
    };

    const handleExportCSV = () => {
        const headers = ['id', 'program_name', 'description', 'due_date', 'assignee', 'status', 'progress_percent'];
        const quoteCSVValue = (val: any) => {
            const s = val === null || val === undefined ? '' : String(val);
            return `"${s.replace(/"/g, '""')}"`;
        };
        const csvContent = [
            headers.join(','), 
            ...filteredAndSortedTasks.map(t => [
                t.id,
                t.program_name, 
                t.description, 
                t.due_date, 
                t.assignee, 
                t.status, 
                t.progress_percent
            ].map(quoteCSVValue).join(','))
        ].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `tasks-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    const handleSaveAll = async () => {
        try {
            setIsSaving(true);
            for (const id of selectedIds) {
                const changes = editValues[id as string];
                if (changes) {
                    await SupabaseService.updateTask(id as string, changes);
                }
            }
            clearAll();
            fetchTasks();
        } catch {
            setError('Failed to save changes.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleBulkDelete = async () => {
        setIsConfirmingDelete(false);
        startBulkOperation(selectedIds.size);

        try {
            const idsToDelete = Array.from(selectedIds) as string[];
            
            // Use bulk deletion for efficiency with 1000+ records
            await SupabaseService.deleteTasksBulk(idsToDelete);

            // Mark all as successful since bulk operation either succeeds or fails entirely
            for (let i = 0; i < selectedIds.size; i++) {
                incrementBulkProgress(true);
            }

            finishBulkOperation(false);

            // Refresh the task list, but do NOT call clearAll() yet —
            // that would reset bulkProgress to 'idle' and hide the progress
            // modal before the user can see the result. The user closes it
            // via the X button on the BulkProgressModal (which calls clearAll).
            fetchTasks();
        } catch (err) {
            console.error('Bulk delete failed:', err);
            for (let i = 0; i < selectedIds.size; i++) {
                incrementBulkProgress(false);
            }
            finishBulkOperation(true);
            setError('Failed to delete selected tasks.');
        }
    };

    const programStatusStyles = {
        Planned: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
        InProgress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
        Completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
        Blocked: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
        Escalated: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    };

    return (
        <div className="px-4 py-6 sm:px-0">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Program Tracker</h2>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    {isCxo && (
                        <label className="flex items-center gap-2 cursor-pointer select-none whitespace-nowrap" title="When on, only escalated issues are shown">
                            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Show escalated issues only</span>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={escalatedOnly}
                                onClick={() => setEscalatedOnly(v => !v)}
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${escalatedOnly ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${escalatedOnly ? 'translate-x-4' : 'translate-x-1'}`} />
                            </button>
                        </label>
                    )}
                    <input
                        type="text"
                        placeholder="Filter tasks..."
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        className="block w-full sm:w-56 rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                    <div className="flex items-center space-x-2">
                        <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isReadOnly}
                            title="Import CSV"
                            className="p-2 text-gray-400 hover:text-green-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <UploadIcon className="h-5 w-5" />
                        </button>
                        <button onClick={handleExportCSV} title="Export CSV" className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                            <DownloadIcon className="h-5 w-5" />
                        </button>
                        <button
                            onClick={() => setModalState({ type: 'add' })}
                            disabled={isReadOnly}
                            title="Add Task"
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <PlusIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            </div>

            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}

            <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg dark:border-gray-700">
                <div className="overflow-auto max-h-[calc(100vh-280px)]">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 w-10 px-4 py-3">
                                    <input type="checkbox"
                                        checked={selectedIds.size === filteredAndSortedTasks.length && filteredAndSortedTasks.length > 0}
                                        onChange={() => toggleAll(filteredAndSortedTasks.map(i => i.id))}
                                        className="rounded border-gray-300 dark:border-gray-600 cursor-pointer" />
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('program_name')} className="flex items-center focus:outline-none">Name {getSortIconFor('program_name')}</button>
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    Assignee
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('status')} className="flex items-center focus:outline-none">Status {getSortIconFor('status')}</button>
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('progress_percent')} className="flex items-center focus:outline-none">Progress {getSortIconFor('progress_percent')}</button>
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('due_date' as any)} className="flex items-center focus:outline-none">Due Date {getSortIconFor('due_date' as any)}</button>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={7} className="text-center py-4 text-gray-500 dark:text-gray-400">Loading tasks...</td></tr>
                            ) : displayRows.length === 0 ? (
                                <tr><td colSpan={7} className="text-center py-4 text-gray-500 dark:text-gray-400">No tasks found.</td></tr>
                            ) : displayRows.map(({ task, depth, childCount }) => (
                                <tr key={task.id}
                                    onClick={() => !isEditing && setModalState({ type: 'view', task })}
                                    className={`cursor-pointer transition-colors ${
                                        selectedIds.has(task.id) ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                    } ${isEditing && !selectedIds.has(task.id) ? 'opacity-40 pointer-events-none' : ''}`}
                                >
                                    <td onClick={e => e.stopPropagation()} className="w-10 px-4 py-4">
                                        <input type="checkbox"
                                            checked={selectedIds.has(task.id)}
                                            onChange={() => toggle(task.id)}
                                            className="rounded border-gray-300 dark:border-gray-600 cursor-pointer" />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white" title={task.description || undefined}>
                                        {isEditing && selectedIds.has(task.id) ? (
                                            <input type="text" value={editValues[task.id]?.program_name ?? task.program_name} onChange={e => updateField(task.id, 'program_name', e.target.value)} className={editInputCls} />
                                        ) : (
                                            <div className="flex items-center gap-3 group" style={depth > 0 ? { paddingLeft: '1.5rem' } : undefined}>
                                                {depth > 0 && <span className="text-gray-300 dark:text-gray-600 select-none -ml-1">↳</span>}
                                                <div className="flex flex-col">
                                                    <span className="flex items-center gap-2">
                                                        {task.program_name}
                                                        {childCount > 0 && (
                                                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300">
                                                                {childCount} sub-task{childCount > 1 ? 's' : ''}
                                                            </span>
                                                        )}
                                                    </span>
                                                    {task.task_code && (
                                                        <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">{task.task_code}</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-0">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setModalState({ type: 'comment', task });
                                                        }}
                                                        className="p-0.5 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-all"
                                                        title="Add comment"
                                                    >
                                                        <MessageCircleIcon className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setModalState({ type: 'log', task });
                                                        }}
                                                        className="p-0.5 text-gray-400 hover:text-purple-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-all"
                                                        title="View History"
                                                    >
                                                        <HistoryIcon className="h-4 w-4" />
                                                    </button>
                                                    {depth === 0 ? (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setModalState({ type: 'add-child', task });
                                                            }}
                                                            className="p-0.5 text-gray-400 hover:text-cyan-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-all"
                                                            title="Add / attach child task"
                                                        >
                                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 8a2 2 0 11-4 0 2 2 0 014 0zm0 0v4a2 2 0 002 2h2m6-6v8m0 0a2 2 0 104 0 2 2 0 00-4 0zm-8 0a2 2 0 104 0 2 2 0 00-4 0z" />
                                                            </svg>
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDetachChild(task.id);
                                                            }}
                                                            className="p-0.5 text-gray-400 hover:text-amber-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-all"
                                                            title="Detach from parent"
                                                        >
                                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {isEditing && selectedIds.has(task.id) ? (
                                            <input type="text" value={editValues[task.id]?.assignee ?? task.assignee ?? ''} onChange={e => updateField(task.id, 'assignee', e.target.value)} className={editInputCls} placeholder="Type assignee" />
                                        ) : (task.assignee || '—')}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {isEditing && selectedIds.has(task.id) ? (
                                            <div className="flex items-center gap-2">
                                                <StatusBadge status={(editValues[task.id]?.status ?? task.status) as ProgramStatus} colorMap={programStatusStyles} />
                                                <button type="button" onClick={() => {
                                                    const currentStatus = (editValues[task.id]?.status ?? task.status) as ProgramStatus;
                                                    if (currentStatus === 'Blocked') {
                                                        const progress = editValues[task.id]?.progress_percent ?? task.progress_percent;
                                                        updateField(task.id, 'status', deriveStatus(progress));
                                                    } else {
                                                        updateField(task.id, 'status', 'Blocked');
                                                    }
                                                }} className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                                    (editValues[task.id]?.status ?? task.status) === 'Blocked'
                                                        ? 'border-green-300 text-green-700 hover:bg-green-50 dark:border-green-600 dark:text-green-300'
                                                        : 'border-red-300 text-red-700 hover:bg-red-50 dark:border-red-600 dark:text-red-300'
                                                }`}>
                                                    {(editValues[task.id]?.status ?? task.status) === 'Blocked' ? 'Unblock' : 'Block'}
                                                </button>
                                            </div>
                                        ) : <StatusBadge status={task.status} colorMap={programStatusStyles} />}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {isEditing && selectedIds.has(task.id) ? (
                                            <div className="flex items-center gap-2">
                                                <input type="range" min="0" max="100"
                                                    value={editValues[task.id]?.progress_percent ?? task.progress_percent}
                                                    disabled={(editValues[task.id]?.status ?? task.status) === 'Blocked'}
                                                    onChange={e => {
                                                        const progress = Number(e.target.value);
                                                        updateField(task.id, 'progress_percent', progress);
                                                        updateField(task.id, 'status', deriveStatus(progress));
                                                    }}
                                                    className="w-24" />
                                                <span className="text-xs w-8 text-gray-500 dark:text-gray-400">{editValues[task.id]?.progress_percent ?? task.progress_percent}%</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center space-x-2 w-32">
                                                <div className="w-full bg-gray-200 rounded-full h-1.5 dark:bg-gray-700">
                                                    <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${task.progress_percent}%` }}></div>
                                                </div>
                                                <span className="text-xs text-gray-500 dark:text-gray-400">{task.progress_percent}%</span>
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {isEditing && selectedIds.has(task.id) ? (
                                            <input type="date" value={editValues[task.id]?.due_date ?? task.due_date ?? ''} onChange={e => updateField(task.id, 'due_date', e.target.value)} className={editInputCls} />
                                        ) : (task.due_date ? new Date(task.due_date).toLocaleDateString() : '—')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <ProgramModal
                isOpen={modalState.type === 'add' || modalState.type === 'edit' || modalState.type === 'view'}
                onClose={closeModal}
                onSave={handleSaveTask}
                taskToEdit={modalState.task || null}
                mode={modalState.type as 'add' | 'edit' | 'view'}
                contacts={orgContacts}
                onContactCreated={c => setOrgContacts(prev => [...prev, c])}
                onEdit={() => setModalState({ type: 'edit', task: modalState.task })}
                onDelete={() => setModalState({ type: 'delete', task: modalState.task })}
                onSaveComment={handleSaveComment}
                onEditComment={handleEditComment}
                onDeleteComment={handleDeleteComment}
                currentUserId={currentUserId}
                isReadOnly={isReadOnly}
            />

            {modalState.type === 'log' && modalState.task && (
                <HistoryModal task={modalState.task} onClose={closeModal} />
            )}

            <CommentModal
                isOpen={modalState.type === 'comment'}
                onClose={closeModal}
                onSave={handleSaveComment}
                task={modalState.task || null}
                onEditComment={handleEditComment}
                onDeleteComment={handleDeleteComment}
                currentUserId={currentUserId}
            />

            {modalState.type === 'add-child' && modalState.task && (
                <AddChildModal
                    parent={modalState.task}
                    allTasks={tasks}
                    onClose={closeModal}
                    onCreate={(fd) => handleCreateChild(modalState.task!.id, fd)}
                    onAttach={(childId) => handleAttachChild(modalState.task!.id, childId)}
                />
            )}

            <DeleteConfirmationModal
                isOpen={modalState.type === 'delete'}
                onClose={closeModal}
                onConfirm={handleDeleteTask}
                itemName="task"
            />

            {bulkProgress.status === 'idle' && (
                <SelectionActionBar
                    selectedCount={selectedIds.size}
                    isEditing={isEditing}
                    isConfirmingDelete={isConfirmingDelete}
                    isSaving={isSaving}
                    onEdit={() => startEdit(filteredAndSortedTasks.filter(i => selectedIds.has(i.id)), i => i.id)}
                    onSaveAll={handleSaveAll}
                    onCancelEdit={cancelEdit}
                    onDelete={() => setIsConfirmingDelete(true)}
                    onConfirmDelete={handleBulkDelete}
                    onCancelDelete={() => setIsConfirmingDelete(false)}
                    onClear={clearAll}
                    disabled={isReadOnly}
                />
            )}

            <BulkProgressModal
                isOpen={bulkProgress.status !== 'idle'}
                title="Deleting Tasks"
                progress={bulkProgress}
                onClose={clearAll}
            />

            <BulkProgressModal
                isOpen={isImporting}
                title="Importing Tasks"
                progress={importProgress}
                onClose={() => setIsImporting(false)}
            />
        </div>
    );
};
