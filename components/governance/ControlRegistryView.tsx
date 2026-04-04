import React, { useState, useEffect, useCallback, useRef, ChangeEvent, useMemo } from 'react';
import { useUnifiedRefresh } from '../../hooks/useUnifiedRefresh';
import { ControlRegistry, ControlRegistryCreate, ControlRegistryUpdate, ControlStatus, ControlType, EnforcementType, Capability } from '../../types';
import * as SupabaseService from '../../services/supabase';
import { EyeIcon, PencilIcon, TrashIcon, PlusIcon, UploadIcon, DownloadIcon, SortUpDownIcon, SortUpIcon, SortDownIcon, BotIcon } from '../Icons';
import { parseCSVLine } from '../../utils/csvParser';
import { Modal } from '../common/Modal';
import { AIChatModal } from '../common/AIChatModal';
import { BulkProgressModal } from '../common/BulkProgressModal';
import { useTableSelection } from '../../hooks/useTableSelection';
import { SelectionActionBar } from '../common/SelectionActionBar';

// ─── Multi-Select Dropdown for Capabilities ──────────────────────────────────

interface CapabilityMultiSelectProps {
    values: string[];
    onChange: (values: string[]) => void;
    capabilities: Capability[];
    readOnly?: boolean;
}

const CapabilityMultiSelect: React.FC<CapabilityMultiSelectProps> = ({ values, onChange, capabilities, readOnly }) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const toggleValue = (val: string) => {
        if (values.includes(val)) {
            onChange(values.filter(v => v !== val));
        } else {
            onChange([...values, val]);
        }
    };

    if (readOnly) {
        return (
            <div className="mt-1 flex flex-wrap gap-1.5 min-h-[38px] items-center px-2 py-1.5 rounded-md border bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-sm">
                {values.length === 0 && <span className="text-gray-400 text-sm">—</span>}
                {values.map((v, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">{v}</span>
                ))}
            </div>
        );
    }

    return (
        <div ref={ref} className="relative mt-1">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex flex-wrap gap-1.5 items-center min-h-[38px] w-full rounded-md border px-2 py-1.5 text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-left"
            >
                {values.length === 0 && <span className="text-gray-400">Select capabilities...</span>}
                {values.map((v, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
                        {v}
                        <button type="button" onClick={(e) => { e.stopPropagation(); toggleValue(v); }} className="hover:text-purple-600 dark:hover:text-purple-200 leading-none">&times;</button>
                    </span>
                ))}
            </button>
            {isOpen && (
                <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg">
                    {capabilities.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-400">No capabilities found</div>
                    ) : capabilities.map(cap => (
                        <label key={cap.id} className="flex items-center px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-900 dark:text-white">
                            <input
                                type="checkbox"
                                checked={values.includes(cap.capab_name)}
                                onChange={() => toggleValue(cap.capab_name)}
                                className="rounded border-gray-300 dark:border-gray-600 mr-2"
                            />
                            <span className="font-mono text-xs text-gray-400 mr-2">{cap.capab_id}</span>
                            {cap.capab_name}
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};

// ─── Constants ───────────────────────────────────────────────────────────────

const CTL_STATUS_OPTIONS: ControlStatus[] = ['Enforced', 'NotEnforced'];
const CTL_TYPE_OPTIONS: ControlType[] = ['NN', 'Regulatory', 'Standard'];
const ENFORCEMENT_TYPE_OPTIONS: EnforcementType[] = ['org_wide', 'Asset_specific', 'BU_specific'];

const STATUS_BADGE: Record<ControlStatus, string> = {
    Enforced: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    NotEnforced: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const TYPE_BADGE: Record<ControlType, string> = {
    NN: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    Regulatory: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    Standard: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
};

const ENFORCEMENT_BADGE: Record<EnforcementType, string> = {
    org_wide: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
    Asset_specific: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    BU_specific: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
};

// ─── Modal ───────────────────────────────────────────────────────────────────

const MANDATORY_LABEL = <span className="text-red-500 ml-0.5">*</span>;

interface ControlModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: ControlRegistryCreate | ControlRegistryUpdate) => Promise<void>;
    controlToEdit: ControlRegistry | null;
    mode: 'add' | 'edit' | 'view';
    capabilities: Capability[];
}

type FormData = {
    ctl_name: string;
    ctl_status: ControlStatus;
    ctl_type: ControlType;
    enforcement_type: EnforcementType;
    ctl_description: string;
    ctld_by: string[];
    ctl_ref_fw: string;
    ctl_other_details: string;
};

const DEFAULT_FORM: FormData = {
    ctl_name: '',
    ctl_status: 'NotEnforced',
    ctl_type: 'NN',
    enforcement_type: 'org_wide',
    ctl_description: '',
    ctld_by: [],
    ctl_ref_fw: '',
    ctl_other_details: '',
};

const ControlModal: React.FC<ControlModalProps> = ({ isOpen, onClose, onSave, controlToEdit, mode, capabilities }) => {
    const [formData, setFormData] = useState<FormData>(DEFAULT_FORM);
    const [isSaving, setIsSaving] = useState(false);
    const isView = mode === 'view';

    useEffect(() => {
        if (controlToEdit) {
            setFormData({
                ctl_name: controlToEdit.ctl_name,
                ctl_status: controlToEdit.ctl_status,
                ctl_type: controlToEdit.ctl_type,
                enforcement_type: controlToEdit.enforcement_type,
                ctl_description: controlToEdit.ctl_description ?? '',
                ctld_by: controlToEdit.ctld_by ?? [],
                ctl_ref_fw: controlToEdit.ctl_ref_fw ?? '',
                ctl_other_details: controlToEdit.ctl_other_details ?? '',
            });
        } else {
            setFormData(DEFAULT_FORM);
        }
    }, [controlToEdit, isOpen]);

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
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

    const title = mode === 'add' ? 'Add Control' : mode === 'edit' ? 'Edit Control' : 'View Control';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {mode !== 'add' && controlToEdit && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Control ID</label>
                            <div className="mt-1 px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-600 text-sm font-mono text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-500 flex items-center gap-2">
                                {controlToEdit.ctl_id}
                                <span className="text-xs text-gray-400 dark:text-gray-500 font-sans">(auto-generated)</span>
                            </div>
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Control Name {MANDATORY_LABEL}</label>
                        <input type="text" name="ctl_name" value={formData.ctl_name} onChange={handleChange} readOnly={isView} required placeholder="e.g. Encrypt Data on End-User Devices" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status {MANDATORY_LABEL}</label>
                        <select name="ctl_status" value={formData.ctl_status} onChange={handleChange} disabled={isView} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            {CTL_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Control Type {MANDATORY_LABEL}</label>
                        <select name="ctl_type" value={formData.ctl_type} onChange={handleChange} disabled={isView} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            {CTL_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Enforcement Type {MANDATORY_LABEL}</label>
                        <select name="enforcement_type" value={formData.enforcement_type} onChange={handleChange} disabled={isView} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            {ENFORCEMENT_TYPE_OPTIONS.map(e => <option key={e} value={e}>{e === 'org_wide' ? 'Org-Wide' : e === 'Asset_specific' ? 'Asset-Specific' : 'BU-Specific'}</option>)}
                        </select>
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Controlled By (Capabilities)
                            {!isView && <span className="ml-1 text-xs text-gray-400 font-normal">— select from Capability Register</span>}
                        </label>
                        <CapabilityMultiSelect values={formData.ctld_by} onChange={vals => setFormData(prev => ({ ...prev, ctld_by: vals }))} capabilities={capabilities} readOnly={isView} />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                        <textarea name="ctl_description" value={formData.ctl_description} onChange={handleChange} readOnly={isView} rows={2} placeholder="Short description of the control" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Reference Framework</label>
                        <input type="text" name="ctl_ref_fw" value={formData.ctl_ref_fw} onChange={handleChange} readOnly={isView} placeholder="e.g. ISO 27001, NIST CSF" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Other Details</label>
                        <input type="text" name="ctl_other_details" value={formData.ctl_other_details} onChange={handleChange} readOnly={isView} placeholder="Additional notes" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
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

// ─── Main View ───────────────────────────────────────────────────────────────

type ModalState = { type: 'add' | 'edit' | 'view' | 'delete' | 'import' | null; item?: ControlRegistry | null };

export const ControlRegistryView: React.FC<{ isActive?: boolean }> = ({ isActive = true }) => {
    const [controls, setControls] = useState<ControlRegistry[]>([]);
    const [capabilities, setCapabilities] = useState<Capability[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [modalState, setModalState] = useState<ModalState>({ type: null });
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [filter, setFilter] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof ControlRegistry; direction: 'ascending' | 'descending' } | null>(null);
    const [importData, setImportData] = useState<{ newControls: ControlRegistryCreate[]; duplicates: string[] }>({ newControls: [], duplicates: [] });
    const [showAIChat, setShowAIChat] = useState(false);

    const {
        selectedIds, isEditing, editValues, isConfirmingDelete, isSaving, bulkProgress,
        setIsConfirmingDelete, setIsSaving, startBulkOperation, incrementBulkProgress, finishBulkOperation, resetBulkProgress,
        toggle, toggleAll, clearAll, startEdit, updateField, cancelEdit,
    } = useTableSelection<ControlRegistry>();

    const fetchControls = useCallback(async () => {
        try {
            setError(null);
            const data = await SupabaseService.getControlRegistry();
            setControls(data);
        } catch (e) {
            setError("Failed to load controls.");
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchCapabilities = useCallback(async () => {
        try {
            const data = await SupabaseService.getCapabilities();
            setCapabilities(data);
        } catch (e) {
            // silently fail — capabilities are optional context
        }
    }, []);

    useEffect(() => { fetchControls(); fetchCapabilities(); }, [fetchControls, fetchCapabilities]);

    const refreshAll = useCallback(() => {
        fetchControls();
        fetchCapabilities();
    }, [fetchControls, fetchCapabilities]);
    useUnifiedRefresh(isActive, refreshAll);

    const filteredAndSorted = useMemo(() => {
        let items = [...controls];
        if (filter) {
            const q = filter.toLowerCase();
            items = items.filter(c =>
                c.ctl_id.toLowerCase().includes(q) ||
                c.ctl_name.toLowerCase().includes(q) ||
                c.ctl_status.toLowerCase().includes(q) ||
                c.ctl_type.toLowerCase().includes(q) ||
                c.enforcement_type.toLowerCase().includes(q) ||
                (c.ctl_description ?? '').toLowerCase().includes(q) ||
                (c.ctld_by ?? []).some(v => v.toLowerCase().includes(q)) ||
                (c.ctl_ref_fw ?? '').toLowerCase().includes(q) ||
                (c.ctl_other_details ?? '').toLowerCase().includes(q)
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
    }, [controls, filter, sortConfig]);

    const requestSort = (key: keyof ControlRegistry) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') direction = 'descending';
        setSortConfig({ key, direction });
    };

    const getSortIconFor = (key: keyof ControlRegistry) => {
        if (!sortConfig || sortConfig.key !== key) return <SortUpDownIcon className="h-4 w-4 ml-1 text-gray-400" />;
        return sortConfig.direction === 'ascending' ? <SortUpIcon className="h-4 w-4 ml-1" /> : <SortDownIcon className="h-4 w-4 ml-1" />;
    };

    const closeModal = () => { setError(null); setModalState({ type: null }); };

    const handleSave = async (data: ControlRegistryCreate | ControlRegistryUpdate) => {
        try {
            if (modalState.type === 'edit' && modalState.item) {
                const updated = await SupabaseService.updateControlRegistry(modalState.item.id, data as ControlRegistryUpdate);
                await SupabaseService.logAllActivity({ action: 'Updated Control', module: 'Governance', entity_id: updated.id, entity_name: updated.ctl_name, event_data: { changes: data } });
            } else if (modalState.type === 'add') {
                const created = await SupabaseService.addControlRegistry(data as ControlRegistryCreate);
                await SupabaseService.logAllActivity({ action: 'Created Control', module: 'Governance', entity_id: created.id, entity_name: created.ctl_name, event_data: { details: data } });
            }
            fetchControls();
            closeModal();
        } catch (err) {
            setError('Failed to save control.');
        }
    };

    const handleDelete = async () => {
        if (modalState.type === 'delete' && modalState.item) {
            try {
                setDeleting(true);
                setError(null);
                await SupabaseService.deleteControlRegistry(modalState.item.id);
                await SupabaseService.logAllActivity({ action: 'Deleted Control', module: 'Governance', entity_id: modalState.item.id, entity_name: modalState.item.ctl_name });
                fetchControls();
                closeModal();
            } catch (err: any) {
                setError(err?.message || 'Failed to delete control.');
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
                await SupabaseService.deleteControlRegistry(id as string);
                incrementBulkProgress(true);
            } catch (err) {
                hasError = true;
                incrementBulkProgress(false);
            }
        }
        finishBulkOperation(hasError);
        await SupabaseService.logAllActivity({ action: 'Bulk Deleted Controls', module: 'Governance', event_data: { count: selectedIds.size } });
        fetchControls();
    };

    const handleCloseBulkProgress = () => { resetBulkProgress(); clearAll(); };

    const handleSaveAll = async () => {
        try {
            setIsSaving(true);
            for (const [id, changes] of Object.entries(editValues)) {
                await SupabaseService.updateControlRegistry(id, changes as ControlRegistryUpdate);
            }
            await SupabaseService.logAllActivity({ action: 'Bulk Edited Controls', module: 'Governance', event_data: { count: Object.keys(editValues).length } });
            cancelEdit();
            fetchControls();
        } catch (err) {
            setError('Failed to save changes.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleAIChatConfirm = async (records: Record<string, unknown>[]) => {
        try {
            const payloads = records.map(r => ({
                ctl_name: String(r.ctl_name ?? ''),
                ctl_status: (CTL_STATUS_OPTIONS.includes(r.ctl_status as ControlStatus) ? r.ctl_status : 'NotEnforced') as ControlStatus,
                ctl_type: (CTL_TYPE_OPTIONS.includes(r.ctl_type as ControlType) ? r.ctl_type : 'NN') as ControlType,
                enforcement_type: (ENFORCEMENT_TYPE_OPTIONS.includes(r.enforcement_type as EnforcementType) ? r.enforcement_type : 'org_wide') as EnforcementType,
                ctl_description: r.ctl_description ? String(r.ctl_description) : null,
                ctld_by: Array.isArray(r.ctld_by) ? r.ctld_by : String(r.ctld_by ?? '').split(',').map((s: string) => s.trim()).filter(Boolean),
                ctl_ref_fw: r.ctl_ref_fw ? String(r.ctl_ref_fw) : null,
                ctl_other_details: r.ctl_other_details ? String(r.ctl_other_details) : null,
            })) as unknown as ControlRegistryCreate[];
            await SupabaseService.bulkAddControlRegistry(payloads);
            await SupabaseService.logAllActivity({ action: 'Bulk Created Controls via AI', module: 'Governance', entity_name: `${records.length} controls created via AI`, event_data: { count: records.length, records } });
            fetchControls();
        } catch (err) {
            setError('Failed to save AI-generated controls.');
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
            const parsed: ControlRegistryCreate[] = lines
                .map(line => {
                    const cols = parseCSVLine(line);
                    // Expected CSV: ctl_id (ignored), ctl_name, ctl_status, ctl_type, enforcement_type, ctl_description, ctld_by, ctl_ref_fw, ctl_other_details
                    const [, ctl_name, ctl_status, ctl_type, enforcement_type, ctl_description, ctld_by_raw, ctl_ref_fw, ctl_other_details] = cols;
                    if (!ctl_name) return null;
                    return {
                        ctl_name,
                        ctl_status: (CTL_STATUS_OPTIONS.includes(ctl_status as ControlStatus) ? ctl_status : 'NotEnforced') as ControlStatus,
                        ctl_type: (CTL_TYPE_OPTIONS.includes(ctl_type as ControlType) ? ctl_type : 'NN') as ControlType,
                        enforcement_type: (ENFORCEMENT_TYPE_OPTIONS.includes(enforcement_type as EnforcementType) ? enforcement_type : 'org_wide') as EnforcementType,
                        ctl_description: ctl_description || null,
                        ctld_by: ctld_by_raw ? ctld_by_raw.replace(/[{}]/g, '').split(';').map(s => s.trim()).filter(Boolean) : [],
                        ctl_ref_fw: ctl_ref_fw || null,
                        ctl_other_details: ctl_other_details || null,
                    } as unknown as ControlRegistryCreate;
                })
                .filter(Boolean) as ControlRegistryCreate[];
            const existingNames = new Set(controls.map(c => c.ctl_name.toLowerCase()));
            const newControls = parsed.filter(c => !existingNames.has(c.ctl_name.toLowerCase()));
            const duplicates = parsed.filter(c => existingNames.has(c.ctl_name.toLowerCase())).map(c => c.ctl_name);
            setImportData({ newControls, duplicates });
            setModalState({ type: 'import' });
        };
        reader.readAsText(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleConfirmImport = async () => {
        if (importData.newControls.length > 0) {
            try {
                await SupabaseService.bulkAddControlRegistry(importData.newControls);
                await SupabaseService.logAllActivity({ action: 'CSV Import - Added Controls', module: 'Governance', event_data: { count: importData.newControls.length } });
                closeModal();
                fetchControls();
            } catch (err) {
                setError('Failed to import controls.');
            }
        }
    };

    // ── CSV Export ──
    const handleExportCSV = () => {
        const headers = ['ctl_id', 'ctl_name', 'ctl_status', 'ctl_type', 'enforcement_type', 'ctl_description', 'ctld_by', 'ctl_ref_fw', 'ctl_other_details'];
        const csvContent = [
            headers.join(','),
            ...filteredAndSorted.map(c => [
                c.ctl_id,
                `"${(c.ctl_name || '').replace(/"/g, '""')}"`,
                c.ctl_status,
                c.ctl_type,
                c.enforcement_type,
                `"${(c.ctl_description || '').replace(/"/g, '""')}"`,
                `"{${(c.ctld_by ?? []).join(';')}}"`,
                `"${(c.ctl_ref_fw || '').replace(/"/g, '""')}"`,
                `"${(c.ctl_other_details || '').replace(/"/g, '""')}"`,
            ].join(','))
        ].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `control-registry-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    const editInputCls = "w-full border border-blue-300 dark:border-blue-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400";

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                <div className="w-full sm:w-1/3">
                    <input
                        type="text"
                        placeholder="Filter controls..."
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        aria-label="Filter controls"
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
                    <button onClick={() => setModalState({ type: 'add' })} title="Add Control" className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
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
                                    <button onClick={() => requestSort('ctl_id')} className="flex items-center w-full text-left focus:outline-none">Control ID {getSortIconFor('ctl_id')}</button>
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('ctl_name')} className="flex items-center w-full text-left focus:outline-none">Name {getSortIconFor('ctl_name')}</button>
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('ctl_status')} className="flex items-center w-full text-left focus:outline-none">Status {getSortIconFor('ctl_status')}</button>
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('ctl_type')} className="flex items-center w-full text-left focus:outline-none">Type {getSortIconFor('ctl_type')}</button>
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('enforcement_type')} className="flex items-center w-full text-left focus:outline-none">Enforcement {getSortIconFor('enforcement_type')}</button>
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Controlled By</th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Ref Framework</th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={9} className="text-center py-4 text-gray-500 dark:text-gray-400">Loading controls...</td></tr>
                            ) : filteredAndSorted.length === 0 ? (
                                <tr><td colSpan={9} className="text-center py-4 text-gray-500 dark:text-gray-400">No controls found.</td></tr>
                            ) : filteredAndSorted.map(ctl => (
                                <tr
                                    key={ctl.id}
                                    onClick={() => !isEditing && setModalState({ type: 'view', item: ctl })}
                                    className={`cursor-pointer transition-colors ${
                                        selectedIds.has(ctl.id) ? 'bg-blue-50 dark:bg-blue-900/20' :
                                        'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                    } ${isEditing && !selectedIds.has(ctl.id) ? 'opacity-40 pointer-events-none' : ''}`}
                                >
                                    <td onClick={e => e.stopPropagation()} className="w-10 px-4 py-4">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(ctl.id)}
                                            onChange={() => toggle(ctl.id)}
                                            className="rounded border-gray-300 dark:border-gray-600 cursor-pointer"
                                        />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-medium text-gray-900 dark:text-white">
                                        {ctl.ctl_id}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                        {isEditing && selectedIds.has(ctl.id) ? (
                                            <input type="text" value={editValues[ctl.id]?.ctl_name ?? ctl.ctl_name} onChange={e => updateField(ctl.id, 'ctl_name', e.target.value)} className={editInputCls} />
                                        ) : ctl.ctl_name}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {isEditing && selectedIds.has(ctl.id) ? (
                                            <select value={editValues[ctl.id]?.ctl_status ?? ctl.ctl_status} onChange={e => updateField(ctl.id, 'ctl_status', e.target.value)} className={editInputCls}>
                                                {CTL_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        ) : (
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[ctl.ctl_status]}`}>{ctl.ctl_status}</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {isEditing && selectedIds.has(ctl.id) ? (
                                            <select value={editValues[ctl.id]?.ctl_type ?? ctl.ctl_type} onChange={e => updateField(ctl.id, 'ctl_type', e.target.value)} className={editInputCls}>
                                                {CTL_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        ) : (
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_BADGE[ctl.ctl_type]}`}>{ctl.ctl_type}</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {isEditing && selectedIds.has(ctl.id) ? (
                                            <select value={editValues[ctl.id]?.enforcement_type ?? ctl.enforcement_type} onChange={e => updateField(ctl.id, 'enforcement_type', e.target.value)} className={editInputCls}>
                                                {ENFORCEMENT_TYPE_OPTIONS.map(e => <option key={e} value={e}>{e === 'org_wide' ? 'Org-Wide' : e === 'Asset_specific' ? 'Asset-Specific' : 'BU-Specific'}</option>)}
                                            </select>
                                        ) : (
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ENFORCEMENT_BADGE[ctl.enforcement_type]}`}>
                                                {ctl.enforcement_type === 'org_wide' ? 'Org-Wide' : ctl.enforcement_type === 'Asset_specific' ? 'Asset-Specific' : 'BU-Specific'}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                        {isEditing && selectedIds.has(ctl.id) ? (
                                            <input type="text" value={(editValues[ctl.id]?.ctld_by ?? ctl.ctld_by ?? []).join(', ')} onChange={e => updateField(ctl.id, 'ctld_by', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} className={editInputCls} placeholder="Comma-separated" />
                                        ) : (
                                            <div className="flex flex-wrap gap-1">
                                                {(ctl.ctld_by ?? []).map((v, i) => (
                                                    <span key={i} className="px-1.5 py-0.5 rounded text-xs bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">{v}</span>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-[150px] truncate" title={ctl.ctl_ref_fw ?? ''}>
                                        {isEditing && selectedIds.has(ctl.id) ? (
                                            <input type="text" value={editValues[ctl.id]?.ctl_ref_fw ?? ctl.ctl_ref_fw ?? ''} onChange={e => updateField(ctl.id, 'ctl_ref_fw', e.target.value)} className={editInputCls} />
                                        ) : (ctl.ctl_ref_fw || '—')}
                                    </td>
                                    <td onClick={e => e.stopPropagation()} className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        {!isEditing && (
                                            <div className="flex justify-end items-center space-x-2">
                                                <button onClick={() => setModalState({ type: 'view', item: ctl })} className="text-gray-400 hover:text-green-500"><EyeIcon className="h-5 w-5" /></button>
                                                <button onClick={() => setModalState({ type: 'edit', item: ctl })} className="text-gray-400 hover:text-yellow-500"><PencilIcon className="h-5 w-5" /></button>
                                                <button onClick={() => { setError(null); setModalState({ type: 'delete', item: ctl }); }} className="text-gray-400 hover:text-red-500"><TrashIcon className="h-5 w-5" /></button>
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
            <ControlModal
                isOpen={modalState.type === 'add' || modalState.type === 'edit' || modalState.type === 'view'}
                onClose={closeModal}
                onSave={handleSave}
                controlToEdit={modalState.item ?? null}
                mode={modalState.type as 'add' | 'edit' | 'view'}
                capabilities={capabilities}
            />

            {/* Delete Confirm Modal */}
            {modalState.type === 'delete' && modalState.item && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex min-h-screen items-center justify-center p-4">
                        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                            <div className="px-6 py-4">
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Delete Control</h3>
                            </div>
                            <div className="p-6">
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Are you sure you want to delete this control?</p>
                                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-md mb-4">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">{modalState.item.ctl_id} - {modalState.item.ctl_name}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Type: {modalState.item.ctl_type} | Status: {modalState.item.ctl_status}</p>
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
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">New Controls to Import ({importData.newControls.length})</h4>
                        {importData.newControls.length > 0 ? (
                            <div className="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-md p-3">
                                {importData.newControls.map((c, idx) => (
                                    <div key={idx} className="py-2 px-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0 text-sm dark:text-gray-300">
                                        <div className="font-medium">{c.ctl_name}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">Type: {c.ctl_type} | Status: {c.ctl_status} | Enforcement: {c.enforcement_type}</div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-gray-500 dark:text-gray-400 text-sm">No new controls to import.</div>
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
                        <button onClick={handleConfirmImport} disabled={importData.newControls.length === 0} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
                            Import {importData.newControls.length} Controls
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
                module="control_registry"
                onConfirm={handleAIChatConfirm}
            />

            {/* Bulk Progress Modal */}
            <BulkProgressModal
                isOpen={bulkProgress.status !== 'idle'}
                title="Deleting Controls"
                progress={bulkProgress}
                onClose={handleCloseBulkProgress}
            />
        </div>
    );
};