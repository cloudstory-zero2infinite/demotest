import React from 'react';
import { Modal } from './Modal';
import { CustomFieldCreate } from '../../services/supabase';

interface ImportConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  newFields: CustomFieldCreate[];
  moduleName: string;
}

export const ImportConfirmationModal: React.FC<ImportConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  newFields,
  moduleName
}) => {
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Custom Fields Detected">
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        The following new columns were found in your file. They will be automatically added as custom fields for <strong>{moduleName}</strong> module:
      </p>

      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-100 dark:bg-gray-900">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Column Header</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Detected Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {newFields.map((field, idx) => (
              <tr key={idx}>
                <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100 font-medium">{field.field_label}</td>
                <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                    {field.field_type}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end space-x-3">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600 transition-colors"
        >
          Cancel Import
        </button>
        <button
          onClick={onConfirm}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors shadow-sm"
        >
          Confirm & Import Data
        </button>
      </div>
    </Modal>
  );
};
