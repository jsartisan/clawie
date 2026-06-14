import { useCallback, useEffect, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { IconClockHour4 } from '@tabler/icons-react';

import { Badge } from 'ui/components/Badge';
import { Button } from 'ui/components/Button';
import { Card, CardContent } from 'ui/components/Card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from 'ui/components/Empty';
import { Skeleton } from 'ui/components/Skeleton';
import { toast } from 'ui/components/Toast';

import { CommandError, call } from '../lib/api';
import { formatUntil } from '../lib/format';
import { PageShell } from '../components/PageShell';

interface Routine {
  id: string;
  session_id: string;
  agent_group_id: string;
  agent_name: string;
  status: 'pending' | 'paused';
  prompt: string;
  process_after: string | null;
  recurrence: string | null;
}

const POLL_MS = 15_000;

/**
 * This agent's scheduled and recurring tasks, with pause/resume/cancel.
 * Tasks are created by the agent (schedule_task); this is the human
 * oversight surface.
 */
export function Routines() {
  const { groupId } = useParams({ from: '/agents/$groupId/routines' });
  const [rows, setRows] = useState<Routine[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const all = await call<Routine[]>('routines-list');
      setRows(all.filter((r) => r.agent_group_id === groupId));
    } catch {
      setRows((prev) => prev ?? []);
    }
  }, [groupId]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  async function act(routine: Routine, verb: 'cancel' | 'pause' | 'resume') {
    setBusy(routine.id);
    try {
      await call(`routines-${verb}`, { id: routine.id, session: routine.session_id });
      toast.success(verb === 'cancel' ? 'Routine cancelled' : verb === 'pause' ? 'Routine paused' : 'Routine resumed');
      await refresh();
    } catch (err) {
      toast.error(err instanceof CommandError ? err.message : `Failed to ${verb} the routine`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageShell className="flex flex-col gap-3">
      {rows === null ? (
        <div className="flex flex-col gap-3" aria-hidden>
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia>
              <IconClockHour4 className="text-muted-foreground size-8" aria-hidden />
            </EmptyMedia>
            <EmptyTitle>No routines yet</EmptyTitle>
            <EmptyDescription>
              Ask this agent to do something “every morning” or “in an hour” and it will show up here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        rows.map((r) => (
          <Card key={`${r.session_id}-${r.id}`} variant="outline">
            <CardContent className="flex flex-col gap-3 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="line-clamp-2 font-medium">{r.prompt}</div>
                  <div className="text-muted-foreground mt-1 text-xs">
                    {r.process_after ? formatUntil(r.process_after) : ''}
                    {r.recurrence ? `${r.process_after ? ' · ' : ''}repeats: ${r.recurrence}` : ''}
                  </div>
                </div>
                <Badge variant={r.status === 'paused' ? 'secondary' : 'default'}>{r.status}</Badge>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  isDisabled={busy === r.id}
                  onPress={() => act(r, 'cancel')}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  isDisabled={busy === r.id}
                  onPress={() => act(r, r.status === 'paused' ? 'resume' : 'pause')}
                >
                  {r.status === 'paused' ? 'Resume' : 'Pause'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </PageShell>
  );
}
