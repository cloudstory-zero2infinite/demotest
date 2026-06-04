// Fw-ControlRegistry Agent — Express proxy to the ai-agent FastAPI service.
//
// The frontend hits the Express backend (which knows the user's JWT and
// org_id from requireAuth); Express forwards to ai-agent with the org_id
// baked in. ai-agent then talks to Supabase directly to compute the diff /
// apply the rewrite of standard control_registry rows.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const AI_AGENT_URL = process.env.AI_AGENT_URL || 'http://localhost:8080';

async function proxy(path, req, res) {
  try {
    if (!req.orgId) {
      return res.status(400).json({ message: 'No organisation found for user.' });
    }
    const upstream = await fetch(`${AI_AGENT_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: req.orgId }),
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return res.status(upstream.status).json(payload);
    res.json(payload);
  } catch (err) {
    console.error(`[fwcr ${path}] error:`, err);
    res.status(500).json({ message: err.message });
  }
}

// Dry-run: returns the add/update/delete diff without writing.
router.post('/recompute-preview', requireAuth, (req, res) => proxy('/fwcr/recompute-preview', req, res));

// Applies the diff. Caller should usually call /recompute-preview first.
router.post('/recompute', requireAuth, (req, res) => proxy('/fwcr/recompute', req, res));

export { router as fwcrRouter };
