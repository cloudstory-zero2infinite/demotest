import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import type { ZtiConfig } from './config.js';
import type { CheckSpec, CheckResult } from './api.js';

// Deterministic mock outcome so demos are stable: ~1/3 of checks "fail",
// keyed off the check_id hash. Returns a realistic-looking result payload.
function mockResult(spec: CheckSpec): CheckResult {
  const h = crypto.createHash('md5').update(spec.check_id).digest()[0];
  const failed = h % 3 === 0;
  return {
    result_status: failed ? 'fail' : 'pass',
    result: {
      mock: true,
      summary: failed
        ? `1 resource failed: ${spec.title || spec.check_id}`
        : `All scanned resources passed: ${spec.title || spec.check_id}`,
      provider: spec.provider || 'gcp',
      service: spec.service || null,
      findings: failed
        ? [{ status: 'FAIL', resource: `projects/demo/${spec.service || 'resource'}/example`, severity: spec.severity || 'medium' }]
        : [],
    },
  };
}

// Best-effort real Prowler execution. Prowler must be installed and the cloud
// provider authenticated (e.g. `gcloud auth application-default login` or a
// read-only service-account key in GOOGLE_APPLICATION_CREDENTIALS). Phase 1
// parses Prowler's JSON-OCSF output; treat as experimental until validated.
function runProwler(spec: CheckSpec, cfg: ZtiConfig): Promise<CheckResult> {
  return new Promise((resolve) => {
    const provider = spec.provider || 'gcp';
    const env = { ...process.env };
    if (cfg.gcp?.credentialsPath) env.GOOGLE_APPLICATION_CREDENTIALS = cfg.gcp.credentialsPath;

    const args = [provider, '-s', spec.check_id, '-M', 'json-ocsf', '--no-banner'];
    if (provider === 'gcp' && cfg.gcp?.projectId) args.push('--project-ids', cfg.gcp.projectId);

    const proc = spawn('prowler', args, { env });
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('error', (e) => {
      resolve({ result_status: 'error', result: { error: `prowler not runnable: ${e.message}` } });
    });
    proc.on('close', () => {
      try {
        // Prowler JSON-OCSF emits an array of findings (possibly across files);
        // we conservatively scan stdout for FAIL statuses.
        const findings: any[] = [];
        const matches = out.match(/\{[\s\S]*?\}/g) || [];
        for (const m of matches) {
          try {
            const o = JSON.parse(m);
            if (o.status_code || o.status) findings.push(o);
          } catch {
            /* skip partial */
          }
        }
        const anyFail = findings.some((f) => String(f.status_code || f.status).toUpperCase().includes('FAIL'));
        if (findings.length === 0) {
          resolve({ result_status: 'error', result: { error: err || 'no parseable prowler output', raw: out.slice(0, 2000) } });
          return;
        }
        resolve({
          result_status: anyFail ? 'fail' : 'pass',
          result: { mock: false, provider, findings: findings.slice(0, 50), summary: `${findings.length} finding(s)` },
        });
      } catch (e: any) {
        resolve({ result_status: 'error', result: { error: e.message } });
      }
    });
  });
}

export async function runCheck(spec: CheckSpec, cfg: ZtiConfig): Promise<CheckResult> {
  if (cfg.mock) return mockResult(spec);
  return runProwler(spec, cfg);
}
