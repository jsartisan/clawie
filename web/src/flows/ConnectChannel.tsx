import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { IconBrandSlack, IconBrandTelegram, IconPlugConnected } from '@tabler/icons-react';

import { Button } from 'ui/components/Button';
import { Card, CardContent } from 'ui/components/Card';
import { Spinner } from 'ui/components/Spinner';
import { TextField } from 'ui/components/TextField';
import { toast } from 'ui/components/Toast';

import { CommandError, create, custom, list } from '../lib/api';
import { channelInfo } from '../lib/channels';

interface ChannelAccount {
  id: string;
  channel_type: string;
  account_id: string;
}

/** Pick a free internal nickname — plumbing the user shouldn't have to name. */
function pickAccountId(channel: string, existing: ChannelAccount[]): string {
  const taken = new Set(existing.filter((a) => a.channel_type === channel).map((a) => a.account_id));
  if (!taken.has('main')) return 'main';
  for (let i = 2; ; i++) {
    if (!taken.has(`bot-${i}`)) return `bot-${i}`;
  }
}

/**
 * Guided per-channel connect flow, scoped to the agent it was opened from:
 * plain-language steps to get the token(s), paste, done. Validation +
 * hot-reload happen server-side, so when this succeeds the bot is already
 * live and answering as this agent.
 */
export function ConnectChannel() {
  const navigate = useNavigate();
  const { groupId } = useParams({ from: '/agents/$groupId/connect' });
  const { channel } = useSearch({ from: '/agents/$groupId/connect' });
  const info = channelInfo(channel);

  const [accounts, setAccounts] = useState<ChannelAccount[] | null>(null);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    list<ChannelAccount>('channel-accounts')
      .then((accs) => !cancelled && setAccounts(accs))
      .catch(() => !cancelled && setAccounts([]));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!info) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">Unknown channel. Go back to settings and pick one.</p>
      </div>
    );
  }

  const missingToken = info.tokens.some((t) => t.required && !(tokens[t.key] ?? '').trim());

  const backToSettings = () => navigate({ to: '/agents/$groupId/settings', params: { groupId } });

  async function submit() {
    if (!info) return;
    if (missingToken) return toast.error('Paste the token first');

    setPending(true);
    let createdId: string | null = null;
    try {
      const account = (await create('channel-accounts', {
        channel_type: info.id,
        account_id: pickAccountId(info.id, accounts ?? []),
        default_agent_group_id: groupId,
      })) as { id: string };
      createdId = account.id;

      // Each set-secret validates against the live platform and hot-reloads
      // the channel — when the last one succeeds the bot is already online.
      let identity: string | null = null;
      for (const t of info.tokens) {
        const value = (tokens[t.key] ?? '').trim();
        if (!value) continue;
        const result = (await custom('channel-accounts', 'set-secret', {
          id: account.id,
          name: t.key,
          value,
        })) as { identity?: string | null };
        identity = identity ?? result.identity ?? null;
      }

      toast.success(`${identity ?? info.name} is connected — send it a message!`);
      backToSettings();
    } catch (err) {
      // Don't leave a half-connected account behind; the user just retries.
      if (createdId) {
        await custom('channel-accounts', 'delete', { id: createdId }).catch(() => {});
      }
      toast.error(err instanceof CommandError ? err.message : `Could not connect ${info.name}`);
      setPending(false);
    }
  }

  const ChannelIcon =
    info.id === 'telegram' ? IconBrandTelegram : info.id === 'slack' ? IconBrandSlack : IconPlugConnected;

  const tile =
    info.id === 'telegram' || info.id === 'slack'
      ? 'bg-secondary text-secondary-foreground'
      : 'bg-primary/8 text-primary';

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 pt-8 pb-16">
      <div className="flex items-center gap-4">
        <div className={`flex size-12 items-center justify-center rounded-2xl ${tile}`}>
          <ChannelIcon className="size-6" stroke={1.75} />
        </div>
        <div>
          <h1 className="font-serif text-[26px] leading-tight font-medium tracking-tight">
            Connect {info.name}
          </h1>
          <p className="text-muted-foreground mt-0.5 text-sm">{info.tagline}</p>
        </div>
      </div>

      <Card variant="subtle">
        <CardContent className="py-4">
          <ol className="flex flex-col gap-2">
            {info.steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="border-border text-muted-foreground flex size-5 shrink-0 items-center justify-center rounded-full border text-xs">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-5">
          {accounts === null ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {info.tokens.map((t) => (
                <TextField
                  key={t.key}
                  label={t.label}
                  type="password"
                  placeholder={t.placeholder}
                  value={tokens[t.key] ?? ''}
                  onChange={(v) => setTokens((prev) => ({ ...prev, [t.key]: v }))}
                  description="Checked with the platform before saving — typos get caught right away."
                />
              ))}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onPress={backToSettings}>
                  Cancel
                </Button>
                <Button type="submit" isDisabled={pending || missingToken}>
                  {pending ? 'Connecting…' : `Connect ${info.name}`}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
