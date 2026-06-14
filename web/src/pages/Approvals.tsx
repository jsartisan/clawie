import { useCallback, useEffect, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { IconShieldCheck } from '@tabler/icons-react';

import { Badge } from 'ui/components/Badge';
import { Button } from 'ui/components/Button';
import { Card, CardContent } from 'ui/components/Card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from 'ui/components/Empty';
import { Skeleton } from 'ui/components/Skeleton';
import { toast } from 'ui/components/Toast';

import { CommandError, custom, list } from '../lib/api';
import { formatRelativeTime } from '../lib/format';
import { PageShell } from '../components/PageShell';

interface PendingApproval {
  approval_id: string;
  action: string;
  title: string | null;
  payload: string;
  created_at: string;
  agent_group_id: string | null;
  status?: string | null;
}

/** Refresh cadence — approvals can arrive any time the agent acts. */
const POLL_MS = 10_000;

function payloadSummary(payload: string): string | null {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    const entries = Object.entries(parsed).filter(([, v]) => typeof v === 'string' || typeof v === 'number');
    if (entries.length === 0) return null;
    return entries
      .slice(0, 4)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(' · ');
  } catch {
    return null;
  }
}

/**
 * This agent's approval inbox — the portal counterpart of approval cards
 * delivered to an admin's DM. Resolving here goes through the exact same
 * response dispatch. Requests without an agent attribution show up on
 * every agent so nothing slips through.
 */
export function Approvals() {
  const { groupId } = useParams({ from: '/agents/$groupId/approvals' });
  const [rows, setRows] = useState<PendingApproval[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const all = await list<PendingApproval>('approvals');
      setRows(
        all.filter(
          (r) =>
            (!r.status || r.status === 'pending') &&
            (!r.agent_group_id || r.agent_group_id === groupId),
        ),
      );
    } catch {
      // Keep showing the last list; the next poll retries.
      setRows((prev) => prev ?? []);
    }
  }, [groupId]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  async function respond(id: string, value: 'approve' | 'reject') {
    setBusy(id);
    try {
      await custom('approvals', 'respond', { id, value });
      toast.success(value === 'approve' ? 'Approved' : 'Rejected');
      setRows((prev) => prev?.filter((r) => r.approval_id !== id) ?? prev);
    } catch (err) {
      toast.error(err instanceof CommandError ? err.message : 'Failed to resolve the approval');
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageShell className="flex flex-col gap-3">
      {rows === null ? (
        <div className="flex flex-col gap-3" aria-hidden>
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia>
              <IconShieldCheck className="text-muted-foreground size-8" aria-hidden />
            </EmptyMedia>
            <EmptyTitle>Nothing waiting on you</EmptyTitle>
            <EmptyDescription>
              Requests that need your sign-off before this agent can act will show up here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        rows.map((r) => {
          const summary = payloadSummary(r.payload);
          return (
            <Card key={r.approval_id} variant="outline">
              <CardContent className="flex flex-col gap-3 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{r.title || r.action}</div>
                    {summary && <div className="text-muted-foreground mt-1 truncate text-sm">{summary}</div>}
                  </div>
                  <Badge variant="secondary">{r.action}</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground text-xs">{formatRelativeTime(r.created_at)}</span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      isDisabled={busy === r.approval_id}
                      onPress={() => respond(r.approval_id, 'reject')}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      isDisabled={busy === r.approval_id}
                      onPress={() => respond(r.approval_id, 'approve')}
                    >
                      Approve
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </PageShell>
  );
}
