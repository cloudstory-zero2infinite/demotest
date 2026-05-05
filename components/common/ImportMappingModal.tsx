import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { CustomField } from '../../services/supabase';

export interface ColumnMapping {
  csvHeader: string;
  mappedField: string; // Internal field name or 'create_new_custom' or 'ignore'
  type: 'standard' | 'custom' | 'new' | 'ignore';
}

interface ImportMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (mapping: ColumnMapping[]) => void;
  headers: string[];
  moduleName: string;
  systemFields: { key: string; label: string }[];
  existingCustomFields: CustomField[];
}

export const ImportMappingModal: React.FC<ImportMappingModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  headers,
  moduleName,
  systemFields,
  existingCustomFields
}) => {
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);

  useEffect(() => {
    if (isOpen && headers.length > 0) {
      // Generate initial mappings based on best guess
      const initialMappings: ColumnMapping[] = headers.map(header => {
        const cleanHeader = header.trim().toLowerCase();
        
        // 1. Check system fields
        const systemMatch = systemFields.find(f => 
          f.label.toLowerCase() === cleanHeader || 
          f.key.toLowerCase() === cleanHeader ||
          f.label.toLowerCase().replace(/\s/g, '') === cleanHeader.replace(/\s/g, '')
        );
        if (systemMatch) {
          return { csvHeader: header, mappedField: systemMatch.key, type: 'standard' };
        }

        // 2. Check existing custom fields
        const customMatch = existingCustomFields.find(f => 
          f.field_label.toLowerCase() === cleanHeader || 
          f.field_name.toLowerCase() === cleanHeader
        );
        if (customMatch) {
          return { csvHeader: header, mappedField: customMatch.field_name, type: 'custom' };
        }

        // 3. Default to new custom field
        return { csvHeader: header, mappedField: 'create_new_custom', type: 'new' };
      });
      setMappings(initialMappings);
    }
  }, [isOpen, headers, systemFields, existingCustomFields]);

  const handleMappingChange = (csvHeader: string, value: string) => {
    setMappings(prev => prev.map(m => {
      if (m.csvHeader !== csvHeader) return m;

      if (value === 'create_new_custom') {
        return { ...m, mappedField: 'create_new_custom', type: 'new' };
      } else if (value === 'ignore') {
        return { ...m, mappedField: 'ignore', type: 'ignore' };
      } else {
        // Check if it's standard or custom
        const isStandard = systemFields.some(f => f.key === value);
        return { 
          ...m, 
          mappedField: value, 
          type: isStandard ? 'standard' : 'custom' 
        };
      }
    }));
  };

  const isFieldUsed = (fieldKey: string, currentHeader: string) => {
    return mappings.some(m => m.mappedField === fieldKey && m.csvHeader !== currentHeader);
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Map CSV Columns - ${moduleName}`}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Match the columns from your file to the system fields. Columns not matched will be added as new custom fields or ignored.
        </p>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="max-h-[50vh] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CSV Column</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Maps To Field</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {mappings.map((mapping) => (
                  <tr key={mapping.csvHeader} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                      {mapping.csvHeader}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={mapping.mappedField}
                        onChange={(e) => handleMappingChange(mapping.csvHeader, e.target.value)}
                        className={`block w-full rounded-md border-gray-300 shadow-sm sm:text-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                          mapping.type === 'new' ? 'text-purple-600 dark:text-purple-400' : 
                          mapping.type === 'ignore' ? 'text-gray-400' : ''
                        }`}
                      >
                        <optgroup label="System Fields">
                          {systemFields.map(field => (
                            <option 
                              key={field.key} 
                              value={field.key}
                              disabled={isFieldUsed(field.key, mapping.csvHeader)}
                            >
                              {field.label} {isFieldUsed(field.key, mapping.csvHeader) ? '(Already mapped)' : ''}
                            </option>
                          ))}
                        </optgroup>
                        
                        {existingCustomFields.length > 0 && (
                          <optgroup label="Existing Custom Fields">
                            {existingCustomFields.map(field => (
                              <option 
                                key={field.field_name} 
                                value={field.field_name}
                                disabled={isFieldUsed(field.field_name, mapping.csvHeader)}
                              >
                                {field.field_label} {isFieldUsed(field.field_name, mapping.csvHeader) ? '(Already mapped)' : ''}
                              </option>
                            ))}
                          </optgroup>
                        )}

                        <optgroup label="Other Actions">
                          <option value="create_new_custom">Create as New Custom Field</option>
                          <option value="ignore">Ignore this Column</option>
                        </optgroup>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(mappings)}
            className="px-6 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm"
          >
            Review Data
          </button>
        </div>
      </div>
    </Modal>
  );
};
