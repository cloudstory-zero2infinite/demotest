import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useUnifiedRefresh } from '../../hooks/useUnifiedRefresh';
import * as SupabaseService from '../../services/supabase';
import { AssetRelationship, AssetRelationshipCreate } from '../../types';
import { EyeIcon, PencilIcon, TrashIcon, PlusIcon, UploadIcon, DownloadIcon, SortUpDownIcon, SortUpIcon, SortDownIcon, BotIcon } from '../Icons';
import { parseCSVLine } from '../../utils/csvParser';
import { Modal } from '../common/Modal';
import { BulkProgressModal, BulkProgress } from '../common/BulkProgressModal';
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
    onEdit?: () => void;
    onDelete?: () => void;
}

const AssetRelationshipModal: React.FC<AssetRelationshipModalProps> = ({ isOpen, onClose, onSave, relToEdit, mode, assetIds, onEdit, onDelete }) => {
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
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
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
        </Modal>
    );
};

export const AssetRelationshipsView: React.FC<{ isActive?: boolean }> = ({ isActive = true }) => {
    const [relationships, setRelationships] = useState<AssetRelationship[]>([]);
    const [assets, setAssets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [modalState, setModalState] = useState<{ type: 'add' | 'edit' | 'view' | 'delete' | null; rel?: AssetRelationship | null }>({ type: null });
    const [filter, setFilter] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof AssetRelationship; direction: 'ascending' | 'descending' } | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(100);
    const [importData, setImportData] = useState<{ newRels: AssetRelationshipCreate[]; skipped: number; addedCount?: number }>({ newRels: [], skipped: 0 });
    const [showAIChat, setShowAIChat] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Progress tracking for bulk operations
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState(0);
    const [totalToImport, setTotalToImport] = useState(0);
    const [importedCount, setImportedCount] = useState(0);
    const [importErrors, setImportErrors] = useState(0);
    const [bulkProgress, setBulkProgress] = useState<BulkProgress>({ total: 0, completed: 0, failed: 0, status: 'idle' });

    const {
        selectedIds, isEditing, editValues, isConfirmingDelete, isSaving,
        setIsConfirmingDelete, setIsSaving,
        toggle, toggleAll, clearAll, startEdit, updateField, cancelEdit,
    } = useTableSelection<AssetRelationship>();

    const editInputCls = "w-full border border-blue-300 dark:border-blue-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400";
    const editSelectCls = "border border-blue-300 dark:border-blue-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400";

    const fetchData = useCallback(async () => {
        try {
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

    useUnifiedRefresh(isActive, fetchData);

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

    // Pagination: Get current page items
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedRelationships = filteredAndSorted.slice(startIndex, endIndex);

    // Reset to page 1 when filter changes to prevent empty pages
    React.useEffect(() => {
        setCurrentPage(1);
    }, [filter]);

    const requestSort = (key: keyof AssetRelationship) => {
        setSortConfig(prev => ({ key, direction: prev?.key === key && prev.direction === 'ascending' ? 'descending' : 'ascending' }));
    };

    const getSortIconFor = (key: keyof AssetRelationship) => {
        if (!sortConfig || sortConfig.key !== key) return <SortUpDownIcon className="h-4 w-4 ml-1 text-gray-400" />;
        return sortConfig.direction === 'ascending' ? <SortUpIcon className="h-4 w-4 ml-1" /> : <SortDownIcon className="h-4 w-4 ml-1" />;
    };

    const closeModal = () => setModalState({ type: null });

    const handleSave = async (rel: AssetRelationshipCreate) => {
        try {
            if (modalState.type === 'edit' && modalState.rel) {
                await SupabaseService.updateAssetRelationship(modalState.rel.id, rel);
                await SupabaseService.logAllActivity({
                    action: 'Updated Asset Relationship',
                    module: 'Governance',
                    entity_id: modalState.rel.id,
                    entity_name: `${rel.source_asset_id} ${rel.relationship_type} ${rel.target_asset_id}`,
                    event_data: { updated_relationship: rel }
                });
            } else if (modalState.type === 'add') {
                await SupabaseService.addAssetRelationship(rel);
                await SupabaseService.logAllActivity({
                    action: 'Created Asset Relationship',
                    module: 'Governance',
                    entity_id: null,
                    entity_name: `${rel.source_asset_id} ${rel.relationship_type} ${rel.target_asset_id}`,
                    event_data: { new_relationship: rel }
                });
            }
            fetchData();
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
                    entity_name: `${modalState.rel.source_asset_id} ${modalState.rel.relationship_type} ${modalState.rel.target_asset_id}`,
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
            
            // Initialize bulk progress for delete
            const totalToDelete = selectedIds.size;
            const selectedIdsArray = Array.from(selectedIds) as string[];
            
            setBulkProgress({
                total: totalToDelete,
                completed: 0,
                failed: 0,
                status: 'processing'
            });

            // Simulate progress updates during bulk delete for better UX
            const progressInterval = setInterval(() => {
                setBulkProgress(prev => {
                    if (prev.status === 'processing' && prev.completed < prev.total) {
                        const progress = Math.min(prev.completed + Math.floor(totalToDelete / 10), totalToDelete - 1);
                        return { ...prev, completed: progress };
                    }
                    return prev;
                });
            }, 300);

            // Use enhanced bulk delete API with progress tracking
            const result = await SupabaseService.deleteAssetRelationshipsBulk(selectedIdsArray);
            
            // Clear the interval and show final results
            clearInterval(progressInterval);
            
            // Update progress to actual results
            setBulkProgress({
                total: totalToDelete,
                completed: result.deleted,
                failed: result.errors,
                status: result.errors > 0 ? 'warning' : 'done'
            });

            await SupabaseService.logAllActivity({
                action: 'Bulk Deleted Asset Relationships',
                module: 'Governance',
                entity_id: null,
                entity_name: `${result.deleted} relationships deleted${result.errors > 0 ? ` (${result.errors} errors)` : ''}`,
                event_data: { 
                    count: result.deleted,
                    errors: result.errors,
                    total: totalToDelete,
                    deleted_ids: selectedIdsArray,
                    error_details: result.errorDetails
                }
            });

            clearAll();
            
            // Keep progress modal visible longer to show results
            setTimeout(() => {
                fetchData(); // Refresh data to show changes
                setBulkProgress({ total: 0, completed: 0, failed: 0, status: 'idle' });
            }, result.errors > 0 ? 3000 : 2000);

        } catch (err) {
            console.error('Bulk delete error:', err);
            setError(`Failed to delete selected relationships: ${err.message || 'Unknown error'}`);
            setBulkProgress({
                total: selectedIds.size,
                completed: 0,
                failed: selectedIds.size,
                status: 'error'
            });
            
            // Keep error modal visible longer
            setTimeout(() => {
                setBulkProgress({ total: 0, completed: 0, failed: 0, status: 'idle' });
            }, 3000);
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

    const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            if (!text) return;
            const lines = text.split('\n').slice(1);
            const parsed = lines.map(line => {
                const cols = parseCSVLine(line);
                const [source_asset_id, target_asset_id, relationship_type] = cols;
                return { source_asset_id, target_asset_id, relationship_type: relationship_type || 'Connected To' };
            }).filter(r => r.source_asset_id && r.target_asset_id);
            setImportData({ newRels: parsed, skipped: 0 });
            setModalState({ type: 'import' });
        };
        reader.readAsText(file);
    };

    const handleExportCSV = () => {
        const headers = ['source_asset_id', 'target_asset_id', 'relationship_type'];
        const csvContent = [
            headers.join(','),
            ...filteredAndSorted.map(r => [
                r.source_asset_id,
                r.target_asset_id,
                `"${r.relationship_type}"`
            ].join(','))
        ].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `asset-relationships-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
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

            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}

            <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg dark:border-gray-700">
                <div className="overflow-auto max-h-[calc(100vh-280px)]">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 w-10 px-4 py-3">
                                    <input
                                        type="checkbox"
                                        checked={filteredAndSorted.length > 0 && filteredAndSorted.every(i => selectedIds.has(i.id))}
                                        onChange={() => toggleAll(filteredAndSorted.map(i => i.id))}
                                        className="rounded border-gray-300 dark:border-gray-600 cursor-pointer"
                                    />
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('source_asset_id')} className="flex items-center w-full text-left focus:outline-none">Source Asset {getSortIconFor('source_asset_id')}</button>
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('relationship_type')} className="flex items-center w-full text-left focus:outline-none">Relationship {getSortIconFor('relationship_type')}</button>
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('target_asset_id')} className="flex items-center w-full text-left focus:outline-none">Target Asset {getSortIconFor('target_asset_id')}</button>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={4} className="text-center py-4 text-gray-500 dark:text-gray-400">Loading relationships...</td></tr>
                            ) : paginatedRelationships.length === 0 ? (
                                <tr><td colSpan={4} className="text-center py-4 text-gray-500 dark:text-gray-400">No relationships found.</td></tr>
                            ) : paginatedRelationships.map(rel => (
                                <tr
                                    key={rel.id}
                                    onClick={() => !isEditing && setModalState({ type: 'view', rel })}
                                    className={`cursor-pointer transition-colors ${
                                        selectedIds.has(rel.id) ? 'bg-blue-50 dark:bg-blue-900/20' :
                                        'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                    } ${isEditing && !selectedIds.has(rel.id) ? 'opacity-40 pointer-events-none' : ''}`}
                                >
                                    <td onClick={e => e.stopPropagation()} className="w-10 px-4 py-4">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(rel.id)}
                                            onChange={() => toggle(rel.id)}
                                            className="rounded border-gray-300 dark:border-gray-600 cursor-pointer"
                                        />
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
                                            <select value={editValues[rel.id]?.relationship_type ?? rel.relationship_type} onChange={e => updateField(rel.id, 'relationship_type', e.target.value)} className={editSelectCls}>
                                                {RELATIONSHIP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
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
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination Controls */}
            {filteredAndSorted.length > 0 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 mt-6">
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={() => setCurrentPage(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                        >
                            Previous
                        </button>
                        <div className="px-4 py-1 text-sm text-gray-700 dark:text-gray-300 bg-white border border-gray-300 rounded-md shadow-sm dark:bg-gray-800 dark:border-gray-600">
                            {currentPage} of {Math.ceil(filteredAndSorted.length / itemsPerPage)}
                        </div>
                        <button
                            onClick={() => setCurrentPage(currentPage + 1)}
                            disabled={currentPage === Math.ceil(filteredAndSorted.length / itemsPerPage)}
                            className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                        >
                            Next
                        </button>
                    </div>
                    <div className="flex items-center space-x-4">
                        <div className="text-sm text-gray-700 dark:text-gray-300">
                            Showing {startIndex + 1} to {Math.min(endIndex, filteredAndSorted.length)} of {filteredAndSorted.length} results
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
                </div>
            )}

            {/* Add / Edit / View Modal */}
            <AssetRelationshipModal
                isOpen={modalState.type === 'add' || modalState.type === 'edit' || modalState.type === 'view'}
                onClose={() => setModalState({ type: null })}
                onSave={handleSave}
                relToEdit={modalState.rel ?? null}
                mode={modalState.type as 'add' | 'edit' | 'view'}
                assetIds={assetIds}
                onEdit={() => setModalState({ type: 'edit', rel: modalState.rel })}
                onDelete={() => setModalState({ type: 'delete', rel: modalState.rel })}
            />

            {/* Delete Confirm Modal */}
            {modalState.type === 'delete' && modalState.rel && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex min-h-screen items-center justify-center p-4">
                        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                            <div className="px-6 py-4">
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Delete Relationship</h3>
                            </div>
                            <div className="p-6">
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Are you sure you want to delete this relationship?</p>
                                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-md mb-4">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">{modalState.rel.source_asset_id} {'>'} {modalState.rel.target_asset_id}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Type: {modalState.rel.relationship_type}</p>
                                </div>
                            </div>
                            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 rounded-b-lg flex justify-end space-x-3">
                                <button onClick={() => setModalState({ type: null })} disabled={isSaving} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed">Cancel</button>
                                <button onClick={handleDelete} disabled={isSaving} className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md shadow-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">{isSaving ? 'Deleting...' : 'Delete'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Chat Modal */}
            <AIChatModal
                isOpen={showAIChat}
                onClose={() => setShowAIChat(false)}
                module="asset_relationships"
                onConfirm={handleAIChatConfirm}
            />

            {/* Bulk Progress Modal */}
            <BulkProgressModal
                isOpen={bulkProgress.status !== 'idle'}
                title="Deleting Relationships"
                progress={bulkProgress}
                onClose={() => setBulkProgress({ total: 0, completed: 0, failed: 0, status: 'idle' })}
            />
        </div>
    );
};
