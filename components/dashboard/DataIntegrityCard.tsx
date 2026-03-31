import React from 'react';

import { Asset } from '../../types';



interface DataIntegrityCardProps {
    assets: Asset[];
}

function getAssetIntegrityScore(source: string | null | undefined): number {

    const s = (source || '').trim().toLowerCase();

    if (s === 'api') return 100;

    if (s.includes('file upload') || s.includes('csv') || s.includes('import') || s.includes('export')) return 75;

    if (s === 'manual') return 50;

    if (s === 'ai') return 20;

    return 0;

}



const NEEDLE_STOPS = [

    { pct: 0,   label: '0%',   color: '#ef4444' },

    { pct: 33,  label: '33%',  color: '#f59e0b' },

    { pct: 66,  label: '66%',  color: '#84cc16' },

    { pct: 100, label: '100%', color: '#22c55e' },

];



function scoreToColor(score: number): string {

    if (score >= 80) return '#22c55e';

    if (score >= 50) return '#84cc16';

    if (score >= 25) return '#f59e0b';

    return '#ef4444';

}



// Convert a 0–100 score to a needle angle on the gauge (−90° to +90°)

function scoreToAngle(score: number): number {

    return -90 + (score / 100) * 180;

}



export const DataIntegrityCard: React.FC<DataIntegrityCardProps> = React.memo(({ assets }) => {

    const { average, breakdown } = React.useMemo(() => {
        if (assets.length === 0) return { average: 0, breakdown: { ai: 0, manual: 0, api: 0, fileUpload: 0, unknown: 0 } };

        let total = 0;
        const counts = { ai: 0, manual: 0, api: 0, fileUpload: 0, unknown: 0 };

        assets.forEach(a => {
            const s = (a.source || '').trim().toLowerCase();
            const score = getAssetIntegrityScore(a.source);
            total += score;

            if (s === 'ai') counts.ai++;
            else if (s === 'manual') counts.manual++;
            else if (s === 'api') counts.api++;
            else if (s.includes('file upload') || s.includes('csv') || s.includes('import') || s.includes('export')) counts.fileUpload++;
            else counts.unknown++;
        });

        return { average: Math.round(total / assets.length), breakdown: counts };
    }, [assets]);



    const color = scoreToColor(average);

    const angle = scoreToAngle(average);



    // Gauge arc parameters

    const cx = 100;

    const cy = 90;

    const r = 70;

    const startAngle = -180; // left

    const endAngle = 0;      // right (half circle)



    // Build arc path: background (full semicircle) and filled arc

    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const arcPath = (from: number, to: number, radius: number) => {

        const x1 = cx + radius * Math.cos(toRad(from));

        const y1 = cy + radius * Math.sin(toRad(from));

        const x2 = cx + radius * Math.cos(toRad(to));

        const y2 = cy + radius * Math.sin(toRad(to));

        const largeArc = Math.abs(to - from) > 180 ? 1 : 0;

        return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;

    };



    // Filled arc from left (−180°) to score angle

    const filledEndAngle = -180 + (average / 100) * 180;

    const needleX = cx + (r - 10) * Math.cos(toRad(angle - 90));

    const needleY = cy + (r - 10) * Math.sin(toRad(angle - 90));



    const sourceItems = [
        { label: 'API',     score: '100%', count: breakdown.api,     color: '#22c55e' },
        { label: 'File Upload', score: '75%',  count: breakdown.fileUpload,  color: '#3b82f6' },
        { label: 'Manual',  score: '50%',  count: breakdown.manual,  color: '#f59e0b' },
        { label: 'AI',      score: '20%',  count: breakdown.ai,      color: '#6366f1' },
        { label: 'Unknown', score: '0%',   count: breakdown.unknown, color: '#9ca3af' },
    ];



    return (

        <div className="md:col-span-2 lg:col-span-2 p-4 bg-white dark:bg-gray-800 rounded-lg shadow transition-all hover:shadow-md border border-transparent dark:border-gray-700">

            <div className="flex justify-between items-center mb-1">

                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Data Integrity & File Uploads</h3>

                <span

                    className="text-sm font-bold px-2 py-0.5 rounded-full"

                    style={{ color, backgroundColor: `${color}22` }}

                >

                    {average}%

                </span>

            </div>

            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">

                Average across {assets.length} asset{assets.length !== 1 ? 's' : ''} by source

            </p>



            {/* Gauge */}

            <div className="flex justify-center">

                <svg viewBox="0 0 200 105" className="w-48 h-24">

                    {/* Background arc */}

                    <path

                        d={arcPath(startAngle, endAngle, r)}

                        fill="none"

                        stroke="#e5e7eb"

                        strokeWidth={14}

                        strokeLinecap="round"

                        className="dark:stroke-gray-700"

                    />

                    {/* Filled arc */}

                    {average > 0 && (

                        <path

                            d={arcPath(startAngle, filledEndAngle, r)}

                            fill="none"

                            stroke={color}

                            strokeWidth={14}

                            strokeLinecap="round"

                            style={{ transition: 'all 0.6s ease' }}

                        />

                    )}

                    {/* Needle */}

                    <line

                        x1={cx}

                        y1={cy}

                        x2={needleX}

                        y2={needleY}

                        stroke={color}

                        strokeWidth={2.5}

                        strokeLinecap="round"

                        style={{ transition: 'all 0.6s ease' }}

                    />

                    <circle cx={cx} cy={cy} r={5} fill={color} />

                    {/* Labels */}

                    <text x={cx - r - 6} y={cy + 4} fontSize={8} fill="#9ca3af" textAnchor="middle">0</text>

                    <text x={cx + r + 6} y={cy + 4} fontSize={8} fill="#9ca3af" textAnchor="middle">100</text>

                    {/* Centre score */}

                    <text x={cx} y={cy + 18} fontSize={16} fontWeight="bold" fill={color} textAnchor="middle">

                        {average}%

                    </text>

                </svg>

            </div>



            {/* Breakdown legend */}

            <div className="mt-3 space-y-1">

                {sourceItems.map(item => (

                    <div key={item.label} className="flex items-center justify-between text-xs">

                        <div className="flex items-center space-x-1.5">

                            <span

                                className="inline-block h-2 w-2 rounded-full flex-shrink-0"

                                style={{ backgroundColor: item.color }}

                            />

                            <span className="text-gray-600 dark:text-gray-400">{item.label}</span>

                        </div>

                        <div className="flex items-center space-x-2 text-gray-400 dark:text-gray-500">

                            <span>{item.count} asset{item.count !== 1 ? 's' : ''}</span>

                            <span className="font-medium" style={{ color: item.color }}>{item.score}</span>

                        </div>

                    </div>

                ))}

            </div>

        </div>

    );

});

