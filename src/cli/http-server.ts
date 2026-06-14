/**
 * Portal HTTP server — the user-facing web product surface.
 *
 * Exposes the `clawie` dispatch/CRUD layer over a tiny JSON API so the web/
 * SPA (the portal) can manage agents, channel accounts, wirings, etc. — the
 * same surface the `clawie` CLI drives, but with a browser UI.
 *
 * Security model: binds to 127.0.0.1 AND requires auth on /api:
 *   - bearer token (NCL_PORTAL_TOKEN, generated into .env on first start)
 *   - Origin/Host validation (rejects DNS rebinding + browser-origin CSRF)
 * See src/cli/portal-auth.ts for the rationale. No accounts or sessions —
 * Clawie is a personal agent. The bearer token is the sole credential.
 *
 * Routes:
 *   GET  /api/schema       → { resources: ResourceSchema[] } (drives the UI)
 *   POST /api/call         → run one { command, args } frame, return ResponseFrame
 *   POST /api/chat/send    → inject a webchat message ({ platformId, text })
 *   GET  /api/chat/events  → SSE stream of webchat events for ?platformId=
 *   GET  /*                → static SPA assets (production), SPA fallback to index.html
 */
import { randomUUID } from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';

import { isWebchatRunning, subscribeWebchat, webchatSend } from '../channels/webchat.js';
import { NCL_PORTAL_PORT } from '../config.js';
import { log } from '../log.js';
import { getResourceSchema } from './crud.js';
import { dispatch } from './dispatch.js';
import { checkPortalAuth, type PortalCallerContext } from './portal-auth.js';
import { portalChatPlatformId } from './commands/chat.js';
import type { RequestFrame } from './frame.js';

// Built SPA assets are served from web/dist in production. PROJECT_ROOT is the
// process cwd (the host always runs from the repo root).
const WEB_DIST = path.resolve(process.cwd(), 'web', 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

let server: http.Server | null = null;

export async function startPortalServer(): Promise<void> {
  if (server) return;

  const s = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      log.error('Portal server request error', { url: req.url, err });
      sendJson(res, 500, { error: 'internal-error' });
    });
  });
  server = s;

  await new Promise<void>((resolve, reject) => {
    s.once('error', reject);
    // Loopback bind + token auth. Off-machine exposure goes through an
    // authenticated reverse proxy (control plane), never a direct bind.
    s.listen(NCL_PORTAL_PORT, '127.0.0.1', () => {
      // Tokened URL is the onboarding path (Jupyter-style). Logs are local
      // and chmod-protected like .env, which holds the same token.
      log.info('Portal listening', {
        url: `http://127.0.0.1:${NCL_PORTAL_PORT}/`,
      });
      resolve();
    });
  });
}

export async function stopPortalServer(): Promise<void> {
  if (!server) return;
  const s = server;
  server = null;
  await new Promise<void>((resolve) => s.close(() => resolve()));
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', `http://127.0.0.1:${NCL_PORTAL_PORT}`);
  const pathname = url.pathname;

  if (pathname.startsWith('/api/')) {
    const auth = checkPortalAuth(req, url);
    if (auth.result !== 'ok') {
      sendJson(res, auth.result === 'bad-origin' ? 403 : 401, { error: auth.result });
      return;
    }

    if (pathname === '/api/schema' && req.method === 'GET') {
      sendJson(res, 200, { resources: getResourceSchema() });
      return;
    }

    if (pathname === '/api/call' && req.method === 'POST') {
      await handleCall(req, res, auth.ctx);
      return;
    }

    if (pathname === '/api/chat/send' && req.method === 'POST') {
      await handleChatSend(req, res, auth.ctx);
      return;
    }

    if (pathname === '/api/chat/events' && req.method === 'GET') {
      handleChatEvents(req, res, url, auth.ctx);
      return;
    }

    sendJson(res, 404, { error: 'not-found' });
    return;
  }

  // Static SPA (production). In dev the SPA is served by Vite, so these
  // routes are unused — the dev server proxies /api here instead. The shell
  // itself is not sensitive; every data access behind it requires the token.
  serveStatic(pathname, res);
}

async function handleCall(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: PortalCallerContext,
): Promise<void> {
  let body: unknown;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: 'invalid-json' });
    return;
  }

  const { command, args } = (body ?? {}) as { command?: unknown; args?: unknown };
  if (typeof command !== 'string') {
    sendJson(res, 400, { error: 'command is required' });
    return;
  }

  const frame: RequestFrame = {
    id: randomUUID(),
    command,
    args: args && typeof args === 'object' ? (args as Record<string, unknown>) : {},
  };

  const response = await dispatch(frame, ctx);
  // Always 200 at the HTTP layer — success/failure is carried in the
  // ResponseFrame's `ok` field, matching the socket transport semantics.
  sendJson(res, 200, response);
}

function chatPlatformAllowed(_ctx: PortalCallerContext, platformId: string): boolean {
  return platformId.startsWith(portalChatPlatformId(''));
}

/** Inject one portal chat message into the normal inbound routing path. */
async function handleChatSend(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: PortalCallerContext,
): Promise<void> {
  let body: unknown;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: 'invalid-json' });
    return;
  }

  const { platformId, text } = (body ?? {}) as { platformId?: unknown; text?: unknown };
  if (typeof platformId !== 'string' || !platformId) {
    sendJson(res, 400, { error: 'platformId is required' });
    return;
  }
  if (typeof text !== 'string' || !text.trim()) {
    sendJson(res, 400, { error: 'text is required' });
    return;
  }
  if (!chatPlatformAllowed(ctx, platformId)) {
    sendJson(res, 404, { error: 'conversation not found' });
    return;
  }

  if (!isWebchatRunning()) {
    sendJson(res, 503, { error: 'webchat channel is not running' });
    return;
  }

  const id = webchatSend(platformId, text);
  sendJson(res, 200, { id });
}

/**
 * SSE stream of webchat events (agent messages, typing) for one conversation.
 * SSE over WebSocket: no extra dependency, browser EventSource reconnects on
 * its own, and the Vite dev proxy forwards it untouched. Missed events are
 * recovered via `chat-history` — the stream is live-push only.
 */
function handleChatEvents(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  ctx: PortalCallerContext,
): void {
  const platformId = url.searchParams.get('platformId');
  if (!platformId) {
    sendJson(res, 400, { error: 'platformId is required' });
    return;
  }
  if (!chatPlatformAllowed(ctx, platformId)) {
    sendJson(res, 404, { error: 'conversation not found' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(': connected\n\n');

  const unsubscribe = subscribeWebchat(platformId, (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });
  // Keep intermediaries (and the EventSource itself) from timing out the
  // idle stream.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

function serveStatic(pathname: string, res: http.ServerResponse): void {
  // Resolve the request to a file inside WEB_DIST, guarding against traversal.
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(WEB_DIST, rel);
  if (!filePath.startsWith(WEB_DIST)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback: serve index.html for unknown non-asset routes.
      if (!path.extname(rel)) {
        serveIndexFallback(res);
        return;
      }
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

function serveIndexFallback(res: http.ServerResponse): void {
  fs.readFile(path.join(WEB_DIST, 'index.html'), (err, data) => {
    if (err) {
      res.writeHead(404).end('Portal not built. Run `bun --cwd web run build`.');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    res.end(data);
  });
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      // Cap body size — these are tiny JSON frames.
      if (data.length > 1_000_000) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(json);
}
