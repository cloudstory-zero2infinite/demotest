import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ── Utility: log to all_activity_log (fire-and-forget) ─────────────────────
function logActivity(payload) {
  supabaseAdmin.from('all_activity_log').insert(payload).then(() => {});
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
  const { count } = await supabaseAdmin
    .from('policy_documents')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId);

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single();

  const orgPrefix = (org?.name || 'ORG')
    .slice(0, 4)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const seq = String((count || 0) + 1).padStart(3, '0');
  return `IT-POL-${orgPrefix}-${seq}`;
}

// ── GET /  ─ list all policies ─────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('policy_documents')
      .select('policy_id,name,policy_ref,policy_status,refresh_date,version,document_type,owner_name,org_id,user_id,created_at,updated_at,markdown')
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
    const { data, error } = await supabaseAdmin
      .from('policy_notifications')
      .select('*')
      .eq('recipient_id', req.userId)
      .eq('org_id', req.orgId)
      .order('created_at', { ascending: false });
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

    const { data: current } = await supabaseAdmin
      .from('policy_documents')
      .select('policy_status, name')
      .eq('policy_id', req.params.id)
      .single();

    const updatePayload = {
      ...(markdown !== undefined ? {
        markdown,
        name: meta.name || current?.name || 'Untitled Policy',
        policy_ref: meta.policy_ref || null,
        version: meta.version || 'V1.0',
        document_type: meta.document_type || null,
        owner_name: meta.owner_name || null,
        refresh_date: meta.refresh_date || null,
        next_review_date: meta.refresh_date || undefined,
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
    if (error) throw error;

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
        from_status: current?.policy_status,
        to_status: policy_status || current?.policy_status,
      },
    });

    res.json(data);
  } catch (err) {
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
      event_data: { actor_name: req.user?.email || req.userId },
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

    await supabaseAdmin
      .from('policy_approvals')
      .update({ status: 'approved', comment: comment || null, updated_at: new Date().toISOString() })
      .eq('policy_id', policyId)
      .eq('status', 'pending');

    await supabaseAdmin
      .from('policy_documents')
      .update({ policy_status: 'approved', updated_at: new Date().toISOString() })
      .eq('policy_id', policyId);

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
        from_status: prevStatus,
        to_status: 'approved',
        comment: comment || null,
      },
    });

    res.json({ success: true });
  } catch (err) {
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

export const policiesRouter = router;
