import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { ztiDir, ensureDir } from './config.js';

// ════════════════════════════════════════════════════════════════════════════
//  Managed Prowler runtime
//  ZTI-HUB owns an isolated CPython + Prowler so users never run pip/Docker.
//  We use `uv` (a single static binary) to (a) create a venv with a managed
//  Python it downloads on demand, and (b) install a pinned Prowler into it.
//  Everything lives under ~/.zti/runtime so it is fully self-contained and
//  removable. Nothing touches the system Python or PATH.
// ════════════════════════════════════════════════════════════════════════════

const RUNTIME_DIR = ztiDir('runtime');
const BIN_DIR = ztiDir('bin');
const VENV_DIR = path.join(RUNTIME_DIR, 'prowler-venv');
const PY_INSTALL_DIR = path.join(RUNTIME_DIR, 'python');
const UV_CACHE_DIR = path.join(RUNTIME_DIR, 'uv-cache');

// uv is fetched from GitHub. We default to the "latest" redirect so a pinned
// version that no longer exists can never 404 the bootstrap; pin explicitly via
// ZTI_UV_VERSION when reproducibility matters.
const UV_VERSION = process.env.ZTI_UV_VERSION || 'latest';

// Prowler is bounded to the v5 major (stable CLI/JSON-OCSF contract). Pin an
// exact version with ZTI_PROWLER_VERSION for reproducible runs.
const PROWLER_SPEC = process.env.ZTI_PROWLER_VERSION
  ? `prowler==${process.env.ZTI_PROWLER_VERSION}`
  : 'prowler<6';

const PROWLER_BIN_OVERRIDE = process.env.ZTI_PROWLER_BIN || '';

const isWindows = process.platform === 'win32';
const exe = (name: string) => (isWindows ? `${name}.exe` : name);

export interface RuntimeInfo {
  uvPath: string | null;
  uvVersion: string | null;
  uvSource: 'system' | 'managed' | null;
  prowlerPath: string | null;
  prowlerVersion: string | null;
  prowlerReady: boolean;
  runtimeDir: string;
}

// ── small process helper ──────────────────────────────────────────────────────
function run(
  cmd: string,
  args: string[],
  opts: { env?: NodeJS.ProcessEnv; stream?: boolean } = {}
): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...(opts.env || {}) } });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => {
      out += d;
      if (opts.stream) process.stdout.write(d);
    });
    p.stderr.on('data', (d) => {
      err += d;
      if (opts.stream) process.stderr.write(d);
    });
    p.on('error', (e) => resolve({ code: -1, out, err: `${err}${e.message}` }));
    p.on('close', (code) => resolve({ code: code ?? -1, out, err }));
  });
}

async function tryVersion(cmd: string, args = ['--version']): Promise<string | null> {
  const r = await run(cmd, args);
  if (r.code !== 0) return null;
  return (r.out || r.err).trim().split('\n')[0] || null;
}

// ── uv acquisition ──────────────────────────────────────────────────────────
function managedUvPath(): string {
  return path.join(BIN_DIR, exe('uv'));
}

function uvAsset(): { asset: string; kind: 'tar' | 'zip' } | null {
  const arch = process.arch; // 'arm64' | 'x64'
  if (process.platform === 'darwin') {
    if (arch === 'arm64') return { asset: 'uv-aarch64-apple-darwin.tar.gz', kind: 'tar' };
    if (arch === 'x64') return { asset: 'uv-x86_64-apple-darwin.tar.gz', kind: 'tar' };
  }
  if (process.platform === 'linux') {
    if (arch === 'arm64') return { asset: 'uv-aarch64-unknown-linux-gnu.tar.gz', kind: 'tar' };
    if (arch === 'x64') return { asset: 'uv-x86_64-unknown-linux-gnu.tar.gz', kind: 'tar' };
  }
  if (process.platform === 'win32' && arch === 'x64') {
    return { asset: 'uv-x86_64-pc-windows-msvc.zip', kind: 'zip' };
  }
  return null;
}

function uvDownloadUrl(asset: string): string {
  return UV_VERSION === 'latest'
    ? `https://github.com/astral-sh/uv/releases/latest/download/${asset}`
    : `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${asset}`;
}

async function fetchToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`download failed (${res.status}) for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// Best-effort integrity check against the published <asset>.sha256 sidecar.
async function verifyChecksum(url: string, buf: Buffer): Promise<'ok' | 'skipped'> {
  try {
    const res = await fetch(`${url}.sha256`, { redirect: 'follow' });
    if (!res.ok) return 'skipped';
    const expected = (await res.text()).trim().split(/\s+/)[0]?.toLowerCase();
    if (!expected) return 'skipped';
    const actual = crypto.createHash('sha256').update(buf).digest('hex');
    if (actual !== expected) throw new Error('uv checksum mismatch — refusing to use download');
    return 'ok';
  } catch (e: any) {
    if (/checksum mismatch/.test(e.message)) throw e;
    return 'skipped';
  }
}

function findFileRecursive(dir: string, name: string): string | null {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = findFileRecursive(full, name);
      if (hit) return hit;
    } else if (entry.name === name) {
      return full;
    }
  }
  return null;
}

// Returns a path to a usable uv, preferring a system install, else downloading
// our own managed copy under ~/.zti/bin.
async function ensureUv(log: (m: string) => void): Promise<{ path: string; source: 'system' | 'managed' }> {
  // 1. System uv on PATH?
  if (await tryVersion('uv')) return { path: 'uv', source: 'system' };

  // 2. Previously downloaded managed uv?
  const managed = managedUvPath();
  if (fs.existsSync(managed) && (await tryVersion(managed))) {
    return { path: managed, source: 'managed' };
  }

  // 3. Download it.
  const asset = uvAsset();
  if (!asset) {
    throw new Error(
      `No prebuilt uv for ${process.platform}/${process.arch}. Install uv manually (https://docs.astral.sh/uv/) or set it on PATH.`
    );
  }
  ensureDir(BIN_DIR);
  const url = uvDownloadUrl(asset.asset);
  log(`Downloading uv (${asset.asset})…`);
  const buf = await fetchToBuffer(url);
  const verified = await verifyChecksum(url, buf);
  log(verified === 'ok' ? 'uv checksum verified.' : 'uv checksum sidecar unavailable — skipped.');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zti-uv-'));
  const archivePath = path.join(tmp, asset.asset);
  fs.writeFileSync(archivePath, buf);

  if (asset.kind === 'tar') {
    const r = await run('tar', ['-xzf', archivePath, '-C', tmp]);
    if (r.code !== 0) throw new Error(`failed to extract uv: ${r.err}`);
  } else {
    throw new Error('Automatic uv install on Windows is not wired yet — install uv manually and re-run.');
  }

  const extracted = findFileRecursive(tmp, exe('uv'));
  if (!extracted) throw new Error('uv binary not found in downloaded archive');
  fs.copyFileSync(extracted, managed);
  fs.chmodSync(managed, 0o755);
  fs.rmSync(tmp, { recursive: true, force: true });

  if (!(await tryVersion(managed))) throw new Error('downloaded uv is not runnable');
  return { path: managed, source: 'managed' };
}

// ── Prowler venv ──────────────────────────────────────────────────────────────
function venvPython(): string {
  return isWindows
    ? path.join(VENV_DIR, 'Scripts', exe('python'))
    : path.join(VENV_DIR, 'bin', 'python');
}

export function prowlerBinPath(): string {
  if (PROWLER_BIN_OVERRIDE) return PROWLER_BIN_OVERRIDE;
  return isWindows
    ? path.join(VENV_DIR, 'Scripts', exe('prowler'))
    : path.join(VENV_DIR, 'bin', 'prowler');
}

// Env that keeps every uv side effect (downloaded pythons, cache) inside ~/.zti.
function uvEnv(): NodeJS.ProcessEnv {
  return {
    UV_PYTHON_INSTALL_DIR: PY_INSTALL_DIR,
    UV_CACHE_DIR: UV_CACHE_DIR,
    UV_PYTHON_PREFERENCE: 'only-managed', // never touch a system python
  };
}

// Provisions (or reuses) the managed Prowler. Idempotent; streams progress.
export async function ensureProwler(opts: { force?: boolean } = {}): Promise<{ prowlerPath: string; prowlerVersion: string }> {
  const log = (m: string) => console.log(`  ${m}`);

  if (PROWLER_BIN_OVERRIDE) {
    const v = await tryVersion(PROWLER_BIN_OVERRIDE, ['--version']);
    if (!v) throw new Error(`ZTI_PROWLER_BIN is set but not runnable: ${PROWLER_BIN_OVERRIDE}`);
    return { prowlerPath: PROWLER_BIN_OVERRIDE, prowlerVersion: v };
  }

  // Fast path: already installed.
  if (!opts.force && fs.existsSync(prowlerBinPath())) {
    const v = await tryVersion(prowlerBinPath(), ['--version']);
    if (v) return { prowlerPath: prowlerBinPath(), prowlerVersion: v };
  }

  console.log('Setting up the scan engine (first run only, this can take a minute)…');
  ensureDir(RUNTIME_DIR);
  const uv = await ensureUv(log);
  log(`uv ready (${uv.source}).`);

  // Create the isolated venv with a uv-managed Python (downloaded if needed).
  log('Creating isolated Python environment…');
  const venv = await run(uv.path, ['venv', VENV_DIR, '--python', '3.12'], { env: uvEnv(), stream: true });
  if (venv.code !== 0) throw new Error(`uv venv failed: ${venv.err || venv.out}`);

  // Install pinned Prowler into the venv.
  log(`Installing ${PROWLER_SPEC} (this is the slow part)…`);
  const install = await run(
    uv.path,
    ['pip', 'install', '--python', venvPython(), PROWLER_SPEC],
    { env: uvEnv(), stream: true }
  );
  if (install.code !== 0) throw new Error(`prowler install failed: ${install.err || install.out}`);

  const version = await tryVersion(prowlerBinPath(), ['--version']);
  if (!version) throw new Error('Prowler installed but is not runnable');

  // The wheel cache (~1GB) is redundant now the venv is built — reclaim it.
  // Best-effort: a failure here doesn't affect the working runtime.
  log('Cleaning up download cache…');
  await run(uv.path, ['cache', 'clean'], { env: uvEnv() });

  console.log(`✓ Scan engine ready — ${version}`);
  return { prowlerPath: prowlerBinPath(), prowlerVersion: version };
}

// Non-mutating status snapshot for `zti doctor`.
export async function runtimeStatus(): Promise<RuntimeInfo> {
  let uvPath: string | null = null;
  let uvSource: 'system' | 'managed' | null = null;
  if (await tryVersion('uv')) {
    uvPath = 'uv';
    uvSource = 'system';
  } else if (fs.existsSync(managedUvPath()) && (await tryVersion(managedUvPath()))) {
    uvPath = managedUvPath();
    uvSource = 'managed';
  }
  const uvVersion = uvPath ? await tryVersion(uvPath) : null;

  const prowlerPath = fs.existsSync(prowlerBinPath()) || PROWLER_BIN_OVERRIDE ? prowlerBinPath() : null;
  const prowlerVersion = prowlerPath ? await tryVersion(prowlerPath, ['--version']) : null;

  return {
    uvPath,
    uvVersion,
    uvSource,
    prowlerPath,
    prowlerVersion,
    prowlerReady: !!prowlerVersion,
    runtimeDir: RUNTIME_DIR,
  };
}

// Env a Prowler invocation should run with (keeps caches contained).
export function prowlerRunEnv(): NodeJS.ProcessEnv {
  return uvEnv();
}
