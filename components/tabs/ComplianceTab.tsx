import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Compliance, ComplianceStatus, ScfFrameworkControl } from '../../types';
import * as SupabaseService from '../../services/supabase';
import { useDataRefresh } from '../../hooks/useDataRefresh';
import { SortUpDownIcon, SortUpIcon, SortDownIcon } from '../Icons';
import { Modal } from '../common/Modal';
import { StatusBadge } from '../common/StatusBadge';

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

const BulbIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 18h6M10 21h4M12 3a6 6 0 00-3.6 10.8c.5.37.9.94 1 1.56l.1.64h5l.1-.64c.1-.62.5-1.19 1-1.56A6 6 0 0012 3z" />
    </svg>
);

const ChevronRightIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
);

export const ComplianceTab: React.FC<{ isActive?: boolean }> = ({ isActive = true }) => {
    const [compliances, setCompliances] = useState<Compliance[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string|null>(null);
    const [modalState, setModalState] = useState<{ type: 'view' | null; compliance?: Compliance | null }>({ type: null });
    const [selectedFramework, setSelectedFramework] = useState<string>('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof Compliance; direction: 'ascending' | 'descending' } | null>(null);
    const [neededFrameworks, setNeededFrameworks] = useState<string[] | null>(null);
    // SCF-controls-by-framework accordion: one independently-expandable panel per
    // framework selected in Settings, lazily fetched + cached on first open.
    const [openFw, setOpenFw] = useState<Set<string>>(new Set());
    const [scfByFw, setScfByFw] = useState<Record<string, ScfFrameworkControl[]>>({});
    const [loadingFw, setLoadingFw] = useState<Set<string>>(new Set());
    const [errFw, setErrFw] = useState<Record<string, string>>({});
    const [scfSearch, setScfSearch] = useState('');

    const toggleFw = (fw: string) => {
        const willOpen = !openFw.has(fw);
        setOpenFw(prev => {
            const next = new Set(prev);
            if (next.has(fw)) next.delete(fw); else next.add(fw);
            return next;
        });
        if (willOpen && !scfByFw[fw] && !loadingFw.has(fw)) {
            setLoadingFw(l => new Set(l).add(fw));
            setErrFw(m => { const n = { ...m }; delete n[fw]; return n; });
            SupabaseService.getScfFrameworkControls(fw)
                .then(rows => setScfByFw(m => ({ ...m, [fw]: rows })))
                .catch(e => setErrFw(m => ({ ...m, [fw]: e?.message || 'Failed to load SCF controls' })))
                .finally(() => setLoadingFw(l => { const n = new Set(l); n.delete(fw); return n; }));
        }
    };

    const complianceStatusStyles: Record<ComplianceStatus, string> = {
        'Achieved': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
        'In Progress': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
        'Not Started': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    };

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const [orgData, complianceData] = await Promise.all([
                SupabaseService.getOrgMe(),
                SupabaseService.getCompliances()
            ]);
            
            if (orgData?.neededFramework) {
                setNeededFrameworks(orgData.neededFramework);
                if (orgData.neededFramework.length > 0 && !selectedFramework) {
                    setSelectedFramework(orgData.neededFramework[0]);
                }
            }
            setCompliances(complianceData);
            return { orgData, compliances: complianceData };
        } catch(e) {
            setError("Failed to load compliance frameworks.");
            throw e;
        } finally {
            setLoading(false);
        }
    }, [selectedFramework]);

    const { data, refresh } = useDataRefresh(fetchData, [], isActive);

    // Filter helper applied within each open SCF panel.
    const filterScf = useCallback((rows: ScfFrameworkControl[]) => {
        const q = scfSearch.toLowerCase().trim();
        if (!q) return rows;
        return rows.filter(c =>
            c.scf_control_id.toLowerCase().includes(q) ||
            c.control_name.toLowerCase().includes(q) ||
            c.domain.toLowerCase().includes(q) ||
            c.refs.some(r => r.toLowerCase().includes(q)),
        );
    }, [scfSearch]);

    const uniqueFrameworks = useMemo(() => {
        if (!neededFrameworks || neededFrameworks.length === 0) {
            return [];
        }
        // Only show frameworks that are in the organization's needed_framework array
        const availableFrameworks = compliances.map(c => c.framework);
        return neededFrameworks.filter(framework => 
            availableFrameworks.includes(framework)
        );
    }, [compliances, neededFrameworks]);
    
    const filteredAndSortedCompliances = useMemo(() => {
        let filteredItems = [...compliances];
        
        // Only show frameworks that are in the organization's needed_framework array
        if (neededFrameworks && neededFrameworks.length > 0) {
            filteredItems = filteredItems.filter(item => 
                neededFrameworks.includes(item.framework)
            );
        }
        
        // Further filter by selected framework if one is selected
        if (selectedFramework) {
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
    }, [compliances, selectedFramework, sortConfig, neededFrameworks]);

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
            
            {neededFrameworks && neededFrameworks.length > 0 ? (
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
            ) : null}

            {neededFrameworks && neededFrameworks.length > 0 && (
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                            <BulbIcon className="h-4 w-4 text-amber-500" />
                            SCF controls by framework
                        </h3>
                        <input
                            value={scfSearch}
                            onChange={e => setScfSearch(e.target.value)}
                            placeholder="Filter open panels by SCF id, name or ref…"
                            className="text-sm rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-2 py-1 w-64"
                        />
                    </div>
                    <div className="space-y-2">
                        {neededFrameworks.map(fw => {
                            const isOpen = openFw.has(fw);
                            const rows = scfByFw[fw] || [];
                            const isLoading = loadingFw.has(fw);
                            const loadErr = errFw[fw];
                            const filtered = filterScf(rows);
                            return (
                                <div key={fw} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                    <button
                                        onClick={() => toggleFw(fw)}
                                        className="w-full flex items-center justify-between px-4 py-2.5 text-left bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors"
                                    >
                                        <span className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-200">
                                            <ChevronRightIcon className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                                            {fw}
                                        </span>
                                        <span className="text-xs text-gray-400">{scfByFw[fw] ? `${rows.length} SCF controls` : (isLoading ? 'Loading…' : '')}</span>
                                    </button>
                                    {isOpen && (
                                        <div className="px-4 py-3 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700">
                                            {isLoading ? (
                                                <p className="text-sm text-gray-500 dark:text-gray-400 py-3 text-center">Loading SCF controls…</p>
                                            ) : loadErr ? (
                                                <p className="text-sm text-red-500 py-3 text-center">{loadErr}</p>
                                            ) : rows.length === 0 ? (
                                                <p className="text-sm text-gray-500 dark:text-gray-400 py-3 text-center">
                                                    No SCF controls mapped to {fw}. Ensure the SCF reference workbook is uploaded (internal tool → Control Framework).
                                                </p>
                                            ) : (
                                                <>
                                                    {scfSearch.trim() && (
                                                        <div className="text-xs text-gray-400 mb-2">{filtered.length} of {rows.length} match</div>
                                                    )}
                                                    <div className="max-h-96 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                                                        {filtered.map(c => (
                                                            <div key={c.scf_control_id} className="py-2">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="font-mono text-xs font-semibold text-gray-800 dark:text-gray-200">{c.scf_control_id}</span>
                                                                    <span className="text-sm text-gray-700 dark:text-gray-300">{c.control_name}</span>
                                                                    {c.domain && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">{c.domain}</span>}
                                                                </div>
                                                                {c.refs.length > 0 && (
                                                                    <div className="mt-1 flex flex-wrap gap-1 items-center">
                                                                        <span className="text-[10px] text-gray-400 mr-1">{fw} refs:</span>
                                                                        {c.refs.map((r, i) => (
                                                                            <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{r}</span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}

            <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg dark:border-gray-700">
                <div className="overflow-auto max-h-[calc(100vh-280px)]">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                           <tr>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('compliance_id')} className="flex items-center w-full text-left focus:outline-none">
                                        Compliance ID {getSortIconFor('compliance_id')}
                                    </button>
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('framework')} className="flex items-center w-full text-left focus:outline-none">
                                        Framework {getSortIconFor('framework')}
                                    </button>
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('status')} className="flex items-center w-full text-left focus:outline-none">
                                        Status {getSortIconFor('status')}
                                    </button>
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                    <button onClick={() => requestSort('associated_int_ctls')} className="flex items-center w-full text-left focus:outline-none">
                                        Associated Controls {getSortIconFor('associated_int_ctls')}
                                    </button>
                                </th>
                            </tr>
                        </thead>
                         <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={4} className="text-center py-4 text-gray-500 dark:text-gray-400">Loading frameworks...</td></tr>
                            ) : filteredAndSortedCompliances.length === 0 ? (
                                <tr><td colSpan={4} className="text-center py-4 text-gray-500 dark:text-gray-400">No frameworks found.</td></tr>
                            ) : filteredAndSortedCompliances.map(item => (
                                <tr
                                    key={item.id}
                                    onClick={() => setModalState({ type: 'view', compliance: item })}
                                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                >
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
