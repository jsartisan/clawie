/**
 * Post-session reflection pass.
 *
 * After a session goes quiet (heartbeat gone, container stopped), the host
 * reads the conversation from outbound.db + inbound.db, sends it to the
 * Anthropic API with a reflection prompt, and writes extracted facts /
 * preferences / skill patterns to memory_entries in the central DB.
 *
 * If a skill-worthy pattern is found, it also writes a SKILL.md file to the
 * agent group's skills directory so the next session picks it up automatically.
 *
 * Requires ANTHROPIC_API_KEY in .env or environment.
 */
import fs from 'fs';
import path from 'path';

import { readEnvFile } from './env.js';
import { log } from './log.js';
import { openInboundDb, openOutboundDb } from './session-manager.js';
import { getDueOutboundMessages } from './db/session-db.js';
import { hasReflectionLog, insertMemoryEntries, insertReflectionLog } from './db/memory.js';
import { getAgentGroup } from './db/agent-groups.js';
import { GROUPS_DIR } from './config.js';

const envConfig = readEnvFile(['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL']);
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || envConfig.ANTHROPIC_API_KEY;
const ANTHROPIC_BASE_URL =
  process.env.ANTHROPIC_BASE_URL || envConfig.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';

const REFLECTION_MODEL = 'claude-haiku-4-5-20251001';
const MAX_CONVERSATION_CHARS = 40_000;

const REFLECTION_PROMPT = `You are a memory extraction assistant. You will be given a conversation between a user and an AI assistant. Your job is to extract what should be remembered for future sessions.

Extract:
- **facts**: Concrete facts about the user or their environment (e.g. "user's project uses Next.js", "user's timezone is IST")
- **preferences**: How the user likes things done (e.g. "user prefers concise bullet responses", "user always wants pnpm not npm")
- **skill_patterns**: Non-trivial workflows, techniques, or fixes discovered during this conversation that would be worth saving as reusable skills (only if the conversation contained something genuinely reusable — most sessions won't produce a skill)

Rules:
- Be selective. Only extract things that would actually help in a FUTURE conversation.
- Prefer concrete and specific over vague.
- Ignore one-off tasks ("user asked me to rename a variable") — only extract persistent preferences or reusable patterns.
- For skills: only extract if the technique is non-trivial and likely to recur. Include the full procedure in the content field.
- Return valid JSON only, no explanation.

Return this exact JSON shape:
{
  "facts": ["string", ...],
  "preferences": ["string", ...],
  "skills": [
    { "name": "kebab-case-name", "description": "one line", "content": "full SKILL.md markdown body" },
    ...
  ]
}

If nothing is worth extracting in a category, return an empty array for that key.`;

interface ReflectionResult {
  facts: string[];
  preferences: string[];
  skills: Array<{ name: string; description: string; content: string }>;
}

export async function reflectOnSession(agentGroupId: string, sessionId: string): Promise<void> {
  if (!ANTHROPIC_API_KEY) {
    log.debug('Skipping reflection — ANTHROPIC_API_KEY not set');
    return;
  }

  if (hasReflectionLog(sessionId)) {
    return; // Already reflected
  }

  const agentGroup = getAgentGroup(agentGroupId);
  if (!agentGroup) return;

  // Read conversation
  const conversation = buildConversationText(agentGroupId, sessionId);
  if (!conversation) {
    insertReflectionLog({ session_id: sessionId, agent_group_id: agentGroupId, facts_written: 0, skills_written: 0 });
    return;
  }

  let result: ReflectionResult;
  try {
    result = await callReflectionApi(conversation);
  } catch (err) {
    log.warn('Reflection API call failed', { sessionId, err });
    return;
  }

  const entries: Parameters<typeof insertMemoryEntries>[0] = [];

  for (const fact of result.facts) {
    entries.push({
      agent_group_id: agentGroupId,
      session_id: sessionId,
      kind: 'fact',
      content: fact,
      skill_name: null,
    });
  }
  for (const pref of result.preferences) {
    entries.push({
      agent_group_id: agentGroupId,
      session_id: sessionId,
      kind: 'preference',
      content: pref,
      skill_name: null,
    });
  }

  let skillsWritten = 0;
  for (const skill of result.skills) {
    const written = writeSkillFile(agentGroup.folder, skill);
    if (written) {
      skillsWritten++;
      entries.push({
        agent_group_id: agentGroupId,
        session_id: sessionId,
        kind: 'skill_created',
        content: skill.description,
        skill_name: skill.name,
      });
    }
  }

  if (entries.length > 0) {
    insertMemoryEntries(entries);
  }

  insertReflectionLog({
    session_id: sessionId,
    agent_group_id: agentGroupId,
    facts_written: result.facts.length + result.preferences.length,
    skills_written: skillsWritten,
  });

  log.info('Session reflection complete', {
    sessionId,
    facts: result.facts.length,
    preferences: result.preferences.length,
    skills: skillsWritten,
  });
}

function buildConversationText(agentGroupId: string, sessionId: string): string | null {
  let inDb, outDb;
  try {
    inDb = openInboundDb(agentGroupId, sessionId);
    outDb = openOutboundDb(agentGroupId, sessionId);
  } catch {
    return null;
  }

  try {
    const inboundRows = inDb
      .prepare(`SELECT kind, content FROM messages_in WHERE kind IN ('chat','chat-sdk','task') ORDER BY seq ASC`)
      .all() as Array<{ kind: string; content: string }>;

    const outboundRows = getDueOutboundMessages(outDb).filter((m) => m.kind === 'chat');

    if (inboundRows.length === 0 && outboundRows.length === 0) return null;

    const parts: string[] = [];
    for (const row of inboundRows) {
      parts.push(`[User]: ${row.content}`);
    }
    for (const row of outboundRows) {
      parts.push(`[Assistant]: ${row.content}`);
    }

    const full = parts.join('\n\n');
    return full.length > MAX_CONVERSATION_CHARS ? full.slice(0, MAX_CONVERSATION_CHARS) + '\n...[truncated]' : full;
  } finally {
    inDb.close();
    outDb.close();
  }
}

async function callReflectionApi(conversation: string): Promise<ReflectionResult> {
  const response = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: REFLECTION_MODEL,
      max_tokens: 2048,
      system: REFLECTION_PROMPT,
      messages: [{ role: 'user', content: `Here is the conversation to reflect on:\n\n${conversation}` }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
  const text = data.content.find((b) => b.type === 'text')?.text ?? '{}';

  // Strip markdown code fences if the model wrapped the JSON
  const cleaned = text
    .replace(/^```json?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const parsed = JSON.parse(cleaned) as Partial<ReflectionResult>;

  return {
    facts: Array.isArray(parsed.facts) ? parsed.facts.filter((f) => typeof f === 'string') : [],
    preferences: Array.isArray(parsed.preferences) ? parsed.preferences.filter((f) => typeof f === 'string') : [],
    skills: Array.isArray(parsed.skills)
      ? parsed.skills.filter(
          (s) => s && typeof s.name === 'string' && typeof s.description === 'string' && typeof s.content === 'string',
        )
      : [],
  };
}

function writeSkillFile(agentFolder: string, skill: { name: string; description: string; content: string }): boolean {
  const name = skill.name
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .slice(0, 64);
  if (!name) return false;

  const skillDir = path.join(GROUPS_DIR, agentFolder, 'skills', name);
  const skillFile = path.join(skillDir, 'SKILL.md');

  // Don't overwrite existing skills — patch logic can come later
  if (fs.existsSync(skillFile)) return false;

  try {
    fs.mkdirSync(skillDir, { recursive: true });
    const frontmatter = `---\nname: ${name}\ndescription: ${skill.description.replace(/\n/g, ' ')}\n---\n\n`;
    fs.writeFileSync(skillFile, frontmatter + skill.content, 'utf8');
    log.info('Wrote learned skill', { name, path: skillFile });
    return true;
  } catch (err) {
    log.warn('Failed to write skill file', { name, err });
    return false;
  }
}
