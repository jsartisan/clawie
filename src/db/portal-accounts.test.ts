import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, initTestDb, runMigrations } from './index.js';
import { getDb } from './connection.js';
import {
  countPortalAccounts,
  createPortalAccount,
  createPortalSession,
  deletePortalSession,
  getAccountForSession,
  getPortalAccountByEmail,
  hashPassword,
  verifyPassword,
} from './portal-accounts.js';

describe('portal accounts', () => {
  beforeEach(() => {
    const db = initTestDb();
    runMigrations(db);
  });

  afterEach(() => {
    closeDb();
  });

  it('hashes and verifies passwords', () => {
    const hash = hashPassword('correct horse battery staple');
    expect(hash.startsWith('s1:')).toBe(true);
    expect(verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(verifyPassword('wrong', hash)).toBe(false);
  });

  it('produces a different hash per account (random salt)', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'));
  });

  it('creates accounts and finds them case-insensitively by email', () => {
    expect(countPortalAccounts()).toBe(0);
    createPortalAccount({ email: 'Me@Example.com', name: 'Me', password: 'password123' });
    expect(countPortalAccounts()).toBe(1);
    expect(getPortalAccountByEmail('me@example.com')?.name).toBe('Me');
  });

  it('round-trips a session and rejects bad tokens', () => {
    const account = createPortalAccount({ email: 'a@b.com', name: 'A', password: 'password123' });
    const { token } = createPortalSession(account.id);
    expect(getAccountForSession(token)?.id).toBe(account.id);
    expect(getAccountForSession('not-a-real-token')).toBeNull();

    deletePortalSession(token);
    expect(getAccountForSession(token)).toBeNull();
  });

  it('stores only a hash of the session token', () => {
    const account = createPortalAccount({ email: 'a@b.com', name: 'A', password: 'password123' });
    const { token } = createPortalSession(account.id);
    const rows = getDb().prepare('SELECT token_hash FROM portal_sessions').all() as { token_hash: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(token);
  });
});
