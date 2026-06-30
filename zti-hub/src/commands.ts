import { loadConfig, saveConfig, configPath, type ZtiConfig } from './config.js';
import { HubApi, type CheckSpec } from './api.js';
import { runCheck } from './checks.js';
import { readLogs, logPath } from './logger.js';
import { ensureProwler, runtimeStatus, checkGcpServiceUsage } from './runtime.js';
import { logInfo, logError } from './logger.js';
import { runProviderChecks, type CheckStatus, type CheckOutcome } from './prowler.js';

// Order providers are reported in; label map for display.
const PROVIDER_ORDER = ['gcp', 'aws', 'azure'];
const PROVIDER_LABEL: Record<string, string> = { gcp: 'GCP', aws: 'AWS', azure: 'Azure' };
const providerLabel = (p: string) => PROVIDER_LABEL[p] || p.toUpperCase();

// ANSII
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YEL = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// Which providers this hub has integrated. (The generic provider registry lands
// in the next phase; today GCP is the only wired provider.)
function integratedProviders(cfg: ZtiConfig): string[] {
  const out: string[] = [];
  if (cfg.gcp?.projectId || cfg.gcp?.credentialsPath) out.push('gcp');
  return out;
}

interface NamedOutcome extends CheckOutcome {
  title?: string;
}

// Run one provider's checks (real via Prowler, or mock) → keyed outcomes.
async function runChecksForProvider(
  provider: string,
  specs: CheckSpec[],
  cfg: ZtiConfig
): Promise<Map<string, NamedOutcome>> {
  const titleById = new Map(specs.map((s) => [s.check_id, s.title]));
  const out = new Map<string, NamedOutcome>();

  if (cfg.mock) {
    for (const spec of specs) {
      const r = await runCheck(spec, cfg); // mock pass/fail
      const status: CheckStatus = r.result_status === 'pass' ? 'pass' : r.result_status === 'fail' ? 'fail' : 'error';
      out.set(spec.check_id, { check_id: spec.check_id, status, total: status === 'pass' ? 1 : status === 'fail' ? 1 : 0, failed: status === 'fail' ? 1 : 0, title: spec.title });
    }
    return out;
  }

  const res = await runProviderChecks(provider, specs.map((s) => s.check_id), cfg);
  if (!res.ran) {
    // Engine couldn't run for this provider — surface every check as error.
    for (const spec of specs) {
      out.set(spec.check_id, { check_id: spec.check_id, status: 'error', total: 0, failed: 0, title: spec.title, detail: res.error });
    }
    return out;
  }
  for (const [id, o] of res.outcomes) out.set(id, { ...o, title: titleById.get(id) });
  return out;
}

function statusMark(s: CheckStatus): string {
  return s === 'pass' ? `${GREEN}✓${RESET}` : s === 'fail' ? `${RED}✗${RESET}` : s === 'na' ? `${DIM}·${RESET}` : s === 'manual' ? `${YEL}?${RESET}` : `${YEL}!${RESET}`;
}

interface ProviderTally { passed: number; failed: number; na: number; manual: number; error: number }

function tally(outcomes: Map<string, NamedOutcome>): ProviderTally {
  const t: ProviderTally = { passed: 0, failed: 0, na: 0, manual: 0, error: 0 };
  for (const o of outcomes.values()) {
    if (o.status === 'pass') t.passed++;
    else if (o.status === 'fail') t.failed++;
    else if (o.status === 'na') t.na++;
    else if (o.status === 'manual') t.manual++;
    else t.error++;
  }
  return t;
}

// "GCP: 4/4 passed · 1 failed · 2 n/a" — n/a excluded from the ratio denominator.
function providerSummaryLine(provider: string, t: ProviderTally): string {
  const applicable = t.passed + t.failed;
  const verdict = t.failed > 0 ? `${RED}FAIL${RESET}` : applicable > 0 ? `${GREEN}PASS${RESET}` : `${DIM}N/A${RESET}`;
  const extras: string[] = [];
  if (t.failed) extras.push(`${t.failed} failed`);
  if (t.na) extras.push(`${t.na} n/a`);
  if (t.manual) extras.push(`${t.manual} manual`);
  if (t.error) extras.push(`${t.error} error`);
  const tail = extras.length ? ` · ${extras.join(' · ')}` : '';
  return `  ${BOLD}${providerLabel(provider)}${RESET}: ${verdict} — ${t.passed}/${applicable} passed${tail}`;
}

// Core: group a control's (or framework's) checks by provider, run integrated
// providers, post results, and print a provider-wise summary.
async function runChecks(api: HubApi, cfg: ZtiConfig, label: string, checks: CheckSpec[]): Promise<void> {
  if (!checks.length) {
    console.log('No checks associated. An SME can attach checks in the internal tool.');
    return;
  }

  // Group by provider.
  const byProvider = new Map<string, CheckSpec[]>();
  for (const c of checks) {
    const p = (c.provider || 'unknown').toLowerCase();
    if (!byProvider.has(p)) byProvider.set(p, []);
    byProvider.get(p)!.push(c);
  }

  const integrated = integratedProviders(cfg);
  // In mock mode every provider is "runnable" so the demo shows everything.
  const runnable = cfg.mock ? [...byProvider.keys()] : integrated;

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

  console.log(`\n${BOLD}${label}${RESET} — ${checks.length} check(s) across ${byProvider.size} provider(s)${cfg.mock ? ` ${DIM}(mock)${RESET}` : ''}\n`);

  const orderedRunnable = [...PROVIDER_ORDER.filter((p) => runnable.includes(p)), ...runnable.filter((p) => !PROVIDER_ORDER.includes(p))];
  const summaries: Array<{ provider: string; t: ProviderTally }> = [];
  let totalPassed = 0;
  let totalApplicable = 0;

  for (const provider of orderedRunnable) {
    const specs = byProvider.get(provider) || [];
    if (specs.length === 0) {
      console.log(`  ${DIM}No checks associated for ${providerLabel(provider)}.${RESET}`);
      summaries.push({ provider, t: { passed: 0, failed: 0, na: 0, manual: 0, error: 0 } });
      continue;
    }

    console.log(`  ${BOLD}${providerLabel(provider)}${RESET} ${DIM}— running ${specs.length} check(s)…${RESET}`);
    const outcomes = await runChecksForProvider(provider, specs, cfg);

    // Per-check lines.
    for (const spec of specs) {
      const o = outcomes.get(spec.check_id);
      if (!o) continue;
      const detail = o.status === 'fail' ? ` ${DIM}(${o.failed}/${o.total} resources failed)${RESET}` : o.detail ? ` ${DIM}(${o.detail})${RESET}` : '';
      console.log(`    ${statusMark(o.status)} ${spec.check_id} → ${o.status.toUpperCase()}${detail}`);
    }

    const t = tally(outcomes);
    summaries.push({ provider, t });
    totalPassed += t.passed;
    totalApplicable += t.passed + t.failed;

    // Post pass/fail/error results to the workspace (na/manual aren't job outcomes).
    for (const spec of specs) {
      const o = outcomes.get(spec.check_id);
      if (!o || o.status === 'na' || o.status === 'manual') continue;
      if (!spec.scf_control_id) continue; // check-control/framework always carry one
      const result_status = o.status === 'pass' ? 'pass' : o.status === 'fail' ? 'fail' : 'error';
      try {
        await api.postRun(spec.scf_control_id, spec.check_id, {
          result_status,
          result: { provider, status: o.status, total: o.total, failed: o.failed, detail: o.detail, mock: cfg.mock },
        });
      } catch (e: any) {
        console.log(`      ${DIM}(failed to record ${spec.check_id}: ${e.message})${RESET}`);
      }
    }

    // All-N/A can simply mean no resources of these types exist — but it's also
    // the symptom of a disabled Service Usage API, so offer that as a possibility
    // (not a definitive cause) without alarming wording.
    if (!cfg.mock && t.passed + t.failed + t.manual === 0 && t.na > 0 && provider === 'gcp') {
      console.log(`    ${DIM}All checks returned N/A — no matching resources found in this project.${RESET}`);
      console.log(`    ${DIM}If you expected results, verify the Service Usage API is enabled:${RESET}`);
      console.log(`    ${DIM}  gcloud services enable serviceusage.googleapis.com --project=${cfg.gcp?.projectId || '<project>'}${RESET}`);
    }
  }

  // Providers that have checks but aren't integrated (real mode only).
  if (!cfg.mock) {
    for (const [provider, specs] of byProvider) {
      if (!integrated.includes(provider)) {
        console.log(`  ${DIM}${providerLabel(provider)}: not integrated (${specs.length} check(s) available — run \`zti integrate ${provider}\`)${RESET}`);
      }
    }
  }

  // Summary.
  console.log(`\n${BOLD}Summary — ${label}${RESET}`);
  for (const { provider, t } of summaries) console.log(providerSummaryLine(provider, t));
  console.log(`  ${DIM}Overall: ${totalPassed}/${totalApplicable} checks passed across integrated providers.${RESET}`);
  logInfo('check_run', { label, mock: cfg.mock, totalPassed, totalApplicable });
}

export async function checkControl(scfControlId: string): Promise<void> {
  if (!scfControlId) {
    console.error('Usage: zti check-control <SCF#>   e.g. zti check-control CRY-05');
    process.exitCode = 1;
    return;
  }
  const cfg = loadConfig();
  const api = new HubApi(cfg);
  const checks = await api.controlChecks(scfControlId);
  await runChecks(api, cfg, scfControlId, checks);
}

export async function checkFramework(framework: string): Promise<void> {
  if (!framework) {
    console.error('Usage: zti check-framework <name>   e.g. zti check-framework "CIS CSC 8.1"');
    process.exitCode = 1;
    return;
  }
  const cfg = loadConfig();
  const api = new HubApi(cfg);
  const checks = await api.frameworkChecks(framework);
  await runChecks(api, cfg, framework, checks);
}

export async function status(): Promise<void> {
  const cfg = loadConfig();
  console.log(`Config:        ${configPath()}`);
  console.log(`API:           ${cfg.apiBaseUrl}`);
  console.log(`App:           ${cfg.appUrl}`);
  console.log(`Device:        ${cfg.deviceName}`);
  console.log(`Authenticated: ${cfg.token ? 'yes' : 'no'}`);
  console.log(`Mode:          ${cfg.mock ? 'mock' : 'real (Prowler)'}`);
  console.log(`GCP:           ${cfg.gcp?.projectId ? cfg.gcp.projectId : 'not integrated'}`);
  console.log(`OpenVAS:       ${cfg.gvm?.host || cfg.gvm?.socketPath ? (cfg.gvm.socketPath ? 'integrated (socket)' : `integrated (${cfg.gvm.host})`) : 'not integrated'}`);
  if (!cfg.token) return;
  try {
    const r = await new HubApi(cfg).beacon(cfg.gcp ? { gcp_integrated: true, gcp_project_id: cfg.gcp.projectId } : {});
    console.log(`Beacon:        ok · ${r.queued} job(s) queued`);
  } catch (e: any) {
    console.log(`Beacon:        FAILED · ${e.message}`);
  }
}

// `zti cli-logs [--tail N]` — show the local CLI activity log.
export function cliLogs(args: string[]): void {
  let n = 50;
  const ti = args.indexOf('--tail');
  if (ti !== -1 && args[ti + 1]) {
    const parsed = parseInt(args[ti + 1], 10);
    if (!Number.isNaN(parsed)) n = parsed;
  }
  const entries = readLogs(n);
  if (!entries.length) {
    console.log(`No CLI logs yet. (${logPath()})`);
    return;
  }
  const RED = '\x1b[31m';
  const YEL = '\x1b[33m';
  const DIM = '\x1b[2m';
  const RESET = '\x1b[0m';
  for (const e of entries) {
    const { ts, level, event, ...rest } = e;
    const color = level === 'error' ? RED : level === 'warn' ? YEL : '';
    const extra = Object.keys(rest).length ? ` ${DIM}${JSON.stringify(rest)}${RESET}` : '';
    console.log(`${DIM}${ts}${RESET} ${color}${level.toUpperCase().padEnd(5)}${RESET} ${event}${extra}`);
  }
  console.log(`${DIM}— ${entries.length} entry(ies) from ${logPath()}${RESET}`);
}

// `zti integrate prowler` — provision the managed Prowler scan engine.
export async function setupProwler(): Promise<void> {
  try {
    const { prowlerPath, prowlerVersion } = await ensureProwler();
    logInfo('prowler_runtime_ready', { prowlerVersion });
    console.log(`\nScan engine installed at:\n  ${prowlerPath}`);
    const cfg = loadConfig();
    if (cfg.mock) {
      console.log('\nHub is still in --mock mode. Run `zti config --real` to execute real Prowler checks.');
    }
  } catch (e: any) {
    logError('prowler_runtime_failed', { error: e.message });
    console.error(`\n✗ Could not set up the scan engine: ${e.message}`);
    process.exitCode = 1;
  }
}

// `zti doctor` — show runtime + integration health.
export async function doctor(): Promise<void> {
  const cfg = loadConfig();
  console.log('\nZTI Hub — diagnostics\n');

  console.log(`Authenticated:   ${cfg.token ? 'yes' : 'no'}`);
  console.log(`Mode:            ${cfg.mock ? 'mock (canned results)' : 'real (Prowler)'}`);

  // Integrated providers (today: gcp via cfg.gcp; provider registry comes next phase).
  const gcpIntegrated = !!(cfg.gcp?.projectId || cfg.gcp?.credentialsPath);
  const openvasIntegrated = !!(cfg.gvm?.host || cfg.gvm?.socketPath);
  const providers: string[] = [];
  if (gcpIntegrated) providers.push(`gcp${cfg.gcp?.projectId ? ` (${cfg.gcp.projectId})` : ''}`);
  if (openvasIntegrated) providers.push(`openvas${cfg.gvm?.socketPath ? ` (socket)` : ` (${cfg.gvm?.host})`}`);
  console.log(`Providers:       ${providers.length ? providers.join(', ') : 'none integrated'}`);

  const rt = await runtimeStatus();
  console.log('\nScan engine:');
  console.log(`  uv:            ${rt.uvVersion ? `${rt.uvVersion} (${rt.uvSource})` : 'not installed'}`);
  console.log(`  prowler:       ${rt.prowlerVersion ? rt.prowlerVersion : 'not installed'}`);
  console.log(`  runtime dir:   ${rt.runtimeDir}`);

  // Preflight: GCP Service Usage API. If it's off, real checks silently return
  // N/A across the board, so flag it proactively here.
  let serviceUsageDisabled = false;
  if (gcpIntegrated) {
    console.log('\nGCP preflight:');
    process.stdout.write('  Service Usage API: checking…\r');
    const su = await checkGcpServiceUsage(cfg.gcp?.projectId);
    if (su.status === 'enabled') {
      console.log(`  ${GREEN}Service Usage API: enabled ✓${RESET}                    `);
    } else if (su.status === 'disabled') {
      serviceUsageDisabled = true;
      console.log(`  ${RED}Service Usage API: DISABLED ✗${RESET}                  `);
      console.log(`  ${DIM}Prowler can't discover resources until you enable it:${RESET}`);
      console.log(`  ${DIM}  gcloud services enable serviceusage.googleapis.com --project=${cfg.gcp?.projectId || '<project>'}${RESET}`);
    } else {
      console.log(`  ${YEL}Service Usage API: could not verify${RESET} ${DIM}(${su.detail || 'gcloud unavailable'})${RESET}`);
      console.log(`  ${DIM}Ensure serviceusage.googleapis.com is enabled, or checks will return N/A.${RESET}`);
    }
  }

  if (!rt.prowlerReady) {
    console.log('\nNext: run `zti integrate prowler` to install the scan engine.');
  } else if (serviceUsageDisabled) {
    console.log('\nNext: enable the Service Usage API above, then run a check.');
  } else if (cfg.mock) {
    console.log('\nScan engine ready. Run `zti config --real` to use it for checks.');
  } else {
    console.log('\nAll set — real Prowler checks are enabled.');
  }
}

// `zti config --real` / `--mock`
export function setMode(real: boolean): void {
  const cfg = loadConfig();
  cfg.mock = !real;
  saveConfig(cfg);
  console.log(`Mode set to ${cfg.mock ? 'mock' : 'real (Prowler)'}.`);
}
