import React, { useState, useEffect, useCallback, useRef, ChangeEvent, useMemo } from 'react';
import { PolicyDocument, PolicyDocumentCreate, PolicyDocumentUpdate, DocumentContentType, PolicyStatus } from '../../types';
import * as SupabaseService from '../../services/supabase';
import { EyeIcon, PencilIcon, TrashIcon, PlusIcon, UploadIcon, DownloadIcon, SortUpDownIcon, SortUpIcon, SortDownIcon } from '../Icons';
import { Modal } from '../common/Modal';
import { StatusBadge } from '../common/StatusBadge';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';

interface PolicyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (policy: PolicyDocumentCreate | PolicyDocumentUpdate, documentFile?: File | null) => void;
    policyToEdit: PolicyDocument | null;
    mode: 'add' | 'edit' | 'view';
}

const PolicyModal: React.FC<PolicyModalProps> = ({ isOpen, onClose, onSave, policyToEdit, mode }) => {
    const today = new Date().toISOString().split('T')[0];
    const [formData, setFormData] = useState<Partial<PolicyDocumentCreate> & { id?: string }>({});
    const [documentFile, setDocumentFile] = useState<File | null>(null);
    const isViewMode = mode === 'view';

    const defaultState: Partial<PolicyDocumentCreate> & { id?: string } = {
        id: '',
        name: '',
        description: '',
        status: 0,
        version: '1.0',
        document_content: 0,
        content_editor_text: '',
        url: '',
        grc_contact: '',
        policy_reviewer_contact: '',
        published_date: today,
        next_review_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
        policy_portal_permissions: 'private',
        tags: '',
        policy_labels: '',
        related_projects: '',
        custom_roles: '',
        related_documents: '',
        document_type: '',
        owner: '',
        policy_doc_link: '',
    };
    
    useEffect(() => {
        if (policyToEdit) {
            const { 
                id, name, description, document_content, content_editor_text, url, grc_contact,
                policy_reviewer_contact, tags, published_date, next_review_date, policy_labels,
                related_projects, status, document_type, version, policy_portal_permissions,
                custom_roles, related_documents, owner_name
            } = policyToEdit;
            setFormData({
                id, name, description, document_content, content_editor_text, url, grc_contact,
                policy_reviewer_contact, tags, published_date, next_review_date, policy_labels,
                related_projects, status, document_type, version, policy_portal_permissions,
                custom_roles, related_documents, owner: owner_name || '', policy_doc_link: url || ''
            });
        } else {
            setFormData(defaultState);
        }
        setDocumentFile(null);
    }, [policyToEdit, isOpen, mode]);

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        const isNumeric = ['status', 'document_content'].includes(name);
        setFormData(prev => ({ ...prev, [name]: isNumeric ? Number(value) : value }));
    };

     const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setDocumentFile(e.target.files[0]);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData as PolicyDocumentCreate, documentFile);
    };

    const title = mode === 'add' ? 'Add New Policy' : mode === 'edit' ? 'Edit Policy' : 'View Policy';
    const renderInputField = (label: string, name: keyof PolicyDocumentCreate, type: string = 'text', required: boolean = false, placeholder: string = '') => (
        <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
            <input type={type} name={name} value={String(formData[name as keyof typeof formData] ?? '')} onChange={handleChange} readOnly={isViewMode} required={required} placeholder={placeholder}
                   className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Policy ID</label>
                        <input 
                            type="text" 
                            name="id"
                            value={formData.id || ''} 
                            onChange={handleChange}
                            readOnly={mode === 'edit' || isViewMode}
                            required={mode === 'add'}
                            placeholder="Enter Policy ID"
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
                        />
                    </div>
                    <div></div>
                    
                    {renderInputField('Name', 'name', 'text', true)}
                    {renderInputField('Version', 'version', 'text', true)}
                    
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                        <textarea name="description" value={formData.description || ''} onChange={handleChange} readOnly={isViewMode} required rows={3} 
                                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"></textarea>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Document Content</label>
                        <select name="document_content" value={formData.document_content} onChange={handleChange} disabled={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value={0}>Use Content</option>
                            <option value={1}>Use Attachments</option>
                            <option value={2}>Use URL</option>
                        </select>
                    </div>
                    <div></div>

                    {formData.document_content === 0 && <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Content Editor Text</label>
                        <textarea name="content_editor_text" value={formData.content_editor_text || ''} onChange={handleChange} readOnly={isViewMode} required rows={5} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"></textarea>
                    </div>}

                    {formData.document_content === 1 && <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Attachment</label>
                        {!isViewMode && <input type="file" accept=".doc,.docx,.pdf" onChange={handleFileChange} className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900 dark:file:text-blue-300 dark:hover:file:bg-blue-800"/>}
                        {documentFile && <p className="text-xs mt-1 dark:text-gray-400">Selected: {documentFile.name}</p>}
                        {policyToEdit?.url && (
                             <a href={policyToEdit.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">View Current Document</a>
                        )}
                    </div>}

                    {formData.document_content === 2 && <div className="md:col-span-2">
                         {renderInputField('URL', 'url', 'url', true)}
                    </div>}

                    {renderInputField('GRC Contact', 'grc_contact', 'text', true, 'User-admin|Group-Admins')}
                    {renderInputField('Policy Reviewer Contact', 'policy_reviewer_contact', 'text', true, 'User-jane|Group-Reviewers')}
                    
                    {renderInputField('Tags', 'tags', 'text', true, 'Critical|SOX|PCI')}
                    {renderInputField('Policy Labels', 'policy_labels', 'text', true)}

                    {renderInputField('Owner', 'owner', 'text', true)}
                    {renderInputField('PolicyDocLink', 'policy_doc_link', 'url', false)}

                    {renderInputField('CreatedDate', 'published_date', 'date', true)}
                    {renderInputField('RefreshDate', 'next_review_date', 'date', true)}
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                        <select name="status" value={formData.status ?? 0} onChange={handleChange} disabled={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                           <option value={0}>Draft</option>
                           <option value={1}>Published</option>
                        </select>
                    </div>
                    {renderInputField('Document Type', 'document_type', 'text', true)}
                    
                    {renderInputField('Related Projects', 'related_projects', 'text', true, 'Project A|Project B')}
                    {renderInputField('Related Documents', 'related_documents', 'text', true, 'Doc 1|Doc 2')}
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Portal Permissions</label>
                        <select name="policy_portal_permissions" value={formData.policy_portal_permissions} onChange={handleChange} disabled={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                           <option value="public">Public</option><option value="private">Private</option><option value="custom-roles">Custom Roles</option>
                        </select>
                    </div>

                    {formData.policy_portal_permissions === 'custom-roles' && 
                        renderInputField('Custom Roles', 'custom_roles', 'text', true, 'Owners|Collaborators')
                    }
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

export const PoliciesView: React.FC = () => {
    const [policies, setPolicies] = useState<PolicyDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string|null>(null);
    const [importLoading, setImportLoading] = useState(false);
    const [modalState, setModalState] = useState<{ type: 'add' | 'edit' | 'view' | 'delete' | 'import' | null; policy?: PolicyDocument | null }>({ type: null });
    const [filter, setFilter] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof PolicyDocument; direction: 'ascending' | 'descending' } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importData, setImportData] = useState<{ newPolicies: PolicyDocumentCreate[]; policiesToUpdate: Array<{id: string; data: PolicyDocumentUpdate}>; duplicateNames: string[] }>({ newPolicies: [], policiesToUpdate: [], duplicateNames: [] });

    const fetchPolicies = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await SupabaseService.getPolicies();
            setPolicies(data);
        } catch (e) {
            setError("Failed to load policies.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPolicies();
    }, [fetchPolicies]);

    const filteredAndSortedPolicies = useMemo(() => {
        let filteredItems = [...policies];
        if (filter) {
            const lowerCaseFilter = filter.toLowerCase();
            filteredItems = filteredItems.filter(item =>
                String(item.name ?? '').toLowerCase().includes(lowerCaseFilter) ||
                String(item.description ?? '').toLowerCase().includes(lowerCaseFilter)
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
    }, [policies, filter, sortConfig]);

    const requestSort = (key: keyof PolicyDocument) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };
    
    const getSortIconFor = (key: keyof PolicyDocument) => {
        if (!sortConfig || sortConfig.key !== key) {
            return <SortUpDownIcon className="h-4 w-4 ml-1 text-gray-400" />;
        }
        return sortConfig.direction === 'ascending' ? <SortUpIcon className="h-4 w-4 ml-1" /> : <SortDownIcon className="h-4 w-4 ml-1" />;
    };

    const isValidDate = (dateString: string): boolean => {
        if (!dateString || dateString.trim() === '') return false;
        const date = new Date(dateString);
        return date instanceof Date && !isNaN(date.getTime());
    };

    const closeModal = () => setModalState({ type: null });

    const handleImportCSV = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            if (!text) return;

            try {
                const lines = text.split('\n').filter(line => line.trim());
                if (lines.length < 2) {
                    alert('CSV file must have at least a header and one data row');
                    return;
                }

                const parsedPolicies: Array<{id: string | null; data: PolicyDocumentCreate}> = lines
                    .slice(1)
                    .map(line => {
                        const parts: string[] = [];
                        let current = '';
                        let inQuotes = false;
                        
                        for (let i = 0; i < line.length; i++) {
                            const char = line[i];
                            const nextChar = line[i + 1];

                            if (char === '"') {
                                if (inQuotes && nextChar === '"') {
                                    current += '"';
                                    i++;
                                } else {
                                    inQuotes = !inQuotes;
                                }
                            } else if (char === ',' && !inQuotes) {
                                parts.push(current.trim());
                                current = '';
                            } else {
                                current += char;
                            }
                        }
                        parts.push(current.trim());

                        if (!parts[1]) return null;

                        try {
                            const policyId = parts[0] && parts[0] !== '' ? parts[0] : null;
                            const name = parts[1] || '';
                            const description = parts[2] && parts[2] !== '' ? parts[2] : null;
                            const document_type = parts[3] && parts[3] !== '' ? parts[3] : null;
                            const document_content = parts[4] ? parseInt(parts[4]) : 0;
                            const content_editor_text = parts[5] && parts[5] !== '' ? parts[5] : null;
                            const url = parts[6] && parts[6] !== '' ? parts[6] : null;
                            const grc_contact = parts[7] ? parts[7] : 'N/A';
                            const policy_reviewer_contact = parts[8] ? parts[8] : 'N/A';
                            const tags = parts[9] && parts[9] !== '' ? parts[9] : null;
                            const published_date = (parts[10] && isValidDate(parts[10])) ? parts[10] : new Date().toISOString();
                            const next_review_date = (parts[11] && isValidDate(parts[11])) ? parts[11] : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
                            const policy_labels = parts[12] && parts[12] !== '' ? parts[12] : null;
                            const related_projects = parts[13] && parts[13] !== '' ? parts[13] : null;
                            const status = parts[14] ? parseInt(parts[14]) : 0;
                            const version = parts[15] && parts[15] !== '' ? parts[15] : '1.0';
                            const custom_roles = parts[16] && parts[16] !== '' ? parts[16] : null;
                            const related_documents = parts[17] && parts[17] !== '' ? parts[17] : null;
                            const owner_name = parts[18] && parts[18] !== '' ? parts[18] : null;
                            
                            const policyData: PolicyDocumentCreate = {
                                name,
                                description,
                                document_type,
                                document_content: document_content as DocumentContentType,
                                content_editor_text,
                                url,
                                grc_contact,
                                policy_reviewer_contact,
                                tags,
                                published_date,
                                next_review_date,
                                policy_labels,
                                related_projects,
                                status: status as PolicyStatus,
                                version,
                                policy_portal_permissions: 'private',
                                custom_roles,
                                related_documents,
                                owner: owner_name,
                                policy_doc_link: url,
                            };
                            
                            return { id: policyId, data: policyData };
                        } catch (parseErr) {
                            console.error('Error parsing policy row:', line, parseErr);
                            return null;
                        }
                    })
                    .filter((p): p is {id: string | null; data: PolicyDocumentCreate} => p !== null);

                const policyIdMap = new Map(policies.map(p => [p.id, p]));
                const newPolicies = parsedPolicies.filter(p => !p.id || !policyIdMap.has(p.id)).map(p => p.data);
                const policiesToUpdate = parsedPolicies
                    .filter(p => p.id && policyIdMap.has(p.id))
                    .map(p => ({
                        id: p.id!,
                        data: p.data as PolicyDocumentUpdate
                    }));

                setImportData({ newPolicies, policiesToUpdate, duplicateNames: [] });
                setModalState({ type: 'import' });
            } catch (err) {
                alert('Failed to parse CSV file.');
                console.error(err);
            }
        };
        reader.readAsText(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleConfirmImport = async () => {
        const hasNewPolicies = importData.newPolicies.length > 0;
        const hasUpdatePolicies = importData.policiesToUpdate.length > 0;

        if (!hasNewPolicies && !hasUpdatePolicies) return;

        setImportLoading(true);
        try {
            const addResults = hasNewPolicies 
                ? await Promise.allSettled(importData.newPolicies.map(p => SupabaseService.addPolicy(p)))
                : [];

            const updateResults = hasUpdatePolicies
                ? await Promise.allSettled(importData.policiesToUpdate.map(p => SupabaseService.updatePolicy(p.id, p.data)))
                : [];

            const allResults = [...addResults, ...updateResults];
            const failed = allResults.filter(r => r.status === 'rejected');

            if (failed.length > 0) {
                const errorMessages = failed.map((r: any) => r.reason?.message || r.reason?.toString()).join(', ');
                setError(`Failed to import ${failed.length} policies: ${errorMessages}`);
                setImportLoading(false);
                return;
            }

            await SupabaseService.logAllActivity({
                action: 'Bulk Imported/Updated Policies',
                module: 'Governance',
                event_data: { 
                    addedCount: importData.newPolicies.length, 
                    updatedCount: importData.policiesToUpdate.length 
                }
            });
            setModalState({ type: null });
            setImportData({ newPolicies: [], policiesToUpdate: [], duplicateNames: [] });
            setError(null);
            setImportLoading(false);
            fetchPolicies();
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            setError(`Failed to import policies: ${errorMsg}`);
            setImportLoading(false);
        }
    };

    const handleExportCSV = () => {
        const headers = ['id', 'name', 'description', 'document_type', 'document_content', 'content_editor_text', 'url', 'grc_contact', 'policy_reviewer_contact', 'tags', 'published_date', 'next_review_date', 'policy_labels', 'related_projects', 'status', 'version', 'custom_roles', 'related_documents', 'owner_name', 'created_at'];
        const csvContent = [
            headers.join(','),
            ...filteredAndSortedPolicies.map(policy =>
                [
                    `"${(policy.id || '').replace(/"/g, '""')}"`,
                    `"${(policy.name || '').replace(/"/g, '""')}"`,
                    `"${(policy.description || '').replace(/"/g, '""')}"`,
                    `"${(policy.document_type || '').replace(/"/g, '""')}"`,
                    `"${(policy.document_content || '').toString().replace(/"/g, '""')}"`,
                    `"${(policy.content_editor_text || '').replace(/"/g, '""')}"`,
                    `"${(policy.url || '').replace(/"/g, '""')}"`,
                    `"${(policy.grc_contact || '').replace(/"/g, '""')}"`,
                    `"${(policy.policy_reviewer_contact || '').replace(/"/g, '""')}"`,
                    `"${(policy.tags || '').replace(/"/g, '""')}"`,
                    `"${(policy.published_date || '').replace(/"/g, '""')}"`,
                    `"${(policy.next_review_date || '').replace(/"/g, '""')}"`,
                    `"${(policy.policy_labels || '').replace(/"/g, '""')}"`,
                    `"${(policy.related_projects || '').replace(/"/g, '""')}"`,
                    `"${(policy.status || '').replace(/"/g, '""')}"`,
                    `"${(policy.version || '').replace(/"/g, '""')}"`,
                    `"${(policy.custom_roles || '').replace(/"/g, '""')}"`,
                    `"${(policy.related_documents || '').replace(/"/g, '""')}"`,
                    `"${(policy.owner_name || '').replace(/"/g, '""')}"`,
                    `"${(policy.created_at || '').replace(/"/g, '""')}"`,
                ].join(',')
            ),
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `policies-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    const handleSavePolicy = async (formData: PolicyDocumentCreate | PolicyDocumentUpdate, documentFile?: File | null) => {
        try {
            const cleanData: any = { ...formData };
            if (modalState.type === 'add') {
                if (!cleanData.id || cleanData.id.trim() === '') {
                    throw new Error('Policy ID is required');
                }
            }
            cleanData.status = parseInt(String(cleanData.status)) || 0;
            cleanData.document_content = parseInt(String(cleanData.document_content)) || 0;
            Object.keys(cleanData).forEach(key => {
                if (cleanData[key] === '') cleanData[key] = null;
            });
            if (!cleanData.name || cleanData.name.trim() === '') throw new Error('Policy name is required');
            
            const dataToSave: PolicyDocumentCreate | PolicyDocumentUpdate = cleanData;
            if (dataToSave.document_content === 1 && documentFile) {
                dataToSave.url = await SupabaseService.uploadFile(documentFile, 'policies');
            } else if (dataToSave.document_content === 0) {
                dataToSave.url = null;
            }
            
            if (modalState.type === 'edit' && modalState.policy) {
                const updatedPolicy = await SupabaseService.updatePolicy(modalState.policy.id, dataToSave);
                await SupabaseService.logAllActivity({
                    action: 'Updated Policy',
                    module: 'Governance',
                    entity_id: updatedPolicy.id,
                    entity_name: updatedPolicy.name,
                    event_data: { changes: dataToSave }
                });
            } else if (modalState.type === 'add') {
                const addedPolicy = await SupabaseService.addPolicy(dataToSave as PolicyDocumentCreate);
                await SupabaseService.logAllActivity({
                    action: 'Created Policy',
                    module: 'Governance',
                    entity_id: addedPolicy.id,
                    entity_name: addedPolicy.name,
                    event_data: { details: dataToSave }
                });
            }
            fetchPolicies();
            closeModal();
        } catch (err) {
            setError(`Failed to save policy: ${err instanceof Error ? err.message : String(err)}`);
        }
    };
    
    const handleDeletePolicy = async () => {
        if (modalState.type === 'delete' && modalState.policy) {
            try {
                await SupabaseService.deletePolicy(modalState.policy.id);
                await SupabaseService.logAllActivity({
                    action: 'Deleted Policy',
                    module: 'Governance',
                    entity_id: modalState.policy.id,
                    entity_name: modalState.policy.name
                });
                fetchPolicies();
                closeModal();
            } catch (err) {
                setError('Failed to delete policy.');
            }
        }
    };
    
    const policyStatusStyles: Record<PolicyStatus, string> = {
        0: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
        1: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    };

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                 <div className="w-full sm:w-1/3">
                    <input 
                        type="text"
                        placeholder="Filter policies..."
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        aria-label="Filter policies"
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
                    <button onClick={() => setModalState({ type: 'add' })} title="Add Policy" className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        <PlusIcon className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4 dark:bg-red-900 dark:border-red-700 dark:text-red-200" role="alert">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="ml-4 font-bold">×</button>
            </div>}

            <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg dark:border-gray-700">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                                    <button onClick={() => requestSort('id')} className="flex items-center w-full text-left focus:outline-none">
                                        Policy ID {getSortIconFor('id')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                                    <button onClick={() => requestSort('name')} className="flex items-center w-full text-left focus:outline-none">
                                        Name {getSortIconFor('name')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                                    <button onClick={() => requestSort('status')} className="flex items-center w-full text-left focus:outline-none">
                                        Status {getSortIconFor('status')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                                    <button onClick={() => requestSort('created_at')} className="flex items-center w-full text-left focus:outline-none">
                                        Created Date {getSortIconFor('created_at')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                                    <button onClick={() => requestSort('version')} className="flex items-center w-full text-left focus:outline-none">
                                        Version {getSortIconFor('version')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                                    <button onClick={() => requestSort('document_type')} className="flex items-center w-full text-left focus:outline-none">
                                        Document Type {getSortIconFor('document_type')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Actions</th>
                            </tr>
                        </thead>
                         <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={7} className="text-center py-4 text-gray-500 dark:text-gray-400">Loading policies...</td></tr>
                            ) : filteredAndSortedPolicies.length === 0 ? (
                                <tr><td colSpan={7} className="text-center py-4 text-gray-500 dark:text-gray-400">No policies found.</td></tr>
                            ) : filteredAndSortedPolicies.map(policy => (
                                <tr key={policy.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500 dark:text-gray-400">{policy.id?.substring(0, 8)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{policy.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap"><StatusBadge status={policy.status} colorMap={policyStatusStyles} /></td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{policy.created_at ? new Date(policy.created_at).toLocaleDateString() : 'N/A'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{policy.version}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{policy.document_type || 'N/A'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end items-center space-x-2">
                                            {policy.url && <a href={policy.url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-500" title="View"><DownloadIcon className="h-5 w-5" /></a>}
                                            <button onClick={() => setModalState({ type: 'view', policy })} className="text-gray-400 hover:text-green-500"><EyeIcon className="h-5 w-5" /></button>
                                            <button onClick={() => setModalState({ type: 'edit', policy })} className="text-gray-400 hover:text-yellow-500"><PencilIcon className="h-5 w-5" /></button>
                                            <button onClick={() => setModalState({ type: 'delete', policy })} className="text-gray-400 hover:text-red-500"><TrashIcon className="h-5 w-5" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <PolicyModal
                isOpen={modalState.type === 'add' || modalState.type === 'edit' || modalState.type === 'view'}
                onClose={closeModal}
                onSave={handleSavePolicy}
                policyToEdit={modalState.policy || null}
                mode={modalState.type as 'add' | 'edit' | 'view'}
            />
            <DeleteConfirmationModal
                isOpen={modalState.type === 'delete'}
                onClose={closeModal}
                onConfirm={handleDeletePolicy}
                itemName="policy"
            />
            <Modal isOpen={modalState.type === 'import'} onClose={closeModal} title="Import CSV Preview">
                <div className="space-y-4">
                    <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">New Policies to Import ({importData.newPolicies.length})</h4>
                        {importData.newPolicies.length > 0 ? (
                            <div className="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-md p-3">
                                {importData.newPolicies.map((policy, idx) => (
                                    <div key={idx} className="py-2 px-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0 text-sm dark:text-gray-300">
                                        <div className="font-medium">{policy.name}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">Version: {policy.version} | Type: {policy.document_type || 'N/A'}</div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-gray-500 dark:text-gray-400 text-sm">No new policies to import.</div>
                        )}
                    </div>
                    {importData.policiesToUpdate.length > 0 && (
                        <div>
                            <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">Existing Policies to Update ({importData.policiesToUpdate.length})</h4>
                            <div className="max-h-48 overflow-y-auto border border-blue-200 dark:border-blue-700 rounded-md p-3 bg-blue-50 dark:bg-gray-800">
                                {importData.policiesToUpdate.map((item, idx) => {
                                    const policy = policies.find(p => p.id === item.id);
                                    return (
                                        <div key={idx} className="py-2 px-2 text-sm text-blue-800 dark:text-blue-200 border-b border-blue-100 dark:border-blue-900 last:border-b-0">
                                            <div className="font-medium">{policy?.name}</div>
                                            {policy?.name !== item.data.name && <div className="text-xs text-blue-600 dark:text-blue-300">→ {item.data.name}</div>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
                <div className="mt-6 flex justify-end space-x-3">
                    <button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>
                    <button onClick={handleConfirmImport} disabled={importLoading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400">
                        {importLoading ? 'Importing...' : `Import ${importData.newPolicies.length + importData.policiesToUpdate.length} Records`}
                    </button>
                </div>
            </Modal>
        </div>
    );
};
