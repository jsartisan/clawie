import type http from 'http';

import { describe, expect, it, vi } from 'vitest';

// Pin the token via the mocked env reader so no .env file is touched.
const TEST_TOKEN = 'a'.repeat(64);

vi.mock('../env.js', () => ({
  readEnvFile: (keys: string[]) => (keys.includes('NCL_PORTAL_TOKEN') ? { NCL_PORTAL_TOKEN: TEST_TOKEN } : {}),
}));

const { checkPortalAuth, ensurePortalToken } = await import('./portal-auth.js');

function req(headers: Record<string, string>): http.IncomingMessage {
  return { headers } as unknown as http.IncomingMessage;
}

function url(params = ''): URL {
  return new URL(`http://127.0.0.1:4100/api/call${params}`);
}

describe('portal auth', () => {
  it('reads the token from .env without generating a new one', () => {
    expect(ensurePortalToken()).toBe(TEST_TOKEN);
  });

  it('accepts a valid bearer token with local Host', () => {
    const r = req({ host: '127.0.0.1:4100', authorization: `Bearer ${TEST_TOKEN}` });
    const auth = checkPortalAuth(r, url());
    expect(auth.result).toBe('ok');
    if (auth.result === 'ok') {
      expect(auth.ctx).toEqual({ caller: 'portal' });
    }
  });

  it('accepts a valid ?token= query param (WebSocket upgrade path)', () => {
    const r = req({ host: 'localhost:4100' });
    expect(checkPortalAuth(r, url(`?token=${TEST_TOKEN}`)).result).toBe('ok');
  });

  it('rejects a missing token', () => {
    expect(checkPortalAuth(req({ host: '127.0.0.1:4100' }), url()).result).toBe('bad-token');
  });

  it('rejects a wrong token and a wrong-length token', () => {
    const wrong = 'b'.repeat(64);
    expect(checkPortalAuth(req({ host: '127.0.0.1:4100', authorization: `Bearer ${wrong}` }), url()).result).toBe(
      'bad-token',
    );
    expect(checkPortalAuth(req({ host: '127.0.0.1:4100', authorization: 'Bearer short' }), url()).result).toBe(
      'bad-token',
    );
  });

  it('rejects a non-local Origin even with a valid token (CSRF)', () => {
    const r = req({
      host: '127.0.0.1:4100',
      origin: 'https://evil.example',
      authorization: `Bearer ${TEST_TOKEN}`,
    });
    expect(checkPortalAuth(r, url()).result).toBe('bad-origin');
  });

  it('rejects a non-local Host even with a valid token (DNS rebinding)', () => {
    const r = req({ host: 'evil.example:4100', authorization: `Bearer ${TEST_TOKEN}` });
    expect(checkPortalAuth(r, url()).result).toBe('bad-origin');
  });

  it('accepts local Origins (same-origin portal + Vite dev server)', () => {
    for (const origin of ['http://127.0.0.1:4100', 'http://localhost:4101', 'http://[::1]:4100']) {
      const r = req({ host: '127.0.0.1:4100', origin, authorization: `Bearer ${TEST_TOKEN}` });
      expect(checkPortalAuth(r, url()).result).toBe('ok');
    }
  });

  it('rejects an unparseable Origin', () => {
    const r = req({ host: '127.0.0.1:4100', origin: 'not a url::', authorization: `Bearer ${TEST_TOKEN}` });
    expect(checkPortalAuth(r, url()).result).toBe('bad-origin');
  });
});
