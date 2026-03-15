import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as SupabaseService from './services/supabase';
import { UserRole } from './types';

// Layout & Common Components
import { Header } from './components/Header';
import { FeedbackModal } from './components/common/FeedbackModal';
import { NameEntryModal } from './components/auth/NameEntryModal';
import { ErrorBoundary } from './components/common/ErrorBoundary';

// Tab Components
import { DashboardTab } from './components/tabs/DashboardTab';
import { OrganisationTab } from './components/tabs/OrganisationTab';
import { ProgramTab } from './components/tabs/ProgramTab';
import { GovernanceTab } from './components/tabs/GovernanceTab';
import { ComplianceTab } from './components/tabs/ComplianceTab';
import { ActivityLogsTab } from './components/tabs/ActivityLogsTab';
// import { PolicyManagerTab } from './components/tabs/PolicyManagerTab';
// import { RiskTab } from './components/tabs/RiskTab';
// import { ThreatViewTab } from './components/tabs/ThreatViewTab';
// import { ResiliencyTab } from './components/tabs/ResiliencyTab';

const App: React.FC = () => {
    type Tab = 'dashboard' | 'organisation' | 'program' | 'policymanager' | 'governance' | 'risk' | 'compliance' | 'threat' | 'resiliency' | 'logs';
    type LocalUserRole = 'security-staff' | 'cxo';
    
    const [activeTab, setActiveTab] = useState<Tab>('dashboard');
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
    const [logoutToastVisible, setLogoutToastVisible] = useState(false);
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
    const logoutTimerRef = useRef<number | null>(null);

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
                    
                    const role = await SupabaseService.getUserRole();
                    setPlatformAdminRole(role);
                } else {
                    if (!sessionStorage.getItem('grcUserName')) {
                        setIsNameModalOpen(true);
                    }
                    setPlatformAdminRole(null);
                }
                setAuthChecked(true);

                const { data: listener } = SupabaseService.supabase.auth.onAuthStateChange(async (_event, session) => {
                    if (session && session.user) {
                        const name = (session.user.user_metadata as any)?.full_name || session.user.email || 'User';
                        sessionStorage.setItem('grcUserName', name);
                        setUserName(name);
                        setIsNameModalOpen(false);
                        
                        const role = await SupabaseService.getUserRole();
                        setPlatformAdminRole(role);
                        
                        try {
                            await SupabaseService.logAllActivity({ action: 'login', module: 'Authentication', entity_name: name }, session.user);
                        } catch (err) {
                            console.error('Failed to log login activity', err);
                        }
                    } else {
                        setPlatformAdminRole(null);
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

    const handleSignOut = async () => {
        try {
            await SupabaseService.supabase.auth.signOut();
        } catch (err) {
            console.error('Sign out failed', err);
        } finally {
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
            if (logoutTimerRef.current) {
                clearTimeout(logoutTimerRef.current as any);
            }
        };
    }, []);

    const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

    const mainTabs: { id: Tab; label: string }[] = [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'organisation', label: 'Organisation' },
        { id: 'program', label: 'Program' },
        // { id: 'policymanager', label: 'Policy Manager' },
        { id: 'governance', label: 'Governance' },
        // { id: 'risk', label: 'Risk' },
        { id: 'compliance', label: 'Compliance' },
        { id: 'logs', label: 'Activity Logs' },
    ];

    const availableTabs = useMemo(() => {
        return mainTabs;
    }, [mainTabs]);

    return (
        <ErrorBoundary>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
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
                
                <NameEntryModal isOpen={isNameModalOpen} />
                <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />
                
                <Header 
                    userRole={userRole} 
                    setUserRole={setUserRole} 
                    isDarkMode={isDarkMode} 
                    toggleDarkMode={toggleDarkMode} 
                    onSignOut={handleSignOut}
                    userName={userName}
                    openFeedback={() => setIsFeedbackOpen(true)}
                />

                <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                    <div className="border-b border-gray-200 dark:border-gray-700 px-4 sm:px-0">
                        <nav className="-mb-px flex space-x-8 overflow-x-auto scrollbar-hide" aria-label="Main Tabs">
                            {availableTabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`${
                                        activeTab === tab.id
                                            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
                                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-lg transition-colors duration-200`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </nav>
                    </div>
                    
                    {!authChecked ? (
                        <div className="flex items-center justify-center py-24">
                            <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                            </svg>
                            <p className="ml-3 text-gray-500 dark:text-gray-400 font-medium">Authenticating...</p>
                        </div>
                    ) : (
                        <div className="animate-in fade-in duration-500">
                            {activeTab === 'dashboard' && <DashboardTab />}
                            {activeTab === 'organisation' && <OrganisationTab userRole={platformAdminRole} />}
                            {activeTab === 'program' && <ProgramTab userRole={userRole} />}
                            {activeTab === 'governance' && <GovernanceTab />}
                            {activeTab === 'compliance' && <ComplianceTab />}
                            {activeTab === 'logs' && <ActivityLogsTab />}
                        </div>
                    )}
                    
                    {/* Floating Feedback Button */}
                    <button
                        onClick={() => setIsFeedbackOpen(true)}
                        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center z-50 transition-all hover:scale-110 active:scale-95 shadow-blue-500/20"
                        title="Send feedback"
                        aria-label="Send feedback"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                        </svg>
                    </button>
                </main>
            </div>
        </ErrorBoundary>
    );
};

export default App;
