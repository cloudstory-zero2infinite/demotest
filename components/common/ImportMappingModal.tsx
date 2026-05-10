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
  onConfirm: (mapping: ColumnMapping[], assetTypeName?: string) => void;
  headers: string[];
  moduleName: string;
  systemFields: { key: string; label: string; required?: boolean; id?: string }[];
  existingCustomFields: CustomField[];
  currentAssetType?: { id: string; name: string; fields: string[] } | null;
}

/** Matches CSV headers to DB keys despite spaces vs underscores */
const compactKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export const ImportMappingModal: React.FC<ImportMappingModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  headers,
  moduleName,
  systemFields,
  existingCustomFields,
  currentAssetType
}) => {
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [step, setStep] = useState<'mapping' | 'name_type'>('mapping');
  const [assetTypeName, setAssetTypeName] = useState('');

  const isFieldAllowed = (fieldName: string) => {
    if (!currentAssetType) return true;
    
    const allStandardFields = new Set([
      'asset_id', 
      'name', 
      'category', 
      'criticality', 
      'asset_owner', 
      'business_unit', 
      'exposure', 
      'governed_status', 
      'details',
      'source',
      'nn_controls',
      'vulnerability_count',
      'ip_address',
      'mac_id',
      'physical_location'
    ]);

    const cleanFieldName = fieldName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const isStandard = allStandardFields.has(fieldName.toLowerCase()) || allStandardFields.has(cleanFieldName);
    if (isStandard) return true;

    const allowed = new Set(currentAssetType.fields.map(compactKey));
    return allowed.has(compactKey(fieldName));
  };

  useEffect(() => {
    if (isOpen && headers.length > 0) {
      setStep('mapping');
      setAssetTypeName('');
      const initialMappings: ColumnMapping[] = headers.map(header => {
        const trimmed = header.trim();
        const cleanHeader = trimmed.toLowerCase();
        const headerCompact = compactKey(trimmed);

        const systemMatch = systemFields.find(f => {
          const lk = f.label.toLowerCase();
          const kk = f.key.toLowerCase();
          return (
            lk === cleanHeader ||
            kk === cleanHeader ||
            kk.replace(/_/g, ' ') === cleanHeader ||
            lk.replace(/\s/g, '') === cleanHeader.replace(/\s/g, '') ||
            compactKey(f.key) === headerCompact ||
            compactKey(f.label) === headerCompact
          );
        });
        if (systemMatch) {
          if (!isFieldAllowed(systemMatch.key)) {
              return { csvHeader: header, mappedField: 'ignore', type: 'ignore' };
          }
          return { csvHeader: header, mappedField: systemMatch.key, type: 'standard' };
        }

        const customMatch = existingCustomFields.find(f =>
          f.field_label.toLowerCase() === cleanHeader ||
          f.field_name.toLowerCase() === cleanHeader ||
          compactKey(f.field_name) === headerCompact ||
          compactKey(f.field_label) === headerCompact
        );
        if (customMatch) {
          if (!isFieldAllowed(customMatch.field_name)) {
              return { csvHeader: header, mappedField: 'ignore', type: 'ignore' };
          }
          return { csvHeader: header, mappedField: customMatch.field_name, type: 'custom' };
        }

        if (currentAssetType && Array.isArray(currentAssetType.fields)) {
          const profileMatch = currentAssetType.fields.find(f => {
            if (!f) return false;
            const normF = f.toLowerCase().replace(/[^a-z0-9]/g, '_');
            return (
              f.toLowerCase() === cleanHeader ||
              normF === cleanHeader ||
              compactKey(f) === headerCompact
            );
          });
          if (profileMatch) {
            return { csvHeader: header, mappedField: profileMatch, type: 'custom' };
          }
        }

        if (currentAssetType) {
            return { csvHeader: header, mappedField: 'ignore', type: 'ignore' };
        }

        return { csvHeader: header, mappedField: 'create_new_custom', type: 'new' };
      });
      setMappings(initialMappings);
    }
  }, [isOpen, headers, systemFields, existingCustomFields, currentAssetType]);

  const handleMappingChange = (csvHeader: string, value: string) => {
    setMappings(prev => prev.map(m => {
      if (m.csvHeader !== csvHeader) return m;
      if (value === 'create_new_custom') {
        return { ...m, mappedField: 'create_new_custom', type: 'new' };
      } else if (value === 'ignore') {
        return { ...m, mappedField: 'ignore', type: 'ignore' };
      } else {
        const isStandard = systemFields.some(f => f.key === value);
        return { ...m, mappedField: value, type: isStandard ? 'standard' : 'custom' };
      }
    }));
  };

  const isFieldUsed = (fieldKey: string, currentHeader: string) =>
    mappings.some(m => m.mappedField === fieldKey && m.csvHeader !== currentHeader);

  const unmatchedMappings = mappings.filter(m => m.type === 'new');

  const checkNameMapping = () => {
    const hasNameField = systemFields.some(f => f.key === 'name');
    const isNameMapped = mappings.some(m => m.mappedField === 'name');
    
    if (hasNameField && !isNameMapped) {
      alert("Name is mandatory. Please map one of your CSV columns to the 'Name' field.");
      return false;
    }
    return true;
  };

  const handleReviewData = () => {
    if (!checkNameMapping()) return;

    // Only show asset type naming step for the 'assets' module
    if (unmatchedMappings.length > 0 && moduleName === 'Assets') {
      setStep('name_type');
    } else {
      onConfirm(mappings, undefined);
    }
  };

  const handleCreateAndContinue = () => {
    if (!assetTypeName.trim()) return;
    if (!checkNameMapping()) return;
    onConfirm(mappings, assetTypeName.trim());
  };

  const handleSkipAndContinue = () => {
    if (!checkNameMapping()) return;
    onConfirm(mappings, undefined);
  };

  if (!isOpen) return null;

  const hasAvailableFields = systemFields.length > 0 || existingCustomFields.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={step === 'mapping' ? `Map CSV Columns — ${moduleName}` : 'Create New Asset Type'}
    >
      {step === 'mapping' ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Match the columns from your file to system fields or create new custom fields.
          </p>

          {hasAvailableFields && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="max-h-[50vh] overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CSV Column</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Maps To Field</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Status</th>
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
                              {systemFields.filter(f => isFieldAllowed(f.key)).map(field => (
                                <option
                                  key={field.id || field.key}
                                  value={field.key}
                                  disabled={isFieldUsed(field.key, mapping.csvHeader)}
                                >
                                  {field.label} {isFieldUsed(field.key, mapping.csvHeader) ? '(Already mapped)' : ''}
                                </option>
                              ))}
                            </optgroup>
                            {existingCustomFields.filter(f => isFieldAllowed(f.field_name)).length > 0 && (
                              <optgroup label="Existing Custom Fields">
                                {existingCustomFields.filter(f => isFieldAllowed(f.field_name)).map(field => (
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
                            {currentAssetType && Array.isArray(currentAssetType.fields) && currentAssetType.fields.length > 0 && (
                              <optgroup label="Profile Fields">
                                {currentAssetType.fields.map(field => {
                                  const label = field.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                                  return (
                                    <option
                                      key={field}
                                      value={field}
                                      disabled={isFieldUsed(field, mapping.csvHeader)}
                                    >
                                      {label} {isFieldUsed(field, mapping.csvHeader) ? '(Already mapped)' : ''}
                                    </option>
                                  );
                                })}
                              </optgroup>
                            )}
                            <optgroup label="Other Actions">
                              <option value="create_new_custom">Create as New Custom Field</option>
                              <option value="ignore">Ignore this Column</option>
                            </optgroup>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          {mapping.type === 'standard' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">✓ Matched</span>
                          )}
                          {mapping.type === 'custom' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">Custom</span>
                          )}
                          {mapping.type === 'new' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">New Field</span>
                          )}
                          {mapping.type === 'ignore' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">Ignored</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {unmatchedMappings.length > 0 && moduleName === 'Assets' && (
            <div className="flex items-start gap-2 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
              <svg className="h-4 w-4 text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-purple-800 dark:text-purple-200">
                  {unmatchedMappings.length} unmatched column{unmatchedMappings.length !== 1 ? 's' : ''} detected
                </p>
                <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">
                  You'll be asked to create a new Asset Type for these fields on the next step.
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100 dark:border-gray-700">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              onClick={handleReviewData}
              className="px-6 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm"
            >
              {unmatchedMappings.length > 0 && moduleName === 'Assets' ? 'Next: Name Asset Type →' : 'Review Data'}
            </button>
          </div>
        </div>
      ) : (
        /* Step 2: Name the new asset type */
        <div className="space-y-5">
          <div className="flex items-start gap-3 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg">
            <svg className="h-5 w-5 text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-purple-900 dark:text-purple-100">New Asset Type Detected</p>
              <p className="text-sm text-purple-700 dark:text-purple-300 mt-1">
                The following <strong>{unmatchedMappings.length} column{unmatchedMappings.length !== 1 ? 's' : ''}</strong> don't match any existing system or custom fields. These will become a new Asset Type with its own tag in the Assets view.
              </p>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Fields to be created:</p>
            <div className="flex flex-wrap gap-1.5">
              {unmatchedMappings.map(m => (
                <span key={m.csvHeader} className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200">
                  {m.csvHeader}
                </span>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Asset Type Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={assetTypeName}
              onChange={e => setAssetTypeName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && assetTypeName.trim() && handleCreateAndContinue()}
              placeholder="e.g. User Endpoints, Mobile Assets, Cloud Services..."
              className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-purple-500 focus:border-purple-500"
              autoFocus
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              This name will appear as a tag beside "All Assets" to filter assets of this type.
            </p>
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              <strong>Note:</strong> Asset ID is always auto-generated by the system — you don't need an Asset ID column in your file. Asset Name is required and must be mapped.
            </p>
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-gray-100 dark:border-gray-700">
            <button
              onClick={() => setStep('mapping')}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            >
              ← Back
            </button>
            <div className="flex gap-3">
              <button
                onClick={handleSkipAndContinue}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
              >
                Skip (Import Without Type)
              </button>
              <button
                onClick={handleCreateAndContinue}
                disabled={!assetTypeName.trim()}
                className="px-6 py-2 text-sm font-medium text-white bg-purple-600 border border-transparent rounded-md hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 shadow-sm"
              >
                Create Type &amp; Import →
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
