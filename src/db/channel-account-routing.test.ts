/**
 * Tests for the multi-account chat-identity fix: a chat is identified by
 * (channel_type, platform_id, channel_account), and one account per channel is
 * the default that owns legacy account-less rows. The motivating bug: Telegram
 * DM platform_ids collide across bots (a private chat id equals the user id).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  initTestDb,
  closeDb,
  getDb,
  runMigrations,
  createAgentGroup,
  createMessagingGroup,
  createMessagingGroupAgent,
  getMessagingGroupWithAgentCount,
  getMessagingGroupByPlatformAndAccount,
} from './index.js';
import { getDefaultChannelAccount, setDefaultChannelAccount } from './channel-accounts.js';

function now() {
  return new Date().toISOString();
}

function makeAgent(id: string, folder: string) {
  createAgentGroup({ id, name: id, folder, agent_provider: null, created_at: now() });
}

function makeAccount(id: string, accountId: string, agentGroupId: string, isDefault = 0) {
  getDb()
    .prepare(
      `INSERT INTO channel_accounts (id, channel_type, account_id, default_agent_group_id, is_default, created_at)
       VALUES (?, 'telegram', ?, ?, ?, ?)`,
    )
    .run(id, accountId, agentGroupId, isDefault, now());
}

function makeChat(id: string, platformId: string, channelAccount: string | null) {
  createMessagingGroup({
    id,
    channel_type: 'telegram',
    platform_id: platformId,
    name: null,
    is_group: 0,
    unknown_sender_policy: 'strict',
    channel_account: channelAccount,
    created_at: now(),
  });
}

function wire(mgId: string, agentGroupId: string) {
  createMessagingGroupAgent({
    id: `mga-${mgId}`,
    messaging_group_id: mgId,
    agent_group_id: agentGroupId,
    engage_mode: 'mention',
    engage_pattern: null,
    sender_scope: 'all',
    ignored_message_policy: 'drop',
    session_mode: 'shared',
    priority: 0,
    created_at: now(),
  });
}

beforeEach(() => {
  const db = initTestDb();
  runMigrations(db);
  makeAgent('ag-roro', 'roro');
  makeAgent('ag-work', 'work');
  makeAccount('ca-personal', 'personal', 'ag-roro', 1); // default
  makeAccount('ca-work', 'work', 'ag-work', 0);
});

afterEach(() => {
  closeDb();
});

const USER_DM = 'telegram:1582003360'; // shared across both bots (= user id)

describe('account-scoped messaging-group lookup', () => {
  it('lets the default account own a legacy NULL-account chat', () => {
    makeChat('mg-legacy', USER_DM, null);
    wire('mg-legacy', 'ag-roro');

    const found = getMessagingGroupWithAgentCount('telegram', USER_DM, {
      channelAccount: 'personal',
      includeNullAccount: true,
    });
    expect(found?.mg.id).toBe('mg-legacy');
    expect(found?.agentCount).toBe(1);
  });

  it('does NOT let a non-default account see the legacy NULL-account chat', () => {
    makeChat('mg-legacy', USER_DM, null);
    wire('mg-legacy', 'ag-roro');

    // The work bot, DM'd by the same user, must not resolve the RoRo row.
    const found = getMessagingGroupWithAgentCount('telegram', USER_DM, {
      channelAccount: 'work',
      includeNullAccount: false,
    });
    expect(found).toBeNull();
  });

  it('keeps two bots DM-d by the same user as two distinct chats', () => {
    makeChat('mg-legacy', USER_DM, null); // personal (legacy)
    wire('mg-legacy', 'ag-roro');
    makeChat('mg-work', USER_DM, 'work'); // work, same platform_id
    wire('mg-work', 'ag-work');

    const personal = getMessagingGroupWithAgentCount('telegram', USER_DM, {
      channelAccount: 'personal',
      includeNullAccount: true,
    });
    const work = getMessagingGroupWithAgentCount('telegram', USER_DM, {
      channelAccount: 'work',
      includeNullAccount: false,
    });
    expect(personal?.mg.id).toBe('mg-legacy');
    expect(work?.mg.id).toBe('mg-work');
  });

  it('prefers an exact account match over a NULL row for the default account', () => {
    makeChat('mg-legacy', USER_DM, null);
    wire('mg-legacy', 'ag-roro');
    makeChat('mg-personal', USER_DM, 'personal');
    wire('mg-personal', 'ag-roro');

    const found = getMessagingGroupWithAgentCount('telegram', USER_DM, {
      channelAccount: 'personal',
      includeNullAccount: true,
    });
    expect(found?.mg.id).toBe('mg-personal');
  });

  it('legacy mode (no account) matches by (type, platform_id)', () => {
    makeChat('mg-legacy', USER_DM, null);
    wire('mg-legacy', 'ag-roro');
    const found = getMessagingGroupWithAgentCount('telegram', USER_DM);
    expect(found?.mg.id).toBe('mg-legacy');
  });
});

describe('getMessagingGroupByPlatformAndAccount', () => {
  it('matches NULL vs a specific account distinctly', () => {
    makeChat('mg-legacy', USER_DM, null);
    makeChat('mg-work', USER_DM, 'work');
    expect(getMessagingGroupByPlatformAndAccount('telegram', USER_DM, null)?.id).toBe('mg-legacy');
    expect(getMessagingGroupByPlatformAndAccount('telegram', USER_DM, 'work')?.id).toBe('mg-work');
    expect(getMessagingGroupByPlatformAndAccount('telegram', USER_DM, 'personal')).toBeUndefined();
  });
});

describe('setDefaultChannelAccount', () => {
  it('keeps exactly one default per channel type', () => {
    expect(getDefaultChannelAccount('telegram')?.account_id).toBe('personal');
    setDefaultChannelAccount('ca-work');
    expect(getDefaultChannelAccount('telegram')?.account_id).toBe('work');

    const defaults = getDb()
      .prepare('SELECT COUNT(*) AS n FROM channel_accounts WHERE channel_type = ? AND is_default = 1')
      .get('telegram') as { n: number };
    expect(defaults.n).toBe(1);
  });
});
