'use client';

import React from 'react';
import { createLink } from '@tanstack/react-router';
import { tv, type VariantProps } from 'tailwind-variants';
import {
  Link as AriaLink,
  LinkProps as AriaLinkProps,
  composeRenderProps,
} from 'react-aria-components';

import { focusRing } from '../lib/utils';

interface LinkProps extends AriaLinkProps, VariantProps<typeof styles> {}

export const styles = tv({
  extend: focusRing,
  base: 'rounded-xs text-sm font-medium underline decoration-current transition disabled:cursor-default disabled:no-underline forced-colors:disabled:text-[GrayText]',
  variants: {
    variant: {
      default: 'text-blue-600 underline dark:text-blue-500',
      vanilla: 'text-foreground',
      subtle:
        'text-muted-foreground hover:text-accent-foreground no-underline outline-none',
      transparent: 'no-underline outline-none hover:opacity-80',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export function _Link(props: LinkProps) {
  return (
    <AriaLink
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        styles({ ...renderProps, className, variant: props.variant }),
      )}
    />
  );
}

export const Link = createLink(_Link);
