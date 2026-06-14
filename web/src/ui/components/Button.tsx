'use client';

import { tv, VariantProps } from 'tailwind-variants';
import {
  Button as AriaButton,
  composeRenderProps,
  ButtonProps as RACButtonProps,
} from 'react-aria-components';

import { Spinner } from './Spinner';
import { focusRing, wrapTextChildren } from '../lib/utils';

export interface ButtonProps extends RACButtonProps {
  /** @default 'default' */
  variant?: VariantProps<typeof buttonVariants>['variant'];
  /** @default 'default' */
  size?: VariantProps<typeof buttonVariants>['size'];
}

export const buttonVariants = tv({
  extend: focusRing,
  base: 'group relative cursor-pointer select-none inline-flex shrink-0 items-center pressed:translate-y-px justify-center gap-2 overflow-hidden rounded-md font-medium whitespace-nowrap transition-[background-color,box-shadow,transform,border-color,opacity] outline-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4 active:[&_svg]:scale-95',
  variants: {
    variant: {
      default:
        'bg-primary text-primary-foreground hover:bg-primary/90 shadow-button-default',
      destructive:
        'bg-destructive hover:bg-destructive text-white shadow-button-destructive',
      outline:
        'text-foreground selected:bg-secondary bg-card border-border hover:bg-accent hover:text-accent-foreground shadow-100 pressed:shadow-inset-100 pressed:bg-foreground/3',
      secondary:
        'bg-secondary text-secondary-foreground hover:bg-secondary/80 pressed:shadow-inset-100',
      ghost:
        'hover:bg-secondary/40 text-foreground hover:text-accent-foreground pressed:shadow-inset-100 pressed:bg-secondary/40',
      link: 'text-primary underline-offset-4 hover:underline text-sm hover:[&_svg]:translate-x-1 hover:[&_svg]:scale-100',
      subtle:
        'bg-muted hover:bg-muted/90 text-muted-foreground hover:text-accent-foreground pressed:shadow-inset-100 pressed:bg-secondary/40',
      input:
        'bg-input hover:bg-input/90 text-muted-foreground hover:text-accent-foreground pressed:shadow-inset-100 pressed:bg-secondary/40',
      success:
        'bg-success text-success-foreground hover:bg-sucess/90 shadow-button-primary-success',
      glass:
        'bg-black/15 backdrop-blur-md text-white hover:bg-black/25 pressed:bg-black/30',
    },
    size: {
      default: 'h-8 px-4 py-2 has-[>svg]:px-3 text-sm',
      xs: 'h-6 gap-1.5 text-xs rounded-sm px-2 has-[>svg]:px-2.5 has-[>svg]:pr-3',
      sm: 'h-7 gap-1.5 rounded-md px-2 text-sm has-[>svg]:pr-2.5',
      lg: 'h-11 rounded-lg px-6 has-[>svg]:px-4 has-[>svg]:pr-5',
      icon: 'size-8',
      'icon-xxs': 'size-4 rounded',
      'icon-xs': 'size-6 rounded-md text-xs',
      'icon-sm': 'size-7 rounded-md',
      'icon-lg': 'size-11',
    },
    isDisabled: {
      true: 'pointer-events-none opacity-50',
    },
    isPending: {
      true: 'text-transparent',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

const spinnerVariantStyles = tv({
  variants: {
    variant: {
      default: 'text-primary-foreground',
      primary: 'text-primary-foreground',
      secondary: 'text-secondary-foreground',
      destructive: 'text-destructive-foreground',
      outline: 'text-primary',
      ghost: 'text-foreground',
      link: 'text-primary',
      subtle: 'text-primary',
      success: 'text-success-foreground',
      glass: 'text-white',
      input: 'text-muted-foreground',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export function Button(props: ButtonProps) {
  const { isPending } = props;

  return (
    <AriaButton
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        buttonVariants({
          ...renderProps,
          variant: props.variant,
          size: props.size,
          className,
        }),
      )}
    >
      {composeRenderProps(props.children, (children) => (
        <>
          {isPending && (
            <span className="absolute inset-0 flex items-center justify-center bg-inherit">
              <Spinner
                size={props.size === 'icon-xxs' ? 'xxs' : 'sm'}
                className={spinnerVariantStyles({ variant: props.variant })}
              />
            </span>
          )}
          {wrapTextChildren(children)}
        </>
      ))}
    </AriaButton>
  );
}
