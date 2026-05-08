import React from 'react';
import { Modal } from './Modal';
import { CustomFieldCreate } from '../../services/supabase';

interface ImportConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  newFields: CustomFieldCreate[];
  moduleName: string;
  assetTypeName?: string;
}

export const ImportConfirmationModal: React.FC<ImportConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  newFields,
  moduleName,
  assetTypeName
}) => {
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={assetTypeName ? `Create Asset Type: ${assetTypeName}` : "New Custom Fields Detected"}>
      {assetTypeName ? (
        <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
          <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
            A new asset type <strong>"{assetTypeName}"</strong> will be created with the following fields:
          </p>
        </div>
      ) : (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          The following new columns were found in your file. They will be automatically added as custom fields for <strong>{moduleName}</strong> module:
        </p>
      )}

      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-100 dark:bg-gray-900">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Column Header</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Detected Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {newFields?.map((field, idx) => (
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

      <div className="mb-6 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex gap-2">
        <svg className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-blue-800 dark:text-blue-200">
          <strong>Note:</strong> Any missing <code>asset_id</code> values will be <strong>auto-generated</strong> automatically by the system.
        </p>
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
