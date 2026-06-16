import type { Migration } from './index.js';

/**
 * Per-connection engagement defaults on channel_accounts.
 *
 * `engage_mode` / `engage_pattern` already live on messaging_group_agents (the
 * per-chat wiring, migration 010), but those rows are created lazily — the
 * router auto-wires a chat to the account's default agent only when the first
 * message arrives (src/router.ts). These two columns let a portal user set the
 * engagement behaviour for a whole connected bot up front: the router stamps
 * them onto the wirings it auto-creates, and the `set-engagement` verb also
 * propagates a change to wirings that already exist so the setting stays
 * consistent for chats already in flight.
 *
 *   engage_mode:    'mention' | 'mention-sticky' | 'pattern' (NOT NULL, default 'mention')
 *   engage_pattern: regex source, required only when mode='pattern' ('.' = always)
 *
 * ALTER TABLE ADD COLUMN is cheap in SQLite (no table rewrite); the NOT NULL
 * DEFAULT on a constant backfills existing rows. No FK toggling needed.
 */
export const migration023: Migration = {
  version: 23,
  name: '023-channel-account-engagement',
  up: (db) => {
    db.prepare("ALTER TABLE channel_accounts ADD COLUMN engage_mode TEXT NOT NULL DEFAULT 'mention'").run();
    db.prepare('ALTER TABLE channel_accounts ADD COLUMN engage_pattern TEXT').run();
  },
};
