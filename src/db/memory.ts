import { getDb } from './connection.js';

export type MemoryKind = 'fact' | 'preference' | 'skill_created' | 'skill_patched';

export interface MemoryEntry {
  id: string;
  agent_group_id: string;
  session_id: string | null;
  kind: MemoryKind;
  content: string;
  skill_name: string | null;
  created_at: number;
}

export function insertMemoryEntry(entry: Omit<MemoryEntry, 'id' | 'created_at'>): void {
  const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  getDb()
    .prepare(
      `INSERT INTO memory_entries (id, agent_group_id, session_id, kind, content, skill_name, created_at)
       VALUES (@id, @agent_group_id, @session_id, @kind, @content, @skill_name, @created_at)`,
    )
    .run({ id, ...entry, created_at: Date.now() });
}

export function insertMemoryEntries(entries: Omit<MemoryEntry, 'id' | 'created_at'>[]): void {
  const insert = getDb().prepare(
    `INSERT INTO memory_entries (id, agent_group_id, session_id, kind, content, skill_name, created_at)
     VALUES (@id, @agent_group_id, @session_id, @kind, @content, @skill_name, @created_at)`,
  );
  const tx = getDb().transaction(() => {
    const now = Date.now();
    for (const entry of entries) {
      const id = `mem-${now}-${Math.random().toString(36).slice(2, 8)}`;
      insert.run({ id, ...entry, created_at: now });
    }
  });
  tx();
}

/**
 * Fetch the most recent memory entries for an agent group, ordered newest first.
 * Capped at maxEntries (default 30) and approximately maxTokens characters total
 * to avoid blowing the context window.
 */
export function getRecentMemoryEntries(
  agentGroupId: string,
  opts: { maxEntries?: number; maxChars?: number } = {},
): MemoryEntry[] {
  const { maxEntries = 30, maxChars = 8000 } = opts;
  const rows = getDb()
    .prepare(
      `SELECT * FROM memory_entries
       WHERE agent_group_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(agentGroupId, maxEntries) as MemoryEntry[];

  // Trim to stay within rough token budget (1 char ≈ 0.25 tokens)
  let total = 0;
  const result: MemoryEntry[] = [];
  for (const row of rows) {
    total += row.content.length;
    if (total > maxChars) break;
    result.push(row);
  }
  return result;
}

export function hasReflectionLog(sessionId: string): boolean {
  const row = getDb().prepare('SELECT 1 FROM reflection_log WHERE session_id = ?').get(sessionId);
  return row != null;
}

export function insertReflectionLog(entry: {
  session_id: string;
  agent_group_id: string;
  facts_written: number;
  skills_written: number;
}): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO reflection_log (session_id, agent_group_id, reflected_at, facts_written, skills_written)
       VALUES (@session_id, @agent_group_id, @reflected_at, @facts_written, @skills_written)`,
    )
    .run({ ...entry, reflected_at: Date.now() });
}
