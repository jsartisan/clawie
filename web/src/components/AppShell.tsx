import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';

import { BrandMark } from './BrandMark';
import { UserMenu } from './UserMenu';

/**
 * Minimal chrome: a slim top bar with the brand and the account menu.
 * All navigation happens inside the pages themselves — agents are the
 * only top-level destination.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background text-foreground flex h-screen w-screen flex-col">
      <header className="border-border flex h-14 shrink-0 items-center justify-between border-b px-4">
        <Link to="/" className="flex items-center gap-x-2 outline-none" aria-label="NanoClaw — your agents">
          <BrandMark className="size-5 text-foreground" />
          <span className="font-serif text-sm font-medium">NanoClaw</span>
        </Link>
        <UserMenu />
      </header>
      <main className="min-h-0 min-w-0 grow overflow-y-auto">{children}</main>
    </div>
  );
}
