
import React, { useState, useEffect, useCallback, useRef, ChangeEvent, useMemo, FormEvent } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, Sankey, RadialBarChart, RadialBar } from 'recharts';
import { ProgramTask, ProgramStatus, ActivityLog, ProgramTaskCreate, ProgramTaskUpdate, InternalControl, Asset, PolicyDocument, AssetCriticality, AssetGovernedStatus, AssetExposure, AssetCategory, InternalControlCreate, InternalControlUpdate, AssetCreate, AssetUpdate, PolicyDocumentCreate, PolicyDocumentUpdate, DocumentContentType, PolicyPermissions, PolicyStatus, InternalControlStatus, Compliance, ComplianceStatus, ComplianceCreate, ComplianceUpdate, Contact, ContactCreate, ContactUpdate, AllActivityLog, Vulnerability, VulnerabilityStatus, VulnerabilitySource, VulnerabilityCreate, VulnerabilityUpdate, PolicyNode, PolicyLink, WorkflowTemplate, WorkflowStep, UserRole } from './types';
import * as SupabaseService from './services/supabase';
import Header from './components/Header';
import { EyeIcon, PencilIcon, TrashIcon, HistoryIcon, PlusIcon, UploadIcon, XIcon, DownloadIcon, ChartPieIcon, UsersIcon, ExclamationTriangleIcon, ArrowPathIcon, MoonIcon, SunIcon, SortUpDownIcon, SortUpIcon, SortDownIcon } from './components/Icons';

// UI Components defined within App.tsx to keep file count low, but outside the main App component.

// Modal Wrapper
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
}
const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children, title }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[300] flex justify-center items-center p-4" onClick={onClose} aria-modal="true" role="dialog">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b dark:border-gray-700">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg p-1.5" aria-label="Close modal">
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

// Status Badge
interface StatusBadgeProps {
  status: string | number;
  colorMap: Record<string | number, string>;
}
const StatusBadge: React.FC<StatusBadgeProps> = ({ status, colorMap }) => {
  const color = colorMap[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
  const statusText = typeof status === 'number' 
    ? (status === 0 ? 'Draft' : 'Published')
    : status;

  return (
    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${color}`}>
      {statusText}
    </span>
  );
};

// ProgressBar
interface ProgressBarProps {
  progress: number;
}
const ProgressBar: React.FC<ProgressBarProps> = ({ progress }) => (
  <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
    <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
  </div>
);


// Delete Confirmation Modal (Generic)
interface DeleteConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    itemName: string;
}
const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({ isOpen, onClose, onConfirm, itemName }) => (
    <Modal isOpen={isOpen} onClose={onClose} title={`Confirm Deletion`}>
        <p className="dark:text-gray-300">Are you sure you want to delete this {itemName}? This action cannot be undone.</p>
        <div className="mt-6 flex justify-end space-x-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>
            <button onClick={onConfirm} className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">Delete</button>
        </div>
    </Modal>
);

// --- FEEDBACK MODAL ---
interface FeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose }) => {
    const [rating, setRating] = useState(0);
    const [hoveredRating, setHoveredRating] = useState(0);
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        if (rating === 0) {
            setError('Please select a rating');
            return;
        }

        setError('');
        setIsSubmitting(true);
        try {
            console.log('Submitting feedback:', { rating, description });

            // Send feedback via Formspree
            const response = await fetch('https://formspree.io/f/mpqyzqzy', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    rating,
                    description,
                    _subject: 'New feedback from Rapid Dev app',
                }),
            });

            if (!response.ok) {
                let message = 'Failed to submit feedback. Please try again.';
                try {
                    const data = await response.json();
                    if (data?.errors && data.errors.length > 0 && data.errors[0]?.message) {
                        message = data.errors[0].message;
                    }
                } catch {
                    // ignore JSON parse errors and use default message
                }
                throw new Error(message);
            }

            await SupabaseService.logAllActivity({
                action: 'Submitted Feedback',
                module: 'Feedback',
                event_data: { rating, description }
            });

            alert('Thank you for your feedback!');
            setRating(0);
            setDescription('');
            setError('');
            onClose();
        } catch (err: any) {
            console.error('Failed to submit feedback', err);
            const errorMsg = err?.message || 'Failed to submit feedback. Please try again.';
            setError(errorMsg);
            alert(errorMsg);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[300] flex justify-center items-center p-4" onClick={onClose} aria-modal="true" role="dialog">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="p-6">
                    <button onClick={onClose} className="float-right text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" aria-label="Close">
                        <XIcon className="w-5 h-5" />
                    </button>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">How would you rate us?</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Pick a rate *</p>

                    <div className="flex justify-center gap-2 mb-6">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button
                                key={star}
                                onClick={() => setRating(star)}
                                onMouseEnter={() => setHoveredRating(star)}
                                onMouseLeave={() => setHoveredRating(0)}
                                className="focus:outline-none transition-transform hover:scale-110"
                            >
                                <svg
                                    className={`w-10 h-10 ${
                                        star <= (hoveredRating || rating)
                                            ? 'fill-green-500 text-green-500'
                                            : 'fill-gray-300 text-gray-300 dark:fill-gray-600 dark:text-gray-600'
                                    }`}
                                    viewBox="0 0 24 24"
                                >
                                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                </svg>
                            </button>
                        ))}
                    </div>

                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Tell us more about your experience
                    </label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Share your thoughts, suggestions, or issues..."
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white dark:bg-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />

                    {error && (
                        <div className="mt-3 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-600 text-red-700 dark:text-red-200 text-sm rounded-lg">
                            {error}
                        </div>
                    )}

                    <div className="mt-6 flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                        >
                            {isSubmitting ? 'Submitting...' : 'Submit'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// error boundary to catch unexpected runtime errors in child components
class ErrorBoundary extends React.Component<{children:React.ReactNode}, {hasError:boolean}> {
  constructor(props:any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any, info: any) {
    console.error('ErrorBoundary caught', error, info);
  }
  render() {
    if (this.state.hasError) {
      return <div className="p-4 text-red-600">Something went wrong. Please refresh or contact support.</div>;
    }
    return this.props.children;
  }
}

// --- DASHBOARD: New Framework Compliance Chart ---
type DerivedComplianceStatus = 'Compliant' | 'NonCompliant' | 'NotMapped';

interface FrameworkComplianceChartProps {
    frameworkName: string;
    data: {
        'Compliant': number;
        'NonCompliant': number;
        'NotMapped': number;
        total: number;
    };
}
const FrameworkComplianceChart: React.FC<FrameworkComplianceChartProps> = ({ frameworkName, data }) => {
    const { 'Compliant': compliant, 'NonCompliant': nonCompliant, 'NotMapped': notMapped, total } = data;
    if (total === 0) return null;

    const compliantPercent = (compliant / total) * 100;
    const nonCompliantPercent = (nonCompliant / total) * 100;
    const notMappedPercent = (notMapped / total) * 100;

    const statusColors: Record<DerivedComplianceStatus, string> = {
        'Compliant': 'bg-green-500',
        'NonCompliant': 'bg-red-500',
        'NotMapped': 'bg-gray-500',
    };
    const statusTextColors: Record<DerivedComplianceStatus, string> = {
        'Compliant': 'text-green-800 dark:text-green-300',
        'NonCompliant': 'text-red-800 dark:text-red-300',
        'NotMapped': 'text-gray-800 dark:text-gray-300',
    };

    return (
        <div className="w-full">
            <div className="flex justify-between items-baseline mb-1">
                <h4 className="font-semibold text-gray-700 dark:text-gray-300">{frameworkName}</h4>
                <span className="text-lg font-bold text-gray-900 dark:text-white">{compliantPercent.toFixed(0)}%</span>
            </div>
            <div className="w-full flex h-4 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                <div className={`${statusColors['Compliant']} transition-all duration-500`} style={{ width: `${compliantPercent}%` }} title={`Compliant: ${compliant}`}></div>
                <div className={`${statusColors['NonCompliant']} transition-all duration-500`} style={{ width: `${nonCompliantPercent}%` }} title={`Non-Compliant: ${nonCompliant}`}></div>
                <div className={`${statusColors['NotMapped']} transition-all duration-500`} style={{ width: `${notMappedPercent}%` }} title={`Not Mapped: ${notMapped}`}></div>
            </div>
            <div className="flex justify-between text-xs mt-1.5 text-gray-600 dark:text-gray-400">
                <div className="flex items-center">
                    <span className={`h-2 w-2 rounded-full ${statusColors['Compliant']} mr-1.5`}></span>
                    <span className={statusTextColors['Compliant']}>{compliant} Compliant</span>
                </div>
                <div className="flex items-center">
                    <span className={`h-2 w-2 rounded-full ${statusColors['NonCompliant']} mr-1.5`}></span>
                    <span className={statusTextColors['NonCompliant']}>{nonCompliant} Non-Compliant</span>
                </div>
                <div className="flex items-center">
                    <span className={`h-2 w-2 rounded-full ${statusColors['NotMapped']} mr-1.5`}></span>
                    <span className={statusTextColors['NotMapped']}>{notMapped} Not Mapped</span>
                </div>
            </div>
        </div>
    );
};


// --- DASHBOARD TAB ---
const DashboardTab: React.FC = () => {
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

    useEffect(() => {
        const fetchData = async () => {
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
        };
        fetchData();
    }, []);

    const securityScore = useMemo(() => {
        const { controls, tasks, assets, policies, vulnerabilities } = stats;
        if (!controls.length || !tasks.length || !assets.length || !policies.length || !vulnerabilities) return 0;
        
        // Weights: Controls 30%, Program 25%, Vulns 20%, Assets 15%, Policies 10%
        const controlScore = (controls.filter(c => c.status === 'Enforced').length / controls.length) * 30;
        
        const programTasks = tasks.filter(t => t.status === 'InProgress' || t.status === 'Completed');
        const programScore = programTasks.length > 0 ? (programTasks.reduce((acc, t) => acc + t.progress_percent, 0) / (programTasks.length * 100)) * 25 : 0;
        
        const assetScore = (assets.filter(a => a.governed_status === 'Governed').length / assets.length) * 15;
        
        const policyScore = (policies.filter(p => p.status === 1).length / policies.length) * 10;
        
        const relevantVulnerabilities = vulnerabilities.filter(v => v.status !== 'NA');
        const remediatedCount = relevantVulnerabilities.filter(v => v.status === 'Remediated').length;
        const vulnerabilityScore = relevantVulnerabilities.length > 0
            ? (remediatedCount / relevantVulnerabilities.length) * 20
            : 20; // Perfect score if no relevant vulnerabilities

        return Math.round(controlScore + programScore + vulnerabilityScore + assetScore + policyScore);
    }, [stats]);
    
    const programStatusData = useMemo(() => {
        const counts = stats.tasks.reduce((acc, task) => {
            acc[task.status] = (acc[task.status] || 0) + 1;
            return acc;
        }, {} as Record<ProgramStatus, number>);
        return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }, [stats.tasks]);

    const { controlStatusData, enforcedPercent } = useMemo(() => {
        const totalControls = stats.controls.length;
        if (totalControls === 0) {
            return { controlStatusData: [], enforcedPercent: 100 };
        }

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

        const percent = ((counts.Enforced || 0) / totalControls) * 100;

        return { controlStatusData: data, enforcedPercent: percent };
    }, [stats.controls]);

    const filteredAssets = useMemo(() => {
        return assetFilter === 'All' ? stats.assets : stats.assets.filter(a => a.criticality === assetFilter);
    }, [stats.assets, assetFilter]);
    
    const { assetGovernedData, governedPercent } = useMemo(() => {
        const totalAssets = filteredAssets.length;
        if (totalAssets === 0) {
            return { assetGovernedData: [], governedPercent: 100 };
        }
        const governed = filteredAssets.filter(a => a.governed_status === 'Governed').length;
        const nonGoverned = totalAssets - governed;
        const data = [{ name: 'Governed', value: governed }, { name: 'Non-Governed', value: nonGoverned }].filter(d => d.value > 0);
        const percent = (governed / totalAssets) * 100;
        return { assetGovernedData: data, governedPercent: percent };
    }, [filteredAssets]);

    const { vulnerabilityStatusData, remediatedPercent } = useMemo(() => {
        const relevantVulnerabilities = stats.vulnerabilities.filter(v => v.status !== 'NA');
        
        const remediatedCount = relevantVulnerabilities.filter(v => v.status === 'Remediated').length;
        const outstandingCount = relevantVulnerabilities.length - remediatedCount;
        
        const data = [
            { name: 'Remediated', value: remediatedCount },
            { name: 'Outstanding', value: outstandingCount },
        ].filter(d => d.value > 0);

        const percent = relevantVulnerabilities.length > 0
            ? (remediatedCount / relevantVulnerabilities.length) * 100
            : 100;

        return { vulnerabilityStatusData: data, remediatedPercent: percent };
    }, [stats.vulnerabilities]);

    const frameworkComplianceData = useMemo(() => {
        if (!stats.compliances || !stats.controls) return {};

        const controlsMap = new Map<string, InternalControl>(stats.controls.map(c => [c.ctl_id, c]));

        return stats.compliances.reduce((acc, compliance) => {
            const frameworkKey = compliance.framework;

            if (!acc[frameworkKey]) {
                acc[frameworkKey] = {
                    'Compliant': 0,
                    'NonCompliant': 0,
                    'NotMapped': 0,
                    total: 0
                };
            }

            let status: DerivedComplianceStatus;
            const associatedCtls = compliance.associated_int_ctls;

            if (!associatedCtls || associatedCtls.length === 0) {
                status = 'NotMapped';
            } else {
                const relatedControls = associatedCtls
                    .map(id => controlsMap.get(id))
                    .filter((c): c is InternalControl => c !== undefined);

                if (relatedControls.length === 0) {
                    // If there are associated_int_ctls but none are found in the catalogue, it's a broken mapping, thus non-compliant.
                    status = 'NonCompliant';
                } else {
                    const areAllEnforced = relatedControls.every(c => c.status === 'Enforced');
                    if (areAllEnforced) {
                        status = 'Compliant';
                    } else {
                        status = 'NonCompliant';
                    }
                }
            }
            
            acc[frameworkKey][status]++;
            acc[frameworkKey].total++;

            return acc;
        }, {} as Record<string, { 'Compliant': number; 'NonCompliant': number; 'NotMapped': number; total: number }>);
    }, [stats.compliances, stats.controls]);
    
    const PALETTE = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF4560', '#775DD0', '#3F51B5', '#F44336', '#E91E63', '#9C27B0', '#673AB7'];
    const stringToColor = (str: string) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % PALETTE.length;
        return PALETTE[index];
    };

    const frameworkNames = useMemo(() => new Set(stats.compliances.map(c => c.framework)), [stats.compliances]);
    const internalControlNames = useMemo(() => new Set(stats.controls.map(c => c.ctl_id)), [stats.controls]);

    const CustomSankeyTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const linkPayload = payload[0].payload;
            const sourceName = linkPayload.source.name;
            const targetName = linkPayload.target.name;

            const isFrameworkToRequirement = frameworkNames.has(sourceName);

            return (
                <div className="p-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg text-sm">
                    {isFrameworkToRequirement ? (
                        <>
                            <p className="font-bold text-gray-900 dark:text-white">
                                Framework: <span className="font-normal">{sourceName}</span>
                            </p>
                            <p className="font-bold text-gray-900 dark:text-white">
                                Requirement: <span className="font-normal">{targetName}</span>
                            </p>
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                This requirement is mapped by {payload[0].value} control(s).
                            </p>
                        </>
                    ) : (
                         <p className="text-gray-900 dark:text-white">
                            <span className="font-semibold">{sourceName}</span> supports{' '}
                            <span className="font-semibold">{payload[0].value}</span>{' '}
                            requirement(s) in{' '}
                            <span className="font-semibold">{targetName}</span>.
                        </p>
                    )}
                </div>
            );
        }
        return null;
    };

    const sankeyData = useMemo(() => {
        if (!stats.compliances || !stats.controls) {
            return { nodes: [], links: [] };
        }

        const complianceIdToFrameworkMap = new Map<string, string>();
        stats.compliances.forEach(c => {
            if (c.compliance_id && c.framework) {
                complianceIdToFrameworkMap.set(c.compliance_id, c.framework);
            }
        });
        
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
            if (control.ctl_id && control.compliance_tag3 && control.compliance_tag3.length > 0) {
                const controlName = control.ctl_id;
                addNode(controlName);
                
                const frameworkCountsForThisControl = new Map<string, number>();

                control.compliance_tag3.forEach(tag => {
                    const framework = complianceIdToFrameworkMap.get(tag);
                    if (framework) {
                        addNode(framework);
                        addNode(tag);
                        
                        // Framework -> Requirement link: value is total # of controls mapping to this requirement
                        const frLinkKey = `${framework}${separator}${tag}`;
                        linkValues.set(frLinkKey, (linkValues.get(frLinkKey) || 0) + 1);
                        
                        // Count requirements per framework for this specific control
                        frameworkCountsForThisControl.set(framework, (frameworkCountsForThisControl.get(framework) || 0) + 1);
                    }
                });
                
                // Control -> Framework links: value is # of requirements in this framework supported by this control
                frameworkCountsForThisControl.forEach((count, framework) => {
                    const cfLinkKey = `${controlName}${separator}${framework}`;
                    linkValues.set(cfLinkKey, count);
                });
            }
        });

        const links: { source: number; target: number; value: number }[] = [];
        linkValues.forEach((value, key) => {
            const [sourceName, targetName] = key.split(separator);
            if (nodeMap.has(sourceName) && nodeMap.has(targetName)) {
                 links.push({
                    source: nodeMap.get(sourceName)!,
                    target: nodeMap.get(targetName)!,
                    value
                });
            }
        });

        return { nodes, links };
    }, [stats.controls, stats.compliances]);
    
    const SankeyNode = ({ x, y, width, height, payload, containerWidth }: any) => {
        const isFramework = frameworkNames.has(payload.name);
        const isControl = internalControlNames.has(payload.name);
        const isRequirement = !isFramework && !isControl;

        let scaleFactor = 1.0;
        if(isFramework) scaleFactor = 1.0; // 3 -> 1.0
        else if (isControl) scaleFactor = 0.66; // 2 -> 0.66
        else if (isRequirement) scaleFactor = 0.33; // 1 -> 0.33
        
        const scaledHeight = height * scaleFactor;
        const yOffset = (height - scaledHeight) / 2;

        // A node is considered a "source" node if it's in the first column.
        const isSourceNode = x < containerWidth / 3;
        
        return (
            <g>
                <rect x={x} y={y + yOffset} width={width} height={scaledHeight} fill={payload.color} stroke="#fff" strokeWidth="1" />
                <text 
                    x={isSourceNode ? x - 6 : x + width + 6} 
                    y={y + height / 2}
                    textAnchor={isSourceNode ? "end" : "start"}
                    dominantBaseline="middle"
                    className="fill-current text-gray-700 dark:text-gray-300 text-xs font-sans"
                >
                    {payload.name}
                </text>
            </g>
        );
    };

    const COLORS = ['#0088FE', '#FF8042', '#00C49F', '#FFBB28'];
    
    if (loading) return <div className="text-center py-10">Loading Dashboard...</div>;

    return (
        <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
            <div className="md:col-span-2 lg:col-span-3 p-4 bg-white dark:bg-gray-800 rounded-lg shadow flex flex-col items-center justify-center">
                 <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">Organisation Security Score</h3>
                 <ResponsiveContainer width="100%" height={200}>
                    <RadialBarChart innerRadius="70%" outerRadius="100%" data={[{ value: securityScore }]} startAngle={180} endAngle={-180}>
                        <RadialBar dataKey='value' cornerRadius={10} background fill="#3b82f6" />
                        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-4xl font-bold fill-current text-gray-800 dark:text-gray-200">
                            {securityScore}
                        </text>
                        <text x="50%" y="65%" textAnchor="middle" dominantBaseline="middle" className="text-sm fill-current text-gray-500 dark:text-gray-400">
                            / 100
                        </text>
                    </RadialBarChart>
                </ResponsiveContainer>
                 <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-2">
                    Logic: 30% Controls + 25% Program + 20% Vulns + 15% Assets + 10% Policies
                </p>
            </div>
            
            <div className="md:col-span-2 lg:col-span-3 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
                 <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">Program Status</h3>
                <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={programStatusData} layout="vertical">
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={80} stroke="#6b7280" fontSize={12}/>
                        <Tooltip />
                        <Bar dataKey="value" fill="#3b82f6" barSize={20} />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className="md:col-span-2 lg:col-span-2 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">Capability Mapping</h3>
                <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                        <Pie data={controlStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} fill="#8884d8" paddingAngle={5}>
                            {controlStatusData.map((entry) => {
                                let color = '#6b7280'; // default gray
                                if (entry.name === 'Enforced') color = '#10b981';
                                if (entry.name === 'InProgress') color = '#f59e0b';
                                if (entry.name === 'Not-Enforced') color = '#ef4444';
                                return <Cell key={`cell-${entry.name}`} fill={color} />;
                            })}
                        </Pie>
                         <Tooltip />
                        <Legend />
                        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-3xl font-bold fill-current text-gray-800 dark:text-gray-200">{`${enforcedPercent.toFixed(0)}%`}</text>
                        <text x="50%" y="62%" textAnchor="middle" dominantBaseline="middle" className="text-sm fill-current text-gray-500 dark:text-gray-400">Enforced</text>
                    </PieChart>
                </ResponsiveContainer>
            </div>
            
            <div className="md:col-span-2 lg:col-span-2 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Assets Overview</h3>
                    <select value={assetFilter} onChange={e => setAssetFilter(e.target.value as any)} className="text-xs rounded border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                        <option>All</option><option>High</option><option>Medium</option><option>Low</option>
                    </select>
                </div>
                <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                        <Pie data={assetGovernedData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} fill="#8884d8" paddingAngle={5}>
                            {assetGovernedData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                        </Pie>
                         <Tooltip />
                        <Legend />
                        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-3xl font-bold fill-current text-gray-800 dark:text-gray-200">{`${governedPercent.toFixed(0)}%`}</text>
                        <text x="50%" y="62%" textAnchor="middle" dominantBaseline="middle" className="text-sm fill-current text-gray-500 dark:text-gray-400">Governed</text>
                    </PieChart>
                </ResponsiveContainer>
            </div>

            <div className="md:col-span-2 lg:col-span-2 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">Vulnerability Track</h3>
                <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                        <Pie 
                            data={vulnerabilityStatusData} 
                            dataKey="value" 
                            nameKey="name" 
                            cx="50%" 
                            cy="50%" 
                            innerRadius={60} 
                            outerRadius={80} 
                            fill="#8884d8" 
                            paddingAngle={5}
                        >
                            {vulnerabilityStatusData.map((entry) => {
                                const color = entry.name === 'Remediated' ? '#10b981' : '#f59e0b'; // Green for remediated, Orange for outstanding
                                return <Cell key={`cell-${entry.name}`} fill={color} />;
                            })}
                        </Pie>
                        <Tooltip />
                        <Legend />
                        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-3xl font-bold fill-current text-gray-800 dark:text-gray-200">{`${remediatedPercent.toFixed(0)}%`}</text>
                        <text x="50%" y="62%" textAnchor="middle" dominantBaseline="middle" className="text-sm fill-current text-gray-500 dark:text-gray-400">Remediated</text>
                    </PieChart>
                </ResponsiveContainer>
            </div>
            
            <div className="md:col-span-2 lg:col-span-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Framework Compliance Status</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    {Object.keys(frameworkComplianceData).length > 0 ? (
                        Object.entries(frameworkComplianceData)
                         .sort(([nameA], [nameB]) => nameA.localeCompare(nameB))
                         .map(([framework, data]) => (
                            <FrameworkComplianceChart key={framework} frameworkName={framework} data={data} />
                        ))
                    ) : (
                        <p className="text-gray-500 dark:text-gray-400 col-span-full text-center">No compliance framework data available.</p>
                    )}
                </div>
            </div>

            <div className="md:col-span-2 lg:col-span-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
                 <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">Internal Controls to Frameworks Mapping</h3>
                {sankeyData.nodes.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                    <Sankey
                        data={sankeyData}
                        node={<SankeyNode />}
                        link={{ stroke: 'rgba(156, 163, 175, 0.4)' }}
                        nodePadding={25}
                        margin={{
                            left: 150,
                            right: 150,
                            top: 20,
                            bottom: 20,
                        }}
                    >
                        <Tooltip content={<CustomSankeyTooltip />} />
                    </Sankey>
                </ResponsiveContainer>
                ) : <p className="text-gray-500 dark:text-gray-400">No control mapping data available.</p>}
            </div>
        </div>
    );
};

// --- PROGRAM: GRC PROGRAM TRACKER VIEW ---
const ProgramTrackerView: React.FC = () => {
    const [tasks, setTasks] = useState<ProgramTask[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [modalState, setModalState] = useState<{ type: 'add' | 'edit' | 'view' | 'delete' | 'log' | null; task?: ProgramTask | null }>({ type: null });
    const [filter, setFilter] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof ProgramTask; direction: 'ascending' | 'descending' } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchTasks = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await SupabaseService.getTasks();
            setTasks(data);
        } catch (err) {
            setError('Failed to fetch milestones.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);
    
    const closeModal = () => setModalState({ type: null });

    const handleSaveTask = async (formData: ProgramTaskCreate | ProgramTaskUpdate) => {
        try {
            if (modalState.type === 'edit' && modalState.task) {
                const oldTask = modalState.task;
                const updatedTask = await SupabaseService.updateTask(modalState.task.id, formData);
                
                await SupabaseService.logAllActivity({
                    action: 'Updated Milestone',
                    module: 'Program',
                    entity_id: updatedTask.id,
                    entity_name: updatedTask.program_name,
                    event_data: { changes: formData }
                });
                
                // Detailed logging for program-specific log
                const changes: string[] = [];
                if (oldTask.program_name !== updatedTask.program_name) {
                    changes.push(`name changed from "${oldTask.program_name}" to "${updatedTask.program_name}"`);
                }
                if (oldTask.description !== updatedTask.description) {
                    changes.push('description was updated');
                }
                if (oldTask.month !== updatedTask.month) {
                    changes.push(`month changed from "${oldTask.month}" to "${updatedTask.month}"`);
                }
                if (oldTask.status !== updatedTask.status) {
                    changes.push(`status changed from "${oldTask.status}" to "${updatedTask.status}"`);
                }
                if (oldTask.progress_percent !== updatedTask.progress_percent) {
                    changes.push(`progress changed from ${oldTask.progress_percent}% to ${updatedTask.progress_percent}%`);
                }

                if (changes.length > 0) {
                    await SupabaseService.addActivityLog(updatedTask.id, `Milestone updated: ${changes.join(', ')}.`);
                }
                
            } else if (modalState.type === 'add') {
                const addedTask = await SupabaseService.addTask(formData as ProgramTaskCreate);
                
                await SupabaseService.logAllActivity({
                    action: 'Created Milestone',
                    module: 'Program',
                    entity_id: addedTask.id,
                    entity_name: addedTask.program_name,
                    event_data: { details: formData }
                });
                
                await SupabaseService.addActivityLog(addedTask.id, `Milestone "${addedTask.program_name}" was created.`);
            }
            fetchTasks();
            closeModal();
        } catch (err) {
            setError('Failed to save milestone.');
        }
    };

    const handleDeleteTask = async () => {
        if (modalState.type === 'delete' && modalState.task) {
            try {
                await SupabaseService.deleteTask(modalState.task.id);
                await SupabaseService.logAllActivity({
                    action: 'Deleted Milestone',
                    module: 'Program',
                    entity_id: modalState.task.id,
                    entity_name: modalState.task.program_name
                });
                fetchTasks();
                closeModal();
            } catch (err) {
                const message = err instanceof Error
                    ? err.message
                    : ((err as any)?.message || JSON.stringify(err) || 'Failed to delete milestone.');
                setError(`Failed to delete milestone. ${message}`);
            }
        }
    };
    
    const handleImportCSV = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            if(!text) return;

            const lines = text.split('\n').slice(1); // Skip header row
            const newTasks: ProgramTaskCreate[] = lines
                .map(line => {
                    const [program_name, description, month, status, progress_percent] = line.split(',').map(s => s.trim());
                    if (!program_name || !month || !status) return null;
                    return {
                        program_name,
                        description: description || '',
                        month,
                        status: status as ProgramStatus,
                        progress_percent: Number(progress_percent) || 0,
                    };
                })
                .filter((task): task is ProgramTaskCreate => task !== null);
            
            if (newTasks.length > 0) {
                try {
                    await SupabaseService.bulkAddTasks(newTasks);
                     await SupabaseService.logAllActivity({
                        action: 'Bulk Imported Milestones',
                        module: 'Program',
                        event_data: { count: newTasks.length }
                    });
                    alert(`${newTasks.length} milestones imported successfully!`);
                    fetchTasks();
                } catch (err) {
                    alert('Failed to import milestones.');
                }
            }
        };
        reader.readAsText(file);
        if(fileInputRef.current) fileInputRef.current.value = '';
    };

    const filteredAndSortedTasks = useMemo(() => {
        let items = [...tasks];
        if (filter) {
            const q = filter.toLowerCase();
            items = items.filter(t =>
                t.program_name.toLowerCase().includes(q) ||
                (t.description && t.description.toLowerCase().includes(q)) ||
                t.month.toLowerCase().includes(q) ||
                t.status.toLowerCase().includes(q)
            );
        }
        if (sortConfig) {
            items.sort((a, b) => {
                const aVal = a[sortConfig.key];
                const bVal = b[sortConfig.key];
                if (aVal === null || aVal === undefined) return 1;
                if (bVal === null || bVal === undefined) return -1;
                if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [tasks, filter, sortConfig]);

    const requestSort = (key: keyof ProgramTask) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') direction = 'descending';
        setSortConfig({ key, direction });
    };

    const getSortIconFor = (key: keyof ProgramTask) => {
        if (!sortConfig || sortConfig.key !== key) return <SortUpDownIcon className="h-4 w-4 ml-1 text-gray-400" />;
        return sortConfig.direction === 'ascending' ? <SortUpIcon className="h-4 w-4 ml-1" /> : <SortDownIcon className="h-4 w-4 ml-1" />;
    };

    const handleExportCSV = () => {
        const headers = ['program_name', 'description', 'month', 'status', 'progress_percent'];
        const csvContent = [
            headers.join(','),
            ...filteredAndSortedTasks.map(t =>
                [
                    `"${(t.program_name || '').replace(/"/g, '""')}"`,
                    `"${(t.description || '').replace(/"/g, '""')}"`,
                    t.month,
                    t.status,
                    t.progress_percent,
                ].join(',')
            ),
        ].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `program-milestones-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    const programStatusStyles: Record<ProgramStatus, string> = {
        Planned: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
        InProgress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
        Completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
        Blocked: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    };

    return (
        <div className="px-4 py-6 sm:px-0">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">GRC Program Tracker</h2>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <input
                        type="text"
                        placeholder="Filter milestones..."
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        className="block w-full sm:w-56 rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        aria-label="Filter milestones"
                    />
                    <div className="flex space-x-2">
                        <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />
                        <button onClick={() => fileInputRef.current?.click()} title="Import CSV" className="p-2 text-gray-400 hover:text-green-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                            <UploadIcon className="h-5 w-5" />
                        </button>
                        <button onClick={handleExportCSV} title="Export CSV" className="p-2 text-gray-400 hover:text-purple-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                            <DownloadIcon className="h-5 w-5" />
                        </button>
                        <button onClick={() => setModalState({ type: 'add' })} title="Add Milestone" className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                            <PlusIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            </div>
            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}

            <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg dark:border-gray-700">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('program_name')} className="flex items-center w-full text-left focus:outline-none">Milestone Name {getSortIconFor('program_name')}</button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('month')} className="flex items-center w-full text-left focus:outline-none">Month {getSortIconFor('month')}</button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('status')} className="flex items-center w-full text-left focus:outline-none">Status {getSortIconFor('status')}</button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('progress_percent')} className="flex items-center w-full text-left focus:outline-none">Progress {getSortIconFor('progress_percent')}</button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={5} className="text-center py-4 text-gray-500 dark:text-gray-400">Loading milestones...</td></tr>
                            ) : filteredAndSortedTasks.map(task => (
                                <tr key={task.id}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900 dark:text-white">{task.program_name}</div>
                                        <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">{task.description}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{task.month}</td>
                                    <td className="px-6 py-4 whitespace-nowrap"><StatusBadge status={task.status} colorMap={programStatusStyles} /></td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <ProgressBar progress={task.progress_percent} />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end items-center space-x-2">
                                            <button onClick={() => setModalState({ type: 'log', task })} className="text-gray-400 hover:text-blue-500"><HistoryIcon className="h-5 w-5" /></button>
                                            <button onClick={() => setModalState({ type: 'view', task })} className="text-gray-400 hover:text-green-500"><EyeIcon className="h-5 w-5" /></button>
                                            <button onClick={() => setModalState({ type: 'edit', task })} className="text-gray-400 hover:text-yellow-500"><PencilIcon className="h-5 w-5" /></button>
                                            <button onClick={() => setModalState({ type: 'delete', task })} className="text-gray-400 hover:text-red-500"><TrashIcon className="h-5 w-5" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <ProgramModal
                isOpen={modalState.type === 'add' || modalState.type === 'edit' || modalState.type === 'view'}
                onClose={closeModal}
                onSave={handleSaveTask}
                taskToEdit={modalState.task || null}
                mode={modalState.type as 'add' | 'edit' | 'view'}
            />
            
            <ActivityLogModal 
                isOpen={modalState.type === 'log'}
                onClose={closeModal}
                taskId={modalState.task?.id || null}
            />

            <DeleteConfirmationModal
                isOpen={modalState.type === 'delete'}
                onClose={closeModal}
                onConfirm={handleDeleteTask}
                itemName="milestone"
            />
        </div>
    );
};

// --- PROGRAM: LEADERSHIP VIEW (New Component) ---
const LeadershipView: React.FC = () => {
    interface LeadershipTask {
        id: string;
        workToBeDone: string;
        description: string;
        timestamp: string;
        status: ProgramStatus;
        progress: number;
    }

    const leadershipDummyData: LeadershipTask[] = [
      { id: '1', workToBeDone: 'Review Q3 Security Budget', description: 'Analyze spending and forecast for Q4.', timestamp: '2024-07-15T10:00:00Z', status: 'Completed', progress: 100 },
      { id: '2', workToBeDone: 'Finalize Board Presentation on Cyber Risk', description: 'Consolidate metrics and key findings for the upcoming board meeting.', timestamp: '2024-07-20T14:30:00Z', status: 'InProgress', progress: 75 },
      { id: '3', workToBeDone: 'Approve new IAM Vendor Contract', description: 'Legal and financial review of the proposed contract.', timestamp: '2024-07-22T11:00:00Z', status: 'InProgress', progress: 40 },
      { id: '4', workToBeDone: 'Plan 2025 GRC Strategy Offsite', description: 'Set agenda, invite key stakeholders, and define objectives for the strategy session.', timestamp: '2024-08-01T09:00:00Z', status: 'Planned', progress: 10 },
      { id: '5', workToBeDone: 'Address Audit Finding A-123', description: 'Develop a remediation plan for the critical finding from the external audit.', timestamp: '2024-07-18T16:00:00Z', status: 'Blocked', progress: 25 },
    ];

    const programStatusStyles: Record<ProgramStatus, string> = {
        Planned: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
        InProgress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
        Completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
        Blocked: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    };
    
    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4 sm:mb-0">Leadership Action Items</h2>
                <div className="flex space-x-2">
                     <button className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700">
                        <PlusIcon className="h-5 w-5 mr-2" /> Add Action Item
                    </button>
                </div>
            </div>
            
            <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg dark:border-gray-700">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Work To Be Done</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Timestamp</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Status</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Progress</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
                           {leadershipDummyData.map(item => (
                                <tr key={item.id}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900 dark:text-white">{item.workToBeDone}</div>
                                        <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">{item.description}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(item.timestamp).toLocaleString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap"><StatusBadge status={item.status} colorMap={programStatusStyles} /></td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <ProgressBar progress={item.progress} />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end items-center space-x-2">
                                            <button className="text-gray-400 hover:text-green-500"><EyeIcon className="h-5 w-5" /></button>
                                            <button className="text-gray-400 hover:text-yellow-500"><PencilIcon className="h-5 w-5" /></button>
                                            <button className="text-gray-400 hover:text-red-500"><TrashIcon className="h-5 w-5" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};


// --- PROGRAM TAB (Container) ---
const ProgramTab: React.FC<{ userRole: 'security-staff' | 'cxo' }> = ({ userRole }) => {
    if (userRole === 'security-staff') {
        // Security staff only see the tracker.
        return <ProgramTrackerView />;
    }

    // CXO View only sees the Leadership view.
    if (userRole === 'cxo') {
        return (
            <div className="px-4 py-6 sm:px-0">
                <LeadershipView />
            </div>
        );
    }

    return null; // Should not happen with defined roles
};

// --- PROGRAM MODALS ---
interface ProgramModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (task: ProgramTaskCreate | ProgramTaskUpdate) => void;
    taskToEdit: ProgramTask | null;
    mode: 'add' | 'edit' | 'view';
}
const ProgramModal: React.FC<ProgramModalProps> = ({ isOpen, onClose, onSave, taskToEdit, mode }) => {
    const [formData, setFormData] = useState<ProgramTaskCreate | ProgramTaskUpdate>({});
    const isViewMode = mode === 'view';

    useEffect(() => {
        if (taskToEdit) {
            setFormData({
                program_name: taskToEdit.program_name,
                description: taskToEdit.description,
                month: taskToEdit.month,
                status: taskToEdit.status,
                progress_percent: taskToEdit.progress_percent
            });
        } else {
            setFormData({
                program_name: '', description: '', month: 'January', status: 'Planned', progress_percent: 0
            });
        }
    }, [taskToEdit, isOpen, mode]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: name === 'progress_percent' ? Number(value) : value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };
    
    const title = mode === 'add' ? 'Add New Milestone' : mode === 'edit' ? 'Edit Milestone' : 'View Milestone';
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Milestone Name</label>
                        <input type="text" name="program_name" value={formData.program_name || ''} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Month</label>
                        <select name="month" value={formData.month || 'January'} onChange={handleChange} disabled={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                        <textarea name="description" value={formData.description || ''} onChange={handleChange} readOnly={isViewMode} rows={3} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"></textarea>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                        <select name="status" value={formData.status || 'Planned'} onChange={handleChange} disabled={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option>Planned</option>
                            <option>InProgress</option>
                            <option>Completed</option>
                            <option>Blocked</option>
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Progress (%)</label>
                        <input type="range" name="progress_percent" min="0" max="100" value={formData.progress_percent || 0} onChange={handleChange} disabled={isViewMode} className="mt-1 block w-full" />
                        <span className="text-sm dark:text-gray-300">{formData.progress_percent || 0}%</span>
                    </div>
                </div>
                {!isViewMode && (
                <div className="mt-6 flex justify-end space-x-3">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>
                    <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">Save</button>
                </div>
                )}
            </form>
        </Modal>
    );
};

interface ActivityLogModalProps {
    isOpen: boolean;
    onClose: () => void;
    taskId: string | null;
}
const ActivityLogModal: React.FC<ActivityLogModalProps> = ({ isOpen, onClose, taskId }) => {
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && taskId) {
            setLoading(true);
            SupabaseService.getActivityLogs(taskId)
                .then(setLogs)
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [isOpen, taskId]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Activity Log">
            {loading ? <p>Loading logs...</p> : (
                <ul className="space-y-2">
                    {logs.length > 0 ? logs.map(log => (
                        <li key={log.id} className="text-sm text-gray-600 dark:text-gray-300">
                            <span className="font-semibold">{new Date(log.created_at).toLocaleString()}:</span> {log.activity}
                        </li>
                    )) : <p>No activity logs found for this milestone.</p>}
                </ul>
            )}
        </Modal>
    );
};

// --- TENANT ADMIN TAB ---
const PlatformAdminTab: React.FC = () => {
    const [emailDescriptionPairs, setEmailDescriptionPairs] = useState<Array<{email: string, description: string}>>([
        { email: '', description: '' }
    ]);
    const [loading, setLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [onboardedUsers, setOnboardedUsers] = useState<any[]>([]);
    const [orgName, setOrgName] = useState<string | null>(null);

    useEffect(() => {
        // Get the current user's organization
        const fetchOrgDetails = async () => {
            try {
                const orgId = await SupabaseService.getUserOrgId();
                if (orgId) {
                    // Fetch organization details
                    const { data, error } = await SupabaseService.supabase
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
            // Get the current user's organization
            const orgId = await SupabaseService.getUserOrgId();
            if (!orgId) {
                throw new Error('No organization found for current user');
            }

            // Filter and validate email-description pairs
            const validPairs = emailDescriptionPairs.filter(pair => pair.email.trim().length > 0);

            if (validPairs.length === 0) {
                throw new Error('Please enter at least one email address');
            }

            console.log('Onboarding users to organization:', orgId);

            const successfulUsers: any[] = [];
            const failedUsers: Array<{email: string, reason: string}> = [];

            for (const pair of validPairs) {
                try {
                    console.log('Onboarding user:', pair.email, 'with description:', pair.description);
                    const userData = await SupabaseService.onboardUserToOrganization(
                        orgId,
                        pair.email,
                        'user',
                        pair.description
                    );
                    successfulUsers.push({ ...pair, ...userData });
                    console.log('User onboarded successfully:', pair.email);
                } catch (err) {
                    console.error(`Failed to onboard ${pair.email}:`, err);
                    const reason = err instanceof Error ? err.message : 'Unknown error';
                    failedUsers.push({ email: pair.email, reason });
                }
            }

            // Log activity
            await SupabaseService.logAllActivity({
                action: 'Onboarded Users',
                module: 'Tenant Admin',
                event_data: {
                    usersOnboarded: successfulUsers.length,
                    failedUsers: failedUsers.length > 0 ? failedUsers : undefined
                }
            });

            if (successfulUsers.length > 0) {
                const activeCount = successfulUsers.filter((u: any) => u.user_id).length;
                const pendingCount = successfulUsers.filter((u: any) => !u.user_id).length;
                
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
            
            // Reset form only if all succeeded
            if (failedUsers.length === 0) {
                setEmailDescriptionPairs([{ email: '', description: '' }]);
            }
        } catch (err) {
            console.error('Error onboarding users:', err);
            const errorMsg = err instanceof Error ? err.message : JSON.stringify(err);
            setErrorMessage(`Failed to onboard users: ${errorMsg}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            {/* Organization Info */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
                <h3 className="text-lg font-bold text-blue-900 dark:text-blue-300 mb-2">Your Organization</h3>
                <p className="text-sm text-blue-700 dark:text-blue-400">
                    {orgName ? `You are managing: ${orgName}` : 'Loading organization details...'}
                </p>
            </div>

            {/* Onboard Users Form */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Add Members to Your Organization</h2>
                
                {successMessage && (
                    <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300">
                        {successMessage}
                    </div>
                )}

                {errorMessage && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
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

            {/* Recently Onboarded Users */}
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

// --- ORGANISATION TAB ---
interface OrganisationTabProps {
    userRole?: string | null;
}

const OrganisationTab: React.FC<OrganisationTabProps> = ({ userRole }) => {
    type SubTab = 'structure' | 'contacts' | 'tenant_admin';
    const [activeSubTab, setActiveSubTab] = useState<SubTab>('structure');
    
    const isPlatformAdmin = userRole === 'tenant_admin';
    
    const subTabs: { id: SubTab; label: string }[] = [
        // { id: 'structure', label: 'Organisation Structure' },
        // { id: 'contacts', label: 'Contacts' },
        ...(isPlatformAdmin ? [{ id: 'tenant_admin' as const, label: 'Tenant Admin' }] : [])
    ];
    
    const renderContent = () => {
        switch(activeSubTab) {
            // case 'structure': return <OrgStructureView />;
            // case 'contacts': return <ContactsView />;
            case 'tenant_admin': return isPlatformAdmin ? <PlatformAdminTab /> : null;
            default: return null;
        }
    }

    return (
        <div className="px-4 py-6 sm:px-0">
             <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    {subTabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveSubTab(tab.id)}
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
                {renderContent()}
            </div>
        </div>
    );
};

// --- ORGANISATION: CONTACTS ---
const ContactsView: React.FC = () => {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string|null>(null);
    const [modalState, setModalState] = useState<{ type: 'add' | 'edit' | 'view' | 'delete' | null; contact?: Contact | null }>({ type: null });
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchContacts = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await SupabaseService.getContacts();
            setContacts(data);
        } catch(e) {
            setError("Failed to load contacts.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchContacts(); }, [fetchContacts]);

    const closeModal = () => setModalState({ type: null });

    const handleSaveContact = async (formData: ContactCreate | ContactUpdate) => {
        try {
            if (modalState.type === 'edit' && modalState.contact) {
                const updatedContact = await SupabaseService.updateContact(modalState.contact.id, formData);
                await SupabaseService.logAllActivity({
                    action: 'Updated Contact',
                    module: 'Organisation',
                    entity_id: updatedContact.id,
                    entity_name: updatedContact.name,
                    event_data: { changes: formData }
                });
            } else if (modalState.type === 'add') {
                const addedContact = await SupabaseService.addContact(formData as ContactCreate);
                await SupabaseService.logAllActivity({
                    action: 'Created Contact',
                    module: 'Organisation',
                    entity_id: addedContact.id,
                    entity_name: addedContact.name,
                    event_data: { details: formData }
                });
            }
            fetchContacts();
            closeModal();
        } catch (err) {
            setError('Failed to save contact.');
        }
    };
    
    const handleDeleteContact = async () => {
        if (modalState.type === 'delete' && modalState.contact) {
            try {
                await SupabaseService.deleteContact(modalState.contact.id);
                await SupabaseService.logAllActivity({
                    action: 'Deleted Contact',
                    module: 'Organisation',
                    entity_id: modalState.contact.id,
                    entity_name: modalState.contact.name
                });
                fetchContacts();
                closeModal();
            } catch (err) {
                setError('Failed to delete contact.');
            }
        }
    };

    const handleImportCSV = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            if(!text) return;
            const lines = text.split('\n').slice(1);
            const newContacts: ContactCreate[] = lines.map(line => {
                const [name, title, level, email, sec_role] = line.split(',').map(s => s.trim());
                if (!name || !title || !level || !email || !sec_role) return null;
                return { name, title, level: Number(level), email, sec_role };
            }).filter((c): c is ContactCreate => c !== null);
            
            if (newContacts.length > 0) {
                try {
                    await SupabaseService.bulkAddContacts(newContacts);
                    await SupabaseService.logAllActivity({
                        action: 'Bulk Imported Contacts',
                        module: 'Organisation',
                        event_data: { count: newContacts.length }
                    });
                    alert(`${newContacts.length} contacts imported successfully!`);
                    fetchContacts();
                } catch (err) {
                    alert('Failed to import contacts.');
                }
            }
        };
        reader.readAsText(file);
        if(fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div>
            <div className="flex justify-end items-center mb-4 space-x-2">
                 <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />
                 <button onClick={() => fileInputRef.current?.click()} title="Import CSV" className="p-2 text-gray-400 hover:text-green-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                    <UploadIcon className="h-5 w-5" />
                </button>
                <button onClick={() => setModalState({ type: 'add' })} title="Add Contact" className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                    <PlusIcon className="h-5 w-5" />
                </button>
            </div>
            
            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}

            <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg dark:border-gray-700">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Name</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Title</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Level</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Email</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Security Role</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Actions</th>
                            </tr>
                        </thead>
                         <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={6} className="text-center py-4 text-gray-500 dark:text-gray-400">Loading contacts...</td></tr>
                            ) : contacts.map(contact => (
                                <tr key={contact.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{contact.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{contact.title}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{contact.level}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{contact.email}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{contact.sec_role}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end items-center space-x-2">
                                            <button onClick={() => setModalState({ type: 'view', contact })} className="text-gray-400 hover:text-green-500"><EyeIcon className="h-5 w-5" /></button>
                                            <button onClick={() => setModalState({ type: 'edit', contact })} className="text-gray-400 hover:text-yellow-500"><PencilIcon className="h-5 w-5" /></button>
                                            <button onClick={() => setModalState({ type: 'delete', contact })} className="text-gray-400 hover:text-red-500"><TrashIcon className="h-5 w-5" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
             <ContactModal
                isOpen={modalState.type === 'add' || modalState.type === 'edit' || modalState.type === 'view'}
                onClose={closeModal}
                onSave={handleSaveContact}
                contactToEdit={modalState.contact || null}
                mode={modalState.type as 'add' | 'edit' | 'view'}
            />
             <DeleteConfirmationModal isOpen={modalState.type === 'delete'} onClose={closeModal} onConfirm={handleDeleteContact} itemName="contact" />
        </div>
    );
};

interface ContactModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (contact: ContactCreate | ContactUpdate) => void;
    contactToEdit: Contact | null;
    mode: 'add' | 'edit' | 'view';
}
const ContactModal: React.FC<ContactModalProps> = ({ isOpen, onClose, onSave, contactToEdit, mode }) => {
    const [formData, setFormData] = useState<Partial<ContactCreate>>({});
    const isViewMode = mode === 'view';

    useEffect(() => {
        if (contactToEdit) {
            const { name, title, level, email, sec_role } = contactToEdit;
            setFormData({ name, title, level, email, sec_role });
        } else {
            setFormData({ name: '', title: '', level: 1, email: '', sec_role: '' });
        }
    }, [contactToEdit, isOpen]);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'number' ? Number(value) : value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData as ContactCreate);
    };

    const title = mode === 'add' ? 'Add New Contact' : mode === 'edit' ? 'Edit Contact' : 'View Contact';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <form onSubmit={handleSubmit} className="space-y-4">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium dark:text-gray-300">Name</label>
                        <input type="text" name="name" value={formData.name || ''} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium dark:text-gray-300">Title</label>
                        <input type="text" name="title" value={formData.title || ''} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                     <div>
                        <label className="block text-sm font-medium dark:text-gray-300">Email</label>
                        <input type="email" name="email" value={formData.email || ''} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium dark:text-gray-300">Level</label>
                        <input type="number" name="level" min="1" value={formData.level || 1} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium dark:text-gray-300">Security Role</label>
                        <input type="text" name="sec_role" value={formData.sec_role || ''} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                </div>
                 {!isViewMode && (
                    <div className="mt-6 flex justify-end space-x-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>
                        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700">Save</button>
                    </div>
                )}
            </form>
        </Modal>
    );
};

// --- ORGANISATION: STRUCTURE ---
const OrgStructureView: React.FC = () => {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showSecurityOnly, setShowSecurityOnly] = useState(false);

    useEffect(() => {
        SupabaseService.getContacts()
            .then(data => {
                console.log('Fetched contacts:', data);
                setContacts(data);
            })
            .catch(err => {
                console.error('Error fetching contacts:', err);
                setError(err?.message || 'Failed to load contacts');
            })
            .finally(() => setLoading(false));
    }, []);

    const orgData = useMemo(() => {
        const filteredContacts = showSecurityOnly ? contacts.filter(c => c.sec_role && c.sec_role.toLowerCase() !== 'n/a') : contacts;
        return filteredContacts.reduce((acc, contact) => {
            (acc[contact.level] = acc[contact.level] || []).push(contact);
            return acc;
        }, {} as Record<number, Contact[]>);
    }, [contacts, showSecurityOnly]);

    if (loading) return <p className="text-center">Loading organisation structure...</p>;
    if (error) return <p className="text-center text-red-600">Error: {error}</p>;
    if (contacts.length === 0) return <p className="text-center text-gray-500">No contacts found. Please add contacts to your organization.</p>;

    return (
        <div>
            <div className="flex justify-end items-center mb-4">
                <label className="flex items-center cursor-pointer">
                    <span className="mr-3 text-sm font-medium text-gray-900 dark:text-gray-300">Show Security Roles Only</span>
                    <div className="relative">
                        <input type="checkbox" checked={showSecurityOnly} onChange={() => setShowSecurityOnly(!showSecurityOnly)} className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                    </div>
                </label>
            </div>
            <div className="space-y-8">
                {Object.keys(orgData).sort((a,b) => Number(a)-Number(b)).map(level => (
                    <div key={level}>
                        <h3 className="text-lg font-bold text-gray-700 dark:text-gray-300 mb-4 border-b pb-2">Level {level}</h3>
                        <div className="flex flex-wrap gap-4">
                            {orgData[Number(level)].map(contact => (
                                <div key={contact.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 min-w-[250px] flex-1">
                                    <p className="font-bold text-gray-900 dark:text-white">{contact.name}</p>
                                    <p className="text-sm text-blue-600 dark:text-blue-400">{contact.title}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{contact.email}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full inline-block">{contact.sec_role}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- GOVERNANCE TAB ---
const GovernanceTab: React.FC = () => {
    type SubTab = 'controls' | 'assets' | 'policies' | 'vulnerability';
    const [activeSubTab, setActiveSubTab] = useState<SubTab>('controls');
    
    const subTabs: { id: SubTab; label: string }[] = [
        { id: 'controls', label: 'Internal Control Catalogue' },
        { id: 'assets', label: 'Assets' },
        { id: 'policies', label: 'Policy' },
        { id: 'vulnerability', label: 'Vulnerability' },
    ];
    
    const renderContent = () => {
        switch(activeSubTab) {
            case 'controls': return <InternalControlsView />;
            case 'assets': return <AssetsView />;
            case 'policies': return <PoliciesView />;
            case 'vulnerability': return <VulnerabilitiesView />;
            default: return null;
        }
    }

    return (
        <div className="px-4 py-6 sm:px-0">
             <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    {subTabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveSubTab(tab.id)}
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
                {renderContent()}
            </div>
        </div>
    );
};

// --- GOVERNANCE: INTERNAL CONTROLS ---

const InternalControlsView: React.FC = () => {
    const [controls, setControls] = useState<InternalControl[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string|null>(null);
    const [modalState, setModalState] = useState<{ type: 'add' | 'edit' | 'view' | 'delete' | null; control?: InternalControl | null }>({ type: null });
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [filter, setFilter] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof InternalControl; direction: 'ascending' | 'descending' } | null>(null);
    
    const controlStatusStyles: Record<InternalControlStatus, string> = {
        'Enforced': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
        'Not-Enforced': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
        'InProgress': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    };

    const fetchControls = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await SupabaseService.getInternalControls();
            setControls(data);
        } catch(e) {
            setError("Failed to load internal controls.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchControls();
    }, [fetchControls]);

    const filteredAndSortedControls = useMemo(() => {
        let filteredItems = [...controls];
        if (filter) {
            const lowerCaseFilter = filter.toLowerCase();
            filteredItems = filteredItems.filter(item =>
                String(item.ctl_id ?? '').toLowerCase().includes(lowerCaseFilter) ||
                String(item.name ?? '').toLowerCase().includes(lowerCaseFilter) ||
                String(item.description ?? '').toLowerCase().includes(lowerCaseFilter) ||
                (item.compliance_tag3 && item.compliance_tag3.join(' ').toLowerCase().includes(lowerCaseFilter))
            );
        }
        
        if (sortConfig !== null) {
            filteredItems.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];
                if (aValue === null || aValue === undefined) return 1;
                if (bValue === null || bValue === undefined) return -1;
    
                if (aValue < bValue) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return filteredItems;
    }, [controls, filter, sortConfig]);
    
    const requestSort = (key: keyof InternalControl) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };
    
    const getSortIconFor = (key: keyof InternalControl) => {
        if (!sortConfig || sortConfig.key !== key) {
            return <SortUpDownIcon className="h-4 w-4 ml-1 text-gray-400" />;
        }
        return sortConfig.direction === 'ascending' ? <SortUpIcon className="h-4 w-4 ml-1" /> : <SortDownIcon className="h-4 w-4 ml-1" />;
    };

    const closeModal = () => setModalState({ type: null });

    const handleSaveControl = async (formData: InternalControlCreate | InternalControlUpdate, evidenceFile?: File | null) => {
        try {
            const dataToSave = { ...formData };
            if (evidenceFile) {
                dataToSave.evidence_file_url = await SupabaseService.uploadFile(evidenceFile, 'evidence');
            }

            if (modalState.type === 'edit' && modalState.control) {
                const updatedControl = await SupabaseService.updateInternalControl(modalState.control.id, dataToSave);
                await SupabaseService.logAllActivity({
                    action: 'Updated Internal Control',
                    module: 'Governance',
                    entity_id: updatedControl.id,
                    entity_name: updatedControl.name,
                    event_data: { changes: dataToSave }
                });
            } else if (modalState.type === 'add') {
                const addedControl = await SupabaseService.addInternalControl(dataToSave as InternalControlCreate);
                 await SupabaseService.logAllActivity({
                    action: 'Created Internal Control',
                    module: 'Governance',
                    entity_id: addedControl.id,
                    entity_name: addedControl.name,
                    event_data: { details: dataToSave }
                });
            }
            fetchControls();
            closeModal();
        } catch (err) {
            setError('Failed to save control.');
            console.error(err);
        }
    };

    const handleDeleteControl = async () => {
        if (modalState.type === 'delete' && modalState.control) {
            try {
                await SupabaseService.deleteInternalControl(modalState.control.id);
                await SupabaseService.logAllActivity({
                    action: 'Deleted Internal Control',
                    module: 'Governance',
                    entity_id: modalState.control.id,
                    entity_name: modalState.control.name
                });
                fetchControls();
                closeModal();
            } catch (err) {
                setError('Failed to delete control.');
            }
        }
    };

    const handleImportCSV = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            if(!text) return;

            const lines = text.split('\n').slice(1); // Skip header row
            const newControls: InternalControlCreate[] = lines
                .map((line): InternalControlCreate | null => {
                    const [ctl_id, name, description, status, compliance_tags] = line.split(',').map(s => s ? s.trim() : '');
                    if (!ctl_id || !name || !status) return null;

                    return {
                        ctl_id,
                        name,
                        description: description || null,
                        status: status as InternalControlStatus,
                        compliance_tag3: compliance_tags ? compliance_tags.split('|').map(t => t.trim()) : [],
                    };
                })
                .filter((control): control is InternalControlCreate => control !== null);
            
            if (newControls.length > 0) {
                try {
                    await SupabaseService.bulkAddInternalControls(newControls);
                    await SupabaseService.logAllActivity({
                        action: 'Bulk Imported Controls',
                        module: 'Governance',
                        event_data: { count: newControls.length }
                    });
                    alert(`${newControls.length} controls imported successfully!`);
                    fetchControls();
                } catch (err) {
                    alert('Failed to import controls.');
                    console.error(err);
                }
            }
        };
        reader.readAsText(file);
        if(fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleExportCSV = () => {
        const headers = ['ctl_id', 'name', 'description', 'status', 'compliance_tags'];
        const csvContent = [
            headers.join(','),
            ...filteredAndSortedControls.map(c =>
                [
                    c.ctl_id,
                    `"${(c.name || '').replace(/"/g, '""')}"`,
                    `"${(c.description || '').replace(/"/g, '""')}"`,
                    c.status || '',
                    `"${(c.compliance_tag3 || []).join('|')}"`,
                ].join(',')
            ),
        ].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `internal-controls-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                <div className="w-full sm:w-1/3">
                    <input
                        type="text"
                        placeholder="Filter controls..."
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        aria-label="Filter internal controls"
                    />
                </div>
                <div className="flex space-x-2">
                    <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} title="Import CSV" className="p-2 text-gray-400 hover:text-green-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        <UploadIcon className="h-5 w-5" />
                    </button>
                    <button onClick={handleExportCSV} title="Export CSV" className="p-2 text-gray-400 hover:text-purple-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        <DownloadIcon className="h-5 w-5" />
                    </button>
                    <button onClick={() => setModalState({ type: 'add' })} title="Add Control" className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        <PlusIcon className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}

            <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg dark:border-gray-700">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                           <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('ctl_id')} className="flex items-center w-full text-left focus:outline-none">
                                        CTL ID {getSortIconFor('ctl_id')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('name')} className="flex items-center w-full text-left focus:outline-none">
                                        Name {getSortIconFor('name')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('status')} className="flex items-center w-full text-left focus:outline-none">
                                        Status {getSortIconFor('status')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Compliance Tags</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Actions</th>
                            </tr>
                        </thead>
                         <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={5} className="text-center py-4 text-gray-500 dark:text-gray-400">Loading controls...</td></tr>
                            ) : filteredAndSortedControls.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-4 text-gray-500 dark:text-gray-400">No controls found.</td></tr>
                            ) : filteredAndSortedControls.map(control => (
                                <tr key={control.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{String(control.ctl_id ?? '')}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900 dark:text-white">{String(control.name ?? '')}</div>
                                        <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">{String(control.description ?? '')}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {control.status && <StatusBadge status={control.status} colorMap={controlStatusStyles} />}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex flex-wrap gap-1 max-w-xs">
                                            {Array.isArray(control.compliance_tag3) && control.compliance_tag3.filter(tag => typeof tag === 'string').map(tag => (
                                                <span key={tag} className="px-2 py-1 text-xs font-semibold text-blue-800 bg-blue-100 rounded-full dark:bg-blue-900 dark:text-blue-300">{tag}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end items-center space-x-2">
                                            <button onClick={() => setModalState({ type: 'view', control })} className="text-gray-400 hover:text-green-500"><EyeIcon className="h-5 w-5" /></button>
                                            <button onClick={() => setModalState({ type: 'edit', control })} className="text-gray-400 hover:text-yellow-500"><PencilIcon className="h-5 w-5" /></button>
                                            <button onClick={() => setModalState({ type: 'delete', control })} className="text-gray-400 hover:text-red-500"><TrashIcon className="h-5 w-5" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <InternalControlModal
                isOpen={modalState.type === 'add' || modalState.type === 'edit' || modalState.type === 'view'}
                onClose={closeModal}
                onSave={handleSaveControl}
                controlToEdit={modalState.control || null}
                mode={modalState.type as 'add' | 'edit' | 'view'}
            />
            <DeleteConfirmationModal
                isOpen={modalState.type === 'delete'}
                onClose={closeModal}
                onConfirm={handleDeleteControl}
                itemName="internal control"
            />
        </div>
    );
};

interface InternalControlModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (control: InternalControlCreate | InternalControlUpdate, evidenceFile?: File | null) => void;
    controlToEdit: InternalControl | null;
    mode: 'add' | 'edit' | 'view';
}
const InternalControlModal: React.FC<InternalControlModalProps> = ({ isOpen, onClose, onSave, controlToEdit, mode }) => {
    const [formData, setFormData] = useState<Partial<InternalControlCreate>>({ compliance_tag3: [] });
    const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
    const [complianceTags, setComplianceTags] = useState<string[]>([]);
    const isViewMode = mode === 'view';
    const [tagInput, setTagInput] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const autocompleteRef = useRef<HTMLDivElement>(null);

    const defaultState: InternalControlCreate = {
        ctl_id: '',
        name: '',
        description: '',
        status: 'Not-Enforced',
        compliance_tag3: [],
        evidence_file_url: null,
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (autocompleteRef.current && !autocompleteRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    useEffect(() => {
        SupabaseService.getComplianceTags().then(setComplianceTags);
    }, []);

    useEffect(() => {
        if (controlToEdit) {
            const sanitizedControlData = {
                ...controlToEdit,
                ctl_id: String(controlToEdit.ctl_id ?? ''),
                name: String(controlToEdit.name ?? ''),
                description: String(controlToEdit.description ?? ''),
                status: controlToEdit.status ?? 'Not-Enforced',
                compliance_tag3: Array.isArray(controlToEdit.compliance_tag3) 
                    ? controlToEdit.compliance_tag3.filter(tag => typeof tag === 'string') 
                    : [],
            };
            setFormData(sanitizedControlData);
        } else {
            setFormData(defaultState);
        }
        setEvidenceFile(null);
        setTagInput('');
        setShowSuggestions(false);
    }, [controlToEdit, isOpen]);

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

     const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setEvidenceFile(e.target.files[0]);
        }
    };
    
    const handleAddTag = (tag: string) => {
        if (tag && !formData.compliance_tag3?.includes(tag)) {
            setFormData(prev => ({ ...prev, compliance_tag3: [...(prev.compliance_tag3 || []), tag] }));
        }
    };
    
    const handleRemoveTag = (tagToRemove: string) => {
        setFormData(prev => ({ ...prev, compliance_tag3: (prev.compliance_tag3 || []).filter(tag => tag !== tagToRemove) }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData as InternalControlCreate | InternalControlUpdate, evidenceFile);
    };
    
    const filteredAutocompleteTags = useMemo(() => {
        const availableTags = complianceTags.filter(t => !(formData.compliance_tag3 || []).includes(t));
        if (!tagInput) {
            return availableTags;
        }
        return availableTags.filter(tag => tag.toLowerCase().includes(tagInput.toLowerCase()));
    }, [tagInput, complianceTags, formData.compliance_tag3]);

    const title = mode === 'add' ? 'Add New Control' : mode === 'edit' ? 'Edit Control' : 'View Control';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">CTL ID</label>
                        <input type="text" name="ctl_id" value={formData.ctl_id || ''} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Control Name</label>
                        <input type="text" name="name" value={formData.name || ''} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                        <textarea name="description" value={formData.description || ''} onChange={handleChange} readOnly={isViewMode} rows={3} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"></textarea>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                        <select name="status" value={formData.status || ''} onChange={handleChange} disabled={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option>Not-Enforced</option>
                            <option>InProgress</option>
                            <option>Enforced</option>
                        </select>
                    </div>
                     <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Compliance Tags</label>
                         <div className="flex flex-wrap gap-2 p-2 mt-1 border rounded-md min-h-[40px] bg-white dark:bg-gray-700 dark:border-gray-600">
                            {Array.isArray(formData.compliance_tag3) && formData.compliance_tag3.filter(tag => typeof tag === 'string').map(tag => (
                                <span key={tag} className="flex items-center gap-1 bg-blue-100 text-blue-800 text-sm font-medium px-2.5 py-0.5 rounded-full dark:bg-blue-900 dark:text-blue-300">
                                    {tag}
                                    {!isViewMode && <button type="button" onClick={() => handleRemoveTag(tag)} className="text-blue-500 hover:text-blue-700">
                                        <XIcon className="h-3 w-3"/>
                                    </button>}
                                </span>
                            ))}
                        </div>
                        {!isViewMode && (
                            <div className="relative mt-2" ref={autocompleteRef}>
                                <input 
                                    type="text"
                                    value={tagInput}
                                    onChange={(e) => {
                                        setTagInput(e.target.value);
                                        if (!showSuggestions) setShowSuggestions(true);
                                    }}
                                    onFocus={() => setShowSuggestions(true)}
                                    placeholder="-- Type to search for a tag --"
                                    className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                                {showSuggestions && filteredAutocompleteTags.length > 0 && (
                                    <ul className="absolute z-10 w-full bg-white dark:bg-gray-800 border rounded-md mt-1 max-h-40 overflow-y-auto shadow-lg">
                                        {filteredAutocompleteTags.map(tag => (
                                            <li 
                                                key={tag} 
                                                onClick={() => {
                                                    handleAddTag(tag);
                                                    setTagInput('');
                                                    setShowSuggestions(false);
                                                }}
                                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-900 dark:text-gray-200"
                                            >
                                                {tag}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Evidence File</label>
                        {!isViewMode && <input type="file" onChange={handleFileChange} className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900 dark:file:text-blue-300 dark:hover:file:bg-blue-800"/>}
                        {evidenceFile && <p className="text-xs mt-1 dark:text-gray-400">Selected for upload: {evidenceFile.name}</p>}
                        {controlToEdit?.evidence_file_url && (
                             <a href={controlToEdit.evidence_file_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">View Current Evidence</a>
                        )}
                    </div>
                </div>
                 {!isViewMode && (
                <div className="mt-6 flex justify-end space-x-3">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>
                    <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">Save</button>
                </div>
                )}
            </form>
        </Modal>
    );
}

// --- GOVERNANCE: ASSETS ---
const AssetsView: React.FC = () => {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string|null>(null);
    const [modalState, setModalState] = useState<{ type: 'add' | 'edit' | 'view' | 'delete' | 'import' | null; asset?: Asset | null }>({ type: null });
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [filter, setFilter] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof Asset; direction: 'ascending' | 'descending' } | null>(null);
    const [importData, setImportData] = useState<{ newAssets: AssetCreate[]; duplicates: string[] }>({ newAssets: [], duplicates: [] });

    const fetchAssets = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await SupabaseService.getAssets();
            setAssets(data);
        } catch (e) {
            setError("Failed to load assets.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAssets();
    }, [fetchAssets]);
    
    const filteredAndSortedAssets = useMemo(() => {
        let filteredItems = [...assets];
        if (filter) {
            const lowerCaseFilter = filter.toLowerCase();
            filteredItems = filteredItems.filter(item =>
                String(item.asset_id ?? '').toLowerCase().includes(lowerCaseFilter) ||
                String(item.name ?? '').toLowerCase().includes(lowerCaseFilter) ||
                String(item.asset_owner ?? '').toLowerCase().includes(lowerCaseFilter) ||
                String(item.business_owner ?? '').toLowerCase().includes(lowerCaseFilter) ||
                String(item.details ?? '').toLowerCase().includes(lowerCaseFilter)
            );
        }
        
        if (sortConfig !== null) {
            filteredItems.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];
                if (aValue === null || aValue === undefined) return 1;
                if (bValue === null || bValue === undefined) return -1;
    
                if (aValue < bValue) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return filteredItems;
    }, [assets, filter, sortConfig]);

    const requestSort = (key: keyof Asset) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };
    
    const getSortIconFor = (key: keyof Asset) => {
        if (!sortConfig || sortConfig.key !== key) {
            return <SortUpDownIcon className="h-4 w-4 ml-1 text-gray-400" />;
        }
        return sortConfig.direction === 'ascending' ? <SortUpIcon className="h-4 w-4 ml-1" /> : <SortDownIcon className="h-4 w-4 ml-1" />;
    };

    const closeModal = () => setModalState({ type: null });

    const handleSaveAsset = async (formData: AssetCreate | AssetUpdate) => {
        try {
            if (modalState.type === 'edit' && modalState.asset) {
                const updatedAsset = await SupabaseService.updateAsset(modalState.asset.id, formData);
                await SupabaseService.logAllActivity({
                    action: 'Updated Asset',
                    module: 'Governance',
                    entity_id: updatedAsset.id,
                    entity_name: updatedAsset.name,
                    event_data: { changes: formData }
                });
            } else if (modalState.type === 'add') {
                const addedAsset = await SupabaseService.addAsset(formData as AssetCreate);
                await SupabaseService.logAllActivity({
                    action: 'Created Asset',
                    module: 'Governance',
                    entity_id: addedAsset.id,
                    entity_name: addedAsset.name,
                    event_data: { details: formData }
                });
            }
            fetchAssets();
            closeModal();
        } catch (err) {
            setError('Failed to save asset.');
        }
    };
    
    const handleDeleteAsset = async () => {
        if (modalState.type === 'delete' && modalState.asset) {
            try {
                await SupabaseService.deleteAsset(modalState.asset.id);
                await SupabaseService.logAllActivity({
                    action: 'Deleted Asset',
                    module: 'Governance',
                    entity_id: modalState.asset.id,
                    entity_name: modalState.asset.name
                });
                fetchAssets();
                closeModal();
            } catch (err) {
                setError('Failed to delete asset.');
            }
        }
    };

    const handleImportCSV = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            if(!text) return;

            const lines = text.split('\n').slice(1);
            const parsedAssets: AssetCreate[] = lines
                .map(line => {
                    const [asset_id, name, criticality, details, governed_status, vulnerability_count, exposure, category, asset_owner, business_owner] = line.split(',').map(s => s.trim());
                    if (!asset_id || !name || !criticality || !governed_status || !exposure || !category) return null;

                    // Basic validation for enum types
                    const validCriticality: AssetCriticality[] = ['High', 'Medium', 'Low'];
                    const validGovernedStatus: AssetGovernedStatus[] = ['Governed', 'Non-Governed'];
                    const validExposure: AssetExposure[] = ['Internal', 'External', 'DMZ'];
                    const validCategory: AssetCategory[] = ['Information', 'Technology', 'Service'];

                    if (!validCriticality.includes(criticality as AssetCriticality) ||
                        !validGovernedStatus.includes(governed_status as AssetGovernedStatus) ||
                        !validExposure.includes(exposure as AssetExposure) ||
                        !validCategory.includes(category as AssetCategory)) {
                        return null;
                    }

                    return {
                        asset_id,
                        name,
                        criticality: criticality as AssetCriticality,
                        details: details || '',
                        governed_status: governed_status as AssetGovernedStatus,
                        vulnerability_count: Number(vulnerability_count) || 0,
                        exposure: exposure as AssetExposure,
                        category: category as AssetCategory,
                        asset_owner: asset_owner || '',
                        business_owner: business_owner || '',
                    };
                })
                .filter((asset): asset is AssetCreate => asset !== null);
            
            // Check for duplicates by asset_id
            const existingAssetIds = new Set(assets.map(a => a.asset_id));
            const newAssets = parsedAssets.filter(a => !existingAssetIds.has(a.asset_id));
            const duplicates = parsedAssets.filter(a => existingAssetIds.has(a.asset_id)).map(a => a.asset_id);
            
            setImportData({ newAssets, duplicates });
            setModalState({ type: 'import' });
        };
        reader.readAsText(file);
        if(fileInputRef.current) fileInputRef.current.value = '';
    };
    
    const handleConfirmImport = async () => {
        if (importData.newAssets.length > 0) {
            try {
                await SupabaseService.bulkAddAssets(importData.newAssets);
                await SupabaseService.logAllActivity({
                    action: 'Bulk Imported Assets',
                    module: 'Governance',
                    event_data: { count: importData.newAssets.length, duplicateCount: importData.duplicates.length }
                });
                setModalState({ type: null });
                fetchAssets();
            } catch (err) {
                setError('Failed to import assets.');
                console.error(err);
            }
        }
    };

    const handleExportCSV = () => {
        const headers = ['asset_id', 'name', 'criticality', 'details', 'governed_status', 'vulnerability_count', 'exposure', 'category', 'asset_owner', 'business_owner'];
        const csvContent = [
            headers.join(','),
            ...filteredAndSortedAssets.map(asset =>
                [
                    asset.asset_id,
                    `"${(asset.name || '').replace(/"/g, '""')}"`,
                    asset.criticality,
                    `"${(asset.details || '').replace(/"/g, '""')}"`,
                    asset.governed_status,
                    asset.vulnerability_count,
                    asset.exposure,
                    asset.category,
                    `"${(asset.asset_owner || '').replace(/"/g, '""')}"`,
                    `"${(asset.business_owner || '').replace(/"/g, '""')}"`,
                ].join(',')
            ),
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `assets-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                <div className="w-full sm:w-1/3">
                    <input 
                        type="text"
                        placeholder="Filter assets..."
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        aria-label="Filter assets"
                    />
                </div>
                <div className="flex space-x-2">
                    <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} title="Import CSV" className="p-2 text-gray-400 hover:text-green-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        <UploadIcon className="h-5 w-5" />
                    </button>
                    <button onClick={handleExportCSV} title="Export CSV" className="p-2 text-gray-400 hover:text-purple-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        <DownloadIcon className="h-5 w-5" />
                    </button>
                    <button onClick={() => setModalState({ type: 'add' })} title="Add Asset" className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        <PlusIcon className="h-5 w-5" />
                    </button>
                </div>
            </div>
            
            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}

            <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg dark:border-gray-700">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('asset_id')} className="flex items-center w-full text-left focus:outline-none">
                                        Asset ID {getSortIconFor('asset_id')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('name')} className="flex items-center w-full text-left focus:outline-none">
                                        Name {getSortIconFor('name')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('criticality')} className="flex items-center w-full text-left focus:outline-none">
                                        Criticality {getSortIconFor('criticality')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('business_owner')} className="flex items-center w-full text-left focus:outline-none">
                                        Business Owner {getSortIconFor('business_owner')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('category')} className="flex items-center w-full text-left focus:outline-none">
                                        Type {getSortIconFor('category')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Actions</th>
                            </tr>
                        </thead>
                         <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={6} className="text-center py-4 text-gray-500 dark:text-gray-400">Loading assets...</td></tr>
                            ) : filteredAndSortedAssets.length === 0 ? (
                                <tr><td colSpan={6} className="text-center py-4 text-gray-500 dark:text-gray-400">No assets found.</td></tr>
                            ) : filteredAndSortedAssets.map(asset => (
                                <tr key={asset.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{asset.asset_id}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{asset.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{asset.criticality}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{asset.business_owner || '-'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{asset.category}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end items-center space-x-2">
                                            <button onClick={() => setModalState({ type: 'view', asset })} className="text-gray-400 hover:text-green-500"><EyeIcon className="h-5 w-5" /></button>
                                            <button onClick={() => setModalState({ type: 'edit', asset })} className="text-gray-400 hover:text-yellow-500"><PencilIcon className="h-5 w-5" /></button>
                                            <button onClick={() => setModalState({ type: 'delete', asset })} className="text-gray-400 hover:text-red-500"><TrashIcon className="h-5 w-5" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
             <AssetModal
                isOpen={modalState.type === 'add' || modalState.type === 'edit' || modalState.type === 'view'}
                onClose={closeModal}
                onSave={handleSaveAsset}
                assetToEdit={modalState.asset || null}
                mode={modalState.type as 'add' | 'edit' | 'view'}
            />
             <DeleteConfirmationModal
                isOpen={modalState.type === 'delete'}
                onClose={closeModal}
                onConfirm={handleDeleteAsset}
                itemName="asset"
            />
            <Modal isOpen={modalState.type === 'import'} onClose={closeModal} title="Import CSV Preview">
                <div className="space-y-4">
                    <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">New Assets to Import ({importData.newAssets.length})</h4>
                        {importData.newAssets.length > 0 ? (
                            <div className="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-md p-3">
                                {importData.newAssets.map((asset, idx) => (
                                    <div key={idx} className="py-2 px-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0 text-sm dark:text-gray-300">
                                        <div className="font-medium">{asset.asset_id} - {asset.name}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">Criticality: {asset.criticality} | Category: {asset.category}</div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-gray-500 dark:text-gray-400 text-sm">No new assets to import.</div>
                        )}
                    </div>
                    {importData.duplicates.length > 0 && (
                        <div>
                            <h4 className="font-semibold text-yellow-600 dark:text-yellow-400 mb-2">Duplicates (Not Imported - {importData.duplicates.length})</h4>
                            <div className="max-h-48 overflow-y-auto border border-yellow-200 dark:border-yellow-700 rounded-md p-3 bg-yellow-50 dark:bg-gray-800">
                                {importData.duplicates.map((assetId, idx) => (
                                    <div key={idx} className="py-1 px-2 text-sm text-yellow-800 dark:text-yellow-200">
                                        {assetId} (already exists)
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="mt-6 flex justify-end space-x-3">
                    <button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>
                    <button onClick={handleConfirmImport} disabled={importData.newAssets.length === 0} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed">
                        Import {importData.newAssets.length} Asset{importData.newAssets.length !== 1 ? 's' : ''}
                    </button>
                </div>
            </Modal>
        </div>
    );
};

interface AssetModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (asset: AssetCreate | AssetUpdate) => void;
    assetToEdit: Asset | null;
    mode: 'add' | 'edit' | 'view';
}
const AssetModal: React.FC<AssetModalProps> = ({ isOpen, onClose, onSave, assetToEdit, mode }) => {
    const [formData, setFormData] = useState<Partial<AssetCreate>>({});
    const isViewMode = mode === 'view';

    useEffect(() => {
        if (assetToEdit) {
            const { asset_id, name, asset_owner, business_owner, criticality, details, governed_status, vulnerability_count, exposure, category } = assetToEdit;
            setFormData({ asset_id, name, asset_owner, business_owner, criticality, details, governed_status, vulnerability_count, exposure, category });
        } else {
            setFormData({ asset_id: '', name: '', asset_owner: '', business_owner: '', criticality: 'Low', category: 'Technology', exposure: 'Internal', governed_status: 'Non-Governed', vulnerability_count: 0, details: '' });
        }
    }, [assetToEdit, isOpen, mode]);

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const isNumeric = ['vulnerability_count'].includes(name);
        setFormData(prev => ({ ...prev, [name]: isNumeric ? Number(value) : value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData as AssetCreate | AssetUpdate);
    };

    const title = mode === 'add' ? 'Add New Asset' : mode === 'edit' ? 'Edit Asset' : 'View Asset';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <form onSubmit={handleSubmit} className="space-y-4">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Asset ID</label>
                        <input type="text" name="asset_id" value={formData.asset_id || ''} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Asset Name</label>
                        <input type="text" name="name" value={formData.name || ''} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Asset Owner</label>
                        <input type="text" name="asset_owner" value={formData.asset_owner || ''} onChange={handleChange} readOnly={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Owner</label>
                        <input type="text" name="business_owner" value={formData.business_owner || ''} onChange={handleChange} readOnly={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Criticality</label>
                        <select name="criticality" value={formData.criticality} onChange={handleChange} disabled={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                           <option>Low</option><option>Medium</option><option>High</option>
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Category</label>
                        <select name="category" value={formData.category} onChange={handleChange} disabled={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                           <option>Technology</option><option>Information</option><option>Service</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Exposure</label>
                        <select name="exposure" value={formData.exposure} onChange={handleChange} disabled={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                           <option>Internal</option><option>External</option><option>DMZ</option>
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Governed Status</label>
                        <select name="governed_status" value={formData.governed_status} onChange={handleChange} disabled={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                           <option>Non-Governed</option><option>Governed</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Vulnerability Count</label>
                        <input type="number" name="vulnerability_count" value={formData.vulnerability_count || 0} onChange={handleChange} readOnly={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                     <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Details</label>
                        <textarea name="details" value={formData.details || ''} onChange={handleChange} readOnly={isViewMode} rows={3} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"></textarea>
                    </div>
                </div>
                 {!isViewMode && (
                <div className="mt-6 flex justify-end space-x-3">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>
                    <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">Save</button>
                </div>
                )}
            </form>
        </Modal>
    );
};


// --- GOVERNANCE: POLICIES ---
const PoliciesView: React.FC = () => {
    const [policies, setPolicies] = useState<PolicyDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string|null>(null);
    const [importLoading, setImportLoading] = useState(false);
    const [modalState, setModalState] = useState<{ type: 'add' | 'edit' | 'view' | 'delete' | 'import' | null; policy?: PolicyDocument | null }>({ type: null });
    const [filter, setFilter] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof PolicyDocument; direction: 'ascending' | 'descending' } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importData, setImportData] = useState<{ newPolicies: PolicyDocumentCreate[]; policiesToUpdate: Array<{id: string; data: PolicyDocumentUpdate}>; duplicateNames: string[] }>({ newPolicies: [], policiesToUpdate: [], duplicateNames: [] });

    const fetchPolicies = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await SupabaseService.getPolicies();
            setPolicies(data);
        } catch (e) {
            setError("Failed to load policies.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPolicies();
    }, [fetchPolicies]);

    const filteredAndSortedPolicies = useMemo(() => {
        let filteredItems = [...policies];
        if (filter) {
            const lowerCaseFilter = filter.toLowerCase();
            filteredItems = filteredItems.filter(item =>
                String(item.name ?? '').toLowerCase().includes(lowerCaseFilter) ||
                String(item.description ?? '').toLowerCase().includes(lowerCaseFilter)
            );
        }
        
        if (sortConfig !== null) {
            filteredItems.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];
                if (aValue === null || aValue === undefined) return 1;
                if (bValue === null || bValue === undefined) return -1;
    
                if (aValue < bValue) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return filteredItems;
    }, [policies, filter, sortConfig]);

    const requestSort = (key: keyof PolicyDocument) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };
    
    const getSortIconFor = (key: keyof PolicyDocument) => {
        if (!sortConfig || sortConfig.key !== key) {
            return <SortUpDownIcon className="h-4 w-4 ml-1 text-gray-400" />;
        }
        return sortConfig.direction === 'ascending' ? <SortUpIcon className="h-4 w-4 ml-1" /> : <SortDownIcon className="h-4 w-4 ml-1" />;
    };

    const isValidDate = (dateString: string): boolean => {
        if (!dateString || dateString.trim() === '') return false;
        const date = new Date(dateString);
        return date instanceof Date && !isNaN(date.getTime());
    };

    const closeModal = () => setModalState({ type: null });

    const handleImportCSV = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            if (!text) return;

            try {
                const lines = text.split('\n').filter(line => line.trim());
                if (lines.length < 2) {
                    alert('CSV file must have at least a header and one data row');
                    return;
                }

                const parsedPolicies: Array<{id: string | null; data: PolicyDocumentCreate}> = lines
                    .slice(1)
                    .map(line => {
                        // Parse CSV with proper quote handling
                        const parts: string[] = [];
                        let current = '';
                        let inQuotes = false;
                        
                        for (let i = 0; i < line.length; i++) {
                            const char = line[i];
                            const nextChar = line[i + 1];

                            if (char === '"') {
                                if (inQuotes && nextChar === '"') {
                                    current += '"';
                                    i++;
                                } else {
                                    inQuotes = !inQuotes;
                                }
                            } else if (char === ',' && !inQuotes) {
                                parts.push(current.trim());
                                current = '';
                            } else {
                                current += char;
                            }
                        }
                        parts.push(current.trim());

                        if (!parts[1]) return null;

                        try {
                            const policyId = parts[0] && parts[0] !== '' ? parts[0] : null;
                            
                            // Explicit column mapping for CSV import
                            // Headers: ['id', 'name', 'description', 'document_type', 'document_content', 
                            //           'content_editor_text', 'url', 'grc_contact', 'policy_reviewer_contact', 'tags', 
                            //           'published_date', 'next_review_date', 'policy_labels', 'related_projects', 'status', 
                            //           'version', 'custom_roles', 'related_documents', 'owner_name', 'created_at']
                            
                            const name = parts[1] || '';
                            const description = parts[2] && parts[2] !== '' ? parts[2] : null;
                            const document_type = parts[3] && parts[3] !== '' ? parts[3] : null;
                            const document_content = parts[4] ? parseInt(parts[4]) : 0;
                            const content_editor_text = parts[5] && parts[5] !== '' ? parts[5] : null;
                            const url = parts[6] && parts[6] !== '' ? parts[6] : null;
                            const grc_contact = parts[7] ? parts[7] : 'N/A';
                            const policy_reviewer_contact = parts[8] ? parts[8] : 'N/A';
                            const tags = parts[9] && parts[9] !== '' ? parts[9] : null;
                            const published_date = (parts[10] && isValidDate(parts[10])) ? parts[10] : new Date().toISOString();
                            const next_review_date = (parts[11] && isValidDate(parts[11])) ? parts[11] : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
                            const policy_labels = parts[12] && parts[12] !== '' ? parts[12] : null;
                            const related_projects = parts[13] && parts[13] !== '' ? parts[13] : null;
                            const status = parts[14] ? parseInt(parts[14]) : 0;
                            const version = parts[15] && parts[15] !== '' ? parts[15] : '1.0';
                            const custom_roles = parts[16] && parts[16] !== '' ? parts[16] : null;
                            const related_documents = parts[17] && parts[17] !== '' ? parts[17] : null;
                            const owner_name = parts[18] && parts[18] !== '' ? parts[18] : null;
                            
                            // Validate enum values
                            if (![0, 1, 2].includes(document_content)) {
                                console.warn(`Invalid document_content: ${parts[4]}, using 0`);
                            }
                            if (![0, 1].includes(status)) {
                                console.warn(`Invalid status: ${parts[14]}, using 0`);
                            }

                            const policyData: PolicyDocumentCreate = {
                                name,
                                description,
                                document_type,
                                document_content: document_content as DocumentContentType,
                                content_editor_text,
                                url,
                                grc_contact,
                                policy_reviewer_contact,
                                tags,
                                published_date,
                                next_review_date,
                                policy_labels,
                                related_projects,
                                status: status as PolicyStatus,
                                version,
                                policy_portal_permissions: 'private',
                                custom_roles,
                                related_documents,
                                owner: owner_name,
                                policy_doc_link: url,
                            };
                            
                            return { id: policyId, data: policyData };
                        } catch (parseErr) {
                            console.error('Error parsing policy row:', line, parseErr);
                            return null;
                        }
                    })
                    .filter((p): p is Array<{id: string | null; data: PolicyDocumentCreate}>[number] => p !== null);

                // Separate into new policies and updates based on ID
                const policyIdMap = new Map(policies.map(p => [p.id, p]));
                const newPolicies = parsedPolicies.filter(p => !p.id || !policyIdMap.has(p.id)).map(p => p.data);
                const policiesToUpdate = parsedPolicies
                    .filter(p => p.id && policyIdMap.has(p.id))
                    .map(p => ({
                        id: p.id!,
                        data: p.data as PolicyDocumentUpdate
                    }));

                setImportData({ newPolicies, policiesToUpdate, duplicateNames: [] });
                setModalState({ type: 'import' });
            } catch (err) {
                alert('Failed to parse CSV file.');
                console.error(err);
            }
        };
        reader.readAsText(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleConfirmImport = async () => {
        const hasNewPolicies = importData.newPolicies.length > 0;
        const hasUpdatePolicies = importData.policiesToUpdate.length > 0;

        if (!hasNewPolicies && !hasUpdatePolicies) return;

        setImportLoading(true);
        try {
            // Add new policies
            const addResults = hasNewPolicies 
                ? await Promise.allSettled(importData.newPolicies.map(p => SupabaseService.addPolicy(p)))
                : [];

            // Update existing policies
            const updateResults = hasUpdatePolicies
                ? await Promise.allSettled(importData.policiesToUpdate.map(p => SupabaseService.updatePolicy(p.id, p.data)))
                : [];

            // Combine results
            const allResults = [...addResults, ...updateResults];
            const failed = allResults.filter(r => r.status === 'rejected');

            if (failed.length > 0) {
                const errorMessages = failed.map((r: any) => r.reason?.message || r.reason?.toString()).join(', ');
                setError(`Failed to import ${failed.length} policies: ${errorMessages}`);
                console.error('Failed imports:', failed);
                setImportLoading(false);
                return;
            }

            await SupabaseService.logAllActivity({
                action: 'Bulk Imported/Updated Policies',
                module: 'Governance',
                event_data: { 
                    addedCount: importData.newPolicies.length, 
                    updatedCount: importData.policiesToUpdate.length 
                }
            });
            setModalState({ type: null });
            setImportData({ newPolicies: [], policiesToUpdate: [], duplicateNames: [] });
            setError(null);
            setImportLoading(false);
            fetchPolicies();
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            setError(`Failed to import policies: ${errorMsg}`);
            console.error('Import error:', err);
            setImportLoading(false);
        }
    };

    const handleExportCSV = () => {
        const headers = ['id', 'name', 'description', 'document_type', 'document_content', 'content_editor_text', 'url', 'grc_contact', 'policy_reviewer_contact', 'tags', 'published_date', 'next_review_date', 'policy_labels', 'related_projects', 'status', 'version', 'custom_roles', 'related_documents', 'owner_name', 'created_at'];
        const csvContent = [
            headers.join(','),
            ...filteredAndSortedPolicies.map(policy =>
                [
                    `"${(policy.id || '').replace(/"/g, '""')}"`,
                    `"${(policy.name || '').replace(/"/g, '""')}"`,
                    `"${(policy.description || '').replace(/"/g, '""')}"`,
                    `"${(policy.document_type || '').replace(/"/g, '""')}"`,
                    `"${(policy.document_content || '').toString().replace(/"/g, '""')}"`,
                    `"${(policy.content_editor_text || '').replace(/"/g, '""')}"`,
                    `"${(policy.url || '').replace(/"/g, '""')}"`,
                    `"${(policy.grc_contact || '').replace(/"/g, '""')}"`,
                    `"${(policy.policy_reviewer_contact || '').replace(/"/g, '""')}"`,
                    `"${(policy.tags || '').replace(/"/g, '""')}"`,
                    `"${(policy.published_date || '').replace(/"/g, '""')}"`,
                    `"${(policy.next_review_date || '').replace(/"/g, '""')}"`,
                    `"${(policy.policy_labels || '').replace(/"/g, '""')}"`,
                    `"${(policy.related_projects || '').replace(/"/g, '""')}"`,
                    `"${(policy.status || '').replace(/"/g, '""')}"`,
                    `"${(policy.version || '').replace(/"/g, '""')}"`,
                    `"${(policy.custom_roles || '').replace(/"/g, '""')}"`,
                    `"${(policy.related_documents || '').replace(/"/g, '""')}"`,
                    `"${(policy.owner_name || '').replace(/"/g, '""')}"`,
                    `"${(policy.created_at || '').replace(/"/g, '""')}"`,
                ].join(',')
            ),
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `policies-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    const handleSavePolicy = async (formData: PolicyDocumentCreate | PolicyDocumentUpdate, documentFile?: File | null) => {
        try {
            // Validate and clean the data before saving
            const cleanData: any = { ...formData };
            
            // For adding: Policy ID is required and must be manually provided
            if (modalState.type === 'add') {
                if (!cleanData.id || cleanData.id.trim() === '') {
                    throw new Error('Policy ID is required');
                }
            }
            
            // Ensure status is a valid integer (0 or 1)
            cleanData.status = parseInt(String(cleanData.status)) || 0;
            if (![0, 1].includes(cleanData.status)) {
                cleanData.status = 0;
            }
            
            // Ensure document_content is a valid integer (0, 1, or 2)
            cleanData.document_content = parseInt(String(cleanData.document_content)) || 0;
            if (![0, 1, 2].includes(cleanData.document_content)) {
                cleanData.document_content = 0;
            }
            
            // Remove empty strings and convert to null
            Object.keys(cleanData).forEach(key => {
                if (cleanData[key] === '') {
                    cleanData[key] = null;
                }
            });
            
            // Ensure required text fields have at least some content
            if (!cleanData.name || cleanData.name.trim() === '') {
                throw new Error('Policy name is required');
            }
            
            const dataToSave: PolicyDocumentCreate | PolicyDocumentUpdate = cleanData;

            if (dataToSave.document_content === 1 && documentFile) { // Attachment
                dataToSave.url = await SupabaseService.uploadFile(documentFile, 'policies');
            } else if (dataToSave.document_content === 0) { // Content
                dataToSave.url = null;
            }
            
            if (modalState.type === 'edit' && modalState.policy) {
                const updatedPolicy = await SupabaseService.updatePolicy(modalState.policy.id, dataToSave);
                await SupabaseService.logAllActivity({
                    action: 'Updated Policy',
                    module: 'Governance',
                    entity_id: updatedPolicy.id,
                    entity_name: updatedPolicy.name,
                    event_data: { changes: dataToSave }
                });
            } else if (modalState.type === 'add') {
                console.log('Adding policy with data:', dataToSave);
                const addedPolicy = await SupabaseService.addPolicy(dataToSave as PolicyDocumentCreate);
                await SupabaseService.logAllActivity({
                    action: 'Created Policy',
                    module: 'Governance',
                    entity_id: addedPolicy.id,
                    entity_name: addedPolicy.name,
                    event_data: { details: dataToSave }
                });
            }
            fetchPolicies();
            closeModal();
        } catch (err) {
            let errorMsg = 'Unknown error';
            if (err instanceof Error) {
                errorMsg = err.message;
            } else if (typeof err === 'object' && err !== null) {
                errorMsg = JSON.stringify(err);
            } else {
                errorMsg = String(err);
            }
            setError(`Failed to save policy: ${errorMsg}`);
            console.error('Policy save error:', err, 'Data attempted:', formData);
        }
    };
    
    const handleDeletePolicy = async () => {
        if (modalState.type === 'delete' && modalState.policy) {
            try {
                await SupabaseService.deletePolicy(modalState.policy.id);
                await SupabaseService.logAllActivity({
                    action: 'Deleted Policy',
                    module: 'Governance',
                    entity_id: modalState.policy.id,
                    entity_name: modalState.policy.name
                });
                fetchPolicies();
                closeModal();
            } catch (err) {
                setError('Failed to delete policy.');
            }
        }
    };
    
    const policyStatusStyles: Record<PolicyStatus, string> = {
        0: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300', // Draft
        1: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300', // Published
    };

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                 <div className="w-full sm:w-1/3">
                    <input 
                        type="text"
                        placeholder="Filter policies..."
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        aria-label="Filter policies"
                    />
                </div>
                <div className="flex space-x-2">
                    <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} title="Import CSV" className="p-2 text-gray-400 hover:text-green-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        <UploadIcon className="h-5 w-5" />
                    </button>
                    <button onClick={handleExportCSV} title="Export CSV" className="p-2 text-gray-400 hover:text-purple-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        <DownloadIcon className="h-5 w-5" />
                    </button>
                    <button onClick={() => setModalState({ type: 'add' })} title="Add Policy" className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        <PlusIcon className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4 dark:bg-red-900 dark:border-red-700 dark:text-red-200" role="alert">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="ml-4 font-bold">×</button>
            </div>}

            <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg dark:border-gray-700">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                                    <button onClick={() => requestSort('id')} className="flex items-center w-full text-left focus:outline-none">
                                        Policy ID {getSortIconFor('id')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                                    <button onClick={() => requestSort('name')} className="flex items-center w-full text-left focus:outline-none">
                                        Name {getSortIconFor('name')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                                    <button onClick={() => requestSort('status')} className="flex items-center w-full text-left focus:outline-none">
                                        Status {getSortIconFor('status')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                                    <button onClick={() => requestSort('created_at')} className="flex items-center w-full text-left focus:outline-none">
                                        Created Date {getSortIconFor('created_at')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                                    <button onClick={() => requestSort('version')} className="flex items-center w-full text-left focus:outline-none">
                                        Version {getSortIconFor('version')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                                    <button onClick={() => requestSort('document_type')} className="flex items-center w-full text-left focus:outline-none">
                                        Document Type {getSortIconFor('document_type')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Actions</th>
                            </tr>
                        </thead>
                         <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={5} className="text-center py-4 text-gray-500 dark:text-gray-400">Loading policies...</td></tr>
                            ) : filteredAndSortedPolicies.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-4 text-gray-500 dark:text-gray-400">No policies found.</td></tr>
                            ) : filteredAndSortedPolicies.map(policy => (
                                <tr key={policy.id}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-mono text-gray-500 dark:text-gray-400">{policy.id?.substring(0, 8)}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900 dark:text-white">{policy.name}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap"><StatusBadge status={policy.status} colorMap={policyStatusStyles} /></td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{policy.created_at ? new Date(policy.created_at).toLocaleDateString() : 'N/A'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{policy.version}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{policy.document_type || 'N/A'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end items-center space-x-2">

                                            {policy.url && <a href={policy.url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-500" title="View URL"><DownloadIcon className="h-5 w-5" /></a>}
                                            <button onClick={() => setModalState({ type: 'view', policy })} className="text-gray-400 hover:text-green-500"><EyeIcon className="h-5 w-5" /></button>
                                            <button onClick={() => setModalState({ type: 'edit', policy })} className="text-gray-400 hover:text-yellow-500"><PencilIcon className="h-5 w-5" /></button>
                                            <button onClick={() => setModalState({ type: 'delete', policy })} className="text-gray-400 hover:text-red-500"><TrashIcon className="h-5 w-5" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <PolicyModal
                isOpen={modalState.type === 'add' || modalState.type === 'edit' || modalState.type === 'view'}
                onClose={closeModal}
                onSave={handleSavePolicy}
                policyToEdit={modalState.policy || null}
                mode={modalState.type as 'add' | 'edit' | 'view'}
            />
             <DeleteConfirmationModal
                isOpen={modalState.type === 'delete'}
                onClose={closeModal}
                onConfirm={handleDeletePolicy}
                itemName="policy"
            />
            <Modal isOpen={modalState.type === 'import'} onClose={closeModal} title="Import CSV Preview">
                <div className="space-y-4">
                    {error && <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded text-sm dark:bg-red-900 dark:border-red-700 dark:text-red-200">
                        {error}
                    </div>}
                    <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">New Policies to Import ({importData.newPolicies.length})</h4>
                        {importData.newPolicies.length > 0 ? (
                            <div className="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-md p-3">
                                {importData.newPolicies.map((policy, idx) => (
                                    <div key={idx} className="py-2 px-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0 text-sm dark:text-gray-300">
                                        <div className="font-medium">{policy.name}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">Version: {policy.version} | Type: {policy.document_type || 'N/A'}</div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-gray-500 dark:text-gray-400 text-sm">No new policies to import.</div>
                        )}
                    </div>
                    {importData.policiesToUpdate.length > 0 && (
                        <div>
                            <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">Existing Policies to Update ({importData.policiesToUpdate.length})</h4>
                            <div className="max-h-48 overflow-y-auto border border-blue-200 dark:border-blue-700 rounded-md p-3 bg-blue-50 dark:bg-gray-800">
                                {importData.policiesToUpdate.map((item, idx) => {
                                    const policy = policies.find(p => p.id === item.id);
                                    const newName = item.data.name;
                                    const oldName = policy?.name;
                                    return (
                                        <div key={idx} className="py-2 px-2 text-sm text-blue-800 dark:text-blue-200 border-b border-blue-100 dark:border-blue-900 last:border-b-0">
                                            <div className="font-medium">{oldName}</div>
                                            {oldName !== newName && (
                                                <div className="text-xs text-blue-600 dark:text-blue-300">→ {newName}</div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
                <div className="mt-6 flex justify-end space-x-3">
                    <button onClick={closeModal} disabled={importLoading} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed">Cancel</button>
                    <button onClick={handleConfirmImport} disabled={(importData.newPolicies.length === 0 && importData.policiesToUpdate.length === 0) || importLoading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed">
                        {importLoading ? 'Importing...' : `Import ${importData.newPolicies.length + importData.policiesToUpdate.length} Record${importData.newPolicies.length + importData.policiesToUpdate.length !== 1 ? 's' : ''}`}
                    </button>
                </div>
            </Modal>
        </div>
    );
};

interface PolicyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (policy: PolicyDocumentCreate | PolicyDocumentUpdate, documentFile?: File | null) => void;
    policyToEdit: PolicyDocument | null;
    mode: 'add' | 'edit' | 'view';
}
const PolicyModal: React.FC<PolicyModalProps> = ({ isOpen, onClose, onSave, policyToEdit, mode }) => {
    const today = new Date().toISOString().split('T')[0];
    const [formData, setFormData] = useState<Partial<PolicyDocumentCreate> & { id?: string }>({});
    const [documentFile, setDocumentFile] = useState<File | null>(null);
    const isViewMode = mode === 'view';

    const defaultState: Partial<PolicyDocumentCreate> & { id?: string } = {
        id: '',
        name: '',
        description: '',
        status: 0,
        version: '1.0',
        document_content: 0,
        content_editor_text: '',
        url: '',
        grc_contact: '',
        policy_reviewer_contact: '',
        published_date: today,
        next_review_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
        policy_portal_permissions: 'private',
        tags: '',
        policy_labels: '',
        related_projects: '',
        custom_roles: '',
        related_documents: '',
        document_type: '',
        owner: '',
        policy_doc_link: '',
    };
    
    useEffect(() => {
        if (policyToEdit) {
            const { 
                id, name, description, document_content, content_editor_text, url, grc_contact,
                policy_reviewer_contact, tags, published_date, next_review_date, policy_labels,
                related_projects, status, document_type, version, policy_portal_permissions,
                custom_roles, related_documents, owner_name
            } = policyToEdit;
            setFormData({
                id, name, description, document_content, content_editor_text, url, grc_contact,
                policy_reviewer_contact, tags, published_date, next_review_date, policy_labels,
                related_projects, status, document_type, version, policy_portal_permissions,
                custom_roles, related_documents, owner: owner_name || '', policy_doc_link: url || ''
            });
        } else {
            setFormData(defaultState);
        }
        setDocumentFile(null);
    }, [policyToEdit, isOpen, mode]);

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        const isNumeric = ['status', 'document_content'].includes(name);
        setFormData(prev => ({ ...prev, [name]: isNumeric ? Number(value) : value }));
    };

     const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setDocumentFile(e.target.files[0]);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData as PolicyDocumentCreate, documentFile);
    };

    const title = mode === 'add' ? 'Add New Policy' : mode === 'edit' ? 'Edit Policy' : 'View Policy';
    const renderInputField = (label: string, name: keyof PolicyDocumentCreate, type: string = 'text', required: boolean = false, placeholder: string = '') => (
        <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
            <input type={type} name={name} value={String(formData[name] ?? '')} onChange={handleChange} readOnly={isViewMode} required={required} placeholder={placeholder}
                   className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Policy ID</label>
                        <input 
                            type="text" 
                            name="id"
                            value={formData.id || ''} 
                            onChange={handleChange}
                            readOnly={mode === 'edit' || isViewMode}
                            required={mode === 'add'}
                            placeholder="Enter Policy ID"
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
                        />
                    </div>
                    <div></div>
                    
                    {renderInputField('Name', 'name', 'text', true)}
                    {renderInputField('Version', 'version', 'text', true)}
                    
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                        <textarea name="description" value={formData.description || ''} onChange={handleChange} readOnly={isViewMode} required rows={3} 
                                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"></textarea>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Document Content</label>
                        <select name="document_content" value={formData.document_content} onChange={handleChange} disabled={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value={0}>Use Content</option>
                            <option value={1}>Use Attachments</option>
                            <option value={2}>Use URL</option>
                        </select>
                    </div>
                    <div></div>

                    {formData.document_content === 0 && <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Content Editor Text</label>
                        <textarea name="content_editor_text" value={formData.content_editor_text || ''} onChange={handleChange} readOnly={isViewMode} required rows={5} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"></textarea>
                    </div>}

                    {formData.document_content === 1 && <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Attachment</label>
                        {!isViewMode && <input type="file" accept=".doc,.docx,.pdf" onChange={handleFileChange} className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900 dark:text-blue-300 dark:hover:file:bg-blue-800"/>}
                        {documentFile && <p className="text-xs mt-1 dark:text-gray-400">Selected: {documentFile.name}</p>}
                        {policyToEdit?.url && (
                             <a href={policyToEdit.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">View Current Document</a>
                        )}
                    </div>}

                    {formData.document_content === 2 && <div className="md:col-span-2">
                         {renderInputField('URL', 'url', 'url', true)}
                    </div>}

                    {renderInputField('GRC Contact', 'grc_contact', 'text', true, 'User-admin|Group-Admins')}
                    {renderInputField('Policy Reviewer Contact', 'policy_reviewer_contact', 'text', true, 'User-jane|Group-Reviewers')}
                    
                    {renderInputField('Tags', 'tags', 'text', true, 'Critical|SOX|PCI')}
                    {renderInputField('Policy Labels', 'policy_labels', 'text', true)}

                    {renderInputField('Owner', 'owner', 'text', true)}
                    {renderInputField('PolicyDocLink', 'policy_doc_link', 'url', false)}

                    {renderInputField('CreatedDate', 'published_date', 'date', true)}
                    {renderInputField('RefreshDate', 'next_review_date', 'date', true)}
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                        <select name="status" value={formData.status ?? 0} onChange={handleChange} disabled={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                           <option value={0}>Draft</option>
                           <option value={1}>Published</option>
                        </select>
                    </div>
                    {renderInputField('Document Type', 'document_type', 'text', true)}
                    
                    {renderInputField('Related Projects', 'related_projects', 'text', true, 'Project A|Project B')}
                    {renderInputField('Related Documents', 'related_documents', 'text', true, 'Doc 1|Doc 2')}
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Portal Permissions</label>
                        <select name="policy_portal_permissions" value={formData.policy_portal_permissions} onChange={handleChange} disabled={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                           <option value="public">Public</option><option value="private">Private</option><option value="custom-roles">Custom Roles</option>
                        </select>
                    </div>

                    {formData.policy_portal_permissions === 'custom-roles' && 
                        renderInputField('Custom Roles', 'custom_roles', 'text', true, 'Owners|Collaborators')
                    }
                </div>
                {!isViewMode && (
                <div className="mt-6 flex justify-end space-x-3">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>
                    <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700">Save</button>
                </div>
                )}
            </form>
        </Modal>
    );
};

// --- GOVERNANCE: VULNERABILITY ---
const VulnerabilitiesView: React.FC = () => {
    const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [modalState, setModalState] = useState<{ type: 'add' | 'edit' | 'view' | 'delete' | null; vulnerability?: Vulnerability | null }>({ type: null });
    const [filter, setFilter] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof Vulnerability; direction: 'ascending' | 'descending' } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const vulnerabilityStatusStyles: Record<VulnerabilityStatus, string> = {
        'Planned': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
        'Remediated': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
        'NA': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    };

    const fetchVulnerabilities = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await SupabaseService.getVulnerabilities();
            setVulnerabilities(data);
        } catch (e) {
            setError("Failed to load vulnerabilities.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchVulnerabilities();
    }, [fetchVulnerabilities]);

    const filteredAndSortedVulnerabilities = useMemo(() => {
        let filteredItems = [...vulnerabilities];
        if (filter) {
            const lowerCaseFilter = filter.toLowerCase();
            filteredItems = filteredItems.filter(item =>
                item.name.toLowerCase().includes(lowerCaseFilter) ||
                (item.description && item.description.toLowerCase().includes(lowerCaseFilter)) ||
                (item.assets?.name && item.assets.name.toLowerCase().includes(lowerCaseFilter)) ||
                (item.assets?.asset_id && item.assets.asset_id.toLowerCase().includes(lowerCaseFilter))
            );
        }

        if (sortConfig !== null) {
            filteredItems.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];
                if (aValue === null || aValue === undefined) return 1;
                if (bValue === null || bValue === undefined) return -1;

                if (aValue < bValue) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return filteredItems;
    }, [vulnerabilities, filter, sortConfig]);

    const requestSort = (key: keyof Vulnerability) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const getSortIconFor = (key: keyof Vulnerability) => {
        if (!sortConfig || sortConfig.key !== key) {
            return <SortUpDownIcon className="h-4 w-4 ml-1 text-gray-400" />;
        }
        return sortConfig.direction === 'ascending' ? <SortUpIcon className="h-4 w-4 ml-1" /> : <SortDownIcon className="h-4 w-4 ml-1" />;
    };

    const closeModal = () => setModalState({ type: null });

    const handleSaveVulnerability = async (formData: VulnerabilityCreate | VulnerabilityUpdate) => {
        try {
            if (modalState.type === 'edit' && modalState.vulnerability) {
                const updatedVulnerability = await SupabaseService.updateVulnerability(modalState.vulnerability.id, formData);
                await SupabaseService.logAllActivity({
                    action: 'Updated Vulnerability',
                    module: 'Governance',
                    entity_id: updatedVulnerability.id,
                    entity_name: updatedVulnerability.name,
                    event_data: { changes: formData }
                });
            } else if (modalState.type === 'add') {
                const addedVulnerability = await SupabaseService.addVulnerability(formData as VulnerabilityCreate);
                await SupabaseService.logAllActivity({
                    action: 'Created Vulnerability',
                    module: 'Governance',
                    entity_id: addedVulnerability.id,
                    entity_name: addedVulnerability.name,
                    event_data: { details: formData }
                });
            }
            fetchVulnerabilities();
            closeModal();
        } catch (err) {
            setError('Failed to save vulnerability.');
        }
    };

    const handleDeleteVulnerability = async () => {
        if (modalState.type === 'delete' && modalState.vulnerability) {
            try {
                await SupabaseService.deleteVulnerability(modalState.vulnerability.id);
                await SupabaseService.logAllActivity({
                    action: 'Deleted Vulnerability',
                    module: 'Governance',
                    entity_id: modalState.vulnerability.id,
                    entity_name: modalState.vulnerability.name
                });
                fetchVulnerabilities();
                closeModal();
            } catch (err) {
                setError('Failed to delete vulnerability.');
            }
        }
    };

    const handleImportCSV = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            if (!text) return;
            const validSources: VulnerabilitySource[] = ['KEV', 'Scanning', 'PT', 'Reported-Ext'];
            const validStatuses: VulnerabilityStatus[] = ['Planned', 'Remediated', 'NA'];
            const lines = text.split('\n').slice(1);
            const newVulns: VulnerabilityCreate[] = lines
                .map((line): VulnerabilityCreate | null => {
                    const [name, description, derived_from, status] = line.split(',').map(s => s ? s.trim() : '');
                    if (!name || !derived_from || !status) return null;
                    if (!validSources.includes(derived_from as VulnerabilitySource)) return null;
                    if (!validStatuses.includes(status as VulnerabilityStatus)) return null;
                    return { name, description: description || null, derived_from: derived_from as VulnerabilitySource, status: status as VulnerabilityStatus, asset_id: null };
                })
                .filter((v): v is VulnerabilityCreate => v !== null);
            if (newVulns.length > 0) {
                try {
                    for (const v of newVulns) await SupabaseService.addVulnerability(v);
                    await SupabaseService.logAllActivity({ action: 'Bulk Imported Vulnerabilities', module: 'Governance', event_data: { count: newVulns.length } });
                    alert(`${newVulns.length} vulnerabilities imported successfully!`);
                    fetchVulnerabilities();
                } catch (err) {
                    alert('Failed to import vulnerabilities.');
                }
            }
        };
        reader.readAsText(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleExportCSV = () => {
        const headers = ['name', 'description', 'derived_from', 'status', 'asset_name', 'asset_id'];
        const csvContent = [
            headers.join(','),
            ...filteredAndSortedVulnerabilities.map(v =>
                [
                    `"${(v.name || '').replace(/"/g, '""')}"`,
                    `"${(v.description || '').replace(/"/g, '""')}"`,
                    v.derived_from,
                    v.status,
                    `"${(v.assets?.name || '').replace(/"/g, '""')}"`,
                    v.assets?.asset_id || '',
                ].join(',')
            ),
        ].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `vulnerabilities-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                <div className="w-full sm:w-1/3">
                    <input
                        type="text"
                        placeholder="Filter vulnerabilities..."
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        aria-label="Filter vulnerabilities"
                    />
                </div>
                <div className="flex space-x-2">
                    <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} title="Import CSV" className="p-2 text-gray-400 hover:text-green-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        <UploadIcon className="h-5 w-5" />
                    </button>
                    <button onClick={handleExportCSV} title="Export CSV" className="p-2 text-gray-400 hover:text-purple-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        <DownloadIcon className="h-5 w-5" />
                    </button>
                    <button onClick={() => setModalState({ type: 'add' })} title="Add Vulnerability" className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        <PlusIcon className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}

            <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg dark:border-gray-700">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('name')} className="flex items-center w-full text-left focus:outline-none">Name {getSortIconFor('name')}</button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Associated Asset</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('derived_from')} className="flex items-center w-full text-left focus:outline-none">Source {getSortIconFor('derived_from')}</button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('status')} className="flex items-center w-full text-left focus:outline-none">Status {getSortIconFor('status')}</button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={5} className="text-center py-4 text-gray-500 dark:text-gray-400">Loading vulnerabilities...</td></tr>
                            ) : filteredAndSortedVulnerabilities.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-4 text-gray-500 dark:text-gray-400">No vulnerabilities found.</td></tr>
                            ) : filteredAndSortedVulnerabilities.map(vuln => (
                                <tr key={vuln.id}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900 dark:text-white">{vuln.name}</div>
                                        <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">{vuln.description}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {vuln.assets ? `${vuln.assets.name} (${vuln.assets.asset_id})` : 'N/A'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{vuln.derived_from}</td>
                                    <td className="px-6 py-4 whitespace-nowrap"><StatusBadge status={vuln.status} colorMap={vulnerabilityStatusStyles} /></td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end items-center space-x-2">
                                            <button onClick={() => setModalState({ type: 'view', vulnerability: vuln })} className="text-gray-400 hover:text-green-500"><EyeIcon className="h-5 w-5" /></button>
                                            <button onClick={() => setModalState({ type: 'edit', vulnerability: vuln })} className="text-gray-400 hover:text-yellow-500"><PencilIcon className="h-5 w-5" /></button>
                                            <button onClick={() => setModalState({ type: 'delete', vulnerability: vuln })} className="text-gray-400 hover:text-red-500"><TrashIcon className="h-5 w-5" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <VulnerabilityModal
                isOpen={modalState.type === 'add' || modalState.type === 'edit' || modalState.type === 'view'}
                onClose={closeModal}
                onSave={handleSaveVulnerability}
                vulnerabilityToEdit={modalState.vulnerability || null}
                mode={modalState.type as 'add' | 'edit' | 'view'}
            />
            <DeleteConfirmationModal isOpen={modalState.type === 'delete'} onClose={closeModal} onConfirm={handleDeleteVulnerability} itemName="vulnerability" />
        </div>
    );
};

interface VulnerabilityModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (vulnerability: VulnerabilityCreate | VulnerabilityUpdate) => void;
    vulnerabilityToEdit: Vulnerability | null;
    mode: 'add' | 'edit' | 'view';
}
const VulnerabilityModal: React.FC<VulnerabilityModalProps> = ({ isOpen, onClose, onSave, vulnerabilityToEdit, mode }) => {
    const [formData, setFormData] = useState<Partial<VulnerabilityCreate>>({});
    const isViewMode = mode === 'view';
    const [allAssets, setAllAssets] = useState<Asset[]>([]);
    const [assetSearchText, setAssetSearchText] = useState('');
    const [showAssetSuggestions, setShowAssetSuggestions] = useState(false);
    const autocompleteRef = useRef<HTMLDivElement>(null);

    const vulnerabilitySources: VulnerabilitySource[] = ['KEV', 'Scanning', 'PT', 'Reported-Ext'];

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (autocompleteRef.current && !autocompleteRef.current.contains(event.target as Node)) {
                setShowAssetSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isOpen) {
            SupabaseService.getAssets().then(setAllAssets);
        }
    }, [isOpen]);

    useEffect(() => {
        if (vulnerabilityToEdit) {
            const { name, description, derived_from, status, asset_id } = vulnerabilityToEdit;
            setFormData({ name, description, derived_from, status, asset_id });

            if (vulnerabilityToEdit.asset_id && allAssets.length > 0) {
                const linkedAsset = allAssets.find(a => a.id === vulnerabilityToEdit.asset_id);
                if (linkedAsset) {
                    setAssetSearchText(`${linkedAsset.name} (${linkedAsset.asset_id})`);
                }
            } else {
                setAssetSearchText('');
            }
        } else {
            setFormData({ name: '', description: '', derived_from: 'Scanning', status: 'Planned', asset_id: null });
            setAssetSearchText('');
        }
    }, [vulnerabilityToEdit, isOpen, allAssets]);

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleAssetSelect = (asset: Asset) => {
        setFormData(prev => ({ ...prev, asset_id: asset.id }));
        setAssetSearchText(`${asset.name} (${asset.asset_id})`);
        setShowAssetSuggestions(false);
    };

    const filteredAssets = useMemo(() => {
        if (!assetSearchText) return [];
        const selectedAsset = allAssets.find(a => a.id === formData.asset_id);
        if (selectedAsset && assetSearchText === `${selectedAsset.name} (${selectedAsset.asset_id})`) {
            return [];
        }
        return allAssets.filter(asset =>
            asset.name.toLowerCase().includes(assetSearchText.toLowerCase()) ||
            asset.asset_id.toLowerCase().includes(assetSearchText.toLowerCase())
        );
    }, [assetSearchText, allAssets, formData.asset_id]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData as VulnerabilityCreate | VulnerabilityUpdate);
    };

    const title = mode === 'add' ? 'Add New Vulnerability' : mode === 'edit' ? 'Edit Vulnerability' : 'View Vulnerability';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
                        <input type="text" name="name" value={formData.name || ''} onChange={handleChange} readOnly={isViewMode} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                        <textarea name="description" value={formData.description || ''} onChange={handleChange} readOnly={isViewMode} rows={3} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"></textarea>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Source (Derived From)</label>
                        <select name="derived_from" value={formData.derived_from} onChange={handleChange} disabled={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                           {vulnerabilitySources.map(source => (
                               <option key={source} value={source}>{source}</option>
                           ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                        <select name="status" value={formData.status} onChange={handleChange} disabled={isViewMode} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                           <option>Planned</option><option>Remediated</option><option>NA</option>
                        </select>
                    </div>
                    <div className="md:col-span-2" ref={autocompleteRef}>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Associated Asset</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={assetSearchText}
                                onChange={e => {
                                    setAssetSearchText(e.target.value);
                                    setFormData(prev => ({ ...prev, asset_id: null }));
                                    if (!showAssetSuggestions) setShowAssetSuggestions(true);
                                }}
                                onFocus={() => setShowAssetSuggestions(true)}
                                placeholder="Search by asset name or ID"
                                readOnly={isViewMode}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            />
                            {!isViewMode && showAssetSuggestions && filteredAssets.length > 0 && (
                                <ul className="absolute z-10 w-full bg-white dark:bg-gray-800 border rounded-md mt-1 max-h-40 overflow-y-auto shadow-lg">
                                    {filteredAssets.map(asset => (
                                        <li key={asset.id} onClick={() => handleAssetSelect(asset)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-900 dark:text-gray-200">
                                            {asset.name} ({asset.asset_id})
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
                {!isViewMode && (
                    <div className="mt-6 flex justify-end space-x-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>
                        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700">Save</button>
                    </div>
                )}
            </form>
        </Modal>
    );
};

// --- RISK TAB ---
const RiskTab: React.FC = () => (
    <div className="px-4 py-6 sm:px-0 text-center">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Risk Management</h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Risk management features are under development and will be available soon.</p>
    </div>
);

// --- COMPLIANCE TAB ---
const ComplianceTab: React.FC = () => {
    const [compliances, setCompliances] = useState<Compliance[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string|null>(null);
    const [modalState, setModalState] = useState<{ type: 'view' | null; compliance?: Compliance | null }>({ type: null });
    const [selectedFramework, setSelectedFramework] = useState<string>('All Frameworks');
    const [sortConfig, setSortConfig] = useState<{ key: keyof Compliance; direction: 'ascending' | 'descending' } | null>(null);

    const complianceStatusStyles: Record<ComplianceStatus, string> = {
        'Achieved': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
        'In Progress': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
        'Not Started': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    };

    const fetchCompliances = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await SupabaseService.getCompliances();
            setCompliances(data);
        } catch(e) {
            setError("Failed to load compliance frameworks.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCompliances();
    }, [fetchCompliances]);

    const uniqueFrameworks = useMemo(() => {
        return ['All Frameworks', ...Array.from(new Set(compliances.map(c => c.framework)))];
    }, [compliances]);
    
    const filteredAndSortedCompliances = useMemo(() => {
        let filteredItems = [...compliances];
        
        if (selectedFramework !== 'All Frameworks') {
            filteredItems = filteredItems.filter(item => item.framework === selectedFramework);
        }
        
        if (sortConfig !== null) {
            filteredItems.sort((a, b) => {
                let aValue: any = a[sortConfig.key];
                let bValue: any = b[sortConfig.key];
                
                if (sortConfig.key === 'associated_int_ctls') {
                    aValue = a.associated_int_ctls?.length || 0;
                    bValue = b.associated_int_ctls?.length || 0;
                }

                if (aValue === null || aValue === undefined) return 1;
                if (bValue === null || bValue === undefined) return -1;
    
                if (aValue < bValue) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return filteredItems;
    }, [compliances, selectedFramework, sortConfig]);

    const requestSort = (key: keyof Compliance) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };
    
    const getSortIconFor = (key: keyof Compliance) => {
        if (!sortConfig || sortConfig.key !== key) {
            return <SortUpDownIcon className="h-4 w-4 ml-1 text-gray-400" />;
        }
        return sortConfig.direction === 'ascending' ? <SortUpIcon className="h-4 w-4 ml-1" /> : <SortDownIcon className="h-4 w-4 ml-1" />;
    };

    const closeModal = () => setModalState({ type: null });

    return (
        <div className="px-4 py-6 sm:px-0">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">Compliance Frameworks</h2>
            
            <div className="flex flex-wrap gap-2 mb-4">
                {uniqueFrameworks.map(framework => (
                    <button
                        key={framework}
                        onClick={() => setSelectedFramework(framework)}
                        className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors duration-200 ${
                            selectedFramework === framework
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 border dark:border-gray-600'
                        }`}
                    >
                        {framework}
                    </button>
                ))}
            </div>

            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}

            <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg dark:border-gray-700">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                           <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('compliance_id')} className="flex items-center w-full text-left focus:outline-none">
                                        Compliance ID {getSortIconFor('compliance_id')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('framework')} className="flex items-center w-full text-left focus:outline-none">
                                        Framework {getSortIconFor('framework')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('status')} className="flex items-center w-full text-left focus:outline-none">
                                        Status {getSortIconFor('status')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('associated_int_ctls')} className="flex items-center w-full text-left focus:outline-none">
                                        Associated Controls {getSortIconFor('associated_int_ctls')}
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Actions</th>
                            </tr>
                        </thead>
                         <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={5} className="text-center py-4 text-gray-500 dark:text-gray-400">Loading frameworks...</td></tr>
                            ) : filteredAndSortedCompliances.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-4 text-gray-500 dark:text-gray-400">No frameworks found.</td></tr>
                            ) : filteredAndSortedCompliances.map(item => (
                                <tr key={item.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                        <span title={item.description || 'No description available'}>
                                            {item.compliance_id}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900 dark:text-white">{item.framework}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {item.status && <StatusBadge status={item.status} colorMap={complianceStatusStyles} />}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {Array.isArray(item.associated_int_ctls) ? item.associated_int_ctls.length : 0}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end items-center space-x-2">
                                            <button onClick={() => setModalState({ type: 'view', compliance: item })} className="text-gray-400 hover:text-green-500"><EyeIcon className="h-5 w-5" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <ComplianceModal
                isOpen={modalState.type === 'view'}
                onClose={closeModal}
                complianceToView={modalState.compliance || null}
            />
        </div>
    );
};

interface ComplianceModalProps {
    isOpen: boolean;
    onClose: () => void;
    complianceToView: Compliance | null;
}
const ComplianceModal: React.FC<ComplianceModalProps> = ({ isOpen, onClose, complianceToView }) => {

    if (!complianceToView) return null;

    const renderDetail = (label: string, value: string | number | null | undefined) => (
        <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-400">{label}</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{value || 'N/A'}</p>
        </div>
    );
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`View Framework: ${complianceToView.framework}`}>
            <div className="space-y-4">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {renderDetail('Compliance ID', complianceToView.compliance_id)}
                    {renderDetail('Framework', complianceToView.framework)}
                    <div className="md:col-span-2">
                         <label className="block text-sm font-medium text-gray-700 dark:text-gray-400">Description</label>
                         <p className="mt-1 text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{complianceToView.description || 'N/A'}</p>
                    </div>
                     {renderDetail('Status', complianceToView.status)}
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-400">Associated Controls</label>
                        <div className="flex flex-wrap gap-2 p-2 mt-1 border rounded-md min-h-[40px] bg-gray-50 dark:bg-gray-700 dark:border-gray-600">
                            {Array.isArray(complianceToView.associated_int_ctls) && complianceToView.associated_int_ctls.length > 0 ? (
                                complianceToView.associated_int_ctls.map(tag => (
                                    <span key={tag} className="flex items-center gap-1 bg-blue-100 text-blue-800 text-sm font-medium px-2.5 py-0.5 rounded-full dark:bg-blue-900 dark:text-blue-300">
                                        {tag}
                                    </span>
                                ))
                            ) : <p className="text-sm text-gray-500 dark:text-gray-400">No controls associated.</p>}
                        </div>
                    </div>
                 </div>
            </div>
        </Modal>
    );
};

// --- CYBER GRAPH COMPONENT (Interactive SVG Force Layout) ---
interface GraphNode {
  id: string;
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GraphLink {
  source: string;
  target: string;
  label: string;
}

const CyberGraph: React.FC<{ data: { nodes: any[], links: GraphLink[] } }> = ({ data }) => {
  const canvasRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const width = 800;
  const height = 600;

  useEffect(() => {
    // Initial node positioning
        const initialNodes: GraphNode[] = data.nodes.map((n, i) => ({
            ...(n as any),
            x: width / 2 + (Math.random() - 0.5) * 400,
            y: height / 2 + (Math.random() - 0.5) * 400,
            vx: 0,
            vy: 0
        } as GraphNode));
    setNodes(initialNodes);
    setLinks(data.links);
  }, [data]);

  useEffect(() => {
    let animationFrameId: number;
    const simulate = () => {
      setNodes(prevNodes => {
        const nextNodes = prevNodes.map(n => ({ ...n }));
        const nodeMap = new Map<string, GraphNode>(nextNodes.map(n => [n.id, n] as [string, GraphNode]));

        // Forces
        const k = 0.05; // attraction
        const r = 1000; // repulsion
        const centerK = 0.01;

        // 1. Repulsion (between all pairs)
        for (let i = 0; i < nextNodes.length; i++) {
          for (let j = i + 1; j < nextNodes.length; j++) {
            const dx = nextNodes[i].x - nextNodes[j].x;
            const dy = nextNodes[i].y - nextNodes[j].y;
            const distSq = dx * dx + dy * dy + 0.1;
            const dist = Math.sqrt(distSq);
            if (dist < 200) {
              const force = r / distSq;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;
              nextNodes[i].vx += fx;
              nextNodes[i].vy += fy;
              nextNodes[j].vx -= fx;
              nextNodes[j].vy -= fy;
            }
          }
        }

        // 2. Attraction (along links)
                links.forEach((l: GraphLink) => {
                    const s = nodeMap.get(l.source);
                    const t = nodeMap.get(l.target);
                    if (s && t) {
                        const dx = t.x - s.x;
                        const dy = t.y - s.y;
                        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
                        const force = (dist - 100) * k;
                        const fx = (dx / dist) * force;
                        const fy = (dy / dist) * force;
                        s.vx += fx;
                        s.vy += fy;
                        t.vx -= fx;
                        t.vy -= fy;
                    }
                });

        // 3. Center gravity & dampening
        nextNodes.forEach(n => {
          n.vx += (width / 2 - n.x) * centerK;
          n.vy += (height / 2 - n.y) * centerK;
          n.vx *= 0.9;
          n.vy *= 0.9;
          n.x += n.vx;
          n.y += n.vy;
          
          // Constrain to bounds
          n.x = Math.max(20, Math.min(width - 20, n.x));
          n.y = Math.max(20, Math.min(height - 20, n.y));
        });

        return nextNodes;
      });
      animationFrameId = requestAnimationFrame(simulate);
    };

    if (nodes.length > 0) {
      animationFrameId = requestAnimationFrame(simulate);
    }
    return () => cancelAnimationFrame(animationFrameId);
  }, [links, nodes.length]);

  return (
    <div className="w-full h-full relative overflow-hidden bg-white rounded-lg">
      <svg ref={canvasRef} viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="15" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#cbd5e1" />
          </marker>
        </defs>
        {/* Links */}
        {links.map((link, i) => {
          const s = nodes.find(n => n.id === link.source);
          const t = nodes.find(n => n.id === link.target);
          if (!s || !t) return null;
          return (
            <g key={i}>
              <line x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="#e2e8f0" strokeWidth="1" markerEnd="url(#arrowhead)" />
            </g>
          );
        })}
        {/* Nodes */}
        {nodes.map((node, i) => (
          <g key={i} className="cursor-pointer group">
            <circle cx={node.x} cy={node.y} r="8" fill="#3b82f6" className="transition-all duration-200 group-hover:scale-125" />
            <text x={node.x} y={node.y - 12} textAnchor="middle" className="text-[10px] font-bold fill-gray-600 group-hover:fill-blue-600 pointer-events-none drop-shadow-sm select-none">
              {node.id}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};

// --- THREAT VIEW TAB ---

const ThreatViewTab: React.FC = () => {
    const [csvData, setCsvData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [systemMsg, setSystemMsg] = useState({ text: 'Select filters and launch an orbit.', color: 'text-green-600 dark:text-green-400' });
    const [filters, setFilters] = useState({ source_type: 'campaign', relationship_type: 'uses', target_type: 'malware' });
    const [graphData, setGraphData] = useState<{ nodes: any[], links: any[] } | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Obtain a short-lived signed URL from Supabase storage and fetch CSV.
                let csvUrl = '';
                try {
                    csvUrl = await SupabaseService.createSignedUrl('ThreatData', 'df33.csv', 60 * 60); // 1 hour
                } catch (err) {
                    console.error('Failed to get signed URL for ThreatData/df33.csv', err);
                    // If signed URL cannot be created, attempt to use public URL as fallback
                    try {
                        csvUrl = SupabaseService.getStoragePublicUrl('ThreatData', 'df33.csv');
                    } catch (e) {
                        console.error('Failed to get public URL for ThreatData/df33.csv', e);
                    }
                }

                if (!csvUrl) {
                    setCsvData([]);
                    setLoading(false);
                    return;
                }

                const res = await fetch(csvUrl);
                const text = await res.text();
                const lines = text.split('\n');
                const headers = lines[0].split(',').map(h => h.trim());
                const parsed = lines.slice(1).map(line => {
                    const values = line.split(',');
                    const obj: any = {};
                    headers.forEach((h, i) => obj[h] = values[i]?.trim());
                    return obj;
                }).filter(row => row.source_ref);
                setCsvData(parsed);
                setLoading(false);
            } catch (err) {
                console.error("CSV Load Error:", err);
                setSystemMsg({ text: 'Failed to load MITRE dataset.', color: 'text-red-600 dark:text-red-500' });
            }
        };
        fetchData();
    }, []);

    const launchOrbit = (f: typeof filters) => {
        setSystemMsg({ text: 'Satellite is launching...', color: 'text-yellow-600 dark:text-yellow-400' });
        
        const filtered = csvData.filter(row => 
            row.source_ref_type === f.source_type &&
            row.relationship_type === f.relationship_type &&
            row.target_ref_type === f.target_type
        ).slice(0, 150); // Limit to 150 for better visual graph performance

        if (filtered.length === 0) {
            setSystemMsg({ text: 'No relationships found with the selected criteria.', color: 'text-red-600 dark:text-red-400' });
            setGraphData(null);
            return;
        }

        const nodesMap = new Map();
        const links: any[] = [];

        filtered.forEach(row => {
            if (!nodesMap.has(row.source_ref)) nodesMap.set(row.source_ref, { id: row.source_ref, type: row.source_ref_type });
            if (!nodesMap.has(row.target_ref)) nodesMap.set(row.target_ref, { id: row.target_ref, type: row.target_ref_type });
            links.push({ source: row.source_ref, target: row.target_ref, label: row.relationship_type });
        });

        setGraphData({ nodes: Array.from(nodesMap.values()), links });
        setSystemMsg({ text: 'Orbit stable. Visualization loaded!', color: 'text-green-600 dark:text-green-400' });
    };

    return (
        <div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white p-6 rounded-xl min-h-[800px] border border-gray-200 dark:border-gray-700 font-sans shadow-lg mt-6">
            <h1 className="text-3xl font-black mb-8 text-center bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent uppercase tracking-tight">
                MITRE ATT&CK Cyber Space Explorer
            </h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full">
                {/* Left Panel: Controls */}
                <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm flex flex-col gap-6">
                    <div className="space-y-4">
                            <h2 className="text-sm font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-2">Configuration</h2>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-gray-400 dark:text-gray-500 mb-1">Source Type</label>
                                    <select 
                                        className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white shadow-sm"
                                        value={filters.source_type}
                                        onChange={e => setFilters({...filters, source_type: e.target.value})}
                                    >
                                        {['malware', 'course-of-action', 'x-mitre-tactic', 'attack-pattern', 'intrusion-set', 'campaign'].map(v => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1).replace(/-/g, ' ')}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-gray-400 dark:text-gray-500 mb-1">Relationship</label>
                                    <select 
                                        className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white shadow-sm"
                                        value={filters.relationship_type}
                                        onChange={e => setFilters({...filters, relationship_type: e.target.value})}
                                    >
                                        {['uses', 'detects', 'mitigates'].map(v => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-gray-400 dark:text-gray-500 mb-1">Target Type</label>
                                    <select 
                                        className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white shadow-sm"
                                        value={filters.target_type}
                                        onChange={e => setFilters({...filters, target_type: e.target.value})}
                                    >
                                        {['malware', 'course-of-action', 'x-mitre-tactic', 'attack-pattern', 'intrusion-set', 'campaign'].map(v => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1).replace(/-/g, ' ')}</option>)}
                                    </select>
                                </div>
                            </div>
                            <button 
                                onClick={() => launchOrbit(filters)}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest py-3.5 rounded-lg transition-all shadow-lg hover:shadow-blue-500/20 mt-4 active:scale-[0.98]"
                            >
                                Launch Orbit
                            </button>
                        </div>
                    <div className={`mt-auto text-center font-black text-[10px] uppercase tracking-widest ${systemMsg.color} border-t border-gray-100 dark:border-gray-600 pt-4 animate-pulse`}>
                        {systemMsg.text}
                    </div>
                </div>

                {/* Right Panel: Visualization */}
                <div className="lg:col-span-2 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm relative flex flex-col overflow-hidden">
                    <div className="bg-gray-100 dark:bg-gray-800 p-3.5 flex justify-between items-center border-b border-gray-200 dark:border-gray-700">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Cyber Visualization Viewer</span>
                        <div className="flex gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-400/50"></div>
                            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/50"></div>
                            <div className="w-2.5 h-2.5 rounded-full bg-green-400/50"></div>
                        </div>
                    </div>
                    
                    <div className="flex-grow bg-white dark:bg-gray-900 relative overflow-hidden flex items-center justify-center shadow-inner">
                        {!graphData && !loading && (
                            <div className="text-gray-200 dark:text-gray-800 text-center uppercase tracking-tighter opacity-80 text-5xl font-black italic select-none">
                                Waiting for Signal
                            </div>
                        )}
                        {loading && (
                            <div className="flex flex-col items-center">
                                <div className="w-10 h-10 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                <span className="mt-4 text-[10px] font-black uppercase tracking-[0.3em] text-blue-600 dark:text-blue-400">Decrypting Dataset...</span>
                            </div>
                        )}
                        {graphData && (
                            <CyberGraph data={graphData} />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- RESILIENCY TAB ---
const ResiliencyTab: React.FC = () => (
    <div className="px-4 py-6 sm:px-0 text-center">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Resiliency</h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Business continuity and resiliency features are under development and will be available soon.</p>
    </div>
);

// --- ACTIVITY LOGS TAB ---
const ActivityLogsTab: React.FC = () => {
    const [logs, setLogs] = useState<AllActivityLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedLog, setSelectedLog] = useState<AllActivityLog | null>(null);

    const severityColorMap: Record<string, string> = {
        info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
        warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
        error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    };

    const fetchLogs = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await SupabaseService.getAllActivityLogs();
            setLogs(data);
        } catch (e) {
            setError("Failed to load activity logs.");
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    return (
        <div className="px-4 py-6 sm:px-0">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Application Activity Logs</h2>
            </div>
            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}

            <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg dark:border-gray-700">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Timestamp</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Action</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Module</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Organization</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">User Role</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Entity Name</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Email ID</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Severity</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Details</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={9} className="text-center py-4 text-gray-500 dark:text-gray-400">Loading logs...</td></tr>
                            ) : logs.map(log => (
                                <tr key={log.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(log.created_at).toLocaleString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{log.action}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{log.module}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{log.org_name || 'N/A'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{log.user_role || 'N/A'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{log.entity_name || 'N/A'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{log.event_data?.user_email || 'N/A'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap"><StatusBadge status={log.severity || 'info'} colorMap={severityColorMap} /></td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button onClick={() => setSelectedLog(log)} className="text-gray-400 hover:text-green-500">
                                            <EyeIcon className="h-5 w-5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <Modal isOpen={!!selectedLog} onClose={() => setSelectedLog(null)} title="Log Event Data">
                {selectedLog ? (
                    <div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                            <div>
                                <div className="text-xs text-gray-500">Timestamp</div>
                                <div className="text-sm text-gray-900 dark:text-white">{new Date(selectedLog.created_at).toLocaleString()}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">Organization</div>
                                <div className="text-sm text-gray-900 dark:text-white">{selectedLog.org_name || 'N/A'}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">User Role</div>
                                <div className="text-sm text-gray-900 dark:text-white">{selectedLog.user_role || 'N/A'}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">Entity Name</div>
                                <div className="text-sm text-gray-900 dark:text-white">{selectedLog.entity_name || 'N/A'}</div>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <div className="text-xs text-gray-500">Action</div>
                                <div className="text-sm text-gray-900 dark:text-white">{selectedLog.action}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">Email ID</div>
                                <div className="text-sm text-gray-900 dark:text-white">{selectedLog.event_data?.user_email || 'N/A'}</div>
                            </div>
                        </div>
                        {selectedLog.event_data ? (
                            <div>
                                <div className="text-xs text-gray-500 mb-2">Event Data</div>
                                <pre className="bg-gray-100 dark:bg-gray-700 p-4 rounded-md text-sm text-gray-800 dark:text-gray-200 overflow-x-auto">
                                    {typeof selectedLog.event_data === 'string' ? (() => { try { return JSON.stringify(JSON.parse(selectedLog.event_data), null, 2); } catch { return selectedLog.event_data; } })() : JSON.stringify(selectedLog.event_data, null, 2)}
                                </pre>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </Modal>
        </div>
    );
};

// --- POLICY MANAGER TAB ---
const PolicyManagerTab: React.FC = () => {
    type SubTab = 'visualizer' | 'workflow' | 'explorer';
    const [activeSubTab, setActiveSubTab] = useState<SubTab>('visualizer');

    const subTabs: { id: SubTab; label: string }[] = [
        { id: 'visualizer', label: 'Visualizer' },
        { id: 'workflow', label: 'Workflow Configuration' },
        { id: 'explorer', label: 'Document Explorer' },
    ];

    const renderContent = () => {
        switch (activeSubTab) {
            case 'visualizer': return <PolicyVisualizer />;
            case 'workflow': return <WorkflowBuilder />;
            case 'explorer': return <PolicyExplorer />;
            default: return null;
        }
    };

    return (
        <div className="px-4 py-6 sm:px-0">
            <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    {subTabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveSubTab(tab.id)}
                            className={`${
                                activeSubTab === tab.id
                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
                            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-all duration-200`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>
            <div className="mt-6">
                {renderContent()}
            </div>
        </div>
    );
};

// --- POLICY MANAGER: VISUALIZER ---
const PolicyVisualizer: React.FC = () => {
    const [nodes, setNodes] = useState<PolicyNode[]>([]);
    const [links, setLinks] = useState<PolicyLink[]>([]);
    const canvasRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        Promise.all([SupabaseService.getPolicyNodes(), SupabaseService.getPolicyLinks()]).then(([n, l]) => {
            setNodes(n);
            setLinks(l);
        });
    }, []);

    const addLink = (sourceId: string, section: string) => {
        const targetId = prompt("Enter Target Policy ID to link to:");
        if (targetId && nodes.find(n => n.id === targetId)) {
            const newLink: PolicyLink = {
                id: Math.random().toString(36).substr(2, 9),
                sourceNodeId: sourceId,
                sourceSection: section,
                targetNodeId: targetId
            };
            const updated = [...links, newLink];
            setLinks(updated);
            SupabaseService.savePolicyLinks(updated);
        }
    };

    return (
        <div className="relative h-[700px] border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900 shadow-inner">
            <div className="p-8 flex flex-wrap gap-12 overflow-auto h-full" ref={canvasRef}>
                {nodes.map((node, i) => (
                    <div key={node.id} className="w-64 bg-white dark:bg-gray-800 border-2 border-blue-500 rounded-lg shadow-xl flex flex-col transition-all hover:scale-105">
                        <div className="bg-blue-500 p-2 text-white font-bold text-sm truncate flex justify-between items-center">
                            <span>{node.name}</span>
                            <span className="text-[10px] bg-blue-700 px-1 rounded">ID: {node.id}</span>
                        </div>
                        <div className="p-3 space-y-2 flex-grow">
                            {node.sections.map(section => {
                                const isLinked = links.some(l => l.sourceNodeId === node.id && l.sourceSection === section);
                                const linkTo = links.find(l => l.sourceNodeId === node.id && l.sourceSection === section);
                                return (
                                    <div key={section} className="flex flex-col text-xs text-gray-700 dark:text-gray-300 border-b border-gray-100 dark:border-gray-700 pb-1">
                                        <div className="flex justify-between items-center">
                                            <span>{section}</span>
                                            <button 
                                                onClick={() => addLink(node.id, section)} 
                                                className="text-blue-500 hover:bg-blue-50 dark:hover:bg-gray-700 rounded-full w-5 h-5 flex items-center justify-center font-bold"
                                                title="Link to another policy"
                                            >
                                                +
                                            </button>
                                        </div>
                                        {isLinked && (
                                            <div className="mt-1 flex items-center text-[10px] text-purple-500 font-semibold animate-pulse">
                                                <ArrowPathIcon className="w-3 h-3 mr-1" /> Linked to Node {linkTo?.targetNodeId}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="p-2 bg-gray-50 dark:bg-gray-700 text-[10px] text-center italic text-gray-400">
                           {node.status}
                        </div>
                    </div>
                ))}

                {/* SVG Overlay for Edges */}
                <svg className="absolute inset-0 pointer-events-none w-full h-full">
                    {links.map((link, idx) => {
                        // Very basic visual link representation
                        return null; // For a full React Flow implementation we'd need node coordinates
                    })}
                </svg>
            </div>
        </div>
    );
};

// --- POLICY MANAGER: WORKFLOW BUILDER ---
const WorkflowBuilder: React.FC = () => {
    const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState('');

    useEffect(() => {
        SupabaseService.getWorkflowTemplates().then(setTemplates);
    }, []);

    const handleCreateTemplate = () => {
        if (!newTemplateName) return;
        const newTemplate: WorkflowTemplate = {
            id: 't' + Math.random().toString(36).substr(2, 5),
            name: newTemplateName,
            steps: [{ id: 's1', label: 'Draft', status: 'Completed' }]
        };
        const updated = [...templates, newTemplate];
        setTemplates(updated);
        SupabaseService.saveWorkflowTemplates(updated);
        setNewTemplateName('');
        setIsModalOpen(false);
    };

    const addStep = (templateId: string) => {
        const label = prompt("Step label (e.g. Legal Review):");
        const email = prompt("Approver Email:");
        if (label) {
            const updated = templates.map(t => {
                if (t.id === templateId) {
                    return {
                        ...t,
                        steps: [...t.steps, { 
                            id: 's' + Math.random().toString(36).substr(2, 5), 
                            label, 
                            approverEmail: email || undefined, 
                            status: 'Pending' as const 
                        }]
                    };
                }
                return t;
            });
            setTemplates(updated);
            SupabaseService.saveWorkflowTemplates(updated);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Workflow Templates</h3>
                <button onClick={() => setIsModalOpen(true)} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow">
                    <PlusIcon className="w-5 h-5 mr-2" /> New Template
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {templates.map(template => (
                    <div key={template.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-4">
                        <div className="flex justify-between items-center mb-4 border-b pb-2">
                            <h4 className="font-bold text-lg text-blue-600 dark:text-blue-400">{template.name}</h4>
                            <button onClick={() => addStep(template.id)} className="text-xs text-blue-500 hover:underline">Add Step</button>
                        </div>
                        <div className="flex items-center flex-wrap gap-4">
                            {template.steps.map((step, idx) => (
                                <React.Fragment key={step.id}>
                                    <div className={`p-3 rounded-lg border-2 text-center min-w-[140px] ${step.status === 'Completed' ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-300 dark:border-gray-600'}`}>
                                        <p className="text-sm font-bold dark:text-gray-200">{step.label}</p>
                                        <p className="text-[10px] text-gray-500">{step.approverEmail || 'Auto'}</p>
                                    </div>
                                    {idx < template.steps.length - 1 && (
                                        <span className="text-gray-400">→</span>
                                    )}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Create New Workflow Template">
                <div className="space-y-4">
                    <label className="block text-sm font-medium dark:text-gray-300">Template Name</label>
                    <input 
                        type="text" 
                        value={newTemplateName} 
                        onChange={e => setNewTemplateName(e.target.value)} 
                        placeholder="e.g. Critical Policy Workflow"
                        className="block w-full rounded-md border-gray-300 shadow-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                    <div className="flex justify-end space-x-2 pt-4">
                        <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 border rounded">Cancel</button>
                        <button onClick={handleCreateTemplate} className="px-4 py-2 bg-blue-600 text-white rounded text-sm">Create</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

// --- POLICY MANAGER: EXPLORER ---
const PolicyExplorer: React.FC = () => {
    const [policies, setPolicies] = useState<PolicyNode[]>([]);
    const [search, setSearch] = useState('');

    useEffect(() => {
        SupabaseService.getPolicyNodes().then(setPolicies);
    }, []);

    const filtered = policies.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="space-y-4">
            <div className="relative">
                <input 
                    type="text" 
                    placeholder="Search policies by name..." 
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="block w-full rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                />
            </div>

            <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Policy Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Status</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {filtered.map(policy => (
                            <tr key={policy.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{policy.name}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 py-1 text-xs font-bold rounded-full ${policy.status === 'Approved' ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'}`}>
                                        {policy.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-3">
                                    <button className="text-blue-500 hover:text-blue-700 font-medium">View</button>
                                    <a href={policy.google_doc_url} target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:text-purple-800 font-medium">Edit in Google Docs</a>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};


// --- NAME ENTRY MODAL for user tracking ---
interface NameEntryModalProps {
    isOpen: boolean;
}
const NameEntryModal: React.FC<NameEntryModalProps> = ({ isOpen }) => {
    const [name, setName] = useState('');
    const [isSigningIn, setIsSigningIn] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // no-op: guest flow removed; keep handler to satisfy form semantics if needed
    };

    const handleGoogleSignIn = async () => {
        try {
            setIsSigningIn(true);
            
            // Log detailed info for debugging
            console.log('Starting OAuth flow...');
            console.log('Provider: google');
            console.log('Redirect URL:', `${window.location.origin}/`);
            
            // Try the OAuth flow with extended options
            const { data, error } = await SupabaseService.supabase.auth.signInWithOAuth({
                provider: 'google',
                options: { 
                    redirectTo: `${window.location.origin}/`,
                    scopes: 'profile email'
                }
            });
            
            if (error) {
                console.error('OAuth error:', error);
                throw error;
            }
        } catch (err: any) {
            console.error('Sign-in error:', err?.message || err);
            setIsSigningIn(false);
            alert(`Sign-in error: ${err?.message || 'Failed to initiate sign-in. Please try again.'}`);
        }
        // Note: Don't set isSigningIn(false) here - it should remain true during redirect
    };

    return (
        <div className="fixed inset-0 bg-blue-50 dark:bg-blue-900 z-[100] flex items-center justify-center p-6" aria-modal="true" role="dialog">
            <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                    <img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><path fill='%23ea4335' d='M24 9.5c3.9 0 6.6 1.7 8.1 3.1l6-5.9C35.9 3.6 30.4 1 24 1 14.7 1 6.9 6.7 3.1 14.9l7.1 5.5C12.9 15.1 18 9.5 24 9.5z'/><path fill='%2334a853' d='M46.5 24c0-1.6-.1-2.9-.4-4.2H24v8.1h12.5c-.5 2.9-2.4 5.3-5.1 6.9l7.9 6.1C43.5 36.2 46.5 30.6 46.5 24z'/><path fill='%234a90e2' d='M10.2 29.3A14.8 14.8 0 0 1 9 24c0-1.1.2-2.1.4-3.1l-7.1-5.5C1.2 17.1 0 20.4 0 24c0 3.6 1.2 6.9 3.3 9.6l6.9-4.3z'/><path fill='%23fbbc05' d='M24 46.9c6.4 0 11.9-2.1 15.9-5.7l-7.9-6.1c-2 1.3-4.6 2.1-8 2.1-6 0-11.1-4.4-12.9-10.1l-7.1 5.5C6.9 41.2 14.7 46.9 24 46.9z'/></svg>" alt="Google" className="h-6 w-6" />
                    <h2 className="text-lg font-semibold text-gray-900">Welcome to Zeroto1 GRC</h2>
                </div>

                <p className="text-sm text-gray-600 mb-6">Sign in using your Google account.</p>

                <div className="mt-2">
                    <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={isSigningIn}
                        aria-live="polite"
                        className="w-full mt-2 inline-flex items-center justify-center gap-3 px-5 py-3 bg-white border border-gray-200 rounded-full shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-60 transition"
                    >
                        <img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><path fill='%23ea4335' d='M24 9.5c3.9 0 6.6 1.7 8.1 3.1l6-5.9C35.9 3.6 30.4 1 24 1 14.7 1 6.9 6.7 3.1 14.9l7.1 5.5C12.9 15.1 18 9.5 24 9.5z'/><path fill='%2334a853' d='M46.5 24c0-1.6-.1-2.9-.4-4.2H24v8.1h12.5c-.5 2.9-2.4 5.3-5.1 6.9l7.9 6.1C43.5 36.2 46.5 30.6 46.5 24z'/><path fill='%234a90e2' d='M10.2 29.3A14.8 14.8 0 0 1 9 24c0-1.1.2-2.1.4-3.1l-7.1-5.5C1.2 17.1 0 20.4 0 24c0 3.6 1.2 6.9 3.3 9.6l6.9-4.3z'/><path fill='%23fbbc05' d='M24 46.9c6.4 0 11.9-2.1 15.9-5.7l-7.9-6.1c-2 1.3-4.6 2.1-8 2.1-6 0-11.1-4.4-12.9-10.1l-7.1 5.5C6.9 41.2 14.7 46.9 24 46.9z'/></svg>" alt="Google" className="h-5 w-5 rounded-full" />
                        <span className="flex-1 text-sm font-semibold text-gray-900">Sign in with Google</span>
                        {isSigningIn && (
                            <svg className="animate-spin h-5 w-5 text-gray-500" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                            </svg>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};


// --- MAIN APP COMPONENT ---
const App: React.FC = () => {
    type Tab = 'dashboard' | 'organisation' | 'program' | 'policymanager' | 'governance' | 'risk' | 'compliance' | 'threat' | 'resiliency' | 'logs';
    type LocalUserRole = 'security-staff' | 'cxo';
    
    const [activeTab, setActiveTab] = useState<Tab>('dashboard');
    const [userRole, setUserRole] = useState<LocalUserRole>('security-staff');
    const [platformAdminRole, setPlatformAdminRole] = useState<UserRole | null>(null);
    const [isDarkMode, setIsDarkMode] = useState(() => {
        if (typeof window !== 'undefined' && localStorage.getItem('theme')) {
            return localStorage.getItem('theme') === 'dark';
        }
        return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    });
    const [userName, setUserName] = useState<string | null>(() => sessionStorage.getItem('grcUserName'));
    const [isNameModalOpen, setIsNameModalOpen] = useState<boolean>(false);
    const [authChecked, setAuthChecked] = useState(false);
    const [logoutToastVisible, setLogoutToastVisible] = useState(false);
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
    const logoutTimerRef = useRef<number | null>(null);


    useEffect(() => {
        const body = document.body;
        if (isDarkMode) {
            body.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            body.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [isDarkMode]);

    useEffect(() => {
        let authListener: any;
        const initAuth = async () => {
            try {
                const { data } = await SupabaseService.supabase.auth.getSession();
                const session = data.session;
                if (session && session.user) {
                    const name = (session.user.user_metadata as any)?.full_name || session.user.email || 'User';
                    sessionStorage.setItem('grcUserName', name);
                    setUserName(name);
                    setIsNameModalOpen(false);
                    
                    // Fetch user's role from org_onboarding table (for tenant admin features)
                    const role = await SupabaseService.getUserRole();
                    setPlatformAdminRole(role);
                } else {
                    // No active session — prompt for Google sign-in (or guest fallback)
                    if (!sessionStorage.getItem('grcUserName')) {
                        setIsNameModalOpen(true);
                    }
                    setPlatformAdminRole(null);
                }
                setAuthChecked(true);

                const { data: listener } = SupabaseService.supabase.auth.onAuthStateChange(async (_event, session) => {
                    if (session && session.user) {
                        const name = (session.user.user_metadata as any)?.full_name || session.user.email || 'User';
                        sessionStorage.setItem('grcUserName', name);
                        setUserName(name);
                        setIsNameModalOpen(false);
                        
                        // Fetch user's role from org_onboarding table (for tenant admin features)
                        const role = await SupabaseService.getUserRole();
                        setPlatformAdminRole(role);
                        
                        try {
                            console.debug('onAuthStateChange: attempting to log login for', name);
                            const ok = await SupabaseService.logAllActivity({ action: 'login', module: 'Authentication', entity_name: name }, session.user);
                            console.debug('onAuthStateChange logAllActivity result:', ok);
                        } catch (err) {
                            console.error('Failed to log login activity', err);
                        }
                    } else {
                        setPlatformAdminRole(null);
                    }
                });
                authListener = listener;
            } catch (err) {
                console.error('Auth init error', err);
                setAuthChecked(true);
                setIsNameModalOpen(!sessionStorage.getItem('grcUserName'));
                setPlatformAdminRole(null);
            }
        };
        initAuth();

        return () => {
            if (authListener && authListener.subscription) {
                authListener.subscription.unsubscribe();
            }
        };
    }, []);

    // Sign-out handler for header
    const handleSignOut = async () => {
        try {
            await SupabaseService.supabase.auth.signOut();
        } catch (err) {
            console.error('Sign out failed', err);
        } finally {
            sessionStorage.removeItem('grcUserName');
            setUserName(null);
            // Show a brief logged-out toast, then redirect to the app root to clear state.
            setIsNameModalOpen(true);
            setLogoutToastVisible(true);
            // delay the hard redirect briefly so the user can see the message
            logoutTimerRef.current = window.setTimeout(() => {
                try {
                    window.location.replace(window.location.origin);
                } catch (e) {
                    window.location.reload();
                }
            }, 900) as unknown as number;
        }
    };

    useEffect(() => {
        return () => {
            if (logoutTimerRef.current) {
                clearTimeout(logoutTimerRef.current as any);
            }
        };
    }, []);


    const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

    const mainTabs: { id: Tab; label: string }[] = [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'organisation', label: 'Organisation' },
        { id: 'program', label: 'Program' },
        // { id: 'policymanager', label: 'Policy Manager' },
        { id: 'governance', label: 'Governance' },
        // { id: 'risk', label: 'Risk' },
        { id: 'compliance', label: 'Compliance' },
        // { id: 'threat', label: 'Threat View' },
        // { id: 'resiliency', label: 'Resiliency' },
        { id: 'logs', label: 'Activity Logs' },
    ];

    useEffect(() => {
        // Restrict navigation based on role if needed
        // For now, allow all users to access all tabs
        // Add specific restrictions based on role if needed in the future
    }, [userRole, activeTab]);
    

    const availableTabs = useMemo(() => {
        // All users have access to all tabs for now
        // Add role-specific filtering if needed in the future
        return mainTabs;
    }, [mainTabs]);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            {/* Logged-out toast */}
            {logoutToastVisible && (
                <div role="status" aria-live="polite" className="fixed top-5 right-5 z-[200]">
                    <div className="max-w-sm w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg px-4 py-3 flex items-center space-x-3">
                        <svg className="h-5 w-5 text-green-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">Logged out</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">You have been signed out.</p>
                        </div>
                    </div>
                </div>
            )}
            <NameEntryModal isOpen={isNameModalOpen} />
            <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />
            <Header 
                userRole={userRole} 
                setUserRole={setUserRole} 
                isDarkMode={isDarkMode} 
                toggleDarkMode={toggleDarkMode} 
                onSignOut={handleSignOut}
            />
            <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                <div className="border-b border-gray-200 dark:border-gray-700 px-4 sm:px-0">
                    <nav className="-mb-px flex space-x-8 overflow-x-auto scrollbar-hide" aria-label="Main Tabs">
                        {availableTabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`${
                                    activeTab === tab.id
                                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
                                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-lg transition-colors duration-200`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>
                
                {!authChecked ? (
                    <div className="flex items-center justify-center py-24">
                        <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                        </svg>
                        <p className="ml-3 text-gray-500 dark:text-gray-400">Loading...</p>
                    </div>
                ) : (
                    <>
                        {activeTab === 'dashboard' && <DashboardTab />}
                        {activeTab === 'organisation' && <OrganisationTab userRole={platformAdminRole} />}
                        {activeTab === 'program' && <ProgramTab userRole={userRole} />}
                        {/* {activeTab === 'policymanager' && <PolicyManagerTab />} */}
                        {activeTab === 'governance' && <GovernanceTab />}
                        {/* {activeTab === 'risk' && <RiskTab />} */}
                        {activeTab === 'compliance' && <ComplianceTab />}
                        {/* {activeTab === 'threat' && <ThreatViewTab />}
                        {activeTab === 'resiliency' && <ResiliencyTab />} */}
                        {activeTab === 'logs' && <ActivityLogsTab />}
                    </>
                )}
                
                {/* Floating Feedback Button */}
                <button
                    onClick={() => setIsFeedbackOpen(true)}
                    className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center z-50 transition-transform hover:scale-110"
                    title="Send feedback"
                    aria-label="Send feedback"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                </button>

            </main>
        </div>
    );
};

export default App;
