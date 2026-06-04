// SCF Frameworks — read-only listing for the Settings → Organisation tab.
//
// The full framework catalog lives in public.scf_frameworks (populated by the
// internal-tool SCF upload). The picker UI uses this for both the common-chip
// row (is_common = true) and the typeahead search.

import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('scf_frameworks')
      .select('name, display_name, region, is_common, sort_order')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[scf-frameworks] list error:', err);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/scf/frameworks/controls?framework=<canonical name>
// All SCF controls claimed by the given framework, each with the framework's
// native reference IDs (scf_control_frameworks.mapping_refs, newline-separated).
// Powers the Compliance tab's "browse SCF by framework" expander.
router.get('/controls', requireAuth, async (req, res) => {
  try {
    const framework = (req.query.framework || '').toString().trim();
    if (!framework) return res.status(400).json({ message: 'framework query param required' });

    const { data: junction, error: jErr } = await supabaseAdmin
      .from('scf_control_frameworks')
      .select('scf_control_id, mapping_refs')
      .eq('framework_name', framework);
    if (jErr) throw jErr;

    const ids = [...new Set((junction || []).map(j => j.scf_control_id))];
    const ctlMap = {};
    if (ids.length) {
      const { data: ctls, error: cErr } = await supabaseAdmin
        .from('scf_controls')
        .select('scf_control_id, scf_id, control_name, scf_domain_label')
        .in('scf_control_id', ids);
      if (cErr) throw cErr;
      for (const c of ctls || []) ctlMap[c.scf_control_id] = c;
    }

    const rows = (junction || []).map(j => {
      const c = ctlMap[j.scf_control_id] || {};
      return {
        scf_control_id: j.scf_control_id,
        scf_id: c.scf_id ?? j.scf_control_id,
        control_name: c.control_name ?? '',
        domain: c.scf_domain_label ?? '',
        refs: (j.mapping_refs || '').split(/[\r\n]+/).map(s => s.trim()).filter(Boolean),
      };
    }).sort((a, b) => a.scf_control_id.localeCompare(b.scf_control_id));

    res.json(rows);
  } catch (err) {
    console.error('[scf-frameworks] controls error:', err);
    res.status(500).json({ message: err.message });
  }
});

export { router as scfFrameworksRouter };
