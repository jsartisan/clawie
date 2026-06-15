import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import {
  IconBook,
  IconBrandGithub,
  IconBrandGmail,
  IconChartBar,
  IconBrandSlack,
  IconBrandTelegram,
  IconCalendar,
  IconPlugConnected,
  IconPuzzle,
  IconSearch,
  IconWorld,
} from '@tabler/icons-react';

import { Badge } from 'ui/components/Badge';
import { Button } from 'ui/components/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'ui/components/Card';
import { ConfirmDialog } from 'ui/components/ConfirmDialog';
import { Label } from 'ui/components/Label';
import { Modal } from 'ui/components/Modal';
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from 'ui/components/Dialog';
import { NativeLink } from 'ui/components/NativeLink';
import { Skeleton } from 'ui/components/Skeleton';
import { TextField } from 'ui/components/TextField';
import { Textarea } from 'ui/components/Textarea';
import { toast } from 'ui/components/Toast';

import { CommandError, call, custom, list } from '../lib/api';
import { CHANNEL_CATALOG } from '../lib/channels';
import { PageShell } from '../components/PageShell';

interface AgentSettingsData {
  id: string;
  name: string;
  personality: string;
  model: string | null;
}

interface ChannelAccount {
  id: string;
  channel_type: string;
  account_id: string;
  default_agent_group_id: string | null;
}

interface IntegrationEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  auth: { type: 'api_key' | 'none' | 'guided'; env?: string; urlEnv?: string; helpUrl?: string; help?: string };
  enabled_groups: string[];
}

const INTEGRATION_ICONS: Record<string, typeof IconPuzzle> = {
  'brave-search': IconSearch,
  tavily: IconWorld,
  firecrawl: IconWorld,
  context7: IconBook,
  github: IconBrandGithub,
  grafana: IconChartBar,
  gmail: IconBrandGmail,
  'google-calendar': IconCalendar,
};

function channelIcon(channelType: string) {
  if (channelType === 'telegram') return <IconBrandTelegram className="size-5" />;
  if (channelType === 'slack') return <IconBrandSlack className="size-5" />;
  return <IconPlugConnected className="size-5" />;
}

/* Neutral editorial tile — the channel name carries the identity. */
function channelTile(channelType: string): string {
  if (channelType === 'telegram' || channelType === 'slack')
    return 'bg-secondary text-secondary-foreground';
  return 'bg-primary/8 text-primary';
}

/**
 * Everything configurable about one agent: profile, the channels it answers
 * on, the abilities (integrations) it has, and the danger zone.
 */
export function AgentSettings() {
  const { groupId } = useParams({ from: '/agents/$groupId/settings' });
  const navigate = useNavigate();

  const [settings, setSettings] = useState<AgentSettingsData | null>(null);
  const [name, setName] = useState('');
  const [personality, setPersonality] = useState('');
  const [model, setModel] = useState('');
  const [connections, setConnections] = useState<ChannelAccount[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removing, setRemoving] = useState<ChannelAccount | null>(null);
  const [enabling, setEnabling] = useState<IntegrationEntry | null>(null);

  const refreshWiring = useCallback(async () => {
    const [accounts, catalog] = await Promise.all([
      list<ChannelAccount>('channel-accounts').catch(() => [] as ChannelAccount[]),
      call<IntegrationEntry[]>('integrations-list').catch(() => [] as IntegrationEntry[]),
    ]);
    setConnections(accounts.filter((a) => a.default_agent_group_id === groupId));
    setIntegrations(catalog);
  }, [groupId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([call<AgentSettingsData>('agent-get', { id: groupId }), refreshWiring()])
      .then(([s]) => {
        if (cancelled) return;
        setSettings(s);
        setName(s.name);
        setPersonality(s.personality);
        setModel(s.model ?? '');
      })
      .catch((err) => toast.error(err instanceof CommandError ? err.message : 'Could not load this agent'));
    return () => {
      cancelled = true;
    };
  }, [groupId, refreshWiring]);

  const dirty =
    settings !== null &&
    (name.trim() !== settings.name || personality.trim() !== settings.personality || model.trim() !== (settings.model ?? ''));

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      const result = await call<{ restarted: number }>('agent-update', {
        id: groupId,
        name: name.trim(),
        personality: personality.trim(),
        model: model.trim(),
      });
      setSettings({ ...settings, name: name.trim(), personality: personality.trim(), model: model.trim() || null });
      toast.success(result.restarted > 0 ? 'Saved — your agent restarted with the changes' : 'Saved');
    } catch (err) {
      toast.error(err instanceof CommandError ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  async function deleteAgent() {
    setDeleting(true);
    try {
      await call('groups-delete', { id: groupId });
      toast.success('Agent deleted');
      navigate({ to: '/' });
    } catch (err) {
      toast.error(err instanceof CommandError ? err.message : 'Could not delete the agent');
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function disconnect(account: ChannelAccount) {
    try {
      await custom('channel-accounts', 'delete', { id: account.id });
      toast.success('Disconnected');
      await refreshWiring();
    } catch (err) {
      toast.error(err instanceof CommandError ? err.message : 'Failed to disconnect');
    } finally {
      setRemoving(null);
    }
  }

  if (settings === null) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-6" aria-hidden>
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  const connectedTypes = new Set(connections.map((c) => c.channel_type));

  return (
    <PageShell width="narrow" className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4 py-5">
          <TextField label="Name" value={name} onChange={setName} maxLength={60} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-personality">Personality &amp; instructions</Label>
            <Textarea
              id="agent-personality"
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              placeholder="What should this agent be like? What is it for?"
              className="min-h-32"
            />
          </div>

          <TextField
            label="Model"
            value={model}
            onChange={setModel}
            placeholder="Default"
            description="Leave empty for the default model. Advanced: a specific model id, e.g. claude-sonnet-4-5."
          />

          <div className="flex justify-end">
            <Button onPress={save} isDisabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card variant="outline">
        <CardHeader>
          <CardTitle className="text-base">Reachable from</CardTitle>
          <CardDescription>Where this agent answers, besides web chat.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2.5">
          {connections.map((acc) => (
            <div key={acc.id} className="flex items-center gap-3">
              <div
                className={`relative flex size-9 shrink-0 items-center justify-center rounded-lg ${channelTile(acc.channel_type)}`}
              >
                {channelIcon(acc.channel_type)}
                <span className="border-card bg-success absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2" />
              </div>
              <div className="min-w-0 grow">
                <span className="truncate font-medium capitalize">{acc.channel_type}</span>
                <div className="text-muted-foreground truncate text-xs">“{acc.account_id}”</div>
              </div>
              <Button variant="outline" size="sm" onPress={() => setRemoving(acc)}>
                Disconnect
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            {CHANNEL_CATALOG.filter((ch) => !connectedTypes.has(ch.id)).map((ch) => (
              <Button
                key={ch.id}
                variant="outline"
                size="sm"
                onPress={() =>
                  navigate({
                    to: '/agents/$groupId/connect',
                    params: { groupId },
                    search: { channel: ch.id },
                  })
                }
              >
                {channelIcon(ch.id)} Connect {ch.name}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card variant="outline">
        <CardHeader>
          <CardTitle className="text-base">Abilities</CardTitle>
          <CardDescription>Give this agent new abilities — search, email, docs, and more.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {integrations.map((entry) => {
            const EntryIcon = INTEGRATION_ICONS[entry.id] ?? IconPuzzle;
            const enabledHere = entry.enabled_groups.includes(groupId);
            const guided = entry.auth.type === 'guided';
            return (
              <div key={entry.id} className="flex items-center gap-3">
                <div className="bg-muted text-foreground/80 border-border flex size-9 shrink-0 items-center justify-center rounded-lg border">
                  <EntryIcon className="size-4.5" stroke={1.75} />
                </div>
                <div className="min-w-0 grow">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{entry.name}</span>
                    {enabledHere && (
                      <Badge variant="secondary">
                        <span className="bg-success mr-1 inline-block size-1.5 rounded-full" /> on
                      </Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground truncate text-xs">
                    {guided ? entry.auth.help : entry.description}
                  </div>
                </div>
                {!guided && (
                  <Button variant="outline" size="sm" onPress={() => setEnabling(entry)}>
                    {enabledHere ? 'Manage' : 'Enable'}
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card variant="outline" className="border-destructive/40">
        <CardContent className="flex items-center justify-between gap-3 py-4">
          <div>
            <div className="font-medium">Delete this agent</div>
            <div className="text-muted-foreground text-sm">Removes the agent and its conversations. No undo.</div>
          </div>
          <Button variant="destructive" size="sm" onPress={() => setConfirmDelete(true)}>
            Delete
          </Button>
        </CardContent>
      </Card>

      {confirmDelete && (
        <ConfirmDialog
          isOpen
          onOpenChange={(open) => !open && setConfirmDelete(false)}
          title={`Delete ${settings.name}?`}
          description="This removes the agent, its wiring, and its sessions. There is no undo."
          confirmLabel="Delete agent"
          isPending={deleting}
          onConfirm={() => void deleteAgent()}
        />
      )}

      {removing && (
        <ConfirmDialog
          isOpen
          onOpenChange={(open) => !open && setRemoving(null)}
          title={`Disconnect ${removing.channel_type}?`}
          description="The bot goes offline immediately. Your chat history stays."
          confirmLabel="Disconnect"
          onConfirm={() => void disconnect(removing)}
        />
      )}

      {enabling && (
        <IntegrationDialog
          entry={enabling}
          groupId={groupId}
          onClose={() => setEnabling(null)}
          onChanged={() => {
            setEnabling(null);
            void refreshWiring();
          }}
        />
      )}
    </PageShell>
  );
}

function IntegrationDialog({
  entry,
  groupId,
  onClose,
  onChanged,
}: {
  entry: IntegrationEntry;
  groupId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [key, setKey] = useState('');
  const [url, setUrl] = useState('');
  const [pending, setPending] = useState(false);

  const enabledHere = entry.enabled_groups.includes(groupId);
  const needsKey = entry.auth.type === 'api_key';
  const needsUrl = !!entry.auth.urlEnv;

  async function run(action: 'enable' | 'disable') {
    if (action === 'enable' && needsKey && !key.trim()) return toast.error('Paste the API key first');
    if (action === 'enable' && needsUrl && !url.trim()) return toast.error('Enter the instance URL first');
    setPending(true);
    try {
      if (action === 'enable') {
        await call('integrations-enable', { id: entry.id, group: groupId, key: key.trim(), url: url.trim() });
        toast.success(`${entry.name} is being added — your agent will have it in a few minutes`);
      } else {
        await call('integrations-disable', { id: entry.id, group: groupId });
        toast.success(`${entry.name} disabled`);
      }
      onChanged();
    } catch (err) {
      toast.error(err instanceof CommandError ? err.message : 'Something went wrong');
      setPending(false);
    }
  }

  return (
    <Modal isOpen onOpenChange={(open) => !open && onClose()}>
      <Dialog className="w-[26rem] max-w-full">
        <DialogHeader>
          <DialogTitle>{entry.name}</DialogTitle>
          <DialogDescription slot="description">{entry.description}</DialogDescription>
        </DialogHeader>

        {needsKey && !enabledHere && (
          <div className="mt-4 flex flex-col gap-3">
            {needsUrl && (
              <TextField
                label="Instance URL"
                type="url"
                placeholder="https://grafana.example.com"
                value={url}
                onChange={setUrl}
              />
            )}
            <div className="flex flex-col gap-1.5">
              <TextField
                label="API key"
                type="password"
                value={key}
                onChange={setKey}
                description={entry.auth.help}
              />
              {entry.auth.helpUrl && (
                <NativeLink href={entry.auth.helpUrl} target="_blank" rel="noopener noreferrer" className="text-xs">
                  Get a key →
                </NativeLink>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onPress={onClose}>
            Cancel
          </Button>
          {enabledHere ? (
            <Button variant="destructive" isDisabled={pending} onPress={() => void run('disable')}>
              {pending ? 'Disabling…' : 'Disable'}
            </Button>
          ) : (
            <Button isDisabled={pending} onPress={() => void run('enable')}>
              {pending ? 'Enabling…' : 'Enable'}
            </Button>
          )}
        </div>
      </Dialog>
    </Modal>
  );
}
