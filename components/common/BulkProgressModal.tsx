import React from 'react';
import { XIcon, CheckCircleIcon, ExclamationCircleIcon } from '../Icons';

export interface BulkProgress {
    total: number;
    completed: number;
    failed: number;
    status: 'idle' | 'processing' | 'done' | 'error' | 'warning';
}

interface BulkProgressModalProps {
    isOpen: boolean;
    title: string;
    progress: BulkProgress;
    onClose: () => void;
}

export const BulkProgressModal: React.FC<BulkProgressModalProps> = ({ isOpen, title, progress, onClose }) => {
    if (!isOpen) return null;

    const { total, completed, failed, status } = progress;
    const isDone = status === 'done' || status === 'error' || status === 'warning';
    const percent = total > 0 ? Math.round(((completed + failed) / total) * 100) : 0;

    const getProgressColor = () => {
        if (status === 'error') return 'bg-red-500';
        if (status === 'warning') return 'bg-yellow-500';
        if (status === 'done') return 'bg-green-500';
        return 'bg-blue-600';
    };

    const getStatusColor = () => {
        if (status === 'error') return 'text-red-600 dark:text-red-400';
        if (status === 'warning') return 'text-yellow-600 dark:text-yellow-400';
        if (status === 'done') return 'text-green-600 dark:text-green-400';
        return 'text-blue-600 dark:text-blue-400';
    };

    return (
        <div className="fixed bottom-6 right-6 z-[400] w-80 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden transform transition-all animate-fade-in-up">
            <div className="p-4">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        {status === 'processing' && (
                            <svg className="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        )}
                        {status === 'done' && <CheckCircleIcon className="h-5 w-5 text-green-500" />}
                        {status === 'warning' && <ExclamationCircleIcon className="h-5 w-5 text-yellow-500" />}
                        {status === 'error' && <ExclamationCircleIcon className="h-5 w-5 text-red-500" />}
                        {status === 'idle' ? 'Preparing...' : title}
                    </h3>
                    {isDone && (
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">
                            <XIcon className="h-4 w-4" />
                        </button>
                    )}
                </div>

                <div className="space-y-4">
                    <div className="w-full bg-gray-100 dark:bg-gray-700/50 rounded-full h-1.5 overflow-hidden">
                        <div 
                            className={`h-full transition-all duration-300 ease-out ${getProgressColor()}`} 
                            style={{ width: `${percent}%` }}
                        />
                    </div>
                    
                    <div className="flex justify-between text-xs items-center">
                        <span className="text-gray-500 dark:text-gray-400 font-medium">
                            {completed + failed} / {total} Processed
                        </span>
                        <span className={`font-bold ${getStatusColor()}`}>
                            {percent}%
                        </span>
                    </div>

                    {(completed > 0 || failed > 0) && (
                        <div className="flex gap-4 text-xs font-medium pt-3 border-t border-gray-100 dark:border-gray-700">
                            {completed > 0 && <span className="text-green-600 dark:text-green-400 flex items-center gap-1"><CheckCircleIcon className="w-3.5 h-3.5" /> {completed} Succeeded</span>}
                            {failed > 0 && <span className="text-red-600 dark:text-red-400 flex items-center gap-1"><ExclamationCircleIcon className="w-3.5 h-3.5" /> {failed} Failed</span>}
                        </div>
                    )}

                    {status === 'warning' && (
                        <div className="text-xs text-yellow-600 dark:text-yellow-400 pt-2 border-t border-yellow-100 dark:border-yellow-800/30">
                            ⚠️ Operation completed with some errors
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
