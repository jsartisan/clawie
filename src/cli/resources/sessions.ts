import { readContainerLogTail } from '../../container-logs.js';
import { getSession } from '../../db/sessions.js';
import { registerResource } from '../crud.js';

registerResource({
  name: 'session',
  plural: 'sessions',
  table: 'sessions',
  description:
    'Session — the runtime unit. Maps one (agent_group, messaging_group, thread) combination to a container with its own inbound.db and outbound.db. Created automatically by the router when a message arrives.',
  idColumn: 'id',
  scopeField: 'agent_group_id',
  columns: [
    { name: 'id', type: 'string', description: 'UUID.', generated: true },
    { name: 'agent_group_id', type: 'string', description: 'Agent group this session runs.' },
    {
      name: 'messaging_group_id',
      type: 'string',
      description: 'Messaging group this session serves. Null for agent-shared sessions.',
    },
    {
      name: 'thread_id',
      type: 'string',
      description: 'Thread ID. Only set for per-thread session mode.',
    },
    {
      name: 'agent_provider',
      type: 'string',
      description: 'Provider override. Null means inherit from agent group.',
    },
    {
      name: 'status',
      type: 'string',
      description: '"active" receives messages. "closed" is archived.',
      enum: ['active', 'closed'],
    },
    {
      name: 'container_status',
      type: 'string',
      description:
        '"running" — container alive and polling. "stopped" — container exited; the sweep will restart it automatically when due messages arrive. "idle" — reserved, currently unused.',
      enum: ['running', 'idle', 'stopped'],
    },
    { name: 'last_active', type: 'string', description: 'Last message or heartbeat. Used for stale detection.' },
    { name: 'created_at', type: 'string', description: 'Auto-set.', generated: true },
  ],
  operations: { list: 'open', get: 'open' },
  customOperations: {
    logs: {
      access: 'open',
      description:
        'Tail the persisted container log for a session (containers run with --rm, so this is the only post-exit record). Use --id <session-id> [--lines <n>, default 100].',
      args: [
        { name: 'id', type: 'string', description: 'sessions.id', required: true },
        { name: 'lines', type: 'number', description: 'Number of trailing lines to return (default 100).' },
      ],
      handler: async (args, ctx) => {
        const id = args.id as string;
        if (!id) throw new Error('session id is required');
        // Group-scope enforcement: custom ops bypass the generic post-handler
        // filter, so check ownership here. "not found" either way — no
        // cross-group existence oracle.
        if (ctx.caller === 'agent') {
          const session = getSession(id);
          if (!session || session.agent_group_id !== ctx.agentGroupId) {
            throw new Error(`session not found: ${id}`);
          }
        }
        const lines = args.lines !== undefined ? Math.max(1, Number(args.lines)) : 100;
        const tail = readContainerLogTail(id, lines);
        return tail || '(no container log for this session yet)';
      },
    },
  },
});
