import { getPendingApproval } from '../../db/sessions.js';
import { getResponseHandlers } from '../../response-registry.js';
import { registerResource } from '../crud.js';

registerResource({
  name: 'approval',
  plural: 'approvals',
  table: 'pending_approvals',
  description:
    'Pending approval — in-flight approval cards waiting for an admin response. Created by requestApproval() (self-mod install_packages/add_mcp_server) and OneCLI credential approval flow. Rows are deleted after the admin approves/rejects or the request expires.',
  idColumn: 'approval_id',
  columns: [
    {
      name: 'approval_id',
      type: 'string',
      description: 'Unique approval identifier (also used as the card questionId).',
    },
    {
      name: 'session_id',
      type: 'string',
      description: 'Session that requested the approval. Null for OneCLI credential approvals.',
    },
    {
      name: 'request_id',
      type: 'string',
      description: 'Original request identifier (OneCLI request UUID or same as approval_id).',
    },
    {
      name: 'action',
      type: 'string',
      description:
        'Action type — matches the registered approval handler (e.g. install_packages, add_mcp_server, onecli_credential).',
    },
    { name: 'payload', type: 'json', description: 'JSON payload carried through to the approval handler.' },
    { name: 'created_at', type: 'string', description: 'Auto-set.' },
    { name: 'agent_group_id', type: 'string', description: 'Originating agent group.' },
    { name: 'channel_type', type: 'string', description: 'Channel the approval card was delivered on.' },
    { name: 'platform_id', type: 'string', description: 'Platform chat ID the card was delivered to.' },
    {
      name: 'platform_message_id',
      type: 'string',
      description: 'Platform message ID of the delivered card (for editing on expiry).',
    },
    { name: 'expires_at', type: 'string', description: 'When this approval expires (OneCLI gateway TTL).' },
    {
      name: 'status',
      type: 'string',
      description: 'Current status.',
      enum: ['pending', 'approved', 'rejected', 'expired'],
    },
    { name: 'title', type: 'string', description: 'Card title shown to the admin.' },
    { name: 'options_json', type: 'json', description: 'Card button options as JSON array.' },
  ],
  operations: { list: 'open', get: 'open' },
  customOperations: {
    respond: {
      access: 'approval',
      description:
        'Resolve a pending approval from the portal — equivalent to tapping a button on the approval card in chat. Use --id <approval-id> --value <approve|reject>.',
      args: [
        { name: 'id', type: 'string', description: 'pending_approvals.approval_id', required: true },
        { name: 'value', type: 'string', description: 'Option value, normally approve or reject.', required: true },
      ],
      handler: async (args, ctx) => {
        if (ctx.caller === 'agent') {
          // Agents must never resolve their own (or anyone's) approvals.
          throw new Error('approvals respond is not available from agent containers');
        }
        const id = String(args.id);
        const value = String(args.value);
        if (!getPendingApproval(id)) throw new Error(`no pending approval: ${id}`);

        // Same dispatch path as a chat button tap: first handler to claim the
        // response wins (approvals module, OneCLI resolver, etc.).
        for (const handler of getResponseHandlers()) {
          const claimed = await handler({
            questionId: id,
            value,
            userId: 'portal:operator',
            channelType: 'webchat',
            platformId: 'portal',
            threadId: null,
          });
          if (claimed) return { resolved: id, value };
        }
        throw new Error(`no handler claimed approval ${id} — is the approvals module loaded?`);
      },
    },
  },
});
