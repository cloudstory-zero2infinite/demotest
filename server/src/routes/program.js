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

// Helper for logging to the global all_activity_log (powers the Activity Logs tab).
async function logAllActivityServer(req, { action, entity_id, entity_name, event_data }) {
  try {
    await supabaseAdmin.from('all_activity_log').insert({
      action,
      module: 'Program',
      entity_id: entity_id ? String(entity_id) : null,
      entity_name: entity_name || null,
      event_data: { ...(event_data || {}), user_email: req.user?.email || null },
      severity: 'info',
      user_id: req.userId,
      org_id: req.orgId,
      user_agent: req.headers['user-agent'] || null,
    });
  } catch (err) {
    console.error('Error logging to all_activity_log:', err);
  }
}

// Org prefix: first 2 alphanumeric chars of the org name, uppercased, padded with X.
// Matches the house style used for Control (CTL-AB-001) and Asset IDs.
function orgCodePrefix(orgName) {
  const cleaned = (orgName || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return (cleaned.substring(0, 2) || '').padEnd(2, 'X');
}

// Highest existing TSK-<prefix>-<n> sequence number among the given codes.
function maxTaskNumber(codes, prefix) {
  const re = new RegExp(`^TSK-${prefix}-(\\d+)$`);
  let max = 0;
  for (const c of codes) {
    const m = re.exec(c || '');
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  return max;
}

// Generate the next per-org task code, e.g. TSK-AB-001.
async function generateTaskCode(orgId) {
  const { data: org } = await supabaseAdmin
    .from('organizations').select('name').eq('id', orgId).single();
  const prefix = orgCodePrefix(org?.name);
  const { data: rows } = await supabaseAdmin
    .from('program').select('task_code').eq('org_id', orgId).not('task_code', 'is', null);
  const next = maxTaskNumber((rows || []).map(r => r.task_code), prefix) + 1;
  return `TSK-${prefix}-${String(next).padStart(3, '0')}`;
}

// GET all program tasks for the org. CXOs read everything; the "escalated only"
// view is a client-side toggle (default on), so no server-side role filter here.
router.get('/', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('program')
      .select('*')
      .eq('org_id', req.orgId)
      .order('last_updated', { ascending: false });
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

    // Validate parent (two-level only): parent must exist in this org and be top-level.
    if (payload.parent_id) {
      const { data: parent } = await supabaseAdmin
        .from('program').select('id, parent_id')
        .eq('id', payload.parent_id).eq('org_id', req.orgId).maybeSingle();
      if (!parent) return res.status(400).json({ message: 'Parent task not found.' });
      if (parent.parent_id) return res.status(400).json({ message: 'Cannot nest under a child task — only one level of sub-tasks is allowed.' });
    } else {
      payload.parent_id = null;
    }

    // Generate a human-readable per-org task code unless one was supplied.
    if (!payload.task_code) {
      payload.task_code = await generateTaskCode(req.orgId);
    }

    const { data, error } = await supabaseAdmin.from('program').insert(payload).select().single();
    if (error) throw error;

    await logProgramActivity(req, data.id, {
      action: 'program_created',
      event_data: {
        program_name: data.program_name,
        status: data.status
      }
    });
    await logAllActivityServer(req, {
      action: data.parent_id ? 'Created Child Task' : 'Created Task',
      entity_id: data.id,
      entity_name: data.task_code || data.program_name,
      event_data: { task_code: data.task_code, program_name: data.program_name, status: data.status, parent_id: data.parent_id },
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
    // Fetch existing programs for this org to match by name if ID is missing
    const { data: existingPrograms, error: fetchError } = await supabaseAdmin
      .from('program')
      .select('id, program_name, task_code')
      .eq('org_id', req.orgId);

    if (fetchError) {
      console.error('[bulk-program] Error fetching existing programs:', fetchError);
      // Continue anyway, but matching will fail
    }

    const nameToIdMap = new Map();
    if (existingPrograms) {
      existingPrograms.forEach(p => {
        if (p.program_name) {
          nameToIdMap.set(p.program_name.trim().toLowerCase(), p.id);
        }
      });
    }

    // Prepare per-org task-code generation for brand-new rows.
    const { data: orgRow } = await supabaseAdmin
      .from('organizations').select('name').eq('id', req.orgId).single();
    const codePrefix = orgCodePrefix(orgRow?.name);
    let codeCounter = maxTaskNumber((existingPrograms || []).map(p => p.task_code), codePrefix);

    const payloads = tasks.map(t => {
      const p = { ...t, user_id: req.userId, org_id: req.orgId };

      // If no ID is provided, try to match by name
      if (!p.id && p.program_name) {
        const existingId = nameToIdMap.get(p.program_name.trim().toLowerCase());
        if (existingId) {
          p.id = existingId;
        }
      }

      // Brand-new row (no matched id) without a code → assign the next sequential one.
      if (!p.id && !p.task_code) {
        codeCounter += 1;
        p.task_code = `TSK-${codePrefix}-${String(codeCounter).padStart(3, '0')}`;
      }

      p.status = deriveStatus(p.progress_percent, p.status);
      return p;
    });

    console.log(`[bulk-program] Attempting to upsert ${payloads.length} tasks for org: ${req.orgId}`);
    const { data, error } = await supabaseAdmin.from('program').upsert(payloads, { 
      onConflict: 'id',
      ignoreDuplicates: false 
    }).select();
    if (error) {
      console.error('[bulk-program] Supabase insert error:', error);
      throw error;
    }
    
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
    res.status(500).json({ 
      message: err.message,
      details: err.details || err.hint || null,
      code: err.code || null
    });
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

      // One consolidated entry in the global Activity Logs tab per update.
      const changes = {};
      if (oldRecord.status !== data.status) changes.status = { from: oldRecord.status, to: data.status };
      if (oldRecord.assignee !== data.assignee) changes.assignee = { from: oldRecord.assignee, to: data.assignee };
      if (oldRecord.progress_percent !== data.progress_percent) changes.progress = { from: oldRecord.progress_percent, to: data.progress_percent };
      if (oldRecord.program_name !== data.program_name) changes.program_name = { from: oldRecord.program_name, to: data.program_name };
      if (oldRecord.description !== data.description) changes.description = true;
      if (oldRecord.due_date !== data.due_date) changes.due_date = { from: oldRecord.due_date, to: data.due_date };
      if (Object.keys(changes).length > 0) {
        const escalated = changes.status && changes.status.to === 'Escalated';
        await logAllActivityServer(req, {
          action: escalated ? 'Escalated Task' : 'Updated Task',
          entity_id: data.id,
          entity_name: data.task_code || data.program_name,
          event_data: { task_code: data.task_code, program_name: data.program_name, changes },
        });
      }
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT attach/detach an existing task as a child (two-level only, re-parent on attach).
router.put('/:id/parent', requireAuth, async (req, res) => {
  try {
    const childId = req.params.id;
    const { parent_id } = req.body; // pass null/empty to detach
    if (parent_id && parent_id === childId) {
      return res.status(400).json({ message: 'A task cannot be its own parent.' });
    }

    const { data: child } = await supabaseAdmin
      .from('program').select('id, task_code, program_name, parent_id')
      .eq('id', childId).eq('org_id', req.orgId).maybeSingle();
    if (!child) return res.status(404).json({ message: 'Task not found.' });

    if (parent_id) {
      const { data: parent } = await supabaseAdmin
        .from('program').select('id, parent_id')
        .eq('id', parent_id).eq('org_id', req.orgId).maybeSingle();
      if (!parent) return res.status(400).json({ message: 'Parent task not found.' });
      if (parent.parent_id) return res.status(400).json({ message: 'Cannot nest under a child task — only one level of sub-tasks is allowed.' });
      // The child can't already have its own sub-tasks (would create a third level).
      const { count } = await supabaseAdmin
        .from('program').select('id', { count: 'exact', head: true })
        .eq('parent_id', childId).eq('org_id', req.orgId);
      if (count && count > 0) return res.status(400).json({ message: 'This task has sub-tasks of its own, so it cannot become a child task.' });
    }

    const { data, error } = await supabaseAdmin
      .from('program').update({ parent_id: parent_id || null })
      .eq('id', childId).eq('org_id', req.orgId).select().single();
    if (error) throw error;

    await logProgramActivity(req, childId, {
      action: parent_id ? 'child_attached' : 'child_detached',
      event_data: { parent_id: parent_id || null },
    });
    await logAllActivityServer(req, {
      action: parent_id ? 'Attached Child Task' : 'Detached Child Task',
      entity_id: childId,
      entity_name: child.task_code || child.program_name,
      event_data: { task_code: child.task_code, parent_id: parent_id || null },
    });

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE bulk tasks
router.delete('/bulk', requireAuth, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Invalid IDs provided' });
    }

    console.log(`=== BULK PROGRAM TASK DELETE ===`);
    console.log(`Deleting ${ids.length} tasks`);

    // Fetch records for activity logging before deleting
    const { data: records, error: fetchError } = await supabaseAdmin
      .from('program')
      .select('id, program_name, task_code')
      .in('id', ids)
      .eq('org_id', req.orgId);

    if (fetchError) {
      console.error('Error fetching tasks for activity logging:', fetchError);
    }

    // Set parent_id of any task that points to a task in the list to null,
    // to avoid foreign key violations.
    await supabaseAdmin
      .from('program')
      .update({ parent_id: null })
      .in('parent_id', ids)
      .eq('org_id', req.orgId);

    const { error } = await supabaseAdmin
      .from('program')
      .delete()
      .in('id', ids)
      .eq('org_id', req.orgId);

    if (error) throw error;

    if (records && records.length > 0) {
      for (const record of records) {
        await logProgramActivity(req, record.id, {
          action: 'program_deleted',
          event_data: {
            program_name: record.program_name
          }
        });
        await logAllActivityServer(req, {
          action: 'Deleted Task',
          entity_id: record.id,
          entity_name: record.task_code || record.program_name,
          event_data: { task_code: record.task_code, program_name: record.program_name },
        });
      }
    }

    res.status(200).json({ deleted: ids.length, total: ids.length, errors: 0 });
  } catch (err) {
    console.error('Bulk delete tasks error:', err);
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
        return res.status(409).json({ message: 'Task is still referenced by another table.' });
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
      await logAllActivityServer(req, {
        action: 'Deleted Task',
        entity_id: record.id,
        entity_name: record.task_code || record.program_name,
        event_data: { task_code: record.task_code, program_name: record.program_name },
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
    let oldCommentValue = '';
    let newCommentValue = '';

    if (action) {
      let parsed = {};
      try {
        parsed = typeof log.activity === 'string' && log.activity.startsWith('{') ? JSON.parse(log.activity) : {};
      } catch (e) {
        parsed = { event_data: { comment: log.activity } };
      }
      
      oldCommentValue = parsed.event_data?.current_comment || parsed.event_data?.comment || (typeof log.activity === 'string' ? log.activity : '');
      newCommentValue = event_data?.comment || activity || '';

      updatedActivity = JSON.stringify({
        ...parsed,
        action,
        event_data: {
          ...(parsed.event_data || {}),
          current_comment: newCommentValue, // For entity display in recent comments list
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

    // Log the edit action for history tracking with old and new values
    await logProgramActivity(req, req.params.id, {
      action: 'comment_edited',
      event_data: {
        old_comment: oldCommentValue,
        new_comment: newCommentValue
      }
    });

    // Sync: Update in program table array
    if (oldCommentValue && newCommentValue) {
      const { data: p } = await supabaseAdmin.from('program').select('comments').eq('id', req.params.id).single();
      if (p && Array.isArray(p.comments)) {
        const updatedArr = p.comments.map(c => {
          if (c.text === oldCommentValue && c.user_id === req.userId) {
            return { ...c, text: newCommentValue, edited: true, edited_at: new Date().toISOString() };
          }
          return c;
        });
        await supabaseAdmin.from('program').update({ comments: updatedArr }).eq('id', req.params.id);
      }
    }

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