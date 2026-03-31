import React from 'react';
import { XIcon } from '../Icons';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
  hideCloseButton?: boolean;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children, title, hideCloseButton = false }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[300] flex justify-center items-center p-4" onClick={onClose} aria-modal="true" role="dialog">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b dark:border-gray-700">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h3>
          {!hideCloseButton && (
            <button onClick={onClose} className="text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg p-1.5" aria-label="Close modal">
              <XIcon className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};
