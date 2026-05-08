import { CustomField, CustomFieldCreate } from '../services/supabase';

/**
 * Generates a new asset ID in format AST-XX-NNN where XX is org prefix and NNN is sequential number
 */
export const generateAssetId = (orgPrefix: string = 'CL'): string => {
  // Ensure org prefix is exactly 2 letters, uppercase
  const prefix = orgPrefix.substring(0, 2).toUpperCase();
  
  // Generate a sequential number (for now using timestamp to ensure uniqueness)
  // In a real implementation, you might want to query the database for the last used number
  const timestamp = Date.now();
  const sequence = timestamp % 1000; // Keep it 3 digits
  
  return `AST-${prefix}-${sequence.toString().padStart(3, '0')}`;
};



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

    'Hostname': 'name',

    'hostname': 'name',

    'Device Name': 'name',

    'device_name': 'name',

    'Server Name': 'name',

    'server_name': 'name',

    'Resource Name': 'name',

    'resource_name': 'name',

    'Dataset Name': 'name',

    'dataset_name': 'name',

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

    'DEMO': 'category',

    'demo': 'category',

    'Type': 'category',

    'type': 'category',

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

 * System fields definitions for mapping UI.

 */

export const SYSTEM_FIELDS_CONFIG: Record<string, { key: string; label: string }[]> = {

  assets: [

    { key: 'asset_id', label: 'Asset ID' },

    { key: 'name', label: 'Asset Name / Hostname' },

    { key: 'asset_owner', label: 'Owner' },

    { key: 'business_unit', label: 'Business Unit' },

    { key: 'physical_location', label: 'Physical Location' },

    { key: 'criticality', label: 'Criticality' },

    { key: 'category', label: 'Type' },

    { key: 'details', label: 'Asset Description' },

    { key: 'governed_status', label: 'Governed' },

    { key: 'exposure', label: 'Exposure' },

    { key: 'ip_address', label: 'IP Address' },

    { key: 'mac_id', label: 'UID / Mac ID' },

    { key: 'vulnerability_count', label: 'Vulnerability Count' },

    { key: 'source', label: 'Source' },

  ],

  vulnerabilities: [

    { key: 'name', label: 'Name' },

    { key: 'description', label: 'Description' },

    { key: 'derived_from', label: 'Source (Derived From)' },

    { key: 'status', label: 'Status' },

    { key: 'asset_id', label: 'Associated Asset' },

  ],

  asset_relationships: [

    { key: 'source_asset_id', label: 'Source Asset ID' },

    { key: 'target_asset_id', label: 'Target Asset ID' },

    { key: 'relationship_type', label: 'Relationship Type' },

  ],

  capabilities: [

    { key: 'capab_id', label: 'Capability ID' },

    { key: 'capab_name', label: 'Capability Name' },

    { key: 'capab_provider', label: 'Provider(s)' },

    { key: 'capab_cmdb_id', label: 'CMDB ID(s)' },

    { key: 'capab_owner', label: 'Capability Owner' },

    { key: 'capab_other_details', label: 'Other Details' },

  ],

  control_registry: [

    { key: 'ctl_id', label: 'Control ID' },

    { key: 'ctl_name', label: 'Control Name' },

    { key: 'ctl_status', label: 'Control Status' },

    { key: 'ctl_type', label: 'Control Type' },

    { key: 'enforcement_type', label: 'Enforcement Type' },

    { key: 'ctl_description', label: 'Description' },

    { key: 'ctld_by', label: 'Controlled By' },

    { key: 'ctl_ref_fw', label: 'Reference FW' },

    { key: 'ctl_other_details', label: 'Other Details' },

  ]

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

    console.log(`Standard field check for "${cleanHeader}":`, {

      standardKey,

      directMatch: !!standardMap[cleanHeader],

      lowerCaseMatch: !!standardMap[cleanHeader.toLowerCase()],

      availableStandardFields: Object.keys(standardMap)

    });

    if (standardKey) {

      columnMapping[cleanHeader] = { type: 'standard', key: standardKey };

      return;

    }



    // Check if it's an existing custom field (by name or label) - more flexible matching

    const existingField = existingFields.find(f => {

      const headerLower = cleanHeader.toLowerCase();

      const fieldNameLower = f.field_name.toLowerCase();

      const fieldLabelLower = f.field_label.toLowerCase();

      

      // Exact match

      if (fieldNameLower === headerLower || fieldLabelLower === headerLower) {

        return true;

      }

      

      // Handle common variations (spaces, underscores, case)

      const normalizedHeader = headerLower.replace(/[\s_]/g, '').replace(/[^a-z0-9]/g, '');

      const normalizedFieldName = fieldNameLower.replace(/[\s_]/g, '').replace(/[^a-z0-9]/g, '');

      const normalizedFieldLabel = fieldLabelLower.replace(/[\s_]/g, '').replace(/[^a-z0-9]/g, '');

      

      return normalizedFieldName === normalizedHeader || normalizedFieldLabel === normalizedHeader;

    });



    console.log(`Field matching for "${cleanHeader}":`, {

      existingField,

      existingFieldNames: Array.from(existingFieldNames),

      existingFieldLabels: Array.from(existingFieldLabels),

      isMatch: !!existingField

    });



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



/**

 * Applies a manual mapping to raw data.

 */

export const applyManualMapping = (

  mapping: { csvHeader: string; mappedField: string; type: string }[],

  rows: Record<string, string>[],

  existingFields: CustomField[]

) => {

  const newCustomFieldDefs: CustomFieldCreate[] = [];

  const existingFieldNames = new Set(existingFields.map(f => f.field_name.toLowerCase()));



  // 1. Identify new custom fields and type-specific fields to create

  mapping.forEach(m => {

    console.log(`Processing mapping:`, m);

    

    // Check if this is actually an existing custom field that should be mapped correctly

    if (m.type === 'new') {

      const existingField = existingFields.find(f => {

        const headerLower = m.csvHeader.toLowerCase();

        const fieldNameLower = f.field_name.toLowerCase();

        const fieldLabelLower = f.field_label.toLowerCase();

        

        // Exact match

        if (fieldNameLower === headerLower || fieldLabelLower === headerLower) {

          return true;

        }

        

        // Handle common variations (spaces, underscores, case)

        const normalizedHeader = headerLower.replace(/[\s_]/g, '').replace(/[^a-z0-9]/g, '');

        const normalizedFieldName = fieldNameLower.replace(/[\s_]/g, '').replace(/[^a-z0-9]/g, '');

        const normalizedFieldLabel = fieldLabelLower.replace(/[\s_]/g, '').replace(/[^a-z0-9]/g, '');

        

        return normalizedFieldName === normalizedHeader || normalizedFieldLabel === normalizedHeader;

      });

      

      if (existingField) {

        console.log(`Found existing field for "${m.csvHeader}":`, existingField);

        // Update mapping to use existing field instead of creating new one

        m.type = 'custom';

        m.mappedField = existingField.field_name;

        return; // Skip creating new field

      }

    }

    

    if (m.type === 'new' || m.mappedField.startsWith('type_field_')) {

      const isTypeField = m.mappedField.startsWith('type_field_');

      const label = isTypeField ? m.mappedField.replace('type_field_', '').replace(/_/g, ' ') : m.csvHeader;

      const baseName = label.toLowerCase().replace(/[^a-z0-9]/g, '_');

      

      // Ensure uniqueness

      let finalFieldName = baseName;

      let counter = 1;

      while (existingFieldNames.has(finalFieldName)) {

          finalFieldName = `${baseName}_${counter++}`;

      }



      // Update the mapping to use the final field name for customData

      m.mappedField = finalFieldName;

      existingFieldNames.add(finalFieldName);



      // Get sample values for type inference

      const sampleValues = rows.map(r => r[m.csvHeader]);

      const inferredType = sampleValues.some(v => v && v.trim() !== '') 

        ? inferFieldType(sampleValues) 

        : 'text';



      newCustomFieldDefs.push({

        field_name: finalFieldName,

        field_label: label.charAt(0).toUpperCase() + label.slice(1), // Proper casing for label

        field_type: inferredType,

        is_required: false,

        display_order: existingFields.length + newCustomFieldDefs.length + 1

      });

    }

  });



  // 2. Transform rows

  const mappedRecords = rows.map(row => {

    const standardData: Record<string, any> = {};

    const customData: Record<string, any> = {};



    mapping.forEach(m => {

      if (m.type === 'ignore' || m.mappedField === 'ignore') return;



      const value = row[m.csvHeader];

      

      // If it starts with custom_field_, it's an existing custom field

      if (m.mappedField.startsWith('custom_field_')) {

        const fieldName = m.mappedField.replace('custom_field_', '');

        customData[fieldName] = value;

      } else if (m.type === 'standard') {

        // Special handling for array fields

        if (['capab_provider', 'capab_cmdb_id', 'ctld_by'].includes(m.mappedField)) {

            standardData[m.mappedField] = value ? value.split(';').map(s => s.trim()).filter(Boolean) : [];

        } else if (m.mappedField === 'vulnerability_count') {

            standardData[m.mappedField] = Number(value) || 0;

        } else if (m.mappedField === 'criticality') {

            // Sanitize criticality to match DB check constraint: Low, Medium, High

            const val = String(value || '').toLowerCase();

            if (val.includes('crit') || val.includes('high') || val.includes('urgent')) {

              standardData[m.mappedField] = 'High';

            } else if (val.includes('low') || val.includes('minor') || val.includes('minimal')) {

              standardData[m.mappedField] = 'Low';

            } else {

              standardData[m.mappedField] = 'Medium';

            }

        } else if (m.mappedField === 'exposure') {

            // Sanitize exposure: Internal, External, DMZ

            const val = String(value || '').toLowerCase();

            if (val.includes('ext') || val.includes('pub') || val.includes('out')) {

              standardData[m.mappedField] = 'External';

            } else if (val.includes('dmz')) {

              standardData[m.mappedField] = 'DMZ';

            } else {

              standardData[m.mappedField] = 'Internal';

            }

        } else {

          // Standard field - ensure name field is never null

          if (m.mappedField === 'name') {

            standardData[m.mappedField] = value || `Unnamed Asset ${Date.now()}`;

          } else {

            standardData[m.mappedField] = value;

          }

        }

      } else {

        // Custom field (existing or new)

        customData[m.mappedField] = value;

      }

    });

    // Ensure required fields have default values
    if (standardData.asset_id !== undefined && standardData.asset_id.trim() === '') {
      delete standardData.asset_id;
    }

    if (!standardData.name || standardData.name.trim() === '') {
      standardData.name = `Unnamed Asset ${Date.now()}`;
    }

    if (!standardData.asset_owner || standardData.asset_owner.trim() === '') {

      standardData.asset_owner = 'Unknown';

    }

    if (!standardData.business_unit || standardData.business_unit.trim() === '') {

      standardData.business_unit = 'Unknown';

    }

    if (!standardData.ip_address || standardData.ip_address.trim() === '') {

      standardData.ip_address = '0.0.0.0';

    }

    if (!standardData.mac_id || standardData.mac_id.trim() === '') {

      standardData.mac_id = 'Unknown';

    }

    if (!standardData.details || standardData.details.trim() === '') {

      standardData.details = 'Imported asset';

    }

    if (!standardData.criticality) {

      standardData.criticality = 'Low';

    }

    if (!standardData.category) {

      // Default to DEMO to match the user's asset type

      standardData.category = 'DEMO';

    }

    if (!standardData.exposure) {

      standardData.exposure = 'Internal';

    }

    if (!standardData.governed_status) {

      standardData.governed_status = 'Non-Governed';

    }

    if (!standardData.source) {

      standardData.source = 'File Upload';

    }

    

    // Set default vulnerability count

    if (standardData.vulnerability_count === undefined || standardData.vulnerability_count === null) {

      standardData.vulnerability_count = 0;

    }



    return { ...standardData, custom_fields: customData };

  });



  return {

    newFields: newCustomFieldDefs,

    records: mappedRecords

  };

};



