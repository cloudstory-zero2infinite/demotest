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

// Helper for logging to program_activity_log
async function logProgramActivity(req, programId, activityData) {
  try {
    const { action, event_data } = activityData;
    const activityJson = JSON.stringify({
      action,
      event_data: {
        ...event_data,
        user_email: req.user?.email || null
      }
    });
    
    await supabaseAdmin
      .from('program_activity_log')
      .insert({
        program_id: programId,
        activity: activityJson,
        org_id: req.orgId,
        user_id: req.userId,
        timestamp: new Date().toISOString()
      });
  } catch (err) {
    console.error('Error logging program activity:', err);
  }
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

    await logProgramActivity(req, data.id, {
      action: 'program_created',
      event_data: {
        program_name: data.program_name,
        status: data.status
      }
    });

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
    
    if (data && data.length > 0) {
      for (const item of data) {
        await logProgramActivity(req, item.id, {
          action: 'program_created',
          event_data: {
            program_name: item.program_name,
            status: item.status,
            note: 'Bulk imported'
          }
        });
      }
    }

    res.status(201).json({ 
      data: data || [],
      added: tasks.length
    });
  } catch (err) {
    console.error('Bulk add error:', err);
    res.status(500).json({ message: err.message });
  }
});

// GET single task
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('program')
      .select('*')
      .eq('id', req.params.id)
      .eq('org_id', req.orgId)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT update task
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const updates = { ...req.body };
    
    // Fetch old record for history
    const { data: oldRecord } = await supabaseAdmin
      .from('program')
      .select('*')
      .eq('id', req.params.id)
      .single();

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

    // Log changes
    if (oldRecord) {
      const changes = [];
      if (oldRecord.status !== data.status) {
        await logProgramActivity(req, data.id, {
          action: 'status_changed',
          event_data: {
            from_status: oldRecord.status,
            to_status: data.status
          }
        });
      }
      if (oldRecord.assignee !== data.assignee) {
        await logProgramActivity(req, data.id, {
          action: 'assignee_changed',
          event_data: {
            from_assignee: oldRecord.assignee,
            to_assignee: data.assignee
          }
        });
      }
      if (oldRecord.progress_percent !== data.progress_percent) {
        await logProgramActivity(req, data.id, {
          action: 'progress_updated',
          event_data: {
            from_progress: oldRecord.progress_percent,
            to_progress: data.progress_percent
          }
        });
      }
      // Specific field updates
      if (oldRecord.program_name !== data.program_name) {
         await logProgramActivity(req, data.id, {
          action: 'program_updated',
          event_data: {
            program_name: data.program_name
          }
        });
      }
      if (oldRecord.description !== data.description) {
        await logProgramActivity(req, data.id, {
          action: 'description_updated',
          event_data: {
            from_description: oldRecord.description,
            to_description: data.description
          }
        });
      }
      if (oldRecord.due_date !== data.due_date) {
        await logProgramActivity(req, data.id, {
          action: 'due_date_updated',
          event_data: {
            from_date: oldRecord.due_date,
            to_date: data.due_date
          }
        });
      }
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE task
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    // Fetch for history before deleting
    const { data: record } = await supabaseAdmin
      .from('program')
      .select('*')
      .eq('id', req.params.id)
      .single();

    const query = supabaseAdmin.from('program').delete().eq('id', req.params.id);
    const { error } = req.orgId ? await query.eq('org_id', req.orgId) : await query;
    if (error) {
      if (error.code === '23503') {
        return res.status(409).json({ message: 'Milestone is still referenced by another table.' });
      }
      throw error;
    }

    if (record) {
      await logProgramActivity(req, record.id, {
        action: 'program_deleted',
        event_data: {
          program_name: record.program_name
        }
      });
    }

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET history for a program (from program_activity_log)
router.get('/:id/history', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('program_activity_log')
      .select('*')
      .eq('program_id', req.params.id)
      .eq('org_id', req.orgId)
      .order('timestamp', { ascending: false });
    if (error) throw error;
    
    // Map to AllActivityLog format for frontend
    const mapped = (data || []).map(item => {
      try {
        const parsed = typeof item.activity === 'string' && item.activity.startsWith('{') 
          ? JSON.parse(item.activity) 
          : { action: 'comment', event_data: { comment: item.activity } };
        
        return {
          id: item.id,
          action: parsed.action || 'comment',
          event_data: parsed.event_data || { comment: item.activity },
          created_at: item.timestamp,
          user_id: item.user_id,
          org_id: item.org_id,
          module: 'Program',
          entity_id: item.program_id
        };
      } catch (e) {
        return {
          id: item.id,
          action: 'comment',
          event_data: { comment: item.activity },
          created_at: item.timestamp,
          user_id: item.user_id,
          org_id: item.org_id,
          module: 'Program',
          entity_id: item.program_id
        };
      }
    });
    res.json(mapped);
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
      .order('timestamp', { ascending: false })
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
    const { activity, action, event_data } = req.body;
    
    let activityToStore = activity;
    if (action) {
      activityToStore = JSON.stringify({
        action,
        event_data: {
          ...event_data,
          user_email: req.user?.email || null
        }
      });
    }

    const { data: log, error } = await supabaseAdmin
      .from('program_activity_log')
      .insert({
        program_id: req.params.programId,
        activity: activityToStore,
        org_id: req.orgId,
        user_id: req.userId,
        timestamp: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Sync to program table if it's a comment
    if (action === 'comment_added') {
      const commentObj = {
        text: event_data.comment,
        user_id: req.userId,
        timestamp: new Date().toISOString(),
        actor_name: req.user?.email?.split('@')[0] || 'User',
        user_email: req.user?.email
      };
      const { data: p } = await supabaseAdmin.from('program').select('comments').eq('id', req.params.programId).single();
      const arr = Array.isArray(p?.comments) ? p.comments : [];
      await supabaseAdmin.from('program').update({ comments: [...arr, commentObj] }).eq('id', req.params.programId);
    }

    res.status(201).json(log);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT update activity log (for comments editing)
router.put('/:id/activity/:activityId', requireAuth, async (req, res) => {
  try {
    const { activityId } = req.params;
    const { activity, action, event_data } = req.body;

    // Fetch existing log to check ownership
    const { data: log, error: fetchError } = await supabaseAdmin
      .from('program_activity_log')
      .select('*')
      .eq('id', activityId)
      .single();

    if (fetchError || !log) return res.status(404).json({ message: 'Log not found' });
    if (log.user_id !== req.userId) return res.status(403).json({ message: 'Unauthorized' });

    let updatedActivity = activity;
    if (action) {
      let parsed = {};
      try {
        parsed = typeof log.activity === 'string' && log.activity.startsWith('{') ? JSON.parse(log.activity) : {};
      } catch (e) {
        parsed = { event_data: { comment: log.activity } };
      }
      
      updatedActivity = JSON.stringify({
        ...parsed,
        action,
        event_data: {
          ...(parsed.event_data || {}),
          ...event_data,
          edited: true,
          edited_at: new Date().toISOString()
        }
      });
    }

    const { error } = await supabaseAdmin
      .from('program_activity_log')
      .update({ activity: updatedActivity })
      .eq('id', activityId);

    if (error) throw error;

    // Log the edit action for history tracking
    let commentText = 'Comment updated';
    try {
      const parsed = JSON.parse(updatedActivity);
      commentText = parsed.event_data?.comment || parsed.event_data?.text || commentText;
    } catch (e) {}

    await logProgramActivity(req, req.params.id, {
      action: 'comment_edited',
      event_data: {
        comment: commentText
      }
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE activity log (comment)
router.delete('/:id/activity/:activityId', requireAuth, async (req, res) => {
  try {
    const { activityId, id: programId } = req.params;

    // Fetch existing log to check ownership
    const { data: log, error: fetchError } = await supabaseAdmin
      .from('program_activity_log')
      .select('*')
      .eq('id', activityId)
      .single();

    if (fetchError || !log) return res.status(404).json({ message: 'Log not found' });
    if (log.user_id !== req.userId) return res.status(403).json({ message: 'Unauthorized' });

    // Parse to get the comment text for the deletion log
    let commentText = 'Comment';
    try {
      const parsed = typeof log.activity === 'string' && log.activity.startsWith('{') ? JSON.parse(log.activity) : {};
      commentText = parsed.event_data?.comment || parsed.event_data?.text || 'Comment';
    } catch (e) {}

    // Delete the log
    const { error: deleteError } = await supabaseAdmin
      .from('program_activity_log')
      .delete()
      .eq('id', activityId);

    if (deleteError) throw deleteError;

    // Add "comment_deleted" activity entry
    await logProgramActivity(req, programId, {
      action: 'comment_deleted',
      event_data: {
        note: `Comment deleted by user`
      }
    });

    // Sync: Remove from program table array
    const { data: p } = await supabaseAdmin.from('program').select('comments').eq('id', programId).single();
    if (p && Array.isArray(p.comments)) {
      const updatedArr = p.comments.filter(c => !(c.text === commentText && c.user_id === req.userId));
      await supabaseAdmin.from('program').update({ comments: updatedArr }).eq('id', programId);
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export const programRouter = router;
