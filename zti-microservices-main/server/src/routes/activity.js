import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET all org activity logs (enriched)
router.get('/', requireAuth, async (req, res) => {
  try {
    // If user has no org_id, return empty array
    if (!req.orgId) {
      return res.json([]);
    }
    
    const { data: activityLogs, error: logsError } = await supabaseAdmin
      .from('all_activity_log')
      .select('*')
      .eq('org_id', req.orgId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (logsError) throw logsError;
    if (!activityLogs || activityLogs.length === 0) return res.json([]);

    const { data: orgData } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .eq('id', req.orgId)
      .single();
    const orgName = orgData?.name || 'Unknown Org';

    const { data: orgOnboarding } = await supabaseAdmin
      .from('org_onboarding')
      .select('user_id, role')
      .eq('org_id', req.orgId);
    const roleMap = new Map((orgOnboarding || []).map(r => [r.user_id, r.role]));

    const enriched = activityLogs.map(log => ({
      ...log,
      org_name: orgName,
      user_role: roleMap.get(log.user_id) || 'Unknown',
    }));
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST log an activity
router.post('/', requireAuth, async (req, res) => {
  try {
    const { action, module, entity_id, entity_name, event_data, severity } = req.body;
    const insertPayload = {
      action,
      module,
      entity_id,
      entity_name,
      event_data: {
        ...(event_data || {}),
        user_email: req.user?.email || null,
      },
      severity: severity || 'info',
      user_id: req.userId,
      org_id: req.orgId,
      user_agent: req.headers['user-agent'] || null,
    };
    const { error } = await supabaseAdmin.from('all_activity_log').insert(insertPayload);
    if (error) throw error;
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET org-level program activity logs
router.get('/program', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('program_activity_log')
      .select('*')
      .eq('org_id', req.orgId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export const activityRouter = router;
