import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const { data: assetsData, error: assetsError } = await supabaseAdmin
      .from('assets')
      .select('id, asset_id, name')
      .eq('org_id', req.orgId);
    if (assetsError) throw assetsError;
    const assetMap = new Map(assetsData.map(a => [a.id, { asset_id: a.asset_id, name: a.name }]));

    const { data: vulnsData, error: vulnsError } = await supabaseAdmin
      .from('vulnerability_management')
      .select('id:vuln_id, name, description, derived_from, status, created_at, updated_at, asset_id')
      .eq('org_id', req.orgId)
      .order('updated_at', { ascending: false });
    if (vulnsError) throw vulnsError;

    const enriched = (vulnsData || []).map(v => ({
      ...v,
      assets: v.asset_id ? assetMap.get(v.asset_id) || null : null,
    }));
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const payload = { ...req.body, user_id: req.userId, org_id: req.orgId };
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('vulnerability_management')
      .insert(payload)
      .select('id:vuln_id, name, description, derived_from, status, created_at, updated_at, asset_id')
      .single();
    if (insertError) throw insertError;

    if (inserted.asset_id) {
      const { data: asset } = await supabaseAdmin
        .from('assets')
        .select('asset_id, name')
        .eq('id', inserted.asset_id)
        .single();
      inserted.assets = asset || null;
    } else {
      inserted.assets = null;
    }
    res.status(201).json(inserted);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('vulnerability_management')
      .update(req.body)
      .eq('vuln_id', req.params.id)
      .select('id:vuln_id, name, description, derived_from, status, created_at, updated_at, asset_id')
      .single();
    if (updateError) throw updateError;

    if (updated.asset_id) {
      const { data: asset } = await supabaseAdmin
        .from('assets')
        .select('asset_id, name')
        .eq('id', updated.asset_id)
        .single();
      updated.assets = asset || null;
    } else {
      updated.assets = null;
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/bulk', requireAuth, async (req, res) => {
  res.json({ message: 'Bulk endpoint is accessible' });
});

router.post('/bulk', requireAuth, async (req, res) => {
  try {
    console.log('[bulk-delete] Request body:', req.body);
    console.log('[bulk-delete] orgId:', req.orgId);
    console.log('[bulk-delete] userId:', req.userId);
    
    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      console.log('[bulk-delete] Invalid or empty IDs array:', ids);
      return res.status(400).json({ message: 'Invalid or empty IDs array' });
    }

    console.log('[bulk-delete] Deleting vulnerabilities with IDs:', ids);

    let query = supabaseAdmin
      .from('vulnerability_management')
      .delete()
      .in('vuln_id', ids);

    // Only add org_id filter if it exists
    if (req.orgId) {
      query = query.eq('org_id', req.orgId);
    }

    const { error } = await query;
    
    if (error) {
      console.log('[bulk-delete] Supabase error:', error);
      throw error;
    }
    
    console.log('[bulk-delete] Successfully deleted vulnerabilities');
    res.status(204).send();
  } catch (err) {
    console.log('[bulk-delete] Error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('vulnerability_management')
      .delete()
      .eq('vuln_id', req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export const vulnerabilitiesRouter = router;
