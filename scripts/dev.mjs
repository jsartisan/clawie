#!/usr/bin/env node
/**
 * Dev orchestrator for `task dev`.
 *
 * Runs two long-lived processes side by side with prefixed, colored output
 * and a single Ctrl-C that tears both down:
 *   - host:  the NanoClaw host (`pnpm run dev`, Node/tsx)
 *   - web:   the portal dev server (`bun run dev`, Vite on :4101)
 *
 * The web dev server proxies /api to the host's portal server (:4100), which
 * requires the NCL_PORTAL_TOKEN bearer token. If the token already exists in
 * .env we print a tokened URL; on first-ever start the host generates it and
 * logs its own tokened URL.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDir = path.join(root, 'web');

const RESET = '\x1b[0m';
const procs = [
  { name: 'host', color: '\x1b[36m', cmd: 'pnpm', args: ['run', 'dev'], cwd: root, env: {} },
  { name: 'web', color: '\x1b[35m', cmd: 'bun', args: ['run', 'dev'], cwd: webDir, env: {} },
];

const labelWidth = Math.max(...procs.map((p) => p.name.length));
const children = [];
let shuttingDown = false;

function prefixStream(name, color, stream, sink) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    const tag = `${color}${name.padEnd(labelWidth)}${RESET} │ `;
    for (const line of lines) sink.write(`${tag}${line}\n`);
  });
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  // Give children a moment, then force-exit.
  setTimeout(() => process.exit(code), 500);
}

function portalUrl() {
  try {
    const env = fs.readFileSync(path.join(root, '.env'), 'utf-8');
    const match = env.match(/^NCL_PORTAL_TOKEN=(.+)$/m);
    if (match) return `http://127.0.0.1:4101/?token=${match[1].trim()}`;
  } catch {
    // No .env yet — the host will generate the token and log its own link.
  }
  return 'http://127.0.0.1:4101';
}

console.log('Starting NanoClaw host + portal…');
console.log(`\x1b[33mPortal: ${portalUrl()}\x1b[0m`);

for (const p of procs) {
  const child = spawn(p.cmd, p.args, {
    cwd: p.cwd,
    env: { ...process.env, ...p.env },
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  children.push(child);
  prefixStream(p.name, p.color, child.stdout, process.stdout);
  prefixStream(p.name, p.color, child.stderr, process.stderr);

  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.log(`\n${p.color}${p.name}${RESET} exited (${code}). Shutting down.`);
      shutdown(code ?? 0);
    }
  });
  child.on('error', (err) => {
    console.error(`Failed to start ${p.name}: ${err.message}`);
    shutdown(1);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
