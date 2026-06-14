/**
 * Integrations — one-click enable/disable of curated MCP integrations.
 *
 *   integrations-list    — catalog + which agent groups have each enabled
 *   integrations-enable  — wire an integration into one agent group
 *   integrations-disable — remove it again
 *
 * Enable writes the npm package + MCP server into the group's container
 * config, then rebuilds the image and restarts containers in the background
 * (a rebuild takes minutes; the command returns immediately). The agent has
 * the new tools the next time its container starts.
 */
import { buildAgentGroupImage } from '../../container-runner.js';
import { restartAgentGroupContainers } from '../../container-restart.js';
import { getAgentGroup } from '../../db/agent-groups.js';
import { getAllContainerConfigs, getContainerConfig, updateContainerConfigJson } from '../../db/container-configs.js';
import type { McpServerConfig } from '../../container-config.js';
import { INTEGRATION_CATALOG, getIntegration } from '../../integrations/catalog.js';
import { log } from '../../log.js';
import type { CallerContext } from '../frame.js';
import { register } from '../registry.js';

function assertHumanCaller(ctx: CallerContext): void {
  if (ctx.caller === 'agent') {
    // Agents request tools via the self-mod approval flow, not directly.
    throw new Error('integrations commands are not available from agent containers');
  }
}

register({
  name: 'integrations-list',
  description: 'List the integration catalog and which agent groups have each one enabled.',
  access: 'open',
  parseArgs: (raw) => raw,
  handler: async (_args: Record<string, unknown>, ctx) => {
    assertHumanCaller(ctx);

    const configs = getAllContainerConfigs();
    return INTEGRATION_CATALOG.map((def) => {
      const enabledGroups = def.mcp
        ? configs
            .filter((c) => def.mcp!.name in (JSON.parse(c.mcp_servers) as Record<string, unknown>))
            .map((c) => c.agent_group_id)
        : [];
      return { ...def, enabled_groups: enabledGroups };
    });
  },
});

register({
  name: 'integrations-enable',
  description:
    'Enable a catalog integration for an agent group. Use --id <integration-id> --group <agent-group-id> [--key <api-key>]. Rebuilds the agent image in the background.',
  access: 'approval',
  parseArgs: (raw) => raw,
  handler: async (args: Record<string, unknown>, ctx) => {
    assertHumanCaller(ctx);
    const def = getIntegration(String(args.id ?? ''));
    if (!def) throw new Error(`unknown integration: ${args.id}`);
    if (!def.mcp || !def.npmPackage) {
      throw new Error(`${def.name} needs guided setup and can't be enabled from here. ${def.auth.help ?? ''}`);
    }

    const groupId = String(args.group ?? '');
    if (!getAgentGroup(groupId)) throw new Error(`agent group not found: ${groupId}`);
    const config = getContainerConfig(groupId);
    if (!config) throw new Error(`no container config for group: ${groupId}`);

    const key = typeof args.key === 'string' ? args.key.trim() : '';
    if (def.auth.type === 'api_key' && !key) {
      throw new Error(`${def.name} needs an API key. ${def.auth.help ?? ''}`);
    }

    // 1. npm package → installed at image build.
    const npm = JSON.parse(config.packages_npm) as string[];
    if (!npm.includes(def.npmPackage)) {
      npm.push(def.npmPackage);
      updateContainerConfigJson(groupId, 'packages_npm', npm);
    }

    // 2. MCP server wiring (+ key in its env, scoped to this one server).
    const servers = JSON.parse(config.mcp_servers) as Record<string, McpServerConfig>;
    servers[def.mcp.name] = {
      command: def.mcp.command,
      args: def.mcp.args,
      env: def.auth.type === 'api_key' ? { [def.auth.env!]: key } : {},
    };
    updateContainerConfigJson(groupId, 'mcp_servers', servers);

    // 3. Rebuild + restart in the background — a build takes minutes and the
    // portal call shouldn't hang on it. Config is already persisted, so even
    // if the process dies the next manual rebuild picks it up.
    void (async () => {
      try {
        await buildAgentGroupImage(groupId);
        restartAgentGroupContainers(
          groupId,
          `integration ${def.id} enabled`,
          `The ${def.name} integration was just enabled for you. Verify its tools are available and let the user know you're ready to use it.`,
        );
        log.info('Integration enabled', { integration: def.id, groupId });
      } catch (err) {
        log.error('Integration rebuild failed — config is saved, retry with groups restart --rebuild', {
          integration: def.id,
          groupId,
          err,
        });
      }
    })();

    return {
      enabled: def.id,
      group: groupId,
      status: 'applying',
      note: 'The agent is being rebuilt with the new tools — ready in a few minutes.',
    };
  },
});

register({
  name: 'integrations-disable',
  description: 'Disable a catalog integration for an agent group. Use --id <integration-id> --group <agent-group-id>.',
  access: 'approval',
  parseArgs: (raw) => raw,
  handler: async (args: Record<string, unknown>, ctx) => {
    assertHumanCaller(ctx);
    const def = getIntegration(String(args.id ?? ''));
    if (!def?.mcp) throw new Error(`unknown integration: ${args.id}`);

    const groupId = String(args.group ?? '');
    const config = getContainerConfig(groupId);
    if (!config) throw new Error(`no container config for group: ${groupId}`);

    const servers = JSON.parse(config.mcp_servers) as Record<string, McpServerConfig>;
    if (!(def.mcp.name in servers)) return { disabled: def.id, group: groupId, note: 'was not enabled' };
    delete servers[def.mcp.name];
    updateContainerConfigJson(groupId, 'mcp_servers', servers);

    // The npm package stays in the image (harmless); the MCP server is gone
    // after the next container start. No rebuild needed for removal.
    restartAgentGroupContainers(groupId, `integration ${def.id} disabled`);
    return { disabled: def.id, group: groupId };
  },
});
