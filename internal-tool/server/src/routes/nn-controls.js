import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const ALLOWED = [
  'ctl_name',
  'ctl_description',
  'enforcement_type',
  'ctld_by',
  'ctl_ref_fw',
  'ctl_other_details',
];

function clean(body) {
  const out = {};
  for (const k of ALLOWED) {
    if (body[k] !== undefined) {
      // Coerce ctld_by to array
      if (k === 'ctld_by') {
        if (Array.isArray(body[k])) out[k] = body[k];
        else if (typeof body[k] === 'string')
          out[k] = body[k]
            .split(/[,;]/)
            .map((s) => s.trim())
            .filter(Boolean);
        else out[k] = [];
      } else {
        out[k] = body[k];
      }
    }
  }
  return out;
}

router.get('/', requireAuth, async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('nn_control_templates')
      .select('*')
      .order('ctl_name', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const payload = clean(req.body);
    if (!payload.ctl_name) return res.status(400).json({ message: 'ctl_name is required' });
    const { data, error } = await supabaseAdmin
      .from('nn_control_templates')
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
    const rows = Array.isArray(req.body) ? req.body : [];
    if (!rows.length) return res.status(400).json({ message: 'Empty payload' });
    const payload = rows.map(clean).filter((r) => r.ctl_name);
    if (!payload.length) {
      return res.status(400).json({ message: 'No valid rows (ctl_name required)' });
    }
    const { data, error } = await supabaseAdmin
      .from('nn_control_templates')
      .insert(payload)
      .select();
    if (error) throw error;
    res.status(201).json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/bulk', requireAuth, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
    if (!ids || !ids.length) return res.status(400).json({ message: 'ids[] required' });
    const { error } = await supabaseAdmin.from('nn_control_templates').delete().in('id', ids);
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
      .from('nn_control_templates')
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
    const { error } = await supabaseAdmin
      .from('nn_control_templates')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export const nnControlsRouter = router;
