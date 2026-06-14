/**
 * Channel adapter registry.
 *
 * Channels self-register on import. The host calls initChannelAdapters() at startup
 * to instantiate and set up all registered adapters.
 */
import type { ChannelAdapter, ChannelRegistration, ChannelSetup, SecretValidation } from './adapter.js';
import { log } from '../log.js';

const SETUP_RETRY_DELAYS_MS = [2000, 5000, 10000];

/** Duck-type check — adapters that throw an Error with `name === 'NetworkError'`
 * (Chat SDK's `@chat-adapter/shared.NetworkError` and similar) get a retry on
 * setup. Avoids depending on `@chat-adapter/shared` at trunk level. */
function isNetworkError(err: unknown): err is Error {
  return err instanceof Error && err.name === 'NetworkError';
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const registry = new Map<string, ChannelRegistration>();
// Keyed by `${channelType}#${accountId}` so one channel type can run multiple
// bot/app instances. Single-bot channels use `accountId = channelType`.
const activeAdapters = new Map<string, ChannelAdapter>();

/**
 * The host's setup-fn, captured at initChannelAdapters() time so
 * reloadChannelType() can re-setup adapters later without the host
 * re-passing it. Null until the host has initialized once.
 */
let hostSetupFn: ((adapter: ChannelAdapter) => ChannelSetup) | null = null;

/** Composite key for an adapter instance. Defaults the account to the type. */
function adapterKey(channelType: string, accountId?: string): string {
  return `${channelType}#${accountId ?? channelType}`;
}

/** Register a channel adapter factory. Called by channel modules on import. */
export function registerChannelAdapter(name: string, registration: ChannelRegistration): void {
  registry.set(name, registration);
}

/**
 * Get a live adapter. With `accountId`, returns that specific bot/app
 * instance (used by outbound delivery to reply through the correct bot).
 * Without it, returns any instance of the type — fine for type-level
 * properties like `supportsThreads` that are identical across instances.
 */
export function getChannelAdapter(channelType: string, accountId?: string): ChannelAdapter | undefined {
  if (accountId) return activeAdapters.get(adapterKey(channelType, accountId));
  return (
    activeAdapters.get(adapterKey(channelType)) ??
    [...activeAdapters.values()].find((a) => a.channelType === channelType)
  );
}

/** Get all active adapters. */
export function getActiveAdapters(): ChannelAdapter[] {
  return [...activeAdapters.values()];
}

/** Get all registered channel names. */
export function getRegisteredChannelNames(): string[] {
  return [...registry.keys()];
}

/** Get container config for a channel (used by container-runner for additional mounts/env). */
export function getChannelContainerConfig(name: string): ChannelRegistration['containerConfig'] {
  return registry.get(name)?.containerConfig;
}

/**
 * Instantiate and set up all registered channel adapters.
 * Skips adapters that return null (missing credentials).
 */
export async function initChannelAdapters(setupFn: (adapter: ChannelAdapter) => ChannelSetup): Promise<void> {
  hostSetupFn = setupFn;
  for (const [name, registration] of registry) {
    await startRegistration(name, registration, setupFn);
  }
}

/**
 * Run one registration's factory and set up every adapter it produces.
 * Returns the adapters that came online (failures are logged, not thrown,
 * so one bad token doesn't kill its siblings).
 */
async function startRegistration(
  name: string,
  registration: ChannelRegistration,
  setupFn: (adapter: ChannelAdapter) => ChannelSetup,
): Promise<ChannelAdapter[]> {
  let produced: ChannelAdapter | ChannelAdapter[] | null;
  try {
    produced = await registration.factory();
  } catch (err) {
    log.error('Channel adapter factory threw', { channel: name, err });
    return [];
  }
  if (!produced) {
    log.warn('Channel credentials missing, skipping', { channel: name });
    return [];
  }

  // A factory may return multiple instances (one bot/app per account).
  // Set each up independently so one bad token doesn't kill its siblings.
  const adapters = Array.isArray(produced) ? produced : [produced];
  const started: ChannelAdapter[] = [];
  for (const adapter of adapters) {
    try {
      const setup = setupFn(adapter);
      // Transient network failures during adapter init (e.g. Telegram deleteWebhook
      // hitting a DNS hiccup at boot) would otherwise leave the channel permanently
      // dead until manual restart. Retry only on NetworkError so misconfigs (bad
      // tokens, etc.) still fail fast.
      let attempt = 0;
      while (true) {
        try {
          await adapter.setup(setup);
          break;
        } catch (err) {
          if (isNetworkError(err) && attempt < SETUP_RETRY_DELAYS_MS.length) {
            const delay = SETUP_RETRY_DELAYS_MS[attempt]!;
            log.warn('Channel adapter setup failed with network error, retrying', {
              channel: name,
              accountId: adapter.accountId,
              attempt: attempt + 1,
              delayMs: delay,
              err: err.message,
            });
            await sleep(delay);
            attempt += 1;
            continue;
          }
          throw err;
        }
      }
      activeAdapters.set(adapterKey(adapter.channelType, adapter.accountId), adapter);
      started.push(adapter);
      log.info('Channel adapter started', {
        channel: name,
        type: adapter.channelType,
        accountId: adapter.accountId,
      });
    } catch (err) {
      log.error('Failed to start channel adapter', { channel: name, accountId: adapter.accountId, err });
    }
  }
  return started;
}

/**
 * Hot-reload one channel type: tear down its live adapter instances and
 * re-run its factory (which re-reads `channel_accounts` + decrypted secrets).
 * Called by the `channel-accounts` verbs so a newly pasted token goes live
 * without a host restart.
 *
 * Registration names equal channel types for every channel module
 * (registerChannelAdapter('telegram', …) registers channelType 'telegram').
 *
 * Returns the account ids now online for the type.
 */
export async function reloadChannelType(channelType: string): Promise<{ accounts: string[] }> {
  if (!hostSetupFn) {
    throw new Error('channel adapters are not initialized yet — cannot reload');
  }
  const registration = registry.get(channelType);
  if (!registration) {
    throw new Error(`no channel adapter registered for "${channelType}"`);
  }

  for (const [key, adapter] of [...activeAdapters]) {
    if (adapter.channelType !== channelType) continue;
    try {
      await adapter.teardown();
      log.info('Channel adapter stopped for reload', { channel: key });
    } catch (err) {
      // Keep going — a half-dead old instance must not block the new one.
      log.error('Teardown failed during channel reload (continuing)', { channel: key, err });
    }
    activeAdapters.delete(key);
  }

  const started = await startRegistration(channelType, registration, hostSetupFn);
  return { accounts: started.map((a) => a.accountId ?? a.channelType) };
}

/**
 * Validate a token against the channel's live platform API, when the channel
 * registered a validator. Channels without one return ok (store unvalidated).
 */
export async function validateChannelSecret(
  channelType: string,
  name: string,
  value: string,
): Promise<SecretValidation> {
  const validator = registry.get(channelType)?.validateSecret;
  if (!validator) return { ok: true };
  return validator(name, value);
}

/** Tear down all active adapters. */
export async function teardownChannelAdapters(): Promise<void> {
  for (const [name, adapter] of activeAdapters) {
    try {
      await adapter.teardown();
      log.info('Channel adapter stopped', { channel: name });
    } catch (err) {
      log.error('Failed to stop channel adapter', { channel: name, err });
    }
  }
  activeAdapters.clear();
}
