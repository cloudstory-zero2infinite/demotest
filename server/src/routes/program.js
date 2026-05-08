import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Derive status from progress_percent (unless Blocked or Escalated)
function deriveStatus(progress, currentStatus) {
  if (currentStatus === 'Blocked') return 'Blocked';
  if (currentStatus === 'Escalated') return 'Escalated';
  if (progress === 0 || progress === undefined || progress === null) return 'Planned';
  if (progress >= 100) return 'Completed';
  return 'InProgress';
}

// GET all program tasks for the org
router.get('/', requireAuth, async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('program')
      .select('*')
      .eq('org_id', req.orgId);

    // Enforce CXO filtering: only see escalated items
    if (req.userRole === 'cxo') {
      query = query.eq('status', 'Escalated');
    }

    const { data, error } = await query.order('last_updated', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST create task
router.post('/', requireAuth, async (req, res) => {
  try {
    const payload = { ...req.body, user_id: req.userId, org_id: req.orgId };
    payload.status = deriveStatus(payload.progress_percent, payload.status);
    const { data, error } = await supabaseAdmin.from('program').insert(payload).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST bulk create tasks
router.post('/bulk', requireAuth, async (req, res) => {
  try {
    const tasks = req.body;
    
    // Simply insert all tasks - frontend handles duplicate detection
    const payloads = tasks.map(t => {
      const p = { ...t, user_id: req.userId, org_id: req.orgId };
      p.status = deriveStatus(p.progress_percent, p.status);
      return p;
    });
    const { data, error } = await supabaseAdmin.from('program').insert(payloads).select();
    if (error) throw error;
    
    res.status(201).json({ 
      data: data || [],
      added: tasks.length
    });
  } catch (err) {
    console.error('Bulk add error:', err);
    res.status(500).json({ message: err.message });
  }
});

// PUT update task
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.progress_percent !== undefined || updates.status !== undefined) {
      updates.status = deriveStatus(
        updates.progress_percent ?? undefined,
        updates.status
      );
    }
    const { data, error } = await supabaseAdmin
      .from('program')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE task
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const query = supabaseAdmin.from('program').delete().eq('id', req.params.id);
    const { error } = req.orgId ? await query.eq('org_id', req.orgId) : await query;
    if (error) {
      if (error.code === '23503') {
        return res.status(409).json({ message: 'Milestone is still referenced by another table.' });
      }
      throw error;
    }
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET history for a program (from all_activity_log, policy-style)
router.get('/:id/history', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('all_activity_log')
      .select('*')
      .eq('module', 'Program')
      .eq('entity_id', req.params.id)
      .eq('org_id', req.orgId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET activity logs for a program
router.get('/:programId/activity', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('program_activity_log')
      .select('*')
      .eq('program_id', req.params.programId)
      .eq('org_id', req.orgId)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST add activity log
router.post('/:programId/activity', requireAuth, async (req, res) => {
  try {
    const { activity } = req.body;
    const { error } = await supabaseAdmin
      .from('program_activity_log')
      .insert({ program_id: req.params.programId, activity, org_id: req.orgId });
    if (error) throw error;
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export const programRouter = router;
