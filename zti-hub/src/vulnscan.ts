import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig, scansDir } from './config.js';
import { HubApi } from './api.js';
import { ask } from './prompt.js';
import { logInfo, logWarn, logError } from './logger.js';
import { runScan, summarize, type ScanTarget, type TargetType, type ScanFinding } from './scanner.js';

// ── ANSI helpers ────────────────────────────────────────────────────────────
const RED_BG = '\x1b[41m\x1b[1m\x1b[97m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

interface ScanRecord {
  jobId: string;
  target: ScanTarget;
  status: 'running' | 'completed' | 'failed';
  isMock: boolean;
  startedAt: string;
  finishedAt?: string;
  findings: ScanFinding[];
  summary?: ReturnType<typeof summarize>;
  error?: string;
}

function recordPath(jobId: string): string {
  return path.join(scansDir(), `${jobId}.json`);
}

function writeRecord(rec: ScanRecord): void {
  fs.writeFileSync(recordPath(rec.jobId), JSON.stringify(rec, null, 2), { mode: 0o600 });
}

function readRecord(jobId: string): ScanRecord | null {
  try {
    return JSON.parse(fs.readFileSync(recordPath(jobId), 'utf8')) as ScanRecord;
  } catch {
    return null;
  }
}

function latestRecord(): ScanRecord | null {
  let files: string[];
  try {
    files = fs.readdirSync(scansDir()).filter((f) => f.endsWith('.json'));
  } catch {
    return null;
  }
  let best: ScanRecord | null = null;
  for (const f of files) {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(scansDir(), f), 'utf8')) as ScanRecord;
      if (!best || r.startedAt > best.startedAt) best = r;
    } catch {
      /* skip */
    }
  }
  return best;
}

// ── Target parsing ──────────────────────────────────────────────────────────
function parseTarget(sub: string, rest: string[]): ScanTarget | null {
  const mode = (sub || '').toLowerCase();
  if (mode === 'all' || mode === 'local') return { type: mode as TargetType };
  if (mode === 'subnet') {
    const cidr = rest[0];
    if (!cidr) return null;
    return { type: 'subnet', value: cidr };
  }
  if (mode === 'ip') {
    const ip = rest[0];
    if (!ip) return null;
    return { type: 'ip', value: ip };
  }
  return null;
}

function targetLabel(t: ScanTarget): string {
  if (t.type === 'all') return 'ALL discovered hosts';
  if (t.type === 'local') return 'this machine (localhost)';
  return `${t.type.toUpperCase()} ${t.value}`;
}

// ── Red authorization consent pane ───────────────────────
async function confirmAuthorization(t: ScanTarget): Promise<boolean> {
  const line = '═'.repeat(64);
  console.log('');
  console.log(`${RED_BG}  ⚠  ACTIVE VULNERABILITY SCAN — AUTHORIZATION REQUIRED            ${RESET}`);
  console.log(`${RED}${line}${RESET}`);
  console.log(`${RED}║${RESET} You are about to run an ${BOLD}active OpenVAS scan${RESET} against:`);
  console.log(`${RED}║${RESET}   ${BOLD}${targetLabel(t)}${RESET}`);
  console.log(`${RED}║${RESET}`);
  console.log(`${RED}║${RESET} Active scanning probes live systems and may be disruptive.`);
  console.log(`${RED}║${RESET} Only proceed if you are ${BOLD}explicitly authorized${RESET} to scan these`);
  console.log(`${RED}║${RESET} systems. Unauthorized scanning may be illegal.`);
  console.log(`${RED}${line}${RESET}`);
  const ans = (await ask(`${RED}Type "yes" to confirm you are authorized${RESET}`)).toLowerCase();
  console.log('');
  return ans === 'yes' || ans === 'y';
}

// ── Public command: `zti vuln-scan <target>` / `zti vuln-scan report` ──────────
export async function vulnScan(sub: string, rest: string[]): Promise<void> {
  if ((sub || '').toLowerCase() === 'report') {
    await vulnScanReport(rest[0]);
    return;
  }

  const target = parseTarget(sub, rest);
  if (!target) {
    console.error('Usage: zti vuln-scan <all | subnet <CIDR> | ip <addr> | local>');
    console.error('       zti vuln-scan report [job-id]');
    process.exitCode = 1;
    return;
  }

  const cfg = loadConfig();
  if (!cfg.token) {
    console.error('Not authenticated. Run `zti authenticate` first.');
    process.exitCode = 1;
    return;
  }

  const authorized = await confirmAuthorization(target);
  if (!authorized) {
    console.log('Scan cancelled — authorization not confirmed.');
    logWarn('vuln_scan_cancelled', { target });
    return;
  }
  logInfo('vuln_scan_authorized', { target, operator: cfg.deviceName });

  // Register the job with the workspace, then launch the scan detached.
  const api = new HubApi(cfg);
  let jobId: string;
  try {
    const job = await api.createScanJob({
      target_type: target.type,
      target_value: target.value || null,
      authorized: true,
      consent_by: cfg.deviceName,
      is_mock: cfg.mock,
    });
    jobId = job.id;
  } catch (e: any) {
    console.error(`Failed to create scan job: ${e.message}`);
    logError('vuln_scan_create_failed', { error: e.message });
    process.exitCode = 1;
    return;
  }

  // Seed a local 'running' record so `report` can find it immediately.
  writeRecord({
    jobId,
    target,
    status: 'running',
    isMock: cfg.mock,
    startedAt: new Date().toISOString(),
    findings: [],
  });

  // Spawn the scan worker detached so the scan runs in the background.
  const entry = fileURLToPath(new URL('./index.js', import.meta.url));
  const child = spawn(
    process.execPath,
    [entry, '__scan-worker', jobId, target.type, target.value || ''],
    { detached: true, stdio: 'ignore' }
  );
  child.unref();

  logInfo('vuln_scan_started', { jobId, target, mock: cfg.mock });
  console.log(`${BOLD}Scan job ${jobId} is running in the background${RESET}${cfg.mock ? ` ${DIM}(mock)${RESET}` : ''}.`);
  console.log(`When it finishes, view results with:  ${BOLD}zti vuln-scan report ${jobId}${RESET}`);
}

// ── Hidden worker: runs the scan and posts completion (spawned detached) ───────
export async function scanWorker(jobId: string, type: string, value: string): Promise<void> {
  const cfg = loadConfig();
  const target: ScanTarget = { type: type as TargetType, value: value || undefined };
  const api = new HubApi(cfg);
  try {
    const findings = await runScan(target, cfg);
    const summary = summarize(findings);
    writeRecord({
      jobId,
      target,
      status: 'completed',
      isMock: cfg.mock,
      startedAt: readRecord(jobId)?.startedAt || new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      findings,
      summary,
    });
    try {
      await api.postScanStatus(jobId, 'completed', summary);
    } catch {
      /* offline is fine; local record holds the results */
    }
    logInfo('vuln_scan_completed', { jobId, ...summary });
  } catch (e: any) {
    writeRecord({
      jobId,
      target,
      status: 'failed',
      isMock: cfg.mock,
      startedAt: readRecord(jobId)?.startedAt || new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      findings: [],
      error: e.message,
    });
    try {
      await api.postScanStatus(jobId, 'failed', { error: e.message });
    } catch {
      /* best effort */
    }
    logError('vuln_scan_failed', { jobId, error: e.message });
  }
}

// ── `zti vuln-scan report [job-id]` ───────────────────────────────────────────
async function vulnScanReport(jobId?: string): Promise<void> {
  const rec = jobId ? readRecord(jobId) : latestRecord();
  if (!rec) {
    console.log(jobId ? `No local scan found for job ${jobId}.` : 'No scans found. Run `zti vuln-scan <target>` first.');
    return;
  }
  logInfo('vuln_scan_report_viewed', { jobId: rec.jobId });

  console.log('');
  console.log(`${BOLD}Scan report — job ${rec.jobId}${RESET}${rec.isMock ? ` ${DIM}(mock)${RESET}` : ''}`);
  console.log(`Target: ${targetLabel(rec.target)}    Status: ${rec.status}`);

  if (rec.status === 'running') {
    console.log(`${DIM}Scan still running — check again shortly.${RESET}`);
    return;
  }
  if (rec.status === 'failed') {
    console.log(`${RED}Scan failed: ${rec.error || 'unknown error'}${RESET}`);
    return;
  }
  if (!rec.findings.length) {
    console.log('No vulnerabilities found. 🎉');
    return;
  }

  const s = rec.summary || summarize(rec.findings);
  console.log(`Findings: ${s.total}  (Critical ${s.critical}, High ${s.high}, Medium ${s.medium}, Low ${s.low})  KEV: ${s.kev}`);
  console.log('');

  // Table: PRIORITY · HOST · CVE · CVSS · NAME
  const rows = [...rec.findings].sort((a, b) => (b.cvss_score || 0) - (a.cvss_score || 0));
  const pad = (str: string, n: number) => (str + ' '.repeat(n)).slice(0, n);
  console.log(`${BOLD}${pad('PRI', 5)}${pad('HOST', 16)}${pad('CVE', 18)}${pad('CVSS', 6)}VULNERABILITY${RESET}`);
  console.log(DIM + '─'.repeat(78) + RESET);
  for (const f of rows) {
    const c = f.severity === 'Critical' || f.severity === 'High' ? RED : '';
    console.log(
      `${c}${pad(f.priority, 5)}${RESET}${pad(f.host, 16)}${pad(f.cve_id || '-', 18)}${pad(String(f.cvss_score ?? '-'), 6)}${f.vuln_name}`
    );
  }
  console.log('');

  // Offer to push to the ZTI workspace for analyst review in the GUI.
  const ans = (await ask('Send these results to your ZTI workspace for review? (yes/no)', 'no')).toLowerCase();
  if (ans !== 'yes' && ans !== 'y') {
    console.log('Not sent. Results remain local; re-run `zti vuln-scan report` anytime.');
    return;
  }

  const cfg = loadConfig();
  const api = new HubApi(cfg);
  try {
    const r = await api.postScanFindings(rec.jobId, rec.findings);
    logInfo('vuln_scan_sent_to_workspace', { jobId: rec.jobId, staged: r.staged });
    console.log(`${BOLD}Staged ${r.staged} finding(s) to your workspace.${RESET}`);
    console.log('Open ZTI → ZTI Hub Services → Vulnerability Assessment to review and approve.');
  } catch (e: any) {
    console.error(`Failed to send: ${e.message}`);
    logError('vuln_scan_send_failed', { jobId: rec.jobId, error: e.message });
    process.exitCode = 1;
  }
}
