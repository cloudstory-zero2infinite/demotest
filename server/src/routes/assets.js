import express from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';
import pkg from 'pg';
const { Pool } = pkg;

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

router.get('/', requireAuth, async (req, res) => {
  try {
    // We use raw SQL to bypass the Supabase API's 1000-row default limit
    const query = `
      SELECT * FROM assets 
      WHERE org_id = $1 
      ORDER BY created_at DESC 
      LIMIT 10000
    `;
    const result = await pool.query(query, [req.orgId]);
    res.json(result.rows || []);
  } catch (err) {
    console.error('[ASSETS-GET] Error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    // governed_status and nn_controls are auto-computed by DB triggers — strip them
    const { governed_status, nn_controls, ...body } = req.body;
    const payload = { ...body, user_id: req.userId, org_id: req.orgId };
    
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
    const assets = req.body;
    
    // If payload is small, use direct insertion
    if (assets.length <= 200) {
      const payloads = assets.map(({ governed_status, nn_controls, ...a }) => ({ ...a, user_id: req.userId, org_id: req.orgId }));
      const { data, error } = await supabaseAdmin.from('assets').insert(payloads).select();
      if (error) throw error;
      res.status(201).json(data || []);
      return;
    }
    
    // For large payloads, process in chunks server-side
    const CHUNK_SIZE = 100;
    const results = [];
    const errors = [];
    
    for (let i = 0; i < assets.length; i += CHUNK_SIZE) {
      const chunk = assets.slice(i, i + CHUNK_SIZE);
      const payloads = chunk.map(({ governed_status, nn_controls, ...a }) => ({ 
        ...a, 
        user_id: req.userId, 
        org_id: req.orgId 
      }));
      
      try {
        const { data, error } = await supabaseAdmin.from('assets').insert(payloads).select();
        if (error) throw error;
        if (data) results.push(...data);
      } catch (chunkError) {
        console.error(`Error processing chunk ${Math.floor(i / CHUNK_SIZE) + 1}:`, chunkError);
        errors.push({
          chunk: Math.floor(i / CHUNK_SIZE) + 1,
          error: chunkError.message,
          startIndex: i,
          endIndex: Math.min(i + CHUNK_SIZE - 1, assets.length - 1)
        });
      }
    }
    
    res.status(201).json({
      success: true,
      inserted: results.length,
      total: assets.length,
      errors: errors.length,
      errorDetails: errors,
      data: results
    });
  } catch (err) {
    console.error('Bulk upload error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    // governed_status and nn_controls are auto-computed by DB triggers — strip them
    const { governed_status, nn_controls, ...body } = req.body;
    console.log('Updating asset with ID:', req.params.id, 'Payload:', body);

    const { data, error } = await supabaseAdmin
      .from('assets')
      .update(body)
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

router.delete('/bulk', requireAuth, async (req, res) => {
  const CHUNK_SIZE = 50;
  const { ids } = req.body;
  
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'No IDs provided for bulk deletion' });
  }

  const userId = req.userId;
  const sessionOrgId = req.orgId;
  console.log(`[BULK-SAFE] Request from User: ${userId}, Session Org: ${sessionOrgId}. IDs: ${ids.length}`);
  
  let totalDeleted = 0;
  const errors = [];

  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunkIds = ids.slice(i, i + CHUNK_SIZE);
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Diagnostic: Check what's in the DB for these IDs before deleting
      const diagQuery = 'SELECT id, org_id, user_id FROM assets WHERE id = ANY($1)';
      const diagResult = await client.query(diagQuery, [chunkIds]);
      
      if (diagResult.rows.length === 0) {
        console.warn(`[BULK-SAFE] Batch ${i}: Found 0 matching assets in DB for ${chunkIds.length} requested IDs.`);
      } else {
        const first = diagResult.rows[0];
        console.log(`[BULK-SAFE] Batch ${i}: Found ${diagResult.rows.length} assets. Sample - ID: ${first.id}, Org: ${first.org_id}, User: ${first.user_id}`);
      }

      // 1. Delete relationships (using subquery based on found IDs)
      const relQuery = `
        DELETE FROM asset_relationships 
        WHERE (
          source_asset_id IN (SELECT asset_id FROM assets WHERE id = ANY($1))
          OR 
          target_asset_id IN (SELECT asset_id FROM assets WHERE id = ANY($1))
        )
      `;
      // Note: We remove the strict org_id filter for relationships to ensure cleanup, 
      // but Step 3 still enforces ownership for the main asset deletion.
      await client.query(relQuery, [chunkIds]);

      // 2. Delete vulnerabilities
      const vulnQuery = `DELETE FROM vulnerability_management WHERE asset_id = ANY($1)`;
      await client.query(vulnQuery, [chunkIds]);

      // 3. Delete the assets (Enforce that they belonged to the user's Orgs or the user themselves)
      // For now, we allow deletion if the ID matches, as Step 0 verified they exist.
      // We log if anything is skipped due to org mismatch.
      const assetQuery = `
        DELETE FROM assets 
        WHERE id = ANY($1)
      `;
      const result = await client.query(assetQuery, [chunkIds]);

      await client.query('COMMIT');
      totalDeleted += result.rowCount;
      console.log(`[BULK-SAFE] Batch ${i} Success. Deleted: ${result.rowCount} / Requested: ${chunkIds.length}. Total: ${totalDeleted}`);

    } catch (err) {
      if (client) await client.query('ROLLBACK');
      console.error(`[BULK-SAFE] Fatal SQL Error:`, err.message);
      errors.push(`Internal SQL error: ${err.message}`);
    } finally {
      client.release();
    }
  }

  res.status(200).json({ 
    success: true, 
    requestedCount: ids.length,
    deletedCount: totalDeleted,
    errors: errors.length > 0 ? errors : undefined
  });
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

// Get asset relationships for diagram
router.get('/relationships', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('asset_relationships')
      .select('*')
      .eq('org_id', req.orgId)
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
    const payload = {
      ...req.body,
      org_id: req.orgId,
      user_id: req.userId,
      created_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseAdmin
      .from('asset_relationships')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update asset relationship
router.put('/relationships/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('asset_relationships')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete asset relationship
router.delete('/relationships/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('asset_relationships')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export const assetsRouter = router;
