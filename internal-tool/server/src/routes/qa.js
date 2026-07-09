import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';
import {
  listSuites,
  listTests,
  startRun,
  getRun,
  getRunView,
  publicRun,
  isBusy,
  streamReportZip,
  PREPROD_BASE_URL,
} from '../lib/qa-runner.js';

const router = Router();

// Historical E2E runs recorded by the GitHub Action (table `e2e_runs`).
// Read-only — powers the "runs over time" chart in the Quality Analytics tab.
router.get('/runs', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 2000, 5000);
    const { data, error } = await supabaseAdmin
      .from('e2e_runs')
      .select('id, source, environment, app_version, total, passed, failed, skipped, flaky, success_pct, confidence, status, finished_at, created_at')
      .order('finished_at', { ascending: true })
      .limit(limit);
    if (error) throw error;
    res.json({ runs: data || [] });
  } catch (err) {
    console.error('[qa] runs error:', err);
    res.status(500).json({ message: err.message });
  }
});

// List available suites + whether a run is currently in progress.
router.get('/suites', requireAuth, async (_req, res) => {
  try {
    const suites = await listSuites();
    res.json({ baseUrl: PREPROD_BASE_URL, busy: isBusy(), suites });
  } catch (err) {
    console.error('[qa] suites error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Enumerate every test case (no run). Used to show per-suite test counts and
// each case's title before/independently of a run.
router.get('/tests', requireAuth, async (req, res) => {
  try {
    const tests = await listTests({ force: req.query.refresh === '1' });
    res.json({ tests });
  } catch (err) {
    console.error('[qa] tests error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Kick off a run. body: { suite: "<id>" | "all" }. Returns immediately.
router.post('/run', requireAuth, async (req, res) => {
  try {
    const suite = (req.body && req.body.suite) || 'all';
    const run = await startRun(suite);
    res.status(202).json(publicRun(run));
  } catch (err) {
    const map = { BUSY: 409, BAD_SUITE: 400, NO_CREDS: 503 };
    const status = map[err.code] || 500;
    if (status === 500) console.error('[qa] run error:', err);
    res.status(status).json({ message: err.message });
  }
});

// Poll a run's status + results (merges live progress while running).
router.get('/run/:runId', requireAuth, async (req, res) => {
  const view = await getRunView(req.params.runId);
  if (!view) return res.status(404).json({ message: 'Run not found' });
  res.json(view);
});

// Download the Playwright HTML report as a zip.
router.get('/run/:runId/report', requireAuth, (req, res) => {
  const run = getRun(req.params.runId);
  if (!run) return res.status(404).json({ message: 'Run not found' });
  if (!run.reportReady) {
    return res.status(409).json({ message: 'Report not ready yet' });
  }
  const fname = `qa-report-${run.suite}-${run.runId.slice(0, 8)}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  streamReportZip(run, res);
});

export const qaRouter = router;
