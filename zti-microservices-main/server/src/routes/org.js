import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET current user's org and role info
router.get('/me', requireAuth, async (req, res) => {
  try {
    res.json({
      userId: req.userId,
      orgId: req.orgId,
      role: req.userRole,
      email: req.user?.email,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET all users in the org
router.get('/users', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('org_onboarding')
      .select('*')
      .eq('org_id', req.orgId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST create organization
router.post('/create', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    const { data, error } = await supabaseAdmin
      .from('organizations')
      .insert({ name })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST onboard a user to the org
router.post('/onboard', requireAuth, async (req, res) => {
  try {
    const { email, role = 'user', description } = req.body;
    const orgId = req.orgId;

    // Look up user_id by email
    const { data: userId } = await supabaseAdmin
      .rpc('get_user_id_by_email', { email_input: email })
      .single();

    const payload = {
      org_id: orgId,
      email: email.toLowerCase(),
      role,
      ...(userId ? { user_id: userId } : {}),
      ...(description?.trim() ? { description } : {}),
    };

    const { data, error } = await supabaseAdmin
      .from('org_onboarding')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export const orgRouter = router;
