import type { Migration } from './index.js';

/**
 * Portal sign-in accounts (email + password) and their browser sessions.
 *
 * These are *operator* accounts for the web portal — distinct from the
 * `users` table, which holds platform identities (telegram:..., slack:...)
 * of people the agents talk to. Passwords are scrypt hashes; session rows
 * store only a SHA-256 of the cookie token so a DB read can't be replayed.
 */
export const migration018: Migration = {
  version: 18,
  name: '018-portal-accounts',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS portal_accounts (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name          TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at    TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS portal_sessions (
        token_hash  TEXT PRIMARY KEY,
        account_id  TEXT NOT NULL REFERENCES portal_accounts(id) ON DELETE CASCADE,
        created_at  TEXT NOT NULL,
        expires_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_portal_sessions_account ON portal_sessions(account_id);
    `);
  },
};
