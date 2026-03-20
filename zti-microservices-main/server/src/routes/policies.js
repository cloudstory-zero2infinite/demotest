import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    // If user has no org_id, return empty array
    if (!req.orgId) {
      return res.json([]);
    }
    
    const { data, error } = await supabaseAdmin
      .from('policy_documents')
      .select('*')
      .eq('org_id', req.orgId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Error fetching policies:', err);
    res.status(500).json({ message: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { owner, policy_doc_link, ...rest } = req.body;
    const payload = {
      ...rest,
      url: policy_doc_link || rest.url,
      owner_name: owner || null,
      user_id: req.userId,
      org_id: req.orgId,
    };
    const { data, error } = await supabaseAdmin
      .from('policy_documents')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { owner, policy_doc_link, ...updateData } = req.body;
    if (policy_doc_link !== undefined) updateData.url = policy_doc_link;
    if (owner !== undefined) updateData.owner_name = owner || null;
    const { data, error } = await supabaseAdmin
      .from('policy_documents')
      .update(updateData)
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
      .from('policy_documents')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export const policiesRouter = router;
