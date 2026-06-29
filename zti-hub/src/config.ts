import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface ZtiConfig {
  apiBaseUrl: string;
  appUrl: string;
  token: string | null;
  deviceName: string;
  mock: boolean;
  gcp?: {
    projectId?: string;
    credentialsPath?: string;
  };
  // OpenVAS / Greenbone (GVM) connection for `zti vuln-scan` real mode.
  // Empty/omitted → mock findings (default). Real mode shells out to `gvm-cli`.
  gvm?: {
    host?: string;        // GMP host (default 127.0.0.1)
    port?: number;        // GMP TLS port (default 9390)
    user?: string;
    password?: string;
    socketPath?: string;  // unix socket alternative to host/port
  };
}

const CONFIG_DIR = path.join(os.homedir(), '.zti');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

const DEFAULTS: ZtiConfig = {
  apiBaseUrl: process.env.ZTI_API_BASE_URL || 'http://localhost:3001',
  appUrl: process.env.ZTI_APP_URL || 'http://localhost:5174',
  token: null,
  deviceName: `zti-hub@${os.hostname()}`,
  // Default to mock so the demo loop works before real GCP/Prowler is wired.
  mock: true,
};

export function loadConfig(): ZtiConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(cfg: ZtiConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

export function configPath(): string {
  return CONFIG_PATH;
}

// Local state directories under ~/.zti (created lazily, owner-only).
export function ztiDir(...parts: string[]): string {
  const p = path.join(CONFIG_DIR, ...parts);
  return p;
}

export function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function scansDir(): string {
  return ensureDir(path.join(CONFIG_DIR, 'scans'));
}

export function cspmDir(): string {
  return ensureDir(path.join(CONFIG_DIR, 'cspm'));
}

export function logsDir(): string {
  return ensureDir(path.join(CONFIG_DIR, 'logs'));
}
