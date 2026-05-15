import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/asset-types - Fetch all custom asset types
router.get('/', requireAuth, async (req, res) => {
  try {
    const { data: records, error } = await supabaseAdmin
      .from('asset_types')
      .select('*')
      .eq('org_id', req.orgId)
      .eq('is_active', true);

    const assetTypes = records.map(r => ({
      id: r.id,
      name: r.name,
      // Handle both the old format (array of strings) and the new format (array of objects)
      // For compatibility with the frontend that currently expects just names:
      fields: Array.isArray(r.fields) ? r.fields.map(f => typeof f === 'string' ? f : f.name) : [],
      fieldsConfig: Array.isArray(r.fields) ? r.fields : []
    }));

    res.json(assetTypes);
  } catch (err) {
    console.error('Error fetching asset types:', err);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/asset-types - Create individual asset type
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, fields } = req.body;

    if (!name || !fields || !Array.isArray(fields)) {
      return res.status(400).json({ message: 'Name and fields array are required' });
    }

    // Validate fields structure
    for (const field of fields) {
      if (!field.name || !field.type) {
        return res.status(400).json({ message: 'Each field must have a name and type' });
      }
      if (field.type === 'select' && (!field.options || field.options.length === 0)) {
        return res.status(400).json({ message: `Field "${field.name}" is of type "select" but has no options` });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('asset_types')
      .insert({
        org_id: req.orgId,
        user_id: req.userId,
        name: name,
        fields: fields, // Store the full array of field objects
        is_active: true
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      id: data.id,
      name: data.name,
      fields: Array.isArray(data.fields) ? data.fields.map(f => typeof f === 'string' ? f : f.name) : [],
      fieldsConfig: Array.isArray(data.fields) ? data.fields : []
    });
  } catch (err) {
    console.error('Error creating asset type:', err);
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/asset-types/:id - Update individual asset type
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, fields } = req.body;

    if (!name || !fields || !Array.isArray(fields)) {
      return res.status(400).json({ message: 'Name and fields array are required' });
    }

    // Validate fields structure
    for (const field of fields) {
      if (!field.name || !field.type) {
        return res.status(400).json({ message: 'Each field must have a name and type' });
      }
      if (field.type === 'select' && (!field.options || field.options.length === 0)) {
        return res.status(400).json({ message: `Field "${field.name}" is of type "select" but has no options` });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('asset_types')
      .update({
        name: name,
        fields: fields // Store the full array of field objects
      })
      .eq('id', id)
      .eq('org_id', req.orgId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      id: data.id,
      name: data.name,
      fields: Array.isArray(data.fields) ? data.fields.map(f => typeof f === 'string' ? f : f.name) : [],
      fieldsConfig: Array.isArray(data.fields) ? data.fields : []
    });
  } catch (err) {
    console.error('Error updating asset type:', err);
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/asset-types/:id - Delete individual asset type
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('asset_types')
      .delete()
      .eq('id', id)
      .eq('org_id', req.orgId);

    if (error) throw error;

    res.status(204).send();
  } catch (err) {
    console.error('Error deleting asset type:', err);
    res.status(500).json({ message: err.message });
  }
});

export const assetTypesRouter = router;
