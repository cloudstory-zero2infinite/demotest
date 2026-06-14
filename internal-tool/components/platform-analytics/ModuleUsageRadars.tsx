import React, { useMemo } from 'react';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { AnalyticsModuleUsage } from '../../types';
import { ChartPanel } from './ChartPanel';
import { ACCENT, RADAR_FUNCTIONS, radarData } from './analyticsLogic';

export const ModuleUsageRadars: React.FC<{ moduleUsage: AnalyticsModuleUsage[] }> = ({
  moduleUsage,
}) => {
  const charts = useMemo(
    () => RADAR_FUNCTIONS.map((fn) => ({ fn, data: radarData(fn, moduleUsage) })),
    [moduleUsage]
  );

  const tableRows = useMemo(
    () =>
      charts.flatMap(({ fn, data }) =>
        data.map((d) => ({ function: fn.title, sub_tab: d.spoke, activity: d.value }))
      ),
    [charts]
  );

  return (
    <ChartPanel
      title="Module usage"
      subtitle="Activity-log events per function & sub-tab"
      tableRows={tableRows}
      filename="module-usage"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {charts.map(({ fn, data }) => (
          <div key={fn.title} className="flex flex-col items-center">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{fn.title}</p>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid />
                  <PolarAngleAxis dataKey="spoke" tick={{ fontSize: 10 }} />
                  <PolarRadiusAxis tick={{ fontSize: 9 }} angle={90} />
                  <Radar dataKey="value" stroke={ACCENT} fill={ACCENT} fillOpacity={0.4} />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    </ChartPanel>
  );
};
