// Risk Registry — deterministic (no AI) computation of inherent/residual risk
// from the org's control_registry enforcement against the SCF risk catalog.
//
// The heavy lifting lives in the Postgres function compute_risk_register(org),
// which joins control_registry → scf_control_risks → scf_controls.weighting →
// scf_risks and writes a per-org snapshot into risk_register. These routes are
// thin wrappers around that function + a read of the snapshot.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';

const router = Router();

const VALID_LEVELS = ['Critical', 'High', 'Medium', 'Low', 'None'];
// Representative score per level so manual rows sort sensibly among computed ones.
const LEVEL_SCORE = { Critical: 90, High: 65, Medium: 40, Low: 15, None: 0 };

// ── POST /compute — (re)compute the risk register for the caller's org ──────
router.post('/compute', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) {
      return res.status(400).json({ message: 'No organisation found for user.' });
    }
    const { error } = await supabaseAdmin.rpc('compute_risk_register', { org_uuid: req.orgId });
    if (error) throw new Error(error.message);

    // Read back the fresh snapshot so the client can render without a 2nd call.
    const { data, error: readErr } = await supabaseAdmin
      .from('risk_register')
      .select('*')
      .eq('org_id', req.orgId)
      .order('residual_score', { ascending: false });
    if (readErr) throw new Error(readErr.message);

    const computedAt = data && data.length ? data[0].computed_at : new Date().toISOString();
    res.json({ status: 'ok', computed_at: computedAt, count: (data || []).length, register: data || [] });
  } catch (err) {
    console.error('[risk/compute] error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ── GET /register — read the stored risk register snapshot ──────────────────
router.get('/register', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) {
      return res.status(400).json({ message: 'No organisation found for user.' });
    }
    const { data, error } = await supabaseAdmin
      .from('risk_register')
      .select('*')
      .eq('org_id', req.orgId)
      .order('residual_score', { ascending: false });
    if (error) throw new Error(error.message);
    res.json({ computed_at: data && data.length ? data[0].computed_at : null, register: data || [] });
  } catch (err) {
    console.error('[risk/register] error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ── Manual risk entries (survive recompute via source='manual') ─────────────
function genManualRiskId() {
  return 'M-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

function manualPayload(body) {
  const name = (body.risk_name || '').trim();
  if (!name) throw new Error('risk_name is required');
  const inherent = VALID_LEVELS.includes(body.inherent_level) ? body.inherent_level : 'Medium';
  const residual = VALID_LEVELS.includes(body.residual_level) ? body.residual_level : inherent;
  return {
    risk_grouping: (body.risk_grouping || '').trim() || null,
    risk_name: name,
    risk_description: (body.risk_description || '').trim() || null,
    nist_csf_function: (body.nist_csf_function || '').trim() || null,
    inherent_level: inherent,
    residual_level: residual,
    inherent_score: LEVEL_SCORE[inherent],
    residual_score: LEVEL_SCORE[residual],
  };
}

// POST /manual — create a manual risk row.
router.post('/manual', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) return res.status(400).json({ message: 'No organisation found for user.' });
    const p = manualPayload(req.body || {});
    const { data, error } = await supabaseAdmin
      .from('risk_register')
      .insert({
        org_id: req.orgId,
        user_id: req.userId,
        risk_id: genManualRiskId(),
        source: 'manual',
        total_controls: 0,
        enforced_controls: 0,
        total_weight: 0,
        enforced_weight: 0,
        gap: 0,
        computed_at: new Date().toISOString(),
        ...p,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    res.status(201).json(data);
  } catch (err) {
    console.error('[risk/manual create] error:', err);
    res.status(400).json({ message: err.message });
  }
});

// PUT /manual/:id — update a manual risk (scoped to org + source='manual').
router.put('/manual/:id', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) return res.status(400).json({ message: 'No organisation found for user.' });
    const p = manualPayload(req.body || {});
    const { data, error } = await supabaseAdmin
      .from('risk_register')
      .update({ ...p, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('org_id', req.orgId)
      .eq('source', 'manual')
      .select()
      .single();
    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ message: 'Manual risk not found.' });
    res.json(data);
  } catch (err) {
    console.error('[risk/manual update] error:', err);
    res.status(400).json({ message: err.message });
  }
});

// DELETE /manual/:id — delete a manual risk.
router.delete('/manual/:id', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) return res.status(400).json({ message: 'No organisation found for user.' });
    const { error } = await supabaseAdmin
      .from('risk_register')
      .delete()
      .eq('id', req.params.id)
      .eq('org_id', req.orgId)
      .eq('source', 'manual');
    if (error) throw new Error(error.message);
    res.status(204).send();
  } catch (err) {
    console.error('[risk/manual delete] error:', err);
    res.status(500).json({ message: err.message });
  }
});

export { router as riskRouter };
