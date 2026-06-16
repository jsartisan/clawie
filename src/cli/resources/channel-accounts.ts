import {
  deleteChannelAccount,
  getChannelAccountById,
  setAccountSecret,
  setDefaultChannelAccount,
  updateChannelAccountEngagement,
} from '../../db/channel-accounts.js';
import {
  getMessagingGroupAgentByPair,
  getMessagingGroupsByChannelAccount,
  updateMessagingGroupAgent,
} from '../../db/messaging-groups.js';
import { reloadChannelType, validateChannelSecret } from '../../channels/channel-registry.js';
import { log } from '../../log.js';
import { registerResource } from '../crud.js';

const ENGAGE_MODES = ['mention', 'mention-sticky', 'pattern'] as const;

/**
 * Hot-reload the account's channel type so the change goes live without a
 * host restart. Best-effort: the DB write already succeeded, and a reload
 * hiccup (e.g. called from a context where adapters never initialized, like
 * tests) shouldn't fail the verb — worst case the old behavior applies until
 * the next restart.
 */
async function reloadAccounts(channelType: string): Promise<string[] | undefined> {
  try {
    const { accounts } = await reloadChannelType(channelType);
    return accounts;
  } catch (err) {
    log.warn('Channel hot-reload failed — change applies on next restart', { channelType, err });
    return undefined;
  }
}

registerResource({
  name: 'channel-account',
  plural: 'channel-accounts',
  table: 'channel_accounts',
  description:
    'Channel account — maps one bot/app (identified by account_id) to a default agent group. Every chat that bot sees auto-routes to that agent. Tokens are stored encrypted via the `set-secret` verb, never as plain columns.',
  idColumn: 'id',
  columns: [
    { name: 'id', type: 'string', description: 'UUID.', generated: true },
    { name: 'channel_type', type: 'string', description: 'Platform, e.g. telegram or slack.', required: true },
    {
      name: 'account_id',
      type: 'string',
      description:
        'Your nickname for this bot (e.g. work, side). Identifies the account; tokens are attached via set-secret.',
      required: true,
    },
    {
      name: 'default_agent_group_id',
      type: 'string',
      description: 'Agent group that handles every chat this bot sees. References agent_groups.id.',
      updatable: true,
    },
    {
      name: 'is_default',
      type: 'boolean',
      description:
        'Whether this is the default account for its channel type. The default bot owns legacy account-less chats. Set via the set-default verb, not here.',
      generated: true,
    },
    { name: 'created_at', type: 'string', description: 'Auto-set.', generated: true },
  ],
  operations: { list: 'open', get: 'open', create: 'approval', update: 'approval' },
  customOperations: {
    'set-secret': {
      access: 'approval',
      description:
        'Validate a token against the live platform (Telegram getMe / Slack auth.test), store it encrypted, and hot-reload the channel so the bot goes live immediately. name is the token key (bot_token | app_token). The value is never echoed back.',
      args: [
        { name: 'id', type: 'string', description: 'channel_accounts.id', required: true },
        { name: 'name', type: 'string', description: 'Token key: bot_token | app_token', required: true },
        { name: 'value', type: 'string', description: 'The raw token to encrypt and store.', required: true },
      ],
      handler: async (args) => {
        const id = String(args.id);
        const account = getChannelAccountById(id);
        if (!account) throw new Error(`channel account not found: ${id}`);

        // Validate against the live platform BEFORE storing — a garbage token
        // used to sit in the DB until the next adapter init discovered it.
        const validation = await validateChannelSecret(account.channel_type, String(args.name), String(args.value));
        if (!validation.ok) {
          throw new Error(`token rejected: ${validation.reason}`);
        }

        setAccountSecret(id, String(args.name), String(args.value));
        const accounts = await reloadAccounts(account.channel_type);

        // Never return the value — only confirm what was stored and who the
        // token belongs to (for "bot online" confirmation in the UI).
        return {
          ok: true,
          id,
          name: args.name,
          identity: validation.identity ?? null,
          online: accounts ? accounts.includes(account.account_id) : null,
        };
      },
    },
    'set-default': {
      access: 'approval',
      description:
        'Mark this account as the default for its channel type. The default bot transparently owns legacy account-less chats (existing DMs/groups created before accounts), for both inbound routing and outbound replies. Clears the flag on sibling accounts of the same channel.',
      args: [{ name: 'id', type: 'string', description: 'channel_accounts.id', required: true }],
      handler: async (args) => {
        setDefaultChannelAccount(String(args.id));
        return { ok: true, id: args.id, is_default: true };
      },
    },
    'set-engagement': {
      access: 'approval',
      description:
        'Set how the agent decides to respond on this connection: mention (only when @-mentioned; DMs always reply), ' +
        'mention-sticky (mention once, then auto-reply in that thread), or pattern (reply when message text matches ' +
        '--engage-pattern; "." = always-on). Stored as the connection default (used for chats the bot joins later) ' +
        'and applied to every chat this bot already owns.',
      args: [
        { name: 'id', type: 'string', description: 'channel_accounts.id', required: true },
        {
          name: 'engage_mode',
          type: 'string',
          description: 'mention | mention-sticky | pattern',
          required: true,
          enum: [...ENGAGE_MODES],
        },
        {
          name: 'engage_pattern',
          type: 'string',
          description: 'Regex source; required when engage_mode=pattern ("." matches everything).',
        },
      ],
      handler: async (args) => {
        const id = String(args.id);
        const account = getChannelAccountById(id);
        if (!account) throw new Error(`channel account not found: ${id}`);

        const engageMode = String(args.engage_mode) as (typeof ENGAGE_MODES)[number];
        // enum metadata is not auto-enforced for custom ops — validate explicitly.
        if (!ENGAGE_MODES.includes(engageMode)) {
          throw new Error(`engage_mode must be one of: ${ENGAGE_MODES.join(', ')}`);
        }

        // engage_pattern is only meaningful in pattern mode. Require + validate
        // it there (evaluateEngage fails OPEN on a bad regex, so write-time is
        // the only guard); null it out otherwise so a stale pattern can't apply.
        let engagePattern: string | null = null;
        if (engageMode === 'pattern') {
          const raw = args.engage_pattern;
          if (raw === undefined || raw === null || String(raw).length === 0) {
            throw new Error('engage_pattern is required when engage_mode=pattern (use "." for always-on)');
          }
          engagePattern = String(raw);
          try {
            new RegExp(engagePattern);
          } catch (e) {
            throw new Error(`invalid engage_pattern regex: ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        // 1. Write the connection-level default.
        updateChannelAccountEngagement(id, { engage_mode: engageMode, engage_pattern: engagePattern });

        // 2. Propagate to wirings this bot already owns (auto-wiring only covers
        //    NEW chats). messaging_groups.channel_account holds the account_id
        //    string; the wiring to update is the one for this account's default
        //    agent. Other hand-wired agents on the same chat are left untouched.
        let updatedWirings = 0;
        if (account.default_agent_group_id) {
          const groups = getMessagingGroupsByChannelAccount(account.channel_type, account.account_id);
          for (const mg of groups) {
            const wiring = getMessagingGroupAgentByPair(mg.id, account.default_agent_group_id);
            if (!wiring) continue;
            updateMessagingGroupAgent(wiring.id, { engage_mode: engageMode, engage_pattern: engagePattern });
            updatedWirings++;
          }
        }

        return { id, engage_mode: engageMode, engage_pattern: engagePattern, updated_wirings: updatedWirings };
      },
    },
    delete: {
      access: 'approval',
      description:
        'Delete an account and its stored secrets, then hot-reload the channel so the bot goes offline immediately. Use --id <account-id>.',
      args: [{ name: 'id', type: 'string', description: 'channel_accounts.id', required: true }],
      handler: async (args) => {
        const id = String(args.id);
        const account = getChannelAccountById(id);
        if (!account) throw new Error(`channel account not found: ${id}`);

        deleteChannelAccount(id);
        await reloadAccounts(account.channel_type);
        return { deleted: id };
      },
    },
  },
});
