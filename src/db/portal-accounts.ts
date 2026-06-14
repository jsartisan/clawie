/**
 * Portal operator accounts (email + password) and browser sessions.
 *
 * Password hashing is scrypt (node:crypto, no extra deps) with a per-account
 * random salt, stored as `s1:<salt-hex>:<hash-hex>` so the format can evolve.
 * Session cookies are 32 random bytes; the DB keeps only their SHA-256, so
 * reading the DB never yields a usable session token.
 */
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';

import { getDb } from './connection.js';

export interface PortalAccount {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
}

const SCRYPT_KEYLEN = 64;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── Password hashing ──

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `s1:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [version, salt, hash] = stored.split(':');
  if (version !== 's1' || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// ── Accounts ──

export function countPortalAccounts(): number {
  return (getDb().prepare('SELECT COUNT(*) AS n FROM portal_accounts').get() as { n: number }).n;
}

export function getPortalAccountByEmail(email: string): PortalAccount | undefined {
  return getDb().prepare('SELECT * FROM portal_accounts WHERE email = ?').get(email.trim()) as
    | PortalAccount
    | undefined;
}

export function getPortalAccount(id: string): PortalAccount | undefined {
  return getDb().prepare('SELECT * FROM portal_accounts WHERE id = ?').get(id) as PortalAccount | undefined;
}

export function createPortalAccount(input: { email: string; name: string; password: string }): PortalAccount {
  const account: PortalAccount = {
    id: `pa-${randomUUID()}`,
    email: input.email.trim(),
    name: input.name.trim(),
    password_hash: hashPassword(input.password),
    created_at: new Date().toISOString(),
  };
  getDb()
    .prepare(
      'INSERT INTO portal_accounts (id, email, name, password_hash, created_at) VALUES (@id, @email, @name, @password_hash, @created_at)',
    )
    .run(account);
  return account;
}

// ── Sessions ──

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Create a session for the account; returns the raw cookie token. */
export function createPortalSession(accountId: string): { token: string; expiresAt: string } {
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_TTL_MS).toISOString();
  getDb()
    .prepare('INSERT INTO portal_sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(hashSessionToken(token), accountId, new Date(now).toISOString(), expiresAt);
  return { token, expiresAt };
}

/** Resolve a cookie token to its account; null when missing or expired. */
export function getAccountForSession(token: string): PortalAccount | null {
  const row = getDb()
    .prepare('SELECT account_id, expires_at FROM portal_sessions WHERE token_hash = ?')
    .get(hashSessionToken(token)) as { account_id: string; expires_at: string } | undefined;
  if (!row) return null;
  if (Date.parse(row.expires_at) < Date.now()) {
    deletePortalSession(token);
    return null;
  }
  return getPortalAccount(row.account_id) ?? null;
}

export function deletePortalSession(token: string): void {
  getDb().prepare('DELETE FROM portal_sessions WHERE token_hash = ?').run(hashSessionToken(token));
}
