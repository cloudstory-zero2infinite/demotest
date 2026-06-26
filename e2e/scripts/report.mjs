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

// Cap how many failing tests we list in the email; the full set is always in
// the attached report. Keeps the body small even if many tests fail.
const MAX_FAILURES_SHOWN = 25;

// RAG color by score: green >=95, amber 85-94, red <85.
const ragColor = (score) => (score >= 95 ? '#16a34a' : score >= 85 ? '#d97706' : '#dc2626');

// Group failures by suite, most-failing suite first → [ [suite, [titles…]], … ]
function groupFailures(failures) {
  const m = new Map();
  for (const f of failures) {
    if (!m.has(f.suite)) m.set(f.suite, []);
    m.get(f.suite).push(f.title);
  }
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
}

function failuresHtml(failures) {
  if (!failures.length) {
    return `<tr><td style="padding:16px 24px">
      <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:14px 16px;color:#047857;font-size:14px;font-weight:600">
        ✓ All executed tests passed.
      </div></td></tr>`;
  }
  const groups = groupFailures(failures); // EVERY failing suite is listed
  let budget = MAX_FAILURES_SHOWN; // cap on individual titles, shared across suites
  const items = groups.map(([suite, titles]) => {
    const slice = budget > 0 ? titles.slice(0, budget) : [];
    budget -= slice.length;
    const extra = titles.length - slice.length;
    const tests = slice.map((t) => `<li style="margin:3px 0">${esc(t)}</li>`).join('');
    const extraNote = extra > 0
      ? `<li style="margin:3px 0;color:#9ca3af;list-style:none">…and ${extra} more — see attached report</li>`
      : '';
    return `
      <li style="margin:0 0 14px">
        <div style="font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#111827">
          ${esc(suite.toUpperCase())} <span style="color:#9ca3af;font-weight:600">(${titles.length})</span>
        </div>
        <ul style="margin:5px 0 0;padding-left:22px;font-size:14px;color:#4b5563;line-height:1.55">
          ${tests}${extraNote}
        </ul>
      </li>`;
  }).join('');
  return `<tr><td style="padding:10px 24px 6px">
    <div style="font-size:15px;font-weight:700;color:#b91c1c;margin-bottom:12px">Failing tests (${failures.length}) across ${groups.length} suite(s)</div>
    <ol style="margin:0;padding-left:24px">
      ${items}
    </ol>
  </td></tr>`;
}

function chip(label, value, color) {
  return `<td style="padding:0 6px 0 0">
    <div style="background:${color};border-radius:8px;padding:10px 14px;text-align:center">
      <div style="color:#fff;font-size:20px;font-weight:800;line-height:1">${value}</div>
      <div style="color:rgba(255,255,255,0.85);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-top:3px">${label}</div>
    </div>
  </td>`;
}

function statCell(label, value, color) {
  return `<td style="padding:10px 4px;text-align:center;border-right:1px solid #f1f5f9">
    <div style="font-size:18px;font-weight:700;color:${color || '#111827'}">${value}</div>
    <div style="font-size:11px;color:#6b7280;margin-top:2px">${label}</div>
  </td>`;
}

function buildHtml({ version, passed, failed, skipped, flaky, total, pct, confidence, failures }) {
  const allGreen = failed === 0;
  const bannerBg = allGreen ? '#16a34a' : '#dc2626';
  const bannerText = allGreen ? '✓ Passed' : `✕ ${failed} failed`;
  return `
  <div style="background:#f3f4f6;padding:24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1f2937">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
      <!-- Header -->
      <tr><td style="background:#0f172a;padding:20px 24px">
        <div style="color:#fff;font-size:18px;font-weight:800;letter-spacing:.01em">ZTI E2E — pre-prod report</div>
        <div style="color:#94a3b8;font-size:13px;margin-top:4px">Build <span style="color:#e2e8f0;font-weight:600">${esc(version || 'unknown')}</span></div>
        <div style="color:#64748b;font-size:11px;margin-top:2px">${esc(BASE_URL)}</div>
      </td></tr>

      <!-- Status banner -->
      <tr><td style="padding:0">
        <div style="background:${bannerBg};color:#fff;font-size:14px;font-weight:700;padding:8px 24px">${bannerText} · ${pct}% pass rate</div>
      </td></tr>

      <!-- Headline chips -->
      <tr><td style="padding:18px 24px 6px">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            ${chip('Pass rate', pct + '%', ragColor(pct))}
            ${chip('Confidence', confidence, ragColor(confidence))}
          </tr>
        </table>
      </td></tr>

      <!-- Stat strip -->
      <tr><td style="padding:10px 24px 4px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f1f5f9;border-radius:8px">
          <tr>
            ${statCell('Total', total)}
            ${statCell('Passed', passed, '#16a34a')}
            ${statCell('Failed', failed, failed ? '#dc2626' : '#111827')}
            ${statCell('Skipped', skipped)}
            ${statCell('Flaky', flaky, flaky ? '#d97706' : '#111827')}
          </tr>
        </table>
      </td></tr>

      <!-- Failures -->
      ${failuresHtml(failures)}

      <!-- Footer -->
      <tr><td style="padding:14px 24px 20px;border-top:1px solid #f1f5f9">
        <div style="font-size:13px;color:#374151">📎 Full HTML report (with screenshots) attached as <b>e2e-report.zip</b> — unzip and open <code>index.html</code>.</div>
        ${RUN_URL ? `<div style="font-size:12px;color:#9ca3af;margin-top:4px">If the attachment was stripped, download it from the <a href="${esc(RUN_URL)}" style="color:#2563eb">workflow run</a> → Artifacts → "e2e-report".</div>` : ''}
      </td></tr>
    </table>
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

  const env = 'pre-prod';
  const summary = failed > 0
    ? `❌ ${failed} failed · ${passed}/${denom} passed (${pct}%)`
    : `✅ ${passed}/${denom} passed (${pct}%)`;
  const subject = `E2E Report | ${env} | ${version || 'unknown'} | ${summary}`;
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
