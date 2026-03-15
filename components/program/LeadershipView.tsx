import React from 'react';
import { ProgramStatus } from '../../types';
import { PlusIcon, EyeIcon, PencilIcon, TrashIcon } from '../Icons';
import { StatusBadge } from '../common/StatusBadge';
import { ProgressBar } from '../common/ProgressBar';

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

export const LeadershipView: React.FC = () => {
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
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Work To Be Done</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Timestamp</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Status</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Progress</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
                           {leadershipDummyData.map(item => (
                                <tr key={item.id}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900 dark:text-white">{item.workToBeDone}</div>
                                        <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">{item.description}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(item.timestamp).toLocaleString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap"><StatusBadge status={item.status} colorMap={programStatusStyles} /></td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <ProgressBar progress={item.progress} />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end items-center space-x-2">
                                            <button className="text-gray-400 hover:text-green-500"><EyeIcon className="h-5 w-5" /></button>
                                            <button className="text-gray-400 hover:text-yellow-500"><PencilIcon className="h-5 w-5" /></button>
                                            <button className="text-gray-400 hover:text-red-500"><TrashIcon className="h-5 w-5" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
