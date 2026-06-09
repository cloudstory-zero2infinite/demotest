// Pure helpers shared by the Platform Analytics cards. No React, no Recharts.
import type { TenantType, UserType } from '../../types';

export type Period = '1W' | '1M' | '1Q' | '1Y';

export const PERIODS: { id: Period; label: string }[] = [
  { id: '1W', label: 'Last week' },
  { id: '1M', label: 'Last month' },
  { id: '1Q', label: 'Last quarter' },
  { id: '1Y', label: 'Last year' },
];

// Consistent colours reused across donut / signup / engagement.
// Orphan = appears in the activity log but is not a member of any tenant.
export const TYPE_COLORS: Record<UserType, string> = {
  consultant: '#6366f1', // indigo
  organisation: '#10b981', // emerald
  orphan: '#9ca3af', // gray
};
export const TYPE_LABELS: Record<UserType, string> = {
  consultant: 'Consultant',
  organisation: 'Organisation',
  orphan: 'Orphan',
};
export const ACCENT = '#0ea5e9'; // sky — single-series charts (feedback, radars)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDay = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
const fmtMonth = (d: Date) => `${MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;

interface Bucket {
  label: string;
  start: number;
  end: number;
}

// Build the time buckets for a period: daily (1W/1M), weekly (1Q), monthly (1Y).
export function makeBuckets(period: Period, now: Date): Bucket[] {
  const buckets: Bucket[] = [];
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };

  if (period === '1W' || period === '1M') {
    const days = period === '1W' ? 7 : 30;
    const today = startOfDay(now);
    for (let i = days - 1; i >= 0; i--) {
      const start = new Date(today);
      start.setDate(today.getDate() - i);
      const end = new Date(start);
      end.setDate(start.getDate() + 1);
      buckets.push({ label: fmtDay(start), start: start.getTime(), end: end.getTime() });
    }
  } else if (period === '1Q') {
    const today = startOfDay(now);
    for (let i = 12; i >= 0; i--) {
      const end = new Date(today);
      end.setDate(today.getDate() - i * 7 + 1);
      const start = new Date(end);
      start.setDate(end.getDate() - 7);
      buckets.push({ label: fmtDay(start), start: start.getTime(), end: end.getTime() });
    }
  } else {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    for (let i = 11; i >= 0; i--) {
      const start = new Date(first.getFullYear(), first.getMonth() - i, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      buckets.push({ label: fmtMonth(start), start: start.getTime(), end: end.getTime() });
    }
  }
  return buckets;
}

const inBucket = (t: number, b: Bucket) => t >= b.start && t < b.end;

// Parse a YYYY-MM-DD as LOCAL midnight (so a campaign date lands in the same
// day-bucket the axis uses, regardless of timezone).
function parseLocalDate(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : new Date(s).getTime();
}

// Which bucket label (x-axis category) a given date falls into, or null if it
// is outside the visible window.
export function bucketLabelForDate(dateStr: string, period: Period, now: Date): string | null {
  const t = parseLocalDate(dateStr);
  const b = makeBuckets(period, now).find((x) => inBucket(t, x));
  return b ? b.label : null;
}

// Multi-series time bucketing, one column per category (e.g. consultant /
// organisation / orphan). Categories not listed in `categories` are ignored.
export function seriesByCategory<C extends string>(
  rows: { date: string | null; category: C }[],
  categories: readonly C[],
  period: Period,
  now: Date
): ({ label: string } & Record<C, number>)[] {
  const buckets = makeBuckets(period, now);
  const zero = () => Object.fromEntries(categories.map((c) => [c, 0])) as Record<C, number>;
  const out = buckets.map((b) => ({ label: b.label, ...zero() }));
  for (const r of rows) {
    if (!r.date || !categories.includes(r.category)) continue;
    const t = new Date(r.date).getTime();
    const idx = buckets.findIndex((b) => inBucket(t, b));
    if (idx >= 0) (out[idx] as Record<C, number>)[r.category] += 1;
  }
  return out;
}

// Single-series time bucketing (e.g. feedback count over time).
export function seriesTotal(
  rows: { date: string | null }[],
  period: Period,
  now: Date
): { label: string; count: number }[] {
  const buckets = makeBuckets(period, now);
  const out = buckets.map((b) => ({ label: b.label, count: 0 }));
  for (const r of rows) {
    if (!r.date) continue;
    const t = new Date(r.date).getTime();
    const idx = buckets.findIndex((b) => inBucket(t, b));
    if (idx >= 0) out[idx].count += 1;
  }
  return out;
}

// Keep only rows whose date falls in the period window (for donut/table totals).
export function withinPeriod<T extends { date: string | null }>(
  rows: T[],
  period: Period,
  now: Date
): T[] {
  const buckets = makeBuckets(period, now);
  const min = buckets[0].start;
  const max = buckets[buckets.length - 1].end;
  return rows.filter((r) => {
    if (!r.date) return false;
    const t = new Date(r.date).getTime();
    return t >= min && t < max;
  });
}

export type EngagementBucket = 'active' | 'less' | 'inactive';
const DAY = 24 * 60 * 60 * 1000;

// Active: login in last 7d. Less active: login in last 30d (excl. active).
// Inactive: no login in >30d, or never logged in (signed up, never checked in).
export function engagementBucket(lastLogin: string | null, now: Date): EngagementBucket {
  if (!lastLogin) return 'inactive';
  const age = now.getTime() - new Date(lastLogin).getTime();
  if (age <= 7 * DAY) return 'active';
  if (age <= 30 * DAY) return 'less';
  return 'inactive';
}

// ───────── Module-usage radar config (editable) ─────────
// Each function maps to one activity-log `module`; spokes match on `action`.
// Risk / Compliance get their own functions once those modules emit logs.
export interface RadarSpoke {
  name: string;
  match: (action: string) => boolean;
}
export interface RadarFunction {
  title: string;
  module: string;
  spokes: RadarSpoke[];
}

const has = (re: RegExp) => (a: string) => re.test(a || '');
const oneOf = (...vals: string[]) => (a: string) => vals.includes(a);

export const RADAR_FUNCTIONS: RadarFunction[] = [
  {
    title: 'Governance',
    module: 'Governance',
    spokes: [
      { name: 'Assets', match: has(/asset/i) },
      { name: 'Controls', match: has(/control/i) },
      { name: 'Vulnerabilities', match: has(/vulnerab/i) },
      { name: 'Capabilities', match: has(/capabilit/i) },
    ],
  },
  {
    title: 'Policy / Compliance',
    module: 'Policy',
    spokes: [
      { name: 'Created', match: oneOf('policy_created') },
      {
        name: 'Updated',
        match: oneOf('policy_content_updated', 'policy_image_uploaded', 'policy_status_changed'),
      },
      { name: 'Submitted', match: oneOf('policy_submitted_for_approval', 'policy_submitted_for_review') },
      { name: 'Reviewed', match: oneOf('policy_reviewed') },
      { name: 'Approved', match: oneOf('policy_approved') },
    ],
  },
  {
    title: 'Program',
    module: 'Program',
    spokes: [
      { name: 'Created', match: has(/created/i) },
      { name: 'Updated', match: has(/updated/i) },
      { name: 'Deleted', match: has(/deleted/i) },
      { name: 'Imported', match: has(/import/i) },
    ],
  },
];

// Build {spoke, value} for one radar function from the moduleUsage payload.
export function radarData(
  fn: RadarFunction,
  moduleUsage: { module: string; action: string; cnt: number }[]
): { spoke: string; value: number }[] {
  const rows = moduleUsage.filter((m) => m.module === fn.module);
  return fn.spokes.map((s) => ({
    spoke: s.name,
    value: rows.filter((r) => s.match(r.action)).reduce((sum, r) => sum + r.cnt, 0),
  }));
}

// ───────── CSV export (XLSX reuses utils/xlsx.ts) ─────────
export function toCsv(rows: Record<string, any>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}

export function downloadCsv(rows: Record<string, any>[], filename: string) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
