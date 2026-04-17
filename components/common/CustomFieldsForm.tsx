import React, { ChangeEvent } from 'react';
import { CustomField } from '../../services/supabase';

interface CustomFieldsFormProps {
  customFields: CustomField[];
  values: Record<string, any>;
  onChange: (fieldName: string, value: any) => void;
  readonly?: boolean;
  gridClassName?: string;
}

const CustomFieldsForm: React.FC<CustomFieldsFormProps> = ({
  customFields,
  values,
  onChange,
  readonly = false,
  gridClassName = "grid grid-cols-1 md:grid-cols-2 gap-4",
}) => {
  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checkbox = e.target as HTMLInputElement;
      onChange(name, checkbox.checked ? 'true' : 'false');
    } else if (type === 'number') {
      onChange(name, value === '' ? '' : Number(value));
    } else {
      onChange(name, value);
    }
  };

  if (customFields.length === 0) {
    return null;
  }

  return (
    <div className={gridClassName}>
      {customFields.map((field) => (
        <div key={field.id}>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {field.field_label}
            {field.is_required && <span className="text-red-500 ml-1">*</span>}
          </label>
          
          {field.field_type === 'text' && (
            <input
              type="text"
              name={field.field_name}
              value={values[field.field_name] || ''}
              onChange={handleChange}
              readOnly={readonly}
              required={field.is_required}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              placeholder={`Enter ${field.field_label}`}
            />
          )}
          
          {field.field_type === 'number' && (
            <input
              type="number"
              name={field.field_name}
              value={values[field.field_name] || ''}
              onChange={handleChange}
              readOnly={readonly}
              required={field.is_required}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              placeholder={`Enter ${field.field_label}`}
            />
          )}
          
          {field.field_type === 'date' && (
            <input
              type="date"
              name={field.field_name}
              value={values[field.field_name] || ''}
              onChange={handleChange}
              readOnly={readonly}
              required={field.is_required}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          )}
          
          {field.field_type === 'select' && (
            <select
              name={field.field_name}
              value={values[field.field_name] || ''}
              onChange={handleChange}
              disabled={readonly}
              required={field.is_required}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="">Select {field.field_label}</option>
              {field.field_options?.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          )}
          
          {field.field_type === 'boolean' && (
            <div className="mt-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name={field.field_name}
                  checked={values[field.field_name] === 'true'}
                  onChange={handleChange}
                  disabled={readonly}
                  className="rounded border-gray-300 dark:border-gray-600 cursor-pointer mr-2"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {field.field_label}
                </span>
              </label>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default CustomFieldsForm;
