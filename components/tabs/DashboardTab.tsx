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

export const DashboardTab: React.FC = () => {
    const [assetFilter, setAssetFilter] = useState<AssetCriticality | 'All'>('All');

    const fetchData = useCallback(async () => {
        console.log('DashboardTab: Starting data fetch...');
        try {
            const [assets, compliances, controls, controlRegistry, policies, tasks, vulnerabilities] = await Promise.all([
                SupabaseService.getAssets(),
                SupabaseService.getCompliances(),
                SupabaseService.getInternalControls(),
                SupabaseService.getControlRegistry(),
                SupabaseService.getPolicies(),
                SupabaseService.getTasks(),
                SupabaseService.getVulnerabilities(),
            ]);

            console.log('DashboardTab: Data fetch results:', {
                assetsCount: assets?.length || 0,
                compliancesCount: compliances?.length || 0,
                controlsCount: controls?.length || 0,
                controlRegistryCount: controlRegistry?.length || 0,
                policiesCount: policies?.length || 0,
                tasksCount: tasks?.length || 0,
                vulnerabilitiesCount: vulnerabilities?.length || 0
            });

            return { assets, compliances, controls, controlRegistry, policies, tasks, vulnerabilities };
        } catch (error) {
            console.error('DashboardTab: Data fetch error:', error);
            throw error;
        }
    }, []);

    const { data: stats, loading, error, refresh } = useDataRefresh(fetchData, []);

    // Debug logging for data loading
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
    };
    
    const currentStats = stats || defaultStats;
    console.log('DashboardTab currentStats:', currentStats);

    const securityScore = useMemo(() => {
        const { controlRegistry, tasks, assets, policies, vulnerabilities } = currentStats;

        // Calculate score based on available data (don't require all to be present)
        let totalScore = 0;
        let totalWeight = 0;

        // Controls Score (30%) — uses control_registry (ctl_status) as source of truth
        if (controlRegistry.length > 0) {
            const enforcedControls = controlRegistry.filter(c => c.ctl_status === 'Enforced').length;
            totalScore += (enforcedControls / controlRegistry.length) * 30;
            totalWeight += 30;
        }
        
        // Program Score (25%)
        if (tasks.length > 0) {
            const programTasks = tasks.filter(t => t.status === 'InProgress' || t.status === 'Completed');
            if (programTasks.length > 0) {
                const totalProgress = programTasks.reduce((acc, t) => acc + t.progress_percent, 0);
                totalScore += (totalProgress / (programTasks.length * 100)) * 25;
                totalWeight += 25;
            }
        }
        
        // Assets Score (15%)
        if (assets.length > 0) {
            const governedAssets = assets.filter(a => a.governed_status === 'Governed').length;
            totalScore += (governedAssets / assets.length) * 15;
            totalWeight += 15;
        }
        
        // Policies Score (10%)
        if (policies.length > 0) {
            const activePolicies = policies.filter(p => p.status === 1).length;
            totalScore += (activePolicies / policies.length) * 10;
            totalWeight += 10;
        }
        
        // Vulnerabilities Score (20%)
        if (vulnerabilities.length > 0) {
            const relevantVulnerabilities = vulnerabilities.filter(v => v.status !== 'NA');
            if (relevantVulnerabilities.length > 0) {
                const remediatedCount = relevantVulnerabilities.filter(v => v.status === 'Remediated').length;
                totalScore += (remediatedCount / relevantVulnerabilities.length) * 20;
                totalWeight += 20;
            } else {
                totalScore += 20; // Full score if no relevant vulnerabilities
                totalWeight += 20;
            }
        } else {
            totalScore += 20; // Full score if no vulnerabilities at all
            totalWeight += 20;
        }
        
        // Normalize to 100 if we have partial data
        const finalScore = totalWeight > 0 ? Math.round((totalScore / totalWeight) * 100) : 0;
        
        console.log('Security Score Calculation:', {
            controlRegistry: controlRegistry.length,
            enforcedControls: controlRegistry.filter(c => c.ctl_status === 'Enforced').length,
            tasks: tasks.length,
            assets: assets.length,
            governedAssets: assets.filter(a => a.governed_status === 'Governed').length,
            policies: policies.length,
            vulnerabilities: vulnerabilities.length,
            totalScore,
            totalWeight,
            finalScore
        });
        
        return Math.min(finalScore, 100); // Cap at 100
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
        // Build a lookup from ctl_id → enforcement status using both sources
        // control_registry is the source of truth for enforcement status
        const registryStatusMap = new Map<string, string>(currentStats.controlRegistry.map(c => [c.ctl_id, c.ctl_status]));
        const controlsMap = new Map<string, InternalControl>(currentStats.controls.map(c => [c.ctl_id, c]));

        return currentStats.compliances.reduce((acc, compliance) => {
            const frameworkKey = compliance.framework;
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
        <div className="p-4 sm:p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
                <SecurityScoreCard score={securityScore} />
                <ProgramStatusCard data={programStatusData} />
                
                <DataIntegrityCard assets={currentStats.assets} />
                <AssetsOverviewCard 
                    data={assetMetrics.data} 
                    governedPercent={assetMetrics.percent} 
                    filter={assetFilter} 
                    setFilter={setAssetFilter} 
                />
                <VulnerabilityTrackCard data={vulnerabilityMetrics.data} remediatedPercent={vulnerabilityMetrics.percent} />
                
                <FrameworkComplianceGrid data={frameworkComplianceData} />
                
                <SankeyMappingCard 
                    data={sankeyData} 
                    frameworkNames={frameworkNames} 
                    internalControlNames={internalControlNames} 
                />
            </div>
        </div>
    );
};
