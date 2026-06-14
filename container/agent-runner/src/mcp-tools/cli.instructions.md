## Admin CLI (`clawie`)

The `clawie` command is available at `/usr/local/bin/clawie`. It lets you query and modify Clawie's central configuration.

### Usage

```
clawie <resource> <verb> [--flags]
clawie <resource> help
clawie help
```

### Scope

Your CLI access may be scoped. Run `clawie help` to see which resources are available and whether args are auto-filled. Under `group` scope (the default), `--id` and group-related args are auto-filled to your agent group — you don't need to pass them.

### Resources

Run `clawie help` for the full list. Common resources:

| Resource | Verbs | What it is |
|----------|-------|------------|
| groups | list, get, create, update, delete, restart, config get/update, config add-mcp-server/remove-mcp-server, config add-package/remove-package | Agent groups (workspace, personality, container config) |
| sessions | list, get | Active sessions (read-only) |
| destinations | list, add, remove | Where an agent group can send messages |
| members | list, add, remove | Unprivileged access gate for an agent group |

Additional resources (available under `global` scope only): messaging-groups, wirings, users, roles, user-dms, dropped-messages, approvals.

### When to use

- **Looking up your own config** — `clawie groups get` or `clawie groups config get` to see your container config.
- **Restarting your container** — `clawie groups restart` (with optional `--rebuild` and `--message`).
- **Checking who's in your group** — `clawie members list`.
- **Seeing your destinations** — `clawie destinations list`.
- **Answering questions about the system** — query `clawie` rather than guessing.

### Access rules

Read commands (list, get) are open. Write commands (create, update, delete, restart, config update, add, remove) require admin approval — the request is held until an admin approves it.

### Approval flow

Write commands require admin approval. Here's what happens:

1. You run the command (e.g. `clawie groups config update --model claude-sonnet-4-5-20250514`).
2. The command returns immediately with an `approval-pending` response — it has **not** been executed yet.
3. An admin or owner gets a notification showing exactly what you requested, with approve/reject options.
4. Once the admin responds:
   - **Approved:** the command executes and the result is delivered back to you as a system message in this conversation.
   - **Rejected:** you get a system message saying the request was rejected.

You don't need to poll or retry — the result arrives automatically.

### Examples

```bash
# Read commands (no approval needed)
clawie groups get
clawie groups config get
clawie sessions list
clawie destinations list
clawie members list

# Write commands (approval required)
clawie groups restart
clawie groups restart --rebuild --message "Config updated."
clawie groups config update --model claude-sonnet-4-5-20250514
clawie groups config add-mcp-server --name rss --command npx --args '["some-rss-mcp"]'
clawie groups config add-package --npm some-package
clawie members add --user telegram:jane
```

### Important

Config changes via `clawie groups config update` do not take effect until `clawie groups restart`. Run `clawie groups config help` for details.

### Tips

- Use `clawie <resource> help` to see all available fields, types, enums, and which fields are auto-filled.
- Flags use `--hyphen-case` (e.g. `--agent-group-id`), mapped to `underscore_case` DB columns automatically.
- `list` supports filtering by any non-auto column. Default limit is 200 rows; override with `--limit N`.
- Write commands return `approval-pending` immediately — don't treat this as an error. Wait for the system message with the result.
