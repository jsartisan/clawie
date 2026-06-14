import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  IconArrowRight,
  IconCircleCheck,
  IconPlugConnected,
  IconSettings,
  IconShieldCheck,
  IconSparkles,
} from '@tabler/icons-react';

import { Avatar } from 'ui/components/Avatar';
import { Button } from 'ui/components/Button';
import { Card, CardContent } from 'ui/components/Card';
import { Skeleton } from 'ui/components/Skeleton';

import { list } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { PageShell } from '../components/PageShell';

interface AgentGroup {
  id: string;
  name?: string;
}

interface PendingApproval {
  agent_group_id: string | null;
  status?: string | null;
}

interface HubData {
  agents: AgentGroup[];
  connections: number;
  approvals: PendingApproval[];
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * The single top-level page. Every agent is a door into its own world —
 * chat, routines, approvals, and settings all live behind the card.
 */
export function Agents() {
  const navigate = useNavigate();
  const [data, setData] = useState<HubData | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      list<AgentGroup>('groups').catch(() => []),
      list('channel-accounts').catch(() => []),
      list<PendingApproval>('approvals').catch(() => []),
    ]).then(([agents, connections, approvals]) => {
      if (cancelled) return;
      setData({
        agents,
        connections: connections.length,
        approvals: approvals.filter((a) => !a.status || a.status === 'pending'),
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Approvals live inside an agent now — send the user to the right one.
  const approvalsTarget =
    data && data.approvals.length > 0
      ? (data.approvals.find((a) => a.agent_group_id)?.agent_group_id ?? data.agents[0]?.id ?? null)
      : null;

  return (
    <PageShell width="wide" className="flex flex-col gap-8 pt-12">
      <PageHeader
        title={greeting()}
        description="Each agent has its own personality, memory, and tasks."
        action={
          data !== null && data.agents.length > 0 ? (
            <Button onPress={() => navigate({ to: '/agents/new' })}>
              <IconSparkles className="size-4" /> New agent
            </Button>
          ) : undefined
        }
      />

      {data === null ? (
        <div className="flex flex-col gap-3" aria-hidden>
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : (
        <>
          {approvalsTarget && (
            <Card
              className="hover:shadow-200 cursor-pointer transition-shadow"
              onClick={() =>
                navigate({ to: '/agents/$groupId/approvals', params: { groupId: approvalsTarget } })
              }
            >
              <CardContent className="flex items-center justify-between gap-3 py-1">
                <div className="flex items-center gap-3.5">
                  <div className="bg-warning/10 text-warning flex size-10 items-center justify-center rounded-full">
                    <IconShieldCheck className="size-5" stroke={1.75} />
                  </div>
                  <div>
                    <div className="font-medium">
                      {data.approvals.length} request{data.approvals.length === 1 ? '' : 's'} waiting for you
                    </div>
                    <div className="text-muted-foreground text-sm">
                      An agent needs your sign-off to continue.
                    </div>
                  </div>
                </div>
                <IconArrowRight className="text-muted-foreground size-4" />
              </CardContent>
            </Card>
          )}

          {data.agents.length === 0 ? (
            <GettingStarted />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {data.agents.map((a) => (
                  <Card
                    key={a.id}
                    variant="outline"
                    className="group hover:shadow-200 cursor-pointer transition-shadow"
                    onClick={() => navigate({ to: '/agents/$groupId/chat', params: { groupId: a.id } })}
                  >
                    <CardContent className="flex items-center gap-3.5 py-0.5">
                      <Avatar name={a.name || 'Agent'} identity size="lg" />
                      <div className="min-w-0 grow">
                        <div className="truncate text-[15px] font-medium">{a.name || 'Agent'}</div>
                        <div className="text-muted-foreground text-[13px]">Open chat</div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${a.name || 'Agent'} settings`}
                        className="shrink-0"
                        onPress={() =>
                          navigate({ to: '/agents/$groupId/settings', params: { groupId: a.id } })
                        }
                      >
                        <IconSettings className="size-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {data.connections === 0 && (
                <Card
                  variant="subtle"
                  className="hover:shadow-100 cursor-pointer transition-shadow"
                  onClick={() =>
                    navigate({ to: '/agents/$groupId/settings', params: { groupId: data.agents[0].id } })
                  }
                >
                  <CardContent className="flex items-center justify-between gap-3 py-1">
                    <div className="flex items-center gap-3.5">
                      <div className="bg-primary/8 text-primary flex size-10 items-center justify-center rounded-full">
                        <IconPlugConnected className="size-5" stroke={1.75} />
                      </div>
                      <div>
                        <div className="font-medium">Take your agent everywhere</div>
                        <div className="text-muted-foreground text-sm">
                          Connect Telegram or Slack and message your agent from your phone.
                        </div>
                      </div>
                    </div>
                    <IconArrowRight className="text-muted-foreground size-4" />
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </PageShell>
  );
}

function GettingStarted() {
  const navigate = useNavigate();

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <IconSparkles className="text-muted-foreground size-8" aria-hidden />
        <p className="font-medium">No agents yet</p>
        <p className="text-muted-foreground max-w-sm text-sm">
          An agent is your personal AI assistant. Create one, give it a personality, and start
          chatting. You can connect Telegram or Slack to it later.
        </p>
        <Button onPress={() => navigate({ to: '/agents/new' })}>Create your first agent</Button>
      </div>
      <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
        <IconCircleCheck className="size-3.5" /> Everything runs on your own machine — your chats never leave it.
      </p>
    </section>
  );
}
