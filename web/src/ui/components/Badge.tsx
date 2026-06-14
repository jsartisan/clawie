'use client';

import * as React from 'react';
import { tv, type VariantProps } from 'tailwind-variants';
import { Link as AriaLink, composeRenderProps } from 'react-aria-components';

import { wrapTextChildren } from '../lib/utils';

export const badgeVariants = tv({
  base: 'inline-flex items-center border-overlay justify-center rounded-full font-medium w-fit whitespace-nowrap shrink-0 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
  variants: {
    variant: {
      default: 'bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
      secondary:
        'bg-muted text-secondary-foreground [a&]:hover:bg-secondary/90',
      destructive:
        'bg-destructive/10 text-destructive [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
      success:
        '  bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 [a&]:hover:bg-green-200 dark:[a&]:hover:bg-green-800',
      warning:
        'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 [a&]:hover:bg-orange-200 dark:[a&]:hover:bg-orange-800',
      info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 [a&]:hover:bg-blue-200 dark:[a&]:hover:bg-blue-800',
      outline:
        'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
      glass: 'bg-black/15 backdrop-blur-md text-white [a&]:hover:bg-black/25',
    },
    size: {
      default: 'px-2 h-5 text-xs [&>svg]:size-3',
      sm: 'px-1.5 h-5 text-[10px] [&>svg]:size-2.5',
      lg: 'px-3.5 h-7 text-sm [&>svg]:size-3.5',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

export function Badge({
  children,
  className,
  size,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={badgeVariants({ variant, size, className })}
      {...props}
    >
      {wrapTextChildren(children)}
    </span>
  );
}

export function BadgeLink({
  className,
  size,
  variant,
  ...props
}: React.ComponentProps<typeof AriaLink> & VariantProps<typeof badgeVariants>) {
  return (
    <AriaLink
      data-slot="badge-link"
      className={composeRenderProps(className, (className) =>
        badgeVariants({ variant, size, className }),
      )}
      {...props}
    />
  );
}
