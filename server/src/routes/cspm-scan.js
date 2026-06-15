import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { requireDevice } from '../middleware/deviceAuth.js';

const router = Router();

// Fire-and-forget activity log (mirrors control-registry.js).
function logActivity(payload) {
  supabaseAdmin.from('all_activity_log').insert(payload).then(() => {}).catch((e) => {
    console.error('[cspm-scan] logActivity failed:', e?.message || e);
  });
}

// passed / (passed + failed), N/A excluded from the denominator. 0–100.
function passPct(passed, failed) {
  const applicable = (passed || 0) + (failed || 0);
  if (applicable === 0) return 0;
  return Math.round((passed / applicable) * 100);
}

// pass | partial | fail | na — the per-control verdict from its check tally.
function resultStatus(passed, failed, na) {
  const applicable = (passed || 0) + (failed || 0);
  if (applicable === 0) return 'na';
  if (failed === 0) return 'pass';
  if (passed === 0) return 'fail';
  return 'partial';
}

// ════════════════════════════════════════════════════════════
//  DEVICE-FACING (device token) — requireDevice
//  Driven by the zti CLI (`zti cspm scan` / `zti cspm report`).
// ════════════════════════════════════════════════════════════

// Create a posture-scan job. Called by the CLI when a scan starts.
router.post('/jobs', requireDevice, async (req, res) => {
  try {
    const { scope_type, scope_value, provider, is_mock } = req.body || {};
    if (scope_type && !['all', 'framework', 'provider', 'control'].includes(scope_type)) {
      return res.status(400).json({ message: 'scope_type must be all|framework|provider|control' });
    }
    const { data, error } = await supabaseAdmin
      .from('cspm_scan_jobs')
      .insert({
        org_id: req.orgId,
        device_id: req.deviceId,
        scope_type: scope_type || 'all',
        scope_value: scope_value || null,
        provider: provider || null,
        status: 'running',
        is_mock: is_mock !== false,
      })
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('[cspm-scan] create job error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Update job status/summary (running → completed|failed).
router.post('/jobs/:id/status', requireDevice, async (req, res) => {
  try {
    const { status, summary } = req.body || {};
    if (!['running', 'completed', 'failed'].includes(status)) {
      return res.status(400).json({ message: 'status must be running|completed|failed' });
    }
    const patch = { status, summary: summary ?? null };
    if (status === 'completed' || status === 'failed') patch.finished_at = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from('cspm_scan_jobs')
      .update(patch)
      .eq('id', req.params.id)
      .eq('org_id', req.orgId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[cspm-scan] job status error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Stage per-control results for admin review ("send to ZTI workspace"). Replaces
// any previously staged-but-unreviewed rows for this job (idempotent re-send).
router.post('/jobs/:id/results', requireDevice, async (req, res) => {
  try {
    const results = Array.isArray(req.body?.results) ? req.body.results : [];
    const { data: job, error: jErr } = await supabaseAdmin
      .from('cspm_scan_jobs')
      .select('id')
      .eq('id', req.params.id)
      .eq('org_id', req.orgId)
      .maybeSingle();
    if (jErr) throw jErr;
    if (!job) return res.status(404).json({ message: 'Scan job not found' });

    await supabaseAdmin
      .from('cspm_check_results')
      .delete()
      .eq('scan_job_id', req.params.id)
      .eq('review_status', 'pending');

    const rows = results.map((r) => {
      const passed = Number(r.checks_passed || 0);
      const failed = Number(r.checks_failed || 0);
      const na = Number(r.checks_na || 0);
      const total = Number(r.checks_total ?? passed + failed + na);
      return {
        org_id: req.orgId,
        scan_job_id: req.params.id,
        scf_control_id: r.scf_control_id || null,
        nn_ctl_name: r.nn_ctl_name || null,
        control_name: r.control_name || r.scf_control_id || r.nn_ctl_name || 'Unknown control',
        provider: r.provider || null,
        checks_total: total,
        checks_passed: passed,
        checks_failed: failed,
        checks_na: na,
        pass_pct: r.pass_pct != null ? Number(r.pass_pct) : passPct(passed, failed),
        result_status: r.result_status || resultStatus(passed, failed, na),
        raw: r.raw ?? r.checks ?? null,
        review_status: 'pending',
      };
    });
    if (rows.length) {
      const { error } = await supabaseAdmin.from('cspm_check_results').insert(rows);
      if (error) throw error;
    }
    await supabaseAdmin
      .from('cspm_scan_jobs')
      .update({ status: 'staged' })
      .eq('id', req.params.id)
      .eq('org_id', req.orgId);
    res.status(201).json({ staged: rows.length });
  } catch (err) {
    console.error('[cspm-scan] stage results error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  USER-FACING (browser JWT) — requireAuth
//  Drives the ZTI Hub Services → CSPM tab.
// ════════════════════════════════════════════════════════════

// List scan jobs for this org with a staged/pending result count.
router.get('/jobs', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) return res.json([]);
    const { data: jobs, error } = await supabaseAdmin
      .from('cspm_scan_jobs')
      .select('id, scope_type, scope_value, provider, status, summary, is_mock, started_at, finished_at, created_at')
      .eq('org_id', req.orgId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const ids = (jobs || []).map((j) => j.id);
    const byJob = new Map();
    if (ids.length) {
      const { data: r } = await supabaseAdmin
        .from('cspm_check_results')
        .select('scan_job_id, review_status')
        .in('scan_job_id', ids);
      for (const row of r || []) {
        if (!byJob.has(row.scan_job_id)) byJob.set(row.scan_job_id, { pending: 0, total: 0 });
        const e = byJob.get(row.scan_job_id);
        e.total += 1;
        if (row.review_status === 'pending') e.pending += 1;
      }
    }
    res.json((jobs || []).map((j) => ({
      ...j,
      result_count: byJob.get(j.id)?.total || 0,
      pending_count: byJob.get(j.id)?.pending || 0,
    })));
  } catch (err) {
    console.error('[cspm-scan] list jobs error:', err);
    res.status(500).json({ message: err.message });
  }
});

// All per-control results for a job.
router.get('/jobs/:id/results', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) return res.json([]);
    const { data, error } = await supabaseAdmin
      .from('cspm_check_results')
      .select('*')
      .eq('scan_job_id', req.params.id)
      .eq('org_id', req.orgId)
      .order('pass_pct', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[cspm-scan] job results error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Match each staged result to its control_registry row and compute the proposed
// status/maturity, so the admin sees current-vs-proposed before importing.
//   pass_pct === 0  → NotEnforced (Red), maturity 0, no peer review
//   pass_pct  >  0  → In-Review → peer review → Enforced at pass_pct% maturity
router.get('/jobs/:id/preview', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) return res.json([]);
    const { data: results, error } = await supabaseAdmin
      .from('cspm_check_results')
      .select('*')
      .eq('scan_job_id', req.params.id)
      .eq('org_id', req.orgId)
      .eq('review_status', 'pending');
    if (error) throw error;

    const matched = await Promise.all(
      (results || []).map(async (r) => {
        const control = await matchControl(req.orgId, r);
        const proposedStatus = r.pass_pct === 0 ? 'NotEnforced' : 'In-Review';
        return {
          result: r,
          current: control
            ? { id: control.id, ctl_id: control.ctl_id, ctl_name: control.ctl_name, ctl_status: control.ctl_status, maturity_score: control.maturity_score }
            : null,
          matched: !!control,
          proposed: { ctl_status: proposedStatus, maturity_score: r.pass_pct, needs_review: r.pass_pct > 0 },
        };
      })
    );
    res.json(matched);
  } catch (err) {
    console.error('[cspm-scan] preview error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Find the control_registry row a CSPM result maps to. SCF results match on
// scf_control_id; NN results match on ctl_name + ctl_type='NN'.
async function matchControl(orgId, r) {
  if (r.scf_control_id) {
    const { data } = await supabaseAdmin
      .from('control_registry')
      .select('*')
      .eq('org_id', orgId)
      .eq('scf_control_id', r.scf_control_id)
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }
  if (r.nn_ctl_name) {
    const { data } = await supabaseAdmin
      .from('control_registry')
      .select('*')
      .eq('org_id', orgId)
      .eq('ctl_name', r.nn_ctl_name)
      .eq('ctl_type', 'NN')
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

// First review: admin approves/discards staged results and imports into the
// control registry. Body: { approve:[resultId], discard:[resultId],
// reviewer_id, reviewer_name, reviewer_email }.
//  • 0% (fail)  → control set NotEnforced directly (Red), maturity 0. No peer review.
//  • >0%        → control set In-Review + a pending control_evidence_reviews row
//                 (requested_status='Enforced', maturity=pass_pct) so the existing
//                 mandatory peer-review gate carries it to Enforced. Reviewer notified.
router.post('/jobs/:id/import', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) return res.status(400).json({ message: 'No organization for this user' });
    const approve = Array.isArray(req.body?.approve) ? req.body.approve : [];
    const discard = Array.isArray(req.body?.discard) ? req.body.discard : [];
    const { reviewer_id, reviewer_name, reviewer_email } = req.body || {};
    const actorName = req.user?.email || req.userId;

    if (discard.length) {
      await supabaseAdmin
        .from('cspm_check_results')
        .update({ review_status: 'discarded' })
        .in('id', discard)
        .eq('org_id', req.orgId);
    }

    const outcome = { enforced_in_review: 0, not_enforced: 0, skipped_unmatched: 0, skipped_in_review: 0, discarded: discard.length };

    if (approve.length) {
      const { data: results, error } = await supabaseAdmin
        .from('cspm_check_results')
        .select('*')
        .in('id', approve)
        .eq('org_id', req.orgId)
        .eq('review_status', 'pending');
      if (error) throw error;

      // Any result that would enter the peer-review path needs a reviewer.
      const needsReviewer = (results || []).some((r) => r.pass_pct > 0);
      if (needsReviewer && (!reviewer_name || !reviewer_email)) {
        return res.status(400).json({ message: 'A peer reviewer (name + email) is required to import controls that passed any checks.' });
      }

      for (const r of results || []) {
        const control = await matchControl(req.orgId, r);
        if (!control) { outcome.skipped_unmatched += 1; continue; }
        if (control.ctl_status === 'In-Review') { outcome.skipped_in_review += 1; continue; }

        // Synthetic CSPM evidence entry (no uploaded file — storage_path null).
        const cspmEvidence = {
          display_name: `CSPM scan — ${r.checks_passed}/${r.checks_passed + r.checks_failed} passed (${r.pass_pct}%)`,
          source: 'cspm',
          storage_path: null,
          original_name: `cspm-${r.scan_job_id}.json`,
          provider: r.provider,
          uploaded_at: new Date().toISOString(),
          summary: {
            checks_total: r.checks_total,
            checks_passed: r.checks_passed,
            checks_failed: r.checks_failed,
            checks_na: r.checks_na,
            pass_pct: r.pass_pct,
            result_status: r.result_status,
            checks: r.raw,
          },
        };
        const mergedEvidence = [...(control.evidence_metadata || []), cspmEvidence];

        if (r.pass_pct === 0) {
          // 0% → NotEnforced (Red) directly. No peer review (nothing is being enforced).
          await supabaseAdmin
            .from('control_registry')
            .update({ ctl_status: 'NotEnforced', maturity_score: 0, evidence_metadata: mergedEvidence, updated_at: new Date().toISOString() })
            .eq('id', control.id)
            .eq('org_id', req.orgId);
          outcome.not_enforced += 1;
          logActivity({
            action: 'control_cspm_imported',
            module: 'Governance',
            entity_id: control.id,
            entity_name: control.ctl_name,
            user_id: req.userId,
            org_id: req.orgId,
            severity: 'warning',
            event_data: { actor_name: actorName, user_email: actorName, result: 'NotEnforced', pass_pct: 0, provider: r.provider },
          });
        } else {
          // >0% → In-Review, hand to the mandatory peer-review gate to enforce.
          await supabaseAdmin
            .from('control_registry')
            .update({ ctl_status: 'In-Review', maturity_score: r.pass_pct, evidence_metadata: mergedEvidence, updated_at: new Date().toISOString() })
            .eq('id', control.id)
            .eq('org_id', req.orgId);

          // Supersede any older pending review (defensive — we skip In-Review above).
          await supabaseAdmin
            .from('control_evidence_reviews')
            .update({ status: 'rejected', review_comment: 'Superseded by CSPM import', updated_at: new Date().toISOString() })
            .eq('control_id', control.id)
            .eq('status', 'pending');

          await supabaseAdmin.from('control_evidence_reviews').insert({
            control_id: control.id,
            requested_status: 'Enforced',
            requested_by: req.userId,
            enforced_by_name: actorName,
            enforced_by_email: req.user?.email || '',
            reviewer_id: reviewer_id || null,
            reviewer_name,
            reviewer_email,
            status: 'pending',
            comment: `CSPM posture scan: ${r.checks_passed}/${r.checks_passed + r.checks_failed} checks passed (${r.pass_pct}% maturity) on ${r.provider || 'cloud'}. Peer review required before enforcement.`,
            evidence_files: [],
            org_id: req.orgId,
          });

          if (reviewer_id) {
            await supabaseAdmin.from('control_notifications').insert({
              recipient_id: reviewer_id,
              control_id: control.id,
              control_name: control.ctl_name,
              type: 'review_requested',
              message: `CSPM import: ${actorName} requests your review to enforce "${control.ctl_id} - ${control.ctl_name}" at ${r.pass_pct}% maturity (${r.checks_passed}/${r.checks_passed + r.checks_failed} checks passed).`,
              org_id: req.orgId,
            });
          }
          outcome.enforced_in_review += 1;
          logActivity({
            action: 'control_cspm_imported',
            module: 'Governance',
            entity_id: control.id,
            entity_name: control.ctl_name,
            user_id: req.userId,
            org_id: req.orgId,
            severity: 'info',
            event_data: { actor_name: actorName, user_email: actorName, result: 'In-Review', pass_pct: r.pass_pct, reviewer_name, reviewer_email, provider: r.provider },
          });
        }

        await supabaseAdmin
          .from('cspm_check_results')
          .update({ review_status: 'imported', imported_control_id: control.id })
          .eq('id', r.id)
          .eq('org_id', req.orgId);
      }
    }

    // If nothing pending remains, mark the job imported.
    const { count } = await supabaseAdmin
      .from('cspm_check_results')
      .select('id', { count: 'exact', head: true })
      .eq('scan_job_id', req.params.id)
      .eq('review_status', 'pending');
    if (!count) {
      await supabaseAdmin
        .from('cspm_scan_jobs')
        .update({ status: 'imported' })
        .eq('id', req.params.id)
        .eq('org_id', req.orgId);
    }

    res.json(outcome);
  } catch (err) {
    console.error('[cspm-scan] import error:', err);
    res.status(500).json({ message: err.message });
  }
});

export const cspmScanRouter = router;
