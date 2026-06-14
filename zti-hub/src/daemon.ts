import { loadConfig } from './config.js';
import { HubApi } from './api.js';
import { runCheck } from './checks.js';

const BEACON_INTERVAL_MS = 60_000;

function ts(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

async function drainQueue(api: HubApi, mock: boolean): Promise<void> {
  for (;;) {
    const jobs = await api.jobsNext(10);
    if (!jobs.length) return;
    console.log(`[${ts()}] claimed ${jobs.length} job(s)`);
    for (const job of jobs) {
      try {
        const result = await runCheck(job, loadConfig());
        await api.postJobResult(job.id as string, result);
        console.log(`         ${job.check_id} → ${result.result_status}`);
      } catch (e: any) {
        try {
          await api.postJobResult(job.id as string, { result_status: 'error', result: { error: e.message } });
        } catch {
          /* best effort */
        }
        console.log(`         ${job.check_id} → error (${e.message})`);
      }
    }
  }
}

export async function startDaemon(): Promise<void> {
  const cfg = loadConfig();
  const api = new HubApi(cfg);

  console.log(`ZTI Hub started — beaconing ${cfg.apiBaseUrl} every ${BEACON_INTERVAL_MS / 1000}s`);
  console.log(`Mode: ${cfg.mock ? 'MOCK (canned results)' : 'REAL (Prowler)'}. Ctrl-C to stop.\n`);

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const { queued } = await api.beacon(
        cfg.gcp ? { gcp_integrated: true, gcp_project_id: cfg.gcp.projectId } : {}
      );
      console.log(`[${ts()}] beacon ok · ${queued} queued`);
      if (queued > 0) await drainQueue(api, cfg.mock);
    } catch (e: any) {
      console.log(`[${ts()}] beacon failed: ${e.message}`);
    } finally {
      running = false;
    }
  };

  await tick();
  const iv = setInterval(tick, BEACON_INTERVAL_MS);
  process.on('SIGINT', () => {
    clearInterval(iv);
    console.log('\nZTI Hub stopped.');
    process.exit(0);
  });
}
