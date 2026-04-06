import React, { useState, useEffect, useRef, ChangeEvent, useCallback, useMemo } from 'react';
import { ProgramTask, ProgramTaskCreate, ProgramTaskUpdate, ProgramStatus, ActivityLog, AllActivityLog, OrgContact, formatOrgContact } from '../../types';
import * as SupabaseService from '../../services/supabase';
import { EyeIcon, PencilIcon, TrashIcon, PlusIcon, UploadIcon, DownloadIcon, SortUpDownIcon, SortUpIcon, SortDownIcon, HistoryIcon } from '../Icons';
import { Modal } from '../common/Modal';
import { StatusBadge } from '../common/StatusBadge';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';
import { useTableSelection } from '../../hooks/useTableSelection';
import { SelectionActionBar } from '../common/SelectionActionBar';
import { parseCSVLine } from '../../utils/csvParser';
import { useDataRefresh } from '../../hooks/useDataRefresh';

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
    'Created Milestone':  'Milestone created',
    'Updated Milestone':  'Milestone updated',
    'Deleted Milestone':  'Milestone deleted',
    'Imported Milestones': 'Milestones imported',
    'program_blocked':    'Blocked',
    'program_unblocked':  'Unblocked',
};

const PROGRAM_ACTION_COLORS: Record<string, string> = {
    'Created Milestone':  'bg-blue-500',
    'Updated Milestone':  'bg-purple-500',
    'Deleted Milestone':  'bg-red-700',
    'Imported Milestones': 'bg-teal-500',
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
}

const ProgramModal: React.FC<ProgramModalProps> = ({ isOpen, onClose, onSave, taskToEdit, mode, contacts, onContactCreated, onEdit, onDelete }) => {
    const [formData, setFormData] = useState<ProgramTaskCreate | ProgramTaskUpdate>({});
    const isViewMode = mode === 'view';

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
        } else {
            setFormData({
                program_name: '', description: '', month: 'January', due_date: '', assignee: '', status: 'Planned', progress_percent: 0
            });
        }
    }, [taskToEdit, isOpen, mode]);

    const isBlocked = formData.status === 'Blocked';

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'progress_percent') {
            const progress = Number(value);
            setFormData(prev => ({ ...prev, progress_percent: progress, status: deriveStatus(progress) }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const toggleBlocked = () => {
        setFormData(prev => {
            if (prev.status === 'Blocked') {
                return { ...prev, status: deriveStatus(prev.progress_percent || 0) };
            }
            return { ...prev, status: 'Blocked' as ProgramStatus };
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Clean empty strings to null for nullable DB fields
        const cleaned = {
            ...formData,
            due_date: formData.due_date || null,
            assignee: formData.assignee || null,
        };
        onSave(cleaned);
    };

    const title = mode === 'add' ? 'Add New Milestone' : mode === 'edit' ? 'Edit Milestone' : 'View Milestone';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Milestone Name</label>
                        <input type="text" name="program_name" value={formData.program_name || ''} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Assignee</label>
                        <AssigneeSelect
                            value={formData.assignee || ''}
                            onChange={val => setFormData(prev => ({ ...prev, assignee: val }))}
                            contacts={contacts}
                            onContactCreated={onContactCreated}
                            readOnly={isViewMode}
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                        <textarea name="description" value={formData.description || ''} onChange={handleChange} readOnly={isViewMode} rows={3} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"></textarea>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                        <div className="mt-1 flex items-center gap-3">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                formData.status === 'Blocked' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' :
                                formData.status === 'Completed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' :
                                formData.status === 'InProgress' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' :
                                'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                            }`}>{formData.status || 'Planned'}</span>
                            {!isViewMode && (
                                <button type="button" onClick={toggleBlocked} className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                                    isBlocked
                                        ? 'border-green-300 text-green-700 hover:bg-green-50 dark:border-green-600 dark:text-green-300 dark:hover:bg-green-900/30'
                                        : 'border-red-300 text-red-700 hover:bg-red-50 dark:border-red-600 dark:text-red-300 dark:hover:bg-red-900/30'
                                }`}>
                                    {isBlocked ? 'Unblock' : 'Block'}
                                </button>
                            )}
                        </div>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Progress (%)</label>
                        <input type="range" name="progress_percent" min="0" max="100" value={formData.progress_percent || 0} onChange={handleChange} disabled={isViewMode || isBlocked} className="mt-1 block w-full" />
                        <span className="text-sm dark:text-gray-300">{formData.progress_percent || 0}%</span>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Due Date</label>
                        <input type="date" name="due_date" value={formData.due_date || ''} onChange={handleChange} readOnly={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                </div>
                {isViewMode && (
                <div className="mt-6 flex justify-end space-x-3">
                    <button type="button" onClick={() => { onClose(); onEdit?.(); }} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-yellow-700 bg-yellow-50 border border-yellow-300 rounded-md hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800">
                        <PencilIcon className="h-4 w-4" /> Edit
                    </button>
                    <button type="button" onClick={() => { onClose(); onDelete?.(); }} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-300 rounded-md hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
                        <TrashIcon className="h-4 w-4" /> Delete
                    </button>
                </div>
                )}
                {!isViewMode && (
                <div className="mt-6 flex justify-end space-x-3">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>
                    <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">Save</button>
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
                        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Milestone History</h2>
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
                                        </p>
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

export const ProgramTrackerView: React.FC<{ isActive?: boolean }> = ({ isActive = true }) => {
    const [tasks, setTasks] = useState<ProgramTask[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [modalState, setModalState] = useState<{ type: 'add' | 'edit' | 'view' | 'delete' | 'log' | null; task?: ProgramTask | null }>({ type: null });
    const [filter, setFilter] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof ProgramTask; direction: 'ascending' | 'descending' } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [orgContacts, setOrgContacts] = useState<OrgContact[]>([]);

    const {
        selectedIds, isEditing, editValues, isConfirmingDelete, isSaving,
        setIsConfirmingDelete, setIsSaving,
        toggle, toggleAll, clearAll, startEdit, updateField, cancelEdit,
    } = useTableSelection<ProgramTask>();

    const editInputCls = "w-full border border-blue-300 dark:border-blue-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400";
    const editSelectCls = "border border-blue-300 dark:border-blue-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400";

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

    // Sync local state with hook state
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
                const oldTask = modalState.task;
                const updatedTask = await SupabaseService.updateTask(modalState.task.id, formData);

                const statusChanged = oldTask.status !== updatedTask.status;
                await SupabaseService.logAllActivity({
                    action: statusChanged ? 'Updated Milestone' : 'Updated Milestone',
                    module: 'Program',
                    entity_id: updatedTask.id,
                    entity_name: updatedTask.program_name,
                    event_data: {
                        from_status: oldTask.status,
                        to_status: updatedTask.status,
                        changes: formData,
                    }
                });

                const changes: string[] = [];
                if (oldTask.program_name !== updatedTask.program_name) {
                    changes.push(`name changed from "${oldTask.program_name}" to "${updatedTask.program_name}"`);
                }
                if (oldTask.description !== updatedTask.description) {
                    changes.push('description was updated');
                }
                if (oldTask.month !== updatedTask.month) {
                    changes.push(`month changed from "${oldTask.month}" to "${updatedTask.month}"`);
                }
                if (oldTask.status !== updatedTask.status) {
                    changes.push(`status changed from "${oldTask.status}" to "${updatedTask.status}"`);
                }
                if (oldTask.progress_percent !== updatedTask.progress_percent) {
                    changes.push(`progress changed from ${oldTask.progress_percent}% to ${updatedTask.progress_percent}%`);
                }

                if (changes.length > 0) {
                    await SupabaseService.addActivityLog(updatedTask.id, `Milestone updated: ${changes.join(', ')}.`);
                }

            } else if (modalState.type === 'add') {
                const addedTask = await SupabaseService.addTask(formData as ProgramTaskCreate);

                await SupabaseService.logAllActivity({
                    action: 'Created Milestone',
                    module: 'Program',
                    entity_id: addedTask.id,
                    entity_name: addedTask.program_name,
                    event_data: { details: formData }
                });

                await SupabaseService.addActivityLog(addedTask.id, `Milestone "${addedTask.program_name}" was created.`);
            }
            fetchTasks();
            closeModal();
        } catch (err) {
            setError('Failed to save milestone.');
        }
    };

    const handleDeleteTask = async () => {
        if (modalState.type === 'delete' && modalState.task) {
            try {
                await SupabaseService.deleteTask(modalState.task.id);
                await SupabaseService.logAllActivity({
                    action: 'Deleted Milestone',
                    module: 'Program',
                    entity_id: modalState.task.id,
                    entity_name: modalState.task.program_name
                });
                fetchTasks();
                closeModal();
            } catch (err: any) {
                const message = err?.message || 'Failed to delete milestone.';
                setError(`Failed to delete milestone. ${message}`);
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

            const allLines = text.split('\n').filter(line => line.trim());
            
            if (allLines.length === 0) {
                alert('CSV file is empty or contains only whitespace.');
                return;
            }
            
            const lines = allLines.slice(1);
            
            if (lines.length === 0) {
                alert('No data rows found in CSV file after header.');
                return;
            }
            
            const importedTasks: ProgramTaskCreate[] = lines
                .map(line => {
                    // Properly parse CSV fields with quote handling
                    const fields = parseCSVLine(line);
                    const [program_name, description, month, status, progress_percent] = fields;
                    
                    // Validate required fields
                    if (!program_name || !program_name.trim()) {
                        console.log('Skipping - missing program_name');
                        return null;
                    }
                    
                    if (!month || !month.trim()) {
                        console.log('Skipping - missing month');
                        return null;
                    }
                    
                    // Sanitize input
                    const cleanProgramName = sanitizeInput(program_name.trim());
                    const cleanDescription = description ? sanitizeInput(description.trim()) : '';
                    const cleanMonth = sanitizeInput(month.trim());
                    const progress = Number(progress_percent) || 0;
                    const cleanStatus = (status && sanitizeInput(status.trim()) === 'Blocked') ? 'Blocked' as ProgramStatus : deriveStatus(progress);

                    return {
                        program_name: cleanProgramName,
                        description: cleanDescription,
                        month: cleanMonth,
                        status: cleanStatus,
                        progress_percent: progress,
                    };
                })
                .filter((task): task is ProgramTaskCreate => task !== null);

            if (importedTasks.length > 0) {
                try {
                    // Get existing tasks to find duplicates and updates
                    const existingTasks = await SupabaseService.getTasks();
                    const tasksToUpdate: { id: string; updates: ProgramTaskUpdate }[] = [];
                    const tasksToAdd: ProgramTaskCreate[] = [];
                    const duplicateNames = new Set<string>();

                    for (const importedTask of importedTasks) {
                        // Normalize strings for better matching
                        const normalizeString = (str: string) => str.replace(/^["']|["']$/g, '').trim().toLowerCase();
                        
                        const importedProgramName = normalizeString(importedTask.program_name);
                        const importedMonth = normalizeString(importedTask.month);
                        
                        // Debug logging
                        console.log('Processing imported task:', {
                            original: `${importedTask.program_name} (${importedTask.month})`,
                            normalized: `${importedProgramName} (${importedMonth})`
                        });
                        
                        // Find existing task by normalized program_name and month
                        const existingTask = existingTasks.find(t => {
                            const existingProgramName = normalizeString(t.program_name);
                            const existingMonth = normalizeString(t.month);
                            const match = existingProgramName === importedProgramName && existingMonth === importedMonth;
                            if (match) {
                                console.log('Found existing task match:', {
                                    existing: `${t.program_name} (${t.month})`,
                                    existingNormalized: `${existingProgramName} (${existingMonth})`
                                });
                            }
                            return match;
                        });

                        if (existingTask) {
                            duplicateNames.add(`${importedTask.program_name} (${importedTask.month})`);
                            console.log('Marked as duplicate:', importedTask.program_name);

                            // Check if anything actually changed (using normalized comparison for text fields)
                            const hasChanges =
                                normalizeString(existingTask.description || '') !== normalizeString(importedTask.description || '') ||
                                existingTask.status !== importedTask.status ||
                                existingTask.progress_percent !== importedTask.progress_percent;

                            if (hasChanges) {
                                console.log('Task has changes, will update:', importedTask.program_name);
                                tasksToUpdate.push({
                                    id: existingTask.id,
                                    updates: {
                                        description: importedTask.description,
                                        status: importedTask.status,
                                        progress_percent: importedTask.progress_percent
                                    }
                                });
                            } else {
                                console.log('Task has no changes, will skip:', importedTask.program_name);
                            }
                        } else {
                            console.log('New task, will add:', importedTask.program_name);
                            tasksToAdd.push(importedTask);
                        }
                    }

                    let totalProcessed = 0;
                    let message = '';

                    // Add new tasks first
                    if (tasksToAdd.length > 0) {
                        const addedTasks = await SupabaseService.bulkAddTasks(tasksToAdd);
                        totalProcessed += tasksToAdd.length;
                        message += `• ${tasksToAdd.length} new milestones added\n`;
                    }

                    // Update existing tasks
                    if (tasksToUpdate.length > 0) {
                        for (const { id, updates } of tasksToUpdate) {
                            await SupabaseService.updateTask(id, updates);
                            totalProcessed++;
                        }
                        message += `• ${tasksToUpdate.length} existing milestones updated\n`;
                    }

                    // Summary logging
                    console.log('CSV Import Summary:', {
                        totalImported: importedTasks.length,
                        newAdded: tasksToAdd.length,
                        updated: tasksToUpdate.length,
                        skipped: duplicateNames.size - tasksToUpdate.length,
                        totalProcessed
                    });

                    if (totalProcessed > 0) {
                        await SupabaseService.logAllActivity({
                            action: 'Imported Milestones',
                            module: 'Program',
                            event_data: {
                                total: importedTasks.length,
                                added: tasksToAdd.length,
                                updated: tasksToUpdate.length,
                                duplicates: Array.from(duplicateNames)
                            }
                        });

                        let fullMessage = `${totalProcessed} milestones processed:\n${message}`;

                        if (duplicateNames.size > tasksToUpdate.length) {
                            const skippedCount = duplicateNames.size - tasksToUpdate.length;
                            fullMessage += `• ${skippedCount} duplicates skipped (no changes)\n`;
                            
                            const skippedNames = Array.from(duplicateNames).filter(name => 
                                !tasksToUpdate.some(update => {
                                    const task = existingTasks.find(t => t.id === update.id);
                                    return `${task.program_name} (${task.month})` === name;
                                })
                            );
                            
                            if (skippedNames.length > 0) {
                                fullMessage += `\nSkipped duplicates:\n${skippedNames.slice(0, 5).join('\n')}`;
                                if (skippedNames.length > 5) {
                                    fullMessage += `\n... and ${skippedNames.length - 5} more`;
                                }
                            }
                        }

                        alert(fullMessage.trim());
                        fetchTasks();
                    } else {
                        if (duplicateNames.size > 0) {
                            alert(`All ${duplicateNames.size} imported milestones already exist and no changes were detected.`);
                        } else {
                            alert('No changes detected in imported data.');
                        }
                    }
                } catch (err) {
                    console.error('Import error:', err);
                    alert('Failed to import milestones. Please check the file format and try again.');
                }
            } else {
                alert('No valid data found in the CSV file.');
            }
        };
        reader.readAsText(file);
        if(fileInputRef.current) fileInputRef.current.value = '';
    };

    const filteredAndSortedTasks = useMemo(() => {
        let items = [...tasks];
        if (filter) {
            const q = filter.toLowerCase();
            items = items.filter(t =>
                t.program_name.toLowerCase().includes(q) ||
                (t.description && t.description.toLowerCase().includes(q)) ||
                t.month.toLowerCase().includes(q) ||
                t.status.toLowerCase().includes(q) ||
                (t.assignee && t.assignee.toLowerCase().includes(q))
            );
        }
        if (sortConfig) {
            items.sort((a, b) => {
                const aVal = a[sortConfig.key];
                const bVal = b[sortConfig.key];
                if (aVal === null || aVal === undefined) return 1;
                if (bVal === null || bVal === undefined) return -1;
                if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [tasks, filter, sortConfig]);

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
        const headers = ['program_name', 'description', 'month', 'status', 'progress_percent'];
        const csvContent = [
            headers.join(','),
            ...filteredAndSortedTasks.map(t =>
                [
                    `"${(t.program_name || '').replace(/"/g, '""')}"`,
                    `"${(t.description || '').replace(/"/g, '""')}"`,
                    t.month,
                    t.status,
                    t.progress_percent,
                ].join(',')
            ),
        ].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `program-milestones-${new Date().toISOString().split('T')[0]}.csv`;
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
        try {
            setIsSaving(true);
            for (const id of selectedIds) {
                await SupabaseService.deleteTask(id as string);
            }
            clearAll();
            fetchTasks();
        } catch {
            setError('Failed to delete selected milestones.');
        } finally {
            setIsSaving(false);
        }
    };

    const programStatusStyles: Record<ProgramStatus, string> = {
        Planned: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
        InProgress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
        Completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
        Blocked: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    };

    return (
        <div className="px-4 py-6 sm:px-0">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">GRC Program Tracker</h2>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <input
                        type="text"
                        placeholder="Filter milestones..."
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        className="block w-full sm:w-56 rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                    <div className="flex items-center space-x-2">
                        <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />
                        <button onClick={() => fileInputRef.current?.click()} title="Import CSV" className="p-2 text-gray-400 hover:text-green-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                            <UploadIcon className="h-5 w-5" />
                        </button>
                        <button onClick={handleExportCSV} title="Export CSV" className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                            <DownloadIcon className="h-5 w-5" />
                        </button>
                        <button onClick={() => setModalState({ type: 'add' })} title="Add Milestone" className="p-2 text-gray-400 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
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
                                <tr><td colSpan={7} className="text-center py-4 text-gray-500 dark:text-gray-400">Loading milestones...</td></tr>
                            ) : filteredAndSortedTasks.length === 0 ? (
                                <tr><td colSpan={7} className="text-center py-4 text-gray-500 dark:text-gray-400">No milestones found.</td></tr>
                            ) : filteredAndSortedTasks.map(task => (
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
                                        ) : task.program_name}
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
            />

            {modalState.type === 'log' && modalState.task && (
                <HistoryModal task={modalState.task} onClose={closeModal} />
            )}

            <DeleteConfirmationModal
                isOpen={modalState.type === 'delete'}
                onClose={closeModal}
                onConfirm={handleDeleteTask}
                itemName="milestone"
            />

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
            />
        </div>
    );
};
