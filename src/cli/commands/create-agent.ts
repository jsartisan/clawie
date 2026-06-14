/**
 * `agent-create` — the portal's create-agent wizard backend.
 *
 * One call does everything `scripts/init-first-agent.ts` does by hand for the
 * web case: agent_groups row, on-disk scaffold seeded with the personality
 * (CLAUDE.local.md), container_configs row, and a ready-to-use webchat
 * conversation. The caller can drop the user straight into a live chat.
 */
import { createAgentGroup, getAgentGroupByFolder } from '../../db/agent-groups.js';
import { initGroupFilesystem } from '../../group-init.js';
import type { AgentGroup } from '../../types.js';
import type { CallerContext } from '../frame.js';
import { register } from '../registry.js';
import { ensurePortalChat } from './chat.js';

/** Derive a filesystem-safe, unique groups/<folder> name from a display name. */
export function deriveFolder(name: string, exists: (folder: string) => boolean): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'agent';
  if (!exists(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!exists(candidate)) return candidate;
  }
}

function assertHumanCaller(ctx: CallerContext): void {
  if (ctx.caller === 'agent') {
    // Agents have their own gated path (agent-to-agent create_agent).
    throw new Error('agent-create is not available from agent containers');
  }
}

register({
  name: 'agent-create',
  description:
    'Create a new agent: agent group + workspace scaffold + webchat conversation, ready to talk to. Use --name <display name> [--instructions <personality/instructions>].',
  access: 'approval',
  parseArgs: (raw) => raw,
  handler: async (args: Record<string, unknown>, ctx) => {
    assertHumanCaller(ctx);
    const name = typeof args.name === 'string' ? args.name.trim() : '';
    if (!name) throw new Error('--name is required');
    const instructions = typeof args.instructions === 'string' ? args.instructions.trim() : '';

    const folder = deriveFolder(name, (f) => getAgentGroupByFolder(f) !== undefined);
    const group: AgentGroup = {
      id: `ag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      folder,
      agent_provider: null,
      created_at: new Date().toISOString(),
    };
    createAgentGroup(group);
    initGroupFilesystem(group, { instructions: instructions || undefined });

    const { mg } = ensurePortalChat(group.id);

    return { id: group.id, name: group.name, folder: group.folder, platform_id: mg.platform_id };
  },
});
