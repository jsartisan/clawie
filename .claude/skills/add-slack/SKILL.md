---
name: add-slack
description: Add Slack channel integration via native Socket Mode (no public webhook needed).
---

# Add Slack Channel

Adds Slack support via a **native Socket Mode** adapter built directly on
`@slack/socket-mode` + `@slack/web-api`. Socket Mode opens an outbound
WebSocket to Slack, so Clawie never needs a public webhook URL, an ngrok
tunnel, or the shared `webhook-server.ts`. Messages, button clicks, and file
uploads all arrive over that single connection.

Wire-format compatibility: platform/thread ids match the legacy encoding
(`slack:<channel>` and `slack:<channel>:<thread_ts>`), so existing
`messaging_groups`, `sessions`, and `user_roles` rows keep working.

## Install

### Pre-flight (idempotent)

Skip to **Credentials** if all of these are already in place:

- `src/channels/slack.ts` exists (the native Socket Mode adapter)
- `src/channels/index.ts` contains `import './slack.js';`
- `@slack/socket-mode`, `@slack/web-api`, and `slackify-markdown` are listed in `package.json` dependencies

Otherwise continue. Every step below is safe to re-run.

### 1. Adapter file

The native Socket Mode adapter lives at `src/channels/slack.ts`. If it's
missing, fetch it from the `channels` branch:

```bash
git fetch origin channels
git show origin/channels:src/channels/slack.ts > src/channels/slack.ts
```

### 2. Append the self-registration import

Append to `src/channels/index.ts` (skip if the line is already present):

```typescript
import './slack.js';
```

### 3. Install the adapter packages

```bash
pnpm install @slack/socket-mode @slack/web-api slackify-markdown
```

### 4. Build

```bash
pnpm run build
```

## Credentials

Socket Mode needs **two** tokens:

- **Bot User OAuth Token** (`xoxb-…`) — used by the `@slack/web-api` client to post messages, upload files, read user/channel info.
- **App-Level Token** (`xapp-…`) — used by the `@slack/socket-mode` client to open the WebSocket. Requires the `connections:write` scope.

### Create Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App** > **From scratch**
2. Name it (e.g., "Clawie") and select your workspace

### Enable Socket Mode + app-level token

3. Go to **Socket Mode** (left sidebar) and toggle **Enable Socket Mode** on
4. When prompted, generate an **App-Level Token** with the `connections:write` scope — copy it (`xapp-…`). (You can also create it later under **Basic Information > App-Level Tokens**.)

### Bot token scopes

5. Go to **OAuth & Permissions** and add Bot Token Scopes:
   - `chat:write`, `im:write`, `channels:history`, `groups:history`, `im:history`, `channels:read`, `groups:read`, `users:read`, `reactions:write`, `files:read`, `files:write`
6. Click **Install to Workspace** and copy the **Bot User OAuth Token** (`xoxb-…`)

### Enable DMs

7. Go to **App Home** and enable the **Messages Tab**
8. Check **"Allow users to send Slash commands and messages from the messages tab"**

### Event Subscriptions

9. Go to **Event Subscriptions** and toggle **Enable Events** on. With Socket Mode enabled, **no Request URL is required** — Slack delivers events over the socket.
10. Under **Subscribe to bot events**, add:
    - `message.channels`, `message.groups`, `message.im`, `app_mention`
11. Click **Save Changes**

### Interactivity

12. Go to **Interactivity & Shortcuts** and toggle **Interactivity** on. Again, **no Request URL is required** under Socket Mode — button clicks arrive over the socket.
13. Click **Save Changes**
14. If Slack shows a banner asking you to **reinstall the app**, click it to apply the new scopes/settings.

### Configure environment

Add to `.env`:

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-level-token
```

The adapter self-registers only when **both** tokens are present; if just one is
set it logs a warning and skips Slack.

Sync to container (if your install uses the container env mount): `mkdir -p data/env && cp .env data/env/env`

### No webhook server needed

Socket Mode is an outbound WebSocket, so there is nothing to expose to the
internet — no `WEBHOOK_PORT`, no ngrok, no reverse proxy, no public URL. This is
the main difference from the old Chat SDK webhook adapter.

## Multiple apps (one Slack app per agent)

The single `SLACK_BOT_TOKEN`/`SLACK_APP_TOKEN` pair above runs one Slack app. To run several apps — each statically bound to its own agent group (distinct personality and tool access, e.g. a work app that reaches work Grafana and a side-project app that reaches side-project Grafana) — use **channel accounts**. Each account is a Slack app whose tokens are stored encrypted in the DB and whose channels auto-route to a default agent (no "which agent?" prompt).

### 1. Set the master key (one-time)

Channel-account tokens are encrypted at rest with AES-256-GCM. Generate a 32-byte key and add it to `.env`:

```bash
grep -q '^CLAWIE_SECRET_KEY=' .env || echo "CLAWIE_SECRET_KEY=$(openssl rand -base64 32)" >> .env
```

Keep `.env` private (chmod 600). Losing this key makes stored tokens unrecoverable.

### 2. Create an account per app and bind it to an agent

`account_id` is any short nickname you choose for the app (e.g. `work`, `side`). `default_agent_group_id` is the agent every channel that app sees will route to (find it with `clawie groups list`).

```bash
# Create the mapping (one per Slack app — each needs its own bot + app token)
clawie channel-accounts create --channel-type slack --account-id work --default-agent-group-id <agent-group-id>

# Store its tokens (encrypted) — use the channel_accounts.id printed above
clawie channel-accounts set-secret --id <channel-account-id> --name bot_token --value xoxb-...
clawie channel-accounts set-secret --id <channel-account-id> --name app_token --value xapp-...
```

Repeat for each app with its own `account_id` and agent group. Inspect with `clawie channel-accounts list` (tokens are never shown).

### 3. Pick a default account

Chat identity includes the app account. Mark one account as the default — the default app transparently owns any account-less channel (chats created before you added accounts), so nothing needs re-wiring:

```bash
clawie channel-accounts set-default --id <channel-account-id>
```

Typically the default is the account that wraps your original (pre-accounts) app.

### 4. Restart

Restart the host so the factory opens one Socket Mode connection per app. As soon as accounts exist, the legacy `SLACK_BOT_TOKEN`/`SLACK_APP_TOKEN` env vars are ignored for Slack, and every Slack channel auto-wires to its app's default agent.

## Next Steps

If you're in the middle of `/setup`, return to the setup flow now.

Otherwise, run `/manage-channels` to wire this channel to an agent group.

## Channel Info

- **type**: `slack`
- **terminology**: Slack has "workspaces" containing "channels." Channels can be public (#general) or private. The bot can also receive direct messages.
- **platform-id-format**: `slack:{channelId}` for channels (e.g., `slack:C0123ABC`), `slack:{dmId}` for DMs (e.g., `slack:D0ARWEBLV63`)
- **how-to-find-id**: Right-click a channel name > "View channel details" — the Channel ID is at the bottom (starts with C). For DMs, the ID starts with D. Or copy the channel link — the ID is the last segment of the URL.
- **supports-threads**: yes
- **typical-use**: Interactive chat — team channels or direct messages
- **default-isolation**: Same agent group for channels where you're the primary user. Separate agent group for channels with different teams or sensitive contexts.
