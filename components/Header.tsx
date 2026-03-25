import React from 'react';
import { SunIcon, MoonIcon } from './Icons';

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
}

export const Header: React.FC<HeaderProps> = ({ userRole, setUserRole, isDarkMode, toggleDarkMode, onSignOut, userName, orgName, openFeedback }) => {
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
