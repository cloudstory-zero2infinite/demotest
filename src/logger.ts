import fs from 'node:fs';
import path from 'node:path';
import { logsDir } from './config.js';

// Structured JSONL log at ~/.zti/logs/zti-cli.log. Every notable CLI action is
// appended here (auth, scan consent, scan start/finish, workspace push, errors)
// and surfaced by `zti cli-logs`.

const LOG_PATH = path.join(logsDir(), 'zti-cli.log');

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: string;
  level: LogLevel;
  event: string;
  [key: string]: unknown;
}

export function log(level: LogLevel, event: string, data: Record<string, unknown> = {}): void {
  const entry: LogEntry = { ts: new Date().toISOString(), level, event, ...data };
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n', { mode: 0o600 });
  } catch {
    /* logging must never break the command */
  }
}

export const logInfo = (event: string, data?: Record<string, unknown>) => log('info', event, data);
export const logWarn = (event: string, data?: Record<string, unknown>) => log('warn', event, data);
export const logError = (event: string, data?: Record<string, unknown>) => log('error', event, data);

export function logPath(): string {
  return LOG_PATH;
}

// Read the last `n` entries (most-recent last), tolerant of partial lines.
export function readLogs(n = 50): LogEntry[] {
  let raw = '';
  try {
    raw = fs.readFileSync(LOG_PATH, 'utf8');
  } catch {
    return [];
  }
  const lines = raw.split('\n').filter(Boolean);
  const tail = lines.slice(-n);
  const out: LogEntry[] = [];
  for (const line of tail) {
    try {
      out.push(JSON.parse(line) as LogEntry);
    } catch {
      /* skip corrupt line */
    }
  }
  return out;
}
