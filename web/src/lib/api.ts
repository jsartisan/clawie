/**
 * Portal API client. Talks to the host's portal server
 * (src/cli/http-server.ts) — in dev via the Vite `/api` proxy, in prod
 * same-origin. No auth token needed — access is gated by Origin/Host
 * validation on the server (loopback-only bind + DNS-rebinding protection).
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AuthError extends Error {
  constructor() {
    super('portal unreachable or rejected request');
    this.name = 'AuthError';
  }
}

// ---------------------------------------------------------------------------
// Schema types (mirror src/cli/crud.ts → getResourceSchema())
// ---------------------------------------------------------------------------

export type ColumnType = 'string' | 'number' | 'boolean' | 'json';
export type Access = 'open' | 'approval' | 'hidden';

export interface ColumnDef {
  name: string;
  type: ColumnType;
  description: string;
  generated?: boolean;
  required?: boolean;
  updatable?: boolean;
  default?: unknown;
  enum?: string[];
}

export interface CustomOperationSchema {
  name: string;
  access: Access;
  description: string;
  args: ColumnDef[];
}

export interface ResourceSchema {
  name: string;
  plural: string;
  description: string;
  idColumn: string;
  scopeField?: string;
  columns: ColumnDef[];
  operations: {
    list?: Access;
    get?: Access;
    create?: Access;
    update?: Access;
    delete?: Access;
  };
  customOperations: CustomOperationSchema[];
}

export type ResponseFrame =
  | { id: string; ok: true; data: unknown }
  | { id: string; ok: false; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown when a dispatched command returns ok:false. */
export class CommandError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'CommandError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export async function fetchSchema(): Promise<ResourceSchema[]> {
  const res = await fetch('/api/schema');
  if (!res.ok) throw new Error(`schema request failed: ${res.status}`);
  const body = (await res.json()) as { resources: ResourceSchema[] };
  return body.resources;
}

/**
 * Run one `{ command, args }` frame through the host dispatcher and return
 * its `data`. Throws CommandError on ok:false, AuthError on 401.
 */
export async function call<T = unknown>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch('/api/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, args }),
  });
  if (!res.ok) throw new Error(`call failed: ${res.status}`);
  const frame = (await res.json()) as ResponseFrame;
  if (!frame.ok) throw new CommandError(frame.error.code, frame.error.message);
  return frame.data as T;
}

// ---------------------------------------------------------------------------
// Webchat (portal chat surface)
// ---------------------------------------------------------------------------

export type ChatEvent = { type: 'message'; id: string; text: string; timestamp: string } | { type: 'typing' };

export interface ChatHistoryEntry {
  id: string;
  role: 'user' | 'agent';
  text: string;
  timestamp: string;
}

/** Ensure the agent group has a webchat conversation; returns its platform id. */
export const openChat = (groupId: string) =>
  call<{ platform_id: string; messaging_group_id: string; created: boolean }>('chat-open', { id: groupId });

export const chatHistory = (groupId: string) => call<ChatHistoryEntry[]>('chat-history', { id: groupId });

export async function sendChatMessage(platformId: string, text: string): Promise<string> {
  const res = await fetch('/api/chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platformId, text }),
  });
  if (!res.ok) throw new Error(`send failed: ${res.status}`);
  return ((await res.json()) as { id: string }).id;
}

/**
 * SSE URL for the live event stream. EventSource can't set headers, so the
 * token rides as a query param (the server accepts both forms).
 */
export function chatEventsUrl(platformId: string): string {
  return `/api/chat/events?${new URLSearchParams({ platformId }).toString()}`;
}

// Convenience wrappers around the generic CRUD command names.
export const list = <T = Record<string, unknown>>(plural: string, args: Record<string, unknown> = {}) =>
  call<T[]>(`${plural}-list`, args);
export const create = (plural: string, args: Record<string, unknown>) => call(`${plural}-create`, args);
export const update = (plural: string, args: Record<string, unknown>) => call(`${plural}-update`, args);
export const remove = (plural: string, id: string) => call(`${plural}-delete`, { id });
export const custom = (plural: string, verb: string, args: Record<string, unknown>) =>
  // Backend registers custom verbs with spaces normalized to dashes.
  call(`${plural}-${verb.replace(/ /g, '-')}`, args);
