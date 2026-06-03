import React, { useState } from 'react';
import { ExpandableChartModal } from '../common/ExpandableChartModal';

// Reusable dashboard chart-card shell: consistent header (title + optional right
// slot + expand button) and built-in expand-to-modal. Cards pass compact content
// as children and optionally richer content for the expanded modal.
interface ChartCardProps {
    title: string;
    right?: React.ReactNode;
    expandedTitle?: string;
    expandedContent?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}

export const ChartCard: React.FC<ChartCardProps> = ({ title, right, expandedTitle, expandedContent, children, className }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    return (
        <>
            <div className={`p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col ${className || ''}`}>
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</h3>
                    <div className="flex items-center gap-2">
                        {right}
                        <button
                            onClick={() => setIsExpanded(true)}
                            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            aria-label="Expand chart"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                            </svg>
                        </button>
                    </div>
                </div>
                {children}
            </div>
            {isExpanded && (
                <ExpandableChartModal isOpen={isExpanded} onClose={() => setIsExpanded(false)} title={expandedTitle || `${title} — Expanded View`}>
                    {expandedContent || children}
                </ExpandableChartModal>
            )}
        </>
    );
};
