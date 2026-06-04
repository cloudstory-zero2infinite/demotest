import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const BUCKET = process.env.SCF_REFERENCE_BUCKET || 'scf-reference';
const DOMAINS_SHEET = 'SCF Domains & Principles';
const CONTROLS_SHEET = 'SCF 2026.1';

// Framework columns in SCF 2026.1 sit between these indices (inclusive). Cols
// 0–11 are structured (Domain / Control / SCF# / Description / etc.), 12–32
// are SCF's own scoring/classification layers (SCRM, CMM, CORE), and 283+ are
// the Risk / Threat catalogs. 33–282 are the external framework mapping cols.
const FW_COL_START = 33;
const FW_COL_END   = 282;

// Common framework shortlist, matched against the normalised `display_name`
// (case-sensitive). The raw header text in the sheet uses inconsistent
// separators ('\r\n', ' | ', plain ' '), so matching against display_name is
// stable across formatting drift. Misses are silently ignored — a future SCF
// rename just means the chip won't light up until this constant is updated.
const COMMON_DISPLAY_NAMES = new Set([
  'ISO 27001 2022',
  'NIST CSF 2.0',
  'NIST 800-53 R5',
  'AICPA TSC 2017:2022 (used for SOC 2)',
  'CIS CSC 8.1',
  'ISO 42001 2023',
  'PCI DSS 4.0.1',
  'EMEA EU GDPR',
]);

function toDisplayName(raw) {
  // Collapse pipe separators, all whitespace (incl. \r\n / nbsp), into single
  // spaces. "ISO\r\n27001 | 2022" → "ISO 27001 2022".
  return String(raw)
    .replace(/ /g, ' ')
    .replace(/\s*\|\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function deriveRegion(displayName) {
  // Region prefix lives in the FIRST whitespace-delimited token of the
  // normalised display name (e.g. "EMEA EU GDPR" → "EMEA"). 'US' is matched
  // exactly so we don't catch unrelated names that start with "US".
  const first = displayName.split(' ')[0];
  if (first === 'EMEA' || first === 'APAC' || first === 'Americas') return first;
  if (first === 'US' || first === 'US-CA' || first === 'US-NY' || displayName.startsWith('US -') || displayName.startsWith('US ')) return 'US';
  return 'Global';
}

function toCleanString(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/ /g, ' ').trim();
  return s.length ? s : null;
}

function toCleanInt(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(String(v).replace(/ /g, '').trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function parseDomainsSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const scfId = toCleanString(r[2]);
    const domainName = toCleanString(r[1]);
    if (!scfId || !domainName) continue;
    out.push({
      scf_id: scfId,
      domain_name: domainName,
      principle: toCleanString(r[3]),
      principle_intent: toCleanString(r[4]),
      control_count: toCleanInt(r[5]),
      sort_order: toCleanInt(r[0]),
    });
  }
  return out;
}

function parseControlsSheet(ws, validScfIds) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  const header = (rows[0] || []).map((h) => (h ? String(h) : ''));
  const idx = (needle) => header.findIndex((h) => h && h.toLowerCase().includes(needle.toLowerCase()));
  const COL_DOMAIN_LABEL = idx('scf domain');
  const COL_CONTROL_NAME = idx('scf control');
  const COL_SCF_NUM = idx('scf #');
  const COL_DESC = idx('control description');
  const COL_CADENCE = idx('conformity validation');
  const COL_ERL = idx('evidence request list');
  const COL_QUESTION = idx('scf control question');

  if (COL_SCF_NUM < 0) {
    throw new Error(`Could not locate "SCF #" column in ${CONTROLS_SHEET}`);
  }

  const out = [];
  const skipped = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const scfControlId = toCleanString(r[COL_SCF_NUM]);
    if (!scfControlId || !scfControlId.includes('-')) continue;
    const scfId = scfControlId.split('-')[0].trim();
    if (!validScfIds.has(scfId)) {
      skipped.push({ scfControlId, scfId });
      continue;
    }
    out.push({
      scf_control_id: scfControlId,
      scf_id: scfId,
      scf_domain_label: COL_DOMAIN_LABEL >= 0 ? toCleanString(r[COL_DOMAIN_LABEL]) : null,
      control_name: COL_CONTROL_NAME >= 0 ? toCleanString(r[COL_CONTROL_NAME]) : null,
      control_description: COL_DESC >= 0 ? toCleanString(r[COL_DESC]) : null,
      conformity_cadence: COL_CADENCE >= 0 ? toCleanString(r[COL_CADENCE]) : null,
      erl_refs: COL_ERL >= 0 ? toCleanString(r[COL_ERL]) : null,
      control_question: COL_QUESTION >= 0 ? toCleanString(r[COL_QUESTION]) : null,
    });
  }
  return { controls: out, skipped };
}

// Parses the framework-mapping columns of the controls sheet. Returns:
//   frameworks: [{ name, display_name, region, sort_order, is_common }, ...]
//   junction:   [{ scf_control_id, framework_name, mapping_refs }, ...]
// Only emits a framework if at least one cell in that column is non-empty —
// keeps the catalog tight (some columns in older SCF releases are entirely
// blank placeholders).
function parseFrameworkMappings(ws, validControlIds) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  const header = (rows[0] || []).map((h) => (h ? String(h) : ''));
  const idxNum = header.findIndex((h) => h && h.toLowerCase().includes('scf #'));
  if (idxNum < 0) throw new Error(`Could not locate "SCF #" column for framework parsing`);

  const fwColEnd = Math.min(FW_COL_END, header.length - 1);
  const fwHeaders = [];
  for (let c = FW_COL_START; c <= fwColEnd; c++) {
    const raw = header[c];
    if (raw === null || raw === undefined || String(raw).trim() === '') continue;
    const display = toDisplayName(raw);
    if (!display) continue;
    fwHeaders.push({
      col: c,
      // Use the normalised display name as the canonical PK. Storing the raw
      // sheet bytes as the key is fragile — the same framework can appear with
      // different whitespace across SCF releases ('\r\n' vs ' | ').
      name: display,
      display_name: display,
      region: deriveRegion(display),
      sort_order: c,
    });
  }

  const seenFw = new Set();            // framework names that have ≥1 mapping
  const junction = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const cid = toCleanString(r[idxNum]);
    if (!cid || !cid.includes('-')) continue;
    if (!validControlIds.has(cid)) continue;        // domain-prefix filtered out earlier
    for (const fw of fwHeaders) {
      const cell = r[fw.col];
      if (cell === null || cell === undefined) continue;
      const s = String(cell).trim();
      if (!s) continue;
      seenFw.add(fw.name);
      junction.push({
        scf_control_id: cid,
        framework_name: fw.name,
        mapping_refs: s,
      });
    }
  }

  const frameworks = fwHeaders
    .filter((fw) => seenFw.has(fw.name))
    .map((fw) => ({
      name: fw.name,
      display_name: fw.display_name,
      region: fw.region,
      sort_order: fw.sort_order,
      is_common: COMMON_DISPLAY_NAMES.has(fw.display_name),
    }));

  return { frameworks, junction };
}

async function syncDbFromParsed(domains, controls, frameworks, junction) {
  // Delete order matters because of the FKs:
  //   scf_control_frameworks → scf_controls, scf_frameworks
  //   scf_controls           → scf_domains
  // Children first.
  const delCf = await supabaseAdmin.from('scf_control_frameworks').delete().neq('scf_control_id', '__never__');
  if (delCf.error) throw new Error(`wipe scf_control_frameworks: ${delCf.error.message}`);
  const delFw = await supabaseAdmin.from('scf_frameworks').delete().neq('name', '__never__');
  if (delFw.error) throw new Error(`wipe scf_frameworks: ${delFw.error.message}`);
  const delC = await supabaseAdmin.from('scf_controls').delete().neq('scf_control_id', '__never__');
  if (delC.error) throw new Error(`wipe scf_controls: ${delC.error.message}`);
  const delD = await supabaseAdmin.from('scf_domains').delete().neq('scf_id', '__never__');
  if (delD.error) throw new Error(`wipe scf_domains: ${delD.error.message}`);

  if (domains.length) {
    const insD = await supabaseAdmin.from('scf_domains').insert(domains);
    if (insD.error) throw new Error(`insert scf_domains: ${insD.error.message}`);
  }

  const CHUNK = 500;
  for (let i = 0; i < controls.length; i += CHUNK) {
    const slice = controls.slice(i, i + CHUNK);
    const insC = await supabaseAdmin.from('scf_controls').insert(slice);
    if (insC.error) throw new Error(`insert scf_controls (chunk ${i}): ${insC.error.message}`);
  }

  if (frameworks.length) {
    // scf_frameworks is small (≤ 250 rows), single batch is fine.
    const insF = await supabaseAdmin.from('scf_frameworks').insert(frameworks);
    if (insF.error) throw new Error(`insert scf_frameworks: ${insF.error.message}`);
  }

  // Junction can run to tens of thousands of rows. Chunk to keep individual
  // requests under the Supabase REST limit.
  const J_CHUNK = 1000;
  for (let i = 0; i < junction.length; i += J_CHUNK) {
    const slice = junction.slice(i, i + J_CHUNK);
    const insJ = await supabaseAdmin.from('scf_control_frameworks').insert(slice);
    if (insJ.error) throw new Error(`insert scf_control_frameworks (chunk ${i}): ${insJ.error.message}`);
  }
}

// List files in the SCF bucket + current parsed counts.
router.get('/', requireAuth, async (_req, res) => {
  try {
    const { data: files, error: listErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .list('', { limit: 1000, sortBy: { column: 'updated_at', order: 'desc' } });
    if (listErr) throw listErr;

    const fileList = (files || [])
      .filter((f) => f.name && !f.name.endsWith('/'))
      .map((f) => ({
        name: f.name,
        size: f.metadata?.size || 0,
        contentType: f.metadata?.mimetype || null,
        createdAt: f.created_at || null,
        updatedAt: f.updated_at || f.created_at || null,
      }));

    const [
      { count: domainCount },
      { count: controlCount },
      { count: frameworkCount },
      { count: junctionCount },
    ] = await Promise.all([
      supabaseAdmin.from('scf_domains').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('scf_controls').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('scf_frameworks').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('scf_control_frameworks').select('*', { count: 'exact', head: true }),
    ]);

    res.json({
      files: fileList,
      counts: {
        domains: domainCount || 0,
        controls: controlCount || 0,
        frameworks: frameworkCount || 0,
        control_framework_pairs: junctionCount || 0,
      },
    });
  } catch (err) {
    console.error('[control-framework] list error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Return the parsed 33 domains for preview.
router.get('/domains', requireAuth, async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('scf_domains')
      .select('scf_id, domain_name, principle, principle_intent, control_count, sort_order')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[control-framework] domains error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Upload a new SCF xlsx. Parses both sheets, uploads file to bucket, wipes+repopulates DB.
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'file field is required' });

    const lower = (req.file.originalname || '').toLowerCase();
    if (!lower.endsWith('.xlsx') && !lower.endsWith('.xlsm')) {
      return res.status(400).json({ message: 'Only .xlsx / .xlsm files are accepted' });
    }

    let wb;
    try {
      wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    } catch (e) {
      return res.status(400).json({ message: `Could not parse workbook: ${e.message}` });
    }

    const domainsWs = wb.Sheets[DOMAINS_SHEET];
    const controlsWs = wb.Sheets[CONTROLS_SHEET];
    if (!domainsWs) return res.status(400).json({ message: `Missing required sheet: "${DOMAINS_SHEET}"` });
    if (!controlsWs) return res.status(400).json({ message: `Missing required sheet: "${CONTROLS_SHEET}"` });

    const domains = parseDomainsSheet(domainsWs);
    if (!domains.length) return res.status(400).json({ message: `No domain rows parsed from "${DOMAINS_SHEET}"` });

    const validIds = new Set(domains.map((d) => d.scf_id));
    const { controls, skipped } = parseControlsSheet(controlsWs, validIds);
    const validControlIds = new Set(controls.map((c) => c.scf_control_id));
    const { frameworks, junction } = parseFrameworkMappings(controlsWs, validControlIds);

    // 1. Upload file to bucket (file is the SME-facing source of truth).
    const name = req.file.originalname;
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(name, req.file.buffer, {
      contentType: req.file.mimetype || 'application/octet-stream',
      upsert: true,
    });
    if (upErr) throw new Error(`storage upload: ${upErr.message}`);

    // 2. Sync DB tables. If this fails the file is preserved in the bucket and SME can retry.
    await syncDbFromParsed(domains, controls, frameworks, junction);

    res.status(201).json({
      name,
      counts: {
        domains: domains.length,
        controls: controls.length,
        frameworks: frameworks.length,
        control_framework_pairs: junction.length,
      },
      skipped_controls: skipped.length,
      skipped_sample: skipped.slice(0, 10),
    });
  } catch (err) {
    console.error('[control-framework] upload error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Download a stored xlsx.
router.get('/:name/download', requireAuth, async (req, res) => {
  try {
    const { name } = req.params;
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(name);
    if (error) throw error;
    const buf = Buffer.from(await data.arrayBuffer());
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(buf);
  } catch (err) {
    console.error('[control-framework] download error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Delete a stored xlsx. Does NOT touch the DB — call POST again to re-sync from a different file.
router.delete('/:name', requireAuth, async (req, res) => {
  try {
    const { name } = req.params;
    const { error } = await supabaseAdmin.storage.from(BUCKET).remove([name]);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    console.error('[control-framework] delete error:', err);
    res.status(500).json({ message: err.message });
  }
});

export const controlFrameworkRouter = router;
