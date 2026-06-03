import React from 'react';
import { ChartCard } from './ChartCard';

export interface PolicyStatusSegment {
    key: string;
    label: string;
    value: number;
    color: string;
}

interface Props {
    segments: PolicyStatusSegment[];
    total: number;
    approvedPct: number;
}

// Policy status as a single stacked horizontal bar (avoids a 5th donut on the
// dashboard). Headline shows % approved; hover each segment for its count.
export const PolicyStatusCard: React.FC<Props> = ({ segments, total, approvedPct }) => {
    const right = <span className="text-xs text-gray-400">{total} policies</span>;
    const visible = segments.filter(s => s.value > 0);
    return (
        <ChartCard title="Policy Status" right={right}>
            <div className="flex items-baseline justify-between mb-2">
                <span className="text-2xl font-bold text-gray-900 dark:text-white">{approvedPct.toFixed(0)}%</span>
                <span className="text-[10px] uppercase tracking-wider text-gray-400">Approved</span>
            </div>
            {total === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">No policies yet.</p>
            ) : (
                <>
                    <div className="w-full flex h-4 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                        {visible.map(s => (
                            <div
                                key={s.key}
                                style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
                                title={`${s.label}: ${s.value}`}
                                className="transition-all duration-500"
                            />
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                        {segments.map(s => (
                            <span key={s.key} className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                                {s.label} ({s.value})
                            </span>
                        ))}
                    </div>
                </>
            )}
        </ChartCard>
    );
};
