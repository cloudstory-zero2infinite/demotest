import React, { useState, useEffect, useCallback, useRef, ChangeEvent, useMemo } from 'react';

import { Asset, AssetCreate, AssetUpdate, AssetCriticality, AssetGovernedStatus, AssetExposure, AssetCategory } from '../../types';

import * as SupabaseService from '../../services/supabase';

import { EyeIcon, PencilIcon, TrashIcon, PlusIcon, UploadIcon, DownloadIcon, SortUpDownIcon, SortUpIcon, SortDownIcon, BotIcon } from '../Icons';

import { Modal } from '../common/Modal';

import { AIChatModal } from '../common/AIChatModal';

import { useTableSelection } from '../../hooks/useTableSelection';

import { SelectionActionBar } from '../common/SelectionActionBar';



interface AssetModalProps {

    isOpen: boolean;

    onClose: () => void;

    onSave: (asset: AssetCreate | AssetUpdate) => void;

    assetToEdit: Asset | null;

    mode: 'add' | 'edit' | 'view';

}



const AssetModal: React.FC<AssetModalProps> = ({ isOpen, onClose, onSave, assetToEdit, mode }) => {

    const [formData, setFormData] = useState<Partial<AssetCreate>>({});

    const isViewMode = mode === 'view';



    useEffect(() => {

        if (assetToEdit) {

            const { asset_id, name, asset_owner, business_owner, physical_location, criticality, details, governed_status, vulnerability_count, exposure, category } = assetToEdit;

            setFormData({ asset_id, name, asset_owner, business_owner, physical_location, criticality, details, governed_status, vulnerability_count, exposure, category });

        } else {

            setFormData({ asset_id: '', name: '', asset_owner: '', business_owner: '', physical_location: '', criticality: 'Low', category: 'Technology', exposure: 'Internal', governed_status: 'Non-Governed', vulnerability_count: 0, details: '' });

        }

    }, [assetToEdit, isOpen, mode]);



    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {

        const { name, value } = e.target;

        const isNumeric = ['vulnerability_count'].includes(name);

        setFormData(prev => ({ ...prev, [name]: isNumeric ? Number(value) : value }));

    };



    const handleSubmit = (e: React.FormEvent) => {

        e.preventDefault();

        onSave(formData as AssetCreate | AssetUpdate);

    };



    const title = mode === 'add' ? 'Add New Asset' : mode === 'edit' ? 'Edit Asset' : 'View Asset';



    return (

        <Modal isOpen={isOpen} onClose={onClose} title={title}>

            <form onSubmit={handleSubmit} className="space-y-4">

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                    <div>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Asset ID</label>

                        <input type="text" name="asset_id" value={formData.asset_id || ''} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />

                    </div>

                    <div>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Asset Name</label>

                        <input type="text" name="name" value={formData.name || ''} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />

                    </div>

                    <div>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Asset Owner</label>

                        <input type="text" name="asset_owner" value={formData.asset_owner || ''} onChange={handleChange} readOnly={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />

                    </div>

                    <div>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Owner</label>

                        <input type="text" name="business_owner" value={formData.business_owner || ''} onChange={handleChange} readOnly={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />

                    </div>

                    <div>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Physical Location</label>

                        <input type="text" name="physical_location" value={formData.physical_location || ''} onChange={handleChange} readOnly={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="e.g., Server Room A, Building 2, Floor 3" />

                    </div>

                    <div>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Criticality</label>

                        <select name="criticality" value={formData.criticality} onChange={handleChange} disabled={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">

                           <option>Low</option><option>Medium</option><option>High</option>

                        </select>

                    </div>

                     <div>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Category</label>

                        <select name="category" value={formData.category} onChange={handleChange} disabled={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">

                           <option>Technology</option><option>Information</option><option>Service</option>

                        </select>

                    </div>

                    <div>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Exposure</label>

                        <select name="exposure" value={formData.exposure} onChange={handleChange} disabled={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">

                           <option>Internal</option><option>External</option><option>DMZ</option>

                        </select>

                    </div>

                     <div>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Governed Status</label>

                        <select name="governed_status" value={formData.governed_status} onChange={handleChange} disabled={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">

                           <option>Non-Governed</option><option>Governed</option>

                        </select>

                    </div>

                    <div>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Vulnerability Count</label>

                        <input type="number" name="vulnerability_count" value={formData.vulnerability_count || 0} onChange={handleChange} readOnly={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />

                    </div>

                     <div className="md:col-span-2">

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Details</label>

                        <textarea name="details" value={formData.details || ''} onChange={handleChange} readOnly={isViewMode} rows={3} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"></textarea>

                    </div>

                </div>

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



export const AssetsView: React.FC = () => {

    const [assets, setAssets] = useState<Asset[]>([]);

    const [relationships, setRelationships] = useState<any[]>([]);

    const [loading, setLoading] = useState(true);

    const [deleting, setDeleting] = useState(false);

    const [error, setError] = useState<string|null>(null);

    const [modalState, setModalState] = useState<{ type: 'add' | 'edit' | 'view' | 'delete' | 'import' | null; asset?: Asset | null }>({ type: null });

    const fileInputRef = useRef<HTMLInputElement>(null);

    const [filter, setFilter] = useState('');

    const [sortConfig, setSortConfig] = useState<{ key: keyof Asset; direction: 'ascending' | 'descending' } | null>(null);

    const [importData, setImportData] = useState<{ newAssets: AssetCreate[]; duplicates: string[] }>({ newAssets: [], duplicates: [] });

    const [showAIChat, setShowAIChat] = useState(false);



    const {

        selectedIds, isEditing, editValues, isConfirmingDelete, isSaving,

        setIsConfirmingDelete, setIsSaving,

        toggle, toggleAll, clearAll, startEdit, updateField, cancelEdit,

    } = useTableSelection<Asset>();



    const fetchAssets = useCallback(async () => {

        try {

            setLoading(true);

            setError(null);

            const [assetsData, relationshipsData] = await Promise.all([

                SupabaseService.getAssets(),

                SupabaseService.getAssetRelationships(),

            ]);

            setAssets(assetsData);

            setRelationships(relationshipsData);

        } catch (e) {

            setError("Failed to load assets.");

        } finally {

            setLoading(false);

        }

    }, []);



    useEffect(() => {

        fetchAssets();

    }, [fetchAssets]);



    const filteredAndSortedAssets = useMemo(() => {

        let filteredItems = [...assets];

        if (filter) {

            const lowerCaseFilter = filter.toLowerCase();

            filteredItems = filteredItems.filter(item =>

                String(item.asset_id ?? '').toLowerCase().includes(lowerCaseFilter) ||

                String(item.name ?? '').toLowerCase().includes(lowerCaseFilter) ||

                String(item.asset_owner ?? '').toLowerCase().includes(lowerCaseFilter) ||

                String(item.business_owner ?? '').toLowerCase().includes(lowerCaseFilter) ||

                String(item.physical_location ?? '').toLowerCase().includes(lowerCaseFilter) ||

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

    }, [assets, filter, sortConfig]);



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

        try {

            setIsSaving(true);

            for (const id of selectedIds) {

                await SupabaseService.deleteAsset(id as string);

            }

            clearAll();

            fetchAssets();

        } catch (err) {

            setError('Failed to delete selected items.');

        } finally {

            setIsSaving(false);

        }

    };



    const handleSaveAll = async () => {

        try {

            setIsSaving(true);

            for (const [id, changes] of Object.entries(editValues)) {

                await SupabaseService.updateAsset(id, changes);

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

                    asset_id: String(record.asset_id || ''),

                    name: String(record.name || ''),

                    asset_owner: String(record.asset_owner || ''),

                    business_owner: String(record.business_owner || ''),

                    physical_location: String(record.physical_location || ''),

                    criticality: (record.criticality as AssetCriticality) || 'Low',

                    category: (record.category as AssetCategory) || 'Technology',

                    exposure: (record.exposure as AssetExposure) || 'Internal',

                    governed_status: (record.governed_status as AssetGovernedStatus) || 'Non-Governed',

                    vulnerability_count: Number(record.vulnerability_count || 0),

                    details: String(record.details || ''),

                    source: 'ai'

                };

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



    const handleImportCSV = (event: ChangeEvent<HTMLInputElement>) => {

        const file = event.target.files?.[0];

        if (!file) return;



        const reader = new FileReader();

        reader.onload = async (e) => {

            const text = e.target?.result as string;

            if(!text) return;



            const lines = text.split('\n').slice(1);

            const parsedAssets: AssetCreate[] = lines

                .map(line => {

                    const [asset_id, name, criticality, details, governed_status, vulnerability_count, exposure, category, asset_owner, business_owner, physical_location] = line.split(',').map(s => s.trim());

                    if (!asset_id || !name || !criticality || !governed_status || !exposure || !category) return null;



                    // Basic validation for enum types

                    const validCriticality: AssetCriticality[] = ['High', 'Medium', 'Low'];

                    const validGovernedStatus: AssetGovernedStatus[] = ['Governed', 'Non-Governed'];

                    const validExposure: AssetExposure[] = ['Internal', 'External', 'DMZ'];

                    const validCategory: AssetCategory[] = ['Information', 'Technology', 'Service'];



                    if (!validCriticality.includes(criticality as AssetCriticality) ||

                        !validGovernedStatus.includes(governed_status as AssetGovernedStatus) ||

                        !validExposure.includes(exposure as AssetExposure) ||

                        !validCategory.includes(category as AssetCategory)) {

                        return null;

                    }



                    return {

                        asset_id,

                        name,

                        criticality: criticality as AssetCriticality,

                        details: details || '',

                        governed_status: governed_status as AssetGovernedStatus,

                        vulnerability_count: Number(vulnerability_count) || 0,

                        exposure: exposure as AssetExposure,

                        category: category as AssetCategory,

                        asset_owner: asset_owner || '',

                        business_owner: business_owner || '',

                        physical_location: physical_location || '',

                    };

                })

                .filter((asset): asset is AssetCreate =>

    asset !== null &&

    typeof asset.asset_id === 'string' &&

    typeof asset.name === 'string' &&

    typeof asset.criticality === 'string' &&

    typeof asset.details === 'string' &&

    typeof asset.governed_status === 'string' &&

    typeof asset.exposure === 'string' &&

    typeof asset.category === 'string'

);



            // Check for duplicates by asset_id

            const existingAssetIds = new Set(assets.map(a => a.asset_id));

            const newAssets = parsedAssets.filter(a => !existingAssetIds.has(a.asset_id));

            const duplicates = parsedAssets.filter(a => existingAssetIds.has(a.asset_id)).map(a => a.asset_id);



            setImportData({ newAssets, duplicates });

            setModalState({ type: 'import' });

        };

        reader.readAsText(file);

        if(fileInputRef.current) fileInputRef.current.value = '';

    };



    const handleConfirmImport = async () => {

        if (importData.newAssets.length > 0) {

            try {

                await SupabaseService.bulkAddAssets(importData.newAssets);

                await SupabaseService.logAllActivity({

                    action: 'Bulk Imported Assets',

                    module: 'Governance',

                    event_data: { count: importData.newAssets.length, duplicateCount: importData.duplicates.length }

                });

                setModalState({ type: null });

                fetchAssets();

            } catch (err) {

                setError('Failed to import assets.');

                console.error(err);

        }

    }

};



const handleExportCSV = () => {

    const headers = ['asset_id', 'name', 'criticality', 'details', 'governed_status', 'vulnerability_count', 'exposure', 'category', 'asset_owner', 'business_owner', 'physical_location'];

    const csvContent = [

        headers.join(','),

        ...filteredAndSortedAssets.map(asset =>

            [

                asset.asset_id,

                `"${(asset.name || '').replace(/"/g, '""')}"`,

                asset.criticality || '',

                `"${(asset.details || '').replace(/"/g, '""')}"`,

                asset.governed_status || '',

                asset.vulnerability_count || 0,

                asset.exposure || '',

                asset.category || '',

                asset.asset_owner || '',

                asset.business_owner || '',

                asset.physical_location || ''

            ].join(',')

        )

    ].join('\n');



    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

    const link = document.createElement('a');

    link.href = URL.createObjectURL(blob);

    link.download = `assets-${new Date().toISOString().split('T')[0]}.csv`;

    link.click();

};



    const editInputCls = "w-full border border-blue-300 dark:border-blue-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400";

    const editSelectCls = "border border-blue-300 dark:border-blue-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400";



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

                        aria-label="Filter assets"

                    />

                </div>

                <div className="flex space-x-2">

                    <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />

                    <button onClick={() => fileInputRef.current?.click()} title="Import CSV" className="p-2 text-gray-400 hover:text-green-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">

                        <UploadIcon className="h-5 w-5" />

                    </button>

                    <button onClick={handleExportCSV} title="Export CSV" className="p-2 text-gray-400 hover:text-purple-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">

                        <DownloadIcon className="h-5 w-5" />

                    </button>

                    <button onClick={() => setModalState({ type: 'add' })} title="Add Asset" className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">

                        <PlusIcon className="h-5 w-5" />

                    </button>

                    <button onClick={() => setShowAIChat(true)} title="AI Assistant" className="p-2 text-gray-400 hover:text-indigo-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">

                        <BotIcon className="h-5 w-5" />

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

                                        checked={selectedIds.size === filteredAndSortedAssets.length && filteredAndSortedAssets.length > 0}

                                        onChange={() => toggleAll(filteredAndSortedAssets.map(i => i.id))}

                                        className="rounded border-gray-300 dark:border-gray-600 cursor-pointer"

                                    />

                                </th>

                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">

                                    <button onClick={() => requestSort('asset_id')} className="flex items-center w-full text-left focus:outline-none">

                                        Asset ID {getSortIconFor('asset_id')}

                                    </button>

                                </th>

                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">

                                    <button onClick={() => requestSort('name')} className="flex items-center w-full text-left focus:outline-none">

                                        Name {getSortIconFor('name')}

                                    </button>

                                </th>

                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">

                                    <button onClick={() => requestSort('criticality')} className="flex items-center w-full text-left focus:outline-none">

                                        Criticality {getSortIconFor('criticality')}

                                    </button>

                                </th>

                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">

                                    <button onClick={() => requestSort('business_owner')} className="flex items-center w-full text-left focus:outline-none">

                                        Business Owner {getSortIconFor('business_owner')}

                                    </button>

                                </th>

                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">

                                    <button onClick={() => requestSort('physical_location')} className="flex items-center w-full text-left focus:outline-none">

                                        Physical Location {getSortIconFor('physical_location')}

                                    </button>

                                </th>

                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">

                                    <button onClick={() => requestSort('category')} className="flex items-center w-full text-left focus:outline-none">

                                        Type {getSortIconFor('category')}

                                    </button>

                                </th>

                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Actions</th>

                            </tr>

                        </thead>

                         <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">

                            {loading ? (

                                <tr><td colSpan={8} className="text-center py-4 text-gray-500 dark:text-gray-400">Loading assets...</td></tr>

                            ) : filteredAndSortedAssets.length === 0 ? (

                                <tr><td colSpan={8} className="text-center py-4 text-gray-500 dark:text-gray-400">No assets found.</td></tr>

                            ) : filteredAndSortedAssets.map(asset => (

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

                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">

                                        {isEditing && selectedIds.has(asset.id) ? (

                                            <input type="text" value={editValues[asset.id]?.asset_id ?? asset.asset_id} onChange={e => updateField(asset.id, 'asset_id', e.target.value)} className={editInputCls} />

                                        ) : asset.asset_id}

                                    </td>

                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">

                                        {isEditing && selectedIds.has(asset.id) ? (

                                            <input type="text" value={editValues[asset.id]?.name ?? asset.name} onChange={e => updateField(asset.id, 'name', e.target.value)} className={editInputCls} />

                                        ) : asset.name}

                                    </td>

                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">

                                        {isEditing && selectedIds.has(asset.id) ? (

                                            <select value={editValues[asset.id]?.criticality ?? asset.criticality} onChange={e => updateField(asset.id, 'criticality', e.target.value as any)} className={editSelectCls}><option>Low</option><option>Medium</option><option>High</option></select>

                                        ) : asset.criticality}

                                    </td>

                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">

                                        {isEditing && selectedIds.has(asset.id) ? (

                                            <input type="text" value={editValues[asset.id]?.business_owner ?? asset.business_owner ?? ''} onChange={e => updateField(asset.id, 'business_owner', e.target.value)} className={editInputCls} />

                                        ) : (asset.business_owner || '-')}

                                    </td>

                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">

                                        {isEditing && selectedIds.has(asset.id) ? (

                                            <input type="text" value={editValues[asset.id]?.physical_location ?? asset.physical_location ?? ''} onChange={e => updateField(asset.id, 'physical_location', e.target.value)} className={editInputCls} />

                                        ) : (asset.physical_location || '-')}

                                    </td>

                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">

                                        {isEditing && selectedIds.has(asset.id) ? (

                                            <select value={editValues[asset.id]?.category ?? asset.category} onChange={e => updateField(asset.id, 'category', e.target.value as any)} className={editSelectCls}><option>Technology</option><option>Information</option><option>Service</option></select>

                                        ) : asset.category}

                                    </td>

                                    <td onClick={e => e.stopPropagation()} className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">

                                        {!isEditing && (

                                            <div className="flex justify-end items-center space-x-2">

                                                <button onClick={() => setModalState({ type: 'view', asset })} className="text-gray-400 hover:text-green-500"><EyeIcon className="h-5 w-5" /></button>

                                                <button onClick={() => setModalState({ type: 'edit', asset })} className="text-gray-400 hover:text-yellow-500"><PencilIcon className="h-5 w-5" /></button>

                                                <button onClick={() => { setError(null); setModalState({ type: 'delete', asset }); }} className="text-gray-400 hover:text-red-500"><TrashIcon className="h-5 w-5" /></button>

                                            </div>

                                        )}

                                    </td>

                                </tr>

                            ))}

                        </tbody>

                    </table>

                </div>

            </div>

            <AssetModal

                isOpen={modalState.type === 'add' || modalState.type === 'edit' || modalState.type === 'view'}

                onClose={closeModal}

                onSave={handleSaveAsset}

                assetToEdit={modalState.asset || null}

                mode={modalState.type as 'add' | 'edit' | 'view'}

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

                    {importData.duplicates.length > 0 && (

                        <div>

                            <h4 className="font-semibold text-yellow-600 dark:text-yellow-400 mb-2">Duplicates (Not Imported - {importData.duplicates.length})</h4>

                            <div className="max-h-48 overflow-y-auto border border-yellow-200 dark:border-yellow-700 rounded-md p-3 bg-yellow-50 dark:bg-gray-800">

                                {importData.duplicates.map((assetId, idx) => (

                                    <div key={idx} className="py-1 px-2 text-sm text-yellow-800 dark:text-yellow-200">

                                        {assetId} (already exists)

                                    </div>

                                ))}

                            </div>

                        </div>

                    )}

                </div>

                <div className="mt-6 flex justify-end space-x-3">

                    <button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>

                    <button onClick={handleConfirmImport} disabled={importData.newAssets.length === 0} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed">

                        Import {importData.newAssets.length} Asset{importData.newAssets.length !== 1 ? 's' : ''}

                    </button>

                </div>

            </Modal>

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

            <AIChatModal

                isOpen={showAIChat}

                onClose={() => setShowAIChat(false)}

                module="assets"

                onConfirm={handleAIChatConfirm}

            />

        </div>

    );

};

