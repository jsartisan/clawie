/**
 * Per-session container log persistence.
 *
 * Containers run with `--rm`, so once a container exits its output is gone —
 * which makes "the agent silently failed" undebuggable. This module tees
 * container stderr (the agent-runner logs to stderr; stdout is unused in v2)
 * to `logs/containers/<session-id>.log` on the host.
 *
 * Files append across container runs of the same session, separated by spawn
 * headers, so one file tells the session's whole story. A simple two
 * generation rotation (`.log` → `.log.old`) caps disk usage per session.
 */
import fs from 'fs';
import path from 'path';

import { log } from './log.js';

const LOGS_DIR = path.resolve(process.cwd(), 'logs', 'containers');
const MAX_LOG_BYTES = 5 * 1024 * 1024; // rotate at 5MB per session

export function containerLogPath(sessionId: string): string {
  // Session ids are UUIDs/`sess-…` slugs, but never trust them as path parts.
  return path.join(LOGS_DIR, `${path.basename(sessionId)}.log`);
}

function rotateIfNeeded(file: string): void {
  try {
    if (fs.statSync(file).size > MAX_LOG_BYTES) {
      fs.renameSync(file, `${file}.old`);
    }
  } catch {
    // File doesn't exist yet — nothing to rotate.
  }
}

export interface ContainerLogSink {
  write(chunk: string): void;
  close(footer: string): void;
}

/**
 * Open an append sink for one container run. Never throws — logging must not
 * break a spawn — a failed open degrades to a no-op sink with a warning.
 */
export function openContainerLog(sessionId: string, containerName: string): ContainerLogSink {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    const file = containerLogPath(sessionId);
    rotateIfNeeded(file);
    const stream = fs.createWriteStream(file, { flags: 'a' });
    stream.on('error', (err) => log.warn('Container log write failed', { sessionId, err }));
    stream.write(`\n=== ${new Date().toISOString()} spawn ${containerName} ===\n`);
    return {
      write: (chunk) => stream.write(chunk),
      close: (footer) => {
        stream.write(`=== ${new Date().toISOString()} ${footer} ===\n`);
        stream.end();
      },
    };
  } catch (err) {
    log.warn('Could not open container log', { sessionId, err });
    return { write: () => {}, close: () => {} };
  }
}

/**
 * Read the last `maxLines` of a session's container log. Used by
 * `clawie sessions logs` and the portal session page.
 */
export function readContainerLogTail(sessionId: string, maxLines = 100): string {
  const file = containerLogPath(sessionId);
  let content: string;
  try {
    content = fs.readFileSync(file, 'utf-8');
  } catch {
    return '';
  }
  const lines = content.split('\n');
  return lines.slice(Math.max(0, lines.length - maxLines)).join('\n');
}
