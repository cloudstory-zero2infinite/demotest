import React, { useState, useCallback, useMemo } from 'react';
import { Compliance, ComplianceStatus } from '../../types';
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

export const ComplianceTab: React.FC<{ isActive?: boolean }> = ({ isActive = true }) => {
    const [compliances, setCompliances] = useState<Compliance[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string|null>(null);
    const [modalState, setModalState] = useState<{ type: 'view' | null; compliance?: Compliance | null }>({ type: null });
    const [selectedFramework, setSelectedFramework] = useState<string>('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof Compliance; direction: 'ascending' | 'descending' } | null>(null);
    const [neededFrameworks, setNeededFrameworks] = useState<string[] | null>(null);

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
            ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-yellow-800">
                        No compliance frameworks have been assigned to your organization. Please contact your administrator to configure frameworks.
                    </p>
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
