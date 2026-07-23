import React, { useState, useEffect } from 'react';

import { AssetsView } from '../governance/AssetsView';
import { PoliciesView } from '../governance/PoliciesView';
import { VulnerabilitiesView } from '../governance/VulnerabilitiesView';
import { AssetRelationshipsView } from '../governance/AssetRelationshipsView';
import { CapabilityRegisterView } from '../governance/CapabilityRegisterView';
import { ControlRegistryView } from '../governance/ControlRegistryView';
import { MapperVisualizerView } from '../governance/MapperVisualizerView';
import { DueDiligenceTPRMView } from '../governance/DueDiligenceTPRMView';

import { UserRole } from '../../types';
import { GovernanceSubTab } from '../Sidebar';

type SubTab = GovernanceSubTab;

interface GovernanceTabProps {
    isActive?: boolean;
    externalSubTab?: string | null;
    externalOpenItemId?: string | null;
    onExternalSubTabConsumed?: () => void;
    // Fired whenever the active sub-tab changes as a result of something
    // that happened *inside* GovernanceTab (a tab-bar click, or a
    // navigation request from a child view). App.tsx uses this to keep
    // its own governanceSubTab state and the URL hash in sync.
    onSubTabChange?: (tab: GovernanceSubTab) => void;
    userRole: UserRole | null;
}

const DEFAULT_SUB_TAB: SubTab = 'assets';

export const GovernanceTab: React.FC<GovernanceTabProps> = ({
    isActive = true,
    externalSubTab,
    externalOpenItemId,
    onExternalSubTabConsumed,
    onSubTabChange,
    userRole
}) => {

    const initialSubTab: SubTab = (externalSubTab as SubTab) || DEFAULT_SUB_TAB;

    const [activeSubTab, setActiveSubTab] = useState<SubTab>(initialSubTab);

    const [mountedSubTabs, setMountedSubTabs] = useState<Set<SubTab>>(
        new Set([initialSubTab])
    );

    // Item IDs to auto-open in child views
    const [openControlId, setOpenControlId] = useState<string | null>(null);
    const [openPolicyId, setOpenPolicyId] = useState<string | null>(null);
    const [focusMasterPolicyId, setFocusMasterPolicyId] = useState<string | null>(null);

    // Internal-only: update local state without notifying the parent.
    // Use this when the change originates FROM the parent (externalSubTab
    // prop) so we don't call back and create a redundant round-trip.
    const applySubTab = (tab: SubTab) => {
        setActiveSubTab(tab);
        setMountedSubTabs(prev => {
            if (prev.has(tab)) return prev;
            const next = new Set(prev);
            next.add(tab);
            return next;
        });
    };

    // User/child-initiated: update local state AND notify the parent so
    // App.tsx can update governanceSubTab + the URL hash.
    const handleSubTabChange = (tab: SubTab) => {
        applySubTab(tab);
        onSubTabChange?.(tab);
    };

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

    // React to external subtab navigation (e.g. from Sidebar, deep links,
    // or notification clicks). This is parent-driven, so we only sync
    // local state — we don't call onSubTabChange here.
    useEffect(() => {
        if (!externalSubTab) return;

        applySubTab(externalSubTab as SubTab);

        if (externalOpenItemId) {
            if (externalSubTab === 'control_registry') {
                setOpenControlId(externalOpenItemId);
            } else if (externalSubTab === 'policies') {
                setOpenPolicyId(externalOpenItemId);
            }
        }

        onExternalSubTabConsumed?.();
    }, [externalSubTab, externalOpenItemId]);

    const subTabs: { id: SubTab; label: string }[] = [
        { id: 'assets', label: 'Assets' },
        { id: 'policies', label: 'Policy' },
        { id: 'vulnerability', label: 'Vulnerability' },
        { id: 'relationships', label: 'Asset Relationships' },
        { id: 'capabilities', label: 'Capability Register' },
        { id: 'control_registry', label: 'Control Registry' },
        { id: 'due_diligence', label: 'Due Diligence & TPRM' },
        { id: 'mapper_visualizer', label: 'Mapper Visualizer' },
    ];

    return (
        <div className="py-2">
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
                            } whitespace-nowrap py-2.5 px-1 font-medium text-sm transition-colors duration-150`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            <div className="mt-4">

                {mountedSubTabs.has('assets') && (
                    <div className={activeSubTab === 'assets' ? '' : 'hidden'}>
                        <AssetsView userRole={userRole} isActive={isActive && activeSubTab === 'assets'} />
                    </div>
                )}

                {mountedSubTabs.has('policies') && (
                    <div className={activeSubTab === 'policies' ? '' : 'hidden'}>
                        <PoliciesView userRole={userRole} isActive={isActive && activeSubTab === 'policies'} autoOpenPolicyId={openPolicyId} onAutoOpenConsumed={() => setOpenPolicyId(null)} />
                    </div>
                )}

                {mountedSubTabs.has('vulnerability') && (
                    <div className={activeSubTab === 'vulnerability' ? '' : 'hidden'}>
                        <VulnerabilitiesView userRole={userRole} isActive={isActive && activeSubTab === 'vulnerability'} />
                    </div>
                )}

                {mountedSubTabs.has('relationships') && (
                    <div className={activeSubTab === 'relationships' ? '' : 'hidden'}>
                        <AssetRelationshipsView userRole={userRole} isActive={isActive && activeSubTab === 'relationships'} />
                    </div>
                )}

                {mountedSubTabs.has('capabilities') && (
                    <div className={activeSubTab === 'capabilities' ? '' : 'hidden'}>
                        <CapabilityRegisterView userRole={userRole} isActive={isActive && activeSubTab === 'capabilities'} />
                    </div>
                )}

                {mountedSubTabs.has('control_registry') && (
                    <div className={activeSubTab === 'control_registry' ? '' : 'hidden'}>
                        <ControlRegistryView userRole={userRole} isActive={isActive && activeSubTab === 'control_registry'} autoOpenControlId={openControlId} onAutoOpenConsumed={() => setOpenControlId(null)} />
                    </div>
                )}

                {mountedSubTabs.has('due_diligence') && (
                    <div className={activeSubTab === 'due_diligence' ? '' : 'hidden'}>
                        <DueDiligenceTPRMView userRole={userRole} isActive={isActive && activeSubTab === 'due_diligence'} />
                    </div>
                )}

                {mountedSubTabs.has('mapper_visualizer') && (
                    <div className={activeSubTab === 'mapper_visualizer' ? '' : 'hidden'}>
                        <MapperVisualizerView
                            userRole={userRole}
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