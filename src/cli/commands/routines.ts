/**
 * Routines — host-side view and control of scheduled tasks.
 *
 * Tasks are `kind='task'` rows in each session's inbound.db (see
 * src/modules/scheduling/db.ts — no central table). These commands fan out
 * across active sessions so the portal can show one combined "Routines" list
 * and pause/resume/cancel without knowing which session DB a task lives in.
 */
import { getAgentGroup } from '../../db/agent-groups.js';
import { getActiveSessions, getSession } from '../../db/sessions.js';
import { cancelTask, pauseTask, resumeTask } from '../../modules/scheduling/db.js';
import { openInboundDb } from '../../session-manager.js';
import { log } from '../../log.js';
import type { CallerContext } from '../frame.js';
import { register } from '../registry.js';

export interface RoutineRow {
  id: string;
  session_id: string;
  agent_group_id: string;
  agent_name: string;
  status: string;
  prompt: string;
  process_after: string | null;
  recurrence: string | null;
}

function assertHumanCaller(ctx: CallerContext): void {
  if (ctx.caller === 'agent') {
    // Agents manage their own tasks via the scheduling MCP tools.
    throw new Error('routines commands are not available from agent containers');
  }
}

function promptOf(content: string): string {
  try {
    const parsed = JSON.parse(content) as { prompt?: unknown };
    return typeof parsed.prompt === 'string' ? parsed.prompt : content;
  } catch {
    return content;
  }
}

function listSessionTasks(agentGroupId: string, sessionId: string): Omit<RoutineRow, 'agent_name'>[] {
  const db = openInboundDb(agentGroupId, sessionId);
  try {
    const rows = db
      .prepare(
        "SELECT id, status, content, process_after, recurrence FROM messages_in WHERE kind = 'task' AND status IN ('pending', 'paused') ORDER BY process_after",
      )
      .all() as Array<{
      id: string;
      status: string;
      content: string;
      process_after: string | null;
      recurrence: string | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      session_id: sessionId,
      agent_group_id: agentGroupId,
      status: r.status,
      prompt: promptOf(r.content),
      process_after: r.process_after,
      recurrence: r.recurrence,
    }));
  } finally {
    db.close();
  }
}

register({
  name: 'routines-list',
  description: 'List scheduled tasks (routines) across all active sessions. Optional --id <agent-group-id> to filter.',
  access: 'open',
  parseArgs: (raw) => raw,
  handler: async (args: Record<string, unknown>, ctx) => {
    assertHumanCaller(ctx);
    const filterGroup = typeof args.id === 'string' ? args.id : null;

    const routines: RoutineRow[] = [];
    for (const session of getActiveSessions()) {
      if (filterGroup && session.agent_group_id !== filterGroup) continue;
      try {
        const tasks = listSessionTasks(session.agent_group_id, session.id);
        if (tasks.length === 0) continue;
        const agentName = getAgentGroup(session.agent_group_id)?.name ?? session.agent_group_id;
        routines.push(...tasks.map((t) => ({ ...t, agent_name: agentName })));
      } catch (err) {
        // One unreadable session DB shouldn't blank the whole list.
        log.warn('routines-list: could not read session tasks', { sessionId: session.id, err });
      }
    }
    routines.sort((a, b) => (a.process_after ?? '').localeCompare(b.process_after ?? ''));
    return routines;
  },
});

function registerTaskAction(verb: 'cancel' | 'pause' | 'resume', apply: typeof cancelTask): void {
  register({
    name: `routines-${verb}`,
    description: `${verb[0].toUpperCase()}${verb.slice(1)} a scheduled task. Use --id <task-id> --session <session-id>.`,
    access: 'approval',
    parseArgs: (raw) => raw,
    handler: async (args: Record<string, unknown>, ctx) => {
      assertHumanCaller(ctx);
      const taskId = typeof args.id === 'string' ? args.id : '';
      const sessionId = typeof args.session === 'string' ? args.session : '';
      if (!taskId || !sessionId) throw new Error('--id <task-id> and --session <session-id> are required');

      const session = getSession(sessionId);
      if (!session) {
        throw new Error(`session not found: ${sessionId}`);
      }

      const db = openInboundDb(session.agent_group_id, session.id);
      try {
        apply(db, taskId);
      } finally {
        db.close();
      }
      return { [verb === 'cancel' ? 'cancelled' : verb === 'pause' ? 'paused' : 'resumed']: taskId };
    },
  });
}

registerTaskAction('cancel', cancelTask);
registerTaskAction('pause', pauseTask);
registerTaskAction('resume', resumeTask);
