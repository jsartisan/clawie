/**
 * Slack channel adapter (v2) — native Socket Mode.
 *
 * Unlike the other Chat SDK channels, Slack here uses a *native* adapter built
 * directly on `@slack/socket-mode` + `@slack/web-api`. Socket Mode opens an
 * outbound WebSocket to Slack, so NanoClaw never needs a public webhook URL,
 * ngrok tunnel, or the shared `webhook-server.ts`. Events, button clicks, and
 * (optionally) slash commands all arrive over that single connection.
 *
 * Wire-format compatibility: platform/thread ids match the encoding the old
 * Chat SDK Slack adapter used (`slack:<channel>` and
 * `slack:<channel>:<thread_ts>`), so existing messaging_groups, sessions, and
 * user_roles rows keep working after the swap.
 *
 * Self-registers on import.
 */
import { SocketModeClient } from '@slack/socket-mode';
import { WebClient } from '@slack/web-api';
import { slackifyMarkdown } from 'slackify-markdown';

import { readEnvFile } from '../env.js';
import { getAskQuestionRender } from '../db/sessions.js';
import { getChannelAccounts, getAccountSecrets } from '../db/channel-accounts.js';
import { log } from '../log.js';
import { normalizeOptions, type NormalizedOption } from './ask-question.js';
import { registerChannelAdapter } from './channel-registry.js';
import type { ChannelAdapter, ChannelSetup, InboundMessage, OutboundMessage, SecretValidation } from './adapter.js';

// ---------------------------------------------------------------------------
// Platform/thread id encoding (must match the legacy Chat SDK adapter)
//
//   platform_id : "slack:<channel>"               e.g. "slack:C0123ABC"
//   thread_id   : "slack:<channel>:<thread_ts>"   e.g. "slack:C0123ABC:171.0001"
//
// Channel ids never contain ":"; thread timestamps use "." as the separator.
// Splitting on ":" therefore round-trips cleanly.
// ---------------------------------------------------------------------------

function platformIdFor(channel: string): string {
  return `slack:${channel}`;
}

function threadIdFor(channel: string, threadTs: string): string {
  return `slack:${channel}:${threadTs}`;
}

interface DecodedAddress {
  channel: string;
  threadTs?: string;
}

/** Decode a platform_id or thread_id back into a channel + optional thread_ts. */
function decodeAddress(id: string): DecodedAddress {
  const parts = id.split(':');
  // ["slack", channel] or ["slack", channel, threadTs]
  if (parts[0] === 'slack') {
    return { channel: parts[1] ?? '', threadTs: parts[2] };
  }
  // Defensive: a bare channel id with no "slack:" prefix.
  return { channel: parts[0] ?? '', threadTs: parts[1] };
}

// ---------------------------------------------------------------------------
// Markdown → Slack mrkdwn
//
// The agent produces standard Markdown; Slack speaks "mrkdwn", which differs
// in a few delimiters (*bold*, _italic_, <url|label>, • bullets, entity
// escaping). Rather than hand-roll a regex converter that misses ordered
// lists, blockquotes, and nested formatting, we delegate to `slackify-markdown`
// (remark/unified-based, the de-facto standard) and just trim its trailing
// newline. The wrapper keeps the dependency isolated to this one function.
// ---------------------------------------------------------------------------

function markdownToMrkdwn(input: string): string {
  if (!input) return input;
  try {
    return slackifyMarkdown(input).trimEnd();
  } catch (err) {
    // Never let a formatting hiccup drop a reply — fall back to the raw text.
    log.warn('slackifyMarkdown failed, sending raw text', { err });
    return input;
  }
}

// ---------------------------------------------------------------------------
// Slack event payload shapes (only the fields we read)
// ---------------------------------------------------------------------------

interface SlackFile {
  id?: string;
  name?: string;
  title?: string;
  mimetype?: string;
  size?: number;
  url_private?: string;
  url_private_download?: string;
}

interface SlackMessageEvent {
  type: string;
  subtype?: string;
  channel?: string;
  channel_type?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  files?: SlackFile[];
}

interface BlockActionsPayload {
  type: string;
  user?: { id?: string };
  channel?: { id?: string };
  message?: { ts?: string; thread_ts?: string };
  actions?: Array<{ action_id?: string; value?: string }>;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

interface SlackAdapterDeps {
  botToken: string;
  appToken: string;
}

function createSlackSocketAdapter({ botToken, appToken }: SlackAdapterDeps): ChannelAdapter {
  const web = new WebClient(botToken);
  const socket = new SocketModeClient({ appToken, logger: makeSilentLogger() });

  let botUserId: string | undefined;
  let botId: string | undefined;
  let setupConfig: ChannelSetup;

  // Short-lived caches so we don't hit users.info / conversations.info on every
  // message. Slack display names rarely change within a process lifetime.
  const userNameCache = new Map<string, string>();
  const channelNameCache = new Map<string, string>();

  async function resolveUserName(userId: string): Promise<string> {
    const cached = userNameCache.get(userId);
    if (cached) return cached;
    try {
      const res = await web.users.info({ user: userId });
      const profile = res.user?.profile;
      const name =
        profile?.display_name?.trim() ||
        profile?.real_name?.trim() ||
        res.user?.real_name?.trim() ||
        res.user?.name ||
        userId;
      userNameCache.set(userId, name);
      return name;
    } catch (err) {
      log.debug('Slack users.info failed', { userId, err });
      return userId;
    }
  }

  async function resolveChannelNameRaw(channel: string): Promise<string | null> {
    const cached = channelNameCache.get(channel);
    if (cached) return cached;
    try {
      const res = await web.conversations.info({ channel });
      const name = res.channel?.name ?? null;
      if (name) channelNameCache.set(channel, name);
      return name;
    } catch (err) {
      log.debug('Slack conversations.info failed', { channel, err });
      return null;
    }
  }

  /**
   * Replace Slack's encoded entities with human-readable text so the agent
   * sees `@Alice` / `#general` instead of `<@U123>` / `<#C123|general>`, and
   * `https://x.com` instead of `<https://x.com>`.
   */
  async function humanizeText(text: string): Promise<string> {
    if (!text) return text;
    // <@U123> or <@U123|name>
    const userMentions = [...text.matchAll(/<@([UW][A-Z0-9]+)(?:\|[^>]+)?>/g)];
    let out = text;
    for (const m of userMentions) {
      const name = await resolveUserName(m[1]);
      out = out.replace(m[0], `@${name}`);
    }
    // <#C123|name> → #name (name is already embedded by Slack)
    out = out.replace(/<#[CG][A-Z0-9]+\|([^>]+)>/g, '#$1');
    // <url|label> → label (url); <url> → url
    out = out.replace(/<(https?:[^|>]+)\|([^>]+)>/g, '$2 ($1)');
    out = out.replace(/<(https?:[^>]+)>/g, '$1');
    return out;
  }

  function isOwnMessage(event: SlackMessageEvent): boolean {
    if (event.subtype === 'bot_message') return true;
    if (botId && event.bot_id === botId) return true;
    if (botUserId && event.user === botUserId) return true;
    return false;
  }

  async function buildAttachments(files: SlackFile[]): Promise<Array<Record<string, unknown>>> {
    const out: Array<Record<string, unknown>> = [];
    for (const f of files) {
      const entry: Record<string, unknown> = {
        type: 'file',
        name: f.name ?? f.title ?? 'attachment',
        mimeType: f.mimetype,
        size: f.size,
      };
      const url = f.url_private_download ?? f.url_private;
      if (url) {
        try {
          const res = await fetch(url, { headers: { Authorization: `Bearer ${botToken}` } });
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            entry.data = buf.toString('base64');
          } else {
            log.warn('Slack file download failed', { status: res.status, name: entry.name });
          }
        } catch (err) {
          log.warn('Slack file download error', { name: entry.name, err });
        }
      }
      out.push(entry);
    }
    return out;
  }

  async function handleMessageEvent(event: SlackMessageEvent): Promise<void> {
    // Only plain user messages. Edits/deletes/joins arrive as subtypes we skip;
    // file_share carries `files` and is kept (it has no disqualifying subtype
    // for our purposes other than being a normal message with attachments).
    if (event.type !== 'message') return;
    if (event.subtype && event.subtype !== 'file_share') return;
    if (isOwnMessage(event)) return;
    if (!event.user || !event.channel) return;

    const channel = event.channel;
    const ts = event.ts ?? '';
    const threadTs = event.thread_ts ?? ts;
    const isDM = event.channel_type === 'im' || channel.startsWith('D');
    const text = await humanizeText(event.text ?? '');
    const isMention = isDM || (botUserId ? (event.text ?? '').includes(`<@${botUserId}>`) : false);
    const isGroup = !isDM;

    const senderName = await resolveUserName(event.user);

    const content: Record<string, unknown> = {
      text,
      sender: senderName,
      senderName,
      // Raw Slack user id; the host prefixes it to "slack:U…" (see
      // permissions/index.ts + formatter.ts), matching the legacy adapter so
      // existing roles/members continue to resolve.
      senderId: event.user,
    };

    if (event.files && event.files.length > 0) {
      content.attachments = await buildAttachments(event.files);
    }

    const inbound: InboundMessage = {
      id: ts,
      kind: 'chat',
      content,
      timestamp: tsToIso(ts),
      isMention,
      isGroup,
    };

    if (isDM) {
      log.info('Inbound Slack DM received', { channel, sender: senderName, threadTs });
    }

    await setupConfig.onInbound(platformIdFor(channel), threadIdFor(channel, threadTs), inbound);
  }

  async function handleBlockActions(payload: BlockActionsPayload): Promise<void> {
    const action = payload.actions?.[0];
    if (!action?.action_id || !action.action_id.startsWith('ncq:')) return;

    const parts = action.action_id.split(':');
    if (parts.length < 3) return;
    const questionId = parts[1];
    const tail = parts.slice(2).join(':');
    const userId = payload.user?.id ?? '';

    const render = getAskQuestionRender(questionId);
    const selectedOption = resolveSelectedOption(render, action.value, tail);
    const title = render?.title ?? '❓ Question';
    const matched = render?.options.find((o) => o.value === selectedOption);
    const selectedLabel = matched?.selectedLabel ?? selectedOption ?? '(clicked)';

    // Update the original card to show the answer and drop the buttons.
    const channel = payload.channel?.id;
    const messageTs = payload.message?.ts;
    if (channel && messageTs) {
      try {
        await web.chat.update({
          channel,
          ts: messageTs,
          text: `${title}\n\n${selectedLabel}`,
          blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `*${title}*\n\n${selectedLabel}` } }],
        });
      } catch (err) {
        log.warn('Slack failed to update card after action', { err });
      }
    }

    setupConfig.onAction(questionId, selectedOption, userId);
  }

  const adapter: ChannelAdapter = {
    name: 'slack',
    channelType: 'slack',
    supportsThreads: true,

    async setup(hostConfig: ChannelSetup): Promise<void> {
      setupConfig = hostConfig;

      const auth = await web.auth.test();
      botUserId = auth.user_id;
      botId = auth.bot_id;

      socket.on('message', async ({ ack, event }: { ack: () => Promise<void>; event: SlackMessageEvent }) => {
        await ack();
        try {
          await handleMessageEvent(event);
        } catch (err) {
          log.error('Slack message handler error', { err });
        }
      });

      socket.on('interactive', async ({ ack, body }: { ack: () => Promise<void>; body: BlockActionsPayload }) => {
        await ack();
        try {
          if (body.type === 'block_actions') await handleBlockActions(body);
        } catch (err) {
          log.error('Slack interactive handler error', { err });
        }
      });

      await socket.start();
      log.info('Slack Socket Mode connected', { botUserId });
    },

    async deliver(platformId: string, threadId: string | null, message: OutboundMessage): Promise<string | undefined> {
      const { channel, threadTs } = decodeAddress(threadId ?? platformId);
      const content = message.content as Record<string, unknown>;

      // Edit an existing message.
      if (content.operation === 'edit' && content.messageId) {
        await web.chat.update({
          channel,
          ts: content.messageId as string,
          text: markdownToMrkdwn((content.text as string) || (content.markdown as string) || ''),
        });
        return;
      }

      // Add a reaction.
      if (content.operation === 'reaction' && content.messageId && content.emoji) {
        await web.reactions.add({
          channel,
          timestamp: content.messageId as string,
          name: normalizeEmoji(content.emoji as string),
        });
        return;
      }

      // ask_question card with buttons.
      if (content.type === 'ask_question' && content.questionId && content.options) {
        const questionId = content.questionId as string;
        const title = content.title as string;
        const question = content.question as string;
        if (!title) {
          log.error('Slack ask_question missing title — skipping', { questionId });
          return;
        }
        const options: NormalizedOption[] = normalizeOptions(content.options as never);
        const res = await web.chat.postMessage({
          channel,
          thread_ts: threadTs,
          text: `${title}\n\n${question}`,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `*${title}*\n\n${question}` } },
            {
              type: 'actions',
              elements: options.map((opt, idx) => ({
                type: 'button',
                text: { type: 'plain_text', text: truncate(opt.label, 75), emoji: true },
                action_id: `ncq:${questionId}:${idx}`,
                value: String(idx),
              })),
            },
          ],
        });
        return res.ts;
      }

      // send_card — render as a section with optional link buttons.
      if (content.type === 'card' && content.card && typeof content.card === 'object') {
        const cardSpec = content.card as Record<string, unknown>;
        const blocks = cardToBlocks(cardSpec);
        const fallback =
          (content.fallbackText as string) || (cardSpec.title as string) || (cardSpec.description as string) || 'card';
        if (blocks.length === 0) {
          log.warn('Slack send_card payload empty, skipping');
          return;
        }
        const res = await web.chat.postMessage({
          channel,
          thread_ts: threadTs,
          text: fallback,
          blocks: blocks as never,
        });
        return res.ts;
      }

      // Normal text and/or files.
      const rawText = (content.markdown as string) || (content.text as string) || '';
      const text = rawText ? markdownToMrkdwn(rawText) : '';
      const files = message.files;

      if (files && files.length > 0) {
        const res = await web.filesUploadV2({
          channel_id: channel,
          thread_ts: threadTs,
          initial_comment: text || undefined,
          file_uploads: files.map((f) => ({ file: f.data, filename: f.filename })),
        });
        // filesUploadV2 doesn't return a single message ts reliably; surface
        // the channel/file id is not useful for edits, so return undefined.
        void res;
        return;
      }

      if (text) {
        const res = await web.chat.postMessage({ channel, thread_ts: threadTs, text, mrkdwn: true });
        return res.ts;
      }
    },

    async openDM(userHandle: string): Promise<string> {
      const res = await web.conversations.open({ users: userHandle });
      const channel = res.channel?.id;
      if (!channel) throw new Error(`Slack openDM failed for ${userHandle}`);
      return platformIdFor(channel);
    },

    async resolveChannelName(platformId: string): Promise<string | null> {
      const { channel } = decodeAddress(platformId);
      return resolveChannelNameRaw(channel);
    },

    async teardown(): Promise<void> {
      try {
        await socket.disconnect();
      } catch (err) {
        log.debug('Slack socket disconnect error', { err });
      }
      log.info('Slack Socket Mode disconnected');
    },

    isConnected(): boolean {
      return true;
    },
  };

  return adapter;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Slack message ts is "<unixSeconds>.<seq>". Convert to an ISO timestamp. */
function tsToIso(ts: string): string {
  const seconds = Number.parseFloat(ts);
  if (!Number.isFinite(seconds)) return new Date().toISOString();
  return new Date(seconds * 1000).toISOString();
}

/** Strip surrounding colons so both ":tada:" and "tada" work for reactions. */
function normalizeEmoji(emoji: string): string {
  return emoji.replace(/^:|:$/g, '');
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Decode the option a button click refers to. Buttons carry an integer index
 * into the question's options (resolved via getAskQuestionRender), falling
 * back to treating the tail as a literal value for older in-flight cards.
 */
function resolveSelectedOption(
  render: { options: NormalizedOption[] } | undefined,
  eventValue: string | undefined,
  tail: string | undefined,
): string {
  const candidate = eventValue ?? tail ?? '';
  if (render && /^\d+$/.test(candidate)) {
    const idx = Number(candidate);
    if (render.options[idx]) return render.options[idx].value;
  }
  return candidate;
}

/** Build Block Kit blocks from a send_card spec. */
function cardToBlocks(cardSpec: Record<string, unknown>): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  const title = typeof cardSpec.title === 'string' ? cardSpec.title : '';
  if (title) blocks.push({ type: 'header', text: { type: 'plain_text', text: truncate(title, 150), emoji: true } });

  if (typeof cardSpec.description === 'string' && cardSpec.description) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: markdownToMrkdwn(cardSpec.description) } });
  }

  if (Array.isArray(cardSpec.children)) {
    for (const child of cardSpec.children) {
      const childText =
        typeof child === 'string'
          ? child
          : child && typeof child === 'object' && typeof (child as Record<string, unknown>).text === 'string'
            ? (child as Record<string, string>).text
            : '';
      if (childText) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: markdownToMrkdwn(childText) } });
    }
  }

  if (Array.isArray(cardSpec.actions)) {
    const elements = (cardSpec.actions as Array<Record<string, unknown>>)
      .filter((a) => typeof a.url === 'string' && a.url && typeof a.label === 'string' && a.label)
      .map((a) => ({
        type: 'button',
        text: { type: 'plain_text', text: truncate(a.label as string, 75), emoji: true },
        url: a.url as string,
      }));
    if (elements.length > 0) blocks.push({ type: 'actions', elements });
  }

  return blocks;
}

/** A no-op logger matching @slack/logger's interface, to keep the SDK quiet. */
function makeSilentLogger() {
  const noop = (): void => {};
  return {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    setLevel: noop,
    getLevel: () => 'error' as never,
    setName: noop,
  };
}

/**
 * Validate Slack tokens against the live API before storing. bot_token (xoxb)
 * → auth.test; app_token (xapp) → apps.connections.open (the Socket Mode
 * handshake endpoint, which is exactly what the token must be able to do).
 * Network failures fail closed.
 */
async function validateSlackSecret(name: string, value: string): Promise<SecretValidation> {
  try {
    if (name === 'bot_token') {
      const res = await new WebClient(value).auth.test();
      return res.ok
        ? { ok: true, identity: res.user ? `@${res.user}` : undefined }
        : { ok: false, reason: 'Slack rejected this bot token' };
    }
    if (name === 'app_token') {
      const res = await fetch('https://slack.com/api/apps.connections.open', {
        method: 'POST',
        headers: { Authorization: `Bearer ${value}` },
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      return json.ok ? { ok: true } : { ok: false, reason: json.error ?? 'Slack rejected this app token' };
    }
    return { ok: false, reason: `slack has no "${name}" secret — only bot_token and app_token` };
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'network error';
    return { ok: false, reason: `could not validate token against Slack: ${detail}` };
  }
}

registerChannelAdapter('slack', {
  validateSecret: validateSlackSecret,
  factory: () => {
    const accounts = getChannelAccounts('slack');

    // Legacy single-bot fallback: no channel_accounts rows -> use the plain
    // SLACK_BOT_TOKEN / SLACK_APP_TOKEN env vars exactly as before.
    if (accounts.length === 0) {
      const env = readEnvFile(['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN']);
      if (!env.SLACK_BOT_TOKEN || !env.SLACK_APP_TOKEN) {
        if (env.SLACK_BOT_TOKEN || env.SLACK_APP_TOKEN) {
          log.warn('Slack Socket Mode needs both SLACK_BOT_TOKEN and SLACK_APP_TOKEN — skipping');
        }
        return null;
      }
      return createSlackSocketAdapter({ botToken: env.SLACK_BOT_TOKEN, appToken: env.SLACK_APP_TOKEN });
    }

    // Multi-account: one adapter per Slack app, tokens decrypted from the DB.
    const adapters: ChannelAdapter[] = [];
    for (const account of accounts) {
      const secrets = getAccountSecrets(account.id);
      if (!secrets.bot_token || !secrets.app_token) {
        log.warn('Slack account missing bot_token/app_token, skipping', { accountId: account.account_id });
        continue;
      }
      const adapter = createSlackSocketAdapter({ botToken: secrets.bot_token, appToken: secrets.app_token });
      adapter.accountId = account.account_id;
      adapters.push(adapter);
    }
    return adapters;
  },
});
