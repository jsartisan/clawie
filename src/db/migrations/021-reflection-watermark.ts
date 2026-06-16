import type { Migration } from './index.js';

/**
 * Incremental-reflection watermark. The host reflection pass reads only
 * messages newer than this timestamp, so a long-lived session is reflected
 * repeatedly (as new turns arrive) instead of exactly once. NULL = never
 * reflected.
 */
export const migration021: Migration = {
  version: 21,
  name: '021-reflection-watermark',
  up: (db) => {
    db.exec(`ALTER TABLE sessions ADD COLUMN last_reflected_at TEXT`);
  },
};
