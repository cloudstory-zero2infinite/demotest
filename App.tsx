import React, { useState, useEffect, useRef } from 'react';
import * as SupabaseService from './services/supabase';
import { UserRole } from './types';
import { useTabRefresh } from './hooks/useTabRefresh';

// Layout & Common Components
import { Header } from './components/Header';
import { Sidebar, MainTab, OrgSubTab } from './components/Sidebar';
import { FeedbackModal } from './components/common/FeedbackModal';
import { NameEntryModal } from './components/auth/NameEntryModal';
import { OnboardingModal } from './components/auth/OnboardingModal';
import { ErrorBoundary } from './components/common/ErrorBoundary';

// Tab Components
import { DashboardTab } from './components/tabs/DashboardTab';
import { OrganisationTab } from './components/tabs/OrganisationTab';
import { ProgramTab } from './components/tabs/ProgramTab';
import { GovernanceTab } from './components/tabs/GovernanceTab';
import { ComplianceTab } from './components/tabs/ComplianceTab';
import { ActivityLogsTab } from './components/tabs/ActivityLogsTab';

const App: React.FC = () => {
    type LocalUserRole = 'security-staff' | 'cxo';

    // Navigation state
    const [activeTab, setActiveTab] = useState<MainTab>('dashboard');
    const [activeOrgSubTab, setActiveOrgSubTab] = useState<OrgSubTab>('view_org');
    const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
        return localStorage.getItem('sidebarOpen') !== 'false';
    });

    // App state
    const [userRole, setUserRole] = useState<LocalUserRole>('security-staff');
    const [platformAdminRole, setPlatformAdminRole] = useState<UserRole | null>(null);
    const [isDarkMode, setIsDarkMode] = useState(() => {
        if (typeof window !== 'undefined' && localStorage.getItem('theme')) {
            return localStorage.getItem('theme') === 'dark';
        }
        return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    });
    const [userName, setUserName] = useState<string | null>(() => sessionStorage.getItem('grcUserName'));
    const [isNameModalOpen, setIsNameModalOpen] = useState<boolean>(false);
    const [authChecked, setAuthChecked] = useState(false);
    const [isOnboarded, setIsOnboarded] = useState<boolean>(true);
    const [onboardingStatus, setOnboardingStatus] = useState<'active' | 'pending_approval' | null>(null);
    const [orgName, setOrgName] = useState<string | null>(null);
    const [logoutToastVisible, setLogoutToastVisible] = useState(false);
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
    const logoutTimerRef = useRef<number | null>(null);

    // Tab refresh hook
    useTabRefresh(activeTab);

    const handleToggleSidebar = () => {
        setSidebarOpen(prev => {
            const next = !prev;
            localStorage.setItem('sidebarOpen', String(next));
            return next;
        });
    };

    const handleNavigate = (tab: MainTab, subTab?: OrgSubTab) => {
        setActiveTab(tab);
        if (subTab) setActiveOrgSubTab(subTab);
    };

    // Theme Effect
    useEffect(() => {
        const body = document.body;
        if (isDarkMode) {
            body.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            body.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [isDarkMode]);

    // Auth Initialization
    useEffect(() => {
        let authListener: any;
        const initAuth = async () => {
            try {
                const { data } = await SupabaseService.supabase.auth.getSession();
                const session = data.session;
                if (session && session.user) {
                    const name = (session.user.user_metadata as any)?.full_name || session.user.email || 'User';
                    sessionStorage.setItem('grcUserName', name);
                    setUserName(name);
                    setIsNameModalOpen(false);

                    const me = await SupabaseService.getOrgMe();
                    setPlatformAdminRole(me?.role ?? null);
                    setIsOnboarded(me?.isOnboarded ?? false);
                    setOnboardingStatus(me?.onboardingStatus ?? null);
                    setOrgName(me?.orgName ?? null);
                    
                    // Check if this is a fresh login (not a refresh)
                    const isFreshLogin = sessionStorage.getItem('freshLogin') === 'true';
                    const provider = sessionStorage.getItem('loginProvider');
                    if (isFreshLogin) {
                        try {
                            const action = provider === 'github' ? 'github_login' : 'google_login';
                            await SupabaseService.logAllActivity({ 
                                action: action, 
                                module: 'Authentication', 
                                entity_name: name,
                                event_data: { provider: provider }
                            });
                            sessionStorage.removeItem('freshLogin');
                            sessionStorage.removeItem('loginProvider');
                        } catch (err) {
                            console.error('Failed to log login activity', err);
                        }
                    }
                } else {
                    if (!sessionStorage.getItem('grcUserName')) {
                        setIsNameModalOpen(true);
                    }
                    setPlatformAdminRole(null);
                    setIsOnboarded(true);
                    setOrgName(null);
                }
                setAuthChecked(true);

                const { data: listener } = SupabaseService.supabase.auth.onAuthStateChange(async (event, session) => {
                    // TOKEN_REFRESHED and INITIAL_SESSION fire on browser tab focus / auto-refresh.
                    // Ignoring them prevents cascading async setState calls that destabilize the component tree.
                    if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return;

                    if (event === 'SIGNED_OUT') {
                        setPlatformAdminRole(null);
                        return;
                    }

                    if (session && session.user) {
                        const name = (session.user.user_metadata as any)?.full_name || session.user.email || 'User';
                        sessionStorage.setItem('grcUserName', name);
                        setUserName(name);
                        setIsNameModalOpen(false);

                        const me = await SupabaseService.getOrgMe();
                        setPlatformAdminRole(me?.role ?? null);
                        setIsOnboarded(me?.isOnboarded ?? false);
                        setOnboardingStatus(me?.onboardingStatus ?? null);
                        setOrgName(me?.orgName ?? null);

                        if (event === 'SIGNED_IN') {
                            try {
                                await SupabaseService.logAllActivity({ action: 'login', module: 'Authentication', entity_name: name }, session.user);
                            } catch (err) {
                                console.error('Failed to log login activity', err);
                            }
                        }
                    }
                });
                authListener = listener;
            } catch (err) {
                console.error('Auth init error', err);
                setAuthChecked(true);
                setIsNameModalOpen(!sessionStorage.getItem('grcUserName'));
                setPlatformAdminRole(null);
            }
        };
        initAuth();

        return () => {
            if (authListener && authListener.subscription) {
                authListener.subscription.unsubscribe();
            }
        };
    }, []);

    const handleOnboardingComplete = async () => {
        const me = await SupabaseService.getOrgMe();
        setPlatformAdminRole(me?.role ?? null);
        setIsOnboarded(me?.isOnboarded ?? false);
        setOnboardingStatus(me?.onboardingStatus ?? null);
        setOrgName(me?.orgName ?? null);
    };

    // Display "Consultant" instead of "Consultant1" etc.
    const displayOrgName = orgName
        ? /^Consultant\d+$/i.test(orgName) ? 'Consultant' : orgName
        : null;

    const handleSignOut = async () => {
        const currentUserName = userName;
        try {
            await SupabaseService.supabase.auth.signOut();
        } catch (err) {
            console.error('Sign out failed', err);
        } finally {
            // Log sign-out activity
            try {
                await SupabaseService.logAllActivity({ 
                    action: 'logout', 
                    module: 'Authentication', 
                    entity_name: currentUserName || 'User' 
                });
            } catch (err) {
                console.error('Failed to log logout activity', err);
            }
            
            sessionStorage.removeItem('grcUserName');
            setUserName(null);
            setIsNameModalOpen(true);
            setLogoutToastVisible(true);
            logoutTimerRef.current = window.setTimeout(() => {
                try {
                    window.location.replace(window.location.origin);
                } catch (e) {
                    window.location.reload();
                }
            }, 900) as unknown as number;
        }
    };

    useEffect(() => {
        return () => {
            if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current as any);
        };
    }, []);

    const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

    const isAdmin = platformAdminRole === 'tenant_admin' || platformAdminRole === 'admin';

    const renderContent = () => {
        if (!authChecked) {
            return (
                <div className="flex items-center justify-center py-24">
                    <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    <p className="ml-3 text-gray-500 dark:text-gray-400 font-medium">Authenticating...</p>
                </div>
            );
        }

        // All tabs stay mounted after auth — visibility toggled with CSS only.
        // This prevents data refetch when switching tabs (no unmount/remount).
        return (
            <div
                className={`animate-in fade-in duration-500 ${onboardingStatus === 'pending_approval' ? 'pointer-events-none select-none' : ''}`}
                style={onboardingStatus === 'pending_approval' ? { filter: 'blur(4px)', opacity: 0.4 } : undefined}
            >
                <div className={activeTab === 'dashboard' ? '' : 'hidden'}><DashboardTab /></div>
                <div className={activeTab === 'organisation' ? '' : 'hidden'}><OrganisationTab userRole={platformAdminRole} activeSubTab={activeOrgSubTab} /></div>
                <div className={activeTab === 'program' ? '' : 'hidden'}><ProgramTab userRole={userRole} /></div>
                <div className={activeTab === 'governance' ? '' : 'hidden'}><GovernanceTab /></div>
                <div className={activeTab === 'compliance' ? '' : 'hidden'}><ComplianceTab /></div>
                <div className={activeTab === 'logs' ? '' : 'hidden'}><ActivityLogsTab /></div>
            </div>
        );
    };

    return (
        <ErrorBoundary>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200 flex flex-col">

                {/* Logout toast */}
                {logoutToastVisible && (
                    <div role="status" aria-live="polite" className="fixed top-5 right-5 z-[200]">
                        <div className="max-w-sm w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg px-4 py-3 flex items-center space-x-3">
                            <svg className="h-5 w-5 text-green-600" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900 dark:text-white">Logged out</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">You have been signed out.</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Modals */}
                <NameEntryModal isOpen={isNameModalOpen} />
                {authChecked && !isNameModalOpen && !isOnboarded && onboardingStatus !== 'pending_approval' && (
                    <OnboardingModal onComplete={handleOnboardingComplete} />
                )}
                <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />

                {/* Header — full width */}
                <Header
                    userRole={userRole}
                    setUserRole={setUserRole}
                    isDarkMode={isDarkMode}
                    toggleDarkMode={toggleDarkMode}
                    onSignOut={handleSignOut}
                    userName={userName}
                    orgName={displayOrgName}
                    openFeedback={() => setIsFeedbackOpen(true)}
                    onNavigate={(tab) => handleNavigate(tab as MainTab)}
                />

                {/* Pending approval banner */}
                {authChecked && onboardingStatus === 'pending_approval' && (
                    <div className="bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-700 px-4 py-3">
                        <div className="flex items-center gap-3 max-w-full">
                            <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            <div>
                                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Access Pending Approval</p>
                                <p className="text-xs text-amber-700 dark:text-amber-300">Your join request has been sent. Your organisation admin needs to approve your access before you can use the platform.</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Body: sidebar + content */}
                <div className="flex flex-1 overflow-hidden pt-16">
                    <Sidebar
                        activeTab={activeTab}
                        activeOrgSubTab={activeOrgSubTab}
                        isOpen={sidebarOpen}
                        onToggle={handleToggleSidebar}
                        onNavigate={handleNavigate}
                        isAdmin={isAdmin}
                    />

                    <main className="flex-1 overflow-y-auto">
                        <div className="px-6 py-6 max-w-7xl mx-auto">
                            {renderContent()}
                        </div>
                    </main>
                </div>

            </div>
        </ErrorBoundary>
    );
};

export default App;
