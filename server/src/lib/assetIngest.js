import { supabaseAdmin } from '../supabase.js';

export async function generateNextAssetId(orgId) {
  let orgPrefix = 'OR';
  try {
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single();
    if (org && org.name) {
      orgPrefix = org.name.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || 'OR';
    }
  } catch (orgError) {
    console.warn('Failed to fetch org name for prefix:', orgError.message);
  }

  let maxNum = 1000;
  try {
    const { data: existingAssets } = await supabaseAdmin
      .from('assets')
      .select('asset_id')
      .eq('org_id', orgId)
      .like('asset_id', `AST-${orgPrefix}-%`);
    if (existingAssets) {
      existingAssets.forEach(asset => {
        if (asset.asset_id) {
          const numStr = asset.asset_id.replace(`AST-${orgPrefix}-`, '');
          const num = parseInt(numStr, 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      });
    }
  } catch (existingError) {
    console.warn('Failed to query existing assets for sequential ID:', existingError.message);
  }

  return `AST-${orgPrefix}-${maxNum + 1}`;
}

export const ASSET_STANDARD_KEYS = new Set([
  'asset_id', 'name', 'asset_owner', 'business_unit', 'physical_location',
  'criticality', 'category', 'details', 'governed_status', 'exposure',
  'ip_address', 'mac_id', 'vulnerability_count', 'source', 'owner',
]);
// Meta keys we store in custom_fields for our own bookkeeping — not real
// asset attributes, so they never become a pill's visible column.
export const ASSET_META_KEYS = new Set(['type', 'integration', 'external_id']);

// Registers (or extends) a "pill" asset type — same asset_types table the
// UI's CSV-import flow writes to — plus any missing custom_fields
// definitions, so a caller's custom_fields keys become real visible columns
// under that pill without any frontend changes.
export async function ensureAssetTypeAndFields(orgId, userId, typeName, fieldNames) {
  const displayFieldNames = fieldNames.filter((n) => !ASSET_META_KEYS.has(n));
  if (!displayFieldNames.length) return;

  const { data: existingType } = await supabaseAdmin
    .from('asset_types')
    .select('id, fields')
    .eq('org_id', orgId)
    .eq('name', typeName)
    .eq('is_active', true)
    .maybeSingle();

  if (!existingType) {
    await supabaseAdmin.from('asset_types').insert({
      org_id: orgId,
      user_id: userId,
      name: typeName,
      fields: displayFieldNames.map((name) => ({ name, type: 'text' })),
      is_active: true,
    });
  } else {
    const existingNames = new Set((existingType.fields || []).map((f) => (typeof f === 'string' ? f : f.name)));
    const missing = displayFieldNames.filter((n) => !existingNames.has(n));
    if (missing.length) {
      const merged = [...(existingType.fields || []), ...missing.map((name) => ({ name, type: 'text' }))];
      await supabaseAdmin.from('asset_types').update({ fields: merged }).eq('id', existingType.id);
    }
  }

  for (const fieldName of displayFieldNames) {
    if (ASSET_STANDARD_KEYS.has(fieldName)) continue; // already a native asset column
    const { data: existingField } = await supabaseAdmin
      .from('custom_fields')
      .select('id')
      .eq('org_id', orgId)
      .eq('module_name', 'assets')
      .eq('field_name', fieldName)
      .maybeSingle();
    if (!existingField) {
      const label = fieldName.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const { error: insertErr } = await supabaseAdmin.from('custom_fields').insert({
        org_id: orgId,
        module_name: 'assets',
        field_name: fieldName,
        field_label: label,
        field_type: 'text',
        is_required: false,
        display_order: 0,
        is_active: true,
      });
      if (insertErr) console.error('[assetIngest] failed to create custom field', fieldName, insertErr.message);
    }
  }
}
