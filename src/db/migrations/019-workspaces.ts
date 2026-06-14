import type { Migration } from './index.js';

/**
 * Single-instance multi-tenancy: workspaces.
 *
 * A workspace is a tenant boundary inside one clawie install. Scoping is
 * deliberately shallow — only three tables carry `workspace_id`:
 *
 *   portal_accounts  — which workspace a signed-in human belongs to
 *   agent_groups     — which workspace owns an agent (everything else hangs
 *                      off agent groups: sessions, configs, wirings, folders)
 *   channel_accounts — which workspace owns a connected bot
 *
 * Everything that already exists is claimed by a default workspace, and the
 * earliest portal account becomes the operator (sees all workspaces, keeps
 * the raw/Advanced surfaces). New signups get a fresh workspace each.
 */
export const migration019: Migration = {
  version: 19,
  name: '019-workspaces',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    db.prepare('ALTER TABLE portal_accounts ADD COLUMN workspace_id TEXT').run();
    db.prepare('ALTER TABLE portal_accounts ADD COLUMN is_operator INTEGER NOT NULL DEFAULT 0').run();
    db.prepare('ALTER TABLE agent_groups ADD COLUMN workspace_id TEXT').run();
    db.prepare('ALTER TABLE channel_accounts ADD COLUMN workspace_id TEXT').run();

    db.prepare("INSERT INTO workspaces (id, name, created_at) VALUES ('ws-default', 'Default workspace', ?)").run(
      new Date().toISOString(),
    );
    db.prepare("UPDATE agent_groups SET workspace_id = 'ws-default'").run();
    db.prepare("UPDATE channel_accounts SET workspace_id = 'ws-default'").run();
    db.prepare("UPDATE portal_accounts SET workspace_id = 'ws-default'").run();
    db.prepare(
      'UPDATE portal_accounts SET is_operator = 1 WHERE id = (SELECT id FROM portal_accounts ORDER BY created_at, id LIMIT 1)',
    ).run();
  },
};
