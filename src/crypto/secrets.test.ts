import { randomBytes } from 'crypto';

import { describe, expect, it, vi } from 'vitest';

// Pin a deterministic 32-byte master key so the round-trip is reproducible
// without depending on the repo's real .env.
const TEST_KEY = randomBytes(32).toString('base64');

vi.mock('../env.js', () => ({
  readEnvFile: (keys: string[]) => (keys.includes('NANOCLAW_SECRET_KEY') ? { NANOCLAW_SECRET_KEY: TEST_KEY } : {}),
}));

const { encryptSecret, decryptSecret } = await import('./secrets.js');

describe('secrets crypto', () => {
  it('round-trips a token through encrypt/decrypt', () => {
    const plaintext = 'xoxb-super-secret-bot-token-1234567890';
    const encrypted = encryptSecret(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = encryptSecret('same-value');
    const b = encryptSecret('same-value');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('same-value');
    expect(decryptSecret(b)).toBe('same-value');
  });

  it('handles unicode and empty strings', () => {
    for (const v of ['', '🔐 café — naïve', 'a'.repeat(5000)]) {
      expect(decryptSecret(encryptSecret(v))).toBe(v);
    }
  });

  it('rejects tampered ciphertext (GCM auth tag)', () => {
    const encrypted = encryptSecret('integrity-matters');
    const raw = Buffer.from(encrypted, 'base64');
    raw[raw.length - 1] ^= 0xff; // flip a ciphertext bit
    expect(() => decryptSecret(raw.toString('base64'))).toThrow();
  });
});
