'use client';

import * as React from 'react';
import { tv, type VariantProps } from 'tailwind-variants';

import { cn } from '../lib/utils';

// Full-width notice bar primitive. Callers compose their own icon + copy
// + CTA via children so this stays purely visual — no coupling to
// navigation, mutations, or feature flags. Pair with BannerMessage for
// the left-hand icon+text block when you want consistent spacing.

const bannerVariants = tv({
  base: 'flex w-full items-center justify-between gap-3 px-6 py-2 text-sm',
  variants: {
    variant: {
      destructive: 'bg-destructive text-white',
      warning: 'bg-orange-500 text-white',
      info: 'bg-blue-600 text-white',
      success: 'bg-green-600 text-white',
    },
  },
  defaultVariants: {
    variant: 'destructive',
  },
});

export interface BannerProps
  extends React.ComponentProps<'div'>, VariantProps<typeof bannerVariants> {}

export function Banner({
  children,
  className,
  variant,
  ...props
}: BannerProps) {
  return (
    <div
      data-slot="banner"
      role="status"
      className={bannerVariants({ variant, className })}
      {...props}
    >
      {children}
    </div>
  );
}

export function BannerMessage({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="banner-message"
      className={cn('flex items-center gap-2', className)}
      {...props}
    />
  );
}
