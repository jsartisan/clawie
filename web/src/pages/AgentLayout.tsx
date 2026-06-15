import { useEffect, useState } from 'react';
import { Link, Outlet, useParams } from '@tanstack/react-router';
import { IconArrowLeft } from '@tabler/icons-react';

import { Avatar } from 'ui/components/Avatar';
import { Skeleton } from 'ui/components/Skeleton';

import { call } from '../lib/api';
import { cn } from 'ui/lib/utils';

interface AgentGroup {
  id: string;
  name?: string;
}

const TABS = [
  { to: '/agents/$groupId/chat', label: 'Chat' },
  { to: '/agents/$groupId/routines', label: 'Routines' },
  { to: '/agents/$groupId/approvals', label: 'Approvals' },
  { to: '/agents/$groupId/settings', label: 'Settings' },
] as const;

const tabStyles = cn(
  'text-muted-foreground -mb-px border-b-2 border-transparent px-1 pb-2 text-sm font-medium transition-colors outline-none',
  'hover:text-foreground',
  'data-[status=active]:border-primary data-[status=active]:text-foreground',
);

/**
 * Everything about one agent lives here: the conversation, its scheduled
 * routines, pending approvals, and settings — switched via tabs.
 */
export function AgentLayout() {
  const { groupId } = useParams({ from: '/agents/$groupId' });
  const [agent, setAgent] = useState<AgentGroup | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAgent(null);
    call<AgentGroup>('groups-get', { id: groupId })
      .then((g) => !cancelled && setAgent(g))
      .catch(() => !cancelled && setAgent({ id: groupId }));
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b px-4 pt-3 sm:px-6 mx-auto max-w-2xl w-[calc(100%-(var(--spacing)*10))]">
        <div className="flex items-center gap-3 pb-3">
          <Link
            to="/"
            aria-label="Back to agents"
            className="text-muted-foreground hover:text-foreground hover:bg-accent flex size-7 shrink-0 items-center justify-center rounded-md transition-colors outline-none"
          >
            <IconArrowLeft className="size-4" />
          </Link>
          {agent === null ? (
            <>
              <Skeleton className="h-4 w-32" />
            </>
          ) : (
            <>
              <span className="truncate font-medium">{agent.name || 'Agent'}</span>
            </>
          )}
        </div>
        <nav className="flex gap-5 pt-6" aria-label="Agent sections">
          {TABS.map((tab) => (
            <Link key={tab.to} to={tab.to} params={{ groupId }} className={tabStyles}>
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="min-h-0 min-w-0 grow overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
