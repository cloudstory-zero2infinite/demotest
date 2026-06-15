import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { prowlerBinPath, prowlerRunEnv } from './runtime.js';
import type { ZtiConfig } from './config.js';

// ════════════════════════════════════════════════════════════════════════════
//  Prowler runner — runs all of one provider's checks in a SINGLE invocation
//  and maps the JSON-OCSF output back to a per-check pass/fail.
//
//  Authoritative OCSF field mapping (from prowler/lib/outputs/ocsf/ocsf.py):
//    • check id  → finding.metadata.event_code   (= CheckID)
//    • outcome   → finding.status_code           ("PASS" | "FAIL" | "MANUAL")
// ════════════════════════════════════════════════════════════════════════════

// pass/fail = resources evaluated; na = check ran but found no resources;
// manual = requires human verification; error = check failed/invalid/unrunnable.
export type CheckStatus = 'pass' | 'fail' | 'manual' | 'na' | 'error';

export interface CheckOutcome {
  check_id: string;
  status: CheckStatus;
  total: number; // findings (resources) evaluated
  failed: number; // findings with status_code FAIL
  detail?: string;
}

export interface ProviderRunResult {
  provider: string;
  ran: boolean; // false when the engine couldn't run at all
  error?: string; // populated when ran === false
  outcomes: Map<string, CheckOutcome>;
}

// ── Pure parser (unit-testable without a real scan) ───────────────────────────
// Given the OCSF findings array and the check ids we asked for, produce a
// per-check outcome. Checks with zero findings ran but had no resources → 'na'.
export function parseOcsfFindings(findings: any[], requestedIds: string[]): Map<string, CheckOutcome> {
  const byCheck = new Map<string, { total: number; failed: number; manual: number }>();
  for (const f of findings || []) {
    const id = f?.metadata?.event_code;
    if (!id) continue;
    const code = String(f?.status_code || '').toUpperCase();
    const acc = byCheck.get(id) || { total: 0, failed: 0, manual: 0 };
    acc.total += 1;
    if (code === 'FAIL') acc.failed += 1;
    else if (code === 'MANUAL') acc.manual += 1;
    byCheck.set(id, acc);
  }

  const out = new Map<string, CheckOutcome>();
  for (const id of requestedIds) {
    const acc = byCheck.get(id);
    if (!acc || acc.total === 0) {
      out.set(id, { check_id: id, status: 'na', total: 0, failed: 0, detail: 'no resources evaluated' });
      continue;
    }
    let status: CheckStatus;
    if (acc.failed > 0) status = 'fail';
    else if (acc.manual === acc.total) status = 'manual';
    else status = 'pass';
    out.set(id, { check_id: id, status, total: acc.total, failed: acc.failed });
  }
  return out;
}

// ── Provider-specific credential args/env ─────────────────────────────────────
function providerArgs(provider: string, cfg: ZtiConfig): { args: string[]; env: NodeJS.ProcessEnv } {
  const env: NodeJS.ProcessEnv = { ...prowlerRunEnv() };
  const args: string[] = [];
  if (provider === 'gcp') {
    const gcp = cfg.gcp || {};
    if (gcp.credentialsPath) {
      args.push('--credentials-file', gcp.credentialsPath);
      env.GOOGLE_APPLICATION_CREDENTIALS = gcp.credentialsPath; // belt + suspenders
    }
    if (gcp.projectId) args.push('--project-id', gcp.projectId);
  }
  // aws/azure use ambient credentials today; provider registry lands next phase.
  return { args, env };
}

// ── Valid-check cache (so one bad id can't fail the whole batch) ──────────────
const validCheckCache = new Map<string, Set<string>>();

export async function listValidChecks(provider: string): Promise<Set<string>> {
  if (validCheckCache.has(provider)) return validCheckCache.get(provider)!;
  const out = await new Promise<string>((resolve) => {
    const p = spawn(prowlerBinPath(), [provider, '--list-checks'], { env: prowlerRunEnv() });
    let s = '';
    p.stdout.on('data', (d) => (s += d));
    p.on('error', () => resolve(''));
    p.on('close', () => resolve(s));
  });
  const ids = new Set<string>();
  // Strip ANSI, match leading [check_id].
  for (const line of out.replace(/\x1b\[[0-9;]*m/g, '').split('\n')) {
    const m = line.match(/^\s*\[([a-z0-9_]+)\]/);
    if (m) ids.add(m[1]);
  }
  validCheckCache.set(provider, ids);
  return ids;
}

// ── Runner ────────────────────────────────────────────────────────────────────
export async function runProviderChecks(
  provider: string,
  checkIds: string[],
  cfg: ZtiConfig
): Promise<ProviderRunResult> {
  const outcomes = new Map<string, CheckOutcome>();
  if (checkIds.length === 0) return { provider, ran: true, outcomes };

  // Split known vs unknown check ids up front; unknown ones are 'error', and
  // excluding them keeps prowler from rejecting the entire invocation.
  let valid: Set<string>;
  try {
    valid = await listValidChecks(provider);
  } catch {
    valid = new Set(checkIds); // if listing fails, attempt all
  }
  const runnable: string[] = [];
  for (const id of checkIds) {
    if (valid.size && !valid.has(id)) {
      outcomes.set(id, { check_id: id, status: 'error', total: 0, failed: 0, detail: 'unknown to installed Prowler' });
    } else {
      runnable.push(id);
    }
  }
  if (runnable.length === 0) return { provider, ran: true, outcomes };

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), `zti-prowler-${provider}-`));
  const { args: credArgs, env } = providerArgs(provider, cfg);
  const args = [
    provider,
    '-c', ...runnable,
    '-M', 'json-ocsf',
    '-o', outDir,
    '-F', 'result',
    '-b',
    '--ignore-exit-code-3', // a failed finding is a result, not a runner error
    ...credArgs,
  ];

  const res = await new Promise<{ code: number; err: string }>((resolve) => {
    const p = spawn(prowlerBinPath(), args, { env });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.stdout.on('data', () => {}); // drain
    p.on('error', (e) => resolve({ code: -1, err: e.message }));
    p.on('close', (code) => resolve({ code: code ?? -1, err }));
  });

  if (res.code !== 0) {
    fs.rmSync(outDir, { recursive: true, force: true });
    return { provider, ran: false, error: res.err || `prowler exited ${res.code}`, outcomes };
  }

  // Read the OCSF report. When there are zero findings prowler writes no file —
  // every runnable check then has no resources → 'na'.
  let findings: any[] = [];
  try {
    const file = fs.readdirSync(outDir).find((f) => f.endsWith('.ocsf.json'));
    if (file) findings = JSON.parse(fs.readFileSync(path.join(outDir, file), 'utf8'));
  } catch {
    /* treat as no findings */
  }
  fs.rmSync(outDir, { recursive: true, force: true });

  for (const [id, outcome] of parseOcsfFindings(findings, runnable)) outcomes.set(id, outcome);
  return { provider, ran: true, outcomes };
}
