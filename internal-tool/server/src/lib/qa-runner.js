import { spawn } from 'child_process';
import { chromium } from '@playwright/test';
import archiver from 'archiver';
import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Repo root holds e2e/specs + playwright.config.ts + the root node_modules that
// has @playwright/test installed. In the monorepo it's four levels up from
// this file (internal-tool/server/src/lib). In the container we override with
// E2E_ROOT so the layout can differ.
export const E2E_ROOT =
  process.env.E2E_ROOT || path.resolve(__dirname, '../../../../');

const SPECS_DIR = path.join(E2E_ROOT, 'e2e', 'specs');
const AUTH_FILE = path.join(E2E_ROOT, 'e2e', 'fixtures', 'user.json');

// Target URLs per environment. Override via PREPROD_BASE_URL / PROD_BASE_URL.
// Same E2E_EMAIL/E2E_PASSWORD authenticate against both (shared Supabase project).
export const PREPROD_BASE_URL =
  process.env.PREPROD_BASE_URL ||
  'https://pre-prod-987276481381.asia-south1.run.app';
export const PROD_BASE_URL = process.env.PROD_BASE_URL || ''; // set once the prod URL is known

export const ENVIRONMENTS = ['pre-prod', 'prod'];

// Resolve the base URL for an environment; throws if prod is picked but unset.
export function baseUrlForEnv(environment) {
  if (environment === 'prod') {
    if (!PROD_BASE_URL) {
      const err = new Error('PROD_BASE_URL is not configured on the server.');
      err.code = 'NO_PROD_URL';
      throw err;
    }
    return PROD_BASE_URL;
  }
  return PREPROD_BASE_URL;
}

// Where per-run artifacts (html report + results.json) are written.
const RUNS_DIR = path.join(os.tmpdir(), 'qa-runs');

// In-memory registry of runs. Live-only — nothing persisted to a DB.
// Map<runId, RunRecord>. Surviving only as long as this process does, which is
// why the deployed service must be pinned to a single Cloud Run instance.
const runs = new Map();
let activeRunId = null;

// Keep at most this many finished runs (and their report dirs) around.
const MAX_RETAINED_RUNS = 10;

/** List the test suites = immediate subfolders of e2e/specs. */
export async function listSuites() {
  let entries;
  try {
    entries = await fsp.readdir(SPECS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const suites = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = path.join(SPECS_DIR, e.name);
    let specCount = 0;
    try {
      const files = await fsp.readdir(dir);
      specCount = files.filter((f) => /\.spec\.[tj]s$/.test(f)).length;
    } catch {
      /* ignore */
    }
    suites.push({ id: e.name, name: e.name, specFiles: specCount });
  }
  suites.sort((a, b) => a.name.localeCompare(b.name));
  return suites;
}

// Cache the (relatively slow) `--list` enumeration for a short window.
let testsCache = null; // { at: number, tests: [...] }
const TESTS_CACHE_MS = 5 * 60 * 1000;

/**
 * Enumerate every test case without running anything (`playwright test --list`).
 * Returns a flat array: [{ id, suite, title }], grouped on the frontend.
 * The `id` is stable and matches the id in run reports, so statuses merge by id.
 */
export async function listTests({ force = false } = {}) {
  if (!force && testsCache && Date.now() - testsCache.at < TESTS_CACHE_MS) {
    return testsCache.tests;
  }
  const jsonFile = path.join(os.tmpdir(), `qa-list-${crypto.randomUUID()}.json`);
  try {
    await runToCompletion(
      ['playwright', 'test', '--list', '--reporter=json'],
      { PLAYWRIGHT_JSON_OUTPUT_NAME: jsonFile }
    );
    const report = JSON.parse(await fsp.readFile(jsonFile, 'utf8'));
    const tests = [];
    const walk = (suite, file) => {
      const f = suite.file || file || '';
      const suiteId = f.split('/')[0] || f;
      for (const spec of suite.specs || []) {
        tests.push({ id: spec.id, suite: suiteId, title: spec.title });
      }
      for (const child of suite.suites || []) walk(child, f);
    };
    for (const top of report.suites || []) walk(top, top.file);
    testsCache = { at: Date.now(), tests };
    return tests;
  } finally {
    await fsp.rm(jsonFile, { force: true }).catch(() => {});
  }
}

/** Spawn npx playwright and resolve when it exits (ignoring non-zero codes). */
function runToCompletion(args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', args, {
      cwd: E2E_ROOT,
      env: { ...process.env, ...extraEnv },
    });
    child.stdout.on('data', () => {});
    child.stderr.on('data', () => {});
    child.on('error', reject);
    child.on('close', () => resolve());
  });
}

/** Public view of a run record (omits internal handles). */
export function publicRun(run) {
  if (!run) return null;
  return {
    runId: run.runId,
    suite: run.suite,
    environment: run.environment,
    status: run.status, // running | passed | failed | error
    baseUrl: run.baseUrl,
    version: run.version,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    summary: run.summary, // { total, passed, failed, skipped, flaky, durationMs }
    failures: run.failures, // [{ suite, title, error }]
    // Strip the server-side screenshot path before sending to the client.
    tests: (run.tests || []).map(({ screenshot, ...t }) => t),
    progress: run.progress, // { total, completed } while running
    error: run.error || null,
    hasReport: !!run.reportReady,
  };
}

export function getRun(runId) {
  return runs.get(runId) || null;
}

/**
 * Public view that, while a run is in flight, merges live per-test progress
 * tailed from the streaming reporter's JSONL file. Once finished, the
 * authoritative parsed results already populate the run record.
 */
export async function getRunView(runId) {
  const run = runs.get(runId);
  if (!run) return null;
  const view = publicRun(run);
  if (run.status === 'running') {
    const prog = await readProgress(run.progressFile);
    if (prog) {
      view.tests = prog.tests; // [{ suite, title, status, durationMs }]
      view.progress = { total: prog.total, completed: prog.tests.length };
      view.summary = {
        total: prog.total || prog.tests.length,
        passed: prog.tests.filter((t) => t.status === 'passed').length,
        failed: prog.tests.filter((t) => t.status === 'failed').length,
        skipped: prog.tests.filter((t) => t.status === 'skipped').length,
        flaky: 0,
        durationMs: 0,
      };
    }
  }
  return view;
}

/** Tail the streaming reporter's JSONL progress file. */
async function readProgress(progressFile) {
  let raw;
  try {
    raw = await fsp.readFile(progressFile, 'utf8');
  } catch {
    return null;
  }
  let total = 0;
  const tests = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let evt;
    try {
      evt = JSON.parse(line);
    } catch {
      continue;
    }
    if (evt.type === 'begin') total = evt.total || 0;
    else if (evt.type === 'test') {
      tests.push({
        suite: evt.suite,
        title: evt.title,
        status: evt.status,
        durationMs: evt.durationMs || 0,
      });
    }
  }
  return { total, tests };
}

export function isBusy() {
  return !!activeRunId;
}

/**
 * Start a Playwright run against pre-prod.
 * @param {string} suiteId  a suite folder name, or "all" for the full suite.
 * @returns {RunRecord}
 */
export async function startRun(suiteId, environment = 'pre-prod') {
  if (activeRunId) {
    const err = new Error('A run is already in progress.');
    err.code = 'BUSY';
    throw err;
  }

  if (!ENVIRONMENTS.includes(environment)) {
    const err = new Error(`Unknown environment: ${environment}`);
    err.code = 'BAD_ENV';
    throw err;
  }
  const baseUrl = baseUrlForEnv(environment); // throws NO_PROD_URL if prod unset

  // Validate the suite id against the real folder list to avoid arg injection.
  let specArg = null; // null => whole testDir (run all)
  if (suiteId && suiteId !== 'all') {
    const suites = await listSuites();
    if (!suites.some((s) => s.id === suiteId)) {
      const err = new Error(`Unknown suite: ${suiteId}`);
      err.code = 'BAD_SUITE';
      throw err;
    }
    specArg = path.join('e2e', 'specs', suiteId);
  }

  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    const err = new Error(
      'E2E_EMAIL / E2E_PASSWORD are not configured on the server.'
    );
    err.code = 'NO_CREDS';
    throw err;
  }

  const runId = crypto.randomUUID();
  const runDir = path.join(RUNS_DIR, runId);
  const reportDir = path.join(runDir, 'html');
  const jsonFile = path.join(runDir, 'results.json');
  const progressFile = path.join(runDir, 'progress.jsonl');
  await fsp.mkdir(runDir, { recursive: true });

  // Fresh login against pre-prod: a stale local session (e.g. from a localhost
  // run) is invalid for the pre-prod domain. Mirrors the test:preprod script.
  await fsp.rm(AUTH_FILE, { force: true }).catch(() => {});

  const run = {
    runId,
    suite: suiteId || 'all',
    environment,
    status: 'running',
    baseUrl,
    version: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    summary: null,
    failures: [],
    tests: [],
    error: null,
    progress: null, // { total, completed } — live while running
    runDir,
    reportDir,
    jsonFile,
    progressFile,
    reportReady: false,
    proc: null,
  };
  runs.set(runId, run);
  activeRunId = runId;
  pruneOldRuns();

  const progressReporter = path.join('e2e', 'reporters', 'qa-progress.cjs');
  const args = ['playwright', 'test'];
  if (specArg) args.push(specArg);
  args.push(`--reporter=html,json,${progressReporter}`);

  const child = spawn('npx', args, {
    cwd: E2E_ROOT,
    env: {
      ...process.env,
      BASE_URL: baseUrl,
      LOGIN_MODE: 'email',
      E2E_EMAIL: email,
      E2E_PASSWORD: password,
      CI: 'true', // forces headless in playwright.config.ts
      QA_SCREENSHOTS: 'on', // capture a screenshot per test (pass + fail) for the report
      PLAYWRIGHT_HTML_REPORT: reportDir,
      PLAYWRIGHT_HTML_OPEN: 'never',
      PLAYWRIGHT_JSON_OUTPUT_NAME: jsonFile,
      QA_PROGRESS_FILE: progressFile,
    },
  });
  run.proc = child;

  let stderrTail = '';
  child.stderr.on('data', (d) => {
    stderrTail = (stderrTail + d.toString()).slice(-4000);
  });
  // Drain stdout so the buffer never blocks the child.
  child.stdout.on('data', () => {});

  child.on('error', (e) => {
    finishRun(run, { crashed: true, message: e.message });
  });

  child.on('close', async () => {
    try {
      await parseResults(run, jsonFile);
      await organizeScreenshots(run);
      run.reportReady = fs.existsSync(path.join(reportDir, 'index.html'));
      // Probe the deployed app version using the session the run just created.
      run.version = await captureVersion(run.baseUrl).catch(() => null);
      finishRun(run, { crashed: false, message: stderrTail });
    } catch (e) {
      finishRun(run, { crashed: true, message: e.message || stderrTail });
    }
  });

  return run;
}

function finishRun(run, { crashed, message }) {
  run.finishedAt = new Date().toISOString();
  run.proc = null;
  if (crashed && !run.summary) {
    run.status = 'error';
    run.error = message || 'Test runner crashed before producing results.';
  } else if (run.summary && run.summary.failed > 0) {
    run.status = 'failed';
  } else if (run.summary) {
    run.status = 'passed';
  } else {
    run.status = 'error';
    run.error = message || 'No results were produced.';
  }
  if (activeRunId === run.runId) activeRunId = null;
}

/** Parse the Playwright JSON report into a compact summary + failure briefs. */
async function parseResults(run, jsonFile) {
  let raw;
  try {
    raw = await fsp.readFile(jsonFile, 'utf8');
  } catch {
    return; // no json — finishRun will mark it an error
  }
  const report = JSON.parse(raw);

  const failures = [];
  const testList = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let flaky = 0;

  const walk = (suite, file) => {
    const f = suite.file || file || '';
    // Group key = the suite folder (matches e2e/specs/<id> and listSuites()).
    const suiteId = f.split('/')[0] || f;
    for (const spec of suite.specs || []) {
      const tests = spec.tests || [];
      const statuses = tests.flatMap((t) =>
        (t.results || []).map((r) => r.status)
      );
      const isSkipped =
        statuses.length > 0 && statuses.every((s) => s === 'skipped');
      const lastFailed = tests.some((t) => {
        const last = (t.results || [])[t.results.length - 1];
        return last && (last.status === 'failed' || last.status === 'timedOut');
      });
      const wasFlaky = tests.some((t) => t.status === 'flaky');
      const durationMs = Math.round(
        tests.reduce((m, t) => {
          const last = (t.results || [])[t.results.length - 1];
          return Math.max(m, last?.duration || 0);
        }, 0)
      );

      let status;
      if (isSkipped) {
        status = 'skipped';
        skipped++;
      } else if (spec.ok === false || lastFailed) {
        status = 'failed';
        failed++;
      } else if (wasFlaky) {
        status = 'flaky';
        passed++;
        flaky++;
      } else {
        status = 'passed';
        passed++;
      }

      const error = status === 'failed' ? extractError(tests) : undefined;
      if (status === 'failed') {
        failures.push({ suite: suiteId, title: spec.title, error });
      }
      testList.push({
        id: spec.id,
        suite: suiteId,
        title: spec.title,
        status,
        durationMs,
        error,
        screenshot: screenshotOf(tests), // abs path, stripped before sending to client
      });
    }
    for (const child of suite.suites || []) {
      walk(child, f);
    }
  };

  for (const top of report.suites || []) {
    walk(top, top.file);
  }

  const stats = report.stats || {};
  run.summary = {
    total: passed + failed + skipped,
    passed,
    failed,
    skipped,
    flaky,
    durationMs: Math.round(stats.duration || 0),
  };
  run.failures = failures;
  run.tests = testList;
}

function extractError(tests) {
  for (const t of tests) {
    for (const r of t.results || []) {
      const e = r.error || (r.errors && r.errors[0]);
      if (e && (e.message || e.value)) {
        const msg = stripAnsi(e.message || e.value);
        // First few meaningful lines keep the brief readable.
        return msg.split('\n').slice(0, 4).join('\n').trim();
      }
    }
  }
  return 'Test failed (no error message captured).';
}

// Derive a short, recognizable slug from a test title for screenshot filenames.
// Drops the describe-prefix before the first colon (redundant with the suite
// folder) and a leading "should", then caps at a word boundary (~60 chars).
function mainTestName(title) {
  let s = String(title || '');
  const colon = s.indexOf(':');
  if (colon !== -1) s = s.slice(colon + 1);
  s = s.replace(/^\s*should\s+/i, '').trim();
  let slug = s.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  if (slug.length > 60) {
    slug = slug.slice(0, 60);
    const lastU = slug.lastIndexOf('_');
    if (lastU > 30) slug = slug.slice(0, lastU); // avoid cutting mid-word
  }
  return slug || 'test';
}

// Find the final-state screenshot attachment for a spec (last result wins).
function screenshotOf(tests) {
  for (let i = tests.length - 1; i >= 0; i--) {
    const results = tests[i].results || [];
    for (let j = results.length - 1; j >= 0; j--) {
      const shot = (results[j].attachments || []).find(
        (a) => a.name === 'screenshot' && a.path
      );
      if (shot) return shot.path;
    }
  }
  return null;
}

/**
 * Copy each test's screenshot into <runDir>/screenshots/{passed,failed}/<name>.png
 * so the zip carries them as plain, status-segregated files (flaky counts as
 * passed; skipped tests have no screenshot). Sets run.screenshotsDir.
 */
async function organizeScreenshots(run) {
  const base = path.join(run.runDir, 'screenshots');
  const used = new Set();
  let count = 0;
  for (const t of run.tests || []) {
    if (!t.screenshot) continue;
    const folder = t.status === 'failed' ? 'failed' : 'passed';
    const stem = `${t.suite}__${mainTestName(t.title)}`;
    let fname = `${stem}.png`;
    let n = 1;
    while (used.has(`${folder}/${fname}`)) fname = `${stem}_${n++}.png`;
    used.add(`${folder}/${fname}`);
    const dest = path.join(base, folder, fname);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.copyFile(t.screenshot, dest).catch(() => {});
    count++;
  }
  run.screenshotsDir = count > 0 ? base : null;
}

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return String(s).replace(/\[[0-9;]*m/g, '');
}

/**
 * Launch a headless browser with the run's saved session and read the build
 * version from the app header (components/Header.tsx renders it in a span
 * with title="Build <version>").
 */
async function captureVersion(baseUrl = PREPROD_BASE_URL) {
  if (!fs.existsSync(AUTH_FILE)) return null;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ storageState: AUTH_FILE });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const badge = page.locator('span[title^="Build "]').first();
    await badge.waitFor({ state: 'visible', timeout: 20000 });
    const text = (await badge.textContent())?.trim();
    return text || null;
  } finally {
    await browser.close().catch(() => {});
  }
}

/** Stream the HTML report folder as a zip into `res`. */
export function streamReportZip(run, res) {
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    if (!res.headersSent) res.status(500);
    res.end(`archive error: ${err.message}`);
  });
  archive.pipe(res);
  // Self-describing metadata so the zip itself states which pre-prod build was
  // tested — required for the "tests ran on this version" report.
  archive.append(JSON.stringify(buildSummary(run), null, 2), {
    name: 'qa-summary.json',
  });
  archive.append(buildSummaryText(run), { name: 'qa-summary.txt' });
  archive.directory(run.reportDir, 'playwright-report');
  // Status-segregated screenshots at the zip root: passed/ and failed/.
  if (run.screenshotsDir) archive.directory(run.screenshotsDir, false);
  archive.finalize();
}

/** Machine-readable run summary embedded in the zip. */
function buildSummary(run) {
  return {
    suite: run.suite,
    preprodBaseUrl: run.baseUrl,
    preprodVersion: run.version, // the build hash read from the app header
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    summary: run.summary,
    tests: (run.tests || []).map((t) => ({
      suite: t.suite,
      title: t.title,
      status: t.status,
      durationMs: t.durationMs,
    })),
  };
}

/** Human-readable run summary embedded in the zip. */
function buildSummaryText(run) {
  const s = run.summary || {};
  const lines = [
    'ZTI E2E Test Report',
    '===================',
    `Pre-prod build : ${run.version || 'unknown'}`,
    `Target URL     : ${run.baseUrl}`,
    `Suite          : ${run.suite}`,
    `Status         : ${run.status}`,
    `Started        : ${run.startedAt}`,
    `Finished       : ${run.finishedAt || '—'}`,
    '',
    `Total ${s.total ?? 0} | Passed ${s.passed ?? 0} | Failed ${s.failed ?? 0} | Skipped ${s.skipped ?? 0}`,
    '',
    'Test cases:',
    ...(run.tests || []).map(
      (t) => `  [${t.status.toUpperCase()}] ${t.suite} › ${t.title}`
    ),
  ];
  return lines.join('\n');
}

/** Drop the oldest finished runs (and their on-disk reports) past the cap. */
function pruneOldRuns() {
  const finished = [...runs.values()]
    .filter((r) => r.status !== 'running')
    .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
  while (finished.length > MAX_RETAINED_RUNS) {
    const old = finished.shift();
    runs.delete(old.runId);
    fsp.rm(old.runDir, { recursive: true, force: true }).catch(() => {});
  }
}
