import { CustomField, CustomFieldCreate } from '../services/supabase';

/**
 * Mappings for standard fields in each module.
 * Keys are common human-readable headers, values are the internal DB field names.
 */
export const STANDARD_FIELD_MAPS: Record<string, Record<string, string>> = {
  assets: {
    'Asset ID': 'asset_id',
    'asset_id': 'asset_id',
    'Name': 'name',
    'name': 'name',
    'Owner': 'asset_owner',
    'asset_owner': 'asset_owner',
    'Business Unit': 'business_unit',
    'business_unit': 'business_unit',
    'Physical Location': 'physical_location',
    'physical_location': 'physical_location',
    'Criticality': 'criticality',
    'criticality': 'criticality',
    'Category': 'category',
    'category': 'category',
    'Details': 'details',
    'details': 'details',
    'Exposure': 'exposure',
    'exposure': 'exposure',
    'Governed Status': 'governed_status',
    'governed_status': 'governed_status',
    'IP Address': 'ip_address',
    'ip_address': 'ip_address',
    'MAC ID': 'mac_id',
    'mac_id': 'mac_id',
    'Vulnerability Count': 'vulnerability_count',
    'vulnerability_count': 'vulnerability_count',
    'Source': 'source',
    'source': 'source',
  },
  vulnerabilities: {
    'Vulnerability ID': 'vuln_id',
    'vuln_id': 'vuln_id',
    'Name': 'name',
    'name': 'name',
    'Description': 'description',
    'description': 'description',
    'Source': 'derived_from',
    'derived_from': 'derived_from',
    'Status': 'status',
    'status': 'status',
    'Asset ID': 'asset_id',
    'asset_id': 'asset_id',
  },
  asset_relationships: {
    'Source Asset ID': 'source_asset_id',
    'source_asset_id': 'source_asset_id',
    'Target Asset ID': 'target_asset_id',
    'target_asset_id': 'target_asset_id',
    'Relationship Type': 'relationship_type',
    'relationship_type': 'relationship_type',
  },
  capabilities: {
    'Capability ID': 'capab_id',
    'capab_id': 'capab_id',
    'Name': 'capab_name',
    'capab_name': 'capab_name',
    'Provider': 'capab_provider',
    'capab_provider': 'capab_provider',
    'CMDB ID': 'capab_cmdb_id',
    'capab_cmdb_id': 'capab_cmdb_id',
    'Owner': 'capab_owner',
    'capab_owner': 'capab_owner',
    'Details': 'capab_other_details',
    'capab_other_details': 'capab_other_details',
  },
  control_registry: {
    'Control ID': 'ctl_id',
    'ctl_id': 'ctl_id',
    'Name': 'ctl_name',
    'ctl_name': 'ctl_name',
    'Status': 'ctl_status',
    'ctl_status': 'ctl_status',
    'Type': 'ctl_type',
    'ctl_type': 'ctl_type',
    'Enforcement Type': 'enforcement_type',
    'enforcement_type': 'enforcement_type',
    'Description': 'ctl_description',
    'ctl_description': 'ctl_description',
    'Controlled By': 'ctld_by',
    'ctld_by': 'ctld_by',
    'Reference FW': 'ctl_ref_fw',
    'ctl_ref_fw': 'ctl_ref_fw',
    'Other Details': 'ctl_other_details',
    'ctl_other_details': 'ctl_other_details',
  }
};

/**
 * Checks if a value is a date string.
 */
const isDate = (val: string): boolean => {
  if (!val || val.length < 6) return false;
  const d = new Date(val);
  return d instanceof Date && !isNaN(d.getTime());
};

/**
 * Checks if a value is a number string.
 */
const isNumber = (val: string): boolean => {
  if (!val || val.trim() === '') return false;
  return !isNaN(Number(val));
};

/**
 * Checks if a value is a boolean string.
 */
const isBoolean = (val: string): boolean => {
  const lower = val.toLowerCase();
  return lower === 'true' || lower === 'false' || lower === 'yes' || lower === 'no';
};

/**
 * Infers the field type based on sample values.
 */
export const inferFieldType = (values: string[]): 'text' | 'number' | 'date' | 'boolean' => {
  const samples = values.filter(v => v && v.trim() !== '');
  if (samples.length === 0) return 'text';

  const results = samples.map(v => {
    if (isBoolean(v)) return 'boolean';
    if (isNumber(v)) return 'number';
    if (isDate(v)) return 'date';
    return 'text';
  });

  // If even one is text, assume text (safest)
  if (results.includes('text')) return 'text';
  
  // Return the most common type
  const counts = results.reduce((acc, r) => {
    acc[r] = (acc[r] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b) as any);
};

/**
 * Processes raw CSV/Excel data to identify new custom fields and map values.
 */
export const processImportData = (
  moduleName: string,
  headers: string[],
  rows: Record<string, string>[],
  existingFields: CustomField[]
) => {
  const standardMap = STANDARD_FIELD_MAPS[moduleName] || {};
  const existingFieldNames = new Set(existingFields.map(f => f.field_name.toLowerCase()));
  const existingFieldLabels = new Set(existingFields.map(f => f.field_label.toLowerCase()));

  const newCustomFieldDefs: CustomFieldCreate[] = [];
  const columnMapping: Record<string, { type: 'standard' | 'custom' | 'new', key: string }> = {};

  headers.forEach(header => {
    const cleanHeader = header.trim();
    if (!cleanHeader) return;

    // Check if it's a standard field
    const standardKey = standardMap[cleanHeader] || standardMap[cleanHeader.toLowerCase()];
    if (standardKey) {
      columnMapping[cleanHeader] = { type: 'standard', key: standardKey };
      return;
    }

    // Check if it's an existing custom field (by name or label)
    const existingField = existingFields.find(f => 
      f.field_name.toLowerCase() === cleanHeader.toLowerCase() || 
      f.field_label.toLowerCase() === cleanHeader.toLowerCase()
    );

    if (existingField) {
      columnMapping[cleanHeader] = { type: 'custom', key: existingField.field_name };
      return;
    }

    // It's a new field!
    // Get all values for this header, even if they're empty
    const headerValues = rows.map(r => r[header]);
    const inferredType = headerValues.some(v => v && v.trim() !== '') 
      ? inferFieldType(headerValues) 
      : 'text'; // Default to 'text' for empty columns
    const fieldName = cleanHeader.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    // Ensure uniqueness
    let finalFieldName = fieldName;
    let counter = 1;
    while (existingFieldNames.has(finalFieldName)) {
        finalFieldName = `${fieldName}_${counter++}`;
    }

    columnMapping[cleanHeader] = { type: 'new', key: finalFieldName };
    newCustomFieldDefs.push({
      field_name: finalFieldName,
      field_label: cleanHeader,
      field_type: inferredType,
      is_required: false,
      display_order: existingFields.length + newCustomFieldDefs.length + 1
    });
  });

  // Transform rows
  const mappedRecords = rows.map(row => {
    const standardData: Record<string, any> = {};
    const customData: Record<string, any> = {};

    Object.entries(row).forEach(([header, value]) => {
      const mapping = columnMapping[header];
      if (!mapping) return;

      if (mapping.type === 'standard') {
        // Special handling for array fields
        if (['capab_provider', 'capab_cmdb_id', 'ctld_by'].includes(mapping.key)) {
            standardData[mapping.key] = value ? value.split(';').map(s => s.trim()).filter(Boolean) : [];
        } else if (mapping.key === 'vulnerability_count') {
            standardData[mapping.key] = Number(value) || 0;
        } else {
            standardData[mapping.key] = value;
        }
      } else {
        customData[mapping.key] = value;
      }
    });

    return { ...standardData, custom_fields: customData };
  });

  return {
    newFields: newCustomFieldDefs,
    records: mappedRecords
  };
};
