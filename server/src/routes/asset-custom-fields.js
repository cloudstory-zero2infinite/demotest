import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/asset-custom-fields - Get all custom fields for an organization
router.get('/', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('custom_fields')
      .select('*')
      .eq('org_id', req.orgId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Error fetching custom fields:', err);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/asset-custom-fields - Create a new custom field
router.post('/', requireAuth, async (req, res) => {
  try {
    const { field_name, field_label, field_type, field_options, is_required, display_order } = req.body;

    // Validate field_name uniqueness
    const { data: existingField } = await supabaseAdmin
      .from('custom_fields')
      .select('id')
      .eq('org_id', req.orgId)
      .eq('field_name', field_name)
      .single();

    if (existingField) {
      return res.status(400).json({ message: 'Field name already exists' });
    }

    const { data, error } = await supabaseAdmin
      .from('custom_fields')
      .insert({
        org_id: req.orgId,
        field_name,
        field_label,
        field_type,
        field_options,
        is_required: is_required || false,
        display_order: display_order || 0,
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error creating custom field:', err);
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/asset-custom-fields/:id - Update a custom field
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { field_label, field_type, field_options, is_required, display_order, is_active } = req.body;

    const { data, error } = await supabaseAdmin
      .from('custom_fields')
      .update({
        field_label,
        field_type,
        field_options,
        is_required,
        display_order,
        is_active: is_active !== undefined ? is_active : true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('org_id', req.orgId)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ message: 'Custom field not found' });
    }

    res.json(data);
  } catch (err) {
    console.error('Error updating custom field:', err);
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/asset-custom-fields/:id - Delete a custom field
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if field exists and belongs to org
    const { data: field } = await supabaseAdmin
      .from('custom_fields')
      .select('id')
      .eq('id', id)
      .eq('org_id', req.orgId)
      .single();

    if (!field) {
      return res.status(404).json({ message: 'Custom field not found' });
    }

    // Soft delete by setting is_active to false
    const { error } = await supabaseAdmin
      .from('custom_fields')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('org_id', req.orgId);

    if (error) throw error;
    res.json({ message: 'Custom field deleted successfully' });
  } catch (err) {
    console.error('Error deleting custom field:', err);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/asset-custom-fields/values/:assetId - Get custom field values for an asset
router.get('/values/:assetId', requireAuth, async (req, res) => {
  try {
    const { assetId } = req.params;

    // Verify asset belongs to org and get custom fields
    const { data: asset, error: assetError } = await supabaseAdmin
      .from('assets')
      .select('id, custom_fields')
      .eq('id', assetId)
      .eq('org_id', req.orgId)
      .single();

    if (assetError || !asset) {
      return res.status(404).json({ message: 'Asset not found' });
    }

    // Get field definitions
    const { data: fields, error: fieldsError } = await supabaseAdmin
      .from('custom_fields')
      .select('*')
      .eq('org_id', req.orgId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (fieldsError) throw fieldsError;

    // Combine field definitions with values
    const transformedData = fields.map(field => ({
      id: field.id,
      asset_id: assetId,
      field_id: field.id,
      field_value: asset.custom_fields?.[field.field_name] || null,
      created_at: field.created_at,
      updated_at: field.updated_at,
      field: field,
    }));

    res.json(transformedData);
  } catch (err) {
    console.error('Error fetching custom field values:', err);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/asset-custom-fields/values - Upsert custom field values for an asset
router.post('/values', requireAuth, async (req, res) => {
  try {
    const { asset_id, custom_fields } = req.body; // custom_fields: { field_name: field_value }

    // Verify asset belongs to org
    const { data: asset } = await supabaseAdmin
      .from('assets')
      .select('id, custom_fields')
      .eq('id', asset_id)
      .eq('org_id', req.orgId)
      .single();

    if (!asset) {
      return res.status(404).json({ message: 'Asset not found' });
    }

    // Merge existing custom fields with new ones
    const existingFields = asset.custom_fields || {};
    const updatedFields = { ...existingFields, ...custom_fields };

    // Update the asset with merged custom fields
    const { data, error } = await supabaseAdmin
      .from('assets')
      .update({
        custom_fields: updatedFields,
        updated_at: new Date().toISOString(),
      })
      .eq('id', asset_id)
      .eq('org_id', req.orgId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error setting custom field values:', err);
    res.status(500).json({ message: err.message });
  }
});

export default router;
