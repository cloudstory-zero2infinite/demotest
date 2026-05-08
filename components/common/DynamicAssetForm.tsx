import React from 'react';
import { FieldDefinition } from '../../services/supabase';

interface DynamicAssetFormProps {
    fields: FieldDefinition[];
    values: Record<string, any>;
    onChange: (fieldName: string, value: any) => void;
    readonly?: boolean;
}

export const DynamicAssetForm: React.FC<DynamicAssetFormProps> = ({
    fields,
    values,
    onChange,
    readonly = false
}) => {
    const renderField = (field: FieldDefinition) => {
        const value = values[field.name] || '';
        const fieldId = `field_${field.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
        
        const baseClasses = "mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white";
        const labelClasses = "block text-sm font-medium text-gray-700 dark:text-gray-300";
        
        switch (field.type) {
            case 'text':
                return (
                    <input
                        type="text"
                        id={fieldId}
                        value={value}
                        onChange={(e) => onChange(field.name, e.target.value)}
                        readOnly={readonly}
                        required={field.required}
                        className={baseClasses}
                        placeholder={`Enter ${field.name}`}
                    />
                );
                
            case 'number':
                return (
                    <input
                        type="number"
                        id={fieldId}
                        value={value}
                        onChange={(e) => onChange(field.name, Number(e.target.value))}
                        readOnly={readonly}
                        required={field.required}
                        className={baseClasses}
                        placeholder={`Enter ${field.name}`}
                    />
                );
                
            case 'date':
                return (
                    <input
                        type="date"
                        id={fieldId}
                        value={value}
                        onChange={(e) => onChange(field.name, e.target.value)}
                        readOnly={readonly}
                        required={field.required}
                        className={baseClasses}
                    />
                );
                
            case 'boolean':
                return (
                    <select
                        id={fieldId}
                        value={value}
                        onChange={(e) => onChange(field.name, e.target.value === 'true')}
                        disabled={readonly}
                        required={field.required}
                        className={baseClasses}
                    >
                        <option value="">Select...</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                    </select>
                );
                
            case 'select':
                return (
                    <select
                        id={fieldId}
                        value={value}
                        onChange={(e) => onChange(field.name, e.target.value)}
                        disabled={readonly}
                        required={field.required}
                        className={baseClasses}
                    >
                        <option value="">Select...</option>
                        {field.options?.map((option, index) => (
                            <option key={index} value={option}>
                                {option}
                            </option>
                        ))}
                    </select>
                );
                
            case 'email':
                return (
                    <input
                        type="email"
                        id={fieldId}
                        value={value}
                        onChange={(e) => onChange(field.name, e.target.value)}
                        readOnly={readonly}
                        required={field.required}
                        className={baseClasses}
                        placeholder={`Enter ${field.name}`}
                    />
                );
                
            case 'url':
                return (
                    <input
                        type="url"
                        id={fieldId}
                        value={value}
                        onChange={(e) => onChange(field.name, e.target.value)}
                        readOnly={readonly}
                        required={field.required}
                        className={baseClasses}
                        placeholder={`https://...`}
                    />
                );
                
            case 'textarea':
                return (
                    <textarea
                        id={fieldId}
                        value={value}
                        onChange={(e) => onChange(field.name, e.target.value)}
                        readOnly={readonly}
                        required={field.required}
                        rows={3}
                        className={baseClasses}
                        placeholder={`Enter ${field.name}`}
                    />
                );
                
            default:
                return (
                    <input
                        type="text"
                        id={fieldId}
                        value={value}
                        onChange={(e) => onChange(field.name, e.target.value)}
                        readOnly={readonly}
                        required={field.required}
                        className={baseClasses}
                        placeholder={`Enter ${field.name}`}
                    />
                );
        }
    };
    
    if (fields.length === 0) {
        return (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No fields defined for this asset type.
            </div>
        );
    }
    
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fields.map((field, index) => (
                <div key={index} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
                    <label htmlFor={`field_${field.name.replace(/[^a-zA-Z0-9]/g, '_')}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {field.name}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {renderField(field)}
                </div>
            ))}
        </div>
    );
};
