import type { Migration } from './index.js';

/**
 * Revert multi-tenancy: drop the workspaces table and workspace_id / is_operator
 * columns added by migration 019. All portal accounts share a single flat
 * namespace — no tenant isolation.
 */
export const migration020: Migration = {
  version: 20,
  name: '020-drop-workspaces',
  up: (db) => {
    // SQLite doesn't support DROP COLUMN before 3.35 — rebuild each table
    // without the column using the standard copy-rename dance.

    db.exec(`
      CREATE TABLE portal_accounts_new (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name          TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at    TEXT NOT NULL
      );
      INSERT INTO portal_accounts_new (id, email, name, password_hash, created_at)
        SELECT id, email, name, password_hash, created_at FROM portal_accounts;
      DROP TABLE portal_accounts;
      ALTER TABLE portal_accounts_new RENAME TO portal_accounts;

      CREATE TABLE agent_groups_new (
        id             TEXT PRIMARY KEY,
        name           TEXT NOT NULL,
        folder         TEXT NOT NULL UNIQUE,
        agent_provider TEXT,
        created_at     TEXT NOT NULL
      );
      INSERT INTO agent_groups_new (id, name, folder, agent_provider, created_at)
        SELECT id, name, folder, agent_provider, created_at FROM agent_groups;
      DROP TABLE agent_groups;
      ALTER TABLE agent_groups_new RENAME TO agent_groups;

      CREATE TABLE channel_accounts_new (
        id                    TEXT PRIMARY KEY,
        channel_type          TEXT NOT NULL,
        account_id            TEXT NOT NULL,
        default_agent_group_id TEXT,
        is_default            INTEGER NOT NULL DEFAULT 0,
        created_at            TEXT NOT NULL,
        UNIQUE(channel_type, account_id)
      );
      INSERT INTO channel_accounts_new
        (id, channel_type, account_id, default_agent_group_id, is_default, created_at)
        SELECT id, channel_type, account_id, default_agent_group_id, is_default, created_at
        FROM channel_accounts;
      DROP TABLE channel_accounts;
      ALTER TABLE channel_accounts_new RENAME TO channel_accounts;

      DROP TABLE IF EXISTS workspaces;
    `);
  },
  disableForeignKeys: true,
};
