import React from 'react';
import FrameworkComplianceChart from './FrameworkComplianceChart';

interface FrameworkComplianceGridProps {
    data: Record<string, {
        enforced: number;
        inReview: number;
        notEnforced: number;
        total: number;
    }>;
}

// NN baseline always sorts first; the rest alphabetically.
const NN_KEY = 'Non-Negotiables (NN)';

export const FrameworkComplianceGrid: React.FC<FrameworkComplianceGridProps> = React.memo(({ data }) => {
    return (
        <div className="p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 h-full">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Framework Compliance</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3 -mt-2">Controls enforced out of those required by each selected framework.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                {Object.keys(data).length > 0 ? (
                    Object.entries(data)
                     .sort(([a], [b]) => (a === NN_KEY ? -1 : b === NN_KEY ? 1 : a.localeCompare(b)))
                     .map(([framework, statusData]) => (
                        <FrameworkComplianceChart key={framework} frameworkName={framework} data={statusData} />
                    ))
                ) : (
                    <p className="text-gray-400 dark:text-gray-500 col-span-full text-center py-6 text-sm">No framework or NN controls found.</p>
                )}
            </div>
        </div>
    );
});
