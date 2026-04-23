import React, { useState, useEffect, useCallback, useRef, ChangeEvent, useMemo } from 'react';
import { createPortal } from 'react-dom';



import { Asset, AssetCreate, AssetUpdate, AssetCriticality, AssetGovernedStatus, AssetExposure, AssetCategory, AssetSource } from '../../types';

import { CustomField } from '../../services/supabase';



import * as SupabaseService from '../../services/supabase';

import { useUnifiedRefresh } from '../../hooks/useUnifiedRefresh';



import { EyeIcon, PencilIcon, TrashIcon, PlusIcon, UploadIcon, DownloadIcon, SortUpDownIcon, SortUpIcon, SortDownIcon, BotIcon, FilterIcon, FunnelIcon } from '../Icons';

import { parseCSVLine } from '../../utils/csvParser';
import { processImportData } from '../../utils/importUtils';
import { ImportConfirmationModal } from '../common/ImportConfirmationModal';
import { parseCSVText } from '../../utils/csvParser';



import { Modal } from '../common/Modal';



import { AIChatModal } from '../common/AIChatModal';



import { BulkProgressModal } from '../common/BulkProgressModal';



import CustomFieldsManager from '../common/CustomFieldsManager';

import CustomFieldsForm from '../common/CustomFieldsForm';



import { useTableSelection } from '../../hooks/useTableSelection';



import { SelectionActionBar } from '../common/SelectionActionBar';







interface AssetModalProps {



    isOpen: boolean;



    onClose: () => void;



    onSave: (asset: AssetCreate | AssetUpdate) => void;



    assetToEdit: Asset | null;



    mode: 'add' | 'edit' | 'view';



    onEdit?: () => void;



    onDelete?: () => void;



    customFields?: CustomField[];



    onShowColumnManagement?: () => void;



}







const MANDATORY_LABEL = <span className="text-red-500 ml-0.5">*</span>;



const AssetModal: React.FC<AssetModalProps> = ({ isOpen, onClose, onSave, assetToEdit, mode, onEdit, onDelete, customFields = [], onShowColumnManagement }) => {



    const [formData, setFormData] = useState<Partial<AssetCreate>>({});

    const [isSaving, setIsSaving] = useState(false);



    const isViewMode = mode === 'view';







    useEffect(() => {



        if (assetToEdit) {



            const { asset_id, name, asset_owner, business_unit, physical_location, criticality, details, governed_status, vulnerability_count, exposure, category, ip_address, mac_id, source } = assetToEdit;



            setFormData({ asset_id, name, asset_owner, business_unit, physical_location, criticality, details, governed_status, vulnerability_count, exposure, category, ip_address, mac_id, source });



        } else {



            // asset_id is intentionally omitted — DB trigger auto-generates it

            setFormData({ name: '', asset_owner: '', business_unit: '', physical_location: '', criticality: 'Low', category: 'Physical/Hardware', exposure: 'Internal', governed_status: 'Non-Governed', vulnerability_count: 0, details: '', ip_address: '', mac_id: '' });



        }



    }, [assetToEdit, isOpen, mode]);







    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {



        const { name, value } = e.target;



        const isNumeric = ['vulnerability_count'].includes(name);



        // Handle custom fields

        if (name.startsWith('custom_field_')) {

            const fieldName = name.replace('custom_field_', '');

            setFormData(prev => ({

                ...prev,

                custom_fields: {

                    ...(prev.custom_fields || {}),

                    [fieldName]: value

                }

            }));

        } else {

            setFormData(prev => ({ ...prev, [name]: isNumeric ? Number(value) : value }));

        }



    };







    const handleSubmit = async (e: React.FormEvent) => {



        e.preventDefault();



        setIsSaving(true);

        try {

            // Source is always 'Manual' when a human saves via the form

            // governed_status and nn_controls are auto-computed by DB triggers — strip them

            const { governed_status, nn_controls, ...payload } = formData as any;

            await onSave({ ...payload, source: 'Manual' } as AssetCreate | AssetUpdate);

        } finally {

            setIsSaving(false);

        }



    };







    const title = mode === 'add' ? 'Add New Asset' : mode === 'edit' ? 'Edit Asset' : 'View Asset';







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



                    {/* ── Mandatory fields ── */}

                    {/* Asset ID: auto-generated on create, read-only on edit/view */}

                    {mode !== 'add' && (

                        <div>

                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Asset ID</label>

                            <div className="mt-1 px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-600 text-sm font-mono text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-500 flex items-center gap-2">

                                {formData.asset_id}

                                <span className="text-xs text-gray-400 dark:text-gray-500 font-sans">(auto-generated)</span>

                            </div>

                        </div>

                    )}



                    <div>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Asset Name {MANDATORY_LABEL}</label>

                        <input type="text" name="name" value={formData.name || ''} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />

                    </div>



                    <div>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Classification {MANDATORY_LABEL}</label>

                        <select name="criticality" value={formData.criticality} onChange={handleChange} disabled={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">

                            <option>Low</option><option>Medium</option><option>High</option>

                        </select>

                    </div>



                    <div>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Type {MANDATORY_LABEL}</label>

                        <select name="category" value={formData.category} onChange={handleChange} disabled={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">

                            <option value="Physical/Hardware">Physical/Hardware</option>

                            <option value="Software">Software</option>

                            <option value="Services/Infra">Services/Infra</option>

                            <option value="Information">Information</option>

                        </select>

                    </div>



                    <div>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Owner {MANDATORY_LABEL}</label>

                        <input type="text" name="asset_owner" value={formData.asset_owner || ''} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />

                    </div>



                    <div>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit {MANDATORY_LABEL}</label>

                        <input type="text" name="business_unit" value={formData.business_unit || ''} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />

                    </div>



                    <div>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">IP Address {MANDATORY_LABEL}</label>

                        <input type="text" name="ip_address" value={formData.ip_address || ''} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="e.g., 192.168.1.1" />

                    </div>



                    <div>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">UID / Mac ID {MANDATORY_LABEL}</label>

                        <input type="text" name="mac_id" value={formData.mac_id || ''} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="e.g., 00:1A:2B:3C:4D:5E" />

                    </div>



                    <div className="md:col-span-2">

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Asset Description {MANDATORY_LABEL}</label>

                        <textarea name="details" value={formData.details || ''} onChange={handleChange} readOnly={isViewMode} rows={3} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"></textarea>

                    </div>



                    {/* ── Optional fields ── */}

                    <div>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Physical Location</label>

                        <input type="text" name="physical_location" value={formData.physical_location || ''} onChange={handleChange} readOnly={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="e.g., Server Room A, Building 2" />

                    </div>



                    <div>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Exposure</label>

                        <select name="exposure" value={formData.exposure} onChange={handleChange} disabled={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">

                            <option>Internal</option><option>External</option><option>DMZ</option>

                        </select>

                    </div>



                    <div>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Governed Status</label>

                        <div className={`mt-1 px-3 py-2 rounded-md text-sm font-medium border ${

                            formData.governed_status === 'Governed'

                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800'

                                : 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600'

                        }`}>

                            {formData.governed_status || 'Non-Governed'}

                            <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">(auto-computed)</span>

                        </div>

                    </div>



                    <div>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Vulnerability Count</label>

                        <input type="number" name="vulnerability_count" value={formData.vulnerability_count || 0} onChange={handleChange} readOnly={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />

                    </div>



                    {/* Source: read-only, auto-set by system */}

                    {(isViewMode || mode === 'edit') && formData.source && (

                        <div>

                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Source</label>

                            <div className="mt-1 px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-600 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-500">

                                {formData.source}

                            </div>

                        </div>

                    )}



                    {/* NN Controls: read-only, auto-assigned by DB trigger */}

                    {assetToEdit?.nn_controls && assetToEdit.nn_controls.length > 0 && (

                        <div className="md:col-span-2">

                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">

                                NN Controls

                                <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">({assetToEdit.nn_controls.length} assigned)</span>

                            </label>

                            <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 p-2">

                                <div className="flex flex-wrap gap-1.5">

                                    {assetToEdit.nn_controls.map(c => (

                                        <span key={c.ctl_id} className="inline-flex items-center px-2 py-1 rounded text-xs font-mono bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800" title={c.ctl_name}>

                                            {c.ctl_id}

                                        </span>

                                    ))}

                                </div>

                            </div>

                        </div>

                    )}



                    {/* Custom Fields Section */}

                    {!isViewMode && (

                        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">

                            <div className="flex justify-between items-center mb-4">

                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Custom Fields</h3>

                                <button

                                    type="button"

                                    onClick={() => onShowColumnManagement?.()}

                                    className="px-3 py-1 text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 border border-purple-300 dark:border-purple-600 rounded-md hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"

                                >

                                    Manage Columns

                                </button>

                            </div>

                            

                            {/* Display existing custom fields for this asset */}

                            {customFields.length > 0 ? (

                                <CustomFieldsForm

                                    customFields={customFields}

                                    values={formData.custom_fields || {}}

                                    onChange={(fieldName, value) => {

                                        setFormData(prev => ({

                                            ...prev,

                                            custom_fields: {

                                                ...(prev.custom_fields || {}),

                                                [fieldName]: value

                                            }

                                        }));

                                    }}

                                    readonly={isViewMode}

                                />

                            ) : (

                                <div className="text-center py-8 text-gray-500 dark:text-gray-400">

                                    <p className="mb-2">No custom fields defined yet.</p>

                                    <button

                                        type="button"

                                        onClick={() => onShowColumnManagement?.()}

                                        className="text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 underline"

                                    >

                                        Add your first custom column

                                    </button>

                                </div>

                            )}

                        </div>

                    )}



                </div>



                 {!isViewMode && (



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







// Helper function to display source

const displaySource = (source: string | null | undefined): string => {

    const sourceStr = source || '';

    // Legacy normalisation for records created before source tracking was standardised

    if (sourceStr.toLowerCase().includes('csv') || sourceStr.toLowerCase().includes('import') || sourceStr.toLowerCase().includes('export')) {

        return 'File Upload';

    }

    if (sourceStr === '-' || sourceStr.trim() === '') {

        return 'Manual';

    }

    if (sourceStr.toLowerCase().includes('ai generated')) {

        return 'AI';

    }

    return sourceStr; // Will show 'Manual', etc.

};



const FilterDropdown = ({ columnKey, items, columnFilters, setColumnFilters, onClose, triggerRect }: any) => {
    // get unique values for columnKey
    const uniqueValues = useMemo(() => {
        const values = new Set<string>();
        items.forEach((item: any) => {
             let val;
             if (columnKey.startsWith('custom_field_')) {
                 val = item.custom_fields?.[columnKey.replace('custom_field_', '')];
             } else {
                 val = item[columnKey];
             }
             values.add(val !== undefined && val !== null && val !== "" ? String(val) : '-');
        });
        return Array.from(values).sort((a, b) => a.localeCompare(b));
    }, [items, columnKey]);

    const [localSelectedValues, setLocalSelectedValues] = useState<string[]>(columnFilters[columnKey] || []);

    const handleToggle = (val: string) => {
        if (localSelectedValues.includes(val)) {
            setLocalSelectedValues(prev => prev.filter(v => v !== val));
        } else {
            setLocalSelectedValues(prev => [...prev, val]);
        }
    };

    const handleClear = () => {
        setColumnFilters((prev: any) => {
            const next = { ...prev };
            delete next[columnKey];
            return next;
        });
        onClose();
    };

    const handleSave = () => {
        setColumnFilters((prev: any) => {
            if (localSelectedValues.length === 0) {
                const next = { ...prev };
                delete next[columnKey];
                return next;
            }
            return { ...prev, [columnKey]: localSelectedValues };
        });
        onClose();
    };

    const style: React.CSSProperties = {
        position: 'fixed',
        zIndex: 9999,
        top: triggerRect ? triggerRect.bottom + 4 : 0,
        left: triggerRect ? triggerRect.left : 0,
    };

    return createPortal(
        <div style={style} className="FilterDropdownCore w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg p-3" onClick={e => e.stopPropagation()}>
            <div className="mb-3 max-h-48 overflow-y-auto space-y-2">
                {uniqueValues.map(val => (
                    <label key={val} className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer p-1 hover:bg-gray-50 dark:hover:bg-gray-700 rounded">
                        <input
                            type="checkbox"
                            checked={localSelectedValues.includes(val)}
                            onChange={() => handleToggle(val)}
                            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700"
                        />
                        <span className="truncate">{val}</span>
                    </label>
                ))}
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex items-center justify-between">
                <button
                    onClick={handleClear}
                    disabled={!columnFilters[columnKey]?.length && localSelectedValues.length === 0}
                    className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                    Clear Filter
                </button>
                <div className="flex space-x-2">
                    <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
                        Cancel
                    </button>
                    <button onClick={handleSave} className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded">
                        Save
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export const AssetsView: React.FC<{ isActive?: boolean }> = ({ isActive = true }) => {



    const [assets, setAssets] = useState<Asset[]>([]);



    const [relationships, setRelationships] = useState<any[]>([]);



    const [loading, setLoading] = useState(true);



    const [deleting, setDeleting] = useState(false);



    const [error, setError] = useState<string|null>(null);



    const [modalState, setModalState] = useState<{ type: 'add' | 'edit' | 'view' | 'delete' | 'import' | null; asset?: Asset | null }>({ type: null });



    const fileInputRef = useRef<HTMLInputElement>(null);



    const [filter, setFilter] = useState('');



    const [sortConfig, setSortConfig] = useState<{ key: keyof Asset; direction: 'ascending' | 'descending' } | null>(null);

    const [currentPage, setCurrentPage] = useState(1);

    const [itemsPerPage, setItemsPerPage] = useState(100);



    const [importData, setImportData] = useState<{ newAssets: AssetCreate[]; updatedAssets: { id: string; updates: AssetUpdate }[]; unchangedAssets: Asset[]; duplicates: string[] }>({ newAssets: [], updatedAssets: [], unchangedAssets: [], duplicates: [] });

    const [newFieldsToCreate, setNewFieldsToCreate] = useState<any[]>([]);

    const [pendingImportData, setPendingImportData] = useState<any[]>([]);



    const [showAIChat, setShowAIChat] = useState(false);



    // Custom fields state - simplified for JSONB approach

    const [customFields, setCustomFields] = useState<CustomField[]>([]);

    const [showColumnManagement, setShowColumnManagement] = useState(false);

    const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
    const [openFilterDropdown, setOpenFilterDropdown] = useState<{key: string, rect: DOMRect} | null>(null);

    // Column Drag and Drop state
    const [columnOrder, setColumnOrder] = useState<string[]>([]);
    const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
    const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

    // Default column order
    const defaultColumns = useMemo(() => [
        'asset_id',
        'name',
        'criticality',
        'business_unit',
        'governed_status',
        'nn_controls',
        'source'
    ], []);

    // Initialize column order from localStorage or defaults
    useEffect(() => {
        const savedOrder = localStorage.getItem('assets_column_order');
        const customFieldKeys = customFields.map(f => `custom_field_${f.field_name}`);
        
        if (savedOrder) {
            try {
                const parsed = JSON.parse(savedOrder);
                // Merge saved order with any new custom fields
                const combinedOrder = [...parsed];
                
                // Add any missing default columns
                defaultColumns.forEach(col => {
                    if (!combinedOrder.includes(col)) combinedOrder.push(col);
                });

                // Add any missing custom fields
                customFieldKeys.forEach(col => {
                    if (!combinedOrder.includes(col)) combinedOrder.push(col);
                });

                // Remove any columns that no longer exist (except defaults)
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
            localStorage.setItem('assets_column_order', JSON.stringify(columnOrder));
        }
    }, [columnOrder]);

    const handleDragStart = (e: React.DragEvent, columnKey: string) => {
        setDraggedColumn(columnKey);
        e.dataTransfer.setData('text/plain', columnKey);
        e.dataTransfer.effectAllowed = 'move';
        
        // Add a ghost image or just styling
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
            
            // Swap columns
            newOrder.splice(draggedIndex, 1);
            newOrder.splice(targetIndex, 0, draggedColumn);
            
            return newOrder;
        });

        setDraggedColumn(null);
        setDragOverColumn(null);
    };


    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (openFilterDropdown) {
                 const target = event.target as HTMLElement;
                 if (!target.closest('.FilterDropdownCore') && !target.closest('.FilterTriggerBtn')) {
                     setOpenFilterDropdown(null);
                 }
            }
        }
        function handleScroll(event: Event) {
             const target = event.target as HTMLElement;
             if (!target.closest('.FilterDropdownCore')) {
                  setOpenFilterDropdown(null);
             }
        }
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("scroll", handleScroll, true);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("scroll", handleScroll, true);
        };
    }, [openFilterDropdown]);



    // Import progress states

    const [isImporting, setIsImporting] = useState(false);

    const [importProgress, setImportProgress] = useState(0);

    const [totalToImport, setTotalToImport] = useState(0);

    const [importedCount, setImportedCount] = useState(0);

    const [importErrors, setImportErrors] = useState(0);



    const {

        selectedIds, 

        isEditing, 

        editValues, 

        isConfirmingDelete, 

        isSaving, 

        bulkProgress,



        setIsConfirmingDelete, 

        setIsSaving, 

        startBulkOperation, 

        incrementBulkProgress, 

        finishBulkOperation, 

        resetBulkProgress,



        toggle, 

        toggleAll, 

        clearAll, 

        startEdit, 

        updateField, 

        cancelEdit,

    } = useTableSelection<Asset>();



    const fetchCustomFields = useCallback(async () => {

        try {

            const fields = await SupabaseService.getCustomFields('assets');

            setCustomFields(fields);

        } catch (e) {

            console.error('Failed to load custom fields:', e);

        }

    }, []);



    const fetchAssets = useCallback(async () => {

        try {

            setError(null);



            const [assetsData, relationshipsData] = await Promise.all([

                SupabaseService.getAssets(),

                SupabaseService.getAssetRelationships(),

            ]);



            setAssets(assetsData);

            setRelationships(relationshipsData);

            

            // Also fetch custom fields

            await fetchCustomFields();



        } catch (e) {

            setError("Failed to load assets.");

        } finally {

            setLoading(false);

        }

    }, [fetchCustomFields]);



    useUnifiedRefresh(isActive, fetchAssets);

    // Reset to page 1 when filter changes or items per page changes
    useEffect(() => {
        setCurrentPage(1);
    }, [filter, itemsPerPage]);



    const filteredAndSortedAssets = useMemo(() => {



        let filteredItems = [...assets];

        Object.entries(columnFilters).forEach(([key, selectedValues]) => {
            if (selectedValues && selectedValues.length > 0) {
                filteredItems = filteredItems.filter(item => {
                    let val;
                    if (key.startsWith('custom_field_')) {
                        val = item.custom_fields?.[key.replace('custom_field_', '')];
                    } else {
                        val = item[key as keyof Asset];
                    }
                    val = val !== undefined && val !== null && val !== "" ? String(val) : '-';
                    return selectedValues.includes(val);
                });
            }
        });

        if (filter) {



            const lowerCaseFilter = filter.toLowerCase();



            filteredItems = filteredItems.filter(item =>



                String(item.asset_id ?? '').toLowerCase().includes(lowerCaseFilter) ||



                String(item.name ?? '').toLowerCase().includes(lowerCaseFilter) ||



                String(item.asset_owner ?? '').toLowerCase().includes(lowerCaseFilter) ||



                String(item.business_unit ?? '').toLowerCase().includes(lowerCaseFilter) ||



                String(item.ip_address ?? '').toLowerCase().includes(lowerCaseFilter) ||



                String(item.mac_id ?? '').toLowerCase().includes(lowerCaseFilter) ||



                String(item.physical_location ?? '').toLowerCase().includes(lowerCaseFilter) ||



                String(item.source ?? '').toLowerCase().includes(lowerCaseFilter) ||



                String(item.details ?? '').toLowerCase().includes(lowerCaseFilter)



            );



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



    }, [assets, filter, sortConfig, columnFilters]);

    // Pagination: Get current page items

    const startIndex = (currentPage - 1) * itemsPerPage;

    const endIndex = startIndex + itemsPerPage;

    const paginatedAssets = filteredAndSortedAssets.slice(startIndex, endIndex);







    const renderFilterableHeader = (columnKey: string, title: string) => {
        // Check if field has dropdown filter
        const hasDropdownFilter = ['criticality', 'category', 'exposure'].includes(columnKey);
        
        // Check if custom field has select or boolean type
        const isCustomField = columnKey.startsWith('custom_field_');
        const customFieldName = columnKey.replace('custom_field_', '');
        const customField = customFields.find(f => f.field_name === customFieldName);
        const hasCustomDropdown = customField && (customField.field_type === 'select' || customField.field_type === 'boolean');
        
        const shouldShowFilter = hasDropdownFilter || hasCustomDropdown;
        
        return (
            <th 
                scope="col" 
                key={columnKey} 
                draggable={true}
                onDragStart={(e) => handleDragStart(e, columnKey)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, columnKey)}
                onDrop={(e) => handleDrop(e, columnKey)}
                className={`relative sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300 ${dragOverColumn === columnKey ? 'border-l-4 border-l-blue-500' : ''}`}
            >
                <div className="flex items-center">
                    {columnKey !== 'nn_controls' ? (
                        <button onClick={() => requestSort(columnKey as keyof Asset)} className="flex items-center text-left focus:outline-none flex-grow">
                            {title}
                            {getSortIconFor(columnKey as keyof Asset)}
                        </button>
                    ) : (
                        <span className="flex items-center text-left flex-grow">{title}</span>
                    )}
                    {shouldShowFilter && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                if (openFilterDropdown?.key === columnKey) {
                                    setOpenFilterDropdown(null);
                                } else {
                                    setOpenFilterDropdown({ key: columnKey, rect });
                                }
                            }}
                            className={`ml-1 p-0.5 rounded transition-colors ${columnFilters[columnKey]?.length ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                            title="Filter"
                        >
                            <FunnelIcon className="h-3 w-3" />
                        </button>
                    )}
                </div>
                {openFilterDropdown?.key === columnKey && shouldShowFilter && (
                    <FilterDropdown
                        columnKey={columnKey}
                        items={assets}
                        columnFilters={columnFilters}
                        setColumnFilters={setColumnFilters}
                        onClose={() => setOpenFilterDropdown(null)}
                        triggerRect={openFilterDropdown.rect}
                    />
                )}
            </th>
        );
    };


    const requestSort = (key: keyof Asset) => {



        let direction: 'ascending' | 'descending' = 'ascending';



        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {



            direction = 'descending';



        }



        setSortConfig({ key, direction });



    };







    const getSortIconFor = (key: keyof Asset) => {



        if (!sortConfig || sortConfig.key !== key) {



            return <SortUpDownIcon className="h-4 w-4 ml-1 text-gray-400" />;



        }



        return sortConfig.direction === 'ascending' ? <SortUpIcon className="h-4 w-4 ml-1" /> : <SortDownIcon className="h-4 w-4 ml-1" />;



    };







    const closeModal = () => {



        setError(null);



        setModalState({ type: null });



    };







    const handleSaveAsset = async (formData: AssetCreate | AssetUpdate) => {



        try {



            if (modalState.type === 'edit' && modalState.asset) {



                const updatedAsset = await SupabaseService.updateAsset(modalState.asset.id, formData);



                await SupabaseService.logAllActivity({



                    action: 'Updated Asset',



                    module: 'Governance',



                    entity_id: updatedAsset.id,



                    entity_name: updatedAsset.name,



                    event_data: { changes: formData }



                });



            } else if (modalState.type === 'add') {



                const addedAsset = await SupabaseService.addAsset(formData as AssetCreate);



                await SupabaseService.logAllActivity({



                    action: 'Created Asset',



                    module: 'Governance',



                    entity_id: addedAsset.id,



                    entity_name: addedAsset.name,



                    event_data: { details: formData }



                });



            }



            fetchAssets();



            closeModal();



        } catch (err) {



            setError('Failed to save asset.');



        }



    };







    const handleDeleteAsset = async () => {



        if (modalState.type === 'delete' && modalState.asset) {



            try {



                setDeleting(true);



                setError(null);



                console.log('Deleting asset:', modalState.asset.id, modalState.asset.asset_id);



                await SupabaseService.deleteAsset(modalState.asset.id);



                await SupabaseService.logAllActivity({



                    action: 'Deleted Asset',



                    module: 'Governance',



                    entity_id: modalState.asset.id,



                    entity_name: modalState.asset.name



                });



                fetchAssets();



                closeModal();



            } catch (err: any) {



                console.error('Delete asset error:', err);



                const errorMessage = err?.message || 'Failed to delete asset.';



                setError(errorMessage);



            } finally {



                setDeleting(false);



            }



        }



    };







    const handleBulkDelete = async () => {

        setIsConfirmingDelete(false);

        startBulkOperation(selectedIds.size);

        

        try {

            // Use bulk deletion for efficiency with 1000+ records

            await SupabaseService.deleteAssetsBulk(Array.from(selectedIds) as string[]);

            

            // Mark all as successful since bulk operation either succeeds or fails entirely

            for (let i = 0; i < selectedIds.size; i++) {

                incrementBulkProgress(true);

            }

            

            finishBulkOperation(false);

            
            // Log the bulk delete activity
            await SupabaseService.logAllActivity({
                action: 'Bulk Deleted Assets',
                module: 'Governance',
                entity_id: null,
                entity_name: `${selectedIds.size} assets deleted`,
                event_data: { count: selectedIds.size }
            });

            // Refresh data after successful deletion

            fetchAssets();

        } catch (err) {

            console.error('Failed to bulk delete assets', err);

            

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







    const handleSaveAll = async () => {



        try {



            setIsSaving(true);



            for (const [id, changes] of Object.entries(editValues)) {



                await SupabaseService.updateAsset(id, { ...(changes as AssetUpdate), source: 'Manual' });



            }



            cancelEdit();



            fetchAssets();



        } catch (err) {



            setError('Failed to save changes.');



        } finally {



            setIsSaving(false);



        }



    };







    const handleAIChatConfirm = async (records: Record<string, unknown>[]) => {



        try {



            for (const record of records) {



                const assetData: AssetCreate = {



                    // asset_id is optional — DB trigger auto-generates if not provided

                    ...(record.asset_id ? { asset_id: String(record.asset_id) } : {}),



                    name: String(record.name || ''),



                    source: 'AI',



                    asset_owner: String(record.asset_owner || ''),



                    business_unit: String(record.business_unit || ''),



                    physical_location: String(record.physical_location || ''),



                    ip_address: String(record.ip_address || ''),



                    mac_id: String(record.mac_id || ''),



                    criticality: (record.criticality as AssetCriticality) || 'Low',



                    category: (record.category as AssetCategory) || 'Physical/Hardware',



                    exposure: (record.exposure as AssetExposure) || 'Internal',



                    governed_status: (record.governed_status as AssetGovernedStatus) || 'Non-Governed',



                    vulnerability_count: Number(record.vulnerability_count || 0),



                    details: String(record.details || ''),



                } as AssetCreate;



                await SupabaseService.addAsset(assetData);



            }



            await SupabaseService.logAllActivity({



                action: 'Bulk Created Assets via AI',



                module: 'Governance',



                entity_id: null,



                entity_name: `${records.length} assets created via AI`,



                event_data: { count: records.length, records }



            });



            fetchAssets();



        } catch (err) {



            setError('Failed to save AI-generated assets.');



        }



    };







    const getRelatedAssetsForAsset = (asset: Asset) => {



        const relatedAssets: string[] = [];







        // Find all relationships where this asset is involved as source or target



        const assetRelationships = relationships.filter(r =>



            r.source_asset_id === asset.asset_id || r.target_asset_id === asset.asset_id



        );







        // Collect unique related asset names



        assetRelationships.forEach(r => {
            if (r.source_asset_id !== asset.asset_id && !relatedAssets.includes(r.source_asset_id)) {
                relatedAssets.push(r.source_asset_id);
            }
            if (r.target_asset_id !== asset.asset_id && !relatedAssets.includes(r.target_asset_id)) {
                relatedAssets.push(r.target_asset_id);
            }
        });
        return relatedAssets;
    };

    const handleExportCSV = () => {
        // Build headers with custom fields
        const baseHeaders = ['asset_id', 'name', 'criticality', 'details', 'governed_status', 'vulnerability_count', 'exposure', 'category', 'asset_owner', 'business_unit', 'physical_location', 'ip_address', 'mac_id', 'source'];
        const customFieldHeaders = customFields.map(field => field.field_label);
        const headers = [...baseHeaders, ...customFieldHeaders];

        const csvContent = [

            headers.join(','),

            ...filteredAndSortedAssets.map(asset => {

                // Base asset data
                const baseData = [
                    asset.asset_id,
                    `"${(asset.name || '').replace(/"/g, '""')}"`,
                    asset.criticality || '',
                    `"${(asset.details || '').replace(/"/g, '""')}"`,
                    asset.governed_status || '',
                    asset.vulnerability_count || 0,
                    asset.exposure || '',
                    asset.category || '',
                    asset.asset_owner || '',
                    asset.business_unit || '',
                    asset.physical_location || '',
                    asset.ip_address || '',
                    asset.mac_id || '',
                    asset.source || ''
                ];

                // Custom fields data
                const customFieldsData = customFields.map(field => {
                    const value = asset.custom_fields?.[field.field_name] || '';
                    return `"${String(value).replace(/"/g, '""')}"`;
                });

                return [...baseData, ...customFieldsData].join(',');
            })
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'assets.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const prepareImportData = (records: any[]) => {
        // Define valid asset categories
        const validCategories = ['Physical/Hardware', 'Software', 'Services/Infra', 'Information'];
        
        // Function to normalize category values
        const normalizeCategory = (category: string): string => {
            if (!category) return 'Information'; // Default category
            
            const normalized = category.trim();
            
            // Exact match
            if (validCategories.includes(normalized)) {
                return normalized;
            }
            
            // Case-insensitive matching
            const lowerNormalized = normalized.toLowerCase();
            for (const validCat of validCategories) {
                if (validCat.toLowerCase() === lowerNormalized) {
                    return validCat;
                }
            }
            
            // Partial matching for common variations
            if (lowerNormalized.includes('physical') || lowerNormalized.includes('hardware')) {
                return 'Physical/Hardware';
            }
            if (lowerNormalized.includes('software') || lowerNormalized.includes('app')) {
                return 'Software';
            }
            if (lowerNormalized.includes('service') || lowerNormalized.includes('infra') || lowerNormalized.includes('infrastructure')) {
                return 'Services/Infra';
            }
            if (lowerNormalized.includes('info') || lowerNormalized.includes('data')) {
                return 'Information';
            }
            
            // Default fallback
            return 'Information';
        };
        
        const newAssets: AssetCreate[] = [];
        const updatedAssets: { id: string; updates: AssetUpdate }[] = [];
        
        records.forEach(record => {
            // Normalize category to prevent constraint violations
            const normalizedRecord = {
                ...record,
                category: normalizeCategory(record.category || '')
            };
            
            const existing = assets.find(a => a.asset_id === record.asset_id);
            if (existing) {
                updatedAssets.push({ id: existing.id, updates: normalizedRecord });
            } else {
                newAssets.push(normalizedRecord);
            }
        });

        setImportData({ newAssets, updatedAssets, unchangedAssets: [], duplicates: [] });
        setModalState({ type: 'import' });
    };

    const handleImportCSV = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const text = e.target?.result as string;
                const parsedData = parseCSVText(text);
                const { records, newFields } = processImportData('assets', parsedData.headers, parsedData.rows, customFields);
                
                // Store new fields to be created
                setNewFieldsToCreate(newFields);
                
                // Prepare import data
                prepareImportData(records);
            } catch (err) {
                setError('Failed to import CSV. Please check the file format.');
            }
        };
        reader.readAsText(file);
    };

    const editInputCls = "w-full border border-blue-300 dark:border-blue-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400";
    const editSelectCls = "border border-blue-300 dark:border-blue-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-4";

    const handleConfirmImport = async () => {
        try {
            setIsImporting(true);
            
            // First, create any new custom fields
            if (newFieldsToCreate.length > 0) {
                for (const field of newFieldsToCreate) {
                    await SupabaseService.createCustomField('assets', field);
                }
                // Refresh custom fields after creating new ones
                await fetchCustomFields();
            }
            
            const total = importData.newAssets.length + importData.updatedAssets.length;
            setTotalToImport(total);
            setImportedCount(0);
            
            // Use bulk import for new assets
            if (importData.newAssets.length > 0) {
                await SupabaseService.bulkAddAssets(importData.newAssets);
                setImportedCount(importData.newAssets.length);
            }

            // Handle updates individually (bulk update not available)
            for (const { id, updates } of importData.updatedAssets) {
                await SupabaseService.updateAsset(id, updates);
                setImportedCount(prev => prev + 1);
            }

            fetchAssets();
            setModalState({ type: null });
        } catch (err) {
            setError('Failed to complete import.');
        } finally {
            setIsImporting(false);
        }
    };

    
    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                <div className="w-full sm:w-1/3">
                    <input
                        type="text"
                        placeholder="Filter assets..."
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                </div>
                <div className="flex space-x-2">
                    <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />
                    <button onClick={() => setShowAIChat(true)} title="AI Generate" className="p-2 text-gray-400 hover:text-indigo-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        <BotIcon className="h-5 w-5" />
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} title="Import CSV" className="p-2 text-gray-400 hover:text-green-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        <UploadIcon className="h-5 w-5" />
                    </button>
                    <button onClick={handleExportCSV} title="Export CSV" className="p-2 text-gray-400 hover:text-purple-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        <DownloadIcon className="h-5 w-5" />
                    </button>
                    <button onClick={() => setModalState({ type: 'add' })} title="Add Asset" className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
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
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 w-16 px-4 py-3">
                                    <div className="flex items-center space-x-2">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.size === filteredAndSortedAssets.length && filteredAndSortedAssets.length > 0}
                                            onChange={() => toggleAll(filteredAndSortedAssets.map(i => i.id))}
                                            className="rounded border-gray-300 dark:border-gray-600 cursor-pointer"
                                            title={`Select All ${filteredAndSortedAssets.length} Assets (All Pages)`}
                                        />
                                        <button onClick={() => setShowColumnManagement(true)} title="Manage Columns" className="p-1 text-gray-400 hover:text-purple-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors">
                                            <PlusIcon className="h-4 w-4" />
                                        </button>
                                    </div>
                                </th>
                                {columnOrder.map(colKey => {
                                    const customField = customFields.find(f => `custom_field_${f.field_name}` === colKey);
                                    const title = customField 
                                        ? customField.field_label + (customField.is_required ? " *" : "")
                                        : colKey === 'asset_id' ? 'Asset ID'
                                        : colKey === 'name' ? 'Name'
                                        : colKey === 'criticality' ? 'Criticality'
                                        : colKey === 'business_unit' ? 'Business Unit'
                                        : colKey === 'governed_status' ? 'Governed'
                                        : colKey === 'nn_controls' ? 'NN Controls'
                                        : colKey === 'source' ? 'Source'
                                        : colKey;
                                    return renderFilterableHeader(colKey, title);
                                })}



                            </tr>



                        </thead>



                         <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">



                            {loading ? (



                                <tr><td colSpan={8} className="text-center py-4 text-gray-500 dark:text-gray-400">Loading assets...</td></tr>



                            ) : filteredAndSortedAssets.length === 0 ? (



                                <tr><td colSpan={8} className="text-center py-4 text-gray-500 dark:text-gray-400">No assets found.</td></tr>



                            ) : paginatedAssets.map(asset => (



                                <tr



                                    key={asset.id}



                                    onClick={() => !isEditing && setModalState({ type: 'view', asset })}



                                    className={`cursor-pointer transition-colors ${



                                        selectedIds.has(asset.id) ? 'bg-blue-50 dark:bg-blue-900/20' :



                                        'hover:bg-gray-50 dark:hover:bg-gray-800/50'



                                    } ${isEditing && !selectedIds.has(asset.id) ? 'opacity-40 pointer-events-none' : ''}`}



                                >



                                    <td onClick={e => e.stopPropagation()} className="w-10 px-4 py-4">



                                        <input



                                            type="checkbox"



                                            checked={selectedIds.has(asset.id)}



                                            onChange={() => toggle(asset.id)}



                                            className="rounded border-gray-300 dark:border-gray-600 cursor-pointer"



                                        />



                                    </td>



                                    {columnOrder.map(colKey => {
                                        if (colKey === 'asset_id') {
                                            return (
                                                <td key={colKey} className="px-6 py-4 whitespace-nowrap text-sm font-mono font-semibold">
                                                    <span className={asset.governed_status === 'Governed' ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400'}>
                                                        {asset.asset_id}
                                                    </span>
                                                </td>
                                            );
                                        }
                                        if (colKey === 'name') {
                                            return (
                                                <td key={colKey} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                                    {isEditing && selectedIds.has(asset.id) ? (
                                                        <input type="text" value={editValues[asset.id]?.name ?? asset.name} onChange={e => updateField(asset.id, 'name', e.target.value)} className={editInputCls} />
                                                    ) : asset.name}
                                                </td>
                                            );
                                        }
                                        if (colKey === 'criticality') {
                                            return (
                                                <td key={colKey} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                    {isEditing && selectedIds.has(asset.id) ? (
                                                        <select value={editValues[asset.id]?.criticality ?? asset.criticality} onChange={e => updateField(asset.id, 'criticality', e.target.value as any)} className={editSelectCls}><option>Low</option><option>Medium</option><option>High</option></select>
                                                    ) : asset.criticality}
                                                </td>
                                            );
                                        }
                                        if (colKey === 'business_unit') {
                                            return (
                                                <td key={colKey} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                    {isEditing && selectedIds.has(asset.id) ? (
                                                        <input type="text" value={editValues[asset.id]?.business_unit ?? asset.business_unit ?? ''} onChange={e => updateField(asset.id, 'business_unit', e.target.value)} className={editInputCls} />
                                                    ) : (asset.business_unit || '-')}
                                                </td>
                                            );
                                        }
                                        if (colKey === 'governed_status') {
                                            return (
                                                <td key={colKey} className="px-6 py-4 whitespace-nowrap text-sm">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                        asset.governed_status === 'Governed'
                                                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                                                    }`}>
                                                        {asset.governed_status}
                                                    </span>
                                                </td>
                                            );
                                        }
                                        if (colKey === 'nn_controls') {
                                            return (
                                                <td key={colKey} className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                                    {asset.nn_controls && asset.nn_controls.length > 0 ? (
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                                                {asset.nn_controls.length}
                                                            </span>
                                                            <span className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[120px]" title={asset.nn_controls.map(c => c.ctl_id).join(', ')}>
                                                                controls
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
                                                    )}
                                                </td>
                                            );
                                        }
                                        if (colKey === 'source') {
                                            return (
                                                <td key={colKey} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                    {displaySource(asset.source)}
                                                </td>
                                            );
                                        }
                                        if (colKey.startsWith('custom_field_')) {
                                            const fieldName = colKey.replace('custom_field_', '');
                                            const value = asset.custom_fields?.[fieldName] || '-';
                                            return (
                                                <td key={colKey} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                    {isEditing && selectedIds.has(asset.id) ? (
                                                        <input type="text" value={editValues[asset.id]?.custom_fields?.[fieldName] ?? asset.custom_fields?.[fieldName] ?? ''} onChange={e => updateField(asset.id, `custom_fields.${fieldName}` as any, e.target.value)} className={editInputCls} />
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
                        {currentPage} of {Math.ceil(filteredAndSortedAssets.length / itemsPerPage)}
                    </div>
                    <button
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={currentPage === Math.ceil(filteredAndSortedAssets.length / itemsPerPage)}
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

            <AssetModal



                isOpen={modalState.type === 'add' || modalState.type === 'edit' || modalState.type === 'view'}



                onClose={closeModal}



                onSave={handleSaveAsset}



                assetToEdit={modalState.asset || null}



                mode={modalState.type as 'add' | 'edit' | 'view'}



                onEdit={() => modalState.asset && setModalState({ type: 'edit', asset: modalState.asset })}



                onDelete={() => modalState.asset && setModalState({ type: 'delete', asset: modalState.asset })}



                customFields={customFields}



                onShowColumnManagement={() => setShowColumnManagement(true)}



            />



            {modalState.type === 'delete' && modalState.asset && (



                <div className="fixed inset-0 z-50 overflow-y-auto">



                    <div className="flex min-h-screen items-center justify-center p-4">



                        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">



                            <div className="px-6 py-4">



                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Delete Asset</h3>



                            </div>



                            <div className="p-6">



                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">



                                    Are you sure you want to delete this asset?



                                </p>



                                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-md mb-4">



                                    <p className="text-sm font-medium text-gray-900 dark:text-white">



                                        {modalState.asset.asset_id} - {modalState.asset.name}



                                    </p>



                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">



                                        Criticality: {modalState.asset.criticality} | Category: {modalState.asset.category}



                                    </p>



                                </div>



                                {(() => {



                                    const relatedAssets = getRelatedAssetsForAsset(modalState.asset);



                                    if (relatedAssets.length > 0) {



                                        return (



                                            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-3 rounded-md">



                                                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">



                                                    ⚠️ This asset is connected with {relatedAssets.length} other asset{relatedAssets.length !== 1 ? 's' : ''}:



                                                </p>



                                                <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">



                                                    {relatedAssets.map((assetId, index) => (



                                                        <li key={index} className="flex items-center">



                                                            <span className="w-2 h-2 bg-yellow-400 rounded-full mr-2"></span>



                                                            {assetId}



                                                        </li>



                                                    ))}



                                                </ul>



                                                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">



                                                    Deleting this asset will also remove all relationships connected to it.



                                                </p>



                                            </div>



                                        );



                                    }



                                    return null;



                                })()}



                            </div>



                            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 rounded-b-lg flex justify-end space-x-3">



                                <button onClick={closeModal} disabled={deleting} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed">Cancel</button>



                                <button onClick={handleDeleteAsset} disabled={deleting} className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md shadow-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">



                                    {deleting ? 'Deleting...' : 'Delete'}



                                </button>



                            </div>



                        </div>



                    </div>



                </div>



            )}



            {newFieldsToCreate.length > 0 ? (
                <ImportConfirmationModal
                    isOpen={modalState.type === 'import'}
                    onClose={closeModal}
                    onConfirm={handleConfirmImport}
                    newFields={newFieldsToCreate}
                    moduleName="Assets"
                />
            ) : (
                <Modal isOpen={modalState.type === 'import'} onClose={closeModal} title="Import CSV Preview">
                    <div className="space-y-4">
                        <div>
                            <h4 className="font-semibold text-gray-900 dark:text-white mb-2">New Assets to Import ({importData.newAssets.length})</h4>
                            {importData.newAssets.length > 0 ? (
                                <div className="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-md p-3">
                                    {importData.newAssets.map((asset, idx) => (
                                        <div key={idx} className="py-2 px-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0 text-sm dark:text-gray-300">
                                            <div className="font-medium">{asset.asset_id} - {asset.name}</div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400">Criticality: {asset.criticality} | Category: {asset.category}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-gray-500 dark:text-gray-400 text-sm">No new assets to import.</div>
                            )}
                        </div>

                        {importData.updatedAssets.length > 0 && (
                            <div>
                                <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">Assets to Update ({importData.updatedAssets.length})</h4>
                                <div className="max-h-48 overflow-y-auto border border-blue-200 dark:border-blue-700 rounded-md p-3 bg-blue-50 dark:bg-gray-800">
                                    {importData.updatedAssets.map(({ id, updates }, idx) => (
                                        <div key={idx} className="py-1 px-2 text-sm text-blue-800 dark:text-blue-200">
                                            {updates.asset_id} - {updates.name} (will be updated)
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {importData.unchangedAssets.length > 0 && (
                            <div>
                                <h4 className="font-semibold text-gray-600 dark:text-gray-400 mb-2">Unchanged Assets ({importData.unchangedAssets.length})</h4>
                                <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-md p-3 bg-gray-50 dark:bg-gray-800">
                                    {importData.unchangedAssets.map((asset, idx) => (
                                        <div key={idx} className="py-1 px-2 text-sm text-gray-600 dark:text-gray-400">
                                            {asset.asset_id} - {asset.name} (no changes)
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="mt-6 flex justify-end space-x-3">
                        <button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>
                        <button onClick={handleConfirmImport} disabled={importData.newAssets.length === 0 && importData.updatedAssets.length === 0} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed">
                            {importData.newAssets.length > 0 && importData.updatedAssets.length > 0 
                                ? `Add ${importData.newAssets.length} & Update ${importData.updatedAssets.length} Assets`
                                : importData.newAssets.length > 0 
                                    ? `Import ${importData.newAssets.length} Asset${importData.newAssets.length !== 1 ? 's' : ''}`
                                    : `Update ${importData.updatedAssets.length} Asset${importData.updatedAssets.length !== 1 ? 's' : ''}`
                            }
                        </button>
                    </div>
                </Modal>
            )}



            {bulkProgress.status === 'idle' && (

                <SelectionActionBar

                    selectedCount={selectedIds.size}

                    isEditing={isEditing}

                    isConfirmingDelete={isConfirmingDelete}

                    isSaving={isSaving}

                    onEdit={() => startEdit(filteredAndSortedAssets.filter(i => selectedIds.has(i.id)), i => i.id)}

                    onSaveAll={handleSaveAll}

                    onCancelEdit={cancelEdit}

                    onDelete={() => setIsConfirmingDelete(true)}

                    onConfirmDelete={handleBulkDelete}

                    onCancelDelete={() => setIsConfirmingDelete(false)}

                    onClear={clearAll}

                />

            )}



            <AIChatModal



                isOpen={showAIChat}



                onClose={() => setShowAIChat(false)}



                module="assets"



                onConfirm={handleAIChatConfirm}



            />



            <BulkProgressModal



                isOpen={bulkProgress.status !== 'idle'}



                title="Deleting Assets"



                progress={bulkProgress}



            />



            {/* Import Progress Modal */}



            <BulkProgressModal



                isOpen={isImporting}



                title="Importing Assets"



                progress={{



                    total: totalToImport,



                    completed: importedCount - importErrors,



                    failed: importErrors,



                    status: isImporting ? 'processing' : 'idle'




                }}



                onClose={() => {}} // Import can't be cancelled, so empty function



            />



            <CustomFieldsManager



                isOpen={showColumnManagement}



                onClose={() => setShowColumnManagement(false)}



                onFieldChange={() => {



                    fetchCustomFields();



                    fetchAssets();



                }}



                moduleName="assets"



                title="Manage Asset Custom Columns"


            />



        </div>



    );





};

export default AssetsView;