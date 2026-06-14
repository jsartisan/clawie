import type { AgentGroup } from '../types.js';
import { toOneCLIIdentifier } from '../onecli-identifier.js';
import { getDb } from './connection.js';

export function createAgentGroup(group: AgentGroup): void {
  getDb()
    .prepare(
      `INSERT INTO agent_groups (id, name, folder, agent_provider, created_at)
       VALUES (@id, @name, @folder, @agent_provider, @created_at)`,
    )
    .run(group);
}

export function getAgentGroup(id: string): AgentGroup | undefined {
  return getDb().prepare('SELECT * FROM agent_groups WHERE id = ?').get(id) as AgentGroup | undefined;
}

export function getAgentGroupByFolder(folder: string): AgentGroup | undefined {
  return getDb().prepare('SELECT * FROM agent_groups WHERE folder = ?').get(folder) as AgentGroup | undefined;
}

/**
 * Resolve the agent group behind a OneCLI agent identifier (e.g. carried on an
 * approval request's `agent.externalId`). Identifiers that were already
 * compliant equal the group id, so try a direct lookup first; otherwise match
 * by recomputing each group's identifier — the inverse of `toOneCLIIdentifier`
 * without storing a separate column.
 */
export function getAgentGroupByOneCLIIdentifier(identifier: string): AgentGroup | undefined {
  const direct = getAgentGroup(identifier);
  if (direct) return direct;
  return getAllAgentGroups().find((g) => toOneCLIIdentifier(g.id) === identifier);
}

export function getAllAgentGroups(): AgentGroup[] {
  return getDb().prepare('SELECT * FROM agent_groups ORDER BY name').all() as AgentGroup[];
}

export function updateAgentGroup(id: string, updates: Partial<Pick<AgentGroup, 'name' | 'agent_provider'>>): void {
  const fields: string[] = [];
  const values: Record<string, unknown> = { id };

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = @${key}`);
      values[key] = value;
    }
  }
  if (fields.length === 0) return;

  getDb()
    .prepare(`UPDATE agent_groups SET ${fields.join(', ')} WHERE id = @id`)
    .run(values);
}

export function deleteAgentGroup(id: string): void {
  getDb().prepare('DELETE FROM agent_groups WHERE id = ?').run(id);
}
