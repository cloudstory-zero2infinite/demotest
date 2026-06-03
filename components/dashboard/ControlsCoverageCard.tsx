import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { ChartCard } from './ChartCard';
import { CHART_TOOLTIP_STYLE, STATUS_COLORS, CATEGORY_COLORS } from './chartTheme';

export interface ControlCategory {
    name: string; // 'Standard' | 'Regulatory' | 'NN' | 'Other'
    total: number;
    enforced: number;
    inReview: number;
    notEnforced: number;
}

interface Props {
    categories: ControlCategory[];
}

// Controls Coverage as a two-ring "sunburst" (nested Recharts Pie): the inner
// ring is the control category, the outer ring its enforcement breakdown. Both
// rings share the same total so they align angularly. Center = overall enforced %.
export const ControlsCoverageCard: React.FC<Props> = ({ categories }) => {
    const cats = categories.filter(c => c.total > 0);
    const total = cats.reduce((s, c) => s + c.total, 0);
    const enforced = cats.reduce((s, c) => s + c.enforced, 0);
    const pct = total > 0 ? (enforced / total) * 100 : 0;

    const inner = cats.map(c => ({ name: c.name, value: c.total, color: CATEGORY_COLORS[c.name] || CATEGORY_COLORS.Other }));
    const outer = cats.flatMap(c => [
        { name: `${c.name} · Enforced`, value: c.enforced, color: STATUS_COLORS.enforced },
        { name: `${c.name} · In Review`, value: c.inReview, color: STATUS_COLORS.inReview },
        { name: `${c.name} · Not Enforced`, value: c.notEnforced, color: STATUS_COLORS.notEnforced },
    ].filter(s => s.value > 0));

    const right = <span className="text-xs text-gray-400">{total} controls</span>;

    return (
        <ChartCard title="Controls Coverage" right={right}>
            <div className="relative flex-1" style={{ height: '190px' }}>
                {total === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">No controls yet.</p>
                ) : (
                    <>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={inner} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55} stroke="none">
                                    {inner.map((e, i) => <Cell key={`in-${i}`} fill={e.color} />)}
                                </Pie>
                                <Pie data={outer} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={82} paddingAngle={1} stroke="none">
                                    {outer.map((e, i) => <Cell key={`out-${i}`} fill={e.color} />)}
                                </Pie>
                                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: any, n: any) => [v, n]} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                            <span className="block text-xl font-bold text-gray-800 dark:text-gray-200">{pct.toFixed(0)}%</span>
                            <span className="text-[9px] text-gray-400 uppercase tracking-wider">Enforced</span>
                        </div>
                    </>
                )}
            </div>
            {total > 0 && (
                <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1">
                    {cats.map(c => (
                        <span key={c.name} className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[c.name] || CATEGORY_COLORS.Other }} />
                            {c.name} ({c.enforced}/{c.total})
                        </span>
                    ))}
                </div>
            )}
        </ChartCard>
    );
};
