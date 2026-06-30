import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // Limit to 5MB

// GET /api/org-settings — returns org settings, auto-creates default if none
router.get('/', requireAuth, async (req, res) => {
  try {
    
    const { data, error } = await supabaseAdmin
      .from('org_settings')
      .select('policy_refresh_months, policy_expiry_template_id, logo_url, signature_url, selected_template_id')
      .eq('org_id', req.orgId)
      .maybeSingle();

    if (error) throw error;

    let settings = data;
    if (!settings) {
      const { data: created, error: createErr } = await supabaseAdmin
        .from('org_settings')
        .upsert({ org_id: req.orgId, policy_refresh_months: 3 }, { onConflict: 'org_id' })
        .select('policy_refresh_months, policy_expiry_template_id, logo_url, signature_url, selected_template_id')
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
      logo_url: settings.logo_url ?? null,
      signature_url: settings.signature_url ?? null,
      selected_template_id: settings.selected_template_id ?? null,
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

    const { policy_refresh_months, needed_framework, policy_expiry_template_id, selected_template_id } = req.body;

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
    if (policy_expiry_template_id !== undefined) settingsPayload.policy_expiry_template_id = policy_expiry_template_id || null;
    if (selected_template_id !== undefined) {
      if (selected_template_id === 'standard') {
        const { data: existing } = await supabaseAdmin
          .from('policy_templates')
          .select('id')
          .eq('org_id', req.orgId)
          .eq('name', 'Standard Template')
          .maybeSingle();

        if (existing) {
          settingsPayload.selected_template_id = existing.id;
        } else {
          const { data: newTemp, error: insertErr } = await supabaseAdmin
            .from('policy_templates')
            .insert({
              org_id: req.orgId,
              name: 'Standard Template',
              description: 'The built-in default policy template.',
              file_path: 'standard'
            })
            .select('id')
            .single();

          if (insertErr) throw insertErr;
          settingsPayload.selected_template_id = newTemp.id;
        }
      } else {
        settingsPayload.selected_template_id = selected_template_id || null;
      }
    }

    const { data, error } = await supabaseAdmin
      .from('org_settings')
      .upsert(settingsPayload, { onConflict: 'org_id' })
      .select('policy_refresh_months, policy_expiry_template_id, logo_url, signature_url, selected_template_id')
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
      logo_url: data.logo_url ?? null,
      signature_url: data.signature_url ?? null,
      selected_template_id: data.selected_template_id ?? null,
      needed_framework: needed_framework !== undefined ? savedFrameworks : undefined,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/org-settings/logo — uploads logo to Policy-logo bucket and updates org_settings
router.post('/logo', requireAuth, upload.single('logo'), async (req, res) => {
  try {
    if (!['admin', 'tenant_admin', 'cxo'].includes(req.userRole)) {
      return res.status(403).json({ message: 'Only admins, tenant_admins, and CXOs can upload logos' });
    }
    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: 'No logo file provided.' });
    }

    const fileExt = file.originalname.split('.').pop();
    const fileName = `logos/${req.orgId}/${Date.now()}.${fileExt}`;

    // Upload to Supabase Storage
    const { error: uploadErr } = await supabaseAdmin.storage
      .from('Policy-logo')
      .upload(fileName, file.buffer, { contentType: file.mimetype, upsert: true });

    if (uploadErr) throw uploadErr;

    // Get public URL
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('Policy-logo')
      .getPublicUrl(fileName);

    // Update org_settings
    const { data, error } = await supabaseAdmin
      .from('org_settings')
      .upsert({ org_id: req.orgId, logo_url: publicUrl, updated_at: new Date().toISOString() }, { onConflict: 'org_id' })
      .select('logo_url')
      .single();

    if (error) throw error;

    res.json({ logo_url: data.logo_url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/org-settings/signature — uploads signature to Policy-logo bucket and updates org_settings
router.post('/signature', requireAuth, upload.single('signature'), async (req, res) => {
  try {
    if (!['admin', 'tenant_admin', 'cxo'].includes(req.userRole)) {
      return res.status(403).json({ message: 'Only admins, tenant_admins, and CXOs can upload signatures' });
    }
    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: 'No signature file provided.' });
    }

    const fileExt = file.originalname.split('.').pop();
    const fileName = `signatures/${req.orgId}/${Date.now()}.${fileExt}`;

    // Upload to Supabase Storage
    const { error: uploadErr } = await supabaseAdmin.storage
      .from('Policy-logo')
      .upload(fileName, file.buffer, { contentType: file.mimetype, upsert: true });

    if (uploadErr) throw uploadErr;

    // Get public URL
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('Policy-logo')
      .getPublicUrl(fileName);

    // Update org_settings
    const { data, error } = await supabaseAdmin
      .from('org_settings')
      .upsert({ org_id: req.orgId, signature_url: publicUrl, updated_at: new Date().toISOString() }, { onConflict: 'org_id' })
      .select('signature_url')
      .single();

    if (error) throw error;

    res.json({ signature_url: data.signature_url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export { router as orgSettingsRouter };
