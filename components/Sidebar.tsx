import React, { useState } from 'react';



export type MainTab = 'dashboard' | 'organisation' | 'program' | 'governance' | 'compliance' | 'risk' | 'logs';

export type OrgSubTab = 'view_org' | 'tenant_admin' | 'templates' | 'settings';

export type GovernanceSubTab = 'assets' | 'policies' | 'vulnerability' | 'relationships' | 'capabilities' | 'control_registry' | 'due_diligence';



interface NavItem {

    id: MainTab;

    label: string;

    icon: React.ReactNode;

    children?: { id: GovernanceSubTab; label: string }[];

}



interface SidebarProps {

    activeTab: MainTab;

    activeOrgSubTab: OrgSubTab;

    activeGovernanceSubTab?: GovernanceSubTab;

    isOpen: boolean;

    onToggle: () => void;

    onNavigate: (tab: MainTab, subTab?: OrgSubTab | GovernanceSubTab) => void;

    isAdmin: boolean;

}



// ─── Icons ────────────────────────────────────────────────────────────────────



const DashboardIcon = () => (

    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">

        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />

    </svg>

);

const OrgIcon = () => (

    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">

        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />

    </svg>

);

const ProgramIcon = () => (

    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">

        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />

    </svg>

);

const GovernanceIcon = () => (

    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">

        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />

    </svg>

);

const ComplianceIcon = () => (

    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">

        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />

    </svg>

);

const RiskIcon = () => (

    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">

        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />

    </svg>

);

const LogsIcon = () => (

    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">

        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />

    </svg>

);

const ChevronDown = ({ open }: { open: boolean }) => (

    <svg className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">

        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />

    </svg>

);

const MenuIcon = () => (

    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">

        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />

    </svg>

);



// ─── Sidebar ──────────────────────────────────────────────────────────────────



export const Sidebar: React.FC<SidebarProps> = ({

    activeTab, activeOrgSubTab, activeGovernanceSubTab, isOpen, onToggle, onNavigate, isAdmin,

}) => {

    const [expandedItems, setExpandedItems] = useState<Set<MainTab>>(new Set());



    const navItems: NavItem[] = [

        { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },

        { id: 'organisation', label: 'Organisation', icon: <OrgIcon /> },

        { id: 'program', label: 'Program', icon: <ProgramIcon /> },

        { 

            id: 'governance', 

            label: 'Governance', 

            icon: <GovernanceIcon />

        },

        { id: 'compliance', label: 'Compliance', icon: <ComplianceIcon /> },

        { id: 'risk', label: 'Risk Management', icon: <RiskIcon /> },

        { id: 'logs', label: 'Activity Logs', icon: <LogsIcon /> },

    ];



    const handleMainClick = (item: NavItem) => {

        if (item.children) {

            // Toggle expansion for items with children

            setExpandedItems(prev => {

                const next = new Set(prev);

                if (next.has(item.id)) {

                    next.delete(item.id);

                } else {

                    next.add(item.id);

                }

                return next;

            });

            // Navigate to the main tab and default to 'assets' if not already active

            if (activeTab !== item.id) {

                onNavigate(item.id, 'assets');

            }

        } else {

            onNavigate(item.id);

        }

    };



    const handleSubItemClick = (parentId: MainTab, subId: GovernanceSubTab) => {

        onNavigate(parentId, subId);

    };



    const isItemActive = (item: NavItem) => activeTab === item.id;

    const isSubItemActive = (parentId: MainTab, subId: GovernanceSubTab) => 

        activeTab === parentId && activeGovernanceSubTab === subId;



    return (

        <aside

            className={`

                flex flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700

                transition-all duration-200 ease-in-out flex-shrink-0

                ${isOpen ? 'w-56' : 'w-16'}

            `}

            style={{ height: 'calc(100vh - 64px)' }}

        >

            {/* Toggle button */}

            <div className={`flex items-center h-12 px-4 border-b border-gray-100 dark:border-gray-700 ${isOpen ? 'justify-between' : 'justify-center'}`}>

                {isOpen && (

                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Menu</span>

                )}

                <button

                    onClick={onToggle}

                    className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"

                    title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}

                >

                    <MenuIcon />

                </button>

            </div>



            {/* Nav items */}

            <nav className="flex-1 py-2 overflow-y-auto overflow-x-hidden">

                {navItems.map(item => {

                    const active = isItemActive(item);

                    const isExpanded = expandedItems.has(item.id);



                    return (

                        <div key={item.id}>

                            {/* Main item */}

                            <button

                                onClick={() => handleMainClick(item)}

                                title={!isOpen ? item.label : undefined}

                                className={`

                                    w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium

                                    transition-colors duration-150 relative

                                    ${active

                                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'

                                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50'

                                    }

                                    ${!isOpen ? 'justify-center' : ''}

                                `}

                            >

                                {/* Active indicator */}

                                {active && (

                                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-blue-500 rounded-r-full" />

                                )}

                                <span className={active ? 'text-blue-600 dark:text-blue-400' : ''}>{item.icon}</span>

                                {isOpen && (

                                    <>

                                        <span className="flex-1 text-left">{item.label}</span>

                                        {item.children && (

                                            <ChevronDown open={isExpanded} />

                                        )}

                                    </>

                                )}

                            </button>



                            {/* Submenu items */}

                            {item.children && isExpanded && isOpen && (

                                <div className="ml-4 mt-1 space-y-1">

                                    {item.children.map(child => {

                                        const childActive = isSubItemActive(item.id, child.id);

                                        return (

                                            <button

                                                key={child.id}

                                                onClick={() => handleSubItemClick(item.id, child.id)}

                                                className={`

                                                    w-full flex items-center gap-3 px-4 py-2 text-sm font-medium

                                                    transition-colors duration-150 relative rounded-md

                                                    ${childActive

                                                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'

                                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'

                                                    }

                                                `}

                                            >

                                                {/* Active indicator */}

                                                {childActive && (

                                                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-blue-500 rounded-r-full" />

                                                )}

                                                <span className="flex-1 text-left text-xs ml-2">{child.label}</span>

                                            </button>

                                        );

                                    })}

                                </div>

                            )}

                        </div>

                    );

                })}

            </nav>

        </aside>

    );

};

