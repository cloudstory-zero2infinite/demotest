// Builds the E2E report email (subject + HTML) from the Playwright JSON report,
// and persists the run's outcome onto the matching release_log row (the deploy
// this E2E ran against). Run inside the e2e-postdeploy GitHub Action.
// Self-contained — only Node built-ins + @playwright/test (a dev dependency)
// for the version probe; uses global fetch (Node 18+) for the Supabase PATCH.
import fs from 'fs';
import { chromium } from '@playwright/test';

const RESULTS = process.env.RESULTS_JSON || 'results.json';
const BASE_URL = process.env.BASE_URL || '';
const RUN_URL = process.env.RUN_URL || '';
const COMMIT_SHA = process.env.COMMIT_SHA || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const AUTH_FILE = 'e2e/fixtures/user.json';

// ── Parse the Playwright JSON report into counts + failures + timings ──
function parse(report) {
  let passed = 0, failed = 0, skipped = 0, flaky = 0;
  const failures = [];
  const walk = (suite, file) => {
    const f = suite.file || file || '';
    const suiteId = f.split('/')[0] || f;
    for (const spec of suite.specs || []) {
      const tests = spec.tests || [];
      const statuses = tests.flatMap((t) => (t.results || []).map((r) => r.status));
      const isSkipped = statuses.length > 0 && statuses.every((s) => s === 'skipped');
      const lastFailed = tests.some((t) => {
        const last = (t.results || []).slice(-1)[0];
        return last && (last.status === 'failed' || last.status === 'timedOut');
      });
      const wasFlaky = tests.some((t) => t.status === 'flaky');
      if (isSkipped) skipped++;
      else if (spec.ok === false || lastFailed) {
        failed++;
        failures.push({ suite: suiteId, title: spec.title });
      } else {
        passed++;
        if (wasFlaky) flaky++;
      }
    }
    for (const child of suite.suites || []) walk(child, f);
  };
  for (const top of report.suites || []) walk(top, top.file);
  const stats = report.stats || {};
  return { passed, failed, skipped, flaky, failures, durationMs: Math.round(stats.duration || 0) };
}

// ── Best-effort: read the pre-prod build version from the app header ──
async function captureVersion() {
  if (!fs.existsSync(AUTH_FILE) || !BASE_URL) return null;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ storageState: AUTH_FILE });
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const badge = page.locator('span[title^="Build "]').first();
    await badge.waitFor({ state: 'visible', timeout: 20000 });
    return (await badge.textContent())?.trim() || null;
  } catch {
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ── Weighted confidence: pass-rate minus mild penalties for flaky / skipped ──
// Tunable; clamped 0–100. RAG bands (in the dashboard): >=95 green / 85-94 amber / <85 red.
function confidenceScore({ passed, failed, skipped, flaky, total, successPct }) {
  const flakyPenalty = Math.min(5, flaky);
  const skipPenalty = total > 0 ? Math.min(5, Math.round((skipped / total) * 20)) : 0;
  return Math.max(0, Math.min(100, Math.round(successPct - flakyPenalty - skipPenalty)));
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function buildHtml({ version, passed, failed, skipped, flaky, total, pct, confidence, failures }) {
  const color = failed === 0 ? '#10b981' : '#ef4444';
  const failList = failures.length
    ? `<h3 style="margin:16px 0 6px;font-size:14px;color:#ef4444">Failures (${failures.length})</h3>
       <ul style="margin:0;padding-left:18px;font-size:13px;color:#374151">
         ${failures.map((f) => `<li><b>${esc(f.suite)}</b> › ${esc(f.title)}</li>`).join('')}
       </ul>`
    : `<p style="font-size:13px;color:#10b981;margin:12px 0">All tests passed. 🎉</p>`;
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:640px;color:#111827">
    <h2 style="margin:0 0 4px">ZTI E2E — pre-prod report</h2>
    <p style="margin:0 0 2px;font-size:13px;color:#6b7280">Build <b>${esc(version || 'unknown')}</b></p>
    <p style="margin:0 0 12px;font-size:12px;color:#9ca3af">${esc(BASE_URL)}</p>
    <div style="display:inline-block;padding:10px 16px;border-radius:8px;background:${color};color:#fff;font-size:18px;font-weight:700;margin-right:8px">
      ${pct}% passed
    </div>
    <div style="display:inline-block;padding:10px 16px;border-radius:8px;background:#1f2937;color:#fff;font-size:18px;font-weight:700">
      confidence ${confidence}
    </div>
    <table style="margin-top:14px;border-collapse:collapse;font-size:13px">
      <tr><td style="padding:4px 14px 4px 0;color:#6b7280">Total</td><td style="font-weight:600">${total}</td></tr>
      <tr><td style="padding:4px 14px 4px 0;color:#6b7280">Passed</td><td style="font-weight:600;color:#10b981">${passed}</td></tr>
      <tr><td style="padding:4px 14px 4px 0;color:#6b7280">Failed</td><td style="font-weight:600;color:#ef4444">${failed}</td></tr>
      <tr><td style="padding:4px 14px 4px 0;color:#6b7280">Skipped</td><td style="font-weight:600">${skipped}</td></tr>
      ${flaky ? `<tr><td style="padding:4px 14px 4px 0;color:#6b7280">Flaky</td><td style="font-weight:600;color:#f59e0b">${flaky}</td></tr>` : ''}
    </table>
    ${failList}
    <p style="margin:18px 0 0;font-size:13px;color:#374151">📎 Full HTML report (with screenshots) attached as <b>e2e-report.zip</b> — unzip and open <code>index.html</code>.</p>
    ${RUN_URL ? `<p style="margin:4px 0 0;font-size:12px;color:#9ca3af">If the attachment was stripped, download it from the <a href="${esc(RUN_URL)}" style="color:#2563eb">workflow run</a> → Artifacts → "e2e-report".</p>` : ''}
  </div>`;
}

// ── Persist the run onto the matching release_log row (the deploy it ran against) ──
async function persist({ version, passed, failed, skipped, flaky, total, pct, confidence, status }) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !COMMIT_SHA) {
    console.log('[report] skipping release_log update (no SUPABASE/COMMIT_SHA env)');
    return;
  }
  try {
    const url =
      `${SUPABASE_URL}/rest/v1/release_log` +
      `?commit_sha=eq.${encodeURIComponent(COMMIT_SHA)}&environment=eq.pre-prod`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        e2e_total: total,
        e2e_passed: passed,
        e2e_failed: failed,
        e2e_skipped: skipped,
        e2e_flaky: flaky,
        e2e_success_pct: pct,
        e2e_confidence: confidence,
        e2e_status: status,
        e2e_run_url: RUN_URL,
        e2e_finished_at: new Date().toISOString(),
      }),
    });
    const body = await res.json().catch(() => []);
    if (!res.ok) {
      console.warn('[report] release_log PATCH failed (non-fatal):', res.status, JSON.stringify(body).slice(0, 200));
    } else {
      const n = Array.isArray(body) ? body.length : 0;
      console.log(`[report] release_log rows updated: ${n}${n === 0 ? ' (no matching deploy row — expected for manual/test runs)' : ''}`);
    }
  } catch (e) {
    console.warn('[report] release_log PATCH error (non-fatal):', e.message);
  }
}

const main = async () => {
  let report;
  try {
    report = JSON.parse(fs.readFileSync(RESULTS, 'utf8'));
  } catch {
    report = { suites: [] };
  }
  const { passed, failed, skipped, flaky, failures } = parse(report);
  const total = passed + failed + skipped;
  const denom = passed + failed;
  const pct = denom > 0 ? Math.round((passed / denom) * 1000) / 10 : 0;
  const confidence = confidenceScore({ passed, failed, skipped, flaky, total, successPct: pct });
  const version = await captureVersion();
  const status = failed > 0 ? 'failed' : total > 0 ? 'passed' : 'error';

  const subject =
    `E2E pre-prod ${version || ''} — ${passed}/${denom} passed (${pct}%, conf ${confidence})` +
    (failed ? ` · ${failed} failed` : '');
  const html = buildHtml({ version, passed, failed, skipped, flaky, total, pct, confidence, failures });

  await persist({ version, passed, failed, skipped, flaky, total, pct, confidence, status });

  const out = process.env.GITHUB_OUTPUT;
  if (out) {
    fs.appendFileSync(out, `subject=${subject.replace(/\r?\n/g, ' ').trim()}\n`);
    const d = 'HTML_' + Date.now();
    fs.appendFileSync(out, `html<<${d}\n${html}\n${d}\n`);
    fs.appendFileSync(out, `status=${status}\n`);
  }
  console.log(subject);
};

main();
