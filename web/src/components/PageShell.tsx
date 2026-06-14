import type { ReactNode } from 'react';

import { cn } from 'ui/lib/utils';

const WIDTHS = {
  narrow: 'max-w-xl',
  default: 'max-w-2xl',
  wide: 'max-w-3xl',
} as const;

/**
 * Standard page container: centered column with the shared gutter and
 * vertical rhythm. Pages override spacing per-case via className (merged,
 * so e.g. `pt-12` wins over the base `pt-8`).
 */
export function PageShell({
  width = 'default',
  className,
  children,
}: {
  width?: keyof typeof WIDTHS;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('mx-auto w-full px-6 pt-8 pb-16', WIDTHS[width], className)}>
      {children}
    </div>
  );
}
