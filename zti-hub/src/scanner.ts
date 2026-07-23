import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import type { ZtiConfig } from './config.js';
import { prioritize } from './priority.js';

export type TargetType = 'all' | 'subnet' | 'ip' | 'local';

export interface ScanTarget {
  type: TargetType;
  value?: string; // CIDR for subnet, address for ip; unused for all|local.
}

export interface ScanFinding {
  host: string;
  port?: string;
  cve_id?: string;
  vuln_name: string;
  description?: string;
  cvss_score: number | null;
  severity: string;
  priority: string;
  in_kev: boolean;
  raw?: unknown;
}

// OpenVAS collector payload shape (kept local to avoid cross-module coupling).
interface RawCollectorVuln {
  host: string;
  port?: string;
  cve?: string;
  name: string;
  description?: string;
  severity: string | number;
}

// ── Mock scanner ──────────────────────────────────────────────────────────────
// Deterministic synthetic findings so the demo loop and the GUI work before a
// real Greenbone stack is provisioned. Output is keyed off the target so re-runs
// are stable.
const MOCK_VULNS: Array<{ cve: string; name: string; cvss: number; kev: boolean; desc: string }> = [
  { cve: 'CVE-2021-44228', name: 'Apache Log4j2 Remote Code Execution (Log4Shell)', cvss: 10.0, kev: true, desc: 'JNDI lookup allows attacker-controlled LDAP to execute arbitrary code.' },
  { cve: 'CVE-2014-0160', name: 'OpenSSL Heartbleed Information Disclosure', cvss: 7.5, kev: true, desc: 'Heartbeat extension over-read leaks process memory including private keys.' },
  { cve: 'CVE-2017-0144', name: 'SMBv1 Remote Code Execution (EternalBlue)', cvss: 8.1, kev: true, desc: 'Crafted SMBv1 packets allow remote code execution.' },
  { cve: 'CVE-2019-0708', name: 'RDP Remote Code Execution (BlueKeep)', cvss: 9.8, kev: true, desc: 'Pre-auth RCE in Remote Desktop Services.' },
  { cve: 'CVE-2018-15473', name: 'OpenSSH Username Enumeration', cvss: 5.3, kev: false, desc: 'Timing differences let an attacker enumerate valid usernames.' },
  { cve: 'CVE-2016-2183', name: 'TLS Sweet32 Birthday Attack (3DES)', cvss: 7.5, kev: false, desc: '64-bit block ciphers in TLS permit plaintext recovery.' },
  { cve: 'CVE-2015-4000', name: 'TLS Logjam (weak DH parameters)', cvss: 3.7, kev: false, desc: 'Export-grade Diffie-Hellman can be downgraded and broken.' },
  { cve: 'CVE-2020-1472', name: 'Netlogon Elevation of Privilege (Zerologon)', cvss: 10.0, kev: true, desc: 'Cryptographic flaw in Netlogon allows domain takeover.' },
];

function hostsForTarget(target: ScanTarget): string[] {
  if (target.type === 'local') return ['127.0.0.1'];
  if (target.type === 'ip' && target.value) return [target.value];
  if (target.type === 'subnet' && target.value) {
    // Derive a few stable hosts from the CIDR base for a believable mock.
    const base = target.value.split('/')[0].split('.').slice(0, 3).join('.');
    return [`${base}.10`, `${base}.20`, `${base}.51`];
  }
  // 'all'
  return ['10.0.0.10', '10.0.0.20', '10.0.1.30', '192.168.1.5'];
}

function mockScan(target: ScanTarget): ScanFinding[] {
  const hosts = hostsForTarget(target);
  const findings: ScanFinding[] = [];
  for (const host of hosts) {
    // Deterministically pick 1–3 vulns per host from the catalogue.
    const seed = crypto.createHash('md5').update(host).digest();
    const count = (seed[0] % 3) + 1;
    for (let i = 0; i < count; i++) {
      const v = MOCK_VULNS[(seed[i + 1] ?? seed[0]) % MOCK_VULNS.length];
      const { severity, priority } = prioritize(v.cvss, v.kev);
      findings.push({
        host,
        port: ['443', '22', '445', '3389'][seed[i] % 4],
        cve_id: v.cve,
        vuln_name: v.name,
        description: v.desc,
        cvss_score: v.cvss,
        severity,
        priority,
        in_kev: v.kev,
        raw: { mock: true, host, cve: v.cve, cvss: v.cvss },
      });
    }
  }
  // De-dupe (host+cve) in case of collisions.
  const seen = new Set<string>();
  return findings.filter((f) => {
    const k = `${f.host}|${f.cve_id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ── Real scanner (experimental) ───────────────────────────────────────────────
// Drives a running Greenbone/GVM instance via gvm-cli. A full GMP scan is a
// multi-step workflow (create target → create task → start → poll → get report);
// here we run a connectivity probe and surface a clear error until the full
// orchestration is enabled in Phase 5. Treat as experimental, mirroring runProwler.
function realScan(target: ScanTarget, cfg: ZtiConfig): Promise<ScanFinding[]> {
  return new Promise((resolve, reject) => {
    const gvm = cfg.gvm || {};
    const conn = gvm.socketPath
      ? ['socket', '--socketpath', gvm.socketPath]
      : ['tls', '--hostname', gvm.host || '127.0.0.1', '--port', String(gvm.port || 9390)];
    const args = [...conn];
    if (gvm.user) args.push('--gmp-username', gvm.user);
    if (gvm.password) args.push('--gmp-password', gvm.password);
    args.push('--xml', '<get_version/>');

    const proc = spawn('gvm-cli', args);
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('error', (e) =>
      reject(new Error(`gvm-cli not runnable (install Greenbone gvm-tools): ${e.message}`))
    );
    proc.on('close', (code) => {
      if (code !== 0 || !/get_version_response/.test(out)) {
        reject(new Error(`GVM connectivity failed: ${err || out || 'no response'}`));
        return;
      }
      // Connectivity OK but full scan orchestration is not yet wired (Phase 5).
      reject(
        new Error(
          'GVM reachable, but real scan orchestration is not enabled yet (Phase 5). Use zti config --mock for now.'
        )
      );
    });
  });
}

export async function runScan(target: ScanTarget, cfg: ZtiConfig): Promise<ScanFinding[]> {
  if (cfg.mock) return mockScan(target);
  return realScan(target, cfg);
}

export function summarize(findings: ScanFinding[]) {
  const by = (s: string) => findings.filter((f) => f.severity === s).length;
  return {
    total: findings.length,
    critical: by('Critical'),
    high: by('High'),
    medium: by('Medium'),
    low: by('Low'),
    info: by('Info'),
    kev: findings.filter((f) => f.in_kev).length,
  };
}

// Converts raw vulnerability rows (OpenVAS/local collectors) into staged findings.
export function rawVulnsToScanFindings(rawVulns: RawCollectorVuln[]): ScanFinding[] {
  return rawVulns.map((v) => {
    const cvss = typeof v.severity === 'number' ? v.severity : parseFloat(String(v.severity)) || 0;
    const { severity, priority } = prioritize(cvss, false);
    return {
      host: v.host || 'Unknown Host',
      port: v.port || 'general',
      cve_id: v.cve && v.cve !== 'N/A' ? v.cve : undefined,
      vuln_name: v.name || 'Vulnerability',
      description: v.description || '',
      cvss_score: cvss || null,
      severity,
      priority,
      in_kev: false,
      raw: v,
    };
  });
}
