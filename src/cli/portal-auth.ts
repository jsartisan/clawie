/**
 * Portal authentication.
 *
 * Clawie is a personal agent. The portal server binds to loopback (127.0.0.1)
 * and access is gated by Origin/Host validation only:
 *
 *  - Requests from a non-local Origin or Host are rejected outright, defeating
 *    DNS rebinding attacks and browser-origin CSRF from malicious web pages.
 *    Non-browser clients (curl, scripts) don't send Origin, so they pass the
 *    Origin check and are gated by the Host check alone.
 *
 * No bearer token, no accounts, no sessions. Just open http://localhost:4100.
 */
import type http from 'http';

import type { CallerContext } from './frame.js';

export type PortalCallerContext = Extract<CallerContext, { caller: 'portal' }>;
export type PortalAuthResult = 'ok' | 'bad-origin';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

function isLocalHeader(value: string | undefined): boolean {
  if (!value) return true;
  try {
    const url = value.includes('://') ? new URL(value) : new URL(`http://${value}`);
    return LOCAL_HOSTNAMES.has(url.hostname);
  } catch {
    return false;
  }
}

export function checkPortalOrigin(req: http.IncomingMessage): boolean {
  return isLocalHeader(req.headers.host) && isLocalHeader(req.headers.origin);
}

export function checkPortalAuth(
  req: http.IncomingMessage,
  _url: URL,
): { result: 'ok'; ctx: PortalCallerContext } | { result: 'bad-origin' } {
  if (!checkPortalOrigin(req)) {
    return { result: 'bad-origin' };
  }
  return { result: 'ok', ctx: { caller: 'portal' } };
}
