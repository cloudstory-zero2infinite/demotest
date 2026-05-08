import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { SortUpIcon, SortDownIcon } from '../Icons';

interface FilterDropdownProps {
  columnKey: string;
  items: any[];
  columnFilters: Record<string, string[]>;
  setColumnFilters: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  onClose: () => void;
  triggerRect: DOMRect | null;
  sortConfig?: { key: string; direction: 'ascending' | 'descending' } | null;
  requestSort?: (key: string, direction: 'ascending' | 'descending') => void;
  hasFilter?: boolean;
}

export const FilterDropdown: React.FC<FilterDropdownProps> = ({
  columnKey,
  items,
  columnFilters,
  setColumnFilters,
  onClose,
  triggerRect,
  sortConfig,
  requestSort,
  hasFilter = true
}) => {
  // Extract unique values for the column
  const uniqueValues = useMemo(() => {
    const values = new Set<string>();
    items.forEach((item: any) => {
      let val;
      if (columnKey.startsWith('custom_field_')) {
        const fieldName = columnKey.replace('custom_field_', '');
        val = item.custom_fields?.[fieldName];
      } else {
        val = item[columnKey];
      }
      
      // Normalize values for display
      const displayVal = val !== undefined && val !== null && val !== "" ? String(val) : '-';
      values.add(displayVal);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [items, columnKey]);

  const [localSelectedValues, setLocalSelectedValues] = useState<string[]>(columnFilters[columnKey] || []);

  const handleToggle = (val: string) => {
    setLocalSelectedValues(prev => 
      prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
    );
  };

  const handleClear = () => {
    setColumnFilters(prev => {
      const next = { ...prev };
      delete next[columnKey];
      return next;
    });
    onClose();
  };

  const handleSave = () => {
    setColumnFilters(prev => {
      if (localSelectedValues.length === 0) {
        const next = { ...prev };
        delete next[columnKey];
        return next;
      }
      return { ...prev, [columnKey]: localSelectedValues };
    });
    onClose();
  };

  if (!triggerRect) return null;

  const style: React.CSSProperties = {
    position: 'fixed',
    zIndex: 9999,
    top: triggerRect.bottom + 4,
    left: triggerRect.left,
  };

  return createPortal(
    <div 
      style={style} 
      className="FilterDropdownCore w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg p-3" 
      onClick={e => e.stopPropagation()}
    >
      <div className="mb-2 space-y-1">
        <button 
          onClick={() => { if(requestSort) requestSort(columnKey, 'ascending'); onClose(); }}
          className={`w-full text-left px-2 py-1.5 text-sm rounded ${sortConfig?.key === columnKey && sortConfig.direction === 'ascending' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
        >
          <div className="flex items-center">
            <SortUpIcon className="h-4 w-4 mr-2" />
            Sort Ascending
          </div>
        </button>
        <button 
          onClick={() => { if(requestSort) requestSort(columnKey, 'descending'); onClose(); }}
          className={`w-full text-left px-2 py-1.5 text-sm rounded ${sortConfig?.key === columnKey && sortConfig.direction === 'descending' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
        >
          <div className="flex items-center">
            <SortDownIcon className="h-4 w-4 mr-2" />
            Sort Descending
          </div>
        </button>
      </div>

      {hasFilter && (
        <>
          <div className="border-t border-gray-200 dark:border-gray-700 my-2"></div>
          <div className="mb-3 max-h-48 overflow-y-auto space-y-1">
        {uniqueValues.map(val => (
          <label key={val} className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer p-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 rounded transition-colors">
            <input
              type="checkbox"
              checked={localSelectedValues.includes(val)}
              onChange={() => handleToggle(val)}
              className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700"
            />
            <span className="truncate">{val}</span>
          </label>
        ))}
      </div>
      <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex items-center justify-between">
        <button
          onClick={handleClear}
          disabled={!columnFilters[columnKey]?.length && localSelectedValues.length === 0}
          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          Clear Filter
        </button>
        <div className="flex space-x-2">
          <button 
            onClick={onClose} 
            className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 px-2 py-1"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave} 
            className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded shadow-sm transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
      </>
      )}
    </div>,
    document.body
  );
};
