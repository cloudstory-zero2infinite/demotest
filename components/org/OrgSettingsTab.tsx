import React, { useState, useEffect } from 'react';
import * as SupabaseService from '../../services/supabase';

interface OrgSettingsTabProps {
    isActive?: boolean;
}

export const OrgSettingsTab: React.FC<OrgSettingsTabProps> = ({ isActive = true }) => {
    const [policyRefreshMonths, setPolicyRefreshMonths] = useState(3);
    const [availableFrameworks, setAvailableFrameworks] = useState<string[]>([]);
    const [selectedFrameworks, setSelectedFrameworks] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (!isActive) return;
        setLoading(true);
        Promise.all([
            SupabaseService.getOrgSettings(),
            SupabaseService.getAvailableFrameworks(),
        ])
            .then(([settings, frameworks]) => {
                setPolicyRefreshMonths(settings.policy_refresh_months);
                setSelectedFrameworks(settings.needed_framework || []);
                setAvailableFrameworks(frameworks);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [isActive]);

    const toggleFramework = (fw: string) => {
        setSelectedFrameworks(prev =>
            prev.includes(fw) ? prev.filter(f => f !== fw) : [...prev, fw]
        );
    };

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        try {
            const result = await SupabaseService.updateOrgSettings({
                policy_refresh_months: policyRefreshMonths,
                needed_framework: selectedFrameworks,
            });
            setPolicyRefreshMonths(result.policy_refresh_months);
            if (result.needed_framework) setSelectedFrameworks(result.needed_framework);
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

            {/* Policy Settings */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
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
            </div>

            {/* Compliance Frameworks */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-4">Compliance Frameworks</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
                    Select the frameworks your organisation needs to track. Only selected frameworks will appear in the Compliance tab.
                </p>

                {availableFrameworks.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                        No frameworks found in compliance data. Import compliance data first.
                    </p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {availableFrameworks.map(fw => {
                            const isSelected = selectedFrameworks.includes(fw);
                            return (
                                <button
                                    key={fw}
                                    type="button"
                                    onClick={() => toggleFramework(fw)}
                                    className={`px-3 py-1.5 text-sm font-medium rounded-full border transition-all duration-200 ${
                                        isSelected
                                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                            : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:border-blue-500'
                                    }`}
                                >
                                    {isSelected && (
                                        <svg className="inline-block w-3.5 h-3.5 mr-1 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                    {fw}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Save */}
            <div className="flex items-center gap-3">
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
    );
};
