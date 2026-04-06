import React, { useMemo } from 'react';
import { ResponsiveContainer, Sankey, Tooltip } from 'recharts';

interface SankeyMappingCardProps {
    data: {
        nodes: { name: string; color: string }[];
        links: { source: number; target: number; value: number }[];
    };
    frameworkNames: Set<string>;
    internalControlNames: Set<string>;
}

export const SankeyMappingCard: React.FC<SankeyMappingCardProps> = React.memo(({ data, frameworkNames, internalControlNames }) => {
    
    const CustomSankeyTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const linkPayload = payload[0].payload;
            const sourceName = linkPayload.source.name;
            const targetName = linkPayload.target.name;

            const isFrameworkToRequirement = frameworkNames.has(sourceName);

            return (
                <div className="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl text-sm transition-all animate-in fade-in zoom-in duration-200">
                    {isFrameworkToRequirement ? (
                        <>
                            <p className="font-bold text-gray-900 dark:text-white mb-1">
                                Framework: <span className="font-normal text-blue-600 dark:text-blue-400">{sourceName}</span>
                            </p>
                            <p className="font-bold text-gray-900 dark:text-white">
                                Requirement: <span className="font-normal text-gray-600 dark:text-gray-400">{targetName}</span>
                            </p>
                            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    This requirement is mapped by <span className="font-semibold text-gray-900 dark:text-white">{payload[0].value}</span> control(s).
                                </p>
                            </div>
                        </>
                    ) : (
                         <p className="text-gray-900 dark:text-white leading-relaxed">
                            <span className="font-bold text-blue-600 dark:text-blue-400">{sourceName}</span> supports{' '}
                            <span className="font-bold">{payload[0].value}</span>{' '}
                            requirement(s) in{' '}
                            <span className="font-bold text-green-600 dark:text-green-400">{targetName}</span>.
                        </p>
                    )}
                </div>
            );
        }
        return null;
    };

    const SankeyNode = ({ x, y, width, height, payload, containerWidth }: any) => {
        const isFramework = frameworkNames.has(payload.name);
        const isControl = internalControlNames.has(payload.name);
        const isRequirement = !isFramework && !isControl;

        let scaleFactor = 1.0;
        if(isFramework) scaleFactor = 1.0;
        else if (isControl) scaleFactor = 0.66;
        else if (isRequirement) scaleFactor = 0.33;
        
        const scaledHeight = height * scaleFactor;
        const yOffset = (height - scaledHeight) / 2;

        const isSourceNode = x < containerWidth / 3;
        
        return (
            <g className="transition-opacity hover:opacity-80">
                <rect 
                    x={x} 
                    y={y + yOffset} 
                    width={width} 
                    height={scaledHeight} 
                    fill={payload.color} 
                    rx={2}
                    ry={2}
                    className="shadow-sm" 
                />
                <text 
                    x={isSourceNode ? x - 8 : x + width + 8} 
                    y={y + height / 2}
                    textAnchor={isSourceNode ? "end" : "start"}
                    dominantBaseline="middle"
                    className="fill-current text-gray-600 dark:text-gray-400 text-[10px] font-medium tracking-tight"
                >
                    {payload.name}
                </text>
            </g>
        );
    };

    return (
        <div className="p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
             <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Controls to Frameworks Mapping</h3>
            {data.nodes.length > 0 ? (
                <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <Sankey
                            data={data}
                            node={<SankeyNode />}
                            link={{ stroke: 'rgba(59, 130, 246, 0.15)' }}
                            nodePadding={25}
                            margin={{
                                left: 160,
                                right: 160,
                                top: 20,
                                bottom: 20,
                            }}
                        >
                            <Tooltip content={<CustomSankeyTooltip />} />
                        </Sankey>
                    </ResponsiveContainer>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500 dark:text-gray-400">
                    <svg className="w-12 h-12 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p>No mapping data available for visualization.</p>
                </div>
            )}
        </div>
    );
});
