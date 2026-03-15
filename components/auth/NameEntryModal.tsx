import React, { useState } from 'react';
import * as SupabaseService from '../../services/supabase';

interface NameEntryModalProps {
    isOpen: boolean;
}

export const NameEntryModal: React.FC<NameEntryModalProps> = ({ isOpen }) => {
    const [isSigningIn, setIsSigningIn] = useState(false);

    if (!isOpen) return null;

    const handleGoogleSignIn = async () => {
        try {
            setIsSigningIn(true);
            
            await SupabaseService.supabase.auth.signInWithOAuth({
                provider: 'google',
                options: { 
                    redirectTo: `${window.location.origin}/`,
                    scopes: 'profile email'
                }
            });
            
        } catch (err: any) {
            console.error('Sign-in error:', err?.message || err);
            setIsSigningIn(false);
            alert(`Sign-in error: ${err?.message || 'Failed to initiate sign-in. Please try again.'}`);
        }
    };

    return (
        <div className="fixed inset-0 bg-blue-50 dark:bg-blue-900 z-[100] flex items-center justify-center p-6" aria-modal="true" role="dialog">
            <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                    <img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><path fill='%23ea4335' d='M24 9.5c3.9 0 6.6 1.7 8.1 3.1l6-5.9C35.9 3.6 30.4 1 24 1 14.7 1 6.9 6.7 3.1 14.9l7.1 5.5C12.9 15.1 18 9.5 24 9.5z'/><path fill='%2334a853' d='M46.5 24c0-1.6-.1-2.9-.4-4.2H24v8.1h12.5c-.5 2.9-2.4 5.3-5.1 6.9l7.9 6.1C43.5 36.2 46.5 30.6 46.5 24z'/><path fill='%234a90e2' d='M10.2 29.3A14.8 14.8 0 0 1 9 24c0-1.1.2-2.1.4-3.1l-7.1-5.5C1.2 17.1 0 20.4 0 24c0 3.6 1.2 6.9 3.3 9.6l6.9-4.3z'/><path fill='%23fbbc05' d='M24 46.9c6.4 0 11.9-2.1 15.9-5.7l-7.9-6.1c-2 1.3-4.6 2.1-8 2.1-6 0-11.1-4.4-12.9-10.1l-7.1 5.5C6.9 41.2 14.7 46.9 24 46.9z'/></svg>" alt="Google" className="h-6 w-6" />
                    <h2 className="text-lg font-semibold text-gray-900">Welcome to Zeroto1 GRC</h2>
                </div>

                <p className="text-sm text-gray-600 mb-6">Sign in using your Google account.</p>

                <div className="mt-2">
                    <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={isSigningIn}
                        aria-live="polite"
                        className="w-full mt-2 inline-flex items-center justify-center gap-3 px-5 py-3 bg-white border border-gray-200 rounded-full shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-60 transition"
                    >
                        <img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><path fill='%23ea4335' d='M24 9.5c3.9 0 6.6 1.7 8.1 3.1l6-5.9C35.9 3.6 30.4 1 24 1 14.7 1 6.9 6.7 3.1 14.9l7.1 5.5C12.9 15.1 18 9.5 24 9.5z'/><path fill='%2334a853' d='M46.5 24c0-1.6-.1-2.9-.4-4.2H24v8.1h12.5c-.5 2.9-2.4 5.3-5.1 6.9l7.9 6.1C43.5 36.2 46.5 30.6 46.5 24z'/><path fill='%234a90e2' d='M10.2 29.3A14.8 14.8 0 0 1 9 24c0-1.1.2-2.1.4-3.1l-7.1-5.5C1.2 17.1 0 20.4 0 24c0 3.6 1.2 6.9 3.3 9.6l6.9-4.3z'/><path fill='%23fbbc05' d='M24 46.9c6.4 0 11.9-2.1 15.9-5.7l-7.9-6.1c-2 1.3-4.6 2.1-8 2.1-6 0-11.1-4.4-12.9-10.1l-7.1 5.5C6.9 41.2 14.7 46.9 24 46.9z'/></svg>" alt="Google" className="h-5 w-5 rounded-full" />
                        <span className="flex-1 text-sm font-semibold text-gray-900">Sign in with Google</span>
                        {isSigningIn && (
                            <svg className="animate-spin h-5 w-5 text-gray-500" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                            </svg>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
