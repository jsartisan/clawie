import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { IconPlus, IconSearch } from '@tabler/icons-react';

import { BrandMark } from '../components/BrandMark';
import { call, list } from '../lib/api';
import {
  Badge,
  Button,
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupInput,
} from 'ui';

interface AgentGroup {
  id: string;
  name: string;
  folder: string;
}

interface AgentDetail {
  id: string;
  name: string;
  personality: string;
}

interface Session {
  agent_group_id: string;
  container_status: 'running' | 'idle' | 'stopped';
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function firstLine(text: string): string {
  return text.split('\n').find((l) => l.trim() && !l.trim().startsWith('#')) ?? '';
}

type AgentStatus = { kind: 'active' } | { kind: 'running'; count: number } | { kind: 'idle' };

function agentStatus(groupId: string, sessions: Session[]): AgentStatus {
  const mine = sessions.filter((s) => s.agent_group_id === groupId);
  const running = mine.filter((s) => s.container_status === 'running');
  if (running.length > 0) {
    if (running.length === 1) return { kind: 'active' };
    return { kind: 'running', count: running.length };
  }
  return { kind: 'idle' };
}

function StatusBadge({ status }: { status: AgentStatus }) {
  if (status.kind === 'active') {
    return <Badge variant="success">active</Badge>;
  }
  if (status.kind === 'running') {
    return <Badge variant="success">{status.count} running</Badge>;
  }
  return null;
}

export function Agents() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AgentDetail[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const groups = await list<AgentGroup>('groups').catch(() => [] as AgentGroup[]);
      const sess = await list<Session>('sessions').catch(() => [] as Session[]);
      if (cancelled) return;
      setSessions(sess);

      const details = await Promise.all(
        groups.map((g) =>
          call<AgentDetail>('agent-get', { id: g.id }).catch(() => ({
            id: g.id,
            name: g.name,
            personality: '',
          })),
        ),
      );
      if (cancelled) return;
      setAgents(details);
      setLoaded(true);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return agents;
    const q = query.toLowerCase();
    return agents.filter((a) => a.name.toLowerCase().includes(q) || firstLine(a.personality).toLowerCase().includes(q));
  }, [agents, query]);

  return (
    <div className="flex min-h-full flex-col items-center px-4 py-12 pt-30">
      <div className="w-full max-w-[540px]">
        {/* Logo + greeting */}
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <BrandMark className="size-10 text-foreground" />
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight">{greeting()}</h1>
            <p className="mt-1 text-[15px] text-muted-foreground">
              Each agent has its own personality, memory, and tasks.
            </p>
          </div>
        </div>

        {/* Search + New agent */}
        <div className="mb-8 flex gap-2.5">
          <InputGroup className="min-w-0 flex-1">
            <InputGroupAddon>
              <InputGroupText>
                <IconSearch aria-hidden />
              </InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              placeholder="Search agents"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search agents"
            />
          </InputGroup>
          <Button onClick={() => navigate({ to: '/agents/new' })}>
            <IconPlus className="size-4" aria-hidden />
            New agent
          </Button>
        </div>

        {/* Agent list */}
        {loaded && filtered.length > 0 && (
          <section>
            <div className="mb-3 flex items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {filtered.length} {filtered.length === 1 ? 'agent' : 'agents'}
              </span>
            </div>
            <ul className="divide-y divide-border">
              {filtered.map((a) => {
                const status = agentStatus(a.id, sessions);
                const description = firstLine(a.personality);
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="flex w-full items-start gap-3 py-3.5 text-left transition-opacity hover:opacity-70 active:opacity-50"
                      onClick={() => navigate({ to: '/agents/$groupId/chat', params: { groupId: a.id } })}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold leading-snug">{a.name}</span>
                        {description && (
                          <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{description}</span>
                        )}
                      </span>
                      <span className="ml-3 flex shrink-0 items-center gap-1">
                        <StatusBadge status={status} />
                        <svg
                          className="size-4 text-muted-foreground/50"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden
                        >
                          <path d="m9 18 6-6-6-6" />
                        </svg>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {loaded && agents.length === 0 && (
          <Empty className="py-16 border-0">
            <EmptyHeader>
              <EmptyTitle>No agents yet</EmptyTitle>
              <EmptyDescription>
                Create your first agent and give it a personality. You can connect Telegram or Slack to it later.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {loaded && agents.length > 0 && filtered.length === 0 && (
          <Empty className="py-8 border-0">
            <EmptyDescription>No agents match &ldquo;{query}&rdquo;</EmptyDescription>
          </Empty>
        )}
      </div>
    </div>
  );
}
