import type { Migration } from './index.js';

export const migration021: Migration = {
  version: 21,
  name: '021-memory-learning',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS memory_entries (
        id             TEXT PRIMARY KEY,
        agent_group_id TEXT NOT NULL,
        session_id     TEXT,
        kind           TEXT NOT NULL CHECK(kind IN ('fact','preference','skill_created','skill_patched')),
        content        TEXT NOT NULL,
        skill_name     TEXT,
        created_at     INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memory_entries_agent_group
        ON memory_entries(agent_group_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS reflection_log (
        session_id     TEXT PRIMARY KEY,
        agent_group_id TEXT NOT NULL,
        reflected_at   INTEGER NOT NULL,
        facts_written  INTEGER NOT NULL DEFAULT 0,
        skills_written INTEGER NOT NULL DEFAULT 0
      );
    `);
  },
};
