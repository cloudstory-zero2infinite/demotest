import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('internal_control_catalogue')
      .select('*')
      .eq('org_id', req.orgId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/compliance-tags', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('compliance')
      .select('compliance_id')
      .eq('org_id', req.orgId);
    if (error) throw error;
    res.json((data || []).map(item => item.compliance_id));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const payload = { ...req.body, user_id: req.userId, org_id: req.orgId };
    const { data, error } = await supabaseAdmin
      .from('internal_control_catalogue')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/bulk', requireAuth, async (req, res) => {
  try {
    const payloads = req.body.map(c => ({ ...c, user_id: req.userId, org_id: req.orgId }));
    const { data, error } = await supabaseAdmin
      .from('internal_control_catalogue')
      .insert(payloads)
      .select();
    if (error) throw error;
    res.status(201).json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('internal_control_catalogue')
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

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('internal_control_catalogue')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export const controlsRouter = router;
