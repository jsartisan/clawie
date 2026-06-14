/**
 * `agent-get` / `agent-update` — the portal's agent settings surface.
 *
 * Pulls together the pieces an owner cares about that live in three places:
 *   - agent_groups row (display name)
 *   - groups/<folder>/CLAUDE.local.md (personality / instructions)
 *   - container_configs row (model, assistant name, provider)
 *
 * Updates restart the group's running containers so changes apply on the
 * next message instead of "whenever the container happens to recycle".
 */
import fs from 'fs';
import path from 'path';

import { GROUPS_DIR } from '../../config.js';
import { restartAgentGroupContainers } from '../../container-restart.js';
import { getAgentGroup, updateAgentGroup } from '../../db/agent-groups.js';
import { getContainerConfig, updateContainerConfigScalars } from '../../db/container-configs.js';
import type { CallerContext } from '../frame.js';
import { register } from '../registry.js';

function assertHumanCaller(ctx: CallerContext): void {
  if (ctx.caller === 'agent') {
    throw new Error('agent settings are not editable from agent containers');
  }
}

function personalityPath(folder: string): string {
  return path.join(path.resolve(GROUPS_DIR, folder), 'CLAUDE.local.md');
}

function readPersonality(folder: string): string {
  try {
    return fs.readFileSync(personalityPath(folder), 'utf-8').trim();
  } catch {
    return '';
  }
}

register({
  name: 'agent-get',
  description: 'Agent settings (name, personality, model) in one shape. Use --id <agent-group-id>.',
  access: 'open',
  parseArgs: (raw) => raw,
  handler: async (args: Record<string, unknown>, ctx) => {
    assertHumanCaller(ctx);
    const id = String(args.id ?? '');
    const group = getAgentGroup(id);
    if (!group) throw new Error(`agent group not found: ${id}`);
    const config = getContainerConfig(id);

    return {
      id: group.id,
      name: group.name,
      folder: group.folder,
      created_at: group.created_at,
      personality: readPersonality(group.folder),
      model: config?.model ?? null,
      provider: config?.provider ?? group.agent_provider ?? null,
    };
  },
});

register({
  name: 'agent-update',
  description:
    'Update agent settings and restart its containers so changes apply immediately. Use --id <agent-group-id> [--name <text>] [--personality <text>] [--model <model-id>].',
  access: 'approval',
  parseArgs: (raw) => raw,
  handler: async (args: Record<string, unknown>, ctx) => {
    assertHumanCaller(ctx);
    const id = String(args.id ?? '');
    const group = getAgentGroup(id);
    if (!group) throw new Error(`agent group not found: ${id}`);

    const changed: string[] = [];

    if (typeof args.name === 'string' && args.name.trim() && args.name.trim() !== group.name) {
      updateAgentGroup(id, { name: args.name.trim() });
      changed.push('name');
    }

    if (typeof args.personality === 'string') {
      const file = personalityPath(group.folder);
      const current = readPersonality(group.folder);
      const next = args.personality.trim();
      if (next !== current) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, next ? next + '\n' : '');
        changed.push('personality');
      }
    }

    if (typeof args.model === 'string') {
      const config = getContainerConfig(id);
      const next = args.model.trim() || null;
      if (config && next !== config.model) {
        // Empty string clears the override back to the provider default.
        updateContainerConfigScalars(id, { model: next });
        changed.push('model');
      }
    }

    // Personality and model are read at container spawn — recycle running
    // containers so the user doesn't chat with the stale persona.
    let restarted = 0;
    if (changed.length > 0) {
      restarted = restartAgentGroupContainers(id, `agent settings updated (${changed.join(', ')})`);
    }

    return { id, changed, restarted };
  },
});
