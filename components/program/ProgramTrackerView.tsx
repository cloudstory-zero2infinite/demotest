import React, { useState, useEffect, useRef, useCallback, useMemo, ChangeEvent } from 'react';
import { ProgramTask, ProgramTaskCreate, ProgramTaskUpdate, ProgramStatus, ActivityLog } from '../../types';
import * as SupabaseService from '../../services/supabase';
import { UploadIcon, PlusIcon, DownloadIcon, SortUpDownIcon, SortUpIcon, SortDownIcon, HistoryIcon, EyeIcon, PencilIcon, TrashIcon } from '../Icons';
import { Modal } from '../common/Modal';
import { StatusBadge } from '../common/StatusBadge';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';

interface ProgramModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (task: ProgramTaskCreate | ProgramTaskUpdate) => void;
    taskToEdit: ProgramTask | null;
    mode: 'add' | 'edit' | 'view';
}

const ProgramModal: React.FC<ProgramModalProps> = ({ isOpen, onClose, onSave, taskToEdit, mode }) => {
    const [formData, setFormData] = useState<ProgramTaskCreate | ProgramTaskUpdate>({});
    const isViewMode = mode === 'view';

    useEffect(() => {
        if (taskToEdit) {
            setFormData({
                program_name: taskToEdit.program_name,
                description: taskToEdit.description,
                month: taskToEdit.month,
                status: taskToEdit.status,
                progress_percent: taskToEdit.progress_percent
            });
        } else {
            setFormData({
                program_name: '', description: '', month: 'January', status: 'Planned', progress_percent: 0
            });
        }
    }, [taskToEdit, isOpen, mode]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: name === 'progress_percent' ? Number(value) : value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };
    
    const title = mode === 'add' ? 'Add New Milestone' : mode === 'edit' ? 'Edit Milestone' : 'View Milestone';
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Milestone Name</label>
                        <input type="text" name="program_name" value={formData.program_name || ''} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Month</label>
                        <select name="month" value={formData.month || 'January'} onChange={handleChange} disabled={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                        <textarea name="description" value={formData.description || ''} onChange={handleChange} readOnly={isViewMode} rows={3} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"></textarea>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                        <select name="status" value={formData.status || 'Planned'} onChange={handleChange} disabled={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value="Planned">Planned</option>
                            <option value="InProgress">InProgress</option>
                            <option value="Completed">Completed</option>
                            <option value="Blocked">Blocked</option>
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Progress (%)</label>
                        <input type="range" name="progress_percent" min="0" max="100" value={formData.progress_percent || 0} onChange={handleChange} disabled={isViewMode} className="mt-1 block w-full" />
                        <span className="text-sm dark:text-gray-300">{formData.progress_percent || 0}%</span>
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

interface ActivityLogModalProps {
    isOpen: boolean;
    onClose: () => void;
    taskId: string | null;
}

const ActivityLogModal: React.FC<ActivityLogModalProps> = ({ isOpen, onClose, taskId }) => {
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && taskId) {
            setLoading(true);
            SupabaseService.getActivityLogs(taskId)
                .then(setLogs)
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [isOpen, taskId]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Activity Log">
            {loading ? <p className="text-center py-4">Loading logs...</p> : (
                <ul className="space-y-2">
                    {logs.length > 0 ? logs.map(log => (
                        <li key={log.id} className="text-sm text-gray-600 dark:text-gray-300">
                            <span className="font-semibold">{new Date(log.created_at).toLocaleString()}:</span> {log.activity}
                        </li>
                    )) : <p className="text-center py-4">No activity logs found for this milestone.</p>}
                </ul>
            )}
        </Modal>
    );
};

export const ProgramTrackerView: React.FC = () => {
    const [tasks, setTasks] = useState<ProgramTask[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [modalState, setModalState] = useState<{ type: 'add' | 'edit' | 'view' | 'delete' | 'log' | null; task?: ProgramTask | null }>({ type: null });
    const [filter, setFilter] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof ProgramTask; direction: 'ascending' | 'descending' } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchTasks = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await SupabaseService.getTasks();
            setTasks(data);
        } catch (err) {
            setError('Failed to fetch milestones.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);
    
    const closeModal = () => setModalState({ type: null });

    const handleSaveTask = async (formData: ProgramTaskCreate | ProgramTaskUpdate) => {
        try {
            if (modalState.type === 'edit' && modalState.task) {
                const oldTask = modalState.task;
                const updatedTask = await SupabaseService.updateTask(modalState.task.id, formData);
                
                await SupabaseService.logAllActivity({
                    action: 'Updated Milestone',
                    module: 'Program',
                    entity_id: updatedTask.id,
                    entity_name: updatedTask.program_name,
                    event_data: { changes: formData }
                });
                
                const changes: string[] = [];
                if (oldTask.program_name !== updatedTask.program_name) {
                    changes.push(`name changed from "${oldTask.program_name}" to "${updatedTask.program_name}"`);
                }
                if (oldTask.description !== updatedTask.description) {
                    changes.push('description was updated');
                }
                if (oldTask.month !== updatedTask.month) {
                    changes.push(`month changed from "${oldTask.month}" to "${updatedTask.month}"`);
                }
                if (oldTask.status !== updatedTask.status) {
                    changes.push(`status changed from "${oldTask.status}" to "${updatedTask.status}"`);
                }
                if (oldTask.progress_percent !== updatedTask.progress_percent) {
                    changes.push(`progress changed from ${oldTask.progress_percent}% to ${updatedTask.progress_percent}%`);
                }

                if (changes.length > 0) {
                    await SupabaseService.addActivityLog(updatedTask.id, `Milestone updated: ${changes.join(', ')}.`);
                }
                
            } else if (modalState.type === 'add') {
                const addedTask = await SupabaseService.addTask(formData as ProgramTaskCreate);
                
                await SupabaseService.logAllActivity({
                    action: 'Created Milestone',
                    module: 'Program',
                    entity_id: addedTask.id,
                    entity_name: addedTask.program_name,
                    event_data: { details: formData }
                });
                
                await SupabaseService.addActivityLog(addedTask.id, `Milestone "${addedTask.program_name}" was created.`);
            }
            fetchTasks();
            closeModal();
        } catch (err) {
            setError('Failed to save milestone.');
        }
    };

    const handleDeleteTask = async () => {
        if (modalState.type === 'delete' && modalState.task) {
            try {
                await SupabaseService.deleteTask(modalState.task.id);
                await SupabaseService.logAllActivity({
                    action: 'Deleted Milestone',
                    module: 'Program',
                    entity_id: modalState.task.id,
                    entity_name: modalState.task.program_name
                });
                fetchTasks();
                closeModal();
            } catch (err: any) {
                const message = err?.message || 'Failed to delete milestone.';
                setError(`Failed to delete milestone. ${message}`);
            }
        }
    };
    
    const handleImportCSV = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            if(!text) return;

            const lines = text.split('\n').slice(1);
            const importedTasks: ProgramTaskCreate[] = lines
                .map(line => {
                    const [program_name, description, month, status, progress_percent] = line.split(',').map(s => s.trim());
                    if (!program_name || !month || !status) return null;
                    return {
                        program_name,
                        description: description || '',
                        month,
                        status: status as ProgramStatus,
                        progress_percent: Number(progress_percent) || 0,
                    };
                })
                .filter((task): task is ProgramTaskCreate => task !== null);
            
            if (importedTasks.length > 0) {
                try {
                    // Get existing tasks to find duplicates
                    const existingTasks = await SupabaseService.getTasks();
                    const tasksToUpdate: { id: string; updates: ProgramTaskUpdate }[] = [];
                    const tasksToAdd: ProgramTaskCreate[] = [];
                    const duplicateNames = new Set<string>();
                    
                    for (const importedTask of importedTasks) {
                        // Find existing task by program_name and month (strict match)
                        const existingTask = existingTasks.find(
                            t => t.program_name.trim() === importedTask.program_name.trim() && 
                                 t.month.trim() === importedTask.month.trim()
                        );
                        
                        if (existingTask) {
                            duplicateNames.add(`${importedTask.program_name} (${importedTask.month})`);
                            
                            // Check if anything actually changed
                            const hasChanges = 
                                (existingTask.description || '').trim() !== (importedTask.description || '').trim() ||
                                existingTask.status !== importedTask.status ||
                                existingTask.progress_percent !== importedTask.progress_percent;
                            
                            if (hasChanges) {
                                tasksToUpdate.push({
                                    id: existingTask.id,
                                    updates: {
                                        description: importedTask.description,
                                        status: importedTask.status,
                                        progress_percent: importedTask.progress_percent
                                    }
                                });
                            }
                        } else {
                            tasksToAdd.push(importedTask);
                        }
                    }
                    
                    let totalProcessed = 0;
                    
                    // Add new tasks first
                    if (tasksToAdd.length > 0) {
                        await SupabaseService.bulkAddTasks(tasksToAdd);
                        totalProcessed += tasksToAdd.length;
                    }
                    
                    // Update existing tasks
                    if (tasksToUpdate.length > 0) {
                        for (const { id, updates } of tasksToUpdate) {
                            await SupabaseService.updateTask(id, updates);
                            totalProcessed++;
                        }
                    }
                    
                    if (totalProcessed > 0) {
                        await SupabaseService.logAllActivity({
                            action: 'Imported Milestones',
                            module: 'Program',
                            event_data: { 
                                total: importedTasks.length,
                                added: tasksToAdd.length,
                                updated: tasksToUpdate.length,
                                duplicates: Array.from(duplicateNames)
                            }
                        });
                        
                        let message = `${totalProcessed} milestones processed:\n`;
                        message += `• ${tasksToAdd.length} new milestones added\n`;
                        message += `• ${tasksToUpdate.length} existing milestones updated`;
                        
                        if (duplicateNames.size > 0) {
                            message += `\n\nDuplicates found (not added):\n${Array.from(duplicateNames).slice(0, 5).join('\n')}`;
                            if (duplicateNames.size > 5) {
                                message += `\n... and ${duplicateNames.size - 5} more`;
                            }
                        }
                        
                        alert(message);
                        fetchTasks();
                    } else {
                        if (duplicateNames.size > 0) {
                            alert(`All ${duplicateNames.size} imported milestones already exist and no changes were detected.`);
                        } else {
                            alert('No changes detected in imported data.');
                        }
                    }
                } catch (err) {
                    console.error('Import error:', err);
                    alert('Failed to import milestones. Please check the file format and try again.');
                }
            } else {
                alert('No valid data found in the CSV file.');
            }
        };
        reader.readAsText(file);
        if(fileInputRef.current) fileInputRef.current.value = '';
    };

    const filteredAndSortedTasks = useMemo(() => {
        let items = [...tasks];
        if (filter) {
            const q = filter.toLowerCase();
            items = items.filter(t =>
                t.program_name.toLowerCase().includes(q) ||
                (t.description && t.description.toLowerCase().includes(q)) ||
                t.month.toLowerCase().includes(q) ||
                t.status.toLowerCase().includes(q)
            );
        }
        if (sortConfig) {
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
    }, [tasks, filter, sortConfig]);

    const requestSort = (key: keyof ProgramTask) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') direction = 'descending';
        setSortConfig({ key, direction });
    };

    const getSortIconFor = (key: keyof ProgramTask) => {
        if (!sortConfig || sortConfig.key !== key) return <SortUpDownIcon className="h-4 w-4 ml-1 text-gray-400" />;
        return sortConfig.direction === 'ascending' ? <SortUpIcon className="h-4 w-4 ml-1" /> : <SortDownIcon className="h-4 w-4 ml-1" />;
    };

    const handleExportCSV = () => {
        const headers = ['program_name', 'description', 'month', 'status', 'progress_percent'];
        const csvContent = [
            headers.join(','),
            ...filteredAndSortedTasks.map(t =>
                [
                    `"${(t.program_name || '').replace(/"/g, '""')}"`,
                    `"${(t.description || '').replace(/"/g, '""')}"`,
                    t.month,
                    t.status,
                    t.progress_percent,
                ].join(',')
            ),
        ].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `program-milestones-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    const programStatusStyles: Record<ProgramStatus, string> = {
        Planned: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
        InProgress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
        Completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
        Blocked: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    };

    return (
        <div className="px-4 py-6 sm:px-0">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">GRC Program Tracker</h2>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <input
                        type="text"
                        placeholder="Filter milestones..."
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        className="block w-full sm:w-56 rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                    <div className="flex items-center space-x-2">
                        <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />
                        <button onClick={() => fileInputRef.current?.click()} title="Import CSV" className="p-2 text-gray-400 hover:text-green-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                            <UploadIcon className="h-5 w-5" />
                        </button>
                        <button onClick={handleExportCSV} title="Export CSV" className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                            <DownloadIcon className="h-5 w-5" />
                        </button>
                        <button onClick={() => setModalState({ type: 'add' })} title="Add Milestone" className="p-2 text-gray-400 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                            <PlusIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            </div>

            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}

            <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg dark:border-gray-700">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('month')} className="flex items-center focus:outline-none">Month {getSortIconFor('month')}</button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('program_name')} className="flex items-center focus:outline-none">Name {getSortIconFor('program_name')}</button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('status')} className="flex items-center focus:outline-none">Status {getSortIconFor('status')}</button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('progress_percent')} className="flex items-center focus:outline-none">Progress {getSortIconFor('progress_percent')}</button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={5} className="text-center py-4 text-gray-500 dark:text-gray-400">Loading milestones...</td></tr>
                            ) : filteredAndSortedTasks.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-4 text-gray-500 dark:text-gray-400">No milestones found.</td></tr>
                            ) : filteredAndSortedTasks.map(task => (
                                <tr key={task.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{task.month}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white" title={task.description || undefined}>{task.program_name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap"><StatusBadge status={task.status} colorMap={programStatusStyles} /></td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center space-x-2 w-32">
                                            <div className="w-full bg-gray-200 rounded-full h-1.5 dark:bg-gray-700">
                                                <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${task.progress_percent}%` }}></div>
                                            </div>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">{task.progress_percent}%</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end items-center space-x-2">
                                            <button onClick={() => setModalState({ type: 'log', task })} title="View Logs" className="text-gray-400 hover:text-blue-500"><HistoryIcon className="h-5 w-5" /></button>
                                            <button onClick={() => setModalState({ type: 'view', task })} title="View Milestone" className="text-gray-400 hover:text-green-500"><EyeIcon className="h-5 w-5" /></button>
                                            <button onClick={() => setModalState({ type: 'edit', task })} title="Edit Milestone" className="text-gray-400 hover:text-yellow-500"><PencilIcon className="h-5 w-5" /></button>
                                            <button onClick={() => setModalState({ type: 'delete', task })} title="Delete Milestone" className="text-gray-400 hover:text-red-500"><TrashIcon className="h-5 w-5" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <ProgramModal
                isOpen={modalState.type === 'add' || modalState.type === 'edit' || modalState.type === 'view'}
                onClose={closeModal}
                onSave={handleSaveTask}
                taskToEdit={modalState.task || null}
                mode={modalState.type as 'add' | 'edit' | 'view'}
            />
            
            <ActivityLogModal
                isOpen={modalState.type === 'log'}
                onClose={closeModal}
                taskId={modalState.task?.id || null}
            />
            
            <DeleteConfirmationModal
                isOpen={modalState.type === 'delete'}
                onClose={closeModal}
                onConfirm={handleDeleteTask}
                itemName="milestone"
            />
        </div>
    );
};
