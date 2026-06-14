import {
  deleteChannelAccount,
  getChannelAccountById,
  setAccountSecret,
  setDefaultChannelAccount,
} from '../../db/channel-accounts.js';
import { reloadChannelType, validateChannelSecret } from '../../channels/channel-registry.js';
import { log } from '../../log.js';
import { registerResource } from '../crud.js';

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
