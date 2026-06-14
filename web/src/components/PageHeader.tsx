import type { ReactNode } from 'react';

/**
 * Standard page heading: serif display title, muted description, and an
 * optional action slot pinned to the right. Keeps every page's voice
 * consistent with the brand.
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-serif text-[26px] leading-tight font-medium tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
