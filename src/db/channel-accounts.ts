/**
 * Channel accounts DB layer.
 *
 * `channel_accounts` holds the non-secret bot -> agent mapping. Tokens live in
 * `channel_account_secrets`, encrypted at rest (src/crypto/secrets.ts). The
 * factory reads all accounts for a channel to know which bots to spin up; the
 * router reads one account for the default-agent auto-wire.
 */
import type { ChannelAccount } from '../types.js';
import { encryptSecret, decryptSecret } from '../crypto/secrets.js';
import { getDb } from './connection.js';

/** All accounts for a channel type — used by the adapter factory at boot. */
export function getChannelAccounts(channelType: string): ChannelAccount[] {
  return getDb().prepare('SELECT * FROM channel_accounts WHERE channel_type = ?').all(channelType) as ChannelAccount[];
}

/** One account by (channel_type, account_id) — used by the router. */
export function getChannelAccount(channelType: string, accountId: string): ChannelAccount | undefined {
  return getDb()
    .prepare('SELECT * FROM channel_accounts WHERE channel_type = ? AND account_id = ?')
    .get(channelType, accountId) as ChannelAccount | undefined;
}

/** One account by primary key — used by the `channel-accounts` CLI verbs. */
export function getChannelAccountById(id: string): ChannelAccount | undefined {
  return getDb().prepare('SELECT * FROM channel_accounts WHERE id = ?').get(id) as ChannelAccount | undefined;
}

/** Delete an account and its stored secrets in one transaction. */
export function deleteChannelAccount(id: string): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM channel_account_secrets WHERE channel_account_id = ?').run(id);
    const result = db.prepare('DELETE FROM channel_accounts WHERE id = ?').run(id);
    if (result.changes === 0) throw new Error(`channel account not found: ${id}`);
  })();
}

/**
 * The default account for a channel type, if one is designated. Used to map
 * legacy `channel_account IS NULL` chats to the bot that owns them (inbound
 * matching and outbound delivery).
 */
export function getDefaultChannelAccount(channelType: string): ChannelAccount | undefined {
  return getDb()
    .prepare('SELECT * FROM channel_accounts WHERE channel_type = ? AND is_default = 1')
    .get(channelType) as ChannelAccount | undefined;
}

/**
 * Mark one account as the default for its channel type, clearing the flag on
 * its siblings. Atomic so there is never more than one default per channel.
 */
export function setDefaultChannelAccount(id: string): void {
  const db = getDb();
  const account = db.prepare('SELECT channel_type FROM channel_accounts WHERE id = ?').get(id) as
    | { channel_type: string }
    | undefined;
  if (!account) throw new Error(`channel account not found: ${id}`);
  db.transaction(() => {
    db.prepare('UPDATE channel_accounts SET is_default = 0 WHERE channel_type = ?').run(account.channel_type);
    db.prepare('UPDATE channel_accounts SET is_default = 1 WHERE id = ?').run(id);
  })();
}

/**
 * Store (or replace) an encrypted secret for an account. `name` is a
 * channel-specific token key, e.g. `bot_token` or `app_token`. The plaintext
 * is encrypted here and never persisted in the clear.
 */
export function setAccountSecret(channelAccountId: string, name: string, plaintext: string): void {
  getDb()
    .prepare(
      `INSERT INTO channel_account_secrets (channel_account_id, name, value_encrypted, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(channel_account_id, name) DO UPDATE SET value_encrypted = excluded.value_encrypted`,
    )
    .run(channelAccountId, name, encryptSecret(plaintext), new Date().toISOString());
}

/**
 * Return all decrypted secrets for an account as a name -> value map (e.g.
 * `{ bot_token, app_token }`). Empty object when none are stored. Throws if
 * the master key is missing/wrong (fail loud rather than spin up a bot with a
 * corrupt token).
 */
export function getAccountSecrets(channelAccountId: string): Record<string, string> {
  const rows = getDb()
    .prepare('SELECT name, value_encrypted FROM channel_account_secrets WHERE channel_account_id = ?')
    .all(channelAccountId) as { name: string; value_encrypted: string }[];
  const out: Record<string, string> = {};
  for (const row of rows) out[row.name] = decryptSecret(row.value_encrypted);
  return out;
}
