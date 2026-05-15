import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ── Utility: log to all_activity_log (fire-and-forget) ─────────────────────
function logActivity(payload) {
  supabaseAdmin.from('all_activity_log').insert(payload).then(() => {});
}

async function notifyAdmins(orgId, excludeUserId, notificationData) {
  try {
    const { data: admins, error } = await supabaseAdmin
      .from('org_onboarding')
      .select('user_id')
      .eq('org_id', orgId)
      .in('role', ['admin', 'tenant_admin'])
      .not('user_id', 'is', null);

    if (error) {
      console.error('[notifyAdmins] Error fetching admins:', error);
      return;
    }

    console.log(`[notifyAdmins] Found ${admins?.length || 0} admins in org ${orgId}`);

    if (admins && admins.length > 0) {
      const notifications = admins
        .filter(a => a.user_id !== excludeUserId)
        .map(a => ({
          ...notificationData,
          recipient_id: a.user_id,
          org_id: orgId,
        }));
      
      if (notifications.length > 0) {
        console.log(`[notifyAdmins] Inserting ${notifications.length} notifications`);
        console.log(`[notifyAdmins] Payload:`, JSON.stringify(notifications));
        const { error: insError } = await supabaseAdmin.from('policy_notifications').insert(notifications);
        if (insError) console.error('[notifyAdmins] Error inserting notifications:', insError);
      } else {
        console.log('[notifyAdmins] No recipients after filtering excluded user');
      }
    }
  } catch (err) {
    console.error('[notifyAdmins] Catch-all error:', err);
  }
}

// ── Utility: extract metadata from markdown ────────────────────────────────
function extractMetadata(markdown) {
  if (!markdown) return {};
  const lines = markdown.split('\n');
  let name = null, policy_ref = null, version = null, owner_name = null,
      document_type = null, refresh_date = null;

  for (const line of lines) {
    if (!name && line.startsWith('# ')) {
      name = line.replace(/^#\s+/, '').trim();
    }
    const docIdMatch = line.match(/\*\*Document\s*ID:\*\*\s*(.+)/i);
    if (docIdMatch) policy_ref = docIdMatch[1].trim();

    const versionMatch = line.match(/\*\*Version:\*\*\s*(.+)/i);
    if (versionMatch) version = versionMatch[1].trim();

    const docTypeMatch = line.match(/\*\*Document\s*Type:\*\*\s*(.+)/i);
    if (docTypeMatch) document_type = docTypeMatch[1].trim();

    const createdMatch = line.match(/\|\s*\*\*Created\*\*\s*\|\s*([^|]+)\s*\|/i);
    if (createdMatch) owner_name = createdMatch[1].trim();

    const reviewDateMatch = line.match(/next[_\s-]*review[_\s-]*date[:\s]+(\d{4}-\d{2}-\d{2})/i);
    if (reviewDateMatch) refresh_date = reviewDateMatch[1];
  }

  return { name, policy_ref, version, owner_name, document_type, refresh_date };
}

// ── Utility: generate sequential human-readable policy ID ──────────────────
async function generatePolicyId(orgId) {
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single();

  const orgPrefix = (org?.name || 'ORG')
    .slice(0, 4)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  // Search GLOBALLY (not per-org) because policy_id is a global primary key.
  // Two orgs with the same 4-char prefix (e.g. Consultant1, Consultant2 → "CONS")
  // would collide if we only checked within the current org.
  const prefix = `IT-POL-${orgPrefix}-`;
  const { data: existing } = await supabaseAdmin
    .from('policy_documents')
    .select('policy_id')
    .like('policy_id', `${prefix}%`)
    .order('policy_id', { ascending: false })
    .limit(1);

  let nextSeq = 1;
  if (existing && existing.length > 0) {
    const lastId = existing[0].policy_id;
    const lastSeqStr = lastId.replace(prefix, '');
    const lastSeq = parseInt(lastSeqStr, 10);
    if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
  }

  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}

// ── Utility: check and expire policies for an org ─────────────────────────
async function checkAndExpirePolicies(orgId) {
  const now = new Date().toISOString().split('T')[0];
  const { data: expired } = await supabaseAdmin
    .select('policy_id, name, user_id, policy_status')
    .eq('org_id', orgId)
    .in('policy_status', ['approved', 'reviewed'])
    .lt('refresh_date', now);

  if (!expired || expired.length === 0) return;

  for (const policy of expired) {
    const { count } = await supabaseAdmin
      .from('policy_documents')
      .update({ policy_status: 'to_review', updated_at: new Date().toISOString() })
      .eq('policy_id', policy.policy_id)
      .in('policy_status', ['approved', 'reviewed']); // idempotency guard

    // Only log & notify if the row was actually transitioned
    if (count === 0) continue;

    logActivity({
      action: 'policy_expired',
      module: 'Policy',
      entity_id: policy.policy_id,
      entity_name: policy.name,
      user_id: null,
      org_id: orgId,
      severity: 'warning',
      event_data: {
        message: `Policy "${policy.name}" has expired and moved to In Review`,
        from_status: policy.policy_status,
        to_status: 'to_review',
        user_email: 'System',
      },
    });

    if (policy.user_id) {
      supabaseAdmin.from('policy_notifications').insert({
        recipient_id: policy.user_id,
        policy_id: policy.policy_id,
        policy_name: policy.name,
        type: 'policy_expired',
        message: `Policy "${policy.name}" has expired and requires review`,
        org_id: orgId,
      }).then(() => {});
    }
  }
}

// ── GET /  ─ list all policies ─────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    // Fire-and-forget expiry check on every list fetch
    checkAndExpirePolicies(req.orgId).catch(() => {});

    const { data, error } = await supabaseAdmin
      .from('policy_documents')
      .select('policy_id,name,policy_ref,policy_status,refresh_date,version,document_type,owner_name,is_master,org_id,user_id,created_at,updated_at,markdown')
      .eq('org_id', req.orgId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /notifications  ─ MUST be before /:id ─────────────────────────────
router.get('/notifications', requireAuth, async (req, res) => {
  try {
    console.log(`[DEBUG] GET /notifications for user: ${req.userId}, org: ${req.orgId}`);
    const { data, error } = await supabaseAdmin
      .from('policy_notifications')
      .select('*')
      .eq('recipient_id', req.userId)
      .eq('org_id', req.orgId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('[DEBUG] Error fetching notifications:', error);
      throw error;
    }
    
    console.log(`[DEBUG] Found ${data?.length || 0} notifications for user ${req.userId}`);
    if (data && data.length > 0) {
      console.log(`[DEBUG] Notifications content:`, JSON.stringify(data.slice(0, 5)));
    }
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Debug endpoint to see ALL notifications for the org
router.get('/notifications-all-debug', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('policy_notifications')
      .select('*')
      .eq('org_id', req.orgId)
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /notifications/:notifId/read ──────────────────────────────────────
router.put('/notifications/:notifId/read', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('policy_notifications')
      .update({ read: true })
      .eq('id', req.params.notifId)
      .eq('recipient_id', req.userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /master  ─ return the org's master policy (if any) ────────────────
// Used by the Mapper Agent run modal to detect "no master set" state.
// MUST be declared before /:id so Express doesn't route "master" as an id.
router.get('/master', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('policy_documents')
      .select('policy_id,name,policy_ref,policy_status,owner_name,document_type,is_master,updated_at')
      .eq('org_id', req.orgId)
      .eq('is_master', true)
      .maybeSingle();
    if (error) throw error;
    res.json(data || null);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PATCH /:id/master  ─ mark a policy as the org's master ────────────────
// Atomically clears any existing master before setting the new one so the
// partial-unique-index constraint (one master per org) never gets violated.
router.patch('/:id/master', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) {
      return res.status(400).json({ message: 'No organisation found for user.' });
    }
    const setMaster = req.body && typeof req.body.is_master === 'boolean'
      ? req.body.is_master
      : true;

    if (setMaster) {
      const { error: clearErr } = await supabaseAdmin
        .from('policy_documents')
        .update({ is_master: false })
        .eq('org_id', req.orgId)
        .eq('is_master', true)
        .neq('policy_id', req.params.id);
      if (clearErr) throw clearErr;
    }

    const { data, error } = await supabaseAdmin
      .from('policy_documents')
      .update({ is_master: setMaster })
      .eq('policy_id', req.params.id)
      .eq('org_id', req.orgId)
      .select('policy_id,name,is_master')
      .single();
    if (error) throw error;

    logActivity({
      action: setMaster ? 'policy_master_set' : 'policy_master_cleared',
      module: 'Policy',
      entity_id: req.params.id,
      entity_name: data?.name || null,
      user_id: req.userId,
      org_id: req.orgId,
      severity: 'info',
      event_data: { actor_name: req.user?.email || req.userId },
    });

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /:id/history  ─ reads from all_activity_log ───────────────────────
router.get('/:id/history', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('all_activity_log')
      .select('*')
      .eq('module', 'Policy')
      .eq('entity_id', req.params.id)
      .eq('org_id', req.orgId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /:id/approval  ─ pending approval record ──────────────────────────
router.get('/:id/approval', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('policy_approvals')
      .select('*')
      .eq('policy_id', req.params.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    res.json(data || null);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /:id ──────────────────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('policy_documents')
      .select('*')
      .eq('policy_id', req.params.id)
      .eq('org_id', req.orgId)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /  ─ create policy ───────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) {
      return res.status(400).json({ message: 'No organisation found. Please complete onboarding first.' });
    }
    const { markdown, policy_status = 'draft' } = req.body;
    const meta = extractMetadata(markdown);
    const policyId = await generatePolicyId(req.orgId);
    const actorName = req.user?.email || req.userId;
    const today = new Date().toISOString().split('T')[0];

    const payload = {
      policy_id: policyId,
      name: meta.name || 'Untitled Policy',
      markdown: markdown || '',
      policy_ref: meta.policy_ref || null,
      policy_status,
      version: meta.version || 'V1.0',
      document_type: meta.document_type || null,
      owner_name: meta.owner_name || null,
      refresh_date: meta.refresh_date || null,
      user_id: req.userId,
      org_id: req.orgId,
      document_content: 0,
      grc_contact: '',
      policy_reviewer_contact: '',
      published_date: today,
      next_review_date: meta.refresh_date || today,
      status: 0,
    };

    const { data, error } = await supabaseAdmin
      .from('policy_documents')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;

    logActivity({
      action: 'policy_created',
      module: 'Policy',
      entity_id: policyId,
      entity_name: meta.name || 'Untitled Policy',
      user_id: req.userId,
      org_id: req.orgId,
      severity: 'info',
      event_data: {
        actor_name: actorName,
        user_email: req.user?.email || actorName,
        from_status: null,
        to_status: policy_status,
      },
    });

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /:id  ─ update policy ─────────────────────────────────────────────
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { markdown, policy_status } = req.body;
    const meta = markdown !== undefined ? extractMetadata(markdown) : {};
    const actorName = req.user?.email || req.userId;

    const { data: current, error: currentError } = await supabaseAdmin
      .from('policy_documents')
      .select('policy_status, name, next_review_date')
      .eq('policy_id', req.params.id)
      .eq('org_id', req.orgId)
      .single();

    if (currentError) {
      return res.status(404).json({ message: 'Policy not found' });
    }

    const updatePayload = {
      ...(markdown !== undefined ? {
        markdown,
        name: meta.name || current?.name || 'Untitled Policy',
        policy_ref: meta.policy_ref || null,
        version: meta.version || 'V1.0',
        document_type: meta.document_type || null,
        owner_name: meta.owner_name || null,
        refresh_date: meta.refresh_date || current?.next_review_date || null,
        next_review_date: meta.refresh_date || current?.next_review_date || new Date().toISOString().split('T')[0],
      } : {}),
      ...(policy_status ? { policy_status } : {}),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('policy_documents')
      .update(updatePayload)
      .eq('policy_id', req.params.id)
      .eq('org_id', req.orgId)
      .select()
      .single();
    
    if (error) {
      console.error('[PUT /api/policies/:id] Update error:', error);
      throw error;
    }

    const action = (policy_status && current?.policy_status !== policy_status)
      ? 'policy_status_changed'
      : 'policy_content_updated';

    logActivity({
      action,
      module: 'Policy',
      entity_id: req.params.id,
      entity_name: data.name,
      user_id: req.userId,
      org_id: req.orgId,
      severity: 'info',
      event_data: {
        actor_name: actorName,
        user_email: req.user?.email || actorName,
        from_status: current?.policy_status,
        to_status: policy_status || current?.policy_status,
      },
    });

    res.json(data);
  } catch (err) {
    console.error('[PUT /api/policies/:id] Catch-all error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /:id ───────────────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { data: policy } = await supabaseAdmin
      .from('policy_documents')
      .select('name')
      .eq('policy_id', req.params.id)
      .single();

    const { error } = await supabaseAdmin
      .from('policy_documents')
      .delete()
      .eq('policy_id', req.params.id)
      .eq('org_id', req.orgId);
    if (error) throw error;

    logActivity({
      action: 'policy_deleted',
      module: 'Policy',
      entity_id: req.params.id,
      entity_name: policy?.name || req.params.id,
      user_id: req.userId,
      org_id: req.orgId,
      severity: 'warning',
      event_data: { 
        actor_name: req.user?.email || req.userId,
        user_email: req.user?.email || req.userId,
      },
    });

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /:id/submit-approval ─────────────────────────────────────────────
router.post('/:id/submit-approval', requireAuth, async (req, res) => {
  try {
    const { approver_id, approver_name, approver_email } = req.body;
    const policyId = req.params.id;
    const actorName = req.user?.email || req.userId;

    const { data: policy } = await supabaseAdmin
      .from('policy_documents')
      .select('name, policy_status')
      .eq('policy_id', policyId)
      .single();

    if (!policy) return res.status(404).json({ message: 'Policy not found' });
    const prevStatus = policy.policy_status;

    await supabaseAdmin
      .from('policy_approvals')
      .update({ status: 'rejected', comment: 'Superseded by new submission' })
      .eq('policy_id', policyId)
      .eq('status', 'pending');

    await supabaseAdmin.from('policy_approvals').insert({
      policy_id: policyId,
      requested_by: req.userId,
      approver_id: approver_id || null,
      approver_name,
      approver_email,
      status: 'pending',
      org_id: req.orgId,
    });

    await supabaseAdmin
      .from('policy_documents')
      .update({ policy_status: 'in_approval', updated_at: new Date().toISOString() })
      .eq('policy_id', policyId);

    if (approver_id) {
      await supabaseAdmin.from('policy_notifications').insert({
        recipient_id: approver_id,
        policy_id: policyId,
        policy_name: policy.name,
        type: 'approval_requested',
        message: `${actorName} has requested your approval for policy "${policy.name}"`,
        org_id: req.orgId,
      });
    }

    logActivity({
      action: 'policy_submitted_for_approval',
      module: 'Policy',
      entity_id: policyId,
      entity_name: policy.name,
      user_id: req.userId,
      org_id: req.orgId,
      severity: 'info',
      event_data: {
        actor_name: actorName,
        user_email: req.user?.email || actorName,
        from_status: prevStatus,
        to_status: 'in_approval',
        comment: `Sent to ${approver_name} (${approver_email}) for approval`,
        approver_name,
        approver_email,
      },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /:id/submit-review ───────────────────────────────────────────────
router.post('/:id/submit-review', requireAuth, async (req, res) => {
  try {
    const { reviewer_id, reviewer_name, reviewer_email } = req.body;
    const policyId = req.params.id;
    const actorName = req.user?.email || req.userId;

    const { data: policy } = await supabaseAdmin
      .from('policy_documents')
      .select('name, policy_status')
      .eq('policy_id', policyId)
      .single();

    if (!policy) return res.status(404).json({ message: 'Policy not found' });
    const prevStatus = policy.policy_status;

    await supabaseAdmin
      .from('policy_approvals')
      .update({ status: 'rejected', comment: 'Superseded by new review submission' })
      .eq('policy_id', policyId)
      .eq('status', 'pending');

    await supabaseAdmin.from('policy_approvals').insert({
      policy_id: policyId,
      requested_by: req.userId,
      approver_id: reviewer_id || null,
      approver_name: reviewer_name,
      approver_email: reviewer_email,
      status: 'pending',
      org_id: req.orgId,
    });

    await supabaseAdmin
      .from('policy_documents')
      .update({ policy_status: 'to_review', updated_at: new Date().toISOString() })
      .eq('policy_id', policyId);

    if (reviewer_id) {
      console.log(`[DEBUG] Submitting notification for reviewer: ${reviewer_id}`);
      const { data: notifData, error: notifError } = await supabaseAdmin.from('policy_notifications').insert({
        recipient_id: reviewer_id,
        policy_id: policyId,
        policy_name: policy.name,
        type: 'approval_requested', // Use allowed type for DB constraint
        message: `${actorName} has requested you to review policy "${policy.name}"`,
        org_id: req.orgId,
      }).select();
      
      if (notifError) {
        console.error('[DEBUG] Error inserting review notification:', notifError);
      } else {
        console.log('[DEBUG] Review notification inserted successfully:', notifData);
      }
    }

    logActivity({
      action: 'policy_submitted_for_review',
      module: 'Policy',
      entity_id: policyId,
      entity_name: policy.name,
      user_id: req.userId,
      org_id: req.orgId,
      severity: 'info',
      event_data: {
        actor_name: actorName,
        user_email: req.user?.email || actorName,
        from_status: prevStatus,
        to_status: 'to_review',
        comment: `Sent to ${reviewer_name} (${reviewer_email}) for review`,
        approver_name: reviewer_name,
        approver_email: reviewer_email,
      },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /:id/approve ─────────────────────────────────────────────────────
router.post('/:id/approve', requireAuth, async (req, res) => {
  try {
    const policyId = req.params.id;
    const { comment } = req.body;
    const actorName = req.user?.email || req.userId;

    const { data: policy } = await supabaseAdmin
      .from('policy_documents')
      .select('name, policy_status, user_id')
      .eq('policy_id', policyId)
      .single();

    if (!policy) return res.status(404).json({ message: 'Policy not found' });
    const prevStatus = policy.policy_status;

    // Calculate refresh_date from org settings
    const { data: settings } = await supabaseAdmin
      .from('org_settings')
      .select('policy_refresh_months')
      .eq('org_id', req.orgId)
      .maybeSingle();
    const months = settings?.policy_refresh_months || 3;
    const refreshDate = new Date();
    refreshDate.setMonth(refreshDate.getMonth() + months);
    const refreshDateStr = refreshDate.toISOString().split('T')[0];

    await supabaseAdmin
      .from('policy_approvals')
      .update({ status: 'approved', comment: comment || null, updated_at: new Date().toISOString() })
      .eq('policy_id', policyId)
      .eq('status', 'pending');

    const { data: updateData, error: updateError } = await supabaseAdmin
      .from('policy_documents')
      .update({ policy_status: 'approved', refresh_date: refreshDateStr, updated_at: new Date().toISOString() })
      .eq('policy_id', policyId);
    
    if (updateError) {
      console.error('[POST /api/policies/:id/approve] Update error:', updateError);
      throw updateError;
    }

    if (policy.user_id && policy.user_id !== req.userId) {
      await supabaseAdmin.from('policy_notifications').insert({
        recipient_id: policy.user_id,
        policy_id: policyId,
        policy_name: policy.name,
        type: 'approved',
        message: `${actorName} approved policy "${policy.name}"`,
        org_id: req.orgId,
      });
    }

    // Notify other admins
    notifyAdmins(req.orgId, req.userId, {
      policy_id: policyId,
      policy_name: policy.name,
      type: 'approved',
      message: `Policy "${policy.name}" has been fully approved by ${actorName}`,
    }).catch(() => {});

    logActivity({
      action: 'policy_approved',
      module: 'Policy',
      entity_id: policyId,
      entity_name: policy.name,
      user_id: req.userId,
      org_id: req.orgId,
      severity: 'info',
      event_data: {
        actor_name: actorName,
        user_email: req.user?.email || actorName,
        from_status: prevStatus,
        to_status: 'approved',
        comment: comment || null,
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[POST /api/policies/:id/approve] Catch-all error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ── POST /:id/review ──────────────────────────────────────────────────────
router.post('/:id/review', requireAuth, async (req, res) => {
  try {
    const policyId = req.params.id;
    const { comment } = req.body;
    const actorName = req.user?.email || req.userId;

    const { data: policy } = await supabaseAdmin
      .from('policy_documents')
      .select('name, policy_status, user_id')
      .eq('policy_id', policyId)
      .single();

    if (!policy) return res.status(404).json({ message: 'Policy not found' });
    const prevStatus = policy.policy_status;

    // Calculate refresh_date from org settings
    const { data: settings } = await supabaseAdmin
      .from('org_settings')
      .select('policy_refresh_months')
      .eq('org_id', req.orgId)
      .maybeSingle();
    const months = settings?.policy_refresh_months || 3;
    const refreshDate = new Date();
    refreshDate.setMonth(refreshDate.getMonth() + months);
    const refreshDateStr = refreshDate.toISOString().split('T')[0];

    // Find who requested this review before we update the record
    const { data: pendingApproval } = await supabaseAdmin
      .from('policy_approvals')
      .select('requested_by')
      .eq('policy_id', policyId)
      .eq('status', 'pending')
      .maybeSingle();

    console.log('[DEBUG] Found pending review record:', pendingApproval);

    await supabaseAdmin
      .from('policy_approvals')
      .update({ status: 'approved', comment: comment || null, updated_at: new Date().toISOString() })
      .eq('policy_id', policyId)
      .eq('status', 'pending');

    const { data: updateData, error: updateError } = await supabaseAdmin
      .from('policy_documents')
      .update({ policy_status: 'reviewed', refresh_date: refreshDateStr, updated_at: new Date().toISOString() })
      .eq('policy_id', policyId);
    
    if (updateError) {
      console.error('[POST /api/policies/:id/review] Update error:', updateError);
      throw updateError;
    }

    if (policy.user_id && policy.user_id !== req.userId) {
      console.log(`[DEBUG] Notifying owner: ${policy.user_id}`);
      await supabaseAdmin.from('policy_notifications').insert({
        recipient_id: policy.user_id,
        policy_id: policyId,
        policy_name: policy.name,
        type: 'approved', // Use allowed type for DB constraint
        message: `${actorName} reviewed policy "${policy.name}"`,
        org_id: req.orgId,
      });
    }

    // Notify the person who requested the review
    if (pendingApproval?.requested_by && pendingApproval.requested_by !== req.userId && pendingApproval.requested_by !== policy.user_id) {
      console.log(`[DEBUG] Notifying requester: ${pendingApproval.requested_by}`);
      await supabaseAdmin.from('policy_notifications').insert({
        recipient_id: pendingApproval.requested_by,
        policy_id: policyId,
        policy_name: policy.name,
        type: 'approved', // Use allowed type for DB constraint
        message: `${actorName} has completed the review you requested for policy "${policy.name}"`,
        org_id: req.orgId,
      });
    }

    // Notify admins that a policy is ready for approval
    notifyAdmins(req.orgId, req.userId, {
      policy_id: policyId,
      policy_name: policy.name,
      type: 'approved', // Use allowed type for DB constraint
      message: `Policy "${policy.name}" has been reviewed by ${actorName} and is ready for approval`,
    }).catch(() => {});

    logActivity({
      action: 'policy_reviewed',
      module: 'Policy',
      entity_id: policyId,
      entity_name: policy.name,
      user_id: req.userId,
      org_id: req.orgId,
      severity: 'info',
      event_data: {
        actor_name: actorName,
        user_email: req.user?.email || actorName,
        from_status: prevStatus,
        to_status: 'reviewed',
        comment: comment || null,
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[POST /api/policies/:id/review] Catch-all error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ── POST /:id/reject ──────────────────────────────────────────────────────
router.post('/:id/reject', requireAuth, async (req, res) => {
  try {
    const policyId = req.params.id;
    const { comment } = req.body;
    const actorName = req.user?.email || req.userId;

    const { data: policy } = await supabaseAdmin
      .from('policy_documents')
      .select('name, policy_status, user_id')
      .eq('policy_id', policyId)
      .single();

    if (!policy) return res.status(404).json({ message: 'Policy not found' });
    const prevStatus = policy.policy_status;

    await supabaseAdmin
      .from('policy_approvals')
      .update({ status: 'rejected', comment: comment || null, updated_at: new Date().toISOString() })
      .eq('policy_id', policyId)
      .eq('status', 'pending');

    await supabaseAdmin
      .from('policy_documents')
      .update({ policy_status: 'draft', updated_at: new Date().toISOString() })
      .eq('policy_id', policyId);

    if (policy.user_id && policy.user_id !== req.userId) {
      await supabaseAdmin.from('policy_notifications').insert({
        recipient_id: policy.user_id,
        policy_id: policyId,
        policy_name: policy.name,
        type: 'rejected',
        message: `${actorName} rejected policy "${policy.name}". ${comment ? `Reason: ${comment}` : ''}`,
        org_id: req.orgId,
      });
    }

    logActivity({
      action: 'policy_rejected',
      module: 'Policy',
      entity_id: policyId,
      entity_name: policy.name,
      user_id: req.userId,
      org_id: req.orgId,
      severity: 'warning',
      event_data: {
        actor_name: actorName,
        from_status: prevStatus,
        to_status: 'draft',
        comment: comment || null,
      },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export { checkAndExpirePolicies };
export const policiesRouter = router;
