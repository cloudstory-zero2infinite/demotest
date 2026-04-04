import React from 'react';
import { ProgramStatus } from '../../types';
import { PlusIcon, EyeIcon, PencilIcon, TrashIcon } from '../Icons';
import { StatusBadge } from '../common/StatusBadge';
import { ProgressBar } from '../common/ProgressBar';
import { useTableSelection } from '../../hooks/useTableSelection';
import { SelectionActionBar } from '../common/SelectionActionBar';

interface LeadershipTask {
    id: string;
    workToBeDone: string;
    description: string;
    timestamp: string;
    status: ProgramStatus;
    progress: number;
}

const leadershipDummyData: LeadershipTask[] = [
    { id: '1', workToBeDone: 'Review Q3 Security Budget', description: 'Analyze spending and forecast for Q4.', timestamp: '2024-07-15T10:00:00Z', status: 'Completed', progress: 100 },
    { id: '2', workToBeDone: 'Finalize Board Presentation on Cyber Risk', description: 'Consolidate metrics and key findings for the upcoming board meeting.', timestamp: '2024-07-20T14:30:00Z', status: 'InProgress', progress: 75 },
    { id: '3', workToBeDone: 'Approve new IAM Vendor Contract', description: 'Legal and financial review of the proposed contract.', timestamp: '2024-07-22T11:00:00Z', status: 'InProgress', progress: 40 },
    { id: '4', workToBeDone: 'Plan 2025 GRC Strategy Offsite', description: 'Set agenda, invite key stakeholders, and define objectives for the strategy session.', timestamp: '2024-08-01T09:00:00Z', status: 'Planned', progress: 10 },
    { id: '5', workToBeDone: 'Address Audit Finding A-123', description: 'Develop a remediation plan for the critical finding from the external audit.', timestamp: '2024-07-18T16:00:00Z', status: 'Blocked', progress: 25 },
];

export const LeadershipView: React.FC<{ isActive?: boolean }> = ({ isActive = true }) => {
    const [items, setItems] = React.useState(leadershipDummyData);

    const {
        selectedIds, isEditing, editValues, isConfirmingDelete, isSaving,
        setIsConfirmingDelete, setIsSaving,
        toggle, toggleAll, clearAll, startEdit, updateField, cancelEdit,
    } = useTableSelection<LeadershipTask>();

    const editInputCls = "w-full border border-blue-300 dark:border-blue-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400";
    const editSelectCls = "border border-blue-300 dark:border-blue-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400";

    const handleBulkDelete = () => {
        setItems(prev => prev.filter(i => !selectedIds.has(i.id)));
        clearAll();
    };

    const handleSaveAll = () => {
        setItems(prev => prev.map(item =>
            selectedIds.has(item.id) ? { ...item, ...editValues[item.id] } : item
        ));
        cancelEdit();
    };

    const programStatusStyles: Record<ProgramStatus, string> = {
        Planned: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
        InProgress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
        Completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
        Blocked: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    };

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4 sm:mb-0">Leadership Action Items</h2>
                <div className="flex space-x-2">
                     <button className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700">
                        <PlusIcon className="h-5 w-5 mr-2" /> Add Action Item
                    </button>
                </div>
            </div>

            <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg dark:border-gray-700">
                <div className="overflow-auto max-h-[calc(100vh-280px)]">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 w-10 px-4 py-3">
                                    <input type="checkbox"
                                        checked={selectedIds.size === items.length && items.length > 0}
                                        onChange={() => toggleAll(items.map(i => i.id))}
                                        className="rounded border-gray-300 dark:border-gray-600 cursor-pointer" />
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Work To Be Done</th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Timestamp</th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Status</th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Progress</th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
                           {items.map(item => (
                                <tr key={item.id}
                                    onClick={() => {}}
                                    className={`cursor-pointer transition-colors ${
                                        selectedIds.has(item.id) ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                    } ${isEditing && !selectedIds.has(item.id) ? 'opacity-40 pointer-events-none' : ''}`}
                                >
                                    <td onClick={e => e.stopPropagation()} className="w-10 px-4 py-4">
                                        <input type="checkbox"
                                            checked={selectedIds.has(item.id)}
                                            onChange={() => toggle(item.id)}
                                            className="rounded border-gray-300 dark:border-gray-600 cursor-pointer" />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {isEditing && selectedIds.has(item.id) ? (
                                            <input type="text" value={(editValues[item.id]?.workToBeDone as string) ?? item.workToBeDone} onChange={e => updateField(item.id, 'workToBeDone' as any, e.target.value)} className={editInputCls} />
                                        ) : (
                                            <>
                                                <div className="text-sm font-medium text-gray-900 dark:text-white">{item.workToBeDone}</div>
                                                <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">{item.description}</div>
                                            </>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(item.timestamp).toLocaleString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {isEditing && selectedIds.has(item.id) ? (
                                            <select value={(editValues[item.id]?.status as string) ?? item.status} onChange={e => updateField(item.id, 'status' as any, e.target.value)} className={editSelectCls}>
                                                <option>Planned</option>
                                                <option>InProgress</option>
                                                <option>Completed</option>
                                                <option>Blocked</option>
                                            </select>
                                        ) : <StatusBadge status={item.status} colorMap={programStatusStyles} />}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {isEditing && selectedIds.has(item.id) ? (
                                            <div className="flex items-center gap-2">
                                                <input type="range" min="0" max="100" value={(editValues[item.id]?.progress as number) ?? item.progress} onChange={e => updateField(item.id, 'progress' as any, Number(e.target.value))} className="w-24" />
                                                <span className="text-xs w-8">{(editValues[item.id]?.progress as number) ?? item.progress}%</span>
                                            </div>
                                        ) : <ProgressBar progress={item.progress} />}
                                    </td>
                                    <td onClick={e => e.stopPropagation()} className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        {!isEditing && (
                                            <div className="flex justify-end items-center space-x-2">
                                                <button className="text-gray-400 hover:text-green-500"><EyeIcon className="h-5 w-5" /></button>
                                                <button className="text-gray-400 hover:text-yellow-500"><PencilIcon className="h-5 w-5" /></button>
                                                <button className="text-gray-400 hover:text-red-500"><TrashIcon className="h-5 w-5" /></button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <SelectionActionBar
                selectedCount={selectedIds.size}
                isEditing={isEditing}
                isConfirmingDelete={isConfirmingDelete}
                isSaving={isSaving}
                onEdit={() => startEdit(items.filter(i => selectedIds.has(i.id)), i => i.id)}
                onSaveAll={handleSaveAll}
                onCancelEdit={cancelEdit}
                onDelete={() => setIsConfirmingDelete(true)}
                onConfirmDelete={handleBulkDelete}
                onCancelDelete={() => setIsConfirmingDelete(false)}
                onClear={clearAll}
            />
        </div>
    );
};
