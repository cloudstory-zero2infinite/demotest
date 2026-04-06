import React from 'react';
import FrameworkComplianceChart from './FrameworkComplianceChart';

interface FrameworkComplianceGridProps {
    data: Record<string, {
        'Compliant': number;
        'NonCompliant': number;
        'NotMapped': number;
        total: number;
    }>;
}

export const FrameworkComplianceGrid: React.FC<FrameworkComplianceGridProps> = React.memo(({ data }) => {
    return (
        <div className="p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 h-full">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Framework Compliance</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                {Object.keys(data).length > 0 ? (
                    Object.entries(data)
                     .sort(([nameA], [nameB]) => nameA.localeCompare(nameB))
                     .map(([framework, statusData]) => (
                        <FrameworkComplianceChart key={framework} frameworkName={framework} data={statusData} />
                    ))
                ) : (
                    <p className="text-gray-400 dark:text-gray-500 col-span-full text-center py-6 text-sm">No compliance data available.</p>
                )}
            </div>
        </div>
    );
});
