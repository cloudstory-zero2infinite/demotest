import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/org-settings — returns org settings, auto-creates default if none
router.get('/', requireAuth, async (req, res) => {
  try {
    
    const { data, error } = await supabaseAdmin
      .from('org_settings')
      .select('policy_refresh_months, policy_expiry_template_id')
      .eq('org_id', req.orgId)
      .maybeSingle();

    if (error) throw error;

    let settings = data;
    if (!settings) {
      const { data: created, error: createErr } = await supabaseAdmin
        .from('org_settings')
        .upsert({ org_id: req.orgId, policy_refresh_months: 3 }, { onConflict: 'org_id' })
        .select('policy_refresh_months, policy_expiry_template_id')
        .single();
      if (createErr) throw createErr;
      settings = created;
    }

    // Also fetch needed_framework from organizations table
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('needed_framework')
      .eq('id', req.orgId)
      .single();

    res.json({
      policy_refresh_months: settings.policy_refresh_months,
      policy_expiry_template_id: settings.policy_expiry_template_id ?? null,
      needed_framework: org?.needed_framework ?? [],
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/org-settings/available-frameworks — distinct framework values from compliance table
router.get('/available-frameworks', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('compliance')
      .select('framework');

    if (error) throw error;

    const unique = [...new Set((data || []).map(r => r.framework).filter(Boolean))].sort();
    res.json(unique);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/org-settings — update settings (admin/tenant_admin/cxo only)
router.put('/', requireAuth, async (req, res) => {
  try {
    if (!['admin', 'tenant_admin', 'cxo'].includes(req.userRole)) {
      return res.status(403).json({ message: 'Only admins, tenant_admins, and CXOs can update organisation settings' });
    }

    const { policy_refresh_months, needed_framework, policy_expiry_template_id } = req.body;

    if (policy_refresh_months !== undefined) {
      if (!Number.isInteger(policy_refresh_months) || policy_refresh_months < 1) {
        return res.status(400).json({ message: 'policy_refresh_months must be a positive integer' });
      }
    }

    if (needed_framework !== undefined && !Array.isArray(needed_framework)) {
      return res.status(400).json({ message: 'needed_framework must be an array of strings' });
    }

    // Update org_settings table
    const settingsPayload = { org_id: req.orgId, updated_at: new Date().toISOString() };
    if (policy_refresh_months !== undefined) settingsPayload.policy_refresh_months = policy_refresh_months;
    // null clears the selection → reminders fall back to the built-in default.
    if (policy_expiry_template_id !== undefined) settingsPayload.policy_expiry_template_id = policy_expiry_template_id || null;

    const { data, error } = await supabaseAdmin
      .from('org_settings')
      .upsert(settingsPayload, { onConflict: 'org_id' })
      .select('policy_refresh_months, policy_expiry_template_id')
      .single();

    if (error) throw error;

    // Update needed_framework on organizations table
    let savedFrameworks = [];
    if (needed_framework !== undefined) {
      const { data: orgData, error: orgErr } = await supabaseAdmin
        .from('organizations')
        .update({ needed_framework })
        .eq('id', req.orgId)
        .select('needed_framework')
        .single();

      if (orgErr) throw orgErr;
      savedFrameworks = orgData?.needed_framework ?? [];
    }

    res.json({
      policy_refresh_months: data.policy_refresh_months,
      policy_expiry_template_id: data.policy_expiry_template_id ?? null,
      needed_framework: needed_framework !== undefined ? savedFrameworks : undefined,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export { router as orgSettingsRouter };