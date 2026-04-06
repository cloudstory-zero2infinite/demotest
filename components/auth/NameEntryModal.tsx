import React, { useState } from 'react';
import { FaGithub } from "react-icons/fa";
import * as SupabaseService from '../../services/supabase';

interface NameEntryModalProps {
    isOpen: boolean;
}

const PASSWORD_RULES = [
    { test: (p: string) => p.length >= 8, label: 'At least 8 characters' },
    { test: (p: string) => /[A-Z]/.test(p), label: 'One uppercase letter' },
    { test: (p: string) => /[a-z]/.test(p), label: 'One lowercase letter' },
    { test: (p: string) => /[0-9]/.test(p), label: 'One number' },
    { test: (p: string) => /[^A-Za-z0-9]/.test(p), label: 'One special character' },
];

type EmailMode = 'signin' | 'signup';

export const NameEntryModal: React.FC<NameEntryModalProps> = ({ isOpen }) => {
    const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
    const [isGitHubSigningIn, setIsGitHubSigningIn] = useState(false);

    // Email auth state
    const [showEmail, setShowEmail] = useState(false);
    const [emailMode, setEmailMode] = useState<EmailMode>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [emailLoading, setEmailLoading] = useState(false);
    const [emailMessage, setEmailMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    if (!isOpen) return null;

    const validatePassword = (pwd: string): string | null => {
        const failing = PASSWORD_RULES.filter(r => !r.test(pwd));
        if (failing.length > 0) return `Password requires: ${failing.map(r => r.label.toLowerCase()).join(', ')}`;
        return null;
    };

    const handleEmailSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        setEmailMessage(null);

        try {
            setEmailLoading(true);
            sessionStorage.setItem('freshLogin', 'true');
            sessionStorage.setItem('loginProvider', 'email');

            const { error } = await SupabaseService.supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (error) throw error;
        } catch (err: any) {
            setEmailMessage({ type: 'error', text: err?.message || 'Sign-in failed. Please try again.' });
        } finally {
            setEmailLoading(false);
        }
    };

    const handleResetPassword = async () => {
        setEmailMessage(null);
        if (!email) {
            setEmailMessage({ type: 'error', text: 'Enter your email above first.' });
            return;
        }
        try {
            setEmailLoading(true);
            const { error } = await SupabaseService.supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/`,
            });
            if (error) throw error;
            setEmailMessage({ type: 'success', text: 'Password reset link sent to your email.' });
        } catch (err: any) {
            setEmailMessage({ type: 'error', text: err?.message || 'Failed to send reset email.' });
        } finally {
            setEmailLoading(false);
        }
    };

    const handleEmailSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        setEmailMessage(null);

        const pwdError = validatePassword(password);
        if (pwdError) {
            setEmailMessage({ type: 'error', text: pwdError });
            return;
        }
        if (password !== confirmPassword) {
            setEmailMessage({ type: 'error', text: 'Passwords do not match.' });
            return;
        }

        try {
            setEmailLoading(true);
            const { data, error } = await SupabaseService.supabase.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: `${window.location.origin}/` },
            });
            if (error) throw error;

            // Supabase returns a user with identities=[] if email already exists (when email confirmations are on)
            if (data.user && data.user.identities && data.user.identities.length === 0) {
                setEmailMessage({ type: 'error', text: 'An account with this email already exists. Use "Forgot password?" on the Sign in tab to set a password for email login.' });
                return;
            }

            setEmailMessage({ type: 'success', text: 'Check your email to verify your account, then sign in.' });
            setPassword('');
            setConfirmPassword('');
        } catch (err: any) {
            setEmailMessage({ type: 'error', text: err?.message || 'Signup failed. Please try again.' });
        } finally {
            setEmailLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        try {
            setIsGoogleSigningIn(true);
            if (!SupabaseService.supabase || !SupabaseService.supabase.auth) {
                throw new Error('Authentication service is not available. Please check your configuration.');
            }
            sessionStorage.setItem('freshLogin', 'true');
            sessionStorage.setItem('loginProvider', 'google');

            try {
                await SupabaseService.logAllActivity({
                    action: 'google_login_initiated', module: 'Authentication',
                    entity_name: 'User', event_data: { provider: 'google' }
                });
            } catch (logErr) { console.error('Failed to log login initiation activity', logErr); }

            await SupabaseService.supabase.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: `${window.location.origin}/`, scopes: 'profile email' }
            });
        } catch (err: any) {
            console.error('Sign-in error:', err?.message || err);
            setIsGoogleSigningIn(false);
            try {
                await SupabaseService.logAllActivity({
                    action: 'google_login_failed', module: 'Authentication',
                    entity_name: 'Unknown User', severity: 'warning',
                    event_data: { provider: 'google', error: err?.message || 'Sign-in initiation failed' }
                });
            } catch (logErr) { console.error('Failed to log failed login activity', logErr); }
            alert(`Sign-in error: ${err?.message || 'Failed to initiate sign-in. Please try again.'}`);
        }
    };

    const handleGitHubSignIn = async () => {
        try {
            setIsGitHubSigningIn(true);
            if (!SupabaseService.supabase || !SupabaseService.supabase.auth) {
                throw new Error('Authentication service is not available. Please check your configuration.');
            }
            sessionStorage.setItem('freshLogin', 'true');
            sessionStorage.setItem('loginProvider', 'github');

            try {
                await SupabaseService.logAllActivity({
                    action: 'github_login_initiated', module: 'Authentication',
                    entity_name: 'User', event_data: { provider: 'github' }
                });
            } catch (logErr) { console.error('Failed to log login initiation activity', logErr); }

            await SupabaseService.supabase.auth.signInWithOAuth({
                provider: 'github',
                options: { redirectTo: `${window.location.origin}/`, scopes: 'user:email' }
            });
        } catch (err: any) {
            console.error('Sign-in error:', err?.message || err);
            setIsGitHubSigningIn(false);
            try {
                await SupabaseService.logAllActivity({
                    action: 'github_login_failed', module: 'Authentication',
                    entity_name: 'Unknown User', severity: 'warning',
                    event_data: { provider: 'github', error: err?.message || 'Sign-in initiation failed' }
                });
            } catch (logErr) { console.error('Failed to log failed login activity', logErr); }
            alert(`Sign-in error: ${err?.message || 'Failed to initiate sign-in. Please try again.'}`);
        }
    };

    const passwordStrength = password ? PASSWORD_RULES.filter(r => r.test(password)).length : 0;

    return (
        <div className="fixed inset-0 bg-blue-50 dark:bg-blue-900 z-[100] flex items-center justify-center p-6" aria-modal="true" role="dialog">
            <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-6">
                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                    <img src="/logo.png" alt="Zero to Infinite" className="h-10 w-10 object-contain flex-shrink-0" />
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Zero to Infinite</h2>
                        <p className="text-xs text-gray-400 uppercase tracking-widest">Governance Risk Compliance</p>
                    </div>
                </div>

                <p className="text-sm text-gray-600 mb-5">Sign in to get started.</p>

                {/* Continue with IDPs */}
                <div className="space-y-2.5 mb-4">
                    <button type="button" onClick={handleGoogleSignIn} disabled={isGoogleSigningIn} aria-live="polite"
                        className="w-full inline-flex items-center justify-center gap-3 px-5 py-3 bg-white border border-gray-200 rounded-full shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-60 transition">
                        <img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><path fill='%23ea4335' d='M24 9.5c3.9 0 6.6 1.7 8.1 3.1l6-5.9C35.9 3.6 30.4 1 24 1 14.7 1 6.9 6.7 3.1 14.9l7.1 5.5C12.9 15.1 18 9.5 24 9.5z'/><path fill='%2334a853' d='M46.5 24c0-1.6-.1-2.9-.4-4.2H24v8.1h12.5c-.5 2.9-2.4 5.3-5.1 6.9l7.9 6.1C43.5 36.2 46.5 30.6 46.5 24z'/><path fill='%234a90e2' d='M10.2 29.3A14.8 14.8 0 0 1 9 24c0-1.1.2-2.1.4-3.1l-7.1-5.5C1.2 17.1 0 20.4 0 24c0 3.6 1.2 6.9 3.3 9.6l6.9-4.3z'/><path fill='%23fbbc05' d='M24 46.9c6.4 0 11.9-2.1 15.9-5.7l-7.9-6.1c-2 1.3-4.6 2.1-8 2.1-6 0-11.1-4.4-12.9-10.1l-7.1 5.5C6.9 41.2 14.7 46.9 24 46.9z'/></svg>" alt="Google" className="h-5 w-5 rounded-full" />
                        <span className="flex-1 text-sm font-semibold text-gray-900">Continue with Google</span>
                        {isGoogleSigningIn && (
                            <svg className="animate-spin h-5 w-5 text-gray-500" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                            </svg>
                        )}
                    </button>

                    <button type="button" onClick={handleGitHubSignIn} disabled={isGitHubSigningIn} aria-live="polite"
                        className="w-full inline-flex items-center justify-center gap-3 px-5 py-3 bg-white border border-gray-200 rounded-full shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-60 transition">
                        <div className="h-5 w-5 flex-shrink-0"><FaGithub size={20} /></div>
                        <span className="flex-1 text-sm font-semibold text-gray-900">Continue with GitHub</span>
                        {isGitHubSigningIn && (
                            <svg className="animate-spin h-5 w-5 text-gray-500" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                            </svg>
                        )}
                    </button>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-400 uppercase">or</span>
                    <div className="flex-1 h-px bg-gray-200" />
                </div>

                {/* Email sign-in / sign-up toggle */}
                {!showEmail ? (
                    <button type="button" onClick={() => { setShowEmail(true); setEmailMode('signin'); setEmailMessage(null); }}
                        className="w-full inline-flex items-center justify-center gap-3 px-5 py-3 bg-white border border-gray-200 rounded-full shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition">
                        <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span className="flex-1 text-sm font-semibold text-gray-900">Login with Email</span>
                    </button>
                ) : (
                    <div className="border border-gray-200 rounded-lg p-4">
                        {/* Tabs */}
                        <div className="flex gap-4 mb-3 border-b border-gray-100 pb-2">
                            <button type="button" onClick={() => { setEmailMode('signin'); setEmailMessage(null); }}
                                className={`text-sm font-medium pb-1 ${emailMode === 'signin' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-500'}`}>
                                Sign in
                            </button>
                            <button type="button" onClick={() => { setEmailMode('signup'); setEmailMessage(null); }}
                                className={`text-[11px] pb-1 ${emailMode === 'signup' ? 'text-gray-600 border-b-2 border-gray-400' : 'text-gray-300 hover:text-gray-400'}`}>
                                Sign up
                            </button>
                        </div>

                        {emailMessage && (
                            <p className={`text-xs px-2 py-1.5 rounded mb-2 ${emailMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                {emailMessage.text}
                            </p>
                        )}

                        <form onSubmit={emailMode === 'signin' ? handleEmailSignIn : handleEmailSignUp} className="space-y-2">
                            <input type="email" placeholder="Email" required value={email} onChange={e => setEmail(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400" />
                            <input type="password" placeholder="Password" required value={password} onChange={e => setPassword(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400" />

                            {emailMode === 'signup' && (
                                <>
                                    <input type="password" placeholder="Confirm password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                    {/* Password strength indicator */}
                                    {password && (
                                        <div className="space-y-1">
                                            <div className="flex gap-1">
                                                {PASSWORD_RULES.map((_, i) => (
                                                    <div key={i} className={`h-1 flex-1 rounded-full ${i < passwordStrength ? 'bg-blue-500' : 'bg-gray-200'}`} />
                                                ))}
                                            </div>
                                            <ul className="text-[10px] text-gray-400 space-y-0.5">
                                                {PASSWORD_RULES.map(r => (
                                                    <li key={r.label} className={r.test(password) ? 'text-green-500' : ''}>
                                                        {r.test(password) ? '\u2713' : '\u2022'} {r.label}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </>
                            )}

                            <button type="submit" disabled={emailLoading}
                                className={`w-full py-2 text-sm font-medium rounded-md transition disabled:opacity-50 ${
                                    emailMode === 'signin'
                                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                                        : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200'
                                }`}>
                                {emailLoading ? 'Please wait...' : emailMode === 'signin' ? 'Sign in' : 'Create Account'}
                            </button>
                        </form>

                        <div className="flex items-center justify-between mt-2">
                            <button type="button" onClick={() => { setShowEmail(false); setEmailMessage(null); setPassword(''); setConfirmPassword(''); }}
                                className="text-[11px] text-gray-400 hover:text-gray-500 underline">
                                Back
                            </button>
                            {emailMode === 'signin' && (
                                <button type="button" onClick={handleResetPassword} disabled={emailLoading}
                                    className="text-[11px] text-gray-400 hover:text-gray-500 underline disabled:opacity-50">
                                    Forgot password?
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
