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

export { router as scfFrameworksRouter };
