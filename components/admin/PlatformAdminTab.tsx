import React, { useState, useEffect, FormEvent } from 'react';
import * as SupabaseService from '../../services/supabase';

export const PlatformAdminTab: React.FC = () => {
    const [emailDescriptionPairs, setEmailDescriptionPairs] = useState<Array<{email: string, description: string}>>([
        { email: '', description: '' }
    ]);
    const [loading, setLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [onboardedUsers, setOnboardedUsers] = useState<any[]>([]);
    const [orgName, setOrgName] = useState<string | null>(null);

    useEffect(() => {
        const fetchOrgDetails = async () => {
            try {
                const orgId = await SupabaseService.getUserOrgId();
                if (orgId) {
                    const { data } = await SupabaseService.supabase
                        .from('organizations')
                        .select('name')
                        .eq('id', orgId)
                        .single();
                    
                    if (data) {
                        setOrgName(data.name);
                    }
                }
            } catch (err) {
                console.error('Error fetching organization details:', err);
            }
        };
        fetchOrgDetails();
    }, []);

    const handlePairChange = (index: number, field: 'email' | 'description', value: string) => {
        setEmailDescriptionPairs(prev => {
            const updated = [...prev];
            updated[index][field] = value;
            return updated;
        });
    };

    const addPair = () => {
        setEmailDescriptionPairs(prev => [...prev, { email: '', description: '' }]);
    };

    const removePair = (index: number) => {
        setEmailDescriptionPairs(prev => prev.filter((_, i) => i !== index));
    };

    const handleOnboardUsers = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setSuccessMessage('');
        setErrorMessage('');

        try {
            const orgId = await SupabaseService.getUserOrgId();
            if (!orgId) {
                throw new Error('No organization found for current user');
            }

            const validPairs = emailDescriptionPairs.filter(pair => pair.email.trim().length > 0);

            if (validPairs.length === 0) {
                throw new Error('Please enter at least one email address');
            }

            const successfulUsers: any[] = [];
            const failedUsers: Array<{email: string, reason: string}> = [];

            for (const pair of validPairs) {
                try {
                    const userData = await SupabaseService.onboardUserToOrganization(
                        orgId,
                        pair.email,
                        'user',
                        pair.description
                    );
                    successfulUsers.push({ ...pair, ...userData });
                } catch (err) {
                    const reason = err instanceof Error ? err.message : 'Unknown error';
                    failedUsers.push({ email: pair.email, reason });
                }
            }

            await SupabaseService.logAllActivity({
                action: 'Onboarded Users',
                module: 'Tenant Admin',
                event_data: {
                    usersOnboarded: successfulUsers.length,
                    failedUsers: failedUsers.length > 0 ? failedUsers : undefined
                }
            });

            if (successfulUsers.length > 0) {
                const pendingCount = successfulUsers.filter((u: any) => !u.user_id).length;
                const activeCount = successfulUsers.length - pendingCount;
                
                let msg = `✓ Successfully added ${successfulUsers.length} user(s).`;
                if (activeCount > 0 && pendingCount > 0) {
                    msg += ` (${activeCount} active, ${pendingCount} pending invitation)`;
                } else if (pendingCount > 0) {
                    msg += ` (${pendingCount} pending - awaiting sign up)`;
                } else if (activeCount > 0) {
                    msg += ` (${activeCount} active)`;
                }
                
                setSuccessMessage(msg);
                setOnboardedUsers(prev => [...prev, ...successfulUsers]);
            }

            if (failedUsers.length > 0) {
                const failedMsg = failedUsers.map(f => `${f.email}: ${f.reason}`).join('\n');
                setErrorMessage(`Failed to add ${failedUsers.length} user(s):\n${failedMsg}`);
            }
            
            if (failedUsers.length === 0) {
                setEmailDescriptionPairs([{ email: '', description: '' }]);
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : JSON.stringify(err);
            setErrorMessage(`Failed to onboard users: ${errorMsg}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
                <h3 className="text-lg font-bold text-blue-900 dark:text-blue-300 mb-2">Your Organization</h3>
                <p className="text-sm text-blue-700 dark:text-blue-400">
                    {orgName ? `You are managing: ${orgName}` : 'Loading organization details...'}
                </p>
            </div>

            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Add Members to Your Organization</h2>
                
                {successMessage && (
                    <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300">
                        {successMessage}
                    </div>
                )}

                {errorMessage && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300 whitespace-pre-wrap">
                        {errorMessage}
                    </div>
                )}

                <form onSubmit={handleOnboardUsers} className="space-y-6">
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <label className="block text-sm font-medium text-gray-900 dark:text-gray-300">
                                Users to Onboard *
                            </label>
                            <button
                                type="button"
                                onClick={addPair}
                                className="px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/40"
                            >
                                + Add User
                            </button>
                        </div>

                        {emailDescriptionPairs.map((pair, index) => (
                            <div key={index} className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Email *
                                    </label>
                                    <input
                                        type="email"
                                        value={pair.email}
                                        onChange={(e) => handlePairChange(index, 'email', e.target.value)}
                                        placeholder="user@example.com"
                                        className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-600 dark:border-gray-600 dark:text-white text-sm"
                                    />
                                </div>
                                <div className="md:col-span-1">
                                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Description (Optional)
                                    </label>
                                    <input
                                        type="text"
                                        value={pair.description}
                                        onChange={(e) => handlePairChange(index, 'description', e.target.value)}
                                        placeholder="e.g., Manager, Team Lead"
                                        className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-600 dark:border-gray-600 dark:text-white text-sm"
                                    />
                                </div>
                                <div className="flex items-end">
                                    {emailDescriptionPairs.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removePair(index)}
                                            className="w-full px-3 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/40"
                                        >
                                            Remove
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-end space-x-3">
                        <button
                            type="button"
                            onClick={() => setEmailDescriptionPairs([{ email: '', description: '' }])}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600"
                        >
                            Clear
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Onboarding...' : 'Onboard Users'}
                        </button>
                    </div>
                </form>
            </div>

            {onboardedUsers.length > 0 && (
                <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Recently Onboarded Users</h3>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-900">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Email</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Description</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Role</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Status</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Onboarded At</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {onboardedUsers.map((user, idx) => (
                                    <tr key={idx}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{user.email}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{user.description || '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{user.role}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            {user.user_id ? (
                                                <span className="inline-flex px-2 py-1 text-xs font-semibold leading-5 text-green-800 bg-green-100 rounded-full dark:bg-green-900/30 dark:text-green-300">
                                                    Active
                                                </span>
                                            ) : (
                                                <span className="inline-flex px-2 py-1 text-xs font-semibold leading-5 text-yellow-800 bg-yellow-100 rounded-full dark:bg-yellow-900/30 dark:text-yellow-300">
                                                    Pending Signup
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Just now'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};
