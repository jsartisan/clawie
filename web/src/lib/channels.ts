/**
 * Friendly channel metadata for the Connections UI. Only channels with a
 * guided connect flow appear here — the backend supports any installed
 * channel adapter, but the catalog is what non-technical users see.
 */

export interface ChannelTokenField {
  /** Secret key name passed to channel-accounts set-secret. */
  key: 'bot_token' | 'app_token';
  label: string;
  placeholder: string;
  required: boolean;
}

export interface ChannelInfo {
  id: string;
  name: string;
  tagline: string;
  /** Plain-language steps to obtain the credentials. */
  steps: string[];
  tokens: ChannelTokenField[];
}

export const CHANNEL_CATALOG: ChannelInfo[] = [
  {
    id: 'telegram',
    name: 'Telegram',
    tagline: 'Chat with your agent from the Telegram app on any device.',
    steps: [
      'Open Telegram and search for @BotFather.',
      'Send it the message /newbot and follow the prompts to pick a name.',
      'BotFather replies with a token — copy it and paste it below.',
      'After connecting, open your new bot in Telegram and say hi.',
    ],
    tokens: [
      {
        key: 'bot_token',
        label: 'Bot token',
        placeholder: '1234567890:ABC…',
        required: true,
      },
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    tagline: 'Bring your agent into your Slack workspace.',
    steps: [
      'Go to api.slack.com/apps and create an app (from scratch).',
      'Enable Socket Mode (Settings → Socket Mode) and create an app-level token with connections:write — that\'s the token starting with xapp-.',
      'Under OAuth & Permissions, add the bot scopes chat:write, im:history, im:read, app_mentions:read, channels:history, then install the app — that gives you the token starting with xoxb-.',
      'Paste both tokens below.',
    ],
    tokens: [
      {
        key: 'bot_token',
        label: 'Bot token (xoxb-…)',
        placeholder: 'xoxb-…',
        required: true,
      },
      {
        key: 'app_token',
        label: 'App token (xapp-…)',
        placeholder: 'xapp-…',
        required: true,
      },
    ],
  },
];

export function channelInfo(id: string | undefined): ChannelInfo | undefined {
  return CHANNEL_CATALOG.find((c) => c.id === id);
}
