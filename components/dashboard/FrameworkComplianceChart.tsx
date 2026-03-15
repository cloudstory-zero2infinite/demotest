import React from 'react';

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

export default FrameworkComplianceChart;
export type { DerivedComplianceStatus };
