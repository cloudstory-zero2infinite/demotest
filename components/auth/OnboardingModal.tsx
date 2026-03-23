import React, { useState } from 'react';
import * as SupabaseService from '../../services/supabase';

type OnboardingOption = 'individual' | 'create-org' | 'join-org' | null;

interface OnboardingModalProps {
  onComplete: () => void; // called after successful setup
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ onComplete }) => {
  const [selected, setSelected] = useState<OnboardingOption>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create org form
  const [orgName, setOrgName] = useState('');
  const [orgLocation, setOrgLocation] = useState('');
  const [orgWebsite, setOrgWebsite] = useState('');

  // Join org form
  const [adminEmail, setAdminEmail] = useState('');
  const [joinSuccess, setJoinSuccess] = useState(false);

  const clearError = () => setError(null);

  const handleIndividual = async () => {
    setLoading(true);
    clearError();
    try {
      await SupabaseService.setupIndividual();
      onComplete();
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    clearError();
    try {
      await SupabaseService.setupCreateOrg(orgName, orgLocation, orgWebsite || undefined);
      onComplete();
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    clearError();
    try {
      await SupabaseService.setupJoinRequest(adminEmail);
      setJoinSuccess(true);
      onComplete(); // signal App.tsx — will show pending banner instead of modal
    } catch (err: any) {
      setError(err.message || 'Could not find that admin. Please check the email and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-1">
            <img src="/logo.png" alt="Zero to Infinite" className="h-10 w-10 object-contain flex-shrink-0" />
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Welcome to Zero to Infinite</h1>
              <p className="text-xs text-gray-400 uppercase tracking-widest">Governance Risk Compliance</p>
            </div>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
            You're not set up yet. How would you like to get started?
          </p>
        </div>

        {/* Content */}
        <div className="px-8 py-6">

          {/* Option selection cards */}
          {!selected && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Individual */}
              <button
                onClick={() => { clearError(); setSelected('individual'); }}
                className="text-left p-5 rounded-xl border-2 border-gray-200 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group"
              >
                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center mb-3 group-hover:bg-purple-200 dark:group-hover:bg-purple-900/60 transition-colors">
                  <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">Individual Use</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">For solo or consultant work. Jump in right away with your own workspace.</p>
              </button>

              {/* Create org */}
              <button
                onClick={() => { clearError(); setSelected('create-org'); }}
                className="text-left p-5 rounded-xl border-2 border-gray-200 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center mb-3 group-hover:bg-blue-200 dark:group-hover:bg-blue-900/60 transition-colors">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">Create a New Workspace</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Set up a workspace for your organisation. You'll be the admin.</p>
              </button>

              {/* Join org */}
              <button
                onClick={() => { clearError(); setSelected('join-org'); }}
                className="text-left p-5 rounded-xl border-2 border-gray-200 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group"
              >
                <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/40 flex items-center justify-center mb-3 group-hover:bg-green-200 dark:group-hover:bg-green-900/60 transition-colors">
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">Join an Existing Org</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Your organisation is already on Zero to Infinite. Request access from your admin.</p>
              </button>
            </div>
          )}

          {/* Individual confirmation */}
          {selected === 'individual' && (
            <div className="space-y-5">
              <button onClick={() => setSelected(null)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-5 border border-purple-100 dark:border-purple-800">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Individual / Consultant Workspace</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  We'll create a personal workspace for you. You can explore all GRC features. Your role will be set to <strong>User</strong>.
                </p>
                <button
                  onClick={handleIndividual}
                  disabled={loading}
                  className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {loading && <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>}
                  {loading ? 'Setting up...' : 'Set up my workspace'}
                </button>
              </div>
            </div>
          )}

          {/* Create org form */}
          {selected === 'create-org' && (
            <div className="space-y-4">
              <button onClick={() => setSelected(null)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <form onSubmit={handleCreateOrg} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Organisation Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={orgName}
                    onChange={e => { setOrgName(e.target.value); clearError(); }}
                    placeholder="e.g. Acme Corp"
                    required
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Location <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={orgLocation}
                    onChange={e => setOrgLocation(e.target.value)}
                    placeholder="e.g. Singapore"
                    required
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Website <span className="text-gray-400 text-xs">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={orgWebsite}
                    onChange={e => setOrgWebsite(e.target.value)}
                    placeholder="e.g. https://acme.com"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {loading && <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>}
                  {loading ? 'Creating workspace...' : 'Create workspace'}
                </button>
              </form>
            </div>
          )}

          {/* Join org form */}
          {selected === 'join-org' && (
            <div className="space-y-4">
              <button onClick={() => setSelected(null)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-5 border border-green-100 dark:border-green-800">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Request access from your admin</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Enter your organisation admin's email address. They'll receive your request and can approve your access.
                </p>
                <form onSubmit={handleJoinRequest} className="space-y-3">
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={e => { setAdminEmail(e.target.value); clearError(); }}
                    placeholder="admin@yourcompany.com"
                    required
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {loading && <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>}
                    {loading ? 'Sending request...' : 'Send join request'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mt-4 flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
              <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
