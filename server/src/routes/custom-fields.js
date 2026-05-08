import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Get all custom fields for a module
router.get('/:moduleName', requireAuth, async (req, res) => {
  try {
    const { moduleName } = req.params;
    
    const { data, error } = await supabaseAdmin
      .from('custom_fields')
      .select('*')
      .eq('org_id', req.orgId)
      .eq('module_name', moduleName)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Error fetching custom fields:', err);
    res.status(500).json({ message: err.message });
  }
});

// Create a new custom field
router.post('/:moduleName', requireAuth, async (req, res) => {
  try {
    const { moduleName } = req.params;
    const { field_name, field_label, field_type, field_options, is_required, display_order } = req.body;

    // Validate field_name (alphanumeric and underscores only)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field_name)) {
      return res.status(400).json({ 
        message: 'Field name must start with a letter or underscore and contain only letters, numbers, and underscores' 
      });
    }

    // Validate select options
    if (field_type === 'select' && (!field_options || field_options.length === 0)) {
      return res.status(400).json({ 
        message: 'Dropdown fields must have at least one option' 
      });
    }

    const payload = {
      org_id: req.orgId,
      module_name: moduleName,
      field_name,
      field_label,
      field_type,
      field_options: field_type === 'select' ? field_options : null,
      is_required: is_required || false,
      display_order: display_order || 0,
      is_active: true, // Ensure it's active if we're upserting
      updated_at: new Date().toISOString()
    };

    // Use upsert to avoid duplicate key errors if the field already exists (even if inactive)
    const { data, error } = await supabaseAdmin
      .from('custom_fields')
      .upsert(payload, { 
        onConflict: 'org_id,module_name,field_name',
        ignoreDuplicates: false 
      })
      .select()
      .single();

    if (error) {
      console.error('Database error creating custom field:', error);
      throw error;
    }
    res.status(201).json(data);
  } catch (err) {
    console.error('Server error creating custom field:', err);
    res.status(500).json({ message: err.message });
  }
});

// Update a custom field
router.put('/:moduleName/:fieldId', requireAuth, async (req, res) => {
  try {
    const { fieldId } = req.params;
    const { field_label, field_type, field_options, is_required, display_order, is_active } = req.body;

    // Validate select options
    if (field_type === 'select' && (!field_options || field_options.length === 0)) {
      return res.status(400).json({ 
        message: 'Dropdown fields must have at least one option' 
      });
    }

    const payload = {
      ...(field_label !== undefined && { field_label }),
      ...(field_type !== undefined && { field_type }),
      ...(field_options !== undefined && { field_options: field_type === 'select' ? field_options : null }),
      ...(is_required !== undefined && { is_required }),
      ...(display_order !== undefined && { display_order }),
      ...(is_active !== undefined && { is_active }),
    };

    const { data, error } = await supabaseAdmin
      .from('custom_fields')
      .update(payload)
      .eq('id', fieldId)
      .eq('org_id', req.orgId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error updating custom field:', err);
    res.status(500).json({ message: err.message });
  }
});

// Delete a custom field (soft delete by setting is_active to false)
router.delete('/:moduleName/:fieldId', requireAuth, async (req, res) => {
  try {
    const { fieldId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('custom_fields')
      .update({ is_active: false })
      .eq('id', fieldId)
      .eq('org_id', req.orgId)
      .select()
      .single();

    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting custom field:', err);
    res.status(500).json({ message: err.message });
  }
});

// Reorder custom fields
router.put('/:moduleName/reorder', requireAuth, async (req, res) => {
  try {
    const { moduleName } = req.params;
    const { fieldIds } = req.body; // Array of field IDs in new order

    if (!Array.isArray(fieldIds)) {
      return res.status(400).json({ message: 'fieldIds must be an array' });
    }

    // Update display_order for each field
    const updates = fieldIds.map((fieldId, index) => 
      supabaseAdmin
        .from('custom_fields')
        .update({ display_order: index })
        .eq('id', fieldId)
        .eq('org_id', req.orgId)
        .eq('module_name', moduleName)
    );

    await Promise.all(updates);

    res.json({ message: 'Fields reordered successfully' });
  } catch (err) {
    console.error('Error reordering custom fields:', err);
    res.status(500).json({ message: err.message });
  }
});

export const customFieldsRouter = router;
