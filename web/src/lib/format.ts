import type { ResourceSchema } from './api';

/** A short, human label for a resource (e.g. "channel-accounts" → "Channel Accounts"). */
export function titleCase(s: string): string {
  return s
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Render a DB cell value for the table. */
export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** The columns worth showing in a list table (skip noisy long ones if needed). */
export function listColumns(resource: ResourceSchema) {
  return resource.columns;
}

/** "3m ago" / "2h ago" / "just now" for an ISO timestamp; falls back to the raw string. */
export function formatRelativeTime(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  const deltaSec = Math.round((Date.now() - ts) / 1000);
  if (deltaSec < 60) return 'just now';
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`;
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}h ago`;
  return `${Math.floor(deltaSec / 86400)}d ago`;
}

/** "in 5m" / "in 3h" / "overdue" for a future ISO timestamp. */
export function formatUntil(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  const deltaSec = Math.round((ts - Date.now()) / 1000);
  if (deltaSec <= 0) return 'due now';
  if (deltaSec < 60) return 'in <1m';
  if (deltaSec < 3600) return `in ${Math.floor(deltaSec / 60)}m`;
  if (deltaSec < 86400) return `in ${Math.floor(deltaSec / 3600)}h`;
  return `in ${Math.floor(deltaSec / 86400)}d`;
}
