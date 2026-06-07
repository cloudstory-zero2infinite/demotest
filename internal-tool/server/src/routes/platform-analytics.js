import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { classifyTenant } from '../lib/tenant.js';

const router = Router();

// Single read endpoint. Heavy aggregation happens in Postgres RPCs (the
// all_activity_log table is ~8k rows and growing, and the REST select caps at
// 1000 rows). We return small raw-ish datasets and let the frontend handle
// every period dropdown / toggle client-side with no refetch.
router.get('/', requireAuth, async (_req, res) => {
  try {
    const [tenantsRes, usersRes, moduleRes, feedbackRes] = await Promise.all([
      supabaseAdmin.rpc('analytics_tenants'),
      supabaseAdmin.rpc('analytics_users'),
      supabaseAdmin.rpc('analytics_module_usage'),
      supabaseAdmin
        .from('feedback')
        .select('id, description, user_name, user_email, org_name, rating, created_at')
        .order('created_at', { ascending: false }),
    ]);

    for (const r of [tenantsRes, usersRes, moduleRes, feedbackRes]) {
      if (r.error) throw r.error;
    }

    // org_id -> tenant type, so users without an org name still resolve.
    const typeByOrg = new Map();
    const tenants = (tenantsRes.data || []).map((t) => {
      const type = classifyTenant(t.name);
      typeByOrg.set(t.org_id, type);
      return {
        org_id: t.org_id,
        name: t.name,
        type,
        created_at: t.created_at,
        user_count: Number(t.user_count) || 0,
      };
    });

    // Members carry their tenant's type; users tied to no tenant are orphans.
    const users = (usersRes.data || []).map((u) => ({
      user_id: u.user_id,
      org_id: u.org_id,
      type: u.org_id ? typeByOrg.get(u.org_id) || classifyTenant(u.org_name) : 'orphan',
      first_seen: u.first_seen,
      last_login: u.last_login,
    }));

    const moduleUsage = (moduleRes.data || []).map((m) => ({
      module: m.module,
      action: m.action,
      cnt: Number(m.cnt) || 0,
    }));

    const feedback = (feedbackRes.data || []).map((f) => ({
      id: f.id,
      description: f.description,
      user_name: f.user_name,
      user_email: f.user_email,
      org_name: f.org_name,
      type: classifyTenant(f.org_name),
      rating: f.rating,
      created_at: f.created_at,
    }));

    res.json({ tenants, users, moduleUsage, feedback });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ───────── Campaign / event markers (signup-trend callouts) ─────────
router.get('/markers', requireAuth, async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('analytics_campaign_markers')
      .select('*')
      .order('event_date', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/markers', requireAuth, async (req, res) => {
  try {
    const label = (req.body?.label || '').trim();
    const event_date = req.body?.event_date;
    if (!label) return res.status(400).json({ message: 'label is required' });
    if (!event_date) return res.status(400).json({ message: 'event_date is required' });
    const { data, error } = await supabaseAdmin
      .from('analytics_campaign_markers')
      .insert({ label, event_date, created_by: req.userEmail })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/markers/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('analytics_campaign_markers')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ───────── Releases / deploy tracking ─────────
router.get('/releases', requireAuth, async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('release_log')
      .select('*')
      .order('released_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Edit the human one-liner (the rest of a row is machine-written by CI).
router.patch('/releases/:id', requireAuth, async (req, res) => {
  try {
    const notes = typeof req.body?.notes === 'string' ? req.body.notes : null;
    const { data, error } = await supabaseAdmin
      .from('release_log')
      .update({ notes })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export const platformAnalyticsRouter = router;
