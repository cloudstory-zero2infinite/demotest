import { Router } from 'express';
import crypto from 'crypto';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { requireDevice, hashToken } from '../middleware/deviceAuth.js';

const router = Router();

// A device is "online" if it beaconed within this window.
const ONLINE_WINDOW_MS = 150 * 1000; // 2.5 min (hub beacons every 60s)

function isOnline(lastBeaconAt) {
  if (!lastBeaconAt) return false;
  return Date.now() - new Date(lastBeaconAt).getTime() < ONLINE_WINDOW_MS;
}

// ════════════════════════════════════════════════════════════
//  USER-FACING (browser JWT) — requireAuth
// ════════════════════════════════════════════════════════════

// Hub online status for this org (drives the ▶ button enabled state).
router.get('/status', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) return res.json({ active: false });
    const { data, error } = await supabaseAdmin
      .from('zti_hub_devices')
      .select('device_name, last_beacon_at, gcp_integrated')
      .eq('org_id', req.orgId)
      .is('revoked_at', null)
      .order('last_beacon_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    res.json({
      active: data ? isOnline(data.last_beacon_at) : false,
      deviceName: data?.device_name || null,
      lastBeaconAt: data?.last_beacon_at || null,
      gcpIntegrated: data?.gcp_integrated || false,
    });
  } catch (err) {
    console.error('[zti-hub] status error:', err);
    res.status(500).json({ message: err.message });
  }
});

// List this org's registered devices.
router.get('/devices', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) return res.json([]);
    const { data, error } = await supabaseAdmin
      .from('zti_hub_devices')
      .select('id, device_name, gcp_integrated, gcp_project_id, last_beacon_at, created_at, revoked_at')
      .eq('org_id', req.orgId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json((data || []).map((d) => ({ ...d, online: isOnline(d.last_beacon_at) })));
  } catch (err) {
    console.error('[zti-hub] devices list error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Register a new device → returns the raw token ONCE. Used by `zti authenticate`.
router.post('/devices', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) return res.status(400).json({ message: 'No organization for this user' });
    const rawToken = `zti_${crypto.randomBytes(24).toString('hex')}`;
    const deviceName = (req.body?.device_name || 'zti-hub').toString().slice(0, 120);
    const { data, error } = await supabaseAdmin
      .from('zti_hub_devices')
      .insert({
        org_id: req.orgId,
        user_id: req.userId,
        device_name: deviceName,
        token_hash: hashToken(rawToken),
      })
      .select('id, device_name, created_at')
      .single();
    if (error) throw error;
    // Raw token is returned exactly once; only its hash is persisted.
    res.status(201).json({ device: data, token: rawToken });
  } catch (err) {
    console.error('[zti-hub] device register error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Revoke a device.
router.delete('/devices/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('zti_hub_devices')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('org_id', req.orgId);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    console.error('[zti-hub] device revoke error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Distinct control keys that have ≥1 associated check (global). The control
// registry uses these to decide which rows show a ▶ button: SCF rows match on
// scf_control_id, NN rows match on ctl_name.
router.get('/associated-controls', requireAuth, async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('control_check_associations')
      .select('scf_control_id, nn_ctl_name');
    if (error) throw error;
    const scf = [...new Set((data || []).map((r) => r.scf_control_id).filter(Boolean))];
    const nn = [...new Set((data || []).map((r) => r.nn_ctl_name).filter(Boolean))];
    res.json({ scf, nn });
  } catch (err) {
    console.error('[zti-hub] associated-controls error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Enqueue checks for a control (the ▶ button). Accepts an SCF control
// (scf_control_id) or an NN control (nn_ctl_name). One queued job per check.
router.post('/enqueue', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) return res.status(400).json({ message: 'No organization for this user' });
    const scfControlId = req.body?.scf_control_id;
    const nnCtlName = req.body?.nn_ctl_name;
    if (!scfControlId && !nnCtlName) {
      return res.status(400).json({ message: 'scf_control_id or nn_ctl_name is required' });
    }
    const col = scfControlId ? 'scf_control_id' : 'nn_ctl_name';
    const val = scfControlId || nnCtlName;

    const { data: assoc, error: aErr } = await supabaseAdmin
      .from('control_check_associations')
      .select('check_id')
      .eq(col, val);
    if (aErr) throw aErr;
    if (!assoc || assoc.length === 0) {
      return res.status(400).json({ message: 'No checks associated with this control' });
    }

    const rows = assoc.map((a) => ({
      org_id: req.orgId,
      scf_control_id: scfControlId || null,
      nn_ctl_name: nnCtlName || null,
      check_id: a.check_id,
      status: 'queued',
      requested_by: req.user?.email || req.userId,
    }));
    const { data, error } = await supabaseAdmin
      .from('control_check_jobs')
      .insert(rows)
      .select('id');
    if (error) throw error;
    res.status(201).json({ queued: (data || []).length });
  } catch (err) {
    console.error('[zti-hub] enqueue error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Latest job per check for a control (the ▶ results panel). Keyed by
// scf_control_id or nn_ctl_name.
router.get('/results', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) return res.json([]);
    const scfControlId = req.query.scf_control_id;
    const nnCtlName = req.query.nn_ctl_name;
    if (!scfControlId && !nnCtlName) {
      return res.status(400).json({ message: 'scf_control_id or nn_ctl_name is required' });
    }
    const col = scfControlId ? 'scf_control_id' : 'nn_ctl_name';
    const val = scfControlId || nnCtlName;
    const { data, error } = await supabaseAdmin
      .from('control_check_jobs')
      .select('id, check_id, status, result_status, result, requested_at, finished_at')
      .eq('org_id', req.orgId)
      .eq(col, val)
      .order('requested_at', { ascending: false });
    if (error) throw error;
    // Collapse to the most recent job per check_id.
    const latest = new Map();
    for (const j of data || []) if (!latest.has(j.check_id)) latest.set(j.check_id, j);
    res.json([...latest.values()]);
  } catch (err) {
    console.error('[zti-hub] results error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  DEVICE-FACING (device token) — requireDevice
// ════════════════════════════════════════════════════════════

// Heartbeat. Bumps last_beacon_at, optionally records GCP integration state.
// Returns the count of queued jobs so the CLI knows whether to pull.
router.post('/beacon', requireDevice, async (req, res) => {
  try {
    const patch = { last_beacon_at: new Date().toISOString() };
    if (typeof req.body?.gcp_integrated === 'boolean') patch.gcp_integrated = req.body.gcp_integrated;
    if (req.body?.gcp_project_id !== undefined) patch.gcp_project_id = req.body.gcp_project_id;
    await supabaseAdmin.from('zti_hub_devices').update(patch).eq('id', req.deviceId);

    const { count } = await supabaseAdmin
      .from('control_check_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', req.orgId)
      .eq('status', 'queued');
    res.json({ ok: true, queued: count || 0 });
  } catch (err) {
    console.error('[zti-hub] beacon error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Claim queued jobs: marks them 'running' and returns them with check details.
router.get('/jobs/next', requireDevice, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const { data: queued, error } = await supabaseAdmin
      .from('control_check_jobs')
      .select('id, scf_control_id, check_id')
      .eq('org_id', req.orgId)
      .eq('status', 'queued')
      .order('requested_at', { ascending: true })
      .limit(limit);
    if (error) throw error;
    if (!queued || queued.length === 0) return res.json([]);

    const ids = queued.map((j) => j.id);
    await supabaseAdmin
      .from('control_check_jobs')
      .update({ status: 'running', claimed_by: req.deviceId })
      .in('id', ids);

    // Enrich with provider/title from the library.
    const checkIds = [...new Set(queued.map((j) => j.check_id))];
    const { data: lib } = await supabaseAdmin
      .from('control_checks_library')
      .select('check_id, title, provider, service, severity')
      .in('check_id', checkIds);
    const byId = new Map((lib || []).map((c) => [c.check_id, c]));

    res.json(
      queued.map((j) => ({
        ...j,
        ...(byId.get(j.check_id) || {}),
      }))
    );
  } catch (err) {
    console.error('[zti-hub] jobs/next error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Submit a job result.
router.post('/jobs/:id/result', requireDevice, async (req, res) => {
  try {
    const { result_status, result } = req.body || {};
    if (!['pass', 'fail', 'error'].includes(result_status)) {
      return res.status(400).json({ message: 'result_status must be pass|fail|error' });
    }
    const { error } = await supabaseAdmin
      .from('control_check_jobs')
      .update({
        status: result_status === 'error' ? 'failed' : 'done',
        result_status,
        result: result ?? null,
        finished_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('org_id', req.orgId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[zti-hub] job result error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Record an ad-hoc run (on-demand `check-control` / `check-framework`) directly
// as a completed job — these bypass the queue.
router.post('/runs', requireDevice, async (req, res) => {
  try {
    const { scf_control_id, check_id, result_status, result } = req.body || {};
    if (!scf_control_id || !check_id || !['pass', 'fail', 'error'].includes(result_status)) {
      return res.status(400).json({ message: 'scf_control_id, check_id, result_status(pass|fail|error) required' });
    }
    const { data, error } = await supabaseAdmin
      .from('control_check_jobs')
      .insert({
        org_id: req.orgId,
        scf_control_id,
        check_id,
        status: result_status === 'error' ? 'failed' : 'done',
        requested_by: `hub:${req.device?.device_name || 'cli'}`,
        claimed_by: req.deviceId,
        result_status,
        result: result ?? null,
        finished_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('[zti-hub] run record error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Checks associated with a single control (on-demand `zti check-control`).
router.get('/control-checks', requireDevice, async (req, res) => {
  try {
    const scfControlId = req.query.scf_control_id;
    if (!scfControlId) return res.status(400).json({ message: 'scf_control_id is required' });
    const { data: assoc, error } = await supabaseAdmin
      .from('control_check_associations')
      .select('check_id')
      .eq('scf_control_id', scfControlId);
    if (error) throw error;
    const checkIds = (assoc || []).map((a) => a.check_id);
    if (checkIds.length === 0) return res.json([]);
    const { data: lib } = await supabaseAdmin
      .from('control_checks_library')
      .select('check_id, title, provider, service, severity')
      .in('check_id', checkIds);
    res.json((lib || []).map((c) => ({ ...c, scf_control_id: scfControlId })));
  } catch (err) {
    console.error('[zti-hub] control-checks error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Checks for every control mapped to an SCF framework (on-demand `zti check-framework`).
router.get('/framework-checks', requireDevice, async (req, res) => {
  try {
    const framework = req.query.framework;
    if (!framework) return res.status(400).json({ message: 'framework is required' });

    // Controls claimed by this framework.
    const { data: fwRows, error: fwErr } = await supabaseAdmin
      .from('scf_control_frameworks')
      .select('scf_control_id')
      .eq('framework_name', framework);
    if (fwErr) throw fwErr;
    const controlIds = [...new Set((fwRows || []).map((r) => r.scf_control_id))];
    if (controlIds.length === 0) return res.json([]);

    // Associations for those controls (chunk the IN list to stay under limits).
    const assoc = [];
    const CH = 200;
    for (let i = 0; i < controlIds.length; i += CH) {
      const slice = controlIds.slice(i, i + CH);
      const { data, error } = await supabaseAdmin
        .from('control_check_associations')
        .select('scf_control_id, check_id')
        .in('scf_control_id', slice);
      if (error) throw error;
      assoc.push(...(data || []));
    }
    if (assoc.length === 0) return res.json([]);

    const checkIds = [...new Set(assoc.map((a) => a.check_id))];
    const { data: lib } = await supabaseAdmin
      .from('control_checks_library')
      .select('check_id, title, provider, service, severity')
      .in('check_id', checkIds);
    const byId = new Map((lib || []).map((c) => [c.check_id, c]));

    res.json(
      assoc
        .map((a) => ({ scf_control_id: a.scf_control_id, ...(byId.get(a.check_id) || { check_id: a.check_id }) }))
        .filter((r) => r.check_id)
    );
  } catch (err) {
    console.error('[zti-hub] framework-checks error:', err);
    res.status(500).json({ message: err.message });
  }
});

export const ztiHubRouter = router;
