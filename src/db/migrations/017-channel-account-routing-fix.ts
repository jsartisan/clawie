import type Database from 'better-sqlite3';
import type { Migration } from './index.js';

/**
 * Multi-account routing correctness fix.
 *
 * A Telegram private chat's platform_id is `telegram:<userId>` — the same value
 * for every bot that user DMs. The original `UNIQUE(channel_type, platform_id)`
 * on messaging_groups therefore can't hold two bots' DMs with the same user,
 * and routing/delivery collide. Chat identity must include the bot account.
 *
 * Two changes:
 *   1. `channel_accounts.is_default` — the account that transparently owns
 *      legacy `channel_account IS NULL` chats (so no data backfill is needed
 *      when an existing single-bot install adopts accounts).
 *   2. Widen the messaging_groups unique key to include `channel_account`.
 *
 * The widen requires a table rebuild (SQLite can't alter a UNIQUE constraint).
 * messaging_group_agents and pending_channel_approvals FK into messaging_groups
 * and the central DB runs `foreign_keys = ON`, so DROP TABLE's implicit DELETE
 * would trip FK enforcement — the failure mode that "bit us in migration 011".
 * `defer_foreign_keys` does NOT cover this (verified empirically); the only
 * reliable fix is `PRAGMA foreign_keys = OFF` set OUTSIDE the transaction, so
 * this migration opts in via `disableForeignKeys` and the runner toggles it +
 * runs `foreign_key_check` afterward.
 */
export const migration017: Migration = {
  version: 17,
  name: 'channel-account-routing-fix',
  disableForeignKeys: true,
  up(db: Database.Database) {
    db.exec('ALTER TABLE channel_accounts ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0');

    db.exec(`
      CREATE TABLE messaging_groups_new (
        id                    TEXT PRIMARY KEY,
        channel_type          TEXT NOT NULL,
        platform_id           TEXT NOT NULL,
        name                  TEXT,
        is_group              INTEGER DEFAULT 0,
        unknown_sender_policy TEXT NOT NULL DEFAULT 'strict',
        created_at            TEXT NOT NULL,
        denied_at             TEXT,
        channel_account       TEXT,
        UNIQUE(channel_type, platform_id, channel_account)
      );
      INSERT INTO messaging_groups_new
        (id, channel_type, platform_id, name, is_group, unknown_sender_policy, created_at, denied_at, channel_account)
        SELECT id, channel_type, platform_id, name, is_group, unknown_sender_policy, created_at, denied_at, channel_account
        FROM messaging_groups;
      DROP TABLE messaging_groups;
      ALTER TABLE messaging_groups_new RENAME TO messaging_groups;
    `);
  },
};
