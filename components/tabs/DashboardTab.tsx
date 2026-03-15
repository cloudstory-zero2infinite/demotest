import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Asset, Compliance, InternalControl, PolicyDocument, ProgramTask, Vulnerability, AssetCriticality, InternalControlStatus, ProgramStatus } from '../../types';
import * as SupabaseService from '../../services/supabase';

// Sub-components
import { SecurityScoreCard } from '../dashboard/SecurityScoreCard';
import { ProgramStatusCard } from '../dashboard/ProgramStatusCard';
import { CapabilityMappingCard } from '../dashboard/CapabilityMappingCard';
import { AssetsOverviewCard } from '../dashboard/AssetsOverviewCard';
import { VulnerabilityTrackCard } from '../dashboard/VulnerabilityTrackCard';
import { FrameworkComplianceGrid } from '../dashboard/FrameworkComplianceGrid';
import { SankeyMappingCard } from '../dashboard/SankeyMappingCard';

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
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        assets: [] as Asset[],
        compliances: [] as Compliance[],
        controls: [] as InternalControl[],
        policies: [] as PolicyDocument[],
        tasks: [] as ProgramTask[],
        vulnerabilities: [] as Vulnerability[],
    });
    const [assetFilter, setAssetFilter] = useState<AssetCriticality | 'All'>('All');

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [assets, compliances, controls, policies, tasks, vulnerabilities] = await Promise.all([
                SupabaseService.getAssets(),
                SupabaseService.getCompliances(),
                SupabaseService.getInternalControls(),
                SupabaseService.getPolicies(),
                SupabaseService.getTasks(),
                SupabaseService.getVulnerabilities(),
            ]);
            setStats({ assets, compliances, controls, policies, tasks, vulnerabilities });
        } catch (error) {
            console.error("Failed to load dashboard data", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const securityScore = useMemo(() => {
        const { controls, tasks, assets, policies, vulnerabilities } = stats;
        if (!controls.length || !tasks.length || !assets.length || !policies.length || !vulnerabilities) return 0;
        
        const controlScore = (controls.filter(c => c.status === 'Enforced').length / controls.length) * 30;
        const programTasks = tasks.filter(t => t.status === 'InProgress' || t.status === 'Completed');
        const programScore = programTasks.length > 0 ? (programTasks.reduce((acc, t) => acc + t.progress_percent, 0) / (programTasks.length * 100)) * 25 : 0;
        const assetScore = (assets.filter(a => a.governed_status === 'Governed').length / assets.length) * 15;
        const policyScore = (policies.filter(p => p.status === 1).length / policies.length) * 10;
        
        const relevantVulnerabilities = vulnerabilities.filter(v => v.status !== 'NA');
        const remediatedCount = relevantVulnerabilities.filter(v => v.status === 'Remediated').length;
        const vulnerabilityScore = relevantVulnerabilities.length > 0 ? (remediatedCount / relevantVulnerabilities.length) * 20 : 20;

        return Math.round(controlScore + programScore + vulnerabilityScore + assetScore + policyScore);
    }, [stats]);
    
    const programStatusData = useMemo(() => {
        const counts = stats.tasks.reduce((acc, task) => {
            acc[task.status] = (acc[task.status] || 0) + 1;
            return acc;
        }, {} as Record<ProgramStatus, number>);
        return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }, [stats.tasks]);

    const controlMetrics = useMemo(() => {
        const totalControls = stats.controls.length;
        if (totalControls === 0) return { data: [], percent: 100 };

        const counts = stats.controls.reduce((acc, control) => {
            const status = control.status || 'Not-Enforced';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {} as Record<InternalControlStatus, number>);

        const data = [
            { name: 'Enforced', value: counts.Enforced || 0 },
            { name: 'InProgress', value: counts.InProgress || 0 },
            { name: 'Not-Enforced', value: counts['Not-Enforced'] || 0 },
        ].filter(d => d.value > 0);

        return { data, percent: ((counts.Enforced || 0) / totalControls) * 100 };
    }, [stats.controls]);

    const filteredAssets = useMemo(() => {
        return assetFilter === 'All' ? stats.assets : stats.assets.filter(a => a.criticality === assetFilter);
    }, [stats.assets, assetFilter]);
    
    const assetMetrics = useMemo(() => {
        const totalAssets = filteredAssets.length;
        if (totalAssets === 0) return { data: [], percent: 100 };
        const governed = filteredAssets.filter(a => a.governed_status === 'Governed').length;
        const nonGoverned = totalAssets - governed;
        const data = [{ name: 'Governed', value: governed }, { name: 'Non-Governed', value: nonGoverned }].filter(d => d.value > 0);
        return { data, percent: (governed / totalAssets) * 100 };
    }, [filteredAssets]);

    const vulnerabilityMetrics = useMemo(() => {
        const relevantVulnerabilities = stats.vulnerabilities.filter(v => v.status !== 'NA');
        const remediatedCount = relevantVulnerabilities.filter(v => v.status === 'Remediated').length;
        const outstandingCount = relevantVulnerabilities.length - remediatedCount;
        const data = [{ name: 'Remediated', value: remediatedCount }, { name: 'Outstanding', value: outstandingCount }].filter(d => d.value > 0);
        const percent = relevantVulnerabilities.length > 0 ? (remediatedCount / relevantVulnerabilities.length) * 100 : 100;
        return { data, percent };
    }, [stats.vulnerabilities]);

    const frameworkComplianceData = useMemo(() => {
        if (!stats.compliances || !stats.controls) return {};
        const controlsMap = new Map<string, InternalControl>(stats.controls.map(c => [c.ctl_id, c]));

        return stats.compliances.reduce((acc, compliance) => {
            const frameworkKey = compliance.framework;
            if (!acc[frameworkKey]) acc[frameworkKey] = { 'Compliant': 0, 'NonCompliant': 0, 'NotMapped': 0, total: 0 };

            let status: DerivedComplianceStatus;
            const associatedCtls = compliance.associated_int_ctls;

            if (!associatedCtls || associatedCtls.length === 0) {
                status = 'NotMapped';
            } else {
                const relatedControls = associatedCtls.map(id => controlsMap.get(id)).filter((c): c is InternalControl => c !== undefined);
                if (relatedControls.length === 0) {
                    status = 'NonCompliant';
                } else {
                    status = relatedControls.every(c => c.status === 'Enforced') ? 'Compliant' : 'NonCompliant';
                }
            }
            acc[frameworkKey][status]++;
            acc[frameworkKey].total++;
            return acc;
        }, {} as Record<string, { 'Compliant': number; 'NonCompliant': number; 'NotMapped': number; total: number }>);
    }, [stats.compliances, stats.controls]);

    const frameworkNames = useMemo(() => new Set(stats.compliances.map(c => c.framework)), [stats.compliances]);
    const internalControlNames = useMemo(() => new Set(stats.controls.map(c => c.ctl_id)), [stats.controls]);

    const sankeyData = useMemo(() => {
        if (!stats.compliances || !stats.controls) return { nodes: [], links: [] };

        const complianceIdToFrameworkMap = new Map<string, string>();
        stats.compliances.forEach(c => { if (c.compliance_id && c.framework) complianceIdToFrameworkMap.set(c.compliance_id, c.framework); });
        
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
        
        stats.controls.forEach(control => {
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
    }, [stats.controls, stats.compliances]);

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
                
                <CapabilityMappingCard data={controlMetrics.data} enforcedPercent={controlMetrics.percent} />
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
