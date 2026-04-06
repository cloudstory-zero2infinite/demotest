import React, { useState, useEffect } from 'react';
import * as SupabaseService from '../../services/supabase';

interface OrgSettingsTabProps {
    isActive?: boolean;
}

export const OrgSettingsTab: React.FC<OrgSettingsTabProps> = ({ isActive = true }) => {
    const [policyRefreshMonths, setPolicyRefreshMonths] = useState(3);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (!isActive) return;
        setLoading(true);
        SupabaseService.getOrgSettings()
            .then(data => setPolicyRefreshMonths(data.policy_refresh_months))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [isActive]);

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        try {
            const result = await SupabaseService.updateOrgSettings({ policy_refresh_months: policyRefreshMonths });
            setPolicyRefreshMonths(result.policy_refresh_months);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err: any) {
            alert(err.message || 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
        );
    }

    return (
        <div className="max-w-2xl">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Organisation Settings</h2>

            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-4">Policy Settings</h3>

                <div className="flex items-center gap-4">
                    <label htmlFor="policy-refresh-months" className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        Policy Refresh / Expiry Time Frame
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            id="policy-refresh-months"
                            type="number"
                            min={1}
                            max={120}
                            value={policyRefreshMonths}
                            onChange={e => setPolicyRefreshMonths(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-20 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-500 dark:text-gray-400">months</span>
                    </div>
                </div>
                <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                    Approved policies will automatically expire and move to "To Review" status after this period.
                </p>

                <div className="mt-6 flex items-center gap-3">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
                    >
                        {saving ? 'Saving...' : 'Save Settings'}
                    </button>
                    {saved && (
                        <span className="text-sm text-green-600 dark:text-green-400">Settings saved successfully</span>
                    )}
                </div>
            </div>
        </div>
    );
};
