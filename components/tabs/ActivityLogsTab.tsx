import React, { useState, useEffect, useCallback } from 'react';
import { AllActivityLog } from '../../types';
import * as SupabaseService from '../../services/supabase';
import { Modal } from '../common/Modal';
import { StatusBadge } from '../common/StatusBadge';

export const ActivityLogsTab: React.FC = () => {
    const [logs, setLogs] = useState<AllActivityLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedLog, setSelectedLog] = useState<AllActivityLog | null>(null);

    const severityColorMap: Record<string, string> = {
        info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
        warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
        error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    };

    const fetchLogs = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await SupabaseService.getAllActivityLogs();
            setLogs(data);
        } catch (e) {
            setError("Failed to load activity logs.");
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    return (
        <div className="px-4 py-6 sm:px-0">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Application Activity Logs</h2>
            </div>
            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}

            <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg dark:border-gray-700">
                <div className="overflow-auto max-h-[calc(100vh-280px)]">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Timestamp</th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Action</th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Module</th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Organization</th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">User Role</th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Entity Name</th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Email ID</th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Severity</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={8} className="text-center py-4 text-gray-500 dark:text-gray-400">Loading logs...</td></tr>
                            ) : logs.map(log => (
                                <tr
                                    key={log.id}
                                    onClick={() => setSelectedLog(log)}
                                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                >
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(log.created_at).toLocaleString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{log.action}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{log.module}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{log.org_name || 'N/A'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{log.user_role || 'N/A'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{log.entity_name || 'N/A'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{log.event_data?.user_email || 'N/A'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap"><StatusBadge status={log.severity || 'info'} colorMap={severityColorMap} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <Modal isOpen={!!selectedLog} onClose={() => setSelectedLog(null)} title="Log Event Data">
                {selectedLog ? (
                    <div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                            <div>
                                <div className="text-xs text-gray-500">Timestamp</div>
                                <div className="text-sm text-gray-900 dark:text-white">{new Date(selectedLog.created_at).toLocaleString()}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">Organization</div>
                                <div className="text-sm text-gray-900 dark:text-white">{selectedLog.org_name || 'N/A'}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">User Role</div>
                                <div className="text-sm text-gray-900 dark:text-white">{selectedLog.user_role || 'N/A'}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">Entity Name</div>
                                <div className="text-sm text-gray-900 dark:text-white">{selectedLog.entity_name || 'N/A'}</div>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <div className="text-xs text-gray-500">Action</div>
                                <div className="text-sm text-gray-900 dark:text-white">{selectedLog.action}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">Email ID</div>
                                <div className="text-sm text-gray-900 dark:text-white">{selectedLog.event_data?.user_email || 'N/A'}</div>
                            </div>
                        </div>
                        {selectedLog.event_data ? (
                            <div>
                                <div className="text-xs text-gray-500 mb-2">Event Data</div>
                                <pre className="bg-gray-100 dark:bg-gray-700 p-4 rounded-md text-sm text-gray-800 dark:text-gray-200 overflow-x-auto">
                                    {typeof selectedLog.event_data === 'string' ? (() => { try { return JSON.stringify(JSON.parse(selectedLog.event_data), null, 2); } catch { return selectedLog.event_data; } })() : JSON.stringify(selectedLog.event_data, null, 2)}
                                </pre>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </Modal>
        </div>
    );
};
