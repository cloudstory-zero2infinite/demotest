import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/compliance/scoring-trend
 * Returns the historical scoring snapshots for the user's current organization.
 */
router.get('/scoring-trend', requireAuth, async (req, res) => {
  try {
    const { range = '1week' } = req.query;
    const orgId = req.orgId;

    if (!orgId) {
      return res.status(400).json({ message: 'Organization context missing.' });
    }

    // Determine how many days of history to fetch
    let days = 7;
    switch (range) {
      case '1day': days = 1; break;
      case '1week': days = 7; break;
      case '1month': days = 30; break;
      case '1quarter': days = 90; break;
      case '1year': days = 365; break;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    const { data, error } = await supabaseAdmin
      .from('scoring_history')
      .select('*')
      .eq('org_id', orgId)
      .gte('snapshot_date', cutoffStr)
      .order('snapshot_date', { ascending: true });

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching scoring trend:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * POST /api/compliance/trigger-snapshot
 * Manually triggers the Supabase SQL function.
 * Only available to admins/tenant_admins.
 */
router.post('/trigger-snapshot', requireAuth, async (req, res) => {
  try {
    if (!['admin', 'tenant_admin'].includes(req.userRole)) {
      return res.status(403).json({ message: 'Only admins can trigger snapshots.' });
    }

    // Call the PostgreSQL function directly
    const { error } = await supabaseAdmin.rpc('record_daily_scores');
    
    if (error) throw error;

    res.json({ message: 'Snapshot job triggered successfully in Supabase.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export { router as scoringRouter };

