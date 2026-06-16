import type Database from 'better-sqlite3';

import { log } from '../../log.js';
import { migration001 } from './001-initial.js';
import { migration002 } from './002-chat-sdk-state.js';
import { moduleAgentToAgentDestinations } from './module-agent-to-agent-destinations.js';
import { migration008 } from './008-dropped-messages.js';
import { migration009 } from './009-drop-pending-credentials.js';
import { migration010 } from './010-engage-modes.js';
import { migration011 } from './011-pending-sender-approvals.js';
import { migration012 } from './012-channel-registration.js';
import { migration013 } from './013-approval-render-metadata.js';
import { migration014 } from './014-container-configs.js';
import { migration015 } from './015-cli-scope.js';
import { migration016 } from './016-channel-accounts.js';
import { migration017 } from './017-channel-account-routing-fix.js';
import { migration018 } from './018-portal-accounts.js';
import { migration019 } from './019-workspaces.js';
import { migration020 } from './020-drop-workspaces.js';
import { moduleApprovalsPendingApprovals } from './module-approvals-pending-approvals.js';
import { moduleApprovalsTitleOptions } from './module-approvals-title-options.js';
import { migration021 } from './021-reflection-watermark.js';
import { migration022 } from './022-drop-portal-accounts.js';
import { migration023 } from './023-channel-account-engagement.js';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
  /**
   * Set `PRAGMA foreign_keys = OFF` around this migration. Required for table
   * rebuilds (drop + recreate to change a constraint) on tables that other
   * tables FK into: SQLite's DROP TABLE does an implicit DELETE that trips FK
   * enforcement, and `foreign_keys` can only be toggled OUTSIDE a transaction
   * (so the per-migration transaction can't do it, and `defer_foreign_keys`
   * does not cover the implicit delete — this is the migration-011 lesson).
   * The runner re-enables FKs and runs `foreign_key_check` afterward.
   */
  disableForeignKeys?: boolean;
}

const migrations: Migration[] = [
  migration001,
  migration002,
  moduleApprovalsPendingApprovals,
  moduleAgentToAgentDestinations,
  moduleApprovalsTitleOptions,
  migration008,
  migration009,
  migration010,
  migration011,
  migration012,
  migration013,
  migration014,
  migration015,
  migration016,
  migration017,
  migration018,
  migration019,
  migration020,
  migration021,
  migration022,
  migration023,
];

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      name    TEXT NOT NULL,
      applied TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_schema_version_name ON schema_version(name);
  `);

  // Uniqueness is keyed on `name`, not `version`. This lets module
  // migrations (added later by install skills) pick arbitrary version
  // numbers without coordinating across modules. `version` stays on
  // the Migration object as an ordering hint within the barrel array;
  // the stored `version` column is auto-assigned at insert time as an
  // applied-order number.
  const applied = new Set<string>(
    (db.prepare('SELECT name FROM schema_version').all() as { name: string }[]).map((r) => r.name),
  );
  const pending = migrations.filter((m) => !applied.has(m.name));
  if (pending.length === 0) return;

  log.info('Running migrations', { count: pending.length });

  for (const m of pending) {
    // FK toggling must happen outside the transaction (it's a no-op inside).
    // Restored in finally so a throwing migration can't leave FKs disabled.
    if (m.disableForeignKeys) db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        m.up(db);
        const next = (
          db.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS v FROM schema_version').get() as { v: number }
        ).v;
        db.prepare('INSERT INTO schema_version (version, name, applied) VALUES (?, ?, ?)').run(
          next,
          m.name,
          new Date().toISOString(),
        );
      })();
    } finally {
      if (m.disableForeignKeys) db.pragma('foreign_keys = ON');
    }
    if (m.disableForeignKeys) {
      const violations = db.pragma('foreign_key_check') as unknown[];
      if (violations.length > 0) {
        throw new Error(`Migration ${m.name} left dangling foreign keys: ${JSON.stringify(violations)}`);
      }
    }
    log.info('Migration applied', { name: m.name });
  }
}
