import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Default GCP check → SCF control mappings used by the "Auto-assign GCP checks"
// button. Idempotent: only inserts pairs that don't already exist.
const GCP_AUTO_ASSOCIATIONS = [
  { scf_control_id: 'IAC-21', check_id: 'compute_instance_default_service_account_in_use_with_full_api_access' },
  { scf_control_id: 'IAC-21', check_id: 'iam_sa_no_administrative_privileges' },
  { scf_control_id: 'DCH-01', check_id: 'cloudstorage_bucket_public_access' },
  { scf_control_id: 'NET-03', check_id: 'cloudstorage_bucket_public_access' },
  { scf_control_id: 'DCH-01', check_id: 'bigquery_dataset_public_access' },
  { scf_control_id: 'CRY-05', check_id: 'kms_key_not_publicly_accessible' },
  { scf_control_id: 'NET-03', check_id: 'compute_firewall_rdp_access_from_the_internet_allowed' },
];

const CHECK_FIELDS =
  'id, check_id, title, description, provider, service, severity, source, remediation, check_metadata, created_at, updated_at';

// ───────── Checks catalogue (control_checks_library) ─────────

router.get('/', requireAuth, async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('control_checks_library')
      .select(CHECK_FIELDS)
      .order('provider', { ascending: true })
      .order('check_id', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[control-checks] list error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.check_id || !b.title) {
      return res.status(400).json({ message: 'check_id and title are required' });
    }
    const row = {
      check_id: String(b.check_id).trim(),
      title: String(b.title).trim(),
      description: b.description ?? null,
      provider: b.provider || 'gcp',
      service: b.service ?? null,
      severity: b.severity || 'medium',
      source: b.source || 'custom',
      remediation: b.remediation ?? null,
      check_metadata: b.check_metadata ?? {},
    };
    const { data, error } = await supabaseAdmin
      .from('control_checks_library')
      .insert(row)
      .select(CHECK_FIELDS)
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('[control-checks] create error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const patch = { updated_at: new Date().toISOString() };
    for (const k of ['title', 'description', 'provider', 'service', 'severity', 'source', 'remediation', 'check_metadata']) {
      if (k in b) patch[k] = b[k];
    }
    const { data, error } = await supabaseAdmin
      .from('control_checks_library')
      .update(patch)
      .eq('id', req.params.id)
      .select(CHECK_FIELDS)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[control-checks] update error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('control_checks_library')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    console.error('[control-checks] delete error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ───────── Associations (control_check_associations) ─────────

// All associations, optionally filtered to one SCF control. Joined with check
// title so the UI can render without a second lookup.
router.get('/associations', requireAuth, async (req, res) => {
  try {
    let q = supabaseAdmin
      .from('control_check_associations')
      .select('id, scf_control_id, nn_ctl_name, check_id, created_by, created_at');
    if (req.query.scf_control_id) q = q.eq('scf_control_id', req.query.scf_control_id);
    if (req.query.nn_ctl_name) q = q.eq('nn_ctl_name', req.query.nn_ctl_name);
    const { data, error } = await q;
    if (error) throw error;

    // Enrich with check metadata via a separate lookup (avoids relying on
    // PostgREST FK embedding against the non-PK unique check_id column).
    const { data: lib, error: libErr } = await supabaseAdmin
      .from('control_checks_library')
      .select('check_id, title, provider, severity');
    if (libErr) throw libErr;
    const byId = new Map((lib || []).map((c) => [c.check_id, c]));

    const rows = (data || []).map((r) => {
      const c = byId.get(r.check_id);
      return {
        id: r.id,
        kind: r.nn_ctl_name ? 'nn' : 'scf',
        scf_control_id: r.scf_control_id,
        nn_ctl_name: r.nn_ctl_name,
        check_id: r.check_id,
        created_by: r.created_by,
        created_at: r.created_at,
        title: c?.title || null,
        provider: c?.provider || null,
        severity: c?.severity || null,
      };
    });
    res.json(rows);
  } catch (err) {
    console.error('[control-checks] associations list error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Attach a check to an SCF control (scf_control_id) OR an NN control (nn_ctl_name).
router.post('/associations', requireAuth, async (req, res) => {
  try {
    const { scf_control_id, nn_ctl_name, check_id } = req.body || {};
    if (!check_id || (!scf_control_id && !nn_ctl_name)) {
      return res.status(400).json({ message: 'check_id plus one of scf_control_id | nn_ctl_name are required' });
    }
    if (scf_control_id && nn_ctl_name) {
      return res.status(400).json({ message: 'provide only one of scf_control_id | nn_ctl_name' });
    }

    // Existence check + insert (partial unique indexes don't compose with
    // PostgREST upsert onConflict, so we dedupe manually).
    const col = scf_control_id ? 'scf_control_id' : 'nn_ctl_name';
    const val = scf_control_id || nn_ctl_name;
    const { data: existing } = await supabaseAdmin
      .from('control_check_associations')
      .select('id')
      .eq(col, val)
      .eq('check_id', check_id)
      .maybeSingle();
    if (existing) return res.status(200).json(existing);

    const { data, error } = await supabaseAdmin
      .from('control_check_associations')
      .insert({
        scf_control_id: scf_control_id || null,
        nn_ctl_name: nn_ctl_name || null,
        check_id,
        created_by: req.userEmail || 'sme',
      })
      .select('id, scf_control_id, nn_ctl_name, check_id')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('[control-checks] associate error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Detach. Accepts either an association :id or a (scf_control_id, check_id) body.
router.delete('/associations/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('control_check_associations')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    console.error('[control-checks] detach error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Auto-assign the curated GCP defaults. Idempotent (skips existing pairs).
router.post('/auto-assign-gcp', requireAuth, async (req, res) => {
  try {
    // Insert only the SCF pairs that don't already exist (partial unique index
    // rules out a plain upsert onConflict here).
    const { data: existing } = await supabaseAdmin
      .from('control_check_associations')
      .select('scf_control_id, check_id')
      .not('scf_control_id', 'is', null);
    const seen = new Set((existing || []).map((r) => `${r.scf_control_id}::${r.check_id}`));
    const toInsert = GCP_AUTO_ASSOCIATIONS
      .filter((a) => !seen.has(`${a.scf_control_id}::${a.check_id}`))
      .map((a) => ({ ...a, nn_ctl_name: null, created_by: req.userEmail || 'auto-seed' }));

    if (toInsert.length) {
      const { error } = await supabaseAdmin.from('control_check_associations').insert(toInsert);
      if (error) throw error;
    }
    res.json({ inserted: toInsert.length, attempted: GCP_AUTO_ASSOCIATIONS.length });
  } catch (err) {
    console.error('[control-checks] auto-assign error:', err);
    res.status(500).json({ message: err.message });
  }
});

export const controlChecksRouter = router;
