import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { requireDevice } from '../middleware/deviceAuth.js';

const router = Router();

// ════════════════════════════════════════════════════════════
//  DEVICE-FACING (device token) — requireDevice
//  Driven by the zti CLI (`zti vuln-scan`).
// ════════════════════════════════════════════════════════════

// Create a scan job. The CLI calls this right after the operator confirms the

// Audit jobs use target_type='local' (DB constraint) and scanner='ad' to distinguish from OpenVAS.
const ALLOWED_TARGET_TYPES = ['all', 'subnet', 'ip', 'local'];
const AUDIT_TARGET_ALIASES = ['ad', 'host'];

// Scanners (esp. OpenVAS) send the literal string "N/A" for findings with no
// real CVE. Treated as a real value it collides every such finding onto one
// shared "N/A" vulnerability_management row instead of being matched by name.
function normalizeCve(cveId) {
  if (!cveId) return null;
  const trimmed = String(cveId).trim();
  return trimmed && trimmed.toUpperCase() !== 'N/A' ? trimmed : null;
}

function derivedFromForJob(job) {
  if (job?.scanner === 'ad') return 'AD';
  return 'Scanning';
}

function normalizeScanJobInput(body) {
  const { target_type, target_value, authorized, consent_by, is_mock, scanner } = body || {};
  const isAuditAlias = AUDIT_TARGET_ALIASES.includes(target_type);
  const isAuditJob = scanner === 'ad' || isAuditAlias;
  const dbTargetType = isAuditAlias ? 'local' : target_type;
  const resolvedScanner = scanner || (isAuditJob ? 'ad' : 'openvas');
  return {
    dbTargetType,
    target_value: target_value || null,
    authorized: isAuditJob ? true : !!authorized,
    consent_by,
    is_mock: isAuditJob ? false : is_mock !== false,
    scanner: resolvedScanner,
    isAuditJob,
  };
}

router.post('/jobs', requireDevice, async (req, res) => {
  try {
    const { target_type } = req.body || {};
    const normalized = normalizeScanJobInput(req.body);
    if (!ALLOWED_TARGET_TYPES.includes(normalized.dbTargetType) && !AUDIT_TARGET_ALIASES.includes(target_type)) {
      return res.status(400).json({ message: `target_type must be ${[...ALLOWED_TARGET_TYPES, ...AUDIT_TARGET_ALIASES].join('|')}` });
    }
    if (!normalized.isAuditJob && !normalized.authorized) {
      return res.status(400).json({ message: 'Scan authorization consent is required' });
    }
    const { data, error } = await supabaseAdmin
      .from('vuln_scan_jobs')
      .insert({
        org_id: req.orgId,
        device_id: req.deviceId,
        target_type: normalized.dbTargetType,
        target_value: normalized.target_value,
        authorized: normalized.authorized,
        consent_by: normalized.consent_by || req.device?.device_name || 'cli',
        consent_at: new Date().toISOString(),
        status: 'running',
        is_mock: normalized.is_mock,
        scanner: normalized.scanner,
      })
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('[vuln-scan] create job error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Update job status/summary (running → completed|failed). CLI reports this when
// the detached OpenVAS scan finishes.
router.post('/jobs/:id/status', requireDevice, async (req, res) => {
  try {
    const { status, summary } = req.body || {};
    if (!['running', 'completed', 'failed'].includes(status)) {
      return res.status(400).json({ message: 'status must be running|completed|failed' });
    }
    const patch = { status, summary: summary ?? null };
    if (status === 'completed' || status === 'failed') patch.finished_at = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from('vuln_scan_jobs')
      .update(patch)
      .eq('id', req.params.id)
      .eq('org_id', req.orgId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[vuln-scan] job status error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Stage findings for analyst review ("send to ZTI workspace"). Replaces any
// previously staged-but-unreviewed findings for this job (idempotent re-send).
router.post('/jobs/:id/findings', requireDevice, async (req, res) => {
  try {
    const findings = Array.isArray(req.body?.findings) ? req.body.findings : [];
    // Verify the job belongs to this org.
    const { data: job, error: jErr } = await supabaseAdmin
      .from('vuln_scan_jobs')
      .select('id')
      .eq('id', req.params.id)
      .eq('org_id', req.orgId)
      .maybeSingle();
    if (jErr) throw jErr;
    if (!job) return res.status(404).json({ message: 'Scan job not found' });

    // Clear prior pending rows for this job (analyst hasn't acted on them yet).
    await supabaseAdmin
      .from('vuln_scan_findings')
      .delete()
      .eq('scan_job_id', req.params.id)
      .eq('review_status', 'pending');

    const rows = findings.map((f) => ({
      org_id: req.orgId,
      scan_job_id: req.params.id,
      host: f.host || null,
      port: f.port || null,
      cve_id: normalizeCve(f.cve_id),
      vuln_name: f.vuln_name || f.name || 'Unknown finding',
      description: f.description || null,
      cvss_score: f.cvss_score ?? null,
      severity: f.severity || null,
      priority: f.priority || null,
      in_kev: !!f.in_kev,
      raw: f.raw ?? f ?? null,
      review_status: 'pending',
    }));
    if (rows.length) {
      const { error } = await supabaseAdmin.from('vuln_scan_findings').insert(rows);
      if (error) throw error;
    }
    await supabaseAdmin
      .from('vuln_scan_jobs')
      .update({ status: 'staged' })
      .eq('id', req.params.id)
      .eq('org_id', req.orgId);
    res.status(201).json({ staged: rows.length });
  } catch (err) {
    console.error('[vuln-scan] stage findings error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  USER-FACING (browser JWT) — requireAuth
//  Drives the ZTI Hub Services → Vulnerability Assessment tab.
// ════════════════════════════════════════════════════════════

// List scan jobs for this org, with a staged/pending finding count.
router.get('/jobs', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) return res.json([]);
    const { data: jobs, error } = await supabaseAdmin
      .from('vuln_scan_jobs')
      .select('id, target_type, target_value, status, summary, is_mock, scanner, consent_by, consent_at, started_at, finished_at, created_at')
      .eq('org_id', req.orgId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const ids = (jobs || []).map((j) => j.id);
    const pendingByJob = new Map();
    if (ids.length) {
      // PostgREST caps an unbounded select at its default row limit (commonly 1000),
      // silently truncating the count for orgs with many findings. Page through
      // all matching rows so newer jobs don't read back as 0 findings.
      const PAGE_SIZE = 1000;
      let offset = 0;
      for (;;) {
        const { data: f, error: fErr } = await supabaseAdmin
          .from('vuln_scan_findings')
          .select('scan_job_id, review_status')
          .in('scan_job_id', ids)
          .range(offset, offset + PAGE_SIZE - 1);
        if (fErr) throw fErr;
        for (const row of f || []) {
          if (!pendingByJob.has(row.scan_job_id)) pendingByJob.set(row.scan_job_id, { pending: 0, total: 0 });
          const e = pendingByJob.get(row.scan_job_id);
          e.total += 1;
          if (row.review_status === 'pending') e.pending += 1;
        }
        if (!f || f.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
    }
    res.json((jobs || []).map((j) => ({
      ...j,
      finding_count: pendingByJob.get(j.id)?.total || 0,
      pending_count: pendingByJob.get(j.id)?.pending || 0,
    })));
  } catch (err) {
    console.error('[vuln-scan] list jobs error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Findings for a job (analyst review list).
router.get('/jobs/:id/findings', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) return res.json([]);
    const { data, error } = await supabaseAdmin
      .from('vuln_scan_findings')
      .select('id, host, port, cve_id, vuln_name, description, cvss_score, severity, priority, in_kev, asset_id, review_status, imported_vuln_id, created_at')
      .eq('scan_job_id', req.params.id)
      .eq('org_id', req.orgId)
      .order('cvss_score', { ascending: false, nullsFirst: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[vuln-scan] job findings error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Conflict diff: for each staged finding, the existing vulnerability_management
// row it would collide with (matched on cve_id, else exact vuln name). Returns
// { incoming, current } pairs so the GUI can render left(current)/right(incoming).
router.get('/jobs/:id/diff', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) return res.json([]);
    const { data: findings, error } = await supabaseAdmin
      .from('vuln_scan_findings')
      .select('id, host, port, cve_id, vuln_name, description, cvss_score, severity, priority, in_kev, asset_id, review_status')
      .eq('scan_job_id', req.params.id)
      .eq('org_id', req.orgId)
      .eq('review_status', 'pending');
    if (error) throw error;

    const cves = [...new Set((findings || []).map((f) => normalizeCve(f.cve_id)).filter(Boolean))];
    const names = [...new Set((findings || []).map((f) => f.vuln_name).filter(Boolean))];

    const existing = [];
    if (cves.length) {
      const { data } = await supabaseAdmin
        .from('vulnerability_management')
        .select('id:vuln_id, name, description, derived_from, status, cve_id, cvss_score, priority')
        .eq('org_id', req.orgId)
        .in('cve_id', cves);
      existing.push(...(data || []));
    }
    if (names.length) {
      const { data } = await supabaseAdmin
        .from('vulnerability_management')
        .select('id:vuln_id, name, description, derived_from, status, cve_id, cvss_score, priority')
        .eq('org_id', req.orgId)
        .in('name', names);
      existing.push(...(data || []));
    }
    const byCve = new Map();
    const byName = new Map();
    for (const e of existing) {
      const eCve = normalizeCve(e.cve_id);
      if (eCve && !byCve.has(eCve)) byCve.set(eCve, e);
      if (e.name && !byName.has(e.name)) byName.set(e.name, e);
    }

    res.json((findings || []).map((f) => {
      const fCve = normalizeCve(f.cve_id);
      const current = (fCve && byCve.get(fCve)) || byName.get(f.vuln_name) || null;
      return { incoming: f, current, conflict: !!current };
    }));
  } catch (err) {
    console.error('[vuln-scan] diff error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Commit analyst-approved findings into vulnerability_management. Body:
// { approve: [findingId...], discard: [findingId...] }. Conflicting rows (matched
// on cve_id) are updated in place; new ones are inserted (derived_from from job scanner).
router.post('/jobs/:id/import', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) return res.status(400).json({ message: 'No organization for this user' });
    const approve = Array.isArray(req.body?.approve) ? req.body.approve : [];
    const discard = Array.isArray(req.body?.discard) ? req.body.discard : [];

    if (discard.length) {
      await supabaseAdmin
        .from('vuln_scan_findings')
        .update({ review_status: 'discarded' })
        .in('id', discard)
        .eq('org_id', req.orgId);
    }

    let imported = 0;
    if (approve.length) {
      const { data: job, error: jobErr } = await supabaseAdmin
        .from('vuln_scan_jobs')
        .select('scanner')
        .eq('id', req.params.id)
        .eq('org_id', req.orgId)
        .maybeSingle();
      if (jobErr) throw jobErr;
      const derivedFrom = derivedFromForJob(job);

      const { data: findings, error } = await supabaseAdmin
        .from('vuln_scan_findings')
        .select('*')
        .in('id', approve)
        .eq('org_id', req.orgId)
        .eq('review_status', 'pending');
      if (error) throw error;

      for (const f of findings || []) {
        // Find an existing row to update (collide on cve_id, else exact name).
        const fCve = normalizeCve(f.cve_id);
        let existing = null;
        if (fCve) {
          const { data } = await supabaseAdmin
            .from('vulnerability_management')
            .select('id:vuln_id')
            .eq('org_id', req.orgId)
            .eq('cve_id', fCve)
            .maybeSingle();
          existing = data;
        }
        if (!existing) {
          const { data } = await supabaseAdmin
            .from('vulnerability_management')
            .select('id:vuln_id')
            .eq('org_id', req.orgId)
            .eq('name', f.vuln_name)
            .maybeSingle();
          existing = data;
        }

        const payload = {
          name: f.vuln_name,
          description: f.description,
          derived_from: derivedFrom,
          cve_id: fCve,
          cvss_score: f.cvss_score,
          priority: f.priority,
          scan_job_id: f.scan_job_id,
          asset_id: f.asset_id,
        };

        let vulnId;
        if (existing) {
          const { data, error: uErr } = await supabaseAdmin
            .from('vulnerability_management')
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq('vuln_id', existing.id)
            .eq('org_id', req.orgId)
            .select('id:vuln_id')
            .single();
          if (uErr) throw uErr;
          vulnId = data.id;
        } else {
          const { data, error: iErr } = await supabaseAdmin
            .from('vulnerability_management')
            .insert({ ...payload, status: 'Planned', org_id: req.orgId, user_id: req.userId })
            .select('id:vuln_id')
            .single();
          if (iErr) throw iErr;
          vulnId = data.id;
        }

        await supabaseAdmin
          .from('vuln_scan_findings')
          .update({ review_status: 'imported', imported_vuln_id: vulnId })
          .eq('id', f.id)
          .eq('org_id', req.orgId);
        imported += 1;
      }
    }

    // If nothing pending remains, mark the job imported.
    const { count } = await supabaseAdmin
      .from('vuln_scan_findings')
      .select('id', { count: 'exact', head: true })
      .eq('scan_job_id', req.params.id)
      .eq('review_status', 'pending');
    if (!count) {
      await supabaseAdmin
        .from('vuln_scan_jobs')
        .update({ status: 'imported' })
        .eq('id', req.params.id)
        .eq('org_id', req.orgId);
    }

    res.json({ imported, discarded: discard.length });
  } catch (err) {
    console.error('[vuln-scan] import error:', err);
    res.status(500).json({ message: err.message });
  }
});

export const vulnScanRouter = router;
