// Mapper Agent — Express proxy to the ai-agent FastAPI service.
//
// The frontend hits the Express backend (which knows the user's JWT and
// org_id from requireAuth); Express forwards to ai-agent with the org_id
// baked in. ai-agent then talks to Supabase + Neo4j directly.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const AI_AGENT_URL = process.env.AI_AGENT_URL || 'http://localhost:8080';

// ── POST /run — kick off the mapper for the caller's org ──────────────────
router.post('/run', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) {
      return res.status(400).json({ message: 'No organisation found for user.' });
    }
    const trigger = (req.body && req.body.trigger) || 'policies';
    const upstream = await fetch(`${AI_AGENT_URL}/mapper/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: req.orgId, trigger }),
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json(payload);
    }
    res.json(payload);
  } catch (err) {
    console.error('[mapper/run] error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ── GET /graph — read ReactFlow {nodes, edges} from Neo4j via ai-agent ────
router.get('/graph', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) {
      return res.status(400).json({ message: 'No organisation found for user.' });
    }
    const params = new URLSearchParams({ org_id: req.orgId });
    if (req.query.master_policy_id) {
      params.set('master_policy_id', String(req.query.master_policy_id));
    }
    const upstream = await fetch(`${AI_AGENT_URL}/mapper/graph?${params}`);
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json(payload);
    }
    res.json(payload);
  } catch (err) {
    console.error('[mapper/graph] error:', err);
    res.status(500).json({ message: err.message });
  }
});

export { router as mapperRouter };
