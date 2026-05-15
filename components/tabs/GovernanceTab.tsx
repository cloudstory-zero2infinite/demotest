import React, { useState, useEffect } from 'react';

import { InternalControlsView } from '../governance/InternalControlsView';

import { AssetsView } from '../governance/AssetsView';

import { PoliciesView } from '../governance/PoliciesView';

import { VulnerabilitiesView } from '../governance/VulnerabilitiesView';

import { AssetRelationshipsView } from '../governance/AssetRelationshipsView';

import { CapabilityRegisterView } from '../governance/CapabilityRegisterView';

import { ControlRegistryView } from '../governance/ControlRegistryView';

import { MapperVisualizerView } from '../governance/MapperVisualizerView';




interface GovernanceTabProps {

    isActive?: boolean;

    externalSubTab?: string | null;

    externalOpenItemId?: string | null;

    onExternalSubTabConsumed?: () => void;

    activeGovernanceSubTab?: 'assets' | 'policies' | 'vulnerability' | 'relationships' | 'capabilities' | 'control_registry' | 'mapper_visualizer';

}



export const GovernanceTab: React.FC<GovernanceTabProps> = ({ 

    isActive = true, 

    externalSubTab, 

    externalOpenItemId, 

    onExternalSubTabConsumed,

    activeGovernanceSubTab = 'assets'

}) => {

    type SubTab = 'controls' | 'assets' | 'policies' | 'vulnerability' | 'relationships' | 'capabilities' | 'control_registry' | 'mapper_visualizer';

    const [activeSubTab, setActiveSubTab] = useState<SubTab>(activeGovernanceSubTab);

    const [mountedSubTabs, setMountedSubTabs] = useState<Set<SubTab>>(new Set([activeGovernanceSubTab]));



    // Item IDs to auto-open in child views

    const [openControlId, setOpenControlId] = useState<string | null>(null);

    const [openPolicyId, setOpenPolicyId] = useState<string | null>(null);

    const [focusMasterPolicyId, setFocusMasterPolicyId] = useState<string | null>(null);

    // Listen for navigation events dispatched from child views (e.g. the
    // Mapper Run modal's "Open in Mapper Visualizer" CTA).
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail || {};
            if (detail.subTab) {
                handleSubTabChange(detail.subTab as SubTab);
                if (detail.subTab === 'mapper_visualizer' && detail.masterPolicyId) {
                    setFocusMasterPolicyId(detail.masterPolicyId);
                }
            }
        };
        window.addEventListener('governance-navigate', handler);
        return () => window.removeEventListener('governance-navigate', handler);
    }, []);



    // Sync activeSubTab with activeGovernanceSubTab prop

    useEffect(() => {

        if (activeGovernanceSubTab !== activeSubTab) {

            handleSubTabChange(activeGovernanceSubTab as SubTab);

        }

    }, [activeGovernanceSubTab]);



    // React to external subtab navigation (e.g. from notification click)

    useEffect(() => {

        if (externalSubTab) {

            handleSubTabChange(externalSubTab as SubTab);

            if (externalOpenItemId) {

                if (externalSubTab === 'control_registry') {

                    setOpenControlId(externalOpenItemId);

                } else if (externalSubTab === 'policies') {

                    setOpenPolicyId(externalOpenItemId);

                }

            }

            onExternalSubTabConsumed?.();

        }

    }, [externalSubTab, externalOpenItemId]);



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
        { id: 'assets', label: 'Assets' },
        { id: 'policies', label: 'Policy' },
        { id: 'vulnerability', label: 'Vulnerability' },
        { id: 'relationships', label: 'Asset Relationships' },
        { id: 'capabilities', label: 'Capability Register' },
        { id: 'control_registry', label: 'Control Registry' },
        { id: 'mapper_visualizer', label: 'Mapper Visualizer' },
    ];

    return (
        <div className="px-4 py-6 sm:px-0">
            <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="-mb-px flex space-x-8 overflow-x-auto scrollbar-none" aria-label="Tabs">
                    {subTabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => handleSubTabChange(tab.id)}
                            className={`${
                                activeSubTab === tab.id
                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400 border-b-2'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
                            } whitespace-nowrap py-4 px-1 font-medium text-sm transition-colors duration-150`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            <div className="mt-6">

                {mountedSubTabs.has('assets') && (

                    <div className={activeSubTab === 'assets' ? '' : 'hidden'}><AssetsView isActive={isActive && activeSubTab === 'assets'} /></div>

                )}

                {mountedSubTabs.has('policies') && (

                    <div className={activeSubTab === 'policies' ? '' : 'hidden'}>

                        <PoliciesView isActive={isActive && activeSubTab === 'policies'} autoOpenPolicyId={openPolicyId} onAutoOpenConsumed={() => setOpenPolicyId(null)} />

                    </div>

                )}

                {mountedSubTabs.has('vulnerability') && (

                    <div className={activeSubTab === 'vulnerability' ? '' : 'hidden'}><VulnerabilitiesView isActive={isActive && activeSubTab === 'vulnerability'} /></div>

                )}

                {mountedSubTabs.has('relationships') && (

                    <div className={activeSubTab === 'relationships' ? '' : 'hidden'}><AssetRelationshipsView isActive={isActive && activeSubTab === 'relationships'} /></div>

                )}

                {mountedSubTabs.has('capabilities') && (

                    <div className={activeSubTab === 'capabilities' ? '' : 'hidden'}><CapabilityRegisterView isActive={isActive && activeSubTab === 'capabilities'} /></div>

                )}

                {mountedSubTabs.has('control_registry') && (

                    <div className={activeSubTab === 'control_registry' ? '' : 'hidden'}>

                        <ControlRegistryView isActive={isActive && activeSubTab === 'control_registry'} autoOpenControlId={openControlId} onAutoOpenConsumed={() => setOpenControlId(null)} />

                    </div>

                )}

                {mountedSubTabs.has('mapper_visualizer') && (

                    <div className={activeSubTab === 'mapper_visualizer' ? '' : 'hidden'}>

                        <MapperVisualizerView
                            isActive={isActive && activeSubTab === 'mapper_visualizer'}
                            focusMasterPolicyId={focusMasterPolicyId}
                            onFocusConsumed={() => setFocusMasterPolicyId(null)}
                        />

                    </div>

                )}

            </div>

        </div>

    );

};

