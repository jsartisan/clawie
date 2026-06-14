'use client';

import { PropsWithChildren, ReactNode } from 'react';

import { cn } from '../lib/utils';

// import { Badge, Button, Loading } from "./";

interface PanelProps {
  className?: string;
  footer?: ReactNode | false;
  loading?: boolean;
  noMargin?: boolean;
  title?: ReactNode | false;
  subtitle?: ReactNode | false;
  wrapWithLoading?: boolean;
  noHideOverflow?: boolean;
  titleClasses?: string;
}

export function Panel(props: PropsWithChildren<PanelProps>) {
  const content = (
    <div className={cn('relative py-6 first:pt-0', props.className)}>
      {props.title && (
        <div
          className={cn(
            'relative z-10 flex w-full flex-col gap-1 rounded-md px-4 py-3 [&_div]:z-10',
            "before:bg-secondary before:absolute before:top-0 before:left-[1px] before:block before:h-[calc(100%+10px)] before:w-[calc(100%-2px)] before:rounded-t-lg before:content-['']",
            props.titleClasses,
          )}
        >
          <div className="box-trim text-base font-medium tracking-wide">
            {props.title}
          </div>
          {props.subtitle && (
            <div className="box-trim text-muted-foreground text-sm">
              {props.subtitle}
            </div>
          )}
        </div>
      )}
      <div className="rounded-md shadow-xs">{props.children}</div>
      {props.footer && <PanelFooter>{props.footer}</PanelFooter>}
    </div>
  );

  if (props.wrapWithLoading === false) {
    return content;
  }

  return content;
}

export function PanelContent({
  children,
  className,
  compact,
  noPadding,
}: {
  children: ReactNode;
  className?: string | false;
  noPadding?: boolean;
  compact?: boolean;
}) {
  const padding = noPadding ? 'p-0' : compact ? 'p-4' : 'p-8';

  return (
    <div
      className={cn(
        'bg-background relative z-10 flex flex-col rounded-md border [&:has(~div[data-panel-footer])]:rounded-b-none',
        className,
        padding,
      )}
    >
      {children}
    </div>
  );
}

export function PanelSection({ children }: { children: ReactNode }) {
  return <div className="py-4 first:pt-0 last:pb-0">{children}</div>;
}

export function PanelFooter({
  children,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className="bg-surface-100 rounded-b-md border border-t-0"
      data-panel-footer
    >
      <div className="flex h-12 items-center px-4 md:px-6">{children}</div>
    </div>
  );
}
