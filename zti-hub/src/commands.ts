import { loadConfig, saveConfig, configPath } from './config.js';
import { HubApi, type CheckSpec } from './api.js';
import { runCheck } from './checks.js';

async function runAndReport(api: HubApi, cfg: ReturnType<typeof loadConfig>, checks: CheckSpec[]): Promise<void> {
  if (!checks.length) {
    console.log('No checks associated. An SME can attach checks in the internal tool.');
    return;
  }
  console.log(`Running ${checks.length} check(s)${cfg.mock ? ' (mock)' : ''}…\n`);
  let pass = 0;
  let fail = 0;
  let err = 0;
  for (const spec of checks) {
    const result = await runCheck(spec, cfg);
    if (result.result_status === 'pass') pass++;
    else if (result.result_status === 'fail') fail++;
    else err++;
    const mark = result.result_status === 'pass' ? '✓' : result.result_status === 'fail' ? '✗' : '!';
    console.log(`  ${mark} [${spec.scf_control_id}] ${spec.check_id} → ${result.result_status}`);
    try {
      await api.postRun(spec.scf_control_id, spec.check_id, result);
    } catch (e: any) {
      console.log(`      (failed to record result: ${e.message})`);
    }
  }
  console.log(`\nDone — ${pass} passed, ${fail} failed, ${err} error(s). Results saved to your org.`);
}

export async function checkControl(scfControlId: string): Promise<void> {
  if (!scfControlId) {
    console.error('Usage: zti check-control <SCF#>   e.g. zti check-control THR-03');
    process.exitCode = 1;
    return;
  }
  const cfg = loadConfig();
  const api = new HubApi(cfg);
  const checks = await api.controlChecks(scfControlId);
  await runAndReport(api, cfg, checks);
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
  await runAndReport(api, cfg, checks);
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
  if (!cfg.token) return;
  try {
    const r = await new HubApi(cfg).beacon(cfg.gcp ? { gcp_integrated: true, gcp_project_id: cfg.gcp.projectId } : {});
    console.log(`Beacon:        ok · ${r.queued} job(s) queued`);
  } catch (e: any) {
    console.log(`Beacon:        FAILED · ${e.message}`);
  }
}

// `zti config --real` / `--mock`
export function setMode(real: boolean): void {
  const cfg = loadConfig();
  cfg.mock = !real;
  saveConfig(cfg);
  console.log(`Mode set to ${cfg.mock ? 'mock' : 'real (Prowler)'}.`);
}
