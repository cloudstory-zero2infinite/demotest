import { spawn } from 'node:child_process';
import { loadConfig, saveConfig, configPath } from './config.js';
import { HubApi } from './api.js';
import { ask } from './prompt.js';

function openBrowser(url: string): void {
  const child = process.platform === 'win32'
    // `start` is a cmd builtin on Windows, not an executable.
    ? spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true, windowsHide: true })
    : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore', detached: true });
  child.on('error', () => { /* user can open manually */ });
  child.unref();
}

export async function authenticate(): Promise<void> {
  const cfg = loadConfig();

  console.log('\n┌──────────────────────────────────────────────────────────────┐');
  console.log('│  ZTI Hub authentication                                       │');
  console.log('└──────────────────────────────────────────────────────────────┘\n');

  cfg.apiBaseUrl = await ask('Backend API URL', cfg.apiBaseUrl);
  cfg.appUrl = await ask('Zero-to-Infinite app URL', cfg.appUrl);
  cfg.deviceName = await ask('Device name', cfg.deviceName);

  console.log('\nOpening the app so you can generate a device token:');
  console.log(`  1. Sign in at ${cfg.appUrl}`);
  console.log('  2. Click  Hub online/offline  in the top header (or Profile → ZTI Hub CLI token)');
  console.log('  3. Choose  Generate device token');
  console.log('  4. Copy the device token it shows (shown once)\n');
  const connectUrl = new URL(cfg.appUrl);
  connectUrl.searchParams.set('hubConnect', '1');
  openBrowser(connectUrl.toString());

  const token = await ask('Paste your device token');
  if (!token || !token.startsWith('zti_')) {
    console.error('\n✗ That does not look like a device token (expected to start with "zti_").');
    process.exitCode = 1;
    return;
  }
  cfg.token = token;

  // Verify by beaconing once
  try {
    const api = new HubApi(cfg);
    const r = await api.beacon();
    saveConfig(cfg);
    console.log(`\n✓ Authenticated. Saved to ${configPath()}`);
    console.log(`  ${r.queued} job(s) currently queued. Run \`zti start\` to begin processing.`);
  } catch (e: any) {
    console.error(`\n✗ Token rejected: ${e.message}`);
    process.exitCode = 1;
  }
}
