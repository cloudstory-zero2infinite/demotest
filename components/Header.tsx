import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SunIcon, MoonIcon, BellIcon } from './Icons';
import * as SupabaseService from '../services/supabase';
import { UserRole, ZtiHubStatus } from '../types';
import { DemoToggle } from './common/DemoToggle';

declare const __APP_VERSION__: string;

type UnifiedNotification = {
    id: string;
    message: string;
    read: boolean;
    created_at: string;
    source: 'policy' | 'control' | 'org';
    type: string;
    policy_id?: string;
    policy_name?: string;
    control_id?: string;
    control_name?: string;
};

interface HeaderProps {
    userRole: UserRole;
    setUserRole: (role: UserRole) => void;
    isDarkMode: boolean;
    toggleDarkMode: () => void;
    onSignOut: () => void;
    userName: string | null;
    userEmail: string | null;
    userPhotoUrl: string | null;
    orgName: string | null;
    isAbcNews?: boolean;
    openFeedback: () => void;
    onNavigate?: (tab: string, subTab?: string, itemId?: string) => void;
    onDeleteAccount?: () => Promise<void>;
}

export const Header: React.FC<HeaderProps> = ({
    userRole, setUserRole, isDarkMode, toggleDarkMode,
    onSignOut, userName, userEmail, userPhotoUrl, orgName, isAbcNews, openFeedback, onNavigate, onDeleteAccount
}) => {
    // ─── ZTI Hub connectivity + device token (org-wide CLI auth) ───
    const [hubStatus, setHubStatus] = useState<ZtiHubStatus>({ active: false });
    const [showHubMenu, setShowHubMenu] = useState(false);
    const [hubToken, setHubToken] = useState<string | null>(null);
    const [hubTokenCopied, setHubTokenCopied] = useState(false);
    const [registeringHub, setRegisteringHub] = useState(false);
    const hubRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cancelled = false;
        const tick = () => SupabaseService.getZtiHubStatus()
            .then(s => { if (!cancelled) setHubStatus(s); })
            .catch(() => { if (!cancelled) setHubStatus({ active: false }); });
        tick();
        const iv = setInterval(tick, 25000);
        return () => { cancelled = true; clearInterval(iv); };
    }, []);

    const handleGenerateHubToken = useCallback(async () => {
        setShowHubMenu(false);
        setShowProfileMenu(false);
        setRegisteringHub(true);
        try {
            const r = await SupabaseService.registerHubDevice('zti-hub');
            setHubToken(r.token);
            setHubTokenCopied(false);
        } catch (e: any) {
            alert(e?.message || 'Failed to register hub device');
        } finally {
            setRegisteringHub(false);
        }
    }, []);

    // Deep-link from `zti authenticate` (?hubConnect=1)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        if (!params.has('hubConnect')) return;
        params.delete('hubConnect');
        const qs = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
        handleGenerateHubToken();
    }, [handleGenerateHubToken]);

    // ─── Notifications ───
    const [notifications, setNotifications] = useState<UnifiedNotification[]>([]);
    const [showNotifDropdown, setShowNotifDropdown] = useState(false);
    const notifRef = useRef<HTMLDivElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ─── Change password state ───
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [changePwdLoading, setChangePwdLoading] = useState(false);
    const [changePwdMessage, setChangePwdMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [hasEmailIdentity, setHasEmailIdentity] = useState(false);

    const refreshEmailIdentity = () => {
        SupabaseService.supabase.auth.getSession().then(({ data }) => {
            const providers: string[] = data.session?.user?.app_metadata?.providers || [];
            setHasEmailIdentity(providers.includes('email'));
        });
    };

    useEffect(() => { refreshEmailIdentity(); }, []);

    const PASSWORD_RULES = [
        { test: (p: string) => p.length >= 8, label: 'At least 8 characters' },
        { test: (p: string) => /[A-Z]/.test(p), label: 'One uppercase letter' },
        { test: (p: string) => /[a-z]/.test(p), label: 'One lowercase letter' },
        { test: (p: string) => /[0-9]/.test(p), label: 'One number' },
        { test: (p: string) => /[^A-Za-z0-9]/.test(p), label: 'One special character' },
    ];

    const handleChangePassword = async () => {
        setChangePwdMessage(null);
        const failing = PASSWORD_RULES.filter(r => !r.test(newPassword));
        if (failing.length > 0) {
            setChangePwdMessage({ type: 'error', text: `Password requires: ${failing.map(r => r.label.toLowerCase()).join(', ')}` });
            return;
        }
        if (newPassword !== confirmNewPassword) {
            setChangePwdMessage({ type: 'error', text: 'Passwords do not match.' });
            return;
        }
        try {
            setChangePwdLoading(true);
            const { error } = await SupabaseService.supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            setChangePwdMessage({ type: 'success', text: hasEmailIdentity ? 'Password updated successfully.' : 'Password set! You can now sign in with email and password.' });
            setNewPassword('');
            setConfirmNewPassword('');
            refreshEmailIdentity();
            setTimeout(() => setShowChangePassword(false), 1500);
        } catch (err: any) {
            setChangePwdMessage({ type: 'error', text: err?.message || 'Failed to update password.' });
        } finally {
            setChangePwdLoading(false);
        }
    };

    // ─── Profile menu ───
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);

    // ─── Delete account flow ───
    const [deleteStep, setDeleteStep] = useState<'closed' | 'warning' | 'confirm'>('closed');
    const [deleteEmailInput, setDeleteEmailInput] = useState('');
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    const fetchNotifications = useCallback(async () => {
        try {
            const [policyNotifs, controlNotifs, orgNotifs] = await Promise.all([
                SupabaseService.getPolicyNotifications(),
                SupabaseService.getControlNotifications(),
                SupabaseService.getOrgNotifications(),
            ]);
            console.log('[DEBUG] Fetched notifications:', { policy: policyNotifs.length, control: controlNotifs.length, org: orgNotifs.length });
            if (policyNotifs.length > 0) console.log('[DEBUG] Policy notifications samples:', policyNotifs.slice(0, 3));
            
            const unified: UnifiedNotification[] = [
                ...policyNotifs.map(n => ({ id: n.id, message: n.message, read: n.read, created_at: n.created_at, source: 'policy' as const, type: n.type, policy_id: n.policy_id, policy_name: n.policy_name })),
                ...controlNotifs.map(n => ({ id: n.id, message: n.message, read: n.read, created_at: n.created_at, source: 'control' as const, type: n.type, control_id: n.control_id, control_name: n.control_name })),
                ...orgNotifs.map(n => ({ id: n.id, message: n.message, read: n.read, created_at: n.created_at, source: 'org' as const, type: n.type })),
            ];
            unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            setNotifications(unified);
        } catch (err) { 
            console.error('[DEBUG] fetchNotifications error:', err);
        }
    }, []);

    useEffect(() => {
        fetchNotifications();
        pollRef.current = setInterval(fetchNotifications, 30000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [fetchNotifications]);

    // Click-outside handlers
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifDropdown(false);
            if (hubRef.current && !hubRef.current.contains(e.target as Node)) setShowHubMenu(false);
            if (profileRef.current && !profileRef.current.contains(e.target as Node)) setShowProfileMenu(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const unreadCount = notifications.filter(n => !n.read).length;

    const handleMarkAllAsRead = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await SupabaseService.markAllNotificationsRead();
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        } catch (err) {
            console.error('Failed to mark all notifications as read:', err);
        }
    };

    const handleNotificationClick = async (notif: UnifiedNotification) => {
        if (!notif.read) {
            // Mark-as-read must never block navigation — wrap in try/catch so a
            // failed/missing read call still lets the user land on the target.
            try {
                if (notif.source === 'policy') {
                    await SupabaseService.markPolicyNotificationRead(notif.id);
                } else if (notif.source === 'control') {
                    await SupabaseService.markControlNotificationRead(notif.id);
                } else if (notif.source === 'org') {
                    await SupabaseService.markOrgNotificationRead(notif.id);
                }
            } catch (err) {
                console.error('Failed to mark notification as read:', err);
            }
            setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
        }
        setShowNotifDropdown(false);
        if (notif.source === 'org') {
            onNavigate?.('organisation', 'tenant_admin');
        } else if (notif.source === 'control' && notif.control_id) {
            onNavigate?.('governance', 'control_registry', notif.control_id);
        } else if (notif.source === 'policy' && notif.policy_id) {
            onNavigate?.('governance', 'policies', notif.policy_id);
        } else if (notif.source === 'control') {
            onNavigate?.('governance', 'control_registry');
        } else {
            onNavigate?.('governance', 'policies');
        }
    };

    const formatTime = (iso: string) => {
        const diff = Date.now() - new Date(iso).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        return `${Math.floor(hrs / 24)}d ago`;
    };

    const notifTypeColor = (type: string) => {
        if (type === 'approval_requested' || type === 'review_requested') return 'text-yellow-500';
        if (type === 'approved' || type === 'reviewed' || type === 'enforcement_approved') return 'text-green-500';
        if (type === 'join_request') return 'text-blue-500';
        if (type === 'policy_expired') return 'text-red-800 dark:text-red-400';
        return 'text-red-500';
    };

    // Initials fallback for avatar
    const initials = (userName || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    const handleDeleteConfirm = async () => {
        if (!userEmail || deleteEmailInput.trim().toLowerCase() !== userEmail.toLowerCase()) {
            setDeleteError('Email does not match. Please enter the correct email.');
            return;
        }
        setDeleting(true);
        setDeleteError(null);
        try {
            await onDeleteAccount?.();
            setDeleteStep('closed');
        } catch {
            setDeleteError('Failed to delete account. Please try again.');
        } finally {
            setDeleting(false);
        }
    };

    const closeDeleteModal = () => {
        setDeleteStep('closed');
        setDeleteEmailInput('');
        setDeleteError(null);
    };

    return (
        <>
        <header className="fixed top-0 left-0 right-0 bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700 z-40">
            <div className="w-full px-4 sm:px-6">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center gap-3">
                        <img src="/logo.png" alt="Zero to Infinite" className="h-9 w-9 object-contain" />
                        <div className="flex flex-col">
                            <div className="flex items-baseline gap-2">
                                <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-none">
                                    Zero to Infinite
                                </h1>
                                <span title={`Build ${__APP_VERSION__}`} className="text-[9px] font-mono text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                                    {__APP_VERSION__}
                                </span>
                            </div>
                            <span className="text-[10px] text-gray-500 font-medium tracking-widest uppercase">
                                Unified Cyber Platform
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center space-x-2 sm:space-x-3">
                        {/* ZTI Hub — status pill + CLI token generation */}
                        <div className="relative" ref={hubRef}>
                            <button
                                type="button"
                                onClick={() => setShowHubMenu(prev => !prev)}
                                title={hubStatus.active ? `ZTI Hub online${hubStatus.deviceName ? ` (${hubStatus.deviceName})` : ''}` : 'ZTI Hub offline — click to connect a device'}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors hover:ring-1 hover:ring-emerald-400/50 ${hubStatus.active ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}
                            >
                                <span className={`inline-block w-2 h-2 rounded-full ${hubStatus.active ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                                Hub {hubStatus.active ? 'online' : 'offline'}
                                <svg className="h-3 w-3 opacity-60" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0l-4.24-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
                            </button>

                            {showHubMenu && (
                                <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                                    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                                        <p className="text-sm font-semibold text-gray-900 dark:text-white">ZTI Hub</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            {hubStatus.active
                                                ? `Connected${hubStatus.deviceName ? ` — ${hubStatus.deviceName}` : ''}`
                                                : 'No device is beaconing. Register one with the CLI.'}
                                        </p>
                                    </div>
                                    <div className="p-3 space-y-2">
                                        <button
                                            type="button"
                                            onClick={handleGenerateHubToken}
                                            disabled={registeringHub}
                                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-700/50 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-700 dark:hover:text-emerald-300 rounded-md transition-colors disabled:opacity-50"
                                        >
                                            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                            {registeringHub ? 'Generating…' : 'Generate device token'}
                                        </button>
                                        <p className="text-[10px] text-gray-400 dark:text-gray-500 px-1">
                                            For <span className="font-mono">zti authenticate</span> on your machine. Token is shown once.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Demo mode toggle — only for the ABC News tenant */}
                        {isAbcNews && <DemoToggle />}

                        {/* AI Employee (coming soon) */}
                        <button
                            disabled
                            className="relative p-1.5 rounded-full text-gray-300 dark:text-gray-600 cursor-not-allowed"
                            title="AI Employee - Coming Soon"
                        >
                            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                                {/* Head */}
                                <rect x="5" y="4" width="14" height="12" rx="2" />
                                {/* Eyes */}
                                <circle cx="9" cy="10" r="1.5" fill="currentColor" stroke="none" />
                                <circle cx="15" cy="10" r="1.5" fill="currentColor" stroke="none" />
                                {/* Antenna */}
                                <line x1="12" y1="4" x2="12" y2="1" />
                                <circle cx="12" cy="1" r="1" fill="currentColor" stroke="none" />
                                {/* Mouth */}
                                <line x1="9" y1="13" x2="15" y2="13" />
                                {/* Neck */}
                                <line x1="12" y1="16" x2="12" y2="18" />
                                {/* Body */}
                                <rect x="7" y="18" width="10" height="4" rx="1" />
                                {/* Arms */}
                                <line x1="5" y1="19" x2="3" y2="17" />
                                <line x1="19" y1="19" x2="21" y2="17" />
                            </svg>
                        </button>

                        {/* Notification Bell */}
                        <div className="relative" ref={notifRef}>
                            <button
                                onClick={() => setShowNotifDropdown(prev => !prev)}
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

                            {showNotifDropdown && (
                                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                                    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                                        <span className="text-sm font-semibold text-gray-900 dark:text-white">Notifications</span>
                                        <div className="flex items-center gap-3">
                                            {unreadCount > 0 && (
                                                <button
                                                    onClick={handleMarkAllAsRead}
                                                    className="text-[10px] text-blue-500 hover:text-blue-600 font-medium transition-colors"
                                                >
                                                    Mark all as Read
                                                </button>
                                            )}
                                            {unreadCount > 0 && (
                                                <span className="text-xs text-blue-500 font-medium">{unreadCount} unread</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                                        {notifications.length === 0 ? (
                                            <div className="px-4 py-6 text-center text-sm text-gray-400">No notifications</div>
                                        ) : notifications.map(notif => (
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
                                                    {!notif.read && <span className="flex-shrink-0 h-2 w-2 rounded-full bg-blue-500 mt-1" />}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Dark mode toggle */}
                        <button
                            onClick={toggleDarkMode}
                            className="p-1.5 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            {isDarkMode ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
                        </button>

                        {/* Profile Avatar + Dropdown */}
                        <div className="relative" ref={profileRef}>
                            <button
                                onClick={() => setShowProfileMenu(prev => !prev)}
                                className="flex items-center justify-center h-8 w-8 rounded-full overflow-hidden border-2 border-gray-200 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                                title={userName || 'Profile'}
                            >
                                {userPhotoUrl ? (
                                    <img src={userPhotoUrl} alt={userName || 'Profile'} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                    <span className="flex items-center justify-center h-full w-full bg-blue-500 text-white text-xs font-bold">
                                        {initials}
                                    </span>
                                )}
                            </button>

                            {showProfileMenu && (
                                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                                    {/* User info */}
                                    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{userName || 'User'}</p>
                                        {userEmail && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{userEmail}</p>}
                                        {orgName && <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{orgName}</p>}
                                    </div>

                                    {/* Menu items */}
                                    <div className="py-1">
                                        <button
                                            onClick={() => { setShowProfileMenu(false); openFeedback(); }}
                                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-3"
                                        >
                                            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                                            Feedback
                                        </button>
                                        <button
                                            onClick={handleGenerateHubToken}
                                            disabled={registeringHub}
                                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-3 disabled:opacity-50"
                                        >
                                            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                            {registeringHub ? 'Generating token…' : 'ZTI Hub CLI token'}
                                        </button>
                                        <button
                                            disabled
                                            className="w-full text-left px-4 py-2.5 text-sm text-gray-400 dark:text-gray-500 cursor-not-allowed flex items-center gap-3"
                                            title="Coming soon"
                                        >
                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            Help & Support
                                            <span className="ml-auto text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">Soon</span>
                                        </button>
                                    </div>

                                    <div className="border-t border-gray-100 dark:border-gray-700 py-1">
                                        <button
                                            onClick={() => { setShowProfileMenu(false); setShowChangePassword(true); setChangePwdMessage(null); setNewPassword(''); setConfirmNewPassword(''); }}
                                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-3"
                                        >
                                            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                                            {hasEmailIdentity ? 'Change Password' : 'Set Password'}
                                        </button>
                                        <button
                                            onClick={() => { setShowProfileMenu(false); onSignOut(); }}
                                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-3"
                                        >
                                            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                            Sign Out
                                        </button>
                                    </div>

                                    <div className="border-t border-gray-100 dark:border-gray-700 py-1">
                                        <button
                                            onClick={() => { setShowProfileMenu(false); setDeleteStep('warning'); }}
                                            className="w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-3"
                                        >
                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            Delete My Account
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </header>

        {/* ─── Delete Account Modal ─── */}
        {deleteStep !== 'closed' && (
            <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/50 p-4" onClick={closeDeleteModal}>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                    {deleteStep === 'warning' && (
                        <>
                            <div className="px-6 py-4 border-b dark:border-gray-700">
                                <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">Delete Account</h3>
                            </div>
                            <div className="p-6">
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="flex-shrink-0 h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                        <svg className="h-5 w-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-700 dark:text-gray-300">
                                            This action will <span className="font-semibold text-red-600 dark:text-red-400">permanently delete</span> your account and all associated data. This cannot be undone.
                                        </p>
                                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">Do you still want to proceed?</p>
                                    </div>
                                </div>
                            </div>
                            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 rounded-b-lg flex justify-end gap-3">
                                <button onClick={closeDeleteModal} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 transition-colors">Cancel</button>
                                <button onClick={() => setDeleteStep('confirm')} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors">Yes, Proceed</button>
                            </div>
                        </>
                    )}

                    {deleteStep === 'confirm' && (
                        <>
                            <div className="px-6 py-4 border-b dark:border-gray-700">
                                <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">Confirm Deletion</h3>
                            </div>
                            <div className="p-6 space-y-4">
                                <p className="text-sm text-gray-700 dark:text-gray-300">
                                    Please enter the email address associated with your account to confirm deletion.
                                </p>
                                {deleteError && (
                                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-3 py-2 rounded text-sm">
                                        {deleteError}
                                    </div>
                                )}
                                <input
                                    type="email"
                                    value={deleteEmailInput}
                                    onChange={e => { setDeleteEmailInput(e.target.value); setDeleteError(null); }}
                                    placeholder="Enter your email address"
                                    className="block w-full rounded-lg border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-red-500 focus:border-red-500"
                                    autoFocus
                                />
                            </div>
                            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 rounded-b-lg flex justify-end gap-3">
                                <button onClick={closeDeleteModal} disabled={deleting} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 transition-colors">Cancel</button>
                                <button
                                    onClick={handleDeleteConfirm}
                                    disabled={deleting || !deleteEmailInput.trim()}
                                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                                >
                                    {deleting ? 'Deleting...' : 'Confirm Delete'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        )}
        {hubToken && (
            <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40 p-4" onClick={() => { setHubToken(null); setHubTokenCopied(false); }}>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                    <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700">
                        <h3 className="text-base font-semibold dark:text-white">ZTI Hub device token</h3>
                    </div>
                    <div className="p-5 space-y-3 text-sm">
                        <p className="text-gray-600 dark:text-gray-300">
                            Copy this token and paste it into the CLI when prompted by <span className="font-mono">zti authenticate</span>. It is shown only once.
                        </p>
                        <div className="flex gap-2">
                            <input
                                readOnly
                                value={hubToken}
                                className="flex-1 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 font-mono text-xs dark:text-gray-200"
                            />
                            <button
                                onClick={async () => {
                                    try {
                                        await navigator.clipboard?.writeText(hubToken);
                                        setHubTokenCopied(true);
                                    } catch {
                                        setHubTokenCopied(false);
                                        alert('Copy failed. Please select the token and copy manually.');
                                    }
                                }}
                                className={`px-3 py-1.5 rounded text-white text-sm ${hubTokenCopied ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                            >
                                {hubTokenCopied ? 'Copied' : 'Copy'}
                            </button>
                        </div>
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                            Store it securely - it grants the hub read/run access scoped to your organization.
                        </p>
                    </div>
                    <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                        <button onClick={() => { setHubToken(null); setHubTokenCopied(false); }} className="px-3 py-1.5 rounded bg-gray-200 dark:bg-gray-700 text-sm dark:text-gray-200">
                            Done
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* ─── Change Password Modal ─── */}
        {showChangePassword && (
            <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowChangePassword(false)}>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
                    <div className="px-5 py-3 border-b dark:border-gray-700 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{hasEmailIdentity ? 'Change Password' : 'Set Password'}</h3>
                        <button onClick={() => setShowChangePassword(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none">&times;</button>
                    </div>
                    <div className="p-5 space-y-3">
                        {changePwdMessage && (
                            <p className={`text-xs px-2 py-1.5 rounded ${changePwdMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                {changePwdMessage.text}
                            </p>
                        )}
                        <input type="password" placeholder="New password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
                        <input type="password" placeholder="Confirm new password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
                        {newPassword && (
                            <ul className="text-[10px] text-gray-400 space-y-0.5">
                                {PASSWORD_RULES.map(r => (
                                    <li key={r.label} className={r.test(newPassword) ? 'text-green-500' : ''}>
                                        {r.test(newPassword) ? '\u2713' : '\u2022'} {r.label}
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="flex justify-end gap-2 pt-1">
                            <button onClick={() => setShowChangePassword(false)}
                                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded-md hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 transition">
                                Cancel
                            </button>
                            <button onClick={handleChangePassword} disabled={changePwdLoading}
                                className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition">
                                {changePwdLoading ? 'Updating...' : 'Update Password'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
        </>
    );
};
