import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Asset, Compliance, InternalControl, ControlRegistry, PolicyDocument, ProgramTask, Vulnerability, AssetCriticality, InternalControlStatus, ProgramStatus } from '../../types';
import * as SupabaseService from '../../services/supabase';
import { useDataRefresh } from '../../hooks/useDataRefresh';

// Sub-components
import { SecurityScoreCard } from '../dashboard/SecurityScoreCard';
import { ProgramStatusCard } from '../dashboard/ProgramStatusCard';
import { AssetsOverviewCard } from '../dashboard/AssetsOverviewCard';
import { VulnerabilityTrackCard } from '../dashboard/VulnerabilityTrackCard';
import { FrameworkComplianceGrid } from '../dashboard/FrameworkComplianceGrid';
import { SankeyMappingCard } from '../dashboard/SankeyMappingCard';
import { DataIntegrityCard } from '../dashboard/DataIntegrityCard';
import { ScoringTrendCard } from '../dashboard/ScoringTrendCard';

type DerivedComplianceStatus = 'Compliant' | 'NonCompliant' | 'NotMapped';

const PALETTE = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF4560', '#775DD0', '#3F51B5', '#F44336', '#E91E63', '#9C27B0', '#673AB7'];

const stringToColor = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % PALETTE.length;
    return PALETTE[index];
};

export const DashboardTab: React.FC<{ isActive?: boolean }> = ({ isActive = true }) => {
    const [assetFilter, setAssetFilter] = useState<AssetCriticality | 'All'>('All');

    const fetchData = useCallback(async () => {
        console.log('DashboardTab: Starting data fetch...');
        try {
            const [assets, compliances, controls, controlRegistry, policies, tasks, vulnerabilities, orgData] = await Promise.all([
                SupabaseService.getAssets(),
                SupabaseService.getCompliances(),
                SupabaseService.getInternalControls(),
                SupabaseService.getControlRegistry(),
                SupabaseService.getPolicies(),
                SupabaseService.getTasks(),
                SupabaseService.getVulnerabilities(),
                SupabaseService.getOrgMe(),
            ]);

            const neededFrameworks: string[] = orgData?.neededFramework ?? [];

            console.log('DashboardTab: Data fetch results:', {
                assetsCount: assets?.length || 0,
                compliancesCount: compliances?.length || 0,
                controlsCount: controls?.length || 0,
                controlRegistryCount: controlRegistry?.length || 0,
                policiesCount: policies?.length || 0,
                tasksCount: tasks?.length || 0,
                vulnerabilitiesCount: vulnerabilities?.length || 0,
                neededFrameworks,
            });

            return { assets, compliances, controls, controlRegistry, policies, tasks, vulnerabilities, neededFrameworks };
        } catch (error) {
            console.error('DashboardTab: Data fetch error:', error);
            throw error;
        }
    }, []);

    const { data: stats, loading, error, refresh } = useDataRefresh(fetchData, [], isActive);
    console.log('DashboardTab data state:', { stats, loading, error });
    
    // Default stats object to prevent undefined errors
    const defaultStats = {
        assets: [] as Asset[],
        compliances: [] as Compliance[],
        controls: [] as InternalControl[],
        controlRegistry: [] as ControlRegistry[],
        policies: [] as PolicyDocument[],
        tasks: [] as ProgramTask[],
        vulnerabilities: [] as Vulnerability[],
        neededFrameworks: [] as string[],
    };
    
    const currentStats = stats || defaultStats;
    console.log('DashboardTab currentStats:', currentStats);
    console.log('DashboardTab controls data:', {
        controlsLength: currentStats.controls.length,
        controlsSample: currentStats.controls.slice(0, 2),
        statsObject: stats,
        loadingState: loading
    });

    const securityScore = useMemo(() => {
        const { controlRegistry, tasks, assets, policies, vulnerabilities } = currentStats;

        // (success_count / total_count) * weight — no data = 0
        const score = (successCount: number, total: number, weight: number) =>
            total > 0 ? (successCount / total) * weight : 0;

        const controlsScore = score(controlRegistry.filter(c => c.ctl_status === 'Enforced').length, controlRegistry.length, 30);
        const programScore = score(tasks.filter(t => t.status === 'Completed').length, tasks.length, 25);
        const vulnerabilitiesScore = score(vulnerabilities.filter(v => v.status === 'Remediated').length, vulnerabilities.length, 20);
        const assetsScore = score(assets.filter(a => a.governed_status === 'Governed').length, assets.length, 15);
        const policiesScore = score(policies.filter((p: any) => p.policy_status === 'approved').length, policies.length, 10);

        const totalScore = controlsScore + programScore + vulnerabilitiesScore + assetsScore + policiesScore;
        const hasData = controlRegistry.length > 0 || tasks.length > 0 || assets.length > 0 || policies.length > 0 || vulnerabilities.length > 0;

        return {
            total: Math.round(totalScore),
            controls: Math.round(controlsScore),
            program: Math.round(programScore),
            assets: Math.round(assetsScore),
            policies: Math.round(policiesScore),
            vulnerabilities: Math.round(vulnerabilitiesScore),
            hasData,
        };
    }, [currentStats]);
    
    const programStatusData = useMemo(() => {
        const counts = currentStats.tasks.reduce((acc, task) => {
            acc[task.status] = (acc[task.status] || 0) + 1;
            return acc;
        }, {} as Record<ProgramStatus, number>);
        return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }, [currentStats.tasks]);

    const filteredAssets = useMemo(() => {
        return assetFilter === 'All' ? currentStats.assets : currentStats.assets.filter(a => a.criticality === assetFilter);
    }, [currentStats.assets, assetFilter]);
    
    const assetMetrics = useMemo(() => {
        const totalAssets = filteredAssets.length;
        console.log('Asset Metrics Calculation:', { 
            totalAssets, 
            filteredAssets: filteredAssets.length,
            allAssets: currentStats.assets.length 
        });
        
        if (totalAssets === 0) return { data: [], percent: 100 };
        const governed = filteredAssets.filter(a => a.governed_status === 'Governed').length;
        const nonGoverned = totalAssets - governed;
        const data = [{ name: 'Governed', value: governed }, { name: 'Non-Governed', value: nonGoverned }].filter(d => d.value > 0);
        const percent = (governed / totalAssets) * 100;
        console.log('Asset Metrics Result:', { governed, nonGoverned, data, percent });
        return { data, percent };
    }, [filteredAssets]);

    const vulnerabilityMetrics = useMemo(() => {
        const relevantVulnerabilities = currentStats.vulnerabilities.filter(v => v.status !== 'NA');
        const remediatedCount = relevantVulnerabilities.filter(v => v.status === 'Remediated').length;
        const outstandingCount = relevantVulnerabilities.length - remediatedCount;
        const data = [{ name: 'Remediated', value: remediatedCount }, { name: 'Outstanding', value: outstandingCount }].filter(d => d.value > 0);
        const percent = relevantVulnerabilities.length > 0 ? (remediatedCount / relevantVulnerabilities.length) * 100 : 100;
        
        console.log('Vulnerability Metrics Calculation:', {
            totalVulnerabilities: currentStats.vulnerabilities.length,
            relevantVulnerabilities: relevantVulnerabilities.length,
            remediatedCount,
            outstandingCount,
            data,
            percent
        });
        
        return { data, percent };
    }, [currentStats.vulnerabilities]);

    const frameworkComplianceData = useMemo(() => {
        if (!currentStats.compliances) return {};
        const { neededFrameworks } = currentStats;
        // Build a lookup from ctl_id → enforcement status using both sources
        // control_registry is the source of truth for enforcement status
        const registryStatusMap = new Map<string, string>(currentStats.controlRegistry.map(c => [c.ctl_id, c.ctl_status]));
        const controlsMap = new Map<string, InternalControl>(currentStats.controls.map(c => [c.ctl_id, c]));

        return currentStats.compliances.reduce((acc, compliance) => {
            const frameworkKey = compliance.framework;
            // Skip frameworks not selected in org settings
            if (neededFrameworks.length > 0 && !neededFrameworks.includes(frameworkKey)) return acc;
            if (!acc[frameworkKey]) acc[frameworkKey] = { 'Compliant': 0, 'NonCompliant': 0, 'NotMapped': 0, total: 0 };

            let status: DerivedComplianceStatus;
            const associatedCtls = compliance.associated_int_ctls;

            if (!associatedCtls || associatedCtls.length === 0) {
                status = 'NotMapped';
            } else {
                // Check if any associated control is enforced (via registry or internal catalogue)
                const anyFound = associatedCtls.some(id => registryStatusMap.has(id) || controlsMap.has(id));
                if (!anyFound) {
                    status = 'NonCompliant';
                } else {
                    const allEnforced = associatedCtls.every(id => {
                        const regStatus = registryStatusMap.get(id);
                        if (regStatus) return regStatus === 'Enforced';
                        const ctrl = controlsMap.get(id);
                        if (ctrl) return ctrl.status === 'Enforced';
                        return false;
                    });
                    status = allEnforced ? 'Compliant' : 'NonCompliant';
                }
            }
            acc[frameworkKey][status]++;
            acc[frameworkKey].total++;
            return acc;
        }, {} as Record<string, { 'Compliant': number; 'NonCompliant': number; 'NotMapped': number; total: number }>);
    }, [currentStats.compliances, currentStats.controls, currentStats.controlRegistry]);

    const frameworkNames = useMemo(() => new Set(currentStats.compliances.map(c => c.framework)), [currentStats.compliances]);
    const internalControlNames = useMemo(() => new Set(currentStats.controls.map(c => c.ctl_id)), [currentStats.controls]);

    const sankeyData = useMemo(() => {
        if (!currentStats.compliances || !currentStats.controls) return { nodes: [], links: [] };

        const complianceIdToFrameworkMap = new Map<string, string>();
        currentStats.compliances.forEach(c => { if (c.compliance_id && c.framework) complianceIdToFrameworkMap.set(c.compliance_id, c.framework); });
        
        const nodes: { name: string; color: string }[] = [];
        const nodeMap = new Map<string, number>();
        const addNode = (name: string) => {
            if (!nodeMap.has(name)) {
                nodeMap.set(name, nodes.length);
                nodes.push({ name, color: stringToColor(name) });
            }
            return nodeMap.get(name)!;
        };
        
        const linkValues = new Map<string, number>();
        const separator = ' -> ';
        
        currentStats.controls.forEach(control => {
            if (control.ctl_id && control.compliance_tag3?.length) {
                const controlName = control.ctl_id;
                addNode(controlName);
                const frameworkCounts = new Map<string, number>();

                control.compliance_tag3.forEach(tag => {
                    const framework = complianceIdToFrameworkMap.get(tag);
                    if (framework) {
                        addNode(framework);
                        addNode(tag);
                        const frLinkKey = `${framework}${separator}${tag}`;
                        linkValues.set(frLinkKey, (linkValues.get(frLinkKey) || 0) + 1);
                        frameworkCounts.set(framework, (frameworkCounts.get(framework) || 0) + 1);
                    }
                });
                frameworkCounts.forEach((count, framework) => {
                    const cfLinkKey = `${controlName}${separator}${framework}`;
                    linkValues.set(cfLinkKey, count);
                });
            }
        });

        const links: { source: number; target: number; value: number }[] = [];
        linkValues.forEach((value, key) => {
            const [sourceName, targetName] = key.split(separator);
            if (nodeMap.has(sourceName) && nodeMap.has(targetName)) {
                 links.push({ source: nodeMap.get(sourceName)!, target: nodeMap.get(targetName)!, value });
            }
        });
        return { nodes, links };
    }, [currentStats.controls, currentStats.compliances]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 animate-pulse">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-gray-500 font-medium">Loading Dashboard Data...</p>
            </div>
        );
    }

    return (
        <div className="p-3 sm:p-4 space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Row 1: 4 compact metric cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                <SecurityScoreCard scoreBreakdown={securityScore} />
                <AssetsOverviewCard
                    data={assetMetrics.data}
                    governedPercent={assetMetrics.percent}
                    filter={assetFilter}
                    setFilter={setAssetFilter}
                />
                <VulnerabilityTrackCard data={vulnerabilityMetrics.data} remediatedPercent={vulnerabilityMetrics.percent} />
                <DataIntegrityCard assets={currentStats.assets} />
            </div>
            {/* Row 2: Program + Framework Compliance */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <ProgramStatusCard data={programStatusData} />
                <div className="lg:col-span-2">
                    <FrameworkComplianceGrid data={frameworkComplianceData} />
                </div>
            </div>
            {/* Row 3: Scoring Trend */}
            <div className="col-span-1 md:col-span-1 lg:col-span-1 max-w-lg mx-auto">
                <ScoringTrendCard 
                    assets={currentStats.assets}
                    controls={currentStats.controlRegistry}
                    vulnerabilities={currentStats.vulnerabilities}
                    tasks={currentStats.tasks}
                    policies={currentStats.policies}
                />
            </div>

            {/* Row 4: Sankey */}
            <SankeyMappingCard
                data={sankeyData}
                frameworkNames={frameworkNames}
                internalControlNames={internalControlNames}
            />
        </div>
    );
};
