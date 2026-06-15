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
 *
 * When an integration has `onecliSecret` defined, the API key is stored in
 * the OneCLI vault (not in the container env). The host derives the host
 * pattern from the user-supplied URL, creates a generic secret, and assigns
 * it to the agent. The vault secret id is persisted in the MCP server env
 * block under `__onecli_secret_id` so disable can clean it up.
 */
import { buildAgentGroupImage } from '../../container-runner.js';
import { restartAgentGroupContainers } from '../../container-restart.js';
import { ONECLI_API_KEY, ONECLI_URL } from '../../config.js';
import { getAgentGroup } from '../../db/agent-groups.js';
import { getAllContainerConfigs, getContainerConfig, updateContainerConfigJson } from '../../db/container-configs.js';
import type { McpServerConfig } from '../../container-config.js';
import { INTEGRATION_CATALOG, getIntegration, type OneCLISecretConfig } from '../../integrations/catalog.js';
import { log } from '../../log.js';
import { toOneCLIIdentifier } from '../../onecli-identifier.js';
import type { CallerContext } from '../frame.js';
import { register } from '../registry.js';

// The onecli CLI does not support setting injectionConfig on secrets — use the
// HTTP API directly for secret CRUD. Agent listing/assignment still uses the CLI
// because the agent endpoint shape matches the CLI output.
async function onecliApi(method: string, path: string, body?: unknown): Promise<unknown> {
  const base = (ONECLI_URL ?? 'http://127.0.0.1:10254').replace(/\/$/, '');
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${ONECLI_API_KEY ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`OneCLI API ${method} ${path} → ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Create a vault secret for the integration and assign it to the OneCLI agent
 * for this group. Returns the secret id (persisted so disable can delete it).
 */
async function provisionOneCLISecret(
  groupId: string,
  groupName: string,
  apiKey: string,
  hostPattern: string,
  cfg: OneCLISecretConfig,
): Promise<string> {
  const created = (await onecliApi('POST', '/api/secrets', {
    name: `${cfg.namePrefix} — ${groupName}`,
    type: 'generic',
    value: apiKey,
    hostPattern,
    injectionConfig: {
      headerName: cfg.headerName,
      valueFormat: cfg.valueFormat ?? '{value}',
    },
  })) as { id?: string };
  const secretId = created?.id;
  if (!secretId) throw new Error(`OneCLI API returned no secret id — response: ${JSON.stringify(created)}`);

  // Find the OneCLI agent for this group and assign the secret additively.
  const identifier = toOneCLIIdentifier(groupId);
  const agents = (await onecliApi('GET', '/api/agents')) as { id: string; identifier: string }[];
  const agent = agents?.find((a) => a.identifier === identifier);
  if (!agent) {
    log.warn('OneCLI agent not found for group — secret created but not assigned', { groupId, identifier, secretId });
    return secretId;
  }

  const existingIds = ((await onecliApi('GET', `/api/agents/${agent.id}/secrets`)) as string[]) ?? [];
  if (!existingIds.includes(secretId)) {
    await onecliApi('PUT', `/api/agents/${agent.id}/secrets`, { secretIds: [...existingIds, secretId] });
  }

  return secretId;
}

/**
 * Remove a vault secret and unassign it from the agent for this group.
 * Non-fatal: logs and continues if OneCLI is unavailable.
 */
async function deprovisionOneCLISecret(groupId: string, secretId: string): Promise<void> {
  try {
    const identifier = toOneCLIIdentifier(groupId);
    const agents = (await onecliApi('GET', '/api/agents')) as { id: string; identifier: string }[];
    const agent = agents?.find((a) => a.identifier === identifier);
    if (agent) {
      const existing = ((await onecliApi('GET', `/api/agents/${agent.id}/secrets`)) as string[]) ?? [];
      const remaining = existing.filter((id) => id !== secretId);
      if (remaining.length < existing.length) {
        await onecliApi('PUT', `/api/agents/${agent.id}/secrets`, { secretIds: remaining });
      }
    }
    await onecliApi('DELETE', `/api/secrets/${secretId}`);
  } catch (err) {
    log.warn('Failed to deprovision OneCLI secret — delete it manually via onecli secrets delete', {
      secretId,
      groupId,
      err,
    });
  }
}

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
    'Enable a catalog integration for an agent group. Use --id <integration-id> --group <agent-group-id> [--key <api-key>] [--url <instance-url>]. Rebuilds the agent image in the background.',
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
    const agentGroup = getAgentGroup(groupId);
    if (!agentGroup) throw new Error(`agent group not found: ${groupId}`);
    const config = getContainerConfig(groupId);
    if (!config) throw new Error(`no container config for group: ${groupId}`);

    const key = typeof args.key === 'string' ? args.key.trim() : '';
    if (def.auth.type === 'api_key' && !key) {
      throw new Error(`${def.name} needs an API key. ${def.auth.help ?? ''}`);
    }
    const url = typeof args.url === 'string' ? args.url.trim() : '';
    if (def.auth.urlEnv && !url) {
      throw new Error(`${def.name} needs a URL (--url). ${def.auth.help ?? ''}`);
    }

    // 1. npm package → installed at image build.
    const npm = JSON.parse(config.packages_npm) as string[];
    if (!npm.includes(def.npmPackage)) {
      npm.push(def.npmPackage);
      updateContainerConfigJson(groupId, 'packages_npm', npm);
    }

    // 2. OneCLI vault secret — store the key there instead of the container env.
    let onecliSecretId: string | undefined;
    if (def.onecliSecret && key && url) {
      try {
        const hostPattern = new URL(url).hostname;
        onecliSecretId = await provisionOneCLISecret(
          groupId,
          agentGroup.name,
          key,
          hostPattern,
          def.onecliSecret,
        );
        log.info('OneCLI secret provisioned for integration', { integration: def.id, groupId, onecliSecretId });
      } catch (err) {
        log.error('Failed to provision OneCLI secret — falling back to env-based credential', {
          integration: def.id,
          groupId,
          err,
        });
      }
    }

    // 3. MCP server wiring.
    //    When using OneCLI vault, the API key is NOT written to the container
    //    env — the proxy injects it at request time. Only config values like
    //    GRAFANA_URL go in env. The secret id is stashed under a private key
    //    so disable can clean it up.
    const servers = JSON.parse(config.mcp_servers) as Record<string, McpServerConfig>;
    const mcpEnv: Record<string, string> = {};
    if (def.auth.urlEnv && url) mcpEnv[def.auth.urlEnv] = url;
    if (def.auth.type === 'api_key' && !onecliSecretId) {
      // OneCLI provisioning failed or not configured — fall back to env.
      mcpEnv[def.auth.env!] = key;
    }
    if (onecliSecretId) mcpEnv['__onecli_secret_id'] = onecliSecretId;
    servers[def.mcp.name] = { command: def.mcp.command, args: def.mcp.args, env: mcpEnv };
    updateContainerConfigJson(groupId, 'mcp_servers', servers);

    // 4. Rebuild + restart in the background.
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
      onecli_secret: onecliSecretId ?? null,
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

    // Clean up OneCLI vault secret if one was provisioned at enable time.
    const storedSecretId = servers[def.mcp.name]?.env?.['__onecli_secret_id'];
    if (storedSecretId) {
      void deprovisionOneCLISecret(groupId, storedSecretId);
    }

    delete servers[def.mcp.name];
    updateContainerConfigJson(groupId, 'mcp_servers', servers);

    // The npm package stays in the image (harmless); the MCP server is gone
    // after the next container start. No rebuild needed for removal.
    restartAgentGroupContainers(groupId, `integration ${def.id} disabled`);
    return { disabled: def.id, group: groupId };
  },
});
