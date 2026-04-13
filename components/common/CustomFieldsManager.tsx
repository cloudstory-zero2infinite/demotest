import React, { useState, useEffect } from 'react';
import { CustomField, CustomFieldCreate } from '../../services/supabase';
import * as SupabaseService from '../../services/supabase';
import { PlusIcon, TrashIcon, PencilIcon, XIcon } from '../Icons';

interface CustomFieldsManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onFieldChange: () => void;
  moduleName: string;
  title?: string;
}

const CustomFieldsManager: React.FC<CustomFieldsManagerProps> = ({
  isOpen,
  onClose,
  onFieldChange,
  moduleName,
  title = 'Manage Custom Columns',
}) => {
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);

  // Form state
  const [formData, setFormData] = useState<CustomFieldCreate>({
    field_name: '',
    field_label: '',
    field_type: 'text',
    field_options: [],
    is_required: false,
    display_order: 0,
  });

  const fieldTypeOptions: { value: 'text' | 'number' | 'date' | 'select' | 'boolean'; label: string }[] = [
    { value: 'text', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' },
    { value: 'select', label: 'Dropdown' },
    { value: 'boolean', label: 'Yes/No' },
  ];

  const fetchCustomFields = async () => {
    try {
      setLoading(true);
      setError(null);
      const fields = await SupabaseService.getCustomFields(moduleName);
      setCustomFields(fields);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCustomFields();
    }
  }, [isOpen, moduleName]);

  const resetForm = () => {
    setFormData({
      field_name: '',
      field_label: '',
      field_type: 'text',
      field_options: [],
      is_required: false,
      display_order: customFields.length,
    });
    setShowAddForm(false);
    setEditingField(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      setError(null);

      // Validate field name (alphanumeric and underscores only)
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(formData.field_name)) {
        setError('Field name must start with a letter or underscore and contain only letters, numbers, and underscores');
        return;
      }

      // Validate select options
      if (formData.field_type === 'select' && (!formData.field_options || formData.field_options.length === 0)) {
        setError('Dropdown fields must have at least one option');
        return;
      }

      if (editingField) {
        // Update existing field
        await SupabaseService.updateCustomField(moduleName, editingField.id, formData);
      } else {
        // Create new field
        await SupabaseService.createCustomField(moduleName, formData);
      }

      resetForm();
      fetchCustomFields();
      onFieldChange();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (field: CustomField) => {
    setEditingField(field);
    setFormData({
      field_name: field.field_name,
      field_label: field.field_label,
      field_type: field.field_type,
      field_options: field.field_options || [],
      is_required: field.is_required,
      display_order: field.display_order,
    });
    setShowAddForm(true);
  };

  const handleDelete = async (field: CustomField) => {
    if (!confirm(`Are you sure you want to delete the column "${field.field_label}"? This will also delete all data stored in this column.`)) {
      return;
    }

    try {
      setLoading(true);
      await SupabaseService.deleteCustomField(moduleName, field.id);
      fetchCustomFields();
      onFieldChange();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...(formData.field_options || [])];
    newOptions[index] = value;
    setFormData({ ...formData, field_options: newOptions });
  };

  const addOption = () => {
    setFormData({
      ...formData,
      field_options: [...(formData.field_options || []), ''],
    });
  };

  const removeOption = (index: number) => {
    const newOptions = (formData.field_options || []).filter((_, i) => i !== index);
    setFormData({ ...formData, field_options: newOptions });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              {title}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <XIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                {error}
              </div>
            )}

            {/* Add/Edit Form */}
            {showAddForm && (
              <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <h4 className="text-md font-medium text-gray-900 dark:text-white mb-4">
                  {editingField ? 'Edit Column' : 'Add New Column'}
                </h4>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Column Name (Internal)
                      </label>
                      <input
                        type="text"
                        value={formData.field_name}
                        onChange={(e) => setFormData({ ...formData, field_name: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                        placeholder="e.g., warranty_expiry"
                        required
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Use letters, numbers, and underscores only
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Display Label
                      </label>
                      <input
                        type="text"
                        value={formData.field_label}
                        onChange={(e) => setFormData({ ...formData, field_label: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                        placeholder="e.g., Warranty Expiry Date"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Field Type
                      </label>
                      <select
                        value={formData.field_type}
                        onChange={(e) => setFormData({ ...formData, field_type: e.target.value as 'text' | 'number' | 'date' | 'select' | 'boolean' })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                      >
                        {fieldTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center space-x-4">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.is_required}
                          onChange={(e) => setFormData({ ...formData, is_required: e.target.checked })}
                          className="rounded border-gray-300 dark:border-gray-600"
                        />
                        <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Required</span>
                      </label>
                    </div>
                  </div>

                  {/* Options for select type */}
                  {formData.field_type === 'select' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Dropdown Options
                      </label>
                      <div className="space-y-2">
                        {(formData.field_options || []).map((option, index) => (
                          <div key={index} className="flex items-center space-x-2">
                            <input
                              type="text"
                              value={option}
                              onChange={(e) => handleOptionChange(index, e.target.value)}
                              className="flex-1 rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                              placeholder="Option value"
                            />
                            <button
                              type="button"
                              onClick={() => removeOption(index)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={addOption}
                          className="text-blue-500 hover:text-blue-700 text-sm"
                        >
                          + Add Option
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={resetForm}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 disabled:bg-gray-400"
                    >
                      {loading ? 'Saving...' : (editingField ? 'Update' : 'Add')}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Existing Fields */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-md font-medium text-gray-900 dark:text-white">
                  Existing Custom Columns
                </h4>
                {!showAddForm && (
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="flex items-center px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    <PlusIcon className="h-4 w-4 mr-1" />
                    Add Column
                  </button>
                )}
              </div>

              {loading && customFields.length === 0 ? (
                <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                  Loading custom columns...
                </div>
              ) : customFields.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <p className="mb-4">No custom columns defined yet.</p>
                  {!showAddForm && (
                    <button
                      onClick={() => setShowAddForm(true)}
                      className="text-blue-500 hover:text-blue-700"
                    >
                      Create your first custom column
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {customFields.map((field) => (
                    <div
                      key={field.id}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-md"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {field.field_label}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {field.field_name} ({field.field_type})
                          {field.is_required && <span className="ml-2 text-red-500">*</span>}
                        </div>
                        {field.field_type === 'select' && field.field_options && (
                          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            Options: {field.field_options.join(', ')}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleEdit(field)}
                          className="text-blue-500 hover:text-blue-700"
                          title="Edit"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(field)}
                          className="text-red-500 hover:text-red-700"
                          title="Delete"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomFieldsManager;
