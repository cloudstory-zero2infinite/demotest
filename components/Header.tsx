import React from 'react';
import { ShieldCheckIcon, SunIcon, MoonIcon, BotIcon } from './Icons';

type UserRole = 'security-staff' | 'cxo';

interface HeaderProps {
    userRole: UserRole;
    setUserRole: (role: UserRole) => void;
    isDarkMode: boolean;
    toggleDarkMode: () => void;
    onOpenAiAssistant: () => void;
    onSignOut: () => void;
}

const Header: React.FC<HeaderProps> = ({ userRole, setUserRole, isDarkMode, toggleDarkMode, onOpenAiAssistant, onSignOut }) => {
    return (
        <header className="bg-white dark:bg-gray-800 shadow-md">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center">
                        <ShieldCheckIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                        <div className="flex items-baseline ml-3">
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                                ZeroTo1 GRC
                            </h1>
                            <span className="ml-2 bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded-full dark:bg-blue-900 dark:text-blue-300">
                                BETA
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center space-x-4">
                        <label htmlFor="role-switcher" className="sr-only">Switch View</label>
                        <select
                            id="role-switcher"
                            value={userRole}
                            onChange={(e) => setUserRole(e.target.value as UserRole)}
                            className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
                        >
                            <option value="security-staff">Security Staff View</option>
                            <option value="cxo">CXO View</option>
                        </select>
                         <button
                            onClick={onOpenAiAssistant}
                            aria-label="Open AI Assistant"
                            className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-800 focus:ring-blue-500"
                        >
                           <BotIcon className="h-6 w-6" />
                        </button>
                        <button
                            onClick={toggleDarkMode}
                            aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                            className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-800 focus:ring-blue-500"
                        >
                            {isDarkMode ? (
                                <SunIcon className="h-6 w-6" />
                            ) : (
                                <MoonIcon className="h-6 w-6" />
                            )}
                        </button>
                        <button
                            onClick={onSignOut}
                            aria-label="Sign out"
                            className="px-3 py-1 text-sm text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;
