import { spawn } from 'node:child_process';
import { loadConfig, saveConfig, configPath } from './config.js';
import { HubApi } from './api.js';
import { ask } from './prompt.js';

function openBrowser(url: string): void {
  const isWin = process.platform === 'win32';
  const cmd = process.platform === 'darwin' ? 'open' : isWin ? 'cmd' : 'xdg-open';
  const args = isWin ? ['/c', 'start', '""', url] : [url];

  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {
      /* user can open manually */
    });
    child.unref();
  } catch {
    /* user can open manually */
  }
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
  console.log('  2. Go to  Governance → Control Registry');
  console.log('  3. Click the  Hub connect (＋)  button in the toolbar');
  console.log('  4. Copy the device token it shows (shown once)\n');
  openBrowser(cfg.appUrl);

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
