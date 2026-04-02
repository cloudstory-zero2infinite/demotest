import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('assets')
      .select('*')
      .eq('org_id', req.orgId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const payload = { ...req.body, user_id: req.userId, org_id: req.orgId };
    
    // Log to ensure physical_location is being received
    console.log('Creating asset with payload:', {
      ...payload,
      physical_location: payload.physical_location || 'NOT_PROVIDED'
    });
    
    const { data, error } = await supabaseAdmin.from('assets').insert(payload).select().single();
    if (error) {
      console.error('Error creating asset:', error);
      throw error;
    }
    console.log('Asset created successfully:', data);
    res.status(201).json(data);
  } catch (err) {
    console.error('Asset creation error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.post('/bulk', requireAuth, async (req, res) => {
  try {
    const payloads = req.body.map(a => ({ ...a, user_id: req.userId, org_id: req.orgId }));
    const { data, error } = await supabaseAdmin.from('assets').insert(payloads).select();
    if (error) throw error;
    res.status(201).json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    console.log('Updating asset with ID:', req.params.id, 'Payload:', req.body);
    
    const { data, error } = await supabaseAdmin
      .from('assets')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating asset:', error);
      throw error;
    }
    
    console.log('Asset updated successfully:', data);
    res.json(data);
  } catch (err) {
    console.error('Asset update error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const assetId = req.params.id;
    console.log('Attempting to delete asset with ID:', assetId);
    
    // First, get the asset to check if it exists and get its asset_id
    const { data: asset, error: fetchError } = await supabaseAdmin
      .from('assets')
      .select('id, asset_id')
      .eq('id', assetId)
      .single();
    
    if (fetchError) {
      console.error('Error fetching asset:', fetchError);
      throw fetchError;
    }
    
    if (!asset) {
      return res.status(404).json({ message: 'Asset not found' });
    }
    
    console.log('Found asset:', asset);
    
    // Delete all relationships where this asset is either source or target (using asset_id)
    const { data: deletedRelationships, error: relationshipError } = await supabaseAdmin
      .from('asset_relationships')
      .delete()
      .or(`source_asset_id.eq.${asset.asset_id},target_asset_id.eq.${asset.asset_id}`)
      .select();
    
    if (relationshipError) {
      console.error('Error deleting asset relationships:', relationshipError);
      throw new Error(`Failed to delete asset relationships: ${relationshipError.message}`);
    } else {
      console.log('Successfully deleted asset relationships:', deletedRelationships?.length || 0, 'relationships');
    }
    
    // Delete vulnerabilities that reference this asset (using asset_id)
    const { data: deletedVulnerabilities, error: vulnerabilityError } = await supabaseAdmin
      .from('vulnerability_management')
      .delete()
      .eq('asset_id', asset.asset_id)
      .select();
    
    if (vulnerabilityError) {
      console.error('Error deleting associated vulnerabilities:', vulnerabilityError);
      // Continue with asset deletion even if vulnerability deletion fails
      console.log('Warning: Could not delete vulnerabilities, continuing with asset deletion');
    } else {
      console.log('Successfully deleted associated vulnerabilities:', deletedVulnerabilities?.length || 0, 'vulnerabilities');
    }
    
    // Finally, delete the asset itself (using id)
    const { error } = await supabaseAdmin
      .from('assets')
      .delete()
      .eq('id', assetId);
    
    if (error) {
      console.error('Error deleting asset:', error);
      throw new Error(`Failed to delete asset: ${error.message}`);
    }
    
    console.log('Successfully deleted asset');
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting asset:', err);
    res.status(500).json({ message: err.message });
  }
});

// helper: get all asset IDs for current org
async function getOrgAssetIds(orgId) {
  const { data, error } = await supabaseAdmin
    .from('assets')
    .select('asset_id')
    .eq('org_id', orgId);
  if (error) throw error;
  return (data || []).map((row) => row.asset_id);
}

// Get asset relationships for diagram
router.get('/relationships', requireAuth, async (req, res) => {
  try {
    const orgAssetIds = await getOrgAssetIds(req.orgId);
    if (orgAssetIds.length === 0) {
      return res.json([]);
    }

    const { data, error } = await supabaseAdmin
      .from('asset_relationships')
      .select('*')
      .in('source_asset_id', orgAssetIds)
      .in('target_asset_id', orgAssetIds)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Error fetching relationships:', err);
    res.status(500).json({ message: err.message });
  }
});

// Create asset relationship
router.post('/relationships', requireAuth, async (req, res) => {
  try {
    const payload = { ...req.body, created_at: new Date().toISOString() }; // will validate below

    const validAssetIds = await getOrgAssetIds(req.orgId);
    if (!validAssetIds.includes(payload.source_asset_id) || !validAssetIds.includes(payload.target_asset_id)) {
      return res.status(403).json({ message: 'Source/target assets must belong to your organization' });
    }

    const { data, error } = await supabaseAdmin
      .from('asset_relationships')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Error creating asset relationship:', err);
    res.status(500).json({ message: err.message });
  }
});

// Update asset relationship
router.put('/relationships/:id', requireAuth, async (req, res) => {
  try {
    const relationId = req.params.id;

    const { data: existingRel, error: relError } = await supabaseAdmin
      .from('asset_relationships')
      .select('*')
      .eq('id', relationId)
      .single();

    if (relError) throw relError;
    if (!existingRel) {
      return res.status(404).json({ message: 'Asset relationship not found' });
    }

    const validAssetIds = await getOrgAssetIds(req.orgId);

    const sourceId = req.body.source_asset_id || existingRel.source_asset_id;
    const targetId = req.body.target_asset_id || existingRel.target_asset_id;

    if (!validAssetIds.includes(sourceId) || !validAssetIds.includes(targetId)) {
      return res.status(403).json({ message: 'Source/target assets must belong to your organization' });
    }

    const { data, error } = await supabaseAdmin
      .from('asset_relationships')
      .update(req.body)
      .eq('id', relationId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error updating asset relationship:', err);
    res.status(500).json({ message: err.message });
  }
});

// Delete asset relationship
router.delete('/relationships/:id', requireAuth, async (req, res) => {
  try {
    const relationId = req.params.id;

    const { data: existingRel, error: relError } = await supabaseAdmin
      .from('asset_relationships')
      .select('*')
      .eq('id', relationId)
      .single();

    if (relError) throw relError;
    if (!existingRel) {
      return res.status(404).json({ message: 'Asset relationship not found' });
    }

    const validAssetIds = await getOrgAssetIds(req.orgId);
    if (!validAssetIds.includes(existingRel.source_asset_id) || !validAssetIds.includes(existingRel.target_asset_id)) {
      return res.status(403).json({ message: 'You do not have permission to delete this relationship' });
    }

    const { error } = await supabaseAdmin
      .from('asset_relationships')
      .delete()
      .eq('id', relationId);

    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting asset relationship:', err);
    res.status(500).json({ message: err.message });
  }
});

export const assetsRouter = router;
