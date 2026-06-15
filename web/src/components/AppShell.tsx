import type { ReactNode } from 'react';
/**
 * Minimal chrome: a slim top bar with the brand and the account menu.
 * All navigation happens inside the pages themselves — agents are the
 * only top-level destination.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background text-foreground flex h-screen w-screen flex-col">
      <main className="min-h-0 min-w-0 grow overflow-y-auto">{children}</main>
    </div>
  );
}
