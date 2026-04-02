import React, { useState } from 'react';
import { InternalControlsView } from '../governance/InternalControlsView';
import { AssetsView } from '../governance/AssetsView';
import { PoliciesView } from '../governance/PoliciesView';
import { VulnerabilitiesView } from '../governance/VulnerabilitiesView';
import { AssetRelationshipsView } from '../governance/AssetRelationshipsView';
import { CapabilityRegisterView } from '../governance/CapabilityRegisterView';
import { ControlRegistryView } from '../governance/ControlRegistryView';

export const GovernanceTab: React.FC = () => {
    type SubTab = 'controls' | 'assets' | 'policies' | 'vulnerability' | 'relationships' | 'capabilities' | 'control_registry';
    const [activeSubTab, setActiveSubTab] = useState<SubTab>('assets');
    const [mountedSubTabs, setMountedSubTabs] = useState<Set<SubTab>>(new Set(['assets']));

    const handleSubTabChange = (tab: SubTab) => {
        setActiveSubTab(tab);
        setMountedSubTabs(prev => {
            if (prev.has(tab)) return prev;
            const next = new Set(prev);
            next.add(tab);
            return next;
        });
    };

    const subTabs: { id: SubTab; label: string }[] = [
        // { id: 'controls', label: 'Internal Control Catalogue' },
        { id: 'assets', label: 'Assets' },
        { id: 'policies', label: 'Policy' },
        { id: 'vulnerability', label: 'Vulnerability' },
        { id: 'relationships', label: 'Asset Relationships' },
        { id: 'capabilities', label: 'Capability Register' },
        { id: 'control_registry', label: 'Control Registry' },
    ];

    return (
        <div className="px-4 py-6 sm:px-0">
            <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    {subTabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => handleSubTabChange(tab.id)}
                            data-tab={tab.id}
                            className={`${
                                activeSubTab === tab.id
                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
                            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>
            <div className="mt-6">
                {mountedSubTabs.has('assets') && (
                    <div className={activeSubTab === 'assets' ? '' : 'hidden'}><AssetsView /></div>
                )}
                {mountedSubTabs.has('policies') && (
                    <div className={activeSubTab === 'policies' ? '' : 'hidden'}><PoliciesView /></div>
                )}
                {mountedSubTabs.has('vulnerability') && (
                    <div className={activeSubTab === 'vulnerability' ? '' : 'hidden'}><VulnerabilitiesView /></div>
                )}
                {mountedSubTabs.has('relationships') && (
                    <div className={activeSubTab === 'relationships' ? '' : 'hidden'}><AssetRelationshipsView /></div>
                )}
                {mountedSubTabs.has('capabilities') && (
                    <div className={activeSubTab === 'capabilities' ? '' : 'hidden'}><CapabilityRegisterView /></div>
                )}
                {mountedSubTabs.has('control_registry') && (
                    <div className={activeSubTab === 'control_registry' ? '' : 'hidden'}><ControlRegistryView /></div>
                )}
            </div>
        </div>
    );
};
