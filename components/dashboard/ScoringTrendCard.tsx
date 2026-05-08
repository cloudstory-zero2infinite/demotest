import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ExpandableChartModal } from '../common/ExpandableChartModal';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Asset, InternalControl, Vulnerability } from '../../types';
import { getScoringTrend, ScoringSnapshot } from '../../services/supabase';


interface TrendDataPoint {
  date: string;
  assets: number;
  controls: number;
  tasks: number;
  policies: number;
  securityScore: number;
  vulnerabilities: number;
}


interface ScoringTrendCardProps {
  className?: string;
  assets?: Asset[];
  controls?: InternalControl[];
  vulnerabilities?: Vulnerability[];
  tasks?: any[];
  policies?: any[];
}

export const ScoringTrendCard: React.FC<ScoringTrendCardProps> = ({ 
  className = '', 
  assets = [], 
  controls = [], 
  vulnerabilities = [],
  tasks = [],
  policies = []
}) => {

  const cardRef = useRef<HTMLDivElement>(null);
  const expandedRef = useRef<HTMLDivElement>(null);
  const [selectedRange, setSelectedRange] = useState<string>('1week');
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [currentScore, setCurrentScore] = useState<number>(0);
  const [scoreChange, setScoreChange] = useState<{ value: number; percentage: number }>({ value: 0, percentage: 0 });
  const [summaryStats, setSummaryStats] = useState({
    avgScore: 0,
    totalAssets: 0,
    totalVulnerabilities: 0,
    totalControls: 0,
    totalTasks: 0,
    totalPolicies: 0
  });

  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [activeMetric, setActiveMetric] = useState<string | null>(null);


  // Download functions for expanded modal
  const downloadExpandedAsJPEG = async () => {
    if (expandedRef.current) {
      try {
        const canvas = await html2canvas(expandedRef.current, {
          backgroundColor: '#ffffff',
          scale: 2,
          logging: false
        });
        
        const link = document.createElement('a');
        link.download = `scoring-trend-expanded-${new Date().toISOString().split('T')[0]}.jpeg`;
        link.href = canvas.toDataURL('image/jpeg', 0.9);
        link.click();
      } catch (error) {
        console.error('Error generating JPEG:', error);
      }
    }
  };

  const downloadExpandedAsPDF = async () => {
    if (expandedRef.current) {
      try {
        const canvas = await html2canvas(expandedRef.current, {
          backgroundColor: '#ffffff',
          scale: 2,
          logging: false
        });
        
        const imgData = canvas.toDataURL('image/jpeg', 0.9);
        const pdf = new jsPDF({
          orientation: 'landscape',
          unit: 'mm',
          format: 'a4'
        });
        
        const imgWidth = 280;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        const x = (pdf.internal.pageSize.getWidth() - imgWidth) / 2;
        const y = (pdf.internal.pageSize.getHeight() - imgHeight) / 2;
        
        pdf.addImage(imgData, 'JPEG', x, y, imgWidth, imgHeight);
        pdf.save(`scoring-trend-expanded-${new Date().toISOString().split('T')[0]}.pdf`);
      } catch (error) {
        console.error('Error generating PDF:', error);
      }
    }
  };

  const timeRanges = [
    { id: '1week', label: '1W' },
    { id: '1month', label: '1M' },
    { id: '1quarter', label: '1Q' },
    { id: '1year', label: '1Y' }
  ];


  // Calculate real data based on actual database records
  useEffect(() => {
    // Ensure data is available before processing
    if (!assets || !controls || !vulnerabilities) {
      return;
    }
    
    // Calculate current statistics from real data
    // Calculate current score using weighted average formula (Matches DashboardTab.tsx)
    const score = (successCount: number, total: number, weight: number) =>
        total > 0 ? (successCount / total) * weight : 0;

    const controlsScore = score(controls.filter(c => c.ctl_status === 'Enforced').length, controls.length, 30);
    const programScore = score(tasks.filter(t => t.status === 'Completed').length, tasks.length, 25);
    const vulnerabilitiesScore = score(vulnerabilities.filter(v => v.status === 'Remediated').length, vulnerabilities.length, 20);
    const assetsScore = score(assets.filter(a => a.governed_status === 'Governed').length, assets.length, 15);
    const policiesScore = score(policies.filter((p: any) => p.policy_status === 'approved').length, policies.length, 10);

    const securityScore = Math.round((controlsScore + programScore + vulnerabilitiesScore + assetsScore + policiesScore) * 10) / 10;
    
    const totalAssets = assets.length;
    const totalVulnerabilities = vulnerabilities.length;
    const totalControls = controls.length;
    
    const fetchTrendData = async () => {
      try {
        const history = await getScoringTrend(selectedRange);
        let finalData: TrendDataPoint[] = [];
        
        if (history && history.length > 0) {
          finalData = history.map(h => ({
            date: new Date(h.snapshot_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            assets: h.total_assets,
            controls: h.total_controls,
            tasks: h.total_tasks || 0,
            policies: h.total_policies || 0,
            securityScore: Number(h.score),
            vulnerabilities: h.total_vulnerabilities
          }));
          
          const lastSnapshotDate = history[history.length - 1].snapshot_date;
          const todayStr = new Date().toISOString().split('T')[0];
          
          // Live data point for today
          const livePoint = {
            date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            assets: totalAssets,
            controls: totalControls,
            tasks: tasks.length,
            policies: policies.length,
            securityScore: securityScore,
            vulnerabilities: totalVulnerabilities
          };

          if (lastSnapshotDate === todayStr) {
            // Replace the last snapshot with live data for better UX consistency
            finalData[finalData.length - 1] = livePoint;
          } else {
            // Append live data as the latest point
            finalData.push(livePoint);
          }
        } else {
          // No history, just show today's live data
          finalData = [{
            date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            assets: totalAssets,
            controls: totalControls,
            tasks: tasks.length,
            policies: policies.length,
            securityScore: securityScore,
            vulnerabilities: totalVulnerabilities
          }];
        }

        
        setTrendData(finalData);
        
        // Calculate current score and change from the final dataset
        if (finalData.length > 0) {
          const latest = finalData[finalData.length - 1].securityScore;
          const previous = finalData.length > 1 ? finalData[finalData.length - 2].securityScore : latest;
          setCurrentScore(latest);
          setScoreChange({
            value: Number((latest - previous).toFixed(1)),
            percentage: previous > 0 ? Number(((latest - previous) / previous * 100).toFixed(2)) : 0
          });
        }
      } catch (error) {
        console.error('Failed to fetch real trend data:', error);
      }
    };

    fetchTrendData();
    
    // Always update summary stats with live data
    setSummaryStats({
      avgScore: securityScore,
      totalAssets: totalAssets,
      totalVulnerabilities: totalVulnerabilities,
      totalControls: totalControls,
      totalTasks: tasks.length,
      totalPolicies: policies.length
    });

  }, [selectedRange, assets, controls, vulnerabilities, tasks, policies]);


  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      // If we are hovering a specific line, only show that line.
      // Otherwise (if shared is true and no metric active), show all.
      const displayPayload = activeMetric 
        ? payload.filter((entry: any) => entry.dataKey === activeMetric)
        : payload;

      if (displayPayload.length === 0) return null;

      return (
        <div className="bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
          <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">{label}</p>
          {displayPayload.map((entry: any, index: number) => (
            <p key={index} className="text-xs" style={{ color: entry.color }}>
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };


  return (
    <div ref={cardRef} className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Scoring Trend</h3>
          <div className="flex items-center mt-2">
            <span className="text-2xl font-bold text-gray-900 dark:text-white">
              {currentScore} / 100
            </span>
            <span className={`ml-3 text-sm font-medium ${
              scoreChange.value >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {scoreChange.value >= 0 ? '+' : ''}{scoreChange.value} ({scoreChange.percentage >= 0 ? '+' : ''}{scoreChange.percentage}%)
            </span>
          </div>
        </div>
        <button
          onClick={() => setIsExpanded(true)}
          className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Expand chart"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      </div>

      {/* Time Range Selection */}
      <div className="flex gap-2 mb-2">
        {timeRanges.map((range) => (
          <button
            key={range.id}
            onClick={() => setSelectedRange(range.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
              selectedRange === range.id
                ? 'border-gray-400 bg-gray-100 text-gray-900'
                : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-800'
            }`}
          >
            {range.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="h-40 mb-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trendData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 12 }}
              stroke="#6b7280"
            />
            <YAxis 
              domain={[0, 100]}
              tick={{ fontSize: 12 }}
              stroke="#6b7280"
            />
            <Tooltip content={<CustomTooltip />} shared={false} />

            <Legend 
              wrapperStyle={{ fontSize: '12px' }}
              iconType="line"
            />
            <Line
              type="monotone"
              dataKey="assets"
              stroke="#10b981"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name="Assets"
              onMouseEnter={() => setActiveMetric('assets')}
              onMouseLeave={() => setActiveMetric(null)}
            />
            <Line
              type="monotone"
              dataKey="controls"
              stroke="#f97316"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name="Controls"
              onMouseEnter={() => setActiveMetric('controls')}
              onMouseLeave={() => setActiveMetric(null)}
            />
            <Line
              type="monotone"
              dataKey="tasks"
              stroke="#8b5cf6"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name="Program"
              onMouseEnter={() => setActiveMetric('tasks')}
              onMouseLeave={() => setActiveMetric(null)}
            />
            <Line
              type="monotone"
              dataKey="policies"
              stroke="#06b6d4"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name="Policies"
              onMouseEnter={() => setActiveMetric('policies')}
              onMouseLeave={() => setActiveMetric(null)}
            />
            <Line
              type="monotone"
              dataKey="securityScore"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              name="Security Score"
              onMouseEnter={() => setActiveMetric('securityScore')}
              onMouseLeave={() => setActiveMetric(null)}
            />
            <Line
              type="monotone"
              dataKey="vulnerabilities"
              stroke="#ef4444"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name="Vulnerabilities"
              onMouseEnter={() => setActiveMetric('vulnerabilities')}
              onMouseLeave={() => setActiveMetric(null)}
            />


          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Expanded Chart Modal */}
      <ExpandableChartModal
        isOpen={isExpanded}
        onClose={() => setIsExpanded(false)}
        title="Scoring Trend - Expanded View"
        downloadActions={
          <>
            <button
              onClick={downloadExpandedAsJPEG}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              aria-label="Download as JPEG"
              title="Download as JPEG"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4 4m0 0l4-4m-4 4V4m12 12l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            <button
              onClick={downloadExpandedAsPDF}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              aria-label="Download as PDF"
              title="Download as PDF"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </button>
          </>
        }
      >
        <div ref={expandedRef} className="h-full flex flex-col">
          {/* Time Range Selection */}
          <div className="flex gap-2 mb-4">
            {timeRanges.map((range) => (
              <button
                key={range.id}
                onClick={() => setSelectedRange(range.id)}
                className={`px-3 py-1.5 text-sm font-medium rounded-full border transition-all ${
                  selectedRange === range.id
                    ? 'border-gray-400 bg-gray-100 text-gray-900'
                    : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-800'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>

          {/* Chart and Stats Container */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Expanded Chart */}
            <div className="lg:col-span-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }}
                    stroke="#6b7280"
                  />
                  <YAxis 
                    domain={[0, 100]}
                    tick={{ fontSize: 12 }}
                    stroke="#6b7280"
                  />
                  <Tooltip content={<CustomTooltip />} shared={false} />

                  <Legend 
                    wrapperStyle={{ fontSize: '12px' }}
                    iconType="line"
                  />
                  <Line
                    type="monotone"
                    dataKey="assets"
                    stroke="#10b981"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    name="Assets"
                    onMouseEnter={() => setActiveMetric('assets')}
                    onMouseLeave={() => setActiveMetric(null)}
                  />
                  <Line
                    type="monotone"
                    dataKey="controls"
                    stroke="#f97316"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    name="Controls"
                    onMouseEnter={() => setActiveMetric('controls')}
                    onMouseLeave={() => setActiveMetric(null)}
                  />
                  <Line
                    type="monotone"
                    dataKey="tasks"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    name="Program"
                    onMouseEnter={() => setActiveMetric('tasks')}
                    onMouseLeave={() => setActiveMetric(null)}
                  />
                  <Line
                    type="monotone"
                    dataKey="policies"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    name="Policies"
                    onMouseEnter={() => setActiveMetric('policies')}
                    onMouseLeave={() => setActiveMetric(null)}
                  />
                  <Line
                    type="monotone"
                    dataKey="securityScore"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    name="Security Score"
                    onMouseEnter={() => setActiveMetric('securityScore')}
                    onMouseLeave={() => setActiveMetric(null)}
                  />
                  <Line
                    type="monotone"
                    dataKey="vulnerabilities"
                    stroke="#ef4444"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    name="Vulnerabilities"
                    onMouseEnter={() => setActiveMetric('vulnerabilities')}
                    onMouseLeave={() => setActiveMetric(null)}
                  />


                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Summary Panel */}
            <div className="space-y-4">
              {/* Current Score Display */}
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                <div className="text-center">
                  <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">{currentScore}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Current Score</div>
                  <div className={`text-sm font-medium ${
                    scoreChange.value >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {scoreChange.value >= 0 ? '+' : ''}{scoreChange.value} ({scoreChange.percentage >= 0 ? '+' : ''}{scoreChange.percentage}%)
                  </div>
                </div>
              </div>

              {/* Summary Statistics */}
              <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Avg Score</div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white">{summaryStats.avgScore}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Assets</div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white">{summaryStats.totalAssets}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Vulns</div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white">{summaryStats.totalVulnerabilities}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Controls</div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white">{summaryStats.totalControls}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Tasks</div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white">{summaryStats.totalTasks}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Policies</div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white">{summaryStats.totalPolicies}</div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </ExpandableChartModal>

    </div>
  );
};
