import type Database from 'better-sqlite3';
import type { Migration } from './index.js';

/**
 * Multi-account channel routing.
 *
 * `channel_accounts` — the bot/app -> default-agent mapping (plaintext, safe to
 * list/query). `channel_account_secrets` — per-account tokens encrypted at rest
 * (AES-256-GCM, see src/crypto/secrets.ts), never printed. `messaging_groups`
 * gains `channel_account` so delivery can pick the bot that owns a chat.
 */
export const migration016: Migration = {
  version: 16,
  name: 'channel-accounts',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE channel_accounts (
        id                     TEXT PRIMARY KEY,
        channel_type           TEXT NOT NULL,
        account_id             TEXT NOT NULL,
        default_agent_group_id TEXT,
        created_at             TEXT NOT NULL,
        UNIQUE (channel_type, account_id)
      );
      CREATE TABLE channel_account_secrets (
        channel_account_id TEXT NOT NULL,
        name               TEXT NOT NULL,
        value_encrypted    TEXT NOT NULL,
        created_at         TEXT NOT NULL,
        PRIMARY KEY (channel_account_id, name)
      );
    `);
    db.prepare('ALTER TABLE messaging_groups ADD COLUMN channel_account TEXT').run();
  },
};
