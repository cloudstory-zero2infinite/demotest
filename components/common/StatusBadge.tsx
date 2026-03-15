import React from 'react';

interface StatusBadgeProps {
  status: string | number;
  colorMap: Record<string | number, string>;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, colorMap }) => {
    const color = colorMap[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    const statusText = typeof status === 'number' 
      ? (status === 0 ? 'Draft' : 'Published')
      : status;
  
    return (
      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${color}`}>
        {statusText}
      </span>
    );
  };

