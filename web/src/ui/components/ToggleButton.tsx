'use client';

import React from 'react';
import { tv } from 'tailwind-variants';
import {
  ToggleButton as AriaToggleButton,
  ToggleButtonProps as AriaToggleButtonProps,
  composeRenderProps,
} from 'react-aria-components';

import { focusRing } from '../lib/utils';

export interface ToggleButtonProps extends AriaToggleButtonProps {
  /** @default 'default' */
  variant?: 'default';
  /** @default 'default' */
  size?:
    | 'default'
    | 'xs'
    | 'sm'
    | 'lg'
    | 'icon'
    | 'icon-xs'
    | 'icon-sm'
    | 'icon-lg';
}

export const toggleButtonVariants = tv({
  extend: focusRing,
  base: "inline-flex cursor-default items-center justify-center gap-2 rounded-md border-transparent text-sm font-medium whitespace-nowrap transition-colors outline-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  variants: {
    variant: {
      default:
        'hover:bg-muted selected:bg-secondary/40 selected:shadow-inset-200 selected:bg-accent',
    },
    size: {
      default: 'h-8 min-w-8 px-3 has-[>svg]:px-3',
      xs: 'h-6 min-w-6 gap-1.5 text-xs rounded-sm px-1.5 has-[>svg]:px-2.5',
      sm: 'h-7 min-w-7 gap-1.5 rounded-md px-2.5 has-[>svg]:px-2.5 text-xs',
      lg: 'h-9 min-w-9 px-2.5 has-[>svg]:px-4',
      icon: 'size-8',
      'icon-xs': 'size-6 rounded-md',
      'icon-sm': 'size-7 rounded-md',
      'icon-lg': 'size-9',
    },
    isDisabled: {
      true: 'pointer-events-none opacity-50',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

export function ToggleButton(props: ToggleButtonProps) {
  return (
    <AriaToggleButton
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        toggleButtonVariants({
          ...renderProps,
          variant: props.variant,
          size: props.size,
          className,
        }),
      )}
    />
  );
}
