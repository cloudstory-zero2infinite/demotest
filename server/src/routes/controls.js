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
    console.log('Fetching compliance tags for org:', req.orgId);
    const { data, error } = await supabaseAdmin
      .from('compliance')
      .select('compliance_id')
      .eq('org_id', req.orgId);
    
    if (error) {
      console.error('Compliance tags error:', error);
      throw error;
    }
    
    console.log('Compliance tags data:', data);
    res.json((data || []).map(item => item.compliance_id));
  } catch (err) {
    console.error('Error fetching compliance tags:', err);
    res.status(500).json({ message: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const payload = { ...req.body, user_id: req.userId, org_id: req.orgId };
    
    // Check if control with same ctl_id already exists
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('internal_control_catalogue')
      .select('id')
      .eq('ctl_id', payload.ctl_id)
      .eq('org_id', req.orgId)
      .single();
    
    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "not found"
      throw checkError;
    }
    
    if (existing) {
      return res.status(409).json({ 
        message: 'Control with this CTL ID already exists',
        existingId: existing.id
      });
    }
    
    const { data, error } = await supabaseAdmin
      .from('internal_control_catalogue')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Error creating control:', err);
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
