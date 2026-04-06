import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/org-settings — returns org settings, auto-creates default if none
router.get('/', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('org_settings')
      .select('policy_refresh_months')
      .eq('org_id', req.orgId)
      .maybeSingle();

    if (error) throw error;

    if (data) return res.json(data);

    // Auto-create default settings
    const { data: created, error: createErr } = await supabaseAdmin
      .from('org_settings')
      .upsert({ org_id: req.orgId, policy_refresh_months: 3 }, { onConflict: 'org_id' })
      .select('policy_refresh_months')
      .single();

    if (createErr) throw createErr;
    res.json(created);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/org-settings — update settings (admin/tenant_admin only)
router.put('/', requireAuth, async (req, res) => {
  try {
    if (!['admin', 'tenant_admin'].includes(req.userRole)) {
      return res.status(403).json({ message: 'Only admins can update organisation settings' });
    }

    const { policy_refresh_months } = req.body;
    if (!Number.isInteger(policy_refresh_months) || policy_refresh_months < 1) {
      return res.status(400).json({ message: 'policy_refresh_months must be a positive integer' });
    }

    const { data, error } = await supabaseAdmin
      .from('org_settings')
      .upsert(
        { org_id: req.orgId, policy_refresh_months, updated_at: new Date().toISOString() },
        { onConflict: 'org_id' }
      )
      .select('policy_refresh_months')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export { router as orgSettingsRouter };
