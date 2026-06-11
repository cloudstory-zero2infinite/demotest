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
      .select('id, scf_control_id, check_id, created_by, created_at');
    if (req.query.scf_control_id) q = q.eq('scf_control_id', req.query.scf_control_id);
    const { data, error } = await q.order('scf_control_id', { ascending: true });
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
        scf_control_id: r.scf_control_id,
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

// Attach a check to an SCF control.
router.post('/associations', requireAuth, async (req, res) => {
  try {
    const { scf_control_id, check_id } = req.body || {};
    if (!scf_control_id || !check_id) {
      return res.status(400).json({ message: 'scf_control_id and check_id are required' });
    }
    const { data, error } = await supabaseAdmin
      .from('control_check_associations')
      .upsert(
        { scf_control_id, check_id, created_by: req.userEmail || 'sme' },
        { onConflict: 'scf_control_id,check_id', ignoreDuplicates: true }
      )
      .select('id, scf_control_id, check_id')
      .maybeSingle();
    if (error) throw error;
    res.status(201).json(data || { scf_control_id, check_id });
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
    const rows = GCP_AUTO_ASSOCIATIONS.map((a) => ({
      ...a,
      created_by: req.userEmail || 'auto-seed',
    }));
    const { data, error } = await supabaseAdmin
      .from('control_check_associations')
      .upsert(rows, { onConflict: 'scf_control_id,check_id', ignoreDuplicates: true })
      .select('id');
    if (error) throw error;
    res.json({ inserted: (data || []).length, attempted: rows.length });
  } catch (err) {
    console.error('[control-checks] auto-assign error:', err);
    res.status(500).json({ message: err.message });
  }
});

export const controlChecksRouter = router;
