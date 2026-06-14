/**
 * Per-checkout install identifiers. Lets two Clawie installs coexist on
 * one host without clobbering each other's service registration or the
 * shared `clawie-agent:latest` docker image tag.
 *
 * Slug is sha1(projectRoot)[:8] — deterministic per checkout path, stable
 * across re-runs, unique enough across installs.
 */
import { createHash } from 'crypto';

export function getInstallSlug(projectRoot: string = process.cwd()): string {
  return createHash('sha1').update(projectRoot).digest('hex').slice(0, 8);
}

/** launchd Label + plist basename. e.g. `com.clawie-v2-ab12cd34`. */
export function getLaunchdLabel(projectRoot?: string): string {
  return `com.clawie-v2-${getInstallSlug(projectRoot)}`;
}

/** systemd unit name (no .service suffix). e.g. `clawie-v2-ab12cd34`. */
export function getSystemdUnit(projectRoot?: string): string {
  return `clawie-v2-${getInstallSlug(projectRoot)}`;
}

/** Docker image base (no tag). e.g. `clawie-agent-v2-ab12cd34`. */
export function getContainerImageBase(projectRoot?: string): string {
  return `clawie-agent-v2-${getInstallSlug(projectRoot)}`;
}

/** Default full container image reference with `:latest` tag. */
export function getDefaultContainerImage(projectRoot?: string): string {
  return `${getContainerImageBase(projectRoot)}:latest`;
}
