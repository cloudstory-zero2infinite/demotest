import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { generateNextAssetId, ensureAssetTypeAndFields } from '../lib/assetIngest.js';

const router = Router();

// ════════════════════════════════════════════════════════════
//  USER-FACING (browser JWT) — requireAuth
//  Drives the ZTI Hub Services → Asset Registry - SSoT tab. Reviews rows
//  staged by POST /api/assets/sync (device-facing, in routes/assets.js)
//  before they become real assets.
// ════════════════════════════════════════════════════════════

// List registry rows for this org, most recent first.
router.get('/', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) return res.json([]);
    const { data, error } = await supabaseAdmin
      .from('asset_registry_ssot')
      .select('*')
      .eq('org_id', req.orgId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[asset-registry] list error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Conflict diff: for each pending row, the existing asset it's linked to (or
// matches by integration + external_id), so the GUI can render
// current(left)/incoming(right) like the vuln-scan review screen.
router.get('/diff', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) return res.json([]);
    const { data: rows, error } = await supabaseAdmin
      .from('asset_registry_ssot')
      .select('*')
      .eq('org_id', req.orgId)
      .eq('review_status', 'pending');
    if (error) throw error;

    const withAssetId = (rows || []).filter((r) => r.asset_id);
    const existingById = new Map();
    if (withAssetId.length) {
      const { data } = await supabaseAdmin
        .from('assets')
        .select('*')
        .in('id', withAssetId.map((r) => r.asset_id));
      for (const a of data || []) existingById.set(a.id, a);
    }

    res.json((rows || []).map((r) => {
      const current = r.asset_id ? existingById.get(r.asset_id) || null : null;
      return { incoming: r, current, conflict: !!current };
    }));
  } catch (err) {
    console.error('[asset-registry] diff error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Commit analyst-approved rows into assets. Body: { approve: [id...], discard: [id...] }.
// Approving registers/extends the integration's asset_types pill (e.g. "Wazuh")
// and creates the asset on first approval, or updates the linked asset on
// subsequent approvals of the same agent.
router.post('/import', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) return res.status(400).json({ message: 'No organization for this user' });
    const approve = Array.isArray(req.body?.approve) ? req.body.approve : [];
    const discard = Array.isArray(req.body?.discard) ? req.body.discard : [];

    if (discard.length) {
      await supabaseAdmin
        .from('asset_registry_ssot')
        .update({ review_status: 'discarded' })
        .in('id', discard)
        .eq('org_id', req.orgId);
    }

    let imported = 0;
    if (approve.length) {
      const { data: rows, error } = await supabaseAdmin
        .from('asset_registry_ssot')
        .select('*')
        .in('id', approve)
        .eq('org_id', req.orgId)
        .eq('review_status', 'pending');
      if (error) throw error;

      // Register/extend a pill per distinct integration type in this batch.
      const fieldsByType = new Map();
      for (const r of rows || []) {
        const type = r.custom_fields?.type;
        if (!type) continue;
        const set = fieldsByType.get(type) || new Set(['ip_address']);
        Object.keys(r.custom_fields || {}).forEach((k) => set.add(k));
        fieldsByType.set(type, set);
      }
      for (const [type, fieldSet] of fieldsByType) {
        await ensureAssetTypeAndFields(req.orgId, req.userId, type, [...fieldSet]);
      }

      for (const r of rows || []) {
        const payload = {
          name: r.name || 'Unknown asset',
          criticality: r.criticality || 'Medium',
          exposure: r.exposure || 'Internal',
          category: r.category || 'Services/Infra',
          details: r.details,
          ip_address: r.ip_address,
          status: r.status || 'Active',
          source: r.source || 'API',
          custom_fields: r.custom_fields,
          org_id: req.orgId,
          user_id: req.userId,
        };

        let assetId = r.asset_id;
        if (assetId) {
          const { error: uErr } = await supabaseAdmin.from('assets').update(payload).eq('id', assetId);
          if (uErr) throw uErr;
        } else {
          payload.asset_id = await generateNextAssetId(req.orgId);
          const { data, error: iErr } = await supabaseAdmin.from('assets').insert(payload).select('id').single();
          if (iErr) throw iErr;
          assetId = data.id;
        }

        await supabaseAdmin
          .from('asset_registry_ssot')
          .update({ review_status: 'imported', asset_id: assetId })
          .eq('id', r.id)
          .eq('org_id', req.orgId);
        imported += 1;
      }
    }

    res.json({ imported, discarded: discard.length });
  } catch (err) {
    console.error('[asset-registry] import error:', err);
    res.status(500).json({ message: err.message });
  }
});

export const assetRegistryRouter = router;
