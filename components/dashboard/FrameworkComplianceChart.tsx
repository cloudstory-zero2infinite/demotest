import React from 'react';

// Per-framework control enforcement: how many of the controls required by a
// framework (or the NN baseline) are actually enforced. Driven by control_registry.
interface FrameworkComplianceChartProps {
    frameworkName: string;
    data: {
        enforced: number;
        inReview: number;
        notEnforced: number;
        total: number;
    };
}

const FrameworkComplianceChart: React.FC<FrameworkComplianceChartProps> = ({ frameworkName, data }) => {
    const { enforced, inReview, notEnforced, total } = data;
    if (total === 0) return null;

    const enforcedPercent = (enforced / total) * 100;
    const inReviewPercent = (inReview / total) * 100;
    const notEnforcedPercent = (notEnforced / total) * 100;

    return (
        <div className="w-full" title={`${enforced} of ${total} controls enforced (${enforcedPercent.toFixed(0)}%)`}>
            <div className="flex justify-between items-baseline mb-1">
                <h4 className="font-semibold text-gray-700 dark:text-gray-300 truncate pr-2" title={frameworkName}>{frameworkName}</h4>
                <span className="text-lg font-bold text-gray-900 dark:text-white whitespace-nowrap">
                    {enforcedPercent.toFixed(0)}%
                    <span className="ml-1 text-xs font-normal text-gray-400">{enforced}/{total}</span>
                </span>
            </div>
            <div className="w-full flex h-4 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                <div className="bg-green-500 transition-all duration-500" style={{ width: `${enforcedPercent}%` }} title={`Enforced: ${enforced}`}></div>
                <div className="bg-amber-400 transition-all duration-500" style={{ width: `${inReviewPercent}%` }} title={`In Review: ${inReview}`}></div>
                <div className="bg-gray-400 transition-all duration-500" style={{ width: `${notEnforcedPercent}%` }} title={`Not Enforced: ${notEnforced}`}></div>
            </div>
            <div className="flex justify-between text-xs mt-1.5 text-gray-600 dark:text-gray-400">
                <div className="flex items-center" title={`${enforced} enforced`}>
                    <span className="h-2 w-2 rounded-full bg-green-500 mr-1.5"></span>
                    <span className="text-green-800 dark:text-green-300">{enforced} Enforced</span>
                </div>
                <div className="flex items-center" title={`${inReview} in review`}>
                    <span className="h-2 w-2 rounded-full bg-amber-400 mr-1.5"></span>
                    <span className="text-amber-700 dark:text-amber-300">{inReview} In Review</span>
                </div>
                <div className="flex items-center" title={`${notEnforced} not enforced`}>
                    <span className="h-2 w-2 rounded-full bg-gray-400 mr-1.5"></span>
                    <span className="text-gray-700 dark:text-gray-300">{notEnforced} Not Enforced</span>
                </div>
            </div>
        </div>
    );
};

export default FrameworkComplianceChart;
