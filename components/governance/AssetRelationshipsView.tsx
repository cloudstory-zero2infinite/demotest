import React, { useState, useCallback, useMemo, useRef } from 'react';
import * as SupabaseService from '../../services/supabase';
import { AssetRelationship, AssetRelationshipCreate } from '../../types';
import { EyeIcon, PencilIcon, TrashIcon, PlusIcon, UploadIcon, DownloadIcon, SortUpDownIcon, SortUpIcon, SortDownIcon, BotIcon } from '../Icons';
import { useTableSelection } from '../../hooks/useTableSelection';
import { SelectionActionBar } from '../common/SelectionActionBar';
import { AIChatModal } from '../common/AIChatModal';

const RELATIONSHIP_TYPES = ['Depends On', 'Hosts', 'Communicates With', 'Contains', 'Owned By', 'Managed By', 'Connected To', 'Backs Up', 'Replicates To'];

interface AssetRelationshipModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (rel: AssetRelationshipCreate) => void;
    relToEdit: AssetRelationship | null;
    mode: 'add' | 'edit' | 'view';
    assetIds: string[];
}

const AssetRelationshipModal: React.FC<AssetRelationshipModalProps> = ({ isOpen, onClose, onSave, relToEdit, mode, assetIds }) => {
    const [formData, setFormData] = useState<Partial<AssetRelationshipCreate>>({});
    const isViewMode = mode === 'view';

    React.useEffect(() => {
        if (relToEdit) {
            const { source_asset_id, target_asset_id, relationship_type } = relToEdit;
            setFormData({ source_asset_id, target_asset_id, relationship_type });
        } else {
            setFormData({ source_asset_id: '', target_asset_id: '', relationship_type: RELATIONSHIP_TYPES[0] });
        }
    }, [relToEdit, isOpen, mode]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData as AssetRelationshipCreate);
    };

    const title = mode === 'add' ? 'Add Relationship' : mode === 'edit' ? 'Edit Relationship' : 'View Relationship';

    return (
        <div className={`fixed inset-0 z-50 overflow-y-auto ${isOpen ? 'block' : 'hidden'}`}>
            <div className="flex min-h-screen items-center justify-center p-4">
                <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">{title}</h3>
                        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                            <span className="h-6 w-6">×</span>
                        </button>
                    </div>
                    <form onSubmit={handleSubmit} className="p-6 space-y-4">
                        <div className="grid grid-cols-1 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Source Asset</label>
                                {isViewMode ? (
                                    <input type="text" value={formData.source_asset_id || ''} readOnly className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                                ) : (
                                    <select name="source_asset_id" value={formData.source_asset_id || ''} onChange={handleChange} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                                        <option value="">Select asset...</option>
                                        {assetIds.map(id => <option key={id} value={id}>{id}</option>)}
                                    </select>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Target Asset</label>
                                {isViewMode ? (
                                    <input type="text" value={formData.target_asset_id || ''} readOnly className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                                ) : (
                                    <select name="target_asset_id" value={formData.target_asset_id || ''} onChange={handleChange} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                                        <option value="">Select asset...</option>
                                        {assetIds.map(id => <option key={id} value={id}>{id}</option>)}
                                    </select>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Relationship Type</label>
                                {isViewMode ? (
                                    <input type="text" value={formData.relationship_type || ''} readOnly className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                                ) : (
                                    <select name="relationship_type" value={formData.relationship_type || ''} onChange={handleChange} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                                        {RELATIONSHIP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                )}
                            </div>
                        </div>
                        {!isViewMode && (
                            <div className="mt-6 flex justify-end space-x-3">
                                <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>
                                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700">Save</button>
                            </div>
                        )}
                    </form>
                </div>
            </div>
        </div>
    );
};

export const AssetRelationshipsView: React.FC = () => {
    const [relationships, setRelationships] = useState<AssetRelationship[]>([]);
    const [assets, setAssets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [modalState, setModalState] = useState<{ type: 'add' | 'edit' | 'view' | 'delete' | null; rel?: AssetRelationship | null }>({ type: null });
    const [filter, setFilter] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof AssetRelationship; direction: 'ascending' | 'descending' } | null>(null);
    const [importData, setImportData] = useState<{ newRels: AssetRelationshipCreate[]; skipped: number; addedCount?: number }>({ newRels: [], skipped: 0 });
    const [showAIChat, setShowAIChat] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const {
        selectedIds, isEditing, editValues, isConfirmingDelete, isSaving,
        setIsConfirmingDelete, setIsSaving,
        toggle, toggleAll, clearAll, startEdit, updateField, cancelEdit,
    } = useTableSelection<AssetRelationship>();

    const editInputCls = "w-full border border-blue-300 dark:border-blue-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400";
    const editSelectCls = "border border-blue-300 dark:border-blue-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400";

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const [rels, assetList] = await Promise.all([
                SupabaseService.getAssetRelationships(),
                SupabaseService.getAssets(),
            ]);
            setRelationships(rels);
            setAssets(assetList);
        } catch {
            setError('Failed to load asset relationships.');
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        // Initial data fetch
        fetchData();
    }, [fetchData]);

    // Add a visibility observer to refresh data when tab becomes visible
    React.useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        // Tab is now visible, refresh data
                        fetchData();
                    }
                });
            },
            { threshold: 0.1 }
        );

        const element = document.querySelector('[data-tab="relationships"]');
        if (element) {
            observer.observe(element);
        }

        return () => {
            if (element) {
                observer.unobserve(element);
            }
        };
    }, [fetchData]);

    const assetIds = useMemo(() => assets.map(a => a.asset_id).filter(Boolean) as string[], [assets]);

    const filteredAndSorted = useMemo(() => {
        let items = [...relationships];
        if (filter) {
            const lc = filter.toLowerCase();
            items = items.filter(r =>
                r.source_asset_id.toLowerCase().includes(lc) ||
                r.target_asset_id.toLowerCase().includes(lc) ||
                r.relationship_type.toLowerCase().includes(lc)
            );
        }
        if (sortConfig) {
            items.sort((a, b) => {
                const av = a[sortConfig.key];
                const bv = b[sortConfig.key];
                if (av == null) return 1;
                if (bv == null) return -1;
                if (av < bv) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (av > bv) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [relationships, filter, sortConfig]);

    const requestSort = (key: keyof AssetRelationship) => {
        setSortConfig(prev => ({ key, direction: prev?.key === key && prev.direction === 'ascending' ? 'descending' : 'ascending' }));
    };

    const getSortIconFor = (key: keyof AssetRelationship) => {
        if (!sortConfig || sortConfig.key !== key) return <SortUpDownIcon className="h-4 w-4 ml-1" />;
        return sortConfig.direction === 'ascending' ? <SortUpIcon className="h-4 w-4 ml-1" /> : <SortDownIcon className="h-4 w-4 ml-1" />;
    };

    const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            if (!text) return;
            const lines = text.split('\n').slice(1);
            let skipped = 0;
            const newRels: AssetRelationshipCreate[] = lines
                .map(line => {
                    const [source_asset_id, target_asset_id, relationship_type] = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
                    if (!source_asset_id || !target_asset_id || !relationship_type) { skipped++; return null; }
                    return { source_asset_id, target_asset_id, relationship_type };
                })
                .filter((r): r is AssetRelationshipCreate => r !== null);
            setImportData({ newRels, skipped });
            setModalState({ type: 'import' });
        };
        reader.readAsText(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleConfirmImport = async () => {
        if (importData.newRels.length > 0) {
            try {
                // Check for duplicates before importing
                const existingRelationships = relationships;
                const duplicates: string[] = [];
                const validRels: AssetRelationshipCreate[] = [];

                for (const newRel of importData.newRels) {
                    const isDuplicate = existingRelationships.some(existing =>
                        existing.source_asset_id === newRel.source_asset_id &&
                        existing.target_asset_id === newRel.target_asset_id &&
                        existing.relationship_type === newRel.relationship_type
                    );

                    if (isDuplicate) {
                        duplicates.push(`${newRel.source_asset_id} → ${newRel.relationship_type} → ${newRel.target_asset_id}`);
                    } else {
                        validRels.push(newRel);
                    }
                }

                // Only add non-duplicate relationships
                const importedRelationships = [];
                for (const rel of validRels) {
                    const savedRel = await SupabaseService.addAssetRelationship(rel);
                    importedRelationships.push(savedRel);
                }

                await SupabaseService.logAllActivity({
                    action: 'Bulk Imported Asset Relationships',
                    module: 'Governance',
                    entity_id: null,
                    entity_name: `${importedRelationships.length} relationships imported`,
                    event_data: {
                        count: importedRelationships.length,
                        relationships: importedRelationships,
                        skipped_count: importData.skipped
                    }
                });

                setModalState({ type: null });
                fetchData(); // Refresh data to show new relationships

                // Store import count for button display
                setImportData(prev => ({ ...prev, newRels: validRels, addedCount: validRels.length }));

            } catch {
                setError('Failed to import relationships.');
            }
        }
    };

    const handleExportCSV = () => {
        const headers = ['source_asset_id', 'target_asset_id', 'relationship_type'];
        const csvContent = [
            headers.join(','),
            ...filteredAndSorted.map(r =>
                [
                    r.source_asset_id,
                    r.target_asset_id,
                    r.relationship_type,
                ].join(',')
            ),
        ].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `asset-relationships-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    const closeModal = () => setModalState({ type: null });

    const handleSave = async (data: AssetRelationshipCreate) => {
        try {
            // Check for duplicates before saving
            const isDuplicate = relationships.some(existing =>
                existing.source_asset_id === data.source_asset_id &&
                existing.target_asset_id === data.target_asset_id &&
                existing.relationship_type === data.relationship_type &&
                existing.id !== modalState.rel?.id // Exclude current relationship if editing
            );

            if (isDuplicate) {
                // Don't show error, just return silently
                return;
            }

            let savedRelationship;
            if (modalState.type === 'edit' && modalState.rel) {
                savedRelationship = await SupabaseService.updateAssetRelationship(modalState.rel.id, data);
                await SupabaseService.logAllActivity({
                    action: 'Updated Asset Relationship',
                    module: 'Governance',
                    entity_id: savedRelationship.id,
                    entity_name: `${data.source_asset_id} → ${data.relationship_type} → ${data.target_asset_id}`,
                    event_data: {
                        old_relationship: modalState.rel,
                        new_relationship: data
                    }
                });
            } else {
                savedRelationship = await SupabaseService.addAssetRelationship(data);
                await SupabaseService.logAllActivity({
                    action: 'Created Asset Relationship',
                    module: 'Governance',
                    entity_id: savedRelationship.id,
                    entity_name: `${data.source_asset_id} → ${data.relationship_type} → ${data.target_asset_id}`,
                    event_data: { relationship: data }
                });
            }
            fetchData(); // Refresh data to show changes
            closeModal();
        } catch {
            setError('Failed to save relationship.');
        }
    };

    const handleDelete = async () => {
        if (modalState.rel) {
            try {
                await SupabaseService.deleteAssetRelationship(modalState.rel.id);
                await SupabaseService.logAllActivity({
                    action: 'Deleted Asset Relationship',
                    module: 'Governance',
                    entity_id: modalState.rel.id,
                    entity_name: `${modalState.rel.source_asset_id} → ${modalState.rel.relationship_type} → ${modalState.rel.target_asset_id}`,
                    event_data: { deleted_relationship: modalState.rel }
                });
                fetchData();
                closeModal();
            } catch {
                setError('Failed to delete relationship.');
            }
        }
    };

    const handleSaveAll = async () => {
        try {
            setIsSaving(true);
            for (const id of selectedIds) {
                const changes = editValues[id as string];
                if (changes) {
                    await SupabaseService.updateAssetRelationship(id as string, changes);
                }
            }
            clearAll();
            fetchData();
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
                await SupabaseService.deleteAssetRelationship(id as string);
            }
            clearAll();
            fetchData();
        } catch {
            setError('Failed to delete selected relationships.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleAIChatConfirm = async (records: Record<string, unknown>[]) => {
        try {
            for (const record of records) {
                const relationshipData: AssetRelationshipCreate = {
                    source_asset_id: String(record.source_asset_id || ''),
                    target_asset_id: String(record.target_asset_id || ''),
                    relationship_type: String(record.relationship_type || 'Connected To')
                };
                await SupabaseService.addAssetRelationship(relationshipData);
            }
            await SupabaseService.logAllActivity({
                action: 'Bulk Created Asset Relationships via AI',
                module: 'Governance',
                entity_id: null,
                entity_name: `${records.length} relationships created via AI`,
                event_data: { count: records.length, records }
            });
            fetchData();
        } catch (err) {
            setError('Failed to save AI-generated relationships.');
        }
    };

    const getRelatedAssetsForRelationship = (relationship: AssetRelationship) => {
        const relatedAssets: string[] = [];

        // Find all relationships where the current source asset is involved
        const sourceRelatedRelationships = relationships.filter(r =>
            r.id !== relationship.id && (
                r.source_asset_id === relationship.source_asset_id ||
                r.target_asset_id === relationship.source_asset_id
            )
        );

        // Find all relationships where the current target asset is involved
        const targetRelatedRelationships = relationships.filter(r =>
            r.id !== relationship.id && (
                r.source_asset_id === relationship.target_asset_id ||
                r.target_asset_id === relationship.target_asset_id
            )
        );

        // Collect unique related asset names
        sourceRelatedRelationships.forEach(r => {
            if (r.source_asset_id !== relationship.source_asset_id && !relatedAssets.includes(r.source_asset_id)) {
                relatedAssets.push(r.source_asset_id);
            }
            if (r.target_asset_id !== relationship.source_asset_id && !relatedAssets.includes(r.target_asset_id)) {
                relatedAssets.push(r.target_asset_id);
            }
        });

        targetRelatedRelationships.forEach(r => {
            if (r.source_asset_id !== relationship.target_asset_id && !relatedAssets.includes(r.source_asset_id)) {
                relatedAssets.push(r.source_asset_id);
            }
            if (r.target_asset_id !== relationship.target_asset_id && !relatedAssets.includes(r.target_asset_id)) {
                relatedAssets.push(r.target_asset_id);
            }
        });

        return relatedAssets;
    };

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                <div className="w-full sm:w-1/3">
                    <input
                        type="text"
                        placeholder="Filter relationships..."
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                </div>
                <div className="flex space-x-2">
                    <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />
                     <button onClick={() => setShowAIChat(true)} title="AI Assistant" className="p-2 text-gray-400 hover:text-indigo-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        <BotIcon className="h-5 w-5" />
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} title="Import CSV" className="p-2 text-gray-400 hover:text-green-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md relative">
                        <UploadIcon className="h-5 w-5" />
                        {importData.addedCount && (
                            <span className="absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                                {importData.addedCount}
                            </span>
                        )}
                    </button>
                    <button onClick={handleExportCSV} title="Export CSV" className="p-2 text-gray-400 hover:text-purple-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        <DownloadIcon className="h-5 w-5" />
                    </button>
                    <button onClick={() => setModalState({ type: 'add' })} title="Add Relationship" className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        <PlusIcon className="h-5 w-5" />
                    </button>
                   
                </div>
            </div>

            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">{error}</div>}

            <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg dark:border-gray-700">
                <div className="overflow-auto max-h-[calc(100vh-280px)]">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 w-10 px-4 py-3">
                                    <input type="checkbox"
                                        checked={selectedIds.size === filteredAndSorted.length && filteredAndSorted.length > 0}
                                        onChange={() => toggleAll(filteredAndSorted.map(i => i.id))}
                                        className="rounded border-gray-300 dark:border-gray-600 cursor-pointer" />
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('source_asset_id')} className="flex items-center w-full text-left focus:outline-none">
                                        Source Asset {getSortIconFor('source_asset_id')}
                                    </button>
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('relationship_type')} className="flex items-center w-full text-left focus:outline-none">
                                        Relationship {getSortIconFor('relationship_type')}
                                    </button>
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('target_asset_id')} className="flex items-center w-full text-left focus:outline-none">
                                        Target Asset {getSortIconFor('target_asset_id')}
                                    </button>
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={5} className="text-center py-4 text-gray-500 dark:text-gray-400">Loading relationships...</td></tr>
                            ) : filteredAndSorted.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-4 text-gray-500 dark:text-gray-400">No relationships found.</td></tr>
                            ) : filteredAndSorted.map(rel => (
                                <tr key={rel.id}
                                    onClick={() => !isEditing && setModalState({ type: 'view', rel })}
                                    className={`cursor-pointer transition-colors ${
                                        selectedIds.has(rel.id) ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                    } ${isEditing && !selectedIds.has(rel.id) ? 'opacity-40 pointer-events-none' : ''}`}
                                >
                                    <td onClick={e => e.stopPropagation()} className="w-10 px-4 py-4">
                                        <input type="checkbox"
                                            checked={selectedIds.has(rel.id)}
                                            onChange={() => toggle(rel.id)}
                                            className="rounded border-gray-300 dark:border-gray-600 cursor-pointer" />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                        {isEditing && selectedIds.has(rel.id) ? (
                                            <select value={editValues[rel.id]?.source_asset_id ?? rel.source_asset_id} onChange={e => updateField(rel.id, 'source_asset_id', e.target.value)} className={editSelectCls}>
                                                {assetIds.map(id => <option key={id} value={id}>{id}</option>)}
                                            </select>
                                        ) : rel.source_asset_id}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 dark:text-blue-400 font-medium">
                                        {isEditing && selectedIds.has(rel.id) ? (
                                            <select value={editValues[rel.id]?.relationship_type ?? rel.relationship_type} onChange={e => updateField(rel.id, 'relationship_type', e.target.value as any)} className={editSelectCls}>
                                                <option>Depends On</option>
                                                <option>Hosts</option>
                                                <option>Communicates With</option>
                                                <option>Contains</option>
                                                <option>Owned By</option>
                                                <option>Managed By</option>
                                                <option>Connected To</option>
                                                <option>Backs Up</option>
                                                <option>Replicates To</option>
                                            </select>
                                        ) : rel.relationship_type}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                        {isEditing && selectedIds.has(rel.id) ? (
                                            <select value={editValues[rel.id]?.target_asset_id ?? rel.target_asset_id} onChange={e => updateField(rel.id, 'target_asset_id', e.target.value)} className={editSelectCls}>
                                                {assetIds.map(id => <option key={id} value={id}>{id}</option>)}
                                            </select>
                                        ) : rel.target_asset_id}
                                    </td>
                                    <td onClick={e => e.stopPropagation()} className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        {!isEditing && (
                                            <div className="flex justify-end items-center space-x-2">
                                                <button onClick={() => setModalState({ type: 'view', rel })} className="text-gray-400 hover:text-green-500"><EyeIcon className="h-5 w-5" /></button>
                                                <button onClick={() => setModalState({ type: 'edit', rel })} className="text-gray-400 hover:text-yellow-500"><PencilIcon className="h-5 w-5" /></button>
                                                <button onClick={() => setModalState({ type: 'delete', rel })} className="text-gray-400 hover:text-red-500"><TrashIcon className="h-5 w-5" /></button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <AssetRelationshipModal
                isOpen={modalState.type === 'add' || modalState.type === 'edit' || modalState.type === 'view'}
                onClose={closeModal}
                onSave={handleSave}
                relToEdit={modalState.rel || null}
                mode={modalState.type as 'add' | 'edit' | 'view'}
                assetIds={assetIds}
            />

            {modalState.type === 'import' && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex min-h-screen items-center justify-center p-4">
                        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                            <div className="px-6 py-4">
                                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Import CSV Preview</h4>
                                {importData.newRels.length > 0 ? (
                                    <div className="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-md p-3">
                                        {importData.newRels.map((r, idx) => (
                                            <div key={idx} className="py-2 px-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0 text-sm dark:text-gray-300">
                                                <span className="font-medium">{r.source_asset_id}</span> → <span className="text-blue-600 dark:text-blue-400">{r.relationship_type}</span> → <span className="font-medium">{r.target_asset_id}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-gray-500 dark:text-gray-400 text-sm">No valid relationships to import.</div>
                                )}
                                {importData.skipped > 0 && <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">{importData.skipped} row(s) skipped due to missing required fields.</p>}
                            </div>
                            <div className="mt-6 flex justify-end space-x-3">
                                <button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>
                                <button onClick={handleConfirmImport} disabled={importData.newRels.length === 0} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
                                    Import {importData.newRels.length} Relationship{importData.newRels.length !== 1 ? 's' : ''}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {modalState.type === 'delete' && modalState.rel && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex min-h-screen items-center justify-center p-4">
                        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                            <div className="px-6 py-4">
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Delete Relationship</h3>
                            </div>
                            <div className="p-6">
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                                    Are you sure you want to delete this relationship?
                                </p>
                                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-md mb-4">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                                        {modalState.rel.source_asset_id} → {modalState.rel.relationship_type} → {modalState.rel.target_asset_id}
                                    </p>
                                </div>
                                {(() => {
                                    const relatedAssets = getRelatedAssetsForRelationship(modalState.rel);
                                    if (relatedAssets.length > 0) {
                                        return (
                                            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-3 rounded-md">
                                                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                                                    ⚠️ This asset is connected with {relatedAssets.length} other asset{relatedAssets.length !== 1 ? 's' : ''}:
                                                </p>
                                                <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                                                    {relatedAssets.map((asset, index) => (
                                                        <li key={index} className="flex items-center">
                                                            <span className="w-2 h-2 bg-yellow-400 rounded-full mr-2"></span>
                                                            {asset}
                                                        </li>
                                                    ))}
                                                </ul>
                                                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                                                    Deleting this relationship may affect these connections.
                                                </p>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}
                            </div>
                            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 rounded-b-lg flex justify-end space-x-3">
                                <button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>
                                <button onClick={handleDelete} className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md shadow-sm hover:bg-red-700">Delete</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
            <AIChatModal
                isOpen={showAIChat}
                onClose={() => setShowAIChat(false)}
                module="asset_relationships"
                onConfirm={handleAIChatConfirm}
                context={{ asset_ids: assetIds }}
            />
        </div>
    );
};
