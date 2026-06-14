/**
 * OneCLI agent-identifier rules.
 *
 * The gateway validates `identifier` against `^[a-z][a-z0-9-]{0,49}$` — it must
 * start with a lowercase letter, then contain only lowercase letters, digits,
 * and hyphens, up to 50 characters. A violation returns `400 Bad Request` from
 * `POST /api/agents`.
 *
 * Clawie agent-group ids arrive in two shapes:
 *   - `init-first-agent` / create-agent → `ag-<ts>-<rand>` (already compliant)
 *   - `clawie groups create` → `crypto.randomUUID()` → e.g. `1d864ec8-…` which
 *     starts with a digit ~60% of the time and is therefore rejected.
 *
 * `toOneCLIIdentifier` maps any group id to a deterministic compliant identifier
 * so both shapes are accepted. The transform is intentionally one-way (lossy):
 * recovering the group from an identifier is done by recompute-and-match (see
 * `getAgentGroupByOneCLIIdentifier`), not by inverting the string.
 */
export function toOneCLIIdentifier(agentGroupId: string): string {
  let id = agentGroupId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!/^[a-z]/.test(id)) id = `a-${id}`;
  return id.slice(0, 50);
}
