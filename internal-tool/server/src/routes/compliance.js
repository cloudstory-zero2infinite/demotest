import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Whitelist columns we are allowed to write to the compliance table.
const ALLOWED = ['compliance_id', 'framework', 'description', 'status'];

function clean(body) {
  const out = {};
  for (const k of ALLOWED) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

router.get('/', requireAuth, async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('compliance')
      .select('*')
      .order('framework', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const payload = clean(req.body);
    if (!payload.framework) {
      return res.status(400).json({ message: 'framework is required' });
    }
    const { data, error } = await supabaseAdmin
      .from('compliance')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Bulk insert (must be defined before /:id)
router.post('/bulk', requireAuth, async (req, res) => {
  try {
    const rows = Array.isArray(req.body) ? req.body : [];
    if (!rows.length) return res.status(400).json({ message: 'Empty payload' });
    const payload = rows.map(clean).filter((r) => r.framework);
    if (!payload.length) {
      return res.status(400).json({ message: 'No valid rows (framework required)' });
    }
    const { data, error } = await supabaseAdmin.from('compliance').insert(payload).select();
    if (error) throw error;
    res.status(201).json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Bulk delete (must be defined before /:id)
router.delete('/bulk', requireAuth, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
    if (!ids || !ids.length) return res.status(400).json({ message: 'ids[] required' });
    const { error } = await supabaseAdmin.from('compliance').delete().in('id', ids);
    if (error) throw error;
    res.json({ deleted: ids.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const payload = clean(req.body);
    const { data, error } = await supabaseAdmin
      .from('compliance')
      .update(payload)
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
    const { error } = await supabaseAdmin.from('compliance').delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export const complianceRouter = router;
