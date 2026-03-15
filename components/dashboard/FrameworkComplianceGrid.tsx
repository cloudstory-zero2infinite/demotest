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
        <div className="md:col-span-2 lg:col-span-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow transition-all hover:shadow-md border border-transparent dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Framework Compliance Status</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                {Object.keys(data).length > 0 ? (
                    Object.entries(data)
                     .sort(([nameA], [nameB]) => nameA.localeCompare(nameB))
                     .map(([framework, statusData]) => (
                        <FrameworkComplianceChart key={framework} frameworkName={framework} data={statusData} />
                    ))
                ) : (
                    <p className="text-gray-500 dark:text-gray-400 col-span-full text-center py-8">No compliance framework data available.</p>
                )}
            </div>
        </div>
    );
});
