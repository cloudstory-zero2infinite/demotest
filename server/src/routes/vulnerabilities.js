import { Router } from 'express';







import { supabaseAdmin } from '../supabase.js';







import { requireAuth } from '../middleware/auth.js';















const router = Router();

async function recalculateAssetVulnerabilityCount(assetIds) {
  if (!assetIds || assetIds.length === 0) return;
  
  const validAssetIds = [...new Set(assetIds.filter(id => id))];
  if (validAssetIds.length === 0) return;

  for (const assetId of validAssetIds) {
    try {
      const { count, error: countError } = await supabaseAdmin
        .from('vulnerability_management')
        .select('*', { count: 'exact', head: true })
        .eq('asset_id', assetId);
        
      if (countError) throw countError;

      const { error: updateError } = await supabaseAdmin
        .from('assets')
        .update({ vulnerability_count: count || 0 })
        .eq('id', assetId);

      if (updateError) throw updateError;
      console.log(`Successfully updated vulnerability count for asset ${assetId} to ${count || 0}`);
    } catch (err) {
      console.error(`Failed to update vulnerability count for asset ${assetId}:`, err.message);
    }
  }
}
















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







      .select('id:vuln_id, name, description, derived_from, status, created_at, updated_at, asset_id, custom_fields')







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







      .select('id:vuln_id, name, description, derived_from, status, created_at, updated_at, asset_id, custom_fields')







      .single();







    if (insertError) throw insertError;

    if (inserted.asset_id) {
      await recalculateAssetVulnerabilityCount([inserted.asset_id]);
    }















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

    const { data: oldVuln, error: fetchError } = await supabaseAdmin
      .from('vulnerability_management')
      .select('asset_id')
      .eq('vuln_id', req.params.id)
      .maybeSingle();

    if (fetchError) throw fetchError;







    const { data: updated, error: updateError } = await supabaseAdmin







      .from('vulnerability_management')







      .update(req.body)







      .eq('vuln_id', req.params.id)







      .select('id:vuln_id, name, description, derived_from, status, created_at, updated_at, asset_id, custom_fields')







      .single();







    if (updateError) throw updateError;

    const affectedAssetIds = [];
    if (oldVuln && oldVuln.asset_id) {
      affectedAssetIds.push(oldVuln.asset_id);
    }
    if (updated && updated.asset_id) {
      affectedAssetIds.push(updated.asset_id);
    }
    if (affectedAssetIds.length > 0) {
      await recalculateAssetVulnerabilityCount(affectedAssetIds);
    }















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
    const vulns = req.body;
    if (!Array.isArray(vulns) || vulns.length === 0) {
      return res.status(400).json({ message: 'Invalid vulnerabilities data provided' });
    }

    const payloads = vulns.map(v => ({ ...v, user_id: req.userId, org_id: req.orgId }));
    const { data, error } = await supabaseAdmin
      .from('vulnerability_management')
      .insert(payloads)
      .select('id:vuln_id, name, description, derived_from, status, created_at, updated_at, asset_id, custom_fields');

    if (error) throw error;

    const affectedAssetIds = data ? data.map(v => v.asset_id).filter(Boolean) : [];
    if (affectedAssetIds.length > 0) {
      await recalculateAssetVulnerabilityCount(affectedAssetIds);
    }

    res.status(201).json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/bulk-delete', requireAuth, async (req, res) => {
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

    const { data: oldVulns } = await supabaseAdmin
      .from('vulnerability_management')
      .select('asset_id')
      .in('vuln_id', ids);

    const affectedAssetIds = oldVulns ? oldVulns.map(v => v.asset_id).filter(Boolean) : [];

    let query = supabaseAdmin
      .from('vulnerability_management')
      .delete()
      .in('vuln_id', ids);

    if (req.orgId) {
      query = query.eq('org_id', req.orgId);
    }

    const { error } = await query;
    
    if (error) {
      console.log('[bulk-delete] Supabase error:', error);
      throw error;
    }
    
    if (affectedAssetIds.length > 0) {
      await recalculateAssetVulnerabilityCount(affectedAssetIds);
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

    const { data: oldVuln } = await supabaseAdmin
      .from('vulnerability_management')
      .select('asset_id')
      .eq('vuln_id', req.params.id)
      .maybeSingle();







    const { error } = await supabaseAdmin







      .from('vulnerability_management')







      .delete()







      .eq('vuln_id', req.params.id);







    if (error) throw error;

    if (oldVuln && oldVuln.asset_id) {
      await recalculateAssetVulnerabilityCount([oldVuln.asset_id]);
    }







    res.status(204).send();







  } catch (err) {







    res.status(500).json({ message: err.message });







  }







});















export const vulnerabilitiesRouter = router;







