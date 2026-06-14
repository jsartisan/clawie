/**
 * Webchat channel — talk to an agent from the portal in the browser.
 *
 * Always-on, zero-credential channel (like `cli`), but multi-conversation:
 * each portal chat is its own platformId (`portal-<agent-group-id>` for the
 * default per-agent chat opened by `chat-open`).
 *
 * Transport split:
 *   - Inbound:  POST /api/chat/send (portal server) → webchatSend() →
 *     ChannelSetup.onInbound → router → session inbound.db → container.
 *   - Outbound: the normal delivery poll calls adapter.deliver(), which fans
 *     out to live SSE subscribers (GET /api/chat/events). No subscriber means
 *     no live push — the row is already persisted in outbound.db, and the
 *     portal recovers it via `chat-history` on next load.
 *
 * This module owns no HTTP. The portal server (src/cli/http-server.ts) calls
 * webchatSend/subscribeWebchat; the adapter stays transport-agnostic like
 * every other channel.
 */
import { log } from '../log.js';
import type { ChannelAdapter, ChannelSetup, OutboundMessage } from './adapter.js';
import { registerChannelAdapter } from './channel-registry.js';

export type WebchatEvent = { type: 'message'; id: string; text: string; timestamp: string } | { type: 'typing' };

type Listener = (event: WebchatEvent) => void;

// platformId → live SSE listeners for that conversation.
const subscribers = new Map<string, Set<Listener>>();

let setupConfig: ChannelSetup | null = null;

function emit(platformId: string, event: WebchatEvent): void {
  const listeners = subscribers.get(platformId);
  if (!listeners) return;
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      log.warn('Webchat listener threw', { platformId, err });
    }
  }
}

/**
 * Subscribe a live consumer (one SSE response) to a conversation.
 * Returns the unsubscribe function.
 */
export function subscribeWebchat(platformId: string, listener: Listener): () => void {
  let set = subscribers.get(platformId);
  if (!set) {
    set = new Set();
    subscribers.set(platformId, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) subscribers.delete(platformId);
  };
}

/**
 * Inject a user message from the portal into the normal routing path.
 * Returns the generated message id (the portal uses it for optimistic echo).
 */
export function webchatSend(platformId: string, text: string): string {
  if (!setupConfig) throw new Error('webchat channel is not running');
  const id = `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  void Promise.resolve(
    setupConfig.onInbound(platformId, null, {
      id,
      kind: 'chat',
      timestamp: new Date().toISOString(),
      // Portal chats are 1:1 with the agent — every message addresses it.
      isMention: true,
      isGroup: false,
      content: { text, sender: 'web', senderId: 'webchat:portal' },
    }),
  ).catch((err) => log.error('webchat onInbound threw', { platformId, err }));
  return id;
}

export function isWebchatRunning(): boolean {
  return setupConfig !== null;
}

function extractText(message: OutboundMessage): string | null {
  const content = message.content as Record<string, unknown> | string | undefined;
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object' && typeof content.text === 'string') {
    return content.text;
  }
  return null;
}

function createAdapter(): ChannelAdapter {
  return {
    name: 'webchat',
    channelType: 'webchat',
    supportsThreads: false,

    async setup(config: ChannelSetup): Promise<void> {
      setupConfig = config;
      log.info('Webchat channel ready');
    },

    async teardown(): Promise<void> {
      setupConfig = null;
      subscribers.clear();
    },

    isConnected(): boolean {
      return setupConfig !== null;
    },

    async deliver(platformId, _threadId, message: OutboundMessage): Promise<string | undefined> {
      const text = extractText(message);
      if (text === null) return undefined;
      emit(platformId, {
        type: 'message',
        id: `out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        timestamp: new Date().toISOString(),
      });
      return undefined;
    },

    async setTyping(platformId): Promise<void> {
      emit(platformId, { type: 'typing' });
    },
  };
}

registerChannelAdapter('webchat', { factory: createAdapter });
