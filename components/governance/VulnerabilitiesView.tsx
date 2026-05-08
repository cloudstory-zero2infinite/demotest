import React, { useState, useEffect, useCallback, useRef, ChangeEvent, useMemo } from 'react';

import { useUnifiedRefresh } from '../../hooks/useUnifiedRefresh';

import { Vulnerability, VulnerabilityCreate, VulnerabilityUpdate, VulnerabilityStatus, VulnerabilitySource, Asset } from '../../types';

import * as SupabaseService from '../../services/supabase';

import { CustomField } from '../../services/supabase';

import { EyeIcon, PencilIcon, TrashIcon, PlusIcon, UploadIcon, DownloadIcon, SortUpDownIcon, SortUpIcon, SortDownIcon, BotIcon, FunnelIcon } from '../Icons';
import { FilterDropdown } from '../common/FilterDropdown';

import { Modal } from '../common/Modal';

import { StatusBadge } from '../common/StatusBadge';

import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';

import { useTableSelection } from '../../hooks/useTableSelection';

import { SelectionActionBar } from '../common/SelectionActionBar';

import { AIChatModal } from '../common/AIChatModal';

import CustomFieldsManager from '../common/CustomFieldsManager';

import * as XLSX from 'xlsx';

import { parseCSVLine } from '../../utils/csvParser';

import { BulkProgressModal } from '../common/BulkProgressModal';
import { processImportData, SYSTEM_FIELDS_CONFIG, applyManualMapping } from '../../utils/importUtils';
import { ImportConfirmationModal } from '../common/ImportConfirmationModal';
import { ImportMappingModal, ColumnMapping } from '../common/ImportMappingModal';
import { parseCSVText } from '../../utils/csvParser';

// Helper function to sanitize input

const sanitizeInput = (input: string): string => {

    return input

        .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters

        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags

        .replace(/javascript:/gi, '') // Remove javascript protocols

        .replace(/on\w+\s*=/gi, '') // Remove event handlers

        .trim();

};

interface VulnerabilityModalProps {

    isOpen: boolean;

    onClose: () => void;

    onSave: (vulnerability: VulnerabilityCreate | VulnerabilityUpdate) => void;

    vulnerabilityToEdit: Vulnerability | null;

    mode: 'add' | 'edit' | 'view';

    onEdit?: () => void;

    onDelete?: () => void;

    customFields: CustomField[];

}

const VulnerabilityModal: React.FC<VulnerabilityModalProps> = ({ isOpen, onClose, onSave, vulnerabilityToEdit, mode, onEdit, onDelete, customFields }) => {

    const [formData, setFormData] = useState<Partial<VulnerabilityCreate>>({});

    const isViewMode = mode === 'view';

    const [allAssets, setAllAssets] = useState<Asset[]>([]);

    const [assetSearchText, setAssetSearchText] = useState('');

    const [showAssetSuggestions, setShowAssetSuggestions] = useState(false);

    const autocompleteRef = useRef<HTMLDivElement>(null);

    const vulnerabilitySources: VulnerabilitySource[] = ['KEV', 'Scanning', 'PT', 'Reported-Ext'];

    useEffect(() => {

        const handleClickOutside = (event: MouseEvent) => {

            if (autocompleteRef.current && !autocompleteRef.current.contains(event.target as Node)) {

                setShowAssetSuggestions(false);

            }

        };

        document.addEventListener('mousedown', handleClickOutside);

        return () => document.removeEventListener('mousedown', handleClickOutside);

    }, []);

    useEffect(() => {

        if (isOpen) {

            SupabaseService.getAssets().then(setAllAssets);

        }

    }, [isOpen]);

    useEffect(() => {

        if (vulnerabilityToEdit) {

            const { name, description, derived_from, status, asset_id } = vulnerabilityToEdit;

            const customFieldsData: Record<string, any> = {};

            customFields.forEach(field => {

                customFieldsData[field.field_name] = vulnerabilityToEdit.custom_fields?.[field.field_name] || '';

            });

            setFormData({ name, description, derived_from, status, asset_id, custom_fields: customFieldsData });

            if (vulnerabilityToEdit.asset_id && allAssets.length > 0) {

                const linkedAsset = allAssets.find(a => a.id === vulnerabilityToEdit.asset_id);

                if (linkedAsset) {

                    setAssetSearchText(`${linkedAsset.name} (${linkedAsset.asset_id})`);

                }

            } else {

                setAssetSearchText('');

            }

        } else {

            const customFieldsData: Record<string, any> = {};

            customFields.forEach(field => {

                customFieldsData[field.field_name] = '';

            });

            setFormData({ name: '', description: '', derived_from: 'Scanning', status: 'Planned', asset_id: null, custom_fields: customFieldsData });

            setAssetSearchText('');

        }

    }, [vulnerabilityToEdit, isOpen, allAssets, customFields]);

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {

        const { name, value } = e.target;

        setFormData(prev => ({ ...prev, [name]: value }));

    };



    const handleCustomFieldChange = (fieldName: string, value: string) => {

        setFormData(prev => ({

            ...prev,

            custom_fields: {

                ...prev.custom_fields,

                [fieldName]: value

            }

        }));

    };

    const handleAssetSelect = (asset: Asset) => {

        setFormData(prev => ({ ...prev, asset_id: asset.id }));

        setAssetSearchText(`${asset.name} (${asset.asset_id})`);

        setShowAssetSuggestions(false);

    };

    const filteredAssets = useMemo(() => {

        if (!assetSearchText) return [];

        const selectedAsset = allAssets.find(a => a.id === formData.asset_id);

        if (selectedAsset && assetSearchText === `${selectedAsset.name} (${selectedAsset.asset_id})`) {

            return [];

        }

        return allAssets.filter(asset =>

            asset.name.toLowerCase().includes(assetSearchText.toLowerCase()) ||

            asset.asset_id.toLowerCase().includes(assetSearchText.toLowerCase())

        );

    }, [assetSearchText, allAssets, formData.asset_id]);

    const handleSubmit = (e: React.FormEvent) => {

        e.preventDefault();

        onSave(formData as VulnerabilityCreate | VulnerabilityUpdate);

    };

    const title = mode === 'add' ? 'Add New Vulnerability' : mode === 'edit' ? 'Edit Vulnerability' : 'View Vulnerability';

    return (

        <Modal isOpen={isOpen} onClose={onClose} title={title}

            headerActions={isViewMode && (

                <>

                    <button onClick={() => { onClose(); onEdit?.(); }} title="Edit" className="p-1.5 text-gray-400 hover:text-yellow-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">

                        <PencilIcon className="h-4 w-4" />

                    </button>

                    <button onClick={() => { onClose(); onDelete?.(); }} title="Delete" className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">

                        <TrashIcon className="h-4 w-4" />

                    </button>

                </>

            )}

        >

            <form onSubmit={handleSubmit} className="space-y-4">

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                    <div className="md:col-span-2">

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>

                        <input type="text" name="name" value={formData.name || ''} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />

                    </div>

                    <div className="md:col-span-2">

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>

                        <textarea name="description" value={formData.description || ''} onChange={handleChange} readOnly={isViewMode} rows={3} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"></textarea>

                    </div>

                    <div>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Source (Derived From)</label>

                        <select name="derived_from" value={formData.derived_from} onChange={handleChange} disabled={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">

                            {vulnerabilitySources.map(source => (

                                <option key={source} value={source}>{source}</option>

                            ))}

                        </select>

                    </div>

                    <div>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>

                        <select name="status" value={formData.status} onChange={handleChange} disabled={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">

                            <option>Planned</option>

                            <option>Remediated</option>

                            <option>NA</option>

                        </select>

                    </div>

                    <div className="md:col-span-2" ref={autocompleteRef}>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Associated Asset</label>

                        <div className="relative">

                            <input

                                type="text"

                                value={assetSearchText}

                                onChange={e => {

                                    setAssetSearchText(e.target.value);

                                    setFormData(prev => ({ ...prev, asset_id: null }));

                                    if (!showAssetSuggestions) setShowAssetSuggestions(true);

                                }}

                                onFocus={() => setShowAssetSuggestions(true)}

                                placeholder="Search by asset name or ID"

                                readOnly={isViewMode}

                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"

                            />

                            {!isViewMode && showAssetSuggestions && filteredAssets.length > 0 && (

                                <ul className="absolute z-10 w-full bg-white dark:bg-gray-800 border rounded-md mt-1 max-h-40 overflow-y-auto shadow-lg">

                                    {filteredAssets.map(asset => (

                                        <li key={asset.id} onClick={() => handleAssetSelect(asset)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-900 dark:text-gray-200">

                                            {asset.name} ({asset.asset_id})

                                        </li>

                                    ))}

                                </ul>

                            )}

                        </div>

                    </div>

                </div>

                

                {/* Custom Fields Section */}

                {customFields.length > 0 && (

                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">

                        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Custom Fields</h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                            {customFields.map(field => (

                                <div key={field.id}>

                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">

                                        {field.field_label}

                                        {field.is_required && <span className="text-red-500 ml-1">*</span>}

                                    </label>

                                    <input

                                        type="text"

                                        value={formData.custom_fields?.[field.field_name] || ''}

                                        onChange={(e) => handleCustomFieldChange(field.field_name, e.target.value)}

                                        readOnly={isViewMode}

                                        required={field.is_required}

                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"

                                        placeholder={`Enter ${field.field_label}`}

                                    />

                                </div>

                            ))}

                        </div>

                    </div>

                )}

                

                {!isViewMode && (

                    <div className="mt-6 flex justify-end space-x-3">

                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>

                        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700">Save</button>

                    </div>

                )}

            </form>

        </Modal>

    );

};

export const VulnerabilitiesView: React.FC<{ isActive?: boolean }> = ({ isActive = true }) => {

    const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([]);

    const [loading, setLoading] = useState(true);

    const [error, setError] = useState<string | null>(null);

    const [modalState, setModalState] = useState<{ type: 'add' | 'edit' | 'view' | 'delete' | 'import' | 'mapping' | null; vulnerability?: Vulnerability | null }>({ type: null });

    const [importData, setImportData] = useState<any[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState(0);
    const [totalToImport, setTotalToImport] = useState(0);
    const [importedCount, setImportedCount] = useState(0);
    const [importErrors, setImportErrors] = useState(0);

    const [filter, setFilter] = useState('');

    const [sortConfig, setSortConfig] = useState<{ key: keyof Vulnerability; direction: 'ascending' | 'descending' } | null>(null);

    const [currentPage, setCurrentPage] = useState(1);

    const [itemsPerPage, setItemsPerPage] = useState(100);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const [showAIChat, setShowAIChat] = useState(false);

    // Custom fields state

    const [customFields, setCustomFields] = useState<CustomField[]>([]);
    const [showColumnManagement, setShowColumnManagement] = useState(false);
    const [newFieldsToCreate, setNewFieldsToCreate] = useState<any[]>([]);
    const [pendingImportData, setPendingImportData] = useState<any[]>([]);
    const [importHeaders, setImportHeaders] = useState<string[]>([]);
    const [rawRows, setRawRows] = useState<any[]>([]);

    const {
        selectedIds, isEditing, editValues, isConfirmingDelete, isSaving, bulkProgress,
        setIsConfirmingDelete, setIsSaving, startBulkOperation, incrementBulkProgress, finishBulkOperation, resetBulkProgress,
        toggle, toggleAll, clearAll, startEdit, updateField, cancelEdit,
    } = useTableSelection<Vulnerability>();

    // Column Drag and Drop state
    const [columnOrder, setColumnOrder] = useState<string[]>([]);
    const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
    const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

    const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
    const [openFilterDropdown, setOpenFilterDropdown] = useState<{key: string, rect: DOMRect} | null>(null);

    // Default column order for vulnerabilities
    const defaultColumns = useMemo(() => [
        'name',
        'asset_id',
        'derived_from',
        'status'
    ], []);

    // Initialize column order from localStorage or defaults
    useEffect(() => {
        const savedOrder = localStorage.getItem('vulnerabilities_column_order');
        const customFieldKeys = customFields.map(f => `custom_field_${f.field_name}`);
        
        if (savedOrder) {
            try {
                const parsed = JSON.parse(savedOrder);
                const combinedOrder = [...parsed];
                
                defaultColumns.forEach(col => {
                    if (!combinedOrder.includes(col)) combinedOrder.push(col);
                });

                customFieldKeys.forEach(col => {
                    if (!combinedOrder.includes(col)) combinedOrder.push(col);
                });

                const finalOrder = combinedOrder.filter(col => 
                    defaultColumns.includes(col) || customFieldKeys.includes(col)
                );

                setColumnOrder(finalOrder);
            } catch (e) {
                console.error('Failed to parse saved column order', e);
                setColumnOrder([...defaultColumns, ...customFieldKeys]);
            }
        } else {
            setColumnOrder([...defaultColumns, ...customFieldKeys]);
        }
    }, [customFields, defaultColumns]);

    // Save column order when it changes
    useEffect(() => {
        if (columnOrder.length > 0) {
            localStorage.setItem('vulnerabilities_column_order', JSON.stringify(columnOrder));
        }
    }, [columnOrder]);

    const handleDragStart = (e: React.DragEvent, columnKey: string) => {
        setDraggedColumn(columnKey);
        e.dataTransfer.setData('text/plain', columnKey);
        e.dataTransfer.effectAllowed = 'move';
        const target = e.currentTarget as HTMLElement;
        target.style.opacity = '0.4';
    };

    const handleDragEnd = (e: React.DragEvent) => {
        const target = e.currentTarget as HTMLElement;
        target.style.opacity = '1';
        setDraggedColumn(null);
        setDragOverColumn(null);
    };

    const handleDragOver = (e: React.DragEvent, columnKey: string) => {
        e.preventDefault();
        if (draggedColumn === columnKey) return;
        setDragOverColumn(columnKey);
    };

    const handleDrop = (e: React.DragEvent, targetColumnKey: string) => {
        e.preventDefault();
        if (!draggedColumn || draggedColumn === targetColumnKey) return;

        setColumnOrder(prev => {
            const newOrder = [...prev];
            const draggedIndex = newOrder.indexOf(draggedColumn);
            const targetIndex = newOrder.indexOf(targetColumnKey);
            
            newOrder.splice(draggedIndex, 1);
            newOrder.splice(targetIndex, 0, draggedColumn);
            
            return newOrder;
        });

        setDraggedColumn(null);
        setDragOverColumn(null);
    };


    const vulnerabilityStatusStyles: Record<VulnerabilityStatus, string> = {

        'Planned': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',

        'Remediated': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',

        'NA': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',

    };

    const fetchVulnerabilities = useCallback(async () => {

        try {

            setError(null);

            const data = await SupabaseService.getVulnerabilities();

            setVulnerabilities(data);

        } catch (e) {

            setError("Failed to load vulnerabilities.");

        } finally {

            setLoading(false);

        }

    }, []);



    const fetchCustomFields = useCallback(async () => {

        try {

            const fields = await SupabaseService.getCustomFields('vulnerabilities');

            setCustomFields(fields);

        } catch (e) {

            console.error('Failed to load custom fields:', e);

        }

    }, []);



    const handleAIChatConfirm = async (records: Record<string, unknown>[]) => {

        try {

            for (const record of records) {

                const vulnerabilityData: VulnerabilityCreate = {

                    name: String(record.name || ''),

                    description: String(record.description || ''),

                    derived_from: (record.derived_from as VulnerabilitySource) || 'Scanning',

                    status: (record.status as VulnerabilityStatus) || 'Planned',

                    asset_id: record.asset_id ? String(record.asset_id) : null

                };

                await SupabaseService.addVulnerability(vulnerabilityData);

            }

            await SupabaseService.logAllActivity({

                action: 'Bulk Created Vulnerabilities via AI',

                module: 'Governance',

                entity_id: null,

                entity_name: `${records.length} vulnerabilities created via AI`,

                event_data: { count: records.length, records }

            });

            fetchVulnerabilities();

        } catch (err) {

            setError('Failed to save AI-generated vulnerabilities.');

        }

    };

    useUnifiedRefresh(isActive, fetchVulnerabilities);

    useEffect(() => {

        fetchCustomFields();

    }, []);

    const filteredAndSortedVulnerabilities = useMemo(() => {

        let filteredItems = [...vulnerabilities];

        if (filter) {

            const lowerCaseFilter = filter.toLowerCase();

            filteredItems = filteredItems.filter(item =>

                item.name.toLowerCase().includes(lowerCaseFilter) ||

                (item.description && item.description.toLowerCase().includes(lowerCaseFilter)) ||

                (item.assets?.name && item.assets.name.toLowerCase().includes(lowerCaseFilter)) ||

                (item.assets?.asset_id && item.assets.asset_id.toLowerCase().includes(lowerCaseFilter))

            );
        }

        // Apply column-level filters
        if (Object.keys(columnFilters).length > 0) {
            filteredItems = filteredItems.filter(item => {
                return Object.entries(columnFilters).every(([key, selectedValues]) => {
                    if (!selectedValues || selectedValues.length === 0) return true;
                    
                    let val;
                    if (key.startsWith('custom_field_')) {
                        val = item.custom_fields?.[key.replace('custom_field_', '')];
                    } else {
                        val = (item as any)[key];
                    }
                    
                    const displayVal = val !== undefined && val !== null && val !== "" ? String(val) : '-';
                    return selectedValues.includes(displayVal);
                });
            });
        }

        if (sortConfig !== null) {

            filteredItems.sort((a, b) => {

                const aValue = a[sortConfig.key];

                const bValue = b[sortConfig.key];

                if (aValue === null || aValue === undefined) return 1;

                if (bValue === null || bValue === undefined) return -1;

                if (aValue < bValue) {

                    return sortConfig.direction === 'ascending' ? -1 : 1;

                }

                if (aValue > bValue) {

                    return sortConfig.direction === 'ascending' ? 1 : -1;

                }

                return 0;

            });

        }

        return filteredItems;

    }, [vulnerabilities, filter, sortConfig]);

    // Pagination: Get current page items

    const startIndex = (currentPage - 1) * itemsPerPage;

    const endIndex = startIndex + itemsPerPage;

    const paginatedVulnerabilities = filteredAndSortedVulnerabilities.slice(startIndex, endIndex);

    const requestSort = (key: keyof Vulnerability, direction?: 'ascending' | 'descending') => {
        if (direction) {
            setSortConfig({ key, direction });
            return;
        }

        let newDirection: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            newDirection = 'descending';
        }
        setSortConfig({ key, direction: newDirection });
    };

    const renderFilterableHeader = (columnKey: string, title: string) => {
        const canSort = ['name', 'derived_from', 'status'].includes(columnKey);

        return (
            <th 
                scope="col" 
                key={columnKey} 
                draggable={true}
                onDragStart={(e) => handleDragStart(e, columnKey)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, columnKey)}
                onDrop={(e) => handleDrop(e, columnKey)}
                className={`sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300 ${dragOverColumn === columnKey ? 'border-l-4 border-l-blue-500' : ''}`}
            >
                {canSort ? (
                    <button onClick={() => requestSort(columnKey as keyof Vulnerability)} className="flex items-center w-full text-left focus:outline-none">
                        {title} {getSortIconFor(columnKey as keyof Vulnerability)}
                    </button>
                ) : (
                    <div className="flex items-center">
                        {title}
                        {columnKey.startsWith('custom_field_') && customFields.find(f => `custom_field_${f.field_name}` === columnKey)?.is_required && <span className="text-red-500 ml-1">*</span>}
                    </div>
                )}
            </th>
        );
    };

    const getSortIconFor = (key: keyof Vulnerability) => {


        if (!sortConfig || sortConfig.key !== key) {

            return <SortUpDownIcon className="h-4 w-4 ml-1 text-gray-400" />;

        }

        return sortConfig.direction === 'ascending' ? <SortUpIcon className="h-4 w-4 ml-1" /> : <SortDownIcon className="h-4 w-4 ml-1" />;

    };

    const closeModal = () => setModalState({ type: null });

    const handleSaveVulnerability = async (formData: VulnerabilityCreate | VulnerabilityUpdate) => {

        try {

            if (modalState.type === 'edit' && modalState.vulnerability) {

                const updatedVulnerability = await SupabaseService.updateVulnerability(modalState.vulnerability.id, formData);

                await SupabaseService.logAllActivity({

                    action: 'Updated Vulnerability',

                    module: 'Governance',

                    entity_id: updatedVulnerability.id,

                    entity_name: updatedVulnerability.name,

                    event_data: { changes: formData }

                });

            } else if (modalState.type === 'add') {

                const addedVulnerability = await SupabaseService.addVulnerability(formData as VulnerabilityCreate);

                await SupabaseService.logAllActivity({

                    action: 'Created Vulnerability',

                    module: 'Governance',

                    entity_id: addedVulnerability.id,

                    entity_name: addedVulnerability.name,

                    event_data: { details: formData }

                });

            }

            fetchVulnerabilities();

            closeModal();

        } catch (err) {

            setError('Failed to save vulnerability.');

        }

    };

    const handleDeleteVulnerability = async () => {

        if (modalState.type === 'delete' && modalState.vulnerability) {

            try {

                await SupabaseService.deleteVulnerability(modalState.vulnerability.id);

                await SupabaseService.logAllActivity({

                    action: 'Deleted Vulnerability',

                    module: 'Governance',

                    entity_id: modalState.vulnerability.id,

                    entity_name: modalState.vulnerability.name

                });

                fetchVulnerabilities();

                closeModal();

            } catch (err) {

                setError('Failed to delete vulnerability.');

            }

        }

    };

    const handleBulkDelete = async () => {

        setIsConfirmingDelete(false);

        startBulkOperation(selectedIds.size);

        

        try {

            // Use bulk deletion for efficiency with 1000+ records

            await SupabaseService.deleteVulnerabilitiesBulk(Array.from(selectedIds) as string[]);

            

            // Mark all as successful since bulk operation either succeeds or fails entirely

            for (let i = 0; i < selectedIds.size; i++) {

                incrementBulkProgress(true);

            }

            

            finishBulkOperation(false);

            // Refresh data after successful deletion

            fetchVulnerabilities();

        } catch (err) {

            console.error('Failed to bulk delete vulnerabilities', err);

            

            // Mark all as failed

            for (let i = 0; i < selectedIds.size; i++) {

                incrementBulkProgress(false);

            }

            

            finishBulkOperation(true);

        }

    };

    const handleCloseBulkProgress = () => {

        resetBulkProgress();

        clearAll();

    };

    const handleExportCSV = () => {
        // Start with standard headers (Using labels from STANDARD_FIELD_MAPS)
        let headers = ['Name', 'Description', 'Source', 'Status', 'Asset ID'];
        
        // Add custom field labels
        const customFieldLabels = customFields.map(field => field.field_label);
        headers = [...headers, ...customFieldLabels];

        const csvContent = [
            headers.join(','),
            ...filteredAndSortedVulnerabilities.map(v => {
                // Start with standard fields
                let row = [
                    `"${(v.name || '').replace(/"/g, '""')}"`,
                    `"${(v.description || '').replace(/"/g, '""')}"`,
                    v.derived_from || '',
                    v.status || '',
                    v.asset_id || ''
                ];

                // Add custom field values
                const customFieldValues = customFields.map(field => {
                    const value = v.custom_fields?.[field.field_name] ?? '';
                    return `"${String(value).replace(/"/g, '""')}"`;
                });

                row = [...row, ...customFieldValues];
                return row.join(',');
            }),
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

        const link = document.createElement('a');

        const url = URL.createObjectURL(blob);

        link.href = url;

        link.download = `vulnerabilities-${new Date().toISOString().split('T')[0]}.csv`;

        document.body.appendChild(link);

        link.click();

        document.body.removeChild(link);

        URL.revokeObjectURL(url);

    };

    const editInputCls = "w-full border border-blue-300 dark:border-blue-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400";

    const editSelectCls = "border border-blue-300 dark:border-blue-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400";

    const handleSaveAll = async () => {

        try {

            setIsSaving(true);

            for (const [id, changes] of Object.entries(editValues)) {

                await SupabaseService.updateVulnerability(id as string, changes);

            }

            cancelEdit();

            fetchVulnerabilities();

        } catch (err) {

            setError('Failed to save changes.');

        } finally {

            setIsSaving(false);

        }

    };

    const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();

        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            reader.readAsBinaryString(file);
        } else {
            reader.readAsText(file);
        }

        reader.onload = async (e) => {
            const content = e.target?.result;
            if (!content) return;

            let headers: string[] = [];
            let rows: any[] = [];

            try {
                if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                    const workbook = XLSX.read(content, { type: 'binary' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const excelData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
                    
                    if (excelData.length > 0) {
                        headers = excelData[0].map((h: any) => String(h || ''));
                        // Transform array rows to object rows for mapping
                        rows = excelData.slice(1).map(row => {
                            const obj: any = {};
                            headers.forEach((h, idx) => {
                                obj[h] = row[idx];
                            });
                            return obj;
                        });
                    }
                } else {
                    const text = content as string;
                    const parsed = parseCSVText(text);
                    headers = parsed.headers;
                    // parseCSVText returns objects already
                    rows = parsed.rows;
                }

                setImportHeaders(headers);
                setRawRows(rows);
                setModalState({ type: 'mapping' });
            } catch (err) {
                setError('Failed to parse import file.');
            }
        };

        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleConfirmMapping = (mapping: ColumnMapping[]) => {
        try {
            const { records, newFields } = applyManualMapping(mapping, rawRows, customFields);
            
            if (newFields.length > 0) {
                setNewFieldsToCreate(newFields);
                setPendingImportData(records);
                return;
            }

            prepareImportData(records);
        } catch (err) {
            setError('Failed to process mapping.');
        }
    };

    const prepareImportData = async (records: any[]) => {
        try {
            setError(null);
            const allAssets = await SupabaseService.getAssets();
            
            const processedRecords = records.map(record => {
                let assetUuid = record.asset_id || null;
                
                if (assetUuid) {
                    const matchingAsset = allAssets.find(asset => 
                        asset.asset_id === assetUuid || 
                        asset.id === assetUuid || 
                        asset.name === assetUuid
                    );
                    if (matchingAsset) assetUuid = matchingAsset.id;
                }

                return {
                    ...record,
                    asset_id: assetUuid
                };
            });

            setImportData(processedRecords);
            setModalState({ type: 'import' });
        } catch (err) {
            console.error('Error preparing import data:', err);
            setError('Failed to prepare import data.');
        }
    };

    const handleConfirmImport = async () => {
        if (importData.length === 0) return;

        try {
            setIsImporting(true);
            setTotalToImport(importData.length);
            setImportedCount(0);
            setImportErrors(0);
            setImportProgress(0);

            // Use bulk import for efficiency
            const result = await SupabaseService.bulkImportVulnerabilities(importData as VulnerabilityCreate[]);
            
            setImportedCount(importData.length);
            setImportProgress(100);

            await SupabaseService.logAllActivity({
                action: 'Bulk Imported Vulnerabilities',
                module: 'Governance',
                entity_id: null,
                entity_name: `${importData.length} vulnerabilities imported`,
                event_data: { count: importData.length }
            });

            fetchVulnerabilities();
            setModalState({ type: null });
            setImportData([]);
        } catch (err) {
            console.error('Import error:', err);
            setError('Failed to import vulnerabilities.');
        } finally {
            setIsImporting(false);
        }
    };



    const handleConfirmNewFields = async () => {
        try {
            await Promise.all(newFieldsToCreate.map(field => 
                SupabaseService.createCustomField('vulnerabilities', field)
            ));
            
            // Refresh custom fields definitions
            const fields = await SupabaseService.getCustomFields('vulnerabilities');
            setCustomFields(fields);
            
            // Clear confirmation state and proceed
            const data = [...pendingImportData];
            setNewFieldsToCreate([]);
            setPendingImportData([]);
            prepareImportData(data);
        } catch (err) {
            setError('Failed to create new custom fields.');
        }
    };

    

    return (

        <div>

            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">

                <div className="w-full sm:w-1/3">

                    <input

                        type="text"

                        placeholder="Filter vulnerabilities..."

                        value={filter}

                        onChange={e => setFilter(e.target.value)}

                        className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"

                        aria-label="Filter vulnerabilities"

                    />

                </div>

                <div className="flex space-x-2">

                    <input type="file" accept=".csv,.xlsx,.xls" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />

                    <button onClick={() => setShowAIChat(true)} title="AI Generate" className="p-2 text-gray-400 hover:text-indigo-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">

                        <BotIcon className="h-5 w-5" />

                    </button>

                    <button onClick={() => fileInputRef.current?.click()} title="Import CSV" className="p-2 text-gray-400 hover:text-green-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">

                        <UploadIcon className="h-5 w-5" />

                    </button>

                    <button onClick={handleExportCSV} title="Export CSV" className="p-2 text-gray-400 hover:text-purple-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">

                        <DownloadIcon className="h-5 w-5" />

                    </button>

                    <button onClick={() => setModalState({ type: 'add' })} title="Add Vulnerability" className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">

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

                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 w-16 px-2 py-3">

                                    <div className="flex items-center space-x-2">

                                        <input

                                            type="checkbox"

                                            checked={selectedIds.size === filteredAndSortedVulnerabilities.length && filteredAndSortedVulnerabilities.length > 0}

                                            onChange={() => toggleAll(filteredAndSortedVulnerabilities.map(i => i.id))}

                                            className="rounded border-gray-300 dark:border-gray-600 cursor-pointer"

                                        />

                                        <button onClick={() => setShowColumnManagement(true)} title="Manage Columns" className="p-1 text-gray-400 hover:text-purple-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">

                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">

                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />

                                            </svg>

                                        </button>

                                    </div>

                                </th>

                                 {columnOrder.map(colKey => {
                                    const customField = customFields.find(f => `custom_field_${f.field_name}` === colKey);
                                    const title = customField 
                                        ? customField.field_label
                                        : colKey === 'name' ? 'Name'
                                        : colKey === 'asset_id' ? 'Associated Asset'
                                        : colKey === 'derived_from' ? 'Source'
                                        : colKey === 'status' ? 'Status'
                                        : colKey;
                                    
                                    const hasDropdownFilter = ['derived_from', 'status'].includes(colKey);
                                    const hasCustomDropdown = customField && (customField.field_type === 'select' || customField.field_type === 'boolean');
                                    const shouldShowFilter = hasDropdownFilter || hasCustomDropdown;

                                    return (
                                        <th 
                                            scope="col" 
                                            key={colKey} 
                                            draggable={true}
                                            onDragStart={(e) => handleDragStart(e, colKey)}
                                            onDragEnd={handleDragEnd}
                                            onDragOver={(e) => handleDragOver(e, colKey)}
                                            onDrop={(e) => handleDrop(e, colKey)}
                                            className={`relative sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300 ${dragOverColumn === colKey ? 'border-l-4 border-l-blue-500' : ''}`}
                                        >
                                            <div className="flex items-center">
                                                <button 
                                                    onClick={(e) => {
                                                        if (shouldShowFilter) {
                                                            e.stopPropagation();
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            if (openFilterDropdown?.key === colKey) {
                                                                setOpenFilterDropdown(null);
                                                            } else {
                                                                setOpenFilterDropdown({ key: colKey, rect });
                                                            }
                                                        } else {
                                                            requestSort(colKey as keyof Vulnerability);
                                                        }
                                                    }} 
                                                    className={`flex items-center text-left focus:outline-none flex-grow ${columnFilters[colKey]?.length ? 'text-blue-600 font-semibold' : ''}`}
                                                >
                                                    {title}
                                                    {getSortIconFor(colKey as keyof Vulnerability)}
                                                </button>
                                            </div>
                                            {openFilterDropdown?.key === colKey && shouldShowFilter && (
                                                <FilterDropdown
                                                    columnKey={colKey}
                                                    items={vulnerabilities}
                                                    columnFilters={columnFilters}
                                                    setColumnFilters={setColumnFilters}
                                                    onClose={() => setOpenFilterDropdown(null)}
                                                    triggerRect={openFilterDropdown.rect}
                                                    sortConfig={sortConfig}
                                                    requestSort={requestSort as any}
                                                    hasFilter={shouldShowFilter}
                                                />
                                            )}
                                        </th>
                                    );
                                })}

                            </tr>

                        </thead>

                        <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">

                            {loading ? (

                                <tr><td colSpan={5} className="text-center py-4 text-gray-500 dark:text-gray-400">Loading vulnerabilities...</td></tr>

                            ) : paginatedVulnerabilities.length === 0 ? (

                                <tr><td colSpan={5} className="text-center py-4 text-gray-500 dark:text-gray-400">No vulnerabilities found.</td></tr>

                            ) : paginatedVulnerabilities.map(vuln => (

                                <tr

                                    key={vuln.id}

                                    onClick={() => !isEditing && setModalState({ type: 'view', vulnerability: vuln })}

                                    className={`cursor-pointer transition-colors ${

                                        selectedIds.has(vuln.id) ? 'bg-blue-50 dark:bg-blue-900/20' :

                                        'hover:bg-gray-50 dark:hover:bg-gray-800/50'

                                    } ${isEditing && !selectedIds.has(vuln.id) ? 'opacity-40 pointer-events-none' : ''}`}

                                >

                                    <td onClick={e => e.stopPropagation()} className="w-10 px-4 py-4">

                                        <input

                                            type="checkbox"

                                            checked={selectedIds.has(vuln.id)}

                                            onChange={() => toggle(vuln.id)}

                                            className="rounded border-gray-300 dark:border-gray-600 cursor-pointer"

                                        />

                                    </td>

                                    {columnOrder.map(colKey => {
                                        if (colKey === 'name') {
                                            return (
                                                <td key={colKey} className="px-6 py-4 whitespace-nowrap">
                                                    {isEditing && selectedIds.has(vuln.id) ? (
                                                        <input type="text" value={editValues[vuln.id]?.name ?? vuln.name} onChange={e => updateField(vuln.id, 'name', e.target.value)} className="w-full border border-blue-300 dark:border-blue-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                                    ) : (
                                                        <>
                                                            <div className="text-sm font-medium text-gray-900 dark:text-white">{vuln.name}</div>
                                                            <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">{vuln.description}</div>
                                                        </>
                                                    )}
                                                </td>
                                            );
                                        }
                                        if (colKey === 'asset_id') {
                                            return (
                                                <td key={colKey} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                    {vuln.assets ? `${vuln.assets.name} (${vuln.assets.asset_id})` : 'N/A'}
                                                </td>
                                            );
                                        }
                                        if (colKey === 'derived_from') {
                                            return (
                                                <td key={colKey} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                    {isEditing && selectedIds.has(vuln.id) ? (
                                                        <select value={editValues[vuln.id]?.derived_from ?? vuln.derived_from} onChange={e => updateField(vuln.id, 'derived_from', e.target.value as any)} className="border border-blue-300 dark:border-blue-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400"><option>KEV</option><option>Scanning</option><option>PT</option><option>Reported-Ext</option></select>
                                                    ) : vuln.derived_from}
                                                </td>
                                            );
                                        }
                                        if (colKey === 'status') {
                                            return (
                                                <td key={colKey} className="px-6 py-4 whitespace-nowrap">
                                                    {isEditing && selectedIds.has(vuln.id) ? (
                                                        <select value={editValues[vuln.id]?.status ?? vuln.status} onChange={e => updateField(vuln.id, 'status', e.target.value as any)} className="border border-blue-300 dark:border-blue-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400"><option>Planned</option><option>Remediated</option><option>NA</option></select>
                                                    ) : <StatusBadge status={vuln.status} colorMap={vulnerabilityStatusStyles} />}
                                                </td>
                                            );
                                        }
                                        if (colKey.startsWith('custom_field_')) {
                                            const fieldName = colKey.replace('custom_field_', '');
                                            const value = vuln.custom_fields?.[fieldName] || '-';
                                            return (
                                                <td key={colKey} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                    {isEditing && selectedIds.has(vuln.id) ? (
                                                        <input type="text" value={editValues[vuln.id]?.custom_fields?.[fieldName] ?? vuln.custom_fields?.[fieldName] ?? ''} onChange={e => updateField(vuln.id, `custom_fields.${fieldName}` as any, e.target.value)} className="w-full border border-blue-300 dark:border-blue-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                                    ) : value}
                                                </td>
                                            );
                                        }
                                        return null;
                                    })}

                                </tr>

                            ))}

                        </tbody>

                    </table>

                </div>

            </div>



            <VulnerabilityModal

                isOpen={modalState.type === 'add' || modalState.type === 'edit' || modalState.type === 'view'}

                onClose={closeModal}

                onSave={handleSaveVulnerability}

                vulnerabilityToEdit={modalState.vulnerability || null}

                mode={modalState.type as 'add' | 'edit' | 'view'}

                onEdit={() => { if (modalState.vulnerability) setModalState({ type: 'edit', vulnerability: modalState.vulnerability }); }}

                onDelete={() => { if (modalState.vulnerability) setModalState({ type: 'delete', vulnerability: modalState.vulnerability }); }}

                customFields={customFields}

            />

            <Modal
                isOpen={modalState.type === 'import'}
                onClose={closeModal}
                title="Confirm Import"
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        You are about to import <span className="font-bold text-gray-900 dark:text-white">{importData.length}</span> vulnerabilities.
                    </p>
                    <div className="max-h-60 overflow-auto border rounded-md">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-800">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Asset ID</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {importData.slice(0, 10).map((record, i) => (
                                    <tr key={i}>
                                        <td className="px-4 py-2 text-sm dark:text-gray-300">{record.name}</td>
                                        <td className="px-4 py-2 text-sm dark:text-gray-300 font-mono text-xs">{record.asset_id || 'N/A'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {importData.length > 10 && (
                            <div className="p-2 text-center text-xs text-gray-400">
                                ... and {importData.length - 10} more rows
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end space-x-3 mt-6">
                        <button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-600 dark:text-white dark:border-gray-500">Cancel</button>
                        <button onClick={handleConfirmImport} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">Confirm Import</button>
                    </div>
                </div>
            </Modal>

            <DeleteConfirmationModal isOpen={modalState.type === 'delete'} onClose={closeModal} onConfirm={handleDeleteVulnerability} itemName="vulnerability" />

            <AIChatModal

                isOpen={showAIChat}

                onClose={() => setShowAIChat(false)}

                module="vulnerabilities"

                onConfirm={handleAIChatConfirm}

            />

            <BulkProgressModal

                isOpen={bulkProgress.status !== 'idle'}

                title="Deleting Vulnerabilities"

                progress={bulkProgress}

                onClose={handleCloseBulkProgress}

            />

            <BulkProgressModal
                isOpen={isImporting}
                title="Importing Vulnerabilities"
                progress={{
                    total: totalToImport,
                    completed: importedCount - importErrors,
                    failed: importErrors,
                    status: isImporting ? 'processing' : 'idle'
                }}
                onClose={() => {}} 
            />

            

            {/* Pagination Controls */}

            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">

                <div className="flex items-center space-x-2">

                    <button

                        onClick={() => setCurrentPage(currentPage - 1)}

                        disabled={currentPage === 1}

                        className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-600 dark:text-white"

                    >

                        Previous

                    </button>

                    <div className="px-4 py-1 text-sm text-gray-700 dark:text-gray-300 bg-white border border-gray-300 rounded-md shadow-sm dark:bg-gray-800 dark:border-gray-600">

                        {currentPage} of {Math.ceil(filteredAndSortedVulnerabilities.length / itemsPerPage)}

                    </div>

                    <button

                        onClick={() => setCurrentPage(currentPage + 1)}

                        disabled={currentPage === Math.ceil(filteredAndSortedVulnerabilities.length / itemsPerPage)}

                        className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-600 dark:text-white"

                    >

                        Next

                    </button>

                </div>

                <div className="flex items-center space-x-2">

                    <span className="text-sm text-gray-700 dark:text-gray-300">

                        Items per page:

                    </span>

                    <select

                        value={itemsPerPage}

                        onChange={e => setItemsPerPage(Number(e.target.value))}

                        className="rounded-md border-gray-300 shadow-sm text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-white"

                    >

                        <option value={50}>50</option>

                        <option value={100}>100</option>

                        <option value={200}>200</option>

                        <option value={500}>500</option>

                    </select>

                </div>

            </div>

            <CustomFieldsManager

                isOpen={showColumnManagement}

                onClose={() => setShowColumnManagement(false)}

                onFieldChange={() => {

                    fetchCustomFields();

                    fetchVulnerabilities();

                }}

                moduleName="vulnerabilities"

            />

            <ImportConfirmationModal
                isOpen={newFieldsToCreate.length > 0}
                onClose={() => { setNewFieldsToCreate([]); setPendingImportData([]); }}
                onConfirm={handleConfirmNewFields}
                newFields={newFieldsToCreate}
                moduleName="Vulnerabilities"
            />

            <ImportMappingModal
                isOpen={modalState.type === 'mapping'}
                onClose={() => setModalState({ type: null })}
                onConfirm={handleConfirmMapping}
                headers={importHeaders}
                moduleName="Vulnerabilities"
                systemFields={SYSTEM_FIELDS_CONFIG.vulnerabilities}
                existingCustomFields={customFields}
            />

            {bulkProgress.status === 'idle' && (
                <SelectionActionBar
                    selectedCount={selectedIds.size}
                    isEditing={isEditing}
                    isConfirmingDelete={isConfirmingDelete}
                    isSaving={isSaving}
                    onEdit={() => startEdit(filteredAndSortedVulnerabilities.filter(v => selectedIds.has(v.id)), v => v.id)}
                    onSaveAll={handleSaveAll}
                    onCancelEdit={cancelEdit}
                    onDelete={() => setIsConfirmingDelete(true)}
                    onConfirmDelete={handleBulkDelete}
                    onCancelDelete={() => setIsConfirmingDelete(false)}
                    onClear={clearAll}
                />
            )}

        </div>

    );

};