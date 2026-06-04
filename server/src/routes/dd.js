// Due Diligence & TPRM — Express proxy to the ai-agent FastAPI service.
//
// The frontend hits Express (which knows the user's JWT + org_id from
// requireAuth); Express forwards to the ai-agent with org_id baked in. The
// ai-agent reads Supabase directly and returns answers. Nothing is persisted.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const AI_AGENT_URL = process.env.AI_AGENT_URL || 'http://localhost:8080';

async function proxy(path, body, res) {
  const upstream = await fetch(`${AI_AGENT_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return res.status(upstream.status).json(payload);
  }
  res.json(payload);
}

// ── POST /answer-questionnaire — auto-answer an uploaded questionnaire ──────
router.post('/answer-questionnaire', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) {
      return res.status(400).json({ message: 'No organisation found for user.' });
    }
    const { headers, rows, question_column } = req.body || {};
    await proxy(
      '/dd/answer-questionnaire',
      { org_id: req.orgId, headers, rows, question_column: question_column || null },
      res,
    );
  } catch (err) {
    console.error('[dd/answer-questionnaire] error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ── POST /ask — short Q&A about the org's security posture ──────────────────
router.post('/ask', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) {
      return res.status(400).json({ message: 'No organisation found for user.' });
    }
    const { question, history } = req.body || {};
    await proxy('/dd/ask', { org_id: req.orgId, question, history: history || null }, res);
  } catch (err) {
    console.error('[dd/ask] error:', err);
    res.status(500).json({ message: err.message });
  }
});

export { router as ddRouter };
