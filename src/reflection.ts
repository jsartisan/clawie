/**
 * Post-session reflection pass — the host-side "janitor" half of the hybrid
 * memory model (see docs/memory.md).
 *
 * The agent maintains USER.md / MEMORY.md live during a session. After the
 * session goes quiet (container stopped), this pass reads only the messages
 * that arrived since the last run (a per-session timestamp watermark), asks an
 * LLM to extract anything the agent missed, and RECONCILES it into the existing
 * files — ADD new facts, UPDATE with more detail, DELETE contradictions, NOOP
 * duplicates. It returns the merged file contents, which we write atomically.
 *
 * Because it merges into whatever is already there (rather than regenerating
 * from scratch) it can't fight the agent's own edits, and because it only runs
 * when the container is stopped the two writers never overlap.
 *
 * Verified, reusable procedures are saved as skills — but only when the
 * transcript shows the procedure actually ran / was confirmed (Voyager rule).
 *
 * Requires ANTHROPIC_API_KEY in .env or environment.
 */
import fs from 'fs';
import path from 'path';

import { readEnvFile } from './env.js';
import { log } from './log.js';
import { openInboundDb, openOutboundDb } from './session-manager.js';
import { getAgentGroup } from './db/agent-groups.js';
import { getSession, updateSession } from './db/sessions.js';
import { GROUPS_DIR } from './config.js';

const envConfig = readEnvFile(['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'REFLECTION_MODEL']);
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || envConfig.ANTHROPIC_API_KEY;
const ANTHROPIC_BASE_URL =
  process.env.ANTHROPIC_BASE_URL || envConfig.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';

// Model for the reflection pass. Sonnet is the better choice on quality grounds
// — reflection's mistakes are persistent (written to disk, loaded into every
// future session) and the person-specific vs shared-memory privacy split is
// subtle judgment — but the default Claude Code OAuth token only has working
// Haiku access via the direct Messages API (Sonnet 429s on that token tier).
// So default to Haiku, which the standard credential supports, and let installs
// with a Sonnet-capable key (a real sk-ant-api… key, or one injected via the
// OneCLI gateway) opt in with REFLECTION_MODEL=claude-sonnet-4-6.
const REFLECTION_MODEL =
  process.env.REFLECTION_MODEL || envConfig.REFLECTION_MODEL || 'claude-haiku-4-5-20251001';
const MAX_CONVERSATION_CHARS = 40_000;
const USER_BUDGET_CHARS = 2000; // ~500 tokens
const MEMORY_BUDGET_CHARS = 3200; // ~800 tokens

const REFLECTION_PROMPT = `You are the memory janitor for a personal-assistant agent. You maintain two markdown files that persist across sessions and are loaded into the agent's context every time:

- USER.md — WHO the user is: identity, durable preferences, communication style. Budget ~${USER_BUDGET_CHARS} chars.
- MEMORY.md — environment/project facts, conventions, lessons learned. Budget ~${MEMORY_BUDGET_CHARS} chars.

You are given the CURRENT contents of both files plus a NEW slice of conversation. Reconcile what the conversation reveals INTO the existing files. For each candidate fact, behave like:
- ADD — genuinely new info → add a concise bullet to the right file.
- UPDATE — you already knew something and now know more → merge into the existing line.
- DELETE — new info contradicts an old line → remove the stale line, keep the new truth. Latest info wins.
- NOOP — already captured → change nothing.

Rules:
- PRESERVE everything in the current files that isn't superseded. Never drop facts just to shorten — only merge duplicates or remove contradictions.
- Keep bullets concise and concrete. Deduplicate.
- If a file is over budget after merging, consolidate overlapping bullets into tighter ones.
- Ignore one-off task state, todos, and things easily re-discovered.
- Only return a file's content if it CHANGED. If a file needs no change, return null for it.

SKILLS: If the conversation contains a non-trivial, reusable procedure AND the transcript shows it actually WORKED (a tool ran successfully, a test passed, or the user confirmed it), emit it as a skill. Do NOT emit skills for untested ideas, plans, or "this might be reusable" guesses — only verified procedures.

Return valid JSON only, no explanation, in this exact shape:
{
  "user_md": "full updated USER.md content" | null,
  "memory_md": "full updated MEMORY.md content" | null,
  "skills": [ { "name": "kebab-case-name", "description": "one line", "content": "full SKILL.md markdown body" } ]
}`;

interface ReflectionResult {
  user_md: string | null;
  memory_md: string | null;
  skills: Array<{ name: string; description: string; content: string }>;
}

export async function reflectOnSession(agentGroupId: string, sessionId: string): Promise<void> {
  if (!ANTHROPIC_API_KEY) {
    log.debug('Skipping reflection — ANTHROPIC_API_KEY not set');
    return;
  }

  const agentGroup = getAgentGroup(agentGroupId);
  if (!agentGroup) return;
  const session = getSession(sessionId);
  if (!session) return;

  const since = session.last_reflected_at ?? null;
  const slice = buildConversationSlice(agentGroupId, sessionId, since);
  if (!slice || slice.text.length === 0) return; // nothing new — cheap no-op

  const groupDir = path.join(GROUPS_DIR, agentGroup.folder);
  const userPath = path.join(groupDir, 'USER.md');
  const memoryPath = path.join(groupDir, 'MEMORY.md');
  const currentUser = readFileOrEmpty(userPath);
  const currentMemory = readFileOrEmpty(memoryPath);

  let result: ReflectionResult;
  try {
    result = await callReflectionApi(currentUser, currentMemory, slice.text);
  } catch (err) {
    log.warn('Reflection API call failed', { sessionId, err });
    return; // leave watermark unadvanced so we retry next sweep
  }

  if (result.user_md && result.user_md.trim() && result.user_md !== currentUser) {
    writeAtomic(userPath, result.user_md.trimEnd() + '\n');
  }
  if (result.memory_md && result.memory_md.trim() && result.memory_md !== currentMemory) {
    writeAtomic(memoryPath, result.memory_md.trimEnd() + '\n');
  }

  let skillsWritten = 0;
  for (const skill of result.skills) {
    if (writeSkillFile(agentGroup.folder, skill)) skillsWritten++;
  }

  // Advance the watermark to the newest message we just processed.
  updateSession(sessionId, { last_reflected_at: slice.maxTimestamp });

  log.info('Session reflection complete', {
    sessionId,
    userChanged: Boolean(result.user_md),
    memoryChanged: Boolean(result.memory_md),
    skills: skillsWritten,
  });
}

interface ConversationSlice {
  text: string;
  maxTimestamp: string;
}

/**
 * Read messages newer than `since` from BOTH session DBs, interleaved in
 * timestamp order (so the dialogue reads naturally), and keep the most recent
 * tail if over the char cap.
 */
function buildConversationSlice(
  agentGroupId: string,
  sessionId: string,
  since: string | null,
): ConversationSlice | null {
  let inDb, outDb;
  try {
    inDb = openInboundDb(agentGroupId, sessionId);
    outDb = openOutboundDb(agentGroupId, sessionId);
  } catch {
    return null;
  }

  try {
    const cutoff = since ?? '';
    const inboundRows = inDb
      .prepare(
        `SELECT timestamp, content FROM messages_in
         WHERE kind IN ('chat','chat-sdk','task') AND timestamp > ?
         ORDER BY timestamp ASC`,
      )
      .all(cutoff) as Array<{ timestamp: string; content: string }>;

    const outboundRows = outDb
      .prepare(
        `SELECT timestamp, content FROM messages_out
         WHERE kind = 'chat' AND timestamp > ?
         ORDER BY timestamp ASC`,
      )
      .all(cutoff) as Array<{ timestamp: string; content: string }>;

    const merged = [
      ...inboundRows.map((r) => ({ ts: r.timestamp, line: `[User]: ${r.content}` })),
      ...outboundRows.map((r) => ({ ts: r.timestamp, line: `[Assistant]: ${r.content}` })),
    ].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));

    if (merged.length === 0) return null;

    const maxTimestamp = merged[merged.length - 1].ts;
    let text = merged.map((m) => m.line).join('\n\n');
    // Keep the most-recent tail, not the oldest head.
    if (text.length > MAX_CONVERSATION_CHARS) {
      text = '...[earlier truncated]\n\n' + text.slice(text.length - MAX_CONVERSATION_CHARS);
    }
    return { text, maxTimestamp };
  } finally {
    inDb.close();
    outDb.close();
  }
}

async function callReflectionApi(
  currentUser: string,
  currentMemory: string,
  conversation: string,
): Promise<ReflectionResult> {
  // LLM output is non-deterministic — a malformed/truncated JSON response is
  // transient, so retry once before giving up (the caller leaves the watermark
  // unadvanced on a hard failure and re-tries next sweep anyway).
  try {
    return await attemptReflection(currentUser, currentMemory, conversation);
  } catch (err) {
    if (err instanceof SyntaxError || (err instanceof Error && err.message === 'truncated')) {
      return await attemptReflection(currentUser, currentMemory, conversation);
    }
    throw err;
  }
}

async function attemptReflection(
  currentUser: string,
  currentMemory: string,
  conversation: string,
): Promise<ReflectionResult> {
  // Bearer auth when routing through the OneCLI proxy (OAuth token); x-api-key for raw API keys.
  const authHeaders: Record<string, string> = ANTHROPIC_API_KEY!.startsWith('sk-ant-api')
    ? { 'x-api-key': ANTHROPIC_API_KEY! }
    : { Authorization: `Bearer ${ANTHROPIC_API_KEY}` };

  const userMessage = [
    '## Current USER.md',
    currentUser || '(empty)',
    '',
    '## Current MEMORY.md',
    currentMemory || '(empty)',
    '',
    '## New conversation',
    conversation,
  ].join('\n');

  const response = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      ...authHeaders,
    },
    body: JSON.stringify({
      model: REFLECTION_MODEL,
      max_tokens: 8192,
      system: REFLECTION_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as {
    stop_reason?: string;
    content: Array<{ type: string; text: string }>;
  };
  // A truncated response yields incomplete JSON — fail fast so we retry rather
  // than parse garbage.
  if (data.stop_reason === 'max_tokens') {
    throw new Error('truncated');
  }
  const text = data.content.find((b) => b.type === 'text')?.text ?? '{}';

  const cleaned = text
    .replace(/^```json?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const parsed = JSON.parse(cleaned) as Partial<ReflectionResult>;

  return {
    user_md: typeof parsed.user_md === 'string' ? parsed.user_md : null,
    memory_md: typeof parsed.memory_md === 'string' ? parsed.memory_md : null,
    skills: Array.isArray(parsed.skills)
      ? parsed.skills.filter(
          (s) => s && typeof s.name === 'string' && typeof s.description === 'string' && typeof s.content === 'string',
        )
      : [],
  };
}

function readFileOrEmpty(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function writeAtomic(filePath: string, content: string): void {
  const tmp = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, filePath);
}

function writeSkillFile(agentFolder: string, skill: { name: string; description: string; content: string }): boolean {
  const name = skill.name
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .slice(0, 64);
  if (!name) return false;

  const skillDir = path.join(GROUPS_DIR, agentFolder, 'skills', name);
  const skillFile = path.join(skillDir, 'SKILL.md');

  // Don't overwrite existing skills
  if (fs.existsSync(skillFile)) return false;

  try {
    fs.mkdirSync(skillDir, { recursive: true });
    const frontmatter = `---\nname: ${name}\ndescription: ${skill.description.replace(/\n/g, ' ')}\n---\n\n`;
    writeAtomic(skillFile, frontmatter + skill.content);
    log.info('Wrote learned skill', { name, path: skillFile });
    return true;
  } catch (err) {
    log.warn('Failed to write skill file', { name, err });
    return false;
  }
}
