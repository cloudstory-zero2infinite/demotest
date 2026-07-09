import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, cspmDir, type ZtiConfig } from './config.js';
import { HubApi, type CheckSpec, type CspmControlResult } from './api.js';
import { runCheck } from './checks.js';
import { ensureProwler } from './runtime.js';
import { runProviderChecks, type CheckStatus } from './prowler.js';
import { ask } from './prompt.js';
import { logInfo, logWarn, logError } from './logger.js';

// ── ANSI ──────────────────────────────────────────────────────────────────────
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YEL = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

type ScopeType = 'all' | 'framework' | 'control' | 'provider';
interface Scope { type: ScopeType; value?: string; }

interface CspmRecord {
  jobId: string;
  scope: Scope;
  isMock: boolean;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'completed' | 'failed';
  results: CspmControlResult[];
  summary?: ReturnType<typeof summarize>;
  error?: string;
}

function recordPath(jobId: string): string {
  return path.join(cspmDir(), `${jobId}.json`);
}
function writeRecord(rec: CspmRecord): void {
  fs.writeFileSync(recordPath(rec.jobId), JSON.stringify(rec, null, 2), { mode: 0o600 });
}
function readRecord(jobId: string): CspmRecord | null {
  try { return JSON.parse(fs.readFileSync(recordPath(jobId), 'utf8')) as CspmRecord; } catch { return null; }
}
function latestRecord(): CspmRecord | null {
  let files: string[];
  try { files = fs.readdirSync(cspmDir()).filter((f) => f.endsWith('.json')); } catch { return null; }
  let best: CspmRecord | null = null;
  for (const f of files) {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(cspmDir(), f), 'utf8')) as CspmRecord;
      if (!best || r.startedAt > best.startedAt) best = r;
    } catch { /* skip */ }
  }
  return best;
}

// A stable key per control (SCF id, or nn:<name> for Non-Negotiables).
function controlKey(spec: CheckSpec): string {
  return spec.scf_control_id ? `scf:${spec.scf_control_id}` : `nn:${spec.nn_ctl_name}`;
}

function summarize(results: CspmControlResult[]) {
  const s = { controls_total: results.length, fully_passed: 0, partially_passed: 0, failed: 0, na: 0 };
  for (const r of results) {
    if (r.result_status === 'pass') s.fully_passed++;
    else if (r.result_status === 'partial') s.partially_passed++;
    else if (r.result_status === 'fail') s.failed++;
    else s.na++;
  }
  return s;
}

// Run one control's checks (grouped by provider), aggregate into a CspmControlResult.
async function assessControl(
  cfg: ZtiConfig,
  scfId: string | undefined,
  nnName: string | undefined,
  specs: CheckSpec[]
): Promise<CspmControlResult> {
  const byProvider = new Map<string, CheckSpec[]>();
  for (const c of specs) {
    const p = (c.provider || 'gcp').toLowerCase();
    if (!byProvider.has(p)) byProvider.set(p, []);
    byProvider.get(p)!.push(c);
  }

  const raw: CspmControlResult['raw'] = [];
  let passed = 0, failed = 0, na = 0;

  for (const [provider, pSpecs] of byProvider) {
    const outcomes = new Map<string, { status: CheckStatus; total: number; failed: number }>();
    if (cfg.mock) {
      for (const spec of pSpecs) {
        const r = await runCheck(spec, cfg);
        const status: CheckStatus = r.result_status === 'pass' ? 'pass' : r.result_status === 'fail' ? 'fail' : 'error';
        outcomes.set(spec.check_id, { status, total: status === 'error' ? 0 : 1, failed: status === 'fail' ? 1 : 0 });
      }
    } else {
      const res = await runProviderChecks(provider, pSpecs.map((s) => s.check_id), cfg);
      if (!res.ran) {
        for (const spec of pSpecs) outcomes.set(spec.check_id, { status: 'error', total: 0, failed: 0 });
      } else {
        for (const [id, o] of res.outcomes) outcomes.set(id, { status: o.status, total: o.total, failed: o.failed });
      }
    }
    for (const spec of pSpecs) {
      const o = outcomes.get(spec.check_id) || { status: 'error' as CheckStatus, total: 0, failed: 0 };
      raw.push({ check_id: spec.check_id, status: o.status, total: o.total, failed: o.failed });
      if (o.status === 'pass') passed++;
      else if (o.status === 'fail') failed++;
      else na++; // na | manual | error — excluded from the pass ratio
    }
  }

  const applicable = passed + failed;
  const pass_pct = applicable === 0 ? 0 : Math.round((passed / applicable) * 100);
  const result_status: CspmControlResult['result_status'] =
    applicable === 0 ? 'na' : failed === 0 ? 'pass' : passed === 0 ? 'fail' : 'partial';
  const providers = [...byProvider.keys()].join(',');

  return {
    scf_control_id: scfId || null,
    nn_ctl_name: nnName || null,
    control_name: scfId || nnName || 'Unknown control',
    provider: providers,
    checks_total: specs.length,
    checks_passed: passed,
    checks_failed: failed,
    checks_na: na,
    pass_pct,
    result_status,
    raw,
  };
}

// ── Scope parsing ───────────────────────────────────────────────────────────
function parseScope(sub: string, rest: string[]): Scope | null {
  const mode = (sub || '').toLowerCase();
  if (!sub || mode === 'scan' || mode === 'all') {
    // `zti cspm`, `zti cspm scan`, `zti cspm all`, or `zti cspm scan all`
    const next = (rest[0] || '').toLowerCase();
    if (next === 'framework') return { type: 'framework', value: rest.slice(1).join(' ') };
    if (next === 'control') return { type: 'control', value: rest[1] };
    if (next === 'provider') return { type: 'provider', value: rest[1] };
    return { type: 'all' };
  }
  if (mode === 'framework') return { type: 'framework', value: rest.join(' ') };
  if (mode === 'control') return { type: 'control', value: rest[0] };
  if (mode === 'provider') return { type: 'provider', value: rest[0] };
  return null;
}

function scopeLabel(s: Scope): string {
  if (s.type === 'all') return 'all controls with associated checks';
  if (s.type === 'framework') return `framework "${s.value}"`;
  if (s.type === 'control') return `control ${s.value}`;
  return `provider ${s.value}`;
}

async function resolveChecks(api: HubApi, scope: Scope): Promise<CheckSpec[]> {
  if (scope.type === 'framework') {
    if (!scope.value) throw new Error('Usage: zti cspm framework <name>');
    return api.frameworkChecks(scope.value);
  }
  if (scope.type === 'control') {
    if (!scope.value) throw new Error('Usage: zti cspm control <SCF#>');
    return api.controlChecks(scope.value);
  }
  // all / provider both start from the full association set.
  const all = await api.allChecks();
  if (scope.type === 'provider') {
    const want = (scope.value || '').toLowerCase();
    return all.filter((c) => (c.provider || 'gcp').toLowerCase() === want);
  }
  return all;
}

// ── Public command: `zti cspm [scan] [scope]` / `zti cspm report` ─────────────
export async function cspm(sub: string, rest: string[]): Promise<void> {
  if ((sub || '').toLowerCase() === 'report') {
    await cspmReport(rest[0]);
    return;
  }

  const scope = parseScope(sub, rest);
  if (!scope) {
    console.error('Usage: zti cspm [scan] [all | framework <name> | control <SCF#> | provider <gcp>]');
    console.error('       zti cspm report [job-id]');
    process.exitCode = 1;
    return;
  }

  const cfg = loadConfig();
  if (!cfg.token) {
    console.error('Not authenticated. Run `zti authenticate` first.');
    process.exitCode = 1;
    return;
  }

  const api = new HubApi(cfg);

  let specs: CheckSpec[];
  try {
    specs = await resolveChecks(api, scope);
  } catch (e: any) {
    console.error(e.message);
    process.exitCode = 1;
    return;
  }
  if (!specs.length) {
    console.log(`No checks associated for ${scopeLabel(scope)}. An SME can attach checks in the internal tool.`);
    return;
  }

  // Group checks by control.
  const byControl = new Map<string, CheckSpec[]>();
  for (const s of specs) {
    const k = controlKey(s);
    if (!byControl.has(k)) byControl.set(k, []);
    byControl.get(k)!.push(s);
  }

  // Ensure the real scan engine exists before we start (idempotent fast-path).
  if (!cfg.mock) {
    try {
      await ensureProwler();
    } catch (e: any) {
      console.error(`\n✗ Scan engine unavailable: ${e.message}\n  Run \`zti integrate prowler\` to set it up.`);
      process.exitCode = 1;
      return;
    }
  }

  // Register the job with the workspace.
  let jobId: string;
  try {
    const job = await api.createCspmJob({
      scope_type: scope.type,
      scope_value: scope.value || null,
      provider: scope.type === 'provider' ? scope.value : null,
      is_mock: cfg.mock,
    });
    jobId = job.id;
  } catch (e: any) {
    console.error(`Failed to create CSPM job: ${e.message}`);
    logError('cspm_scan_create_failed', { error: e.message });
    process.exitCode = 1;
    return;
  }

  writeRecord({ jobId, scope, isMock: cfg.mock, startedAt: new Date().toISOString(), status: 'running', results: [] });
  logInfo('cspm_scan_started', { jobId, scope, mock: cfg.mock });

  console.log(`\n${BOLD}CSPM posture scan${RESET} — ${scopeLabel(scope)}${cfg.mock ? ` ${DIM}(mock)${RESET}` : ''}`);
  console.log(`${DIM}Job ${jobId} · ${byControl.size} control(s) · ${specs.length} check(s)${RESET}\n`);

  const results: CspmControlResult[] = [];
  try {
    for (const [, cSpecs] of byControl) {
      const first = cSpecs[0];
      const r = await assessControl(cfg, first.scf_control_id, first.nn_ctl_name, cSpecs);
      results.push(r);
      const mark = r.result_status === 'pass' ? `${GREEN}✓${RESET}` : r.result_status === 'fail' ? `${RED}✗${RESET}` : r.result_status === 'partial' ? `${YEL}◑${RESET}` : `${DIM}·${RESET}`;
      console.log(`  ${mark} ${r.control_name} — ${r.checks_passed}/${r.checks_passed + r.checks_failed} passed (${r.pass_pct}%)${r.checks_na ? ` ${DIM}· ${r.checks_na} n/a${RESET}` : ''}`);
    }
  } catch (e: any) {
    writeRecord({ jobId, scope, isMock: cfg.mock, startedAt: readRecord(jobId)?.startedAt || new Date().toISOString(), finishedAt: new Date().toISOString(), status: 'failed', results, error: e.message });
    try { await api.postCspmStatus(jobId, 'failed', { error: e.message }); } catch { /* offline ok */ }
    logError('cspm_scan_failed', { jobId, error: e.message });
    console.error(`\n${RED}Scan failed: ${e.message}${RESET}`);
    process.exitCode = 1;
    return;
  }

  const summary = summarize(results);
  writeRecord({ jobId, scope, isMock: cfg.mock, startedAt: readRecord(jobId)?.startedAt || new Date().toISOString(), finishedAt: new Date().toISOString(), status: 'completed', results, summary });
  try { await api.postCspmStatus(jobId, 'completed', summary); } catch { /* offline ok; local record holds results */ }
  logInfo('cspm_scan_completed', { jobId, ...summary });

  console.log(`\n${BOLD}Summary${RESET} — ${summary.controls_total} control(s): ${GREEN}${summary.fully_passed} passed${RESET} · ${YEL}${summary.partially_passed} partial${RESET} · ${RED}${summary.failed} failed${RESET} · ${DIM}${summary.na} n/a${RESET}\n`);

  await offerSend(jobId, results);
}

// ── `zti cspm report [job-id]` ────────────────────────────────────────────────
async function cspmReport(jobId?: string): Promise<void> {
  const rec = jobId ? readRecord(jobId) : latestRecord();
  if (!rec) {
    console.log(jobId ? `No local CSPM scan found for job ${jobId}.` : 'No CSPM scans found. Run `zti cspm scan` first.');
    return;
  }
  logInfo('cspm_report_viewed', { jobId: rec.jobId });

  console.log('');
  console.log(`${BOLD}CSPM report — job ${rec.jobId}${RESET}${rec.isMock ? ` ${DIM}(mock)${RESET}` : ''}`);
  console.log(`Scope: ${scopeLabel(rec.scope)}    Status: ${rec.status}`);

  if (rec.status === 'running') { console.log(`${DIM}Scan still running — check again shortly.${RESET}`); return; }
  if (rec.status === 'failed') { console.log(`${RED}Scan failed: ${rec.error || 'unknown error'}${RESET}`); return; }
  if (!rec.results.length) { console.log('No controls assessed.'); return; }

  const s = rec.summary || summarize(rec.results);
  console.log(`Controls: ${s.controls_total}  (${s.fully_passed} passed, ${s.partially_passed} partial, ${s.failed} failed, ${s.na} n/a)`);
  console.log('');

  const pad = (str: string, n: number) => (str + ' '.repeat(n)).slice(0, n);
  console.log(`${BOLD}${pad('CONTROL', 14)}${pad('PROVIDER', 10)}${pad('PASS', 9)}${pad('%', 6)}STATUS${RESET}`);
  console.log(DIM + '─'.repeat(60) + RESET);
  for (const r of [...rec.results].sort((a, b) => a.pass_pct - b.pass_pct)) {
    const c = r.result_status === 'fail' ? RED : r.result_status === 'partial' ? YEL : r.result_status === 'pass' ? GREEN : DIM;
    console.log(`${pad(r.control_name, 14)}${pad(r.provider, 10)}${pad(`${r.checks_passed}/${r.checks_passed + r.checks_failed}`, 9)}${pad(`${r.pass_pct}%`, 6)}${c}${r.result_status}${RESET}`);
  }
  console.log('');

  await offerSend(rec.jobId, rec.results);
}

// Prompt to push results to the ZTI workspace for admin review in the GUI.
async function offerSend(jobId: string, results: CspmControlResult[]): Promise<void> {
  const ans = (await ask('Send these results to your ZTI workspace for review? (yes/no)', 'no')).toLowerCase();
  if (ans !== 'yes' && ans !== 'y') {
    console.log('Not sent. Results remain local; re-run `zti cspm report` anytime.');
    return;
  }
  const cfg = loadConfig();
  const api = new HubApi(cfg);
  try {
    const r = await api.postCspmResults(jobId, results);
    logInfo('cspm_sent_to_workspace', { jobId, staged: r.staged });
    console.log(`${BOLD}Staged ${r.staged} control result(s) to your workspace.${RESET}`);
    console.log('Open ZTI → ZTI Hub Services → CSPM to review and import into the Control Registry.');
  } catch (e: any) {
    console.error(`Failed to send: ${e.message}`);
    logError('cspm_send_failed', { jobId, error: e.message });
    process.exitCode = 1;
  }
}
