/**
 * Direct test of the migration-017 table rebuild against a *populated* pre-017
 * schema. The suite's other tests run migrations on fresh DBs, so they never
 * exercise the dangerous path: dropping/recreating messaging_groups while
 * child rows FK into it with `foreign_keys = ON`. This reproduces that exact
 * shape to prove the `defer_foreign_keys` approach preserves data and FKs.
 */
import Database from 'better-sqlite3';
import { describe, it, expect } from 'vitest';

import { migration017 } from './017-channel-account-routing-fix.js';

function pre017Db(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  // Minimal slice of the real schema as it stands after migration 016.
  db.exec(`
    CREATE TABLE agent_groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, folder TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
    CREATE TABLE messaging_groups (
      id TEXT PRIMARY KEY,
      channel_type TEXT NOT NULL,
      platform_id TEXT NOT NULL,
      name TEXT,
      is_group INTEGER DEFAULT 0,
      unknown_sender_policy TEXT NOT NULL DEFAULT 'strict',
      created_at TEXT NOT NULL,
      denied_at TEXT,
      channel_account TEXT,
      UNIQUE(channel_type, platform_id)
    );
    CREATE TABLE messaging_group_agents (
      id TEXT PRIMARY KEY,
      messaging_group_id TEXT NOT NULL REFERENCES messaging_groups(id),
      agent_group_id TEXT NOT NULL REFERENCES agent_groups(id),
      created_at TEXT NOT NULL
    );
    CREATE TABLE pending_channel_approvals (
      messaging_group_id TEXT PRIMARY KEY REFERENCES messaging_groups(id),
      created_at TEXT NOT NULL
    );
    CREATE TABLE channel_accounts (
      id TEXT PRIMARY KEY,
      channel_type TEXT NOT NULL,
      account_id TEXT NOT NULL,
      default_agent_group_id TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (channel_type, account_id)
    );
  `);
  const t = '2026-01-01T00:00:00.000Z';
  db.prepare('INSERT INTO agent_groups VALUES (?,?,?,?)').run('ag-1', 'RoRo', 'roro', t);
  db.prepare(
    'INSERT INTO messaging_groups (id, channel_type, platform_id, name, is_group, unknown_sender_policy, created_at) VALUES (?,?,?,?,?,?,?)',
  ).run('mg-1', 'telegram', 'telegram:42', 'dm', 0, 'strict', t);
  db.prepare('INSERT INTO messaging_group_agents VALUES (?,?,?,?)').run('mga-1', 'mg-1', 'ag-1', t);
  db.prepare('INSERT INTO pending_channel_approvals VALUES (?,?)').run('mg-1', t);
  return db;
}

describe('migration 017 rebuild with FK children', () => {
  it('preserves data and FK references through the constraint widen', () => {
    const db = pre017Db();
    expect(migration017.disableForeignKeys).toBe(true);
    // Mirror the runner: FKs OFF outside the transaction, rebuild inside it,
    // then FKs back ON.
    db.pragma('foreign_keys = OFF');
    expect(() => db.transaction(() => migration017.up(db))()).not.toThrow();
    db.pragma('foreign_keys = ON');

    // Parent row preserved.
    const mg = db.prepare('SELECT id FROM messaging_groups WHERE id = ?').get('mg-1') as { id: string };
    expect(mg.id).toBe('mg-1');
    // Child rows preserved.
    expect(db.prepare('SELECT COUNT(*) AS n FROM messaging_group_agents').get()).toEqual({ n: 1 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM pending_channel_approvals').get()).toEqual({ n: 1 });
    // No dangling FKs.
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);

    // Widened constraint: a second bot's chat with the same platform_id now fits.
    expect(() =>
      db
        .prepare(
          'INSERT INTO messaging_groups (id, channel_type, platform_id, is_group, unknown_sender_policy, created_at, channel_account) VALUES (?,?,?,?,?,?,?)',
        )
        .run('mg-2', 'telegram', 'telegram:42', 0, 'strict', '2026-01-02T00:00:00.000Z', 'work'),
    ).not.toThrow();

    // is_default column added.
    const cols = (db.prepare("PRAGMA table_info('channel_accounts')").all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain('is_default');
    db.close();
  });
});
