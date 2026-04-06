import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/org-contacts — list all contacts for the org
router.get('/', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('org_contacts')
      .select('*')
      .eq('org_id', req.orgId)
      .order('name', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/org-contacts — create a contact
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, email, department } = req.body;
    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }
    const { data, error } = await supabaseAdmin
      .from('org_contacts')
      .insert({ name, email, department: department || '', org_id: req.orgId })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/org-contacts/:id — update a contact
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { name, email, department } = req.body;
    const { data, error } = await supabaseAdmin
      .from('org_contacts')
      .update({ name, email, department, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('org_id', req.orgId)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/org-contacts/:id — delete a contact
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('org_contacts')
      .delete()
      .eq('id', req.params.id)
      .eq('org_id', req.orgId);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export const orgContactsRouter = router;
