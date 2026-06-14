/**
 * Webchat conversation commands — the portal's "try your agent" surface.
 *
 *   chat-open    — ensure an agent group has a webchat conversation (creates
 *                  the messaging group + wiring on first call, idempotent
 *                  after) and return its platform id.
 *   chat-history — merged user/agent transcript for that conversation, read
 *                  from the session's inbound.db + outbound.db.
 *
 * Both refuse agent callers: webchat is a human-side surface, and these
 * commands carry no `resource`, so the dispatcher's group-scope whitelist
 * doesn't apply — the guard lives here.
 */
import { getAgentGroup } from '../../db/agent-groups.js';
import {
  createMessagingGroup,
  createMessagingGroupAgent,
  getMessagingGroupAgents,
  getMessagingGroupByPlatform,
} from '../../db/messaging-groups.js';
import { findSessionForAgent } from '../../db/sessions.js';
import { openInboundDb, openOutboundDb } from '../../session-manager.js';
import type { MessagingGroup } from '../../types.js';
import type { CallerContext } from '../frame.js';
import { register } from '../registry.js';

/** The per-agent-group portal conversation id. One canonical chat per agent. */
export function portalChatPlatformId(agentGroupId: string): string {
  return `portal-${agentGroupId}`;
}

function assertHumanCaller(ctx: CallerContext): void {
  if (ctx.caller === 'agent') {
    throw new Error('chat commands are not available from agent containers');
  }
}

export function ensurePortalChat(agentGroupId: string): { mg: MessagingGroup; created: boolean } {
  const platformId = portalChatPlatformId(agentGroupId);
  let created = false;

  let mg = getMessagingGroupByPlatform('webchat', platformId);
  if (!mg) {
    mg = {
      id: `mg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      channel_type: 'webchat',
      platform_id: platformId,
      name: 'Portal chat',
      is_group: 0,
      // The portal server's bearer token already authenticates the sender;
      // a second sender gate would just be a dead end with no approver UI.
      unknown_sender_policy: 'public',
      denied_at: null,
      channel_account: null,
      created_at: new Date().toISOString(),
    };
    createMessagingGroup(mg);
    created = true;
  }

  const wired = getMessagingGroupAgents(mg.id).some((a) => a.agent_group_id === agentGroupId);
  if (!wired) {
    createMessagingGroupAgent({
      id: `mga-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      messaging_group_id: mg.id,
      agent_group_id: agentGroupId,
      engage_mode: 'pattern',
      engage_pattern: '.', // 1:1 chat — every message engages
      sender_scope: 'all',
      ignored_message_policy: 'drop',
      session_mode: 'shared',
      priority: 0,
      created_at: new Date().toISOString(),
    });
    created = true;
  }

  return { mg, created };
}

export interface ChatHistoryEntry {
  id: string;
  role: 'user' | 'agent';
  text: string;
  timestamp: string;
}

function extractTextContent(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return typeof parsed.text === 'string' ? parsed.text : null;
  } catch {
    return raw || null;
  }
}

function readHistory(agentGroupId: string, messagingGroupId: string, limit: number): ChatHistoryEntry[] {
  const session = findSessionForAgent(agentGroupId, messagingGroupId, null);
  if (!session) return [];

  const entries: ChatHistoryEntry[] = [];

  const inDb = openInboundDb(agentGroupId, session.id);
  try {
    const rows = inDb
      .prepare("SELECT id, timestamp, content FROM messages_in WHERE kind = 'chat' ORDER BY seq")
      .all() as Array<{ id: string; timestamp: string; content: string }>;
    for (const row of rows) {
      const text = extractTextContent(row.content);
      if (text) entries.push({ id: row.id, role: 'user', text, timestamp: row.timestamp });
    }
  } finally {
    inDb.close();
  }

  const outDb = openOutboundDb(agentGroupId, session.id);
  try {
    const rows = outDb
      .prepare("SELECT id, timestamp, content FROM messages_out WHERE kind = 'chat' ORDER BY seq")
      .all() as Array<{ id: string; timestamp: string; content: string }>;
    for (const row of rows) {
      const text = extractTextContent(row.content);
      if (text) entries.push({ id: row.id, role: 'agent', text, timestamp: row.timestamp });
    }
  } finally {
    outDb.close();
  }

  entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return entries.slice(Math.max(0, entries.length - limit));
}

register({
  name: 'chat-open',
  description:
    'Ensure a webchat conversation exists for an agent group (creates messaging group + wiring on first call) and return its platform id. Use --id <agent-group-id>.',
  access: 'approval',
  parseArgs: (raw) => raw,
  handler: async (args: Record<string, unknown>, ctx) => {
    assertHumanCaller(ctx);
    const agentGroupId = args.id as string;
    if (!agentGroupId) throw new Error('--id <agent-group-id> is required');
    if (!getAgentGroup(agentGroupId)) throw new Error(`agent group not found: ${agentGroupId}`);

    const { mg, created } = ensurePortalChat(agentGroupId);
    return { platform_id: mg.platform_id, messaging_group_id: mg.id, created };
  },
});

register({
  name: 'chat-history',
  description:
    "Merged user/agent transcript of an agent group's webchat conversation. Use --id <agent-group-id> [--limit <n>, default 200].",
  access: 'open',
  parseArgs: (raw) => raw,
  handler: async (args: Record<string, unknown>, ctx) => {
    assertHumanCaller(ctx);
    const agentGroupId = args.id as string;
    if (!agentGroupId) throw new Error('--id <agent-group-id> is required');

    const mg = getMessagingGroupByPlatform('webchat', portalChatPlatformId(agentGroupId));
    if (!mg) return [];
    const limit = args.limit !== undefined ? Math.max(1, Number(args.limit)) : 200;
    return readHistory(agentGroupId, mg.id, limit);
  },
});
