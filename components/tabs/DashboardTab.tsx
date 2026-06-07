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
import { PolicyStatusCard } from '../dashboard/PolicyStatusCard';
import { ControlsCoverageCard } from '../dashboard/ControlsCoverageCard';
import { POLICY_STATUS_COLORS, POLICY_STATUS_LABELS } from '../dashboard/chartTheme';

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

        const totalControlScore = controlRegistry.reduce((acc, c) => {
            const val = c.ctl_status === 'Enforced' ? 1 : (c.maturity_score != null ? c.maturity_score / 100 : 0);
            return acc + val;
        }, 0);
        const controlsScore = controlRegistry.length > 0 ? (totalControlScore / controlRegistry.length) * 30 : 0;
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

    // Policy status breakdown (PolicyV2.policy_status) for the stacked-bar card.
    const policyStatusData = useMemo(() => {
        const order = ['approved', 'reviewed', 'in_approval', 'to_review', 'draft'];
        const counts: Record<string, number> = {};
        for (const p of currentStats.policies as any[]) {
            const s = (p?.policy_status as string) || 'draft';
            counts[s] = (counts[s] || 0) + 1;
        }
        const total = currentStats.policies.length;
        const approved = counts['approved'] || 0;
        const segments = order.map(k => ({
            key: k,
            label: POLICY_STATUS_LABELS[k] || k,
            value: counts[k] || 0,
            color: POLICY_STATUS_COLORS[k] || '#9ca3af',
        }));
        return { segments, total, approvedPct: total > 0 ? (approved / total) * 100 : 0 };
    }, [currentStats.policies]);

    // Controls grouped by category (ctl_type) with enforcement breakdown for the
    // Controls Coverage sunburst. Custom (and anything unexpected) → 'Other'.
    const controlCategories = useMemo(() => {
        const mk = (name: string) => ({ name, total: 0, enforced: 0, inReview: 0, notEnforced: 0 });
        const map: Record<string, ReturnType<typeof mk>> = {
            Standard: mk('Standard'), Regulatory: mk('Regulatory'), NN: mk('NN'), Other: mk('Other'),
        };
        for (const c of currentStats.controlRegistry) {
            const cat = c.ctl_type === 'Standard' ? 'Standard'
                : c.ctl_type === 'Regulatory' ? 'Regulatory'
                : c.ctl_type === 'NN' ? 'NN' : 'Other';
            const b = map[cat];
            b.total++;
            if (c.ctl_status === 'Enforced') b.enforced++;
            else if (c.ctl_status === 'In-Review') b.inReview++;
            else b.notEnforced++;
        }
        return Object.values(map);
    }, [currentStats.controlRegistry]);

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

    // Per-framework control enforcement, driven by control_registry: for each
    // selected framework, how many of its required controls are enforced. NN is
    // always shown (baseline), identified by ctl_type rather than framework name.
    const frameworkComplianceData = useMemo(() => {
        const reg = currentStats.controlRegistry || [];
        const { neededFrameworks } = currentStats;
        const out: Record<string, { enforced: number; inReview: number; notEnforced: number; total: number }> = {};
        const bump = (key: string, status: string) => {
            if (!out[key]) out[key] = { enforced: 0, inReview: 0, notEnforced: 0, total: 0 };
            out[key].total++;
            if (status === 'Enforced') out[key].enforced++;
            else if (status === 'In-Review') out[key].inReview++;
            else out[key].notEnforced++;
        };

        // NN baseline — always present.
        for (const c of reg) {
            if (c.ctl_type === 'NN') bump('Non-Negotiables (NN)', c.ctl_status);
        }
        // Selected frameworks — a control counts if its ctl_ref_fw names the framework.
        for (const fw of neededFrameworks) {
            for (const c of reg) {
                const refs = Array.isArray(c.ctl_ref_fw) ? c.ctl_ref_fw : [];
                if (refs.includes(fw)) bump(fw, c.ctl_status);
            }
        }
        return out;
    }, [currentStats.controlRegistry, currentStats.neededFrameworks]);

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
                <ControlsCoverageCard categories={controlCategories} />
            </div>
            {/* Row 2: Program + Framework Compliance */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <ProgramStatusCard data={programStatusData} />
                <div className="lg:col-span-2">
                    <FrameworkComplianceGrid data={frameworkComplianceData} />
                </div>
            </div>
            {/* Row 2b: Policy Status + Controls Coverage */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <PolicyStatusCard
                    segments={policyStatusData.segments}
                    total={policyStatusData.total}
                    approvedPct={policyStatusData.approvedPct}
                />
                <DataIntegrityCard assets={currentStats.assets} />
            </div>

            {/* Row 3: Scoring Trend + Mapping Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <ScoringTrendCard 
                    assets={currentStats.assets}
                    controls={currentStats.controlRegistry}
                    vulnerabilities={currentStats.vulnerabilities}
                    tasks={currentStats.tasks}
                    policies={currentStats.policies}
                />
                <SankeyMappingCard
                    data={sankeyData}
                    frameworkNames={frameworkNames}
                    internalControlNames={internalControlNames}
                />
            </div>
        </div>
    );
};
