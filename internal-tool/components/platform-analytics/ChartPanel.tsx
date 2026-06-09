import React, { useState } from 'react';
import { exportRowsToXlsx } from '../../utils/xlsx';
import { downloadCsv } from './analyticsLogic';

interface ChartPanelProps {
  title: string;
  subtitle?: string;
  /** Rows shown in table view and exported to CSV/XLSX. */
  tableRows: Record<string, any>[];
  /** Base filename (no extension) for downloads. */
  filename: string;
  /** Optional controls (dropdowns/toggles) rendered in the header. */
  controls?: React.ReactNode;
  /** Optional custom table view; when set it replaces the auto-generated table
   *  (downloads still use tableRows). Useful for editable cells. */
  renderTable?: () => React.ReactNode;
  children: React.ReactNode;
}

export const ChartPanel: React.FC<ChartPanelProps> = ({
  title,
  subtitle,
  tableRows,
  filename,
  controls,
  renderTable,
  children,
}) => {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const headers = tableRows.length ? Object.keys(tableRows[0]) : [];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4 flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {controls}
          <div className="inline-flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden text-xs">
            <button
              onClick={() => setView('chart')}
              className={`px-2.5 py-1 ${
                view === 'chart'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'
              }`}
            >
              Chart
            </button>
            <button
              onClick={() => setView('table')}
              className={`px-2.5 py-1 border-l border-gray-300 dark:border-gray-600 ${
                view === 'table'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'
              }`}
            >
              Table
            </button>
          </div>
        </div>
      </div>

      {view === 'chart' ? (
        <div className="flex-1 min-h-0">{children}</div>
      ) : (
        <div className="flex-1 flex flex-col">
          <div className="flex justify-end gap-2 mb-2">
            <button
              onClick={() => downloadCsv(tableRows, `${filename}.csv`)}
              disabled={!tableRows.length}
              className="px-2.5 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
            >
              Download CSV
            </button>
            <button
              onClick={() => exportRowsToXlsx(tableRows, `${filename}.xlsx`)}
              disabled={!tableRows.length}
              className="px-2.5 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
            >
              Download XLSX
            </button>
          </div>
          {renderTable ? (
            renderTable()
          ) : (
          <div className="overflow-auto max-h-80 border border-gray-200 dark:border-gray-700 rounded">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                <tr>
                  {headers.map((h) => (
                    <th
                      key={h}
                      className="text-left font-medium px-3 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                    {headers.map((h) => (
                      <td key={h} className="px-3 py-1.5 text-gray-700 dark:text-gray-200 whitespace-nowrap">
                        {row[h] == null ? '' : String(row[h])}
                      </td>
                    ))}
                  </tr>
                ))}
                {!tableRows.length && (
                  <tr>
                    <td className="px-3 py-3 text-gray-400" colSpan={Math.max(1, headers.length)}>
                      No data
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}
    </div>
  );
};

// Small shared dropdown used by period-based cards.
export const PeriodSelect: React.FC<{
  value: string;
  onChange: (v: any) => void;
  options: { id: string; label: string }[];
}> = ({ value, onChange, options }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-2 py-1"
  >
    {options.map((o) => (
      <option key={o.id} value={o.id}>
        {o.label}
      </option>
    ))}
  </select>
);
