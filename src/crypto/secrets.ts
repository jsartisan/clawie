/**
 * Symmetric secret encryption for host-side credentials stored in the central
 * DB (currently per-bot channel tokens in `channel_account_secrets`).
 *
 * Model: AES-256-GCM with a single 32-byte master key in `.env`
 * (`CLAWIE_SECRET_KEY`, base64). Each ciphertext is self-describing —
 * `base64(iv[12] | authTag[16] | ciphertext)` — so a random IV per record and
 * the GCM auth tag travel with the value. No external KMS, no per-record key
 * management.
 *
 * Threat model: this protects DB-only exposure (a copied/branched `data/v2.db`,
 * DB Browser, backups, `clawie ... list`, `q.ts`) — all of which see ciphertext.
 * It does NOT protect a host that holds both `.env` and the DB, since the
 * master key lives in `.env`. Keep `.env` at chmod 600 (it is gitignored).
 *
 * The key is read via `readEnvFile` (not `process.env`) so it never leaks into
 * spawned container environments — consistent with how channel tokens are read.
 */
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

import { readEnvFile } from '../env.js';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Resolve the 32-byte master key from `.env`. Throws a clear error when the
 * key is missing or malformed so callers fail loudly at first use rather than
 * silently writing/reading garbage.
 */
function masterKey(): Buffer {
  const raw = readEnvFile(['CLAWIE_SECRET_KEY']).CLAWIE_SECRET_KEY;
  if (!raw) {
    throw new Error('CLAWIE_SECRET_KEY is not set in .env — generate one with `openssl rand -base64 32`');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('CLAWIE_SECRET_KEY must decode to 32 bytes (generate with `openssl rand -base64 32`)');
  }
  return key;
}

/** Encrypt a UTF-8 string. Returns `base64(iv | authTag | ciphertext)`. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

/**
 * Decrypt a value produced by `encryptSecret`. Throws if the master key is
 * wrong or the ciphertext was tampered with (GCM auth-tag verification).
 */
export function decryptSecret(encoded: string): string {
  const raw = Buffer.from(encoded, 'base64');
  if (raw.length < IV_BYTES + TAG_BYTES) {
    throw new Error('encrypted secret is too short to be valid');
  }
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGO, masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
