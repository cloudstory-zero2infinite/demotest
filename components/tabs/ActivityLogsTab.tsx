import React, { useState, useEffect, useCallback } from 'react';
import { useUnifiedRefresh } from '../../hooks/useUnifiedRefresh';
import { AllActivityLog } from '../../types';
import * as SupabaseService from '../../services/supabase';
import { Modal } from '../common/Modal';
import { StatusBadge } from '../common/StatusBadge';
import { FaGithub } from 'react-icons/fa';

// Custom event for activity updates
const ACTIVITY_UPDATE_EVENT = 'activity-update';

// Function to trigger activity update (to be called from other components)
export const triggerActivityUpdate = () => {
    window.dispatchEvent(new CustomEvent(ACTIVITY_UPDATE_EVENT));
};

export const ActivityLogsTab: React.FC<{ isActive?: boolean }> = ({ isActive = true }) => {
    const [logs, setLogs] = useState<AllActivityLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedLog, setSelectedLog] = useState<AllActivityLog | null>(null);
    const [newActivityCount, setNewActivityCount] = useState(0);
    const [lastLogId, setLastLogId] = useState<string | null>(null);

    const severityColorMap: Record<string, string> = {
        info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
        warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
        error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    };

    // Helper function to render action with provider icons
    const renderAction = (action: string) => {
        if (action === 'google_login' || action === 'google_login_initiated') {
            return (
                <div className="flex items-center gap-2">
                    <img 
                        src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><path fill='%234285f4' d='M24 9.5c3.9 0 6.6 1.7 8.1 3.1l6-5.9C35.9 3.6 30.4 1 24 1 14.7 1 6.9 6.7 3.1 14.9l7.1 5.5C12.9 15.1 18 9.5 24 9.5z'/><path fill='%2334a853' d='M46.5 24c0-1.6-.1-2.9-.4-4.2H24v8.1h12.5c-.5 2.9-2.4 5.3-5.1 6.9l7.9 6.1C43.5 36.2 46.5 30.6 46.5 24z'/><path fill='%23fbbc05' d='M10.2 29.3A14.8 14.8 0 0 1 9 24c0-1.1.2-2.1.4-3.1l-7.1-5.5C1.2 17.1 0 20.4 0 24c0 3.6 1.2 6.9 3.3 9.6l6.9-4.3z'/><path fill='%23ea4335' d='M24 46.9c6.4 0 11.9-2.1 15.9-5.7l-7.9-6.1c-2 1.3-4.6 2.1-8 2.1-6 0-11.1-4.4-12.9-10.1l-7.1 5.5C6.9 41.2 14.7 46.9 24 46.9z'/></svg>" 
                        alt="Google" 
                        className="h-4 w-4 rounded-full" 
                    />
                    <span className="capitalize">{action.replace('google_', '').replace('_', ' ')}</span>
                </div>
            );
        }
        
        if (action === 'github_login' || action === 'github_login_initiated') {
            return (
                <div className="flex items-center gap-2">
                    <FaGithub />
                    <span className="capitalize">{action.replace('github_', '').replace('_', ' ')}</span>
                </div>
            );
        }
        
        if (action === 'google_login_failed') {
            return (
                <div className="flex items-center gap-2">
                    <img 
                        src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><path fill='%234285f4' d='M24 9.5c3.9 0 6.6 1.7 8.1 3.1l6-5.9C35.9 3.6 30.4 1 24 1 14.7 1 6.9 6.7 3.1 14.9l7.1 5.5C12.9 15.1 18 9.5 24 9.5z'/><path fill='%2334a853' d='M46.5 24c0-1.6-.1-2.9-.4-4.2H24v8.1h12.5c-.5 2.9-2.4 5.3-5.1 6.9l7.9 6.1C43.5 36.2 46.5 30.6 46.5 24z'/><path fill='%23fbbc05' d='M10.2 29.3A14.8 14.8 0 0 1 9 24c0-1.1.2-2.1.4-3.1l-7.1-5.5C1.2 17.1 0 20.4 0 24c0 3.6 1.2 6.9 3.3 9.6l6.9-4.3z'/><path fill='%23ea4335' d='M24 46.9c6.4 0 11.9-2.1 15.9-5.7l-7.9-6.1c-2 1.3-4.6 2.1-8 2.1-6 0-11.1-4.4-12.9-10.1l-7.1 5.5C6.9 41.2 14.7 46.9 24 46.9z'/></svg>" 
                        alt="Google" 
                        className="h-4 w-4 rounded-full" 
                    />
                    <span className="capitalize">Google Login Failed</span>
                </div>
            );
        }
        
        if (action === 'github_login_failed') {
            return (
                <div className="flex items-center gap-2">
                    <FaGithub />
                    <span className="capitalize">GitHub Login Failed</span>
                </div>
            );
        }
        
        return <span className="capitalize">{action.replace('_', ' ')}</span>;
    };

    const fetchLogs = useCallback(async () => {
        try {
            setError(null);
            const data = await SupabaseService.getAllActivityLogs();
            
            // Check for new activities
            if (logs.length > 0 && data.length > 0) {
                const latestLog = data[0]; // Assuming logs are sorted by created_at desc
                if (latestLog.id !== lastLogId) {
                    // New activity detected
                    setNewActivityCount(prev => prev + 1);
                    setLastLogId(latestLog.id);
                    
                    // Auto-scroll to top to show new activity
                    const tableContainer = document.querySelector('.overflow-auto');
                    if (tableContainer) {
                        tableContainer.scrollTop = 0;
                    }
                }
            } else if (data.length > 0) {
                setLastLogId(data[0].id);
            }
            
            setLogs(data);
        } catch (e) {
            setError("Failed to load activity logs.");
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [logs.length, lastLogId]);

    useUnifiedRefresh(isActive, fetchLogs);

    // Listen for activity updates from other components
    useEffect(() => {
        const handleActivityUpdate = () => {
            fetchLogs();
        };

        window.addEventListener(ACTIVITY_UPDATE_EVENT, handleActivityUpdate);
        return () => {
            window.removeEventListener(ACTIVITY_UPDATE_EVENT, handleActivityUpdate);
        };
    }, [fetchLogs]);

    // Periodic polling as backup (every 30 seconds)
    useEffect(() => {
        const interval = setInterval(() => {
            fetchLogs();
        }, 30000); // 30 seconds

        return () => clearInterval(interval);
    }, [fetchLogs]);

    return (
        <div className="px-4 py-6 sm:px-0">
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center space-x-3">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Application Activity Logs</h2>
                    {newActivityCount > 0 && (
                        <span className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 text-xs font-medium px-2.5 py-0.5 rounded-full animate-pulse">
                            {newActivityCount} new activity{newActivityCount > 1 ? 'ies' : ''}
                        </span>
                    )}
                </div>
                <button 
                    onClick={() => setNewActivityCount(0)}
                    className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                >
                    Clear indicator
                </button>
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
                            ) : logs.map((log, index) => (
                                <tr
                                    key={log.id}
                                    onClick={() => setSelectedLog(log)}
                                    className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                                        index === 0 && newActivityCount > 0 ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500' : ''
                                    }`}
                                >
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(log.created_at).toLocaleString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{renderAction(log.action)}</td>
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
                                <div className="text-sm text-gray-900 dark:text-white">{renderAction(selectedLog.action)}</div>
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
