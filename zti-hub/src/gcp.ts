import fs from 'node:fs';
import { loadConfig, saveConfig } from './config.js';
import { HubApi } from './api.js';
import { ask } from './prompt.js';

export async function integrateGcp(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.token) {
    console.error('Not authenticated. Run `zti authenticate` first.');
    process.exitCode = 1;
    return;
  }

  console.log('\nZTI Hub needs read-only access to your GCP project to run checks.');
  console.log('Provide a service-account key with Viewer / Security Reviewer roles,');
  console.log('or leave the key path blank to use Application Default Credentials.\n');

  const projectId = await ask('GCP project id', cfg.gcp?.projectId || '');
  const credentialsPath = await ask('Path to read-only service-account key JSON (blank = ADC)', cfg.gcp?.credentialsPath || '');

  if (credentialsPath && !fs.existsSync(credentialsPath)) {
    console.error(`\n✗ No file at ${credentialsPath}`);
    process.exitCode = 1;
    return;
  }

  cfg.gcp = { projectId: projectId || undefined, credentialsPath: credentialsPath || undefined };
  saveConfig(cfg);

  // Tell the backend this device now has GCP wired (flips the gcp_integrated flag).
  try {
    const api = new HubApi(cfg);
    await api.beacon({ gcp_integrated: true, gcp_project_id: projectId || undefined });
    console.log('\n✓ GCP integration saved and reported to ZTI Hub.');
  } catch (e: any) {
    console.log(`\n✓ GCP integration saved locally (beacon failed: ${e.message}).`);
  }

  if (cfg.mock) {
    console.log('\nNote: hub is in --mock mode. Run `zti config --real` to execute real Prowler scans.');
  }
}
