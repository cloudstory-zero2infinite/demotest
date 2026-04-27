import React from 'react';

interface ExpandableChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  downloadActions?: React.ReactNode;
}

export const ExpandableChartModal: React.FC<ExpandableChartModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  downloadActions
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="relative w-full max-w-7xl h-[90vh] bg-white dark:bg-gray-800 rounded-lg shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h2>
          <div className="flex items-center gap-2">
            {downloadActions}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              aria-label="Close expanded view"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Chart Content */}
        <div className="flex-1 p-4 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};
