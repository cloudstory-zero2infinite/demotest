import { Router } from 'express';
import multer from 'multer';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const EVIDENCE_BUCKET = 'control-evidence';

// ── Utility: log to all_activity_log (fire-and-forget) ─────────────────────
function logActivity(payload) {
  supabaseAdmin.from('all_activity_log').insert(payload).then(() => {});
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('control_registry')
      .select('*')
      .eq('org_id', req.orgId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const payload = { ...req.body, user_id: req.userId, org_id: req.orgId };
    const { data, error } = await supabaseAdmin
      .from('control_registry')
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
    const payloads = req.body.map(c => ({ ...c, user_id: req.userId, org_id: req.orgId }));
    const { data, error } = await supabaseAdmin
      .from('control_registry')
      .insert(payloads)
      .select();
    if (error) throw error;
    res.status(201).json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /notifications ───────────────────────────────────────────────────
// (must be before /:id routes to avoid being caught by the wildcard)
router.get('/notifications', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('control_notifications')
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

// ── PUT /notifications/:notifId/read ─────────────────────────────────────
router.put('/notifications/:notifId/read', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('control_notifications')
      .update({ read: true })
      .eq('id', req.params.notifId)
      .eq('recipient_id', req.userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /seed-nn — re-seed NN controls from templates for the current org ──
router.post('/seed-nn', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.rpc('seed_nn_controls_for_org', { org_uuid: req.orgId });
    if (error) throw error;
    res.json({ success: true, inserted: data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('control_registry')
      .update(req.body)
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

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('control_registry')
      .delete()
      .eq('id', req.params.id)
      .eq('org_id', req.orgId);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /:id/evidence-review ──────────────────────────────────────────────
router.get('/:id/evidence-review', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('control_evidence_reviews')
      .select('*')
      .eq('control_id', req.params.id)
      .eq('org_id', req.orgId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.json(null);

    // Enrich evidence_files with signed URLs so the reviewer can view them
    const enrichedFiles = await Promise.all(
      (data.evidence_files || []).map(async (f) => {
        const { data: signedData, error: signErr } = await supabaseAdmin.storage
          .from(EVIDENCE_BUCKET)
          .createSignedUrl(f.storage_path, 3600);
        return { ...f, signed_url: signErr ? null : signedData?.signedUrl };
      })
    );
    data.evidence_files = enrichedFiles;

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /:id/evidence-files ──────────────────────────────────────────────
router.get('/:id/evidence-files', requireAuth, async (req, res) => {
  try {
    const { data: control, error } = await supabaseAdmin
      .from('control_registry')
      .select('evidence_metadata')
      .eq('id', req.params.id)
      .eq('org_id', req.orgId)
      .single();
    if (error) throw error;

    const metadata = control?.evidence_metadata || [];
    const filesWithUrls = await Promise.all(
      metadata.map(async (f) => {
        const { data: signedData, error: signErr } = await supabaseAdmin.storage
          .from(EVIDENCE_BUCKET)
          .createSignedUrl(f.storage_path, 3600);
        return {
          ...f,
          signed_url: signErr ? null : signedData?.signedUrl,
        };
      })
    );
    res.json(filesWithUrls);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /:id/submit-enforcement ─────────────────────────────────────────
router.post('/:id/submit-enforcement', requireAuth, upload.array('files', 20), async (req, res) => {
  try {
    const controlId = req.params.id;
    const { requested_status, comment, reviewer_id, reviewer_name, reviewer_email, enforced_by_name, enforced_by_email } = req.body;
    const files = req.files || [];

    if (!files.length) {
      return res.status(400).json({ message: 'At least one evidence file is required.' });
    }
    if (!reviewer_name || !reviewer_email) {
      return res.status(400).json({ message: 'Reviewer name and email are required.' });
    }

    // Fetch the control
    const { data: control, error: ctlErr } = await supabaseAdmin
      .from('control_registry')
      .select('*')
      .eq('id', controlId)
      .eq('org_id', req.orgId)
      .single();
    if (ctlErr || !control) return res.status(404).json({ message: 'Control not found' });

    // Determine existing evidence count for display name sequencing
    const existingEvidence = control.evidence_metadata || [];
    let evidenceIndex = existingEvidence.length;

    // Upload files to storage: <org_id>/<control_id>/
    const uploadedFiles = [];
    for (const file of files) {
      evidenceIndex++;
      const storagePath = `${req.orgId}/${controlId}/${Date.now()}-${file.originalname}`;
      const { error: uploadErr } = await supabaseAdmin.storage
        .from(EVIDENCE_BUCKET)
        .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });
      if (uploadErr) throw new Error(`Failed to upload ${file.originalname}: ${uploadErr.message}`);

      uploadedFiles.push({
        name: `${control.ctl_id}-Evd-${evidenceIndex}`,
        storage_path: storagePath,
        original_name: file.originalname,
        size: file.size,
        type: file.mimetype,
      });
    }

    // Supersede any previous pending reviews
    await supabaseAdmin
      .from('control_evidence_reviews')
      .update({ status: 'rejected', review_comment: 'Superseded by new submission', updated_at: new Date().toISOString() })
      .eq('control_id', controlId)
      .eq('status', 'pending');

    // Insert new review record
    const { data: review, error: reviewErr } = await supabaseAdmin
      .from('control_evidence_reviews')
      .insert({
        control_id: controlId,
        requested_status,
        requested_by: req.userId,
        enforced_by_name: enforced_by_name || req.user?.email || req.userId,
        enforced_by_email: enforced_by_email || req.user?.email || '',
        reviewer_id: reviewer_id || null,
        reviewer_name,
        reviewer_email,
        status: 'pending',
        comment: comment || null,
        evidence_files: uploadedFiles,
        org_id: req.orgId,
      })
      .select()
      .single();
    if (reviewErr) throw reviewErr;

    // Update control status to In-Review
    await supabaseAdmin
      .from('control_registry')
      .update({ ctl_status: 'In-Review', updated_at: new Date().toISOString() })
      .eq('id', controlId);

    // Create notification for the reviewer
    if (reviewer_id) {
      await supabaseAdmin.from('control_notifications').insert({
        recipient_id: reviewer_id,
        control_id: controlId,
        control_name: control.ctl_name,
        type: 'review_requested',
        message: `${req.user?.email || req.userId} has requested your review to ${requested_status === 'Enforced' ? 'enforce' : 'un-enforce'} control "${control.ctl_id} - ${control.ctl_name}"`,
        org_id: req.orgId,
      });
    }

    logActivity({
      action: 'control_enforcement_submitted',
      module: 'Governance',
      entity_id: controlId,
      entity_name: control.ctl_name,
      user_id: req.userId,
      org_id: req.orgId,
      severity: 'info',
      event_data: {
        actor_name: req.user?.email || req.userId,
        requested_status,
        reviewer_name,
        reviewer_email,
        file_count: uploadedFiles.length,
      },
    });

    res.json({ success: true, review });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /:id/approve-enforcement ────────────────────────────────────────
router.post('/:id/approve-enforcement', requireAuth, async (req, res) => {
  try {
    const controlId = req.params.id;
    const { comment } = req.body;
    const actorName = req.user?.email || req.userId;

    // Get the pending review
    const { data: review, error: revErr } = await supabaseAdmin
      .from('control_evidence_reviews')
      .select('*')
      .eq('control_id', controlId)
      .eq('org_id', req.orgId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (revErr || !review) return res.status(404).json({ message: 'No pending review found' });

    // Get the control
    const { data: control, error: ctlErr } = await supabaseAdmin
      .from('control_registry')
      .select('*')
      .eq('id', controlId)
      .eq('org_id', req.orgId)
      .single();
    if (ctlErr || !control) return res.status(404).json({ message: 'Control not found' });

    // Approve the review
    await supabaseAdmin
      .from('control_evidence_reviews')
      .update({ status: 'approved', review_comment: comment || null, updated_at: new Date().toISOString() })
      .eq('id', review.id);

    // Build updated evidence metadata — append new files with display names
    const existingEvidence = control.evidence_metadata || [];
    const newEvidence = (review.evidence_files || []).map((f) => ({
      display_name: f.name,
      storage_path: f.storage_path,
      original_name: f.original_name,
      uploaded_at: new Date().toISOString(),
      review_id: review.id,
    }));
    const mergedEvidence = [...existingEvidence, ...newEvidence];

    // Update control to target status
    await supabaseAdmin
      .from('control_registry')
      .update({
        ctl_status: review.requested_status,
        evidence_metadata: mergedEvidence,
        enforced_by: review.enforced_by_name,
        reviewed_by: actorName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', controlId);

    // Notify the requester that their enforcement was approved
    if (review.requested_by && review.requested_by !== req.userId) {
      await supabaseAdmin.from('control_notifications').insert({
        recipient_id: review.requested_by,
        control_id: controlId,
        control_name: control.ctl_name,
        type: 'enforcement_approved',
        message: `${actorName} approved ${review.requested_status === 'Enforced' ? 'enforcement' : 'un-enforcement'} of control "${control.ctl_id} - ${control.ctl_name}"${comment ? `. Comment: ${comment}` : ''}`,
        org_id: req.orgId,
      });
    }

    logActivity({
      action: 'control_enforcement_approved',
      module: 'Governance',
      entity_id: controlId,
      entity_name: control.ctl_name,
      user_id: req.userId,
      org_id: req.orgId,
      severity: 'info',
      event_data: {
        actor_name: actorName,
        approved_status: review.requested_status,
        comment: comment || null,
        enforced_by: review.enforced_by_name,
      },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /:id/reject-enforcement ─────────────────────────────────────────
router.post('/:id/reject-enforcement', requireAuth, async (req, res) => {
  try {
    const controlId = req.params.id;
    const { comment } = req.body;
    const actorName = req.user?.email || req.userId;

    if (!comment) return res.status(400).json({ message: 'Comment is required for rejection.' });

    // Get the pending review
    const { data: review, error: revErr } = await supabaseAdmin
      .from('control_evidence_reviews')
      .select('*')
      .eq('control_id', controlId)
      .eq('org_id', req.orgId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (revErr || !review) return res.status(404).json({ message: 'No pending review found' });

    // Get the control
    const { data: control, error: ctlErr } = await supabaseAdmin
      .from('control_registry')
      .select('*')
      .eq('id', controlId)
      .eq('org_id', req.orgId)
      .single();
    if (ctlErr || !control) return res.status(404).json({ message: 'Control not found' });

    // Reject the review
    await supabaseAdmin
      .from('control_evidence_reviews')
      .update({ status: 'rejected', review_comment: comment, updated_at: new Date().toISOString() })
      .eq('id', review.id);

    // Revert control status
    const revertStatus = review.requested_status === 'Enforced' ? 'NotEnforced' : 'Enforced';
    await supabaseAdmin
      .from('control_registry')
      .update({ ctl_status: revertStatus, updated_at: new Date().toISOString() })
      .eq('id', controlId);

    // Notify the requester that their enforcement was rejected
    if (review.requested_by && review.requested_by !== req.userId) {
      await supabaseAdmin.from('control_notifications').insert({
        recipient_id: review.requested_by,
        control_id: controlId,
        control_name: control.ctl_name,
        type: 'enforcement_rejected',
        message: `${actorName} rejected ${review.requested_status === 'Enforced' ? 'enforcement' : 'un-enforcement'} of control "${control.ctl_id} - ${control.ctl_name}". Reason: ${comment}`,
        org_id: req.orgId,
      });
    }

    logActivity({
      action: 'control_enforcement_rejected',
      module: 'Governance',
      entity_id: controlId,
      entity_name: control.ctl_name,
      user_id: req.userId,
      org_id: req.orgId,
      severity: 'warning',
      event_data: {
        actor_name: actorName,
        rejected_status: review.requested_status,
        reverted_to: revertStatus,
        comment,
      },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export const controlRegistryRouter = router;
