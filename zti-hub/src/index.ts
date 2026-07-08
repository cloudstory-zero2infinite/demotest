#!/usr/bin/env node
import { authenticate } from './auth.js';
import { integrateGcp } from './gcp.js';
import { startDaemon } from './daemon.js';
import { checkControl, checkFramework, status, setMode, cliLogs, setupProwler, doctor } from './commands.js';
import { vulnScan, scanWorker } from './vulnscan.js';
import { cspm } from './cspm.js';
import { completion } from './completion.js';
import { integrateWazuh, ingestWazuh } from './wazuh.js';

const HELP = `
zti — ZTI Hub CLI

Usage:
  zti authenticate                 Register this machine and store a device token
  zti integrate gcp                Configure read-only GCP access for checks
  zti integrate ad                 Configure AD/LDAP integration for AD audits
  zti integrate openvas            Configure OpenVAS/GVM integration for vuln ingestion
  zti integrate wazuh              Configure Wazuh integration settings
  zti integrate prowler            Install the managed Prowler scan engine (no pip/Docker needed)
  zti ingest <openvas|wazuh>       Fetch and display vulnerability scan results
  zti doctor                       Show scan-engine + integration health
  zti start                        Run the hub: beacon + process queued checks (every 60s)
  zti check-control <SCF#>         Run checks associated with one SCF control on demand
  zti check-framework <name>       Run checks for every control mapped to a framework
  zti vuln-scan <target>           Run an OpenVAS vulnerability scan (all|subnet <CIDR>|ip <addr>|local)
  zti vuln-scan report [job-id]    Show scan results; optionally send to your ZTI workspace
  zti cspm scan [scope]            Run a CSPM posture scan (all | framework <name> | control <SCF#> | provider <gcp>)
  zti cspm report [job-id]         Show CSPM results; optionally send to your ZTI workspace
  zti cli-logs [--tail N]          Show the local CLI activity log
  zti config --real | --mock       Switch between real scans and mock results
  zti completion bash | zsh        Print a shell tab-completion script
  zti status                       Show config + beacon health
  zti help                         Show this help

Examples:
  zti authenticate
  zti vuln-scan subnet 10.0.0.0/24
  zti vuln-scan report
  zti check-control THR-03
  zti cli-logs --tail 20
`;

async function main() {
  const [cmd, sub, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case 'authenticate':
    case 'auth':
    case 'login':
      await authenticate();
      break;

    case 'integrate':
      if (sub === 'gcp') await integrateGcp();
      else if (sub === 'ad') {
        const { integrateActiveDirectory } = await import('./activedirectory.js');
        await integrateActiveDirectory();
      } else if (sub === 'openvas') {
        const { integrateOpenvas } = await import('./openvas.js');
        await integrateOpenvas();
      } else if (sub === 'wazuh') await integrateWazuh();
      else if (sub === 'prowler') await setupProwler();
      else console.error('Usage: zti integrate gcp | ad | openvas | wazuh | prowler');
      break;

    case 'ingest':
      if (sub === 'openvas') {
        const { ingestOpenvas } = await import('./openvas.js');
        await ingestOpenvas();
      } else if (sub === 'wazuh') {
        await ingestWazuh();
      } else {
        console.error('Usage: zti ingest openvas | wazuh');
        process.exitCode = 1;
      }
      break;

    case 'doctor':
      await doctor();
      break;

    case 'start':
    case 'run':
      await startDaemon();
      break;

    case 'check-control':
      await checkControl(sub);
      break;

    case 'check-framework':
      // Allow unquoted multi-word framework names
      await checkFramework([sub, ...rest].filter(Boolean).join(' '));
      break;

    case 'vuln-scan':
      await vulnScan(sub, rest);
      break;

    case 'cspm':
      await cspm(sub, rest);
      break;

    // Hidden: detached worker that actually runs a scan (spawned by vuln-scan).
    case '__scan-worker':
      await scanWorker(sub, rest[0], rest[1] || '');
      break;

    case 'cli-logs':
    case 'logs':
      cliLogs([sub, ...rest].filter(Boolean));
      break;

    case 'completion':
      completion(sub);
      break;

    case 'config':
      if (sub === '--real') setMode(true);
      else if (sub === '--mock') setMode(false);
      else console.error('Usage: zti config --real | --mock');
      break;

    case 'status':
      await status();
      break;

    case 'help':
    case '--help':
    case '-h':
    case undefined:
      console.log(HELP);
      break;

    default:
      console.error(`Unknown command: ${cmd}\n${HELP}`);
      process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(`\nError: ${e?.message || e}`);
  process.exitCode = 1;
});
