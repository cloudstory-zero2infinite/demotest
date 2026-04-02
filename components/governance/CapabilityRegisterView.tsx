import React, { useState, useEffect, useCallback, useRef, ChangeEvent, useMemo } from 'react';
import { Capability, CapabilityCreate, CapabilityUpdate } from '../../types';
import * as SupabaseService from '../../services/supabase';
import { EyeIcon, PencilIcon, TrashIcon, PlusIcon, UploadIcon, DownloadIcon, SortUpDownIcon, SortUpIcon, SortDownIcon, BotIcon } from '../Icons';
import { Modal } from '../common/Modal';
import { AIChatModal } from '../common/AIChatModal';
import { BulkProgressModal } from '../common/BulkProgressModal';
import { useTableSelection } from '../../hooks/useTableSelection';
import { SelectionActionBar } from '../common/SelectionActionBar';

// ─── Tag Input ────────────────────────────────────────────────────────────────

interface TagInputProps {
    values: string[];
    onChange: (values: string[]) => void;
    placeholder?: string;
    readOnly?: boolean;
}

const TagInput: React.FC<TagInputProps> = ({ values, onChange, placeholder, readOnly }) => {
    const [inputVal, setInputVal] = useState('');

    const addTag = (raw: string) => {
        const tags = raw.split(',').map(t => t.trim()).filter(Boolean);
        if (tags.length === 0) return;
        const next = [...values];
        tags.forEach(t => { if (!next.includes(t)) next.push(t); });
        onChange(next);
        setInputVal('');
    };

    const removeTag = (idx: number) => {
        onChange(values.filter((_, i) => i !== idx));
    };

    const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addTag(inputVal);
        } else if (e.key === 'Backspace' && inputVal === '' && values.length > 0) {
            onChange(values.slice(0, -1));
        }
    };

    return (
        <div className={`mt-1 flex flex-wrap gap-1.5 items-center min-h-[38px] w-full rounded-md border px-2 py-1.5 text-sm ${readOnly ? 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600'}`}>
            {values.map((tag, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                    {tag}
                    {!readOnly && (
                        <button type="button" onClick={() => removeTag(i)} className="hover:text-blue-600 dark:hover:text-blue-200 leading-none">×</button>
                    )}
                </span>
            ))}
            {!readOnly && (
                <input
                    type="text"
                    value={inputVal}
                    onChange={e => setInputVal(e.target.value)}
                    onKeyDown={handleKey}
                    onBlur={() => addTag(inputVal)}
                    placeholder={values.length === 0 ? placeholder : ''}
                    className="flex-1 min-w-[100px] bg-transparent outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400"
                />
            )}
        </div>
    );
};

// ─── Modal ────────────────────────────────────────────────────────────────────

const MANDATORY_LABEL = <span className="text-red-500 ml-0.5">*</span>;

interface CapabilityModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: CapabilityCreate | CapabilityUpdate) => Promise<void>;
    capabilityToEdit: Capability | null;
    mode: 'add' | 'edit' | 'view';
}

type FormData = {
    capab_name: string;
    capab_provider: string[];
    capab_cmdb_id: string[];
    capab_owner: string;
    capab_other_details: string;
};

const DEFAULT_FORM: FormData = {
    capab_name: '',
    capab_provider: [],
    capab_cmdb_id: [],
    capab_owner: '',
    capab_other_details: '',
};

const CapabilityModal: React.FC<CapabilityModalProps> = ({ isOpen, onClose, onSave, capabilityToEdit, mode }) => {
    const [formData, setFormData] = useState<FormData>(DEFAULT_FORM);
    const [isSaving, setIsSaving] = useState(false);
    const isView = mode === 'view';

    useEffect(() => {
        if (capabilityToEdit) {
            setFormData({
                capab_name: capabilityToEdit.capab_name,
                capab_provider: capabilityToEdit.capab_provider ?? [],
                capab_cmdb_id: capabilityToEdit.capab_cmdb_id ?? [],
                capab_owner: capabilityToEdit.capab_owner,
                capab_other_details: capabilityToEdit.capab_other_details ?? '',
            });
        } else {
            setFormData(DEFAULT_FORM);
        }
    }, [capabilityToEdit, isOpen]);

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await onSave(formData);
        } finally {
            setIsSaving(false);
        }
    };

    const title = mode === 'add' ? 'Add Capability' : mode === 'edit' ? 'Edit Capability' : 'View Capability';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {mode !== 'add' && capabilityToEdit && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Capability ID</label>
                            <div className="mt-1 px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-600 text-sm font-mono text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-500 flex items-center gap-2">
                                {capabilityToEdit.capab_id}
                                <span className="text-xs text-gray-400 dark:text-gray-500 font-sans">(auto-generated)</span>
                            </div>
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Capability Name {MANDATORY_LABEL}</label>
                        <input type="text" name="capab_name" value={formData.capab_name} onChange={handleChange} readOnly={isView} required placeholder="e.g. Incident Response, SOC, DevSecOps" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Capability Owner {MANDATORY_LABEL}</label>
                        <input type="text" name="capab_owner" value={formData.capab_owner} onChange={handleChange} readOnly={isView} required placeholder="e.g. Jane Smith" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Provider(s) {MANDATORY_LABEL}
                            {!isView && <span className="ml-1 text-xs text-gray-400 font-normal">— press Enter or comma to add</span>}
                        </label>
                        <TagInput values={formData.capab_provider} onChange={vals => setFormData(prev => ({ ...prev, capab_provider: vals }))} placeholder="e.g. Sophos Firewall, Palo Alto" readOnly={isView} />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            CMDB ID(s) {MANDATORY_LABEL}
                            {!isView && <span className="ml-1 text-xs text-gray-400 font-normal">— press Enter or comma to add</span>}
                        </label>
                        <TagInput values={formData.capab_cmdb_id} onChange={vals => setFormData(prev => ({ ...prev, capab_cmdb_id: vals }))} placeholder="e.g. cmdb-001, cmdb-003" readOnly={isView} />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Other Details</label>
                        <textarea name="capab_other_details" value={formData.capab_other_details} onChange={handleChange} readOnly={isView} rows={3} placeholder="Additional notes, scope, maturity level, etc." className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                </div>
                {!isView && (
                    <div className="mt-6 flex justify-end space-x-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>
                        <button type="submit" disabled={isSaving} className="flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed min-w-[5rem]">
                            {isSaving ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Saving...
                                </>
                            ) : 'Save'}
                        </button>
                    </div>
                )}
            </form>
        </Modal>
    );
};

// ─── Main View ────────────────────────────────────────────────────────────────

type ModalState = { type: 'add' | 'edit' | 'view' | 'delete' | 'import' | null; item?: Capability | null };

export const CapabilityRegisterView: React.FC = () => {
    const [capabilities, setCapabilities] = useState<Capability[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [modalState, setModalState] = useState<ModalState>({ type: null });
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [filter, setFilter] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof Capability; direction: 'ascending' | 'descending' } | null>(null);
    const [importData, setImportData] = useState<{ newCapabilities: CapabilityCreate[]; duplicates: string[] }>({ newCapabilities: [], duplicates: [] });
    const [showAIChat, setShowAIChat] = useState(false);

    const {
        selectedIds, isEditing, editValues, isConfirmingDelete, isSaving, bulkProgress,
        setIsConfirmingDelete, setIsSaving, startBulkOperation, incrementBulkProgress, finishBulkOperation, resetBulkProgress,
        toggle, toggleAll, clearAll, startEdit, updateField, cancelEdit,
    } = useTableSelection<Capability>();

    const fetchCapabilities = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await SupabaseService.getCapabilities();
            setCapabilities(data);
        } catch (e) {
            setError("Failed to load capabilities.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchCapabilities(); }, [fetchCapabilities]);

    useEffect(() => {
        const handler = (e: Event) => {
            const ce = e as CustomEvent;
            if (ce.detail === 'governance') fetchCapabilities();
        };
        window.addEventListener('tabChanged', handler);
        return () => window.removeEventListener('tabChanged', handler);
    }, [fetchCapabilities]);

    const filteredAndSorted = useMemo(() => {
        let items = [...capabilities];
        if (filter) {
            const q = filter.toLowerCase();
            items = items.filter(c =>
                c.capab_id.toLowerCase().includes(q) ||
                c.capab_name.toLowerCase().includes(q) ||
                c.capab_owner.toLowerCase().includes(q) ||
                (c.capab_provider ?? []).some(p => p.toLowerCase().includes(q)) ||
                (c.capab_cmdb_id ?? []).some(id => id.toLowerCase().includes(q)) ||
                (c.capab_other_details ?? '').toLowerCase().includes(q)
            );
        }
        if (sortConfig !== null) {
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
    }, [capabilities, filter, sortConfig]);

    const requestSort = (key: keyof Capability) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') direction = 'descending';
        setSortConfig({ key, direction });
    };

    const getSortIconFor = (key: keyof Capability) => {
        if (!sortConfig || sortConfig.key !== key) return <SortUpDownIcon className="h-4 w-4 ml-1 text-gray-400" />;
        return sortConfig.direction === 'ascending' ? <SortUpIcon className="h-4 w-4 ml-1" /> : <SortDownIcon className="h-4 w-4 ml-1" />;
    };

    const closeModal = () => { setError(null); setModalState({ type: null }); };

    const handleSave = async (data: CapabilityCreate | CapabilityUpdate) => {
        try {
            if (modalState.type === 'edit' && modalState.item) {
                const updated = await SupabaseService.updateCapability(modalState.item.id, data as CapabilityUpdate);
                await SupabaseService.logAllActivity({ action: 'Updated Capability', module: 'Governance', entity_id: updated.id, entity_name: updated.capab_name, event_data: { changes: data } });
            } else if (modalState.type === 'add') {
                const created = await SupabaseService.addCapability(data as CapabilityCreate);
                await SupabaseService.logAllActivity({ action: 'Created Capability', module: 'Governance', entity_id: created.id, entity_name: created.capab_name, event_data: { details: data } });
            }
            fetchCapabilities();
            closeModal();
        } catch (err) {
            setError('Failed to save capability.');
        }
    };

    const handleDelete = async () => {
        if (modalState.type === 'delete' && modalState.item) {
            try {
                setDeleting(true);
                setError(null);
                await SupabaseService.deleteCapability(modalState.item.id);
                await SupabaseService.logAllActivity({ action: 'Deleted Capability', module: 'Governance', entity_id: modalState.item.id, entity_name: modalState.item.capab_name });
                fetchCapabilities();
                closeModal();
            } catch (err: any) {
                setError(err?.message || 'Failed to delete capability.');
            } finally {
                setDeleting(false);
            }
        }
    };

    const handleBulkDelete = async () => {
        setIsConfirmingDelete(false);
        startBulkOperation(selectedIds.size);
        let hasError = false;
        for (const id of selectedIds) {
            try {
                await SupabaseService.deleteCapability(id as string);
                incrementBulkProgress(true);
            } catch (err) {
                hasError = true;
                incrementBulkProgress(false);
            }
        }
        finishBulkOperation(hasError);
        await SupabaseService.logAllActivity({ action: 'Bulk Deleted Capabilities', module: 'Governance', event_data: { count: selectedIds.size } });
        fetchCapabilities();
    };

    const handleCloseBulkProgress = () => { resetBulkProgress(); clearAll(); };

    const handleSaveAll = async () => {
        try {
            setIsSaving(true);
            for (const [id, changes] of Object.entries(editValues)) {
                await SupabaseService.updateCapability(id, changes as CapabilityUpdate);
            }
            await SupabaseService.logAllActivity({ action: 'Bulk Edited Capabilities', module: 'Governance', event_data: { count: Object.keys(editValues).length } });
            cancelEdit();
            fetchCapabilities();
        } catch (err) {
            setError('Failed to save changes.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleAIChatConfirm = async (records: Record<string, unknown>[]) => {
        try {
            const payloads = records.map(r => ({
                capab_name: String(r.capab_name ?? ''),
                capab_provider: Array.isArray(r.capab_provider) ? r.capab_provider : String(r.capab_provider ?? '').split(',').map((s: string) => s.trim()).filter(Boolean),
                capab_cmdb_id: Array.isArray(r.capab_cmdb_id) ? r.capab_cmdb_id : String(r.capab_cmdb_id ?? '').split(',').map((s: string) => s.trim()).filter(Boolean),
                capab_owner: String(r.capab_owner ?? ''),
                capab_other_details: r.capab_other_details ? String(r.capab_other_details) : null,
            })) as unknown as CapabilityCreate[];
            await SupabaseService.bulkAddCapabilities(payloads);
            await SupabaseService.logAllActivity({ action: 'Bulk Created Capabilities via AI', module: 'Governance', entity_name: `${records.length} capabilities created via AI`, event_data: { count: records.length, records } });
            fetchCapabilities();
        } catch (err) {
            setError('Failed to save AI-generated capabilities.');
        }
    };

    // ── CSV Import ──
    const handleImportCSV = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            if (!text) return;
            const lines = text.split('\n').slice(1);
            const parsed: CapabilityCreate[] = lines
                .map(line => {
                    const [, capab_name, capab_provider_raw, capab_cmdb_id_raw, capab_owner, capab_other_details] = line.split(',').map(s => s.trim());
                    if (!capab_name || !capab_owner) return null;
                    return {
                        capab_name,
                        capab_provider: capab_provider_raw ? capab_provider_raw.replace(/[{}]/g, '').split(';').map(s => s.trim()).filter(Boolean) : [],
                        capab_cmdb_id: capab_cmdb_id_raw ? capab_cmdb_id_raw.replace(/[{}]/g, '').split(';').map(s => s.trim()).filter(Boolean) : [],
                        capab_owner,
                        capab_other_details: capab_other_details || null,
                    } as unknown as CapabilityCreate;
                })
                .filter(Boolean) as CapabilityCreate[];
            const existingNames = new Set(capabilities.map(c => c.capab_name.toLowerCase()));
            const newCapabilities = parsed.filter(c => !existingNames.has(c.capab_name.toLowerCase()));
            const duplicates = parsed.filter(c => existingNames.has(c.capab_name.toLowerCase())).map(c => c.capab_name);
            setImportData({ newCapabilities, duplicates });
            setModalState({ type: 'import' });
        };
        reader.readAsText(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleConfirmImport = async () => {
        if (importData.newCapabilities.length > 0) {
            try {
                await SupabaseService.bulkAddCapabilities(importData.newCapabilities);
                await SupabaseService.logAllActivity({ action: 'CSV Import - Added Capabilities', module: 'Governance', event_data: { count: importData.newCapabilities.length } });
                closeModal();
                fetchCapabilities();
            } catch (err) {
                setError('Failed to import capabilities.');
            }
        }
    };

    // ── CSV Export ──
    const handleExportCSV = () => {
        const headers = ['capab_id', 'capab_name', 'capab_provider', 'capab_cmdb_id', 'capab_owner', 'capab_other_details'];
        const csvContent = [
            headers.join(','),
            ...filteredAndSorted.map(c => [
                c.capab_id,
                `"${(c.capab_name || '').replace(/"/g, '""')}"`,
                `"{${(c.capab_provider ?? []).join(';')}}"`,
                `"{${(c.capab_cmdb_id ?? []).join(';')}}"`,
                `"${(c.capab_owner || '').replace(/"/g, '""')}"`,
                `"${(c.capab_other_details || '').replace(/"/g, '""')}"`,
            ].join(','))
        ].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `capabilities-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    const editInputCls = "w-full border border-blue-300 dark:border-blue-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400";

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                <div className="w-full sm:w-1/3">
                    <input
                        type="text"
                        placeholder="Filter capabilities..."
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        aria-label="Filter capabilities"
                    />
                </div>
                <div className="flex space-x-2">
                    <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />
                    <button onClick={() => setShowAIChat(true)} title="AI Assistant" className="p-2 text-gray-400 hover:text-indigo-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        <BotIcon className="h-5 w-5" />
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} title="Import CSV" className="p-2 text-gray-400 hover:text-green-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        <UploadIcon className="h-5 w-5" />
                    </button>
                    <button onClick={handleExportCSV} title="Export CSV" className="p-2 text-gray-400 hover:text-purple-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        <DownloadIcon className="h-5 w-5" />
                    </button>
                    <button onClick={() => setModalState({ type: 'add' })} title="Add Capability" className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        <PlusIcon className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}

            <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg dark:border-gray-700">
                <div className="overflow-auto max-h-[calc(100vh-280px)]">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 w-10 px-4 py-3">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.size === filteredAndSorted.length && filteredAndSorted.length > 0}
                                        onChange={() => toggleAll(filteredAndSorted.map(i => i.id))}
                                        className="rounded border-gray-300 dark:border-gray-600 cursor-pointer"
                                    />
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('capab_id')} className="flex items-center w-full text-left focus:outline-none">Capability ID {getSortIconFor('capab_id')}</button>
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('capab_name')} className="flex items-center w-full text-left focus:outline-none">Name {getSortIconFor('capab_name')}</button>
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('capab_owner')} className="flex items-center w-full text-left focus:outline-none">Owner {getSortIconFor('capab_owner')}</button>
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Provider(s)</th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">CMDB ID(s)</th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('capab_other_details')} className="flex items-center w-full text-left focus:outline-none">Other Details {getSortIconFor('capab_other_details')}</button>
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={8} className="text-center py-4 text-gray-500 dark:text-gray-400">Loading capabilities...</td></tr>
                            ) : filteredAndSorted.length === 0 ? (
                                <tr><td colSpan={8} className="text-center py-4 text-gray-500 dark:text-gray-400">No capabilities found.</td></tr>
                            ) : filteredAndSorted.map(cap => (
                                <tr
                                    key={cap.id}
                                    onClick={() => !isEditing && setModalState({ type: 'view', item: cap })}
                                    className={`cursor-pointer transition-colors ${
                                        selectedIds.has(cap.id) ? 'bg-blue-50 dark:bg-blue-900/20' :
                                        'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                    } ${isEditing && !selectedIds.has(cap.id) ? 'opacity-40 pointer-events-none' : ''}`}
                                >
                                    <td onClick={e => e.stopPropagation()} className="w-10 px-4 py-4">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(cap.id)}
                                            onChange={() => toggle(cap.id)}
                                            className="rounded border-gray-300 dark:border-gray-600 cursor-pointer"
                                        />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-medium text-gray-900 dark:text-white">
                                        {cap.capab_id}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                        {isEditing && selectedIds.has(cap.id) ? (
                                            <input type="text" value={editValues[cap.id]?.capab_name ?? cap.capab_name} onChange={e => updateField(cap.id, 'capab_name', e.target.value)} className={editInputCls} />
                                        ) : cap.capab_name}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {isEditing && selectedIds.has(cap.id) ? (
                                            <input type="text" value={editValues[cap.id]?.capab_owner ?? cap.capab_owner} onChange={e => updateField(cap.id, 'capab_owner', e.target.value)} className={editInputCls} />
                                        ) : cap.capab_owner}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                        {isEditing && selectedIds.has(cap.id) ? (
                                            <input type="text" value={(editValues[cap.id]?.capab_provider ?? cap.capab_provider ?? []).join(', ')} onChange={e => updateField(cap.id, 'capab_provider', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} className={editInputCls} placeholder="Comma-separated" />
                                        ) : (
                                            <div className="flex flex-wrap gap-1">
                                                {(cap.capab_provider ?? []).map((p, i) => (
                                                    <span key={i} className="px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{p}</span>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                        {isEditing && selectedIds.has(cap.id) ? (
                                            <input type="text" value={(editValues[cap.id]?.capab_cmdb_id ?? cap.capab_cmdb_id ?? []).join(', ')} onChange={e => updateField(cap.id, 'capab_cmdb_id', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} className={editInputCls} placeholder="Comma-separated" />
                                        ) : (
                                            <div className="flex flex-wrap gap-1">
                                                {(cap.capab_cmdb_id ?? []).map((id, i) => (
                                                    <span key={i} className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 font-mono">{id}</span>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-[200px] truncate" title={cap.capab_other_details ?? ''}>
                                        {isEditing && selectedIds.has(cap.id) ? (
                                            <input type="text" value={editValues[cap.id]?.capab_other_details ?? cap.capab_other_details ?? ''} onChange={e => updateField(cap.id, 'capab_other_details', e.target.value)} className={editInputCls} />
                                        ) : (cap.capab_other_details || '—')}
                                    </td>
                                    <td onClick={e => e.stopPropagation()} className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        {!isEditing && (
                                            <div className="flex justify-end items-center space-x-2">
                                                <button onClick={() => setModalState({ type: 'view', item: cap })} className="text-gray-400 hover:text-green-500"><EyeIcon className="h-5 w-5" /></button>
                                                <button onClick={() => setModalState({ type: 'edit', item: cap })} className="text-gray-400 hover:text-yellow-500"><PencilIcon className="h-5 w-5" /></button>
                                                <button onClick={() => { setError(null); setModalState({ type: 'delete', item: cap }); }} className="text-gray-400 hover:text-red-500"><TrashIcon className="h-5 w-5" /></button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add / Edit / View Modal */}
            <CapabilityModal
                isOpen={modalState.type === 'add' || modalState.type === 'edit' || modalState.type === 'view'}
                onClose={closeModal}
                onSave={handleSave}
                capabilityToEdit={modalState.item ?? null}
                mode={modalState.type as 'add' | 'edit' | 'view'}
            />

            {/* Delete Confirm Modal */}
            {modalState.type === 'delete' && modalState.item && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex min-h-screen items-center justify-center p-4">
                        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                            <div className="px-6 py-4">
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Delete Capability</h3>
                            </div>
                            <div className="p-6">
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Are you sure you want to delete this capability?</p>
                                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-md mb-4">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">{modalState.item.capab_id} - {modalState.item.capab_name}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Owner: {modalState.item.capab_owner}</p>
                                </div>
                            </div>
                            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 rounded-b-lg flex justify-end space-x-3">
                                <button onClick={closeModal} disabled={deleting} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed">Cancel</button>
                                <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md shadow-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">{deleting ? 'Deleting...' : 'Delete'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Import CSV Preview Modal */}
            <Modal isOpen={modalState.type === 'import'} onClose={closeModal} title="Import CSV Preview">
                <div className="space-y-4">
                    <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">New Capabilities to Import ({importData.newCapabilities.length})</h4>
                        {importData.newCapabilities.length > 0 ? (
                            <div className="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-md p-3">
                                {importData.newCapabilities.map((c, idx) => (
                                    <div key={idx} className="py-2 px-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0 text-sm dark:text-gray-300">
                                        <div className="font-medium">{c.capab_name}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">Owner: {c.capab_owner} | Providers: {(c.capab_provider ?? []).join(', ')}</div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-gray-500 dark:text-gray-400 text-sm">No new capabilities to import.</div>
                        )}
                    </div>
                    {importData.duplicates.length > 0 && (
                        <div>
                            <h4 className="font-semibold text-yellow-600 dark:text-yellow-400 mb-2">Duplicates Skipped ({importData.duplicates.length})</h4>
                            <div className="text-sm text-yellow-700 dark:text-yellow-300">{importData.duplicates.join(', ')}</div>
                        </div>
                    )}
                    <div className="mt-6 flex justify-end space-x-3">
                        <button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>
                        <button onClick={handleConfirmImport} disabled={importData.newCapabilities.length === 0} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
                            Import {importData.newCapabilities.length} Capabilities
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Selection Action Bar */}
            {bulkProgress.status === 'idle' && (
                <SelectionActionBar
                    selectedCount={selectedIds.size}
                    isEditing={isEditing}
                    isConfirmingDelete={isConfirmingDelete}
                    isSaving={isSaving}
                    onEdit={() => startEdit(filteredAndSorted.filter(i => selectedIds.has(i.id)), i => i.id)}
                    onSaveAll={handleSaveAll}
                    onCancelEdit={cancelEdit}
                    onDelete={() => setIsConfirmingDelete(true)}
                    onConfirmDelete={handleBulkDelete}
                    onCancelDelete={() => setIsConfirmingDelete(false)}
                    onClear={clearAll}
                />
            )}

            {/* AI Chat Modal */}
            <AIChatModal
                isOpen={showAIChat}
                onClose={() => setShowAIChat(false)}
                module="capabilities"
                onConfirm={handleAIChatConfirm}
            />

            {/* Bulk Progress Modal */}
            <BulkProgressModal
                isOpen={bulkProgress.status !== 'idle'}
                title="Deleting Capabilities"
                progress={bulkProgress}
                onClose={handleCloseBulkProgress}
            />
        </div>
    );
};
