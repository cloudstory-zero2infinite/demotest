import React, { useState, useEffect, useRef, ChangeEvent, useCallback, useMemo } from 'react';
import { InternalControl, InternalControlCreate, InternalControlUpdate, InternalControlStatus } from '../../types';
import * as SupabaseService from '../../services/supabase';
import { EyeIcon, PencilIcon, TrashIcon, PlusIcon, UploadIcon, DownloadIcon, SortUpDownIcon, SortUpIcon, SortDownIcon, XIcon } from '../Icons';
import { Modal } from '../common/Modal';
import { StatusBadge } from '../common/StatusBadge';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';
import { parseCSVLine } from '../../utils/csvParser';

// Helper function to sanitize input
const sanitizeInput = (input: string): string => {
    return input
        .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
        .replace(/javascript:/gi, '') // Remove javascript protocols
        .replace(/on\w+\s*=/gi, '') // Remove event handlers
        .trim();
};

interface InternalControlModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (control: InternalControlCreate | InternalControlUpdate, evidenceFile?: File | null) => void;
    controlToEdit: InternalControl | null;
    mode: 'add' | 'edit' | 'view';
    onEdit?: () => void;
    onDelete?: () => void;
}

const InternalControlModal: React.FC<InternalControlModalProps> = ({ isOpen, onClose, onSave, controlToEdit, mode, onEdit, onDelete }) => {
    const [formData, setFormData] = useState<Partial<InternalControlCreate>>({ compliance_tag3: [] });
    const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
    const [complianceTags, setComplianceTags] = useState<string[]>([]);
    const isViewMode = mode === 'view';
    const [tagInput, setTagInput] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const autocompleteRef = useRef<HTMLDivElement>(null);

    const defaultState: InternalControlCreate = {
        ctl_id: '',
        name: '',
        description: '',
        status: 'Not-Enforced',
        compliance_tag3: [],
        evidence_file_url: null,
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (autocompleteRef.current && !autocompleteRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    useEffect(() => {
        SupabaseService.getComplianceTags().then(setComplianceTags);
    }, []);
    const initializedRef = useRef(false);
    const prevControlToEditRef = useRef<InternalControl | null>(null);

    useEffect(() => {
        if (!isOpen) {
            initializedRef.current = false;
            prevControlToEditRef.current = null;
            return;
        }

        if (initializedRef.current && prevControlToEditRef.current === controlToEdit) {
            return;
        }

        initializedRef.current = true;
        prevControlToEditRef.current = controlToEdit;
        if (controlToEdit) {
            const sanitizedControlData = {
                ...controlToEdit,
                ctl_id: String(controlToEdit.ctl_id ?? ''),
                name: String(controlToEdit.name ?? ''),
                description: String(controlToEdit.description ?? ''),
                status: controlToEdit.status ?? 'Not-Enforced',
                compliance_tag3: Array.isArray(controlToEdit.compliance_tag3) 
                    ? controlToEdit.compliance_tag3.filter(tag => typeof tag === 'string') 
                    : [],
            };
            setFormData(sanitizedControlData);
        } else {
            setFormData({
                ...defaultState,
                ctl_id: `CTL-${Date.now()}`
            });
        }
        setEvidenceFile(null);
        setTagInput('');
        setShowSuggestions(false);
    }, [controlToEdit, isOpen]);

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

     const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setEvidenceFile(e.target.files[0]);
        }
    };
    
    const handleAddTag = (tag: string) => {
        if (tag && !formData.compliance_tag3?.includes(tag)) {
            setFormData(prev => ({ ...prev, compliance_tag3: [...(prev.compliance_tag3 || []), tag] }));
        }
    };
    
    const handleRemoveTag = (tagToRemove: string) => {
        setFormData(prev => ({ ...prev, compliance_tag3: (prev.compliance_tag3 || []).filter(tag => tag !== tagToRemove) }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData as InternalControlCreate | InternalControlUpdate, evidenceFile);
    };
    
    const filteredAutocompleteTags = useMemo(() => {
        const availableTags = complianceTags.filter(t => !(formData.compliance_tag3 || []).includes(t));
        if (!tagInput) {
            return availableTags;
        }
        return availableTags.filter(tag => tag.toLowerCase().includes(tagInput.toLowerCase()));
    }, [tagInput, complianceTags, formData.compliance_tag3]);

    const title = mode === 'add' ? 'Add New Control' : mode === 'edit' ? 'Edit Control' : 'View Control';

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
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">CTL ID</label>
                        <input type="text" name="ctl_id" value={formData.ctl_id || ''} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Control Name</label>
                        <input type="text" name="name" value={formData.name || ''} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                        <textarea name="description" value={formData.description || ''} onChange={handleChange} readOnly={isViewMode} rows={3} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"></textarea>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                        <select name="status" value={formData.status || ''} onChange={handleChange} disabled={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option>Not-Enforced</option>
                            <option>InProgress</option>
                            <option>Enforced</option>
                        </select>
                    </div>
                     <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Compliance Tags</label>
                         <div className="flex flex-wrap gap-2 p-2 mt-1 border rounded-md min-h-[40px] bg-white dark:bg-gray-700 dark:border-gray-600">
                            {Array.isArray(formData.compliance_tag3) && formData.compliance_tag3.filter(tag => typeof tag === 'string').map(tag => (
                                <span key={tag} className="flex items-center gap-1 bg-blue-100 text-blue-800 text-sm font-medium px-2.5 py-0.5 rounded-full dark:bg-blue-900 dark:text-blue-300">
                                    {tag}
                                    {!isViewMode && <button type="button" onClick={() => handleRemoveTag(tag)} className="text-blue-500 hover:text-blue-700">
                                        <XIcon className="h-3 w-3"/>
                                    </button>}
                                </span>
                            ))}
                        </div>
                        {!isViewMode && (
                            <div className="relative mt-2" ref={autocompleteRef}>
                                <input 
                                    type="text"
                                    value={tagInput}
                                    onChange={(e) => {
                                        setTagInput(e.target.value);
                                        if (!showSuggestions) setShowSuggestions(true);
                                    }}
                                    onFocus={() => setShowSuggestions(true)}
                                    placeholder="-- Type to search for a tag --"
                                    className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                                {showSuggestions && filteredAutocompleteTags.length > 0 && (
                                    <ul className="absolute z-10 w-full bg-white dark:bg-gray-800 border rounded-md mt-1 max-h-40 overflow-y-auto shadow-lg">
                                        {filteredAutocompleteTags.map(tag => (
                                            <li 
                                                key={tag} 
                                                onClick={() => {
                                                    handleAddTag(tag);
                                                    setTagInput('');
                                                    setShowSuggestions(false);
                                                }}
                                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-900 dark:text-gray-200"
                                            >
                                                {tag}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Evidence File</label>
                        {!isViewMode && <input type="file" onChange={handleFileChange} className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900 dark:file:text-blue-300 dark:hover:file:bg-blue-800"/>}
                        {evidenceFile && <p className="text-xs mt-1 dark:text-gray-400">Selected for upload: {evidenceFile.name}</p>}
                        {controlToEdit?.evidence_file_url && (
                             <a href={controlToEdit.evidence_file_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">View Current Evidence</a>
                        )}
                    </div>
                </div>
                 {!isViewMode && (
                <div className="mt-6 flex justify-end space-x-3">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>
                    <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">Save</button>
                </div>
                )}
            </form>
        </Modal>
    );
};

export const InternalControlsView: React.FC = () => {
    const [controls, setControls] = useState<InternalControl[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string|null>(null);
    const [modalState, setModalState] = useState<{ type: 'add' | 'edit' | 'view' | 'delete' | null; control?: InternalControl | null }>({ type: null });
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [filter, setFilter] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof InternalControl; direction: 'ascending' | 'descending' } | null>(null);
    
    const controlStatusStyles: Record<InternalControlStatus, string> = {
        'Enforced': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
        'Not-Enforced': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
        'InProgress': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    };

    const fetchControls = useCallback(async () => {
        try {
            setError(null);
            const data = await SupabaseService.getInternalControls();
            setControls(data);
        } catch(e) {
            setError("Failed to load internal controls.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchControls();
    }, [fetchControls]);

    const filteredAndSortedControls = useMemo(() => {
        let filteredItems = [...controls];
        if (filter) {
            const lowerCaseFilter = filter.toLowerCase();
            filteredItems = filteredItems.filter(item =>
                String(item.ctl_id ?? '').toLowerCase().includes(lowerCaseFilter) ||
                String(item.name ?? '').toLowerCase().includes(lowerCaseFilter) ||
                String(item.description ?? '').toLowerCase().includes(lowerCaseFilter) ||
                (item.compliance_tag3 && item.compliance_tag3.join(' ').toLowerCase().includes(lowerCaseFilter))
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
    }, [controls, filter, sortConfig]);
    
    const requestSort = (key: keyof InternalControl) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };
    
    const getSortIconFor = (key: keyof InternalControl) => {
        if (!sortConfig || sortConfig.key !== key) {
            return <SortUpDownIcon className="h-4 w-4 ml-1 text-gray-400" />;
        }
        return sortConfig.direction === 'ascending' ? <SortUpIcon className="h-4 w-4 ml-1" /> : <SortDownIcon className="h-4 w-4 ml-1" />;
    };

    const closeModal = () => setModalState({ type: null });

    const handleSaveControl = async (formData: InternalControlCreate | InternalControlUpdate, evidenceFile?: File | null) => {
        try {
            const dataToSave = { ...formData };
            if (evidenceFile) {
                dataToSave.evidence_file_url = await SupabaseService.uploadFile(evidenceFile, 'evidence');
            }

            if (modalState.type === 'edit' && modalState.control) {
                const updatedControl = await SupabaseService.updateInternalControl(modalState.control.id, dataToSave);
                await SupabaseService.logAllActivity({
                    action: 'Updated Internal Control',
                    module: 'Governance',
                    entity_id: updatedControl.id,
                    entity_name: updatedControl.name,
                    event_data: { changes: dataToSave }
                });
            } else if (modalState.type === 'add') {
                const addedControl = await SupabaseService.addInternalControl(dataToSave as InternalControlCreate);
                 await SupabaseService.logAllActivity({
                    action: 'Created Internal Control',
                    module: 'Governance',
                    entity_id: addedControl.id,
                    entity_name: addedControl.name,
                    event_data: { details: dataToSave }
                });
            }
            fetchControls();
            closeModal();
        } catch (err: any) {
            console.error(err);
            if (err.status === 409) {
                setError('Control with this CTL ID already exists. Please use a different CTL ID.');
            } else {
                setError('Failed to save control.');
            }
        }
    };

    const handleDeleteControl = async () => {
        if (modalState.type === 'delete' && modalState.control) {
            try {
                await SupabaseService.deleteInternalControl(modalState.control.id);
                await SupabaseService.logAllActivity({
                    action: 'Deleted Internal Control',
                    module: 'Governance',
                    entity_id: modalState.control.id,
                    entity_name: modalState.control.name
                });
                fetchControls();
                closeModal();
            } catch (err) {
                setError('Failed to delete control.');
            }
        }
    };

    const handleImportCSV = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            if (!text) return;

            try {
                const allLines = text.split('\n').filter(line => line.trim());
                
                if (allLines.length === 0) {
                    alert('CSV file is empty or contains only whitespace.');
                    return;
                }
                
                const lines = allLines.slice(1); // Skip header row
                
                if (lines.length === 0) {
                    alert('No data rows found in CSV file after header.');
                    return;
                }
                
                const validStatuses: InternalControlStatus[] = ['Not-Enforced', 'InProgress', 'Enforced'];
                const importedControls: InternalControlCreate[] = lines
                    .map((line): InternalControlCreate | null => {
                        // Properly parse CSV fields with quote handling
                        const fields = parseCSVLine(line);
                        const [ctl_id, name, description, status, compliance_tags] = fields;
                        
                        // Validate required fields
                        if (!ctl_id || !ctl_id.trim()) {
                            console.log('Skipping - missing ctl_id');
                            return null;
                        }
                        
                        if (!name || !name.trim()) {
                            console.log('Skipping - missing name');
                            return null;
                        }
                        
                        if (!status || !status.trim()) {
                            console.log('Skipping - missing status');
                            return null;
                        }
                        
                        // Sanitize input
                        const cleanCtlId = sanitizeInput(ctl_id.trim());
                        const cleanName = sanitizeInput(name.trim());
                        const cleanDescription = description ? sanitizeInput(description.trim()) : null;
                        const cleanStatus = sanitizeInput(status.trim());
                        
                        if (!validStatuses.includes(cleanStatus as InternalControlStatus)) {
                            console.log('Skipping - invalid status:', cleanStatus);
                            return null;
                        }

                        return {
                            ctl_id: cleanCtlId,
                            name: cleanName,
                            description: cleanDescription,
                            status: cleanStatus as InternalControlStatus,
                            compliance_tag3: compliance_tags ? compliance_tags.split('|').map(t => sanitizeInput(t.trim())).filter(t => t) : [],
                        };
                    })
                    .filter((control): control is InternalControlCreate => control !== null);
                
                if (importedControls.length > 0) {
                    // Get existing controls to find duplicates
                    const existingControls = await SupabaseService.getInternalControls();
                    const controlsToUpdate: { id: string; updates: InternalControlUpdate }[] = [];
                    const controlsToAdd: InternalControlCreate[] = [];
                    
                    for (const importedControl of importedControls) {
                        // Find existing control by ctl_id
                        const existingControl = existingControls.find(
                            c => c.ctl_id === importedControl.ctl_id
                        );
                        
                        if (existingControl) {
                            // Check if anything actually changed
                            const hasChanges = 
                                existingControl.name !== importedControl.name ||
                                existingControl.description !== importedControl.description ||
                                existingControl.status !== importedControl.status ||
                                JSON.stringify(existingControl.compliance_tag3 || []) !== JSON.stringify(importedControl.compliance_tag3 || []);
                            
                            if (hasChanges) {
                                controlsToUpdate.push({
                                    id: existingControl.id,
                                    updates: {
                                        name: importedControl.name,
                                        description: importedControl.description,
                                        status: importedControl.status,
                                        compliance_tag3: importedControl.compliance_tag3
                                    }
                                });
                            }
                        } else {
                            controlsToAdd.push(importedControl);
                        }
                    }
                    
                    let totalProcessed = 0;
                    
                    // Update existing controls
                    if (controlsToUpdate.length > 0) {
                        for (const { id, updates } of controlsToUpdate) {
                            await SupabaseService.updateInternalControl(id, updates);
                            totalProcessed++;
                        }
                    }
                    
                    // Add new controls
                    if (controlsToAdd.length > 0) {
                        await SupabaseService.bulkAddInternalControls(controlsToAdd);
                        totalProcessed += controlsToAdd.length;
                    }
                    
                    if (totalProcessed > 0) {
                        await SupabaseService.logAllActivity({
                            action: 'Imported Controls',
                            module: 'Governance',
                            event_data: { 
                                total: importedControls.length,
                                added: controlsToAdd.length,
                                updated: controlsToUpdate.length
                            }
                        });
                        
                        alert(`${totalProcessed} controls processed (${controlsToAdd.length} added, ${controlsToUpdate.length} updated) successfully!`);
                        fetchControls();
                    } else {
                        alert('No changes detected in imported data.');
                    }
                } else {
                    alert('No valid data found in the CSV file.');
                }
            } catch (err) {
                console.error('Import error:', err);
                alert('Failed to import controls. Please check the file format and ensure all required fields are present.');
            }
        };
        reader.readAsText(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleExportCSV = () => {
        const headers = ['ctl_id', 'name', 'description', 'status', 'compliance_tags'];
        const csvContent = [
            headers.join(','),
            ...filteredAndSortedControls.map(c =>
                [
                    c.ctl_id,
                    `"${(c.name || '').replace(/"/g, '""')}"`,
                    `"${(c.description || '').replace(/"/g, '""')}"`,
                    c.status || '',
                    `"${(c.compliance_tag3 || []).join('|')}"`,
                ].join(',')
            ),
        ].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `internal-controls-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

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
                        aria-label="Filter internal controls"
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
                    <button onClick={() => setModalState({ type: 'add' })} title="Add Control" className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        <PlusIcon className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}

            <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg dark:border-gray-700">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                           <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('ctl_id')} className="flex items-center w-full text-left focus:outline-none">
                                        CTL ID {getSortIconFor('ctl_id')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('name')} className="flex items-center w-full text-left focus:outline-none">
                                        Name {getSortIconFor('name')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('status')} className="flex items-center w-full text-left focus:outline-none">
                                        Status {getSortIconFor('status')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Compliance Tags</th>
                            </tr>
                        </thead>
                         <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={4} className="text-center py-4 text-gray-500 dark:text-gray-400">Loading controls...</td></tr>
                            ) : filteredAndSortedControls.length === 0 ? (
                                <tr><td colSpan={4} className="text-center py-4 text-gray-500 dark:text-gray-400">No controls found.</td></tr>
                            ) : filteredAndSortedControls.map(control => (
                                <tr key={control.id} onClick={() => setModalState({ type: 'view', control })} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{String(control.ctl_id ?? '')}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900 dark:text-white">{String(control.name ?? '')}</div>
                                        <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">{String(control.description ?? '')}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {control.status && <StatusBadge status={control.status} colorMap={controlStatusStyles} />}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex flex-wrap gap-1 max-w-xs">
                                            {Array.isArray(control.compliance_tag3) && control.compliance_tag3.filter(tag => typeof tag === 'string').map(tag => (
                                                <span key={tag} className="px-2 py-1 text-xs font-semibold text-blue-800 bg-blue-100 rounded-full dark:bg-blue-900 dark:text-blue-300">{tag}</span>
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <InternalControlModal
                isOpen={modalState.type === 'add' || modalState.type === 'edit' || modalState.type === 'view'}
                onClose={closeModal}
                onSave={handleSaveControl}
                controlToEdit={modalState.control || null}
                mode={modalState.type as 'add' | 'edit' | 'view'}
                onEdit={() => { if (modalState.control) setModalState({ type: 'edit', control: modalState.control }); }}
                onDelete={() => { if (modalState.control) setModalState({ type: 'delete', control: modalState.control }); }}
            />
            <DeleteConfirmationModal
                isOpen={modalState.type === 'delete'}
                onClose={closeModal}
                onConfirm={handleDeleteControl}
                itemName="internal control"
            />
        </div>
    );
};
