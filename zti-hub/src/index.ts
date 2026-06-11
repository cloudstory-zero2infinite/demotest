#!/usr/bin/env node
import { authenticate } from './auth.js';
import { integrateGcp } from './gcp.js';
import { startDaemon } from './daemon.js';
import { checkControl, checkFramework, status, setMode } from './commands.js';

const HELP = `
zti — ZTI Hub CLI

Usage:
  zti authenticate                 Register this machine and store a device token
  zti integrate gcp                Configure read-only GCP access for checks
  zti start                        Run the hub: beacon + process queued checks (every 60s)
  zti check-control <SCF#>         Run checks associated with one SCF control on demand
  zti check-framework <name>       Run checks for every control mapped to a framework
  zti config --real | --mock       Switch between real Prowler scans and mock results
  zti status                       Show config + beacon health
  zti help                         Show this help

Examples:
  zti authenticate
  zti integrate gcp
  zti start
  zti check-control THR-03
  zti check-framework "CIS CSC 8.1"
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
      else console.error('Only `zti integrate gcp` is supported in this phase.');
      break;

    case 'start':
    case 'run':
      await startDaemon();
      break;

    case 'check-control':
      await checkControl(sub);
      break;

    case 'check-framework':
      // Allow unquoted multi-word framework names.
      await checkFramework([sub, ...rest].filter(Boolean).join(' '));
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
