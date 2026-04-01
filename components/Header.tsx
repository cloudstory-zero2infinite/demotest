import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SunIcon, MoonIcon, BellIcon } from './Icons';
import * as SupabaseService from '../services/supabase';
import { PolicyNotification } from '../types';

type UserRole = 'security-staff' | 'cxo';

interface HeaderProps {
    userRole: 'security-staff' | 'cxo';
    setUserRole: (role: 'security-staff' | 'cxo') => void;
    isDarkMode: boolean;
    toggleDarkMode: () => void;
    onSignOut: () => void;
    userName: string | null;
    orgName: string | null;
    openFeedback: () => void;
    onNavigate?: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
    userRole, setUserRole, isDarkMode, toggleDarkMode,
    onSignOut, userName, orgName, openFeedback, onNavigate
}) => {
    const [notifications, setNotifications] = useState<PolicyNotification[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchNotifications = useCallback(async () => {
        try {
            const data = await SupabaseService.getPolicyNotifications();
            setNotifications(data);
        } catch {
            // silently ignore — user may not be authenticated yet
        }
    }, []);

    useEffect(() => {
        fetchNotifications();
        pollRef.current = setInterval(fetchNotifications, 30000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [fetchNotifications]);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const unreadCount = notifications.filter(n => !n.read).length;

    const handleNotificationClick = async (notif: PolicyNotification) => {
        if (!notif.read) {
            await SupabaseService.markPolicyNotificationRead(notif.id);
            setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
        }
        setShowDropdown(false);
        onNavigate?.('governance');
    };

    const formatTime = (iso: string) => {
        const diff = Date.now() - new Date(iso).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        return `${Math.floor(hrs / 24)}d ago`;
    };

    const notifTypeColor = (type: PolicyNotification['type']) => {
        if (type === 'approval_requested') return 'text-yellow-500';
        if (type === 'approved') return 'text-green-500';
        return 'text-red-500';
    };

    return (
        <header className="fixed top-0 left-0 right-0 bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700 z-40">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center gap-3">
                        <img src="/logo.png" alt="Zero to Infinite" className="h-9 w-9 object-contain" />
                        <div className="flex flex-col">
                            <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-none">
                                Zero to Infinite
                            </h1>
                            <span className="text-[10px] text-gray-500 font-medium tracking-widest uppercase">
                                Governance Risk Compliance
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center space-x-2 sm:space-x-4">
                        {userName && (
                            <div className="hidden md:flex flex-col items-end leading-tight mr-2">
                                <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">
                                    Welcome, {userName}
                                </span>
                                {orgName && (
                                    <span className="text-xs text-gray-400 dark:text-gray-500">{orgName}</span>
                                )}
                            </div>
                        )}

                        <button
                            onClick={openFeedback}
                            className="text-xs text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 font-medium px-2 py-1 rounded border border-gray-200 dark:border-gray-700 hover:border-blue-200 transition-colors"
                        >
                            Feedback
                        </button>

                        {/* Notification Bell */}
                        <div className="relative" ref={dropdownRef}>
                            <button
                                onClick={() => setShowDropdown(prev => !prev)}
                                className="relative p-1.5 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                title="Notifications"
                            >
                                <BellIcon className="h-5 w-5" />
                                {unreadCount > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                                        {unreadCount > 9 ? '9+' : unreadCount}
                                    </span>
                                )}
                            </button>

                            {showDropdown && (
                                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                                    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                                        <span className="text-sm font-semibold text-gray-900 dark:text-white">Notifications</span>
                                        {unreadCount > 0 && (
                                            <span className="text-xs text-blue-500 font-medium">{unreadCount} unread</span>
                                        )}
                                    </div>
                                    <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                                        {notifications.length === 0 ? (
                                            <div className="px-4 py-6 text-center text-sm text-gray-400">
                                                No notifications
                                            </div>
                                        ) : (
                                            notifications.map(notif => (
                                                <button
                                                    key={notif.id}
                                                    onClick={() => handleNotificationClick(notif)}
                                                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${!notif.read ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                                                >
                                                    <div className="flex items-start gap-2">
                                                        <span className={`mt-0.5 flex-shrink-0 ${notifTypeColor(notif.type)}`}>
                                                            <BellIcon className="h-4 w-4" />
                                                        </span>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs text-gray-800 dark:text-gray-200 leading-snug">{notif.message}</p>
                                                            <p className="text-[10px] text-gray-400 mt-0.5">{formatTime(notif.created_at)}</p>
                                                        </div>
                                                        {!notif.read && (
                                                            <span className="flex-shrink-0 h-2 w-2 rounded-full bg-blue-500 mt-1" />
                                                        )}
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <select
                            value={userRole}
                            onChange={(e) => setUserRole(e.target.value as UserRole)}
                            className="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-1.5 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        >
                            <option value="security-staff">Security View</option>
                            <option value="cxo">CXO View</option>
                        </select>
                        <button
                            onClick={toggleDarkMode}
                            className="p-1.5 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            {isDarkMode ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
                        </button>
                        <button
                            onClick={onSignOut}
                            className="px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                            Sign Out
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
};
