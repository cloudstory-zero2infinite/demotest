import React, { useState, useEffect, useCallback, useRef, ChangeEvent, useMemo } from 'react';
import { Vulnerability, VulnerabilityCreate, VulnerabilityUpdate, VulnerabilityStatus, VulnerabilitySource, Asset } from '../../types';
import * as SupabaseService from '../../services/supabase';
import { EyeIcon, PencilIcon, TrashIcon, PlusIcon, UploadIcon, DownloadIcon, SortUpDownIcon, SortUpIcon, SortDownIcon, BotIcon } from '../Icons';
import { Modal } from '../common/Modal';
import { StatusBadge } from '../common/StatusBadge';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';
import { useTableSelection } from '../../hooks/useTableSelection';
import { SelectionActionBar } from '../common/SelectionActionBar';
import { AIChatModal } from '../common/AIChatModal';
import * as XLSX from 'xlsx';

// Helper function to parse CSV line with proper quote handling
const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++; // Skip next quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current.trim());
    return result;
};

// Helper function to parse CSV fields from a line
const parseCSVFields = (line: string): string[] => {
    const fields = parseCSVLine(line).map(field => field.replace(/^"(.*)"$/, '$1').trim());
    
    // Handle Excel scientific notation and clean up problematic values
    return fields.map(field => {
        // Convert Excel scientific notation back to regular string
        if (field.includes('E+') || field.includes('E-')) {
            // Check if it's actually a number in scientific notation
            const scientificMatch = field.match(/^(\d+\.?\d*)[Ee]([+-]?\d+)$/);
            if (scientificMatch) {
                const [, base, exponent] = scientificMatch;
                const num = parseFloat(base) * Math.pow(10, parseInt(exponent));
                // If it's a reasonable integer, convert to string, otherwise keep as is
                if (Number.isInteger(num) && num > 0 && num < 1e20) {
                    return num.toString();
                }
            }
        }
        
        // Clean up excessive quotes
        if (field.startsWith('"') && field.endsWith('"')) {
            // Remove outer quotes and unescape inner quotes
            field = field.slice(1, -1).replace(/""/g, '"');
        }
        
        // Handle fields that are just repeated quotes
        if (field.match(/^"+$/)) {
            return '';
        }
        
        return field;
    });
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

interface VulnerabilityModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (vulnerability: VulnerabilityCreate | VulnerabilityUpdate) => void;
    vulnerabilityToEdit: Vulnerability | null;
    mode: 'add' | 'edit' | 'view';
}

const VulnerabilityModal: React.FC<VulnerabilityModalProps> = ({ isOpen, onClose, onSave, vulnerabilityToEdit, mode }) => {
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
            setFormData({ name, description, derived_from, status, asset_id });

            if (vulnerabilityToEdit.asset_id && allAssets.length > 0) {
                const linkedAsset = allAssets.find(a => a.id === vulnerabilityToEdit.asset_id);
                if (linkedAsset) {
                    setAssetSearchText(`${linkedAsset.name} (${linkedAsset.asset_id})`);
                }
            } else {
                setAssetSearchText('');
            }
        } else {
            setFormData({ name: '', description: '', derived_from: 'Scanning', status: 'Planned', asset_id: null });
            setAssetSearchText('');
        }
    }, [vulnerabilityToEdit, isOpen, allAssets]);

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
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
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
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
                           <option>Planned</option><option>Remediated</option><option>NA</option>
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

export const VulnerabilitiesView: React.FC = () => {
    const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [modalState, setModalState] = useState<{ type: 'add' | 'edit' | 'view' | 'delete' | null; vulnerability?: Vulnerability | null }>({ type: null });
    const [filter, setFilter] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof Vulnerability; direction: 'ascending' | 'descending' } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showAIChat, setShowAIChat] = useState(false);

    const {
        selectedIds, isEditing, editValues, isConfirmingDelete, isSaving,
        setIsConfirmingDelete, setIsSaving,
        toggle, toggleAll, clearAll, startEdit, updateField, cancelEdit,
    } = useTableSelection<Vulnerability>();

    const vulnerabilityStatusStyles: Record<VulnerabilityStatus, string> = {
        'Planned': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
        'Remediated': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
        'NA': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    };

    const fetchVulnerabilities = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await SupabaseService.getVulnerabilities();
            setVulnerabilities(data);
        } catch (e) {
            setError("Failed to load vulnerabilities.");
        } finally {
            setLoading(false);
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

    useEffect(() => {
        fetchVulnerabilities();
    }, [fetchVulnerabilities]);

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

    const requestSort = (key: keyof Vulnerability) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
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
        try {
            setIsSaving(true);
            for (const id of selectedIds) {
                await SupabaseService.deleteVulnerability(id as string);
            }
            clearAll();
            fetchVulnerabilities();
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

    const handleImportCSV = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        
        // Set read method based on file type
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            reader.readAsBinaryString(file);
        } else {
            reader.readAsText(file);
        }
        
        reader.onload = async (e) => {
            const content = e.target?.result;
            if (!content) return;
            
            let lines: string[] = [];
            const validSources: VulnerabilitySource[] = ['KEV', 'Scanning', 'PT', 'Reported-Ext'];
            const validStatuses: VulnerabilityStatus[] = ['Planned', 'Remediated', 'NA'];
            
            // Check if it's an Excel file or CSV
            if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                // Parse Excel file
                try {
                    const workbook = XLSX.read(content, { type: 'binary' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];
                    
                    console.log('Excel data parsed:', data);
                    
                    // Skip header row and filter empty rows
                    lines = data.slice(1).filter(row => row.some(cell => cell && cell.toString().trim()))
                        .map(row => row.join(','));
                    
                    console.log('Processed lines:', lines);
                } catch (err) {
                    console.error('Excel parsing error:', err);
                    alert('Failed to parse Excel file. Please check the file format.');
                    return;
                }
            } else {
                // Parse CSV file with proper quote handling
                const text = content as string;
                const allLines = text.split('\n').filter(line => line.trim());
                
                if (allLines.length === 0) {
                    alert('CSV file is empty or contains only whitespace.');
                    return;
                }
                
                // Parse CSV with proper quote handling
                lines = allLines.slice(1).filter(line => line.trim());
                
                if (lines.length === 0) {
                    alert('No data rows found in CSV file after header.');
                    return;
                }
            }
            
            console.log('Final lines to process:', lines);
            
            const importedVulns: VulnerabilityCreate[] = lines
                .map((line): VulnerabilityCreate | null => {
                    // Properly parse CSV fields with quote handling
                    const fields = parseCSVFields(line);
                    const [name, description, derived_from, status, asset_name, asset_id] = fields;
                    
                    console.log('Processing line:', line, 'Fields:', fields);
                    
                    // Validate required fields
                    if (!name || !name.trim()) {
                        console.log('Skipping - missing name');
                        return null;
                    }
                    
                    if (!derived_from || !derived_from.trim()) {
                        console.log('Skipping - missing derived_from');
                        return null;
                    }
                    
                    if (!status || !status.trim()) {
                        console.log('Skipping - missing status');
                        return null;
                    }
                    
                    // Sanitize input
                    const cleanName = sanitizeInput(name.trim());
                    const cleanDescription = description ? sanitizeInput(description.trim()) : null;
                    const cleanDerivedFrom = sanitizeInput(derived_from.trim());
                    const cleanStatus = sanitizeInput(status.trim());
                    const cleanAssetId = asset_id ? sanitizeInput(asset_id.trim()) : null;
                    
                    if (!validSources.includes(cleanDerivedFrom as VulnerabilitySource)) {
                        console.log('Skipping - invalid source:', cleanDerivedFrom);
                        return null;
                    }
                    if (!validStatuses.includes(cleanStatus as VulnerabilityStatus)) {
                        console.log('Skipping - invalid status:', cleanStatus);
                        return null;
                    }
                    
                    return { 
                        name: cleanName, 
                        description: cleanDescription, 
                        derived_from: cleanDerivedFrom as VulnerabilitySource, 
                        status: cleanStatus as VulnerabilityStatus, 
                        asset_id: cleanAssetId 
                    };
                })
                .filter((v): v is VulnerabilityCreate => v !== null);
            
            console.log('Final imported vulnerabilities:', importedVulns);

            if (importedVulns.length > 0) {
                try {
                    // Get existing vulnerabilities and assets for lookups
                    const existingVulns = await SupabaseService.getVulnerabilities();
                    const allAssets = await SupabaseService.getAssets();
                    const vulnsToUpdate: { id: string; updates: VulnerabilityUpdate }[] = [];
                    const vulnsToAdd: VulnerabilityCreate[] = [];

                    for (const importedVuln of importedVulns) {
                        // Handle asset_id lookup - if CSV provides asset_id, find the corresponding UUID
                        let assetUuid: string | null = null;
                        if (importedVuln.asset_id) {
                            console.log(`Looking up asset with asset_id: "${importedVuln.asset_id}"`);
                            console.log('Available assets:', allAssets.map(a => ({ id: a.id, asset_id: a.asset_id, name: a.name })));
                            
                            const matchingAsset = allAssets.find(asset => {
                                const assetIdMatch = asset.asset_id === importedVuln.asset_id;
                                const uuidMatch = asset.id === importedVuln.asset_id;
                                const nameMatch = asset.name === importedVuln.asset_id;
                                return assetIdMatch || uuidMatch || nameMatch;
                            });
                            
                            if (matchingAsset) {
                                assetUuid = matchingAsset.id;
                                console.log(`Found matching asset: ${matchingAsset.name} (${matchingAsset.asset_id}) -> UUID: ${assetUuid}`);
                            } else {
                                console.log(`Asset not found for asset_id: "${importedVuln.asset_id}", setting to null`);
                                console.log('Tried matching against asset_id, UUID, and name fields');
                                assetUuid = null;
                            }
                        }

                        // Update the vulnerability with the correct UUID
                        const vulnWithCorrectAssetId = {
                            ...importedVuln,
                            asset_id: assetUuid
                        };

                        // Find existing vulnerability by name
                        const existingVuln = existingVulns.find(
                            v => v.name === importedVuln.name
                        );

                        if (existingVuln) {
                            // Check if anything actually changed
                            const hasChanges =
                                existingVuln.description !== importedVuln.description ||
                                existingVuln.derived_from !== importedVuln.derived_from ||
                                existingVuln.status !== importedVuln.status ||
                                existingVuln.asset_id !== assetUuid;

                            if (hasChanges) {
                                vulnsToUpdate.push({
                                    id: existingVuln.id,
                                    updates: {
                                        description: importedVuln.description,
                                        derived_from: importedVuln.derived_from,
                                        status: importedVuln.status,
                                        asset_id: assetUuid
                                    }
                                });
                            }
                        } else {
                            vulnsToAdd.push(vulnWithCorrectAssetId);
                        }
                    }

                    let totalProcessed = 0;

                    // Update existing vulnerabilities
                    if (vulnsToUpdate.length > 0) {
                        for (const { id, updates } of vulnsToUpdate) {
                            await SupabaseService.updateVulnerability(id, updates);
                            totalProcessed++;
                        }
                    }

                    // Add new vulnerabilities
                    if (vulnsToAdd.length > 0) {
                        for (const vuln of vulnsToAdd) {
                            await SupabaseService.addVulnerability(vuln);
                            totalProcessed++;
                        }
                    }

                    if (totalProcessed > 0) {
                        await SupabaseService.logAllActivity({
                            action: 'Imported Vulnerabilities',
                            module: 'Governance',
                            event_data: {
                                total: importedVulns.length,
                                added: vulnsToAdd.length,
                                updated: vulnsToUpdate.length
                            }
                        });

                        alert(`${totalProcessed} vulnerabilities processed (${vulnsToAdd.length} added, ${vulnsToUpdate.length} updated) successfully!`);
                        fetchVulnerabilities();
                    } else {
                        alert('No changes detected in imported data.');
                    }
                } catch (err) {
                    console.error('Import error:', err);
                    alert('Failed to import vulnerabilities. Please check the file format.');
                }
            } else {
                alert('No valid data found in the CSV file.');
            }
        };
        reader.readAsText(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleExportCSV = () => {
        const headers = ['name', 'description', 'derived_from', 'status', 'asset_name', 'asset_id'];
        const csvContent = [
            headers.join(','),
            ...filteredAndSortedVulnerabilities.map(v =>
                [
                    `"${(v.name || '').replace(/"/g, '""')}"`,
                    `"${(v.description || '').replace(/"/g, '""')}"`,
                    v.derived_from,
                    v.status,
                    `"${(v.assets?.name || '').replace(/"/g, '""')}"`,
                    v.assets?.asset_id || '',
                ].join(',')
            ),
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
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 w-10 px-4 py-3">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.size === filteredAndSortedVulnerabilities.length && filteredAndSortedVulnerabilities.length > 0}
                                        onChange={() => toggleAll(filteredAndSortedVulnerabilities.map(i => i.id))}
                                        className="rounded border-gray-300 dark:border-gray-600 cursor-pointer"
                                    />
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('name')} className="flex items-center w-full text-left focus:outline-none">Name {getSortIconFor('name')}</button>
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Associated Asset</th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('derived_from')} className="flex items-center w-full text-left focus:outline-none">Source {getSortIconFor('derived_from')}</button>
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('status')} className="flex items-center w-full text-left focus:outline-none">Status {getSortIconFor('status')}</button>
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={6} className="text-center py-4 text-gray-500 dark:text-gray-400">Loading vulnerabilities...</td></tr>
                            ) : filteredAndSortedVulnerabilities.length === 0 ? (
                                <tr><td colSpan={6} className="text-center py-4 text-gray-500 dark:text-gray-400">No vulnerabilities found.</td></tr>
                            ) : filteredAndSortedVulnerabilities.map(vuln => (
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
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {isEditing && selectedIds.has(vuln.id) ? (
                                            <input type="text" value={editValues[vuln.id]?.name ?? vuln.name} onChange={e => updateField(vuln.id, 'name', e.target.value)} className={editInputCls} />
                                        ) : (
                                            <>
                                                <div className="text-sm font-medium text-gray-900 dark:text-white">{vuln.name}</div>
                                                <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">{vuln.description}</div>
                                            </>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {vuln.assets ? `${vuln.assets.name} (${vuln.assets.asset_id})` : 'N/A'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {isEditing && selectedIds.has(vuln.id) ? (
                                            <select value={editValues[vuln.id]?.derived_from ?? vuln.derived_from} onChange={e => updateField(vuln.id, 'derived_from', e.target.value as any)} className={editSelectCls}><option>KEV</option><option>Scanning</option><option>PT</option><option>Reported-Ext</option></select>
                                        ) : vuln.derived_from}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {isEditing && selectedIds.has(vuln.id) ? (
                                            <select value={editValues[vuln.id]?.status ?? vuln.status} onChange={e => updateField(vuln.id, 'status', e.target.value as any)} className={editSelectCls}><option>Planned</option><option>Remediated</option><option>NA</option></select>
                                        ) : <StatusBadge status={vuln.status} colorMap={vulnerabilityStatusStyles} />}
                                    </td>
                                    <td onClick={e => e.stopPropagation()} className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        {!isEditing && (
                                            <div className="flex justify-end items-center space-x-2">
                                                <button onClick={() => setModalState({ type: 'view', vulnerability: vuln })} className="text-gray-400 hover:text-green-500"><EyeIcon className="h-5 w-5" /></button>
                                                <button onClick={() => setModalState({ type: 'edit', vulnerability: vuln })} className="text-gray-400 hover:text-yellow-500"><PencilIcon className="h-5 w-5" /></button>
                                                <button onClick={() => setModalState({ type: 'delete', vulnerability: vuln })} className="text-gray-400 hover:text-red-500"><TrashIcon className="h-5 w-5" /></button>
                                            </div>
                                        )}
                                    </td>
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
            />
            <DeleteConfirmationModal isOpen={modalState.type === 'delete'} onClose={closeModal} onConfirm={handleDeleteVulnerability} itemName="vulnerability" />
            <SelectionActionBar
                selectedCount={selectedIds.size}
                isEditing={isEditing}
                isConfirmingDelete={isConfirmingDelete}
                isSaving={isSaving}
                onEdit={() => startEdit(filteredAndSortedVulnerabilities.filter(i => selectedIds.has(i.id)), i => i.id)}
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
                module="vulnerabilities"
                onConfirm={handleAIChatConfirm}
            />
        </div>
    );
};
