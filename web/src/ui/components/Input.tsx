'use client';

import { tv, type VariantProps } from 'tailwind-variants';
import {
  composeRenderProps,
  InputProps as RACInputProps,
  Input as RACInput,
} from 'react-aria-components';

export const inputStyles = tv({
  base: [
    'file:text-foreground text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input w-full min-w-0 rounded-md bg-background shadow-100 transition-[color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-background file:text-sm file:font-medium [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none',
  ],
  variants: {
    size: {
      sm: 'h-7 px-2.5 py-1 text-sm',
      default: 'h-8 px-3 py-1 text-base md:text-sm',
      lg: 'h-9 px-3.5 py-1.5 text-base',
    },
    isDisabled: {
      true: 'pointer-events-none cursor-not-allowed opacity-50',
    },
    isFocusVisible: {
      true: 'border-ring ring-ring/50 ring-2',
    },
    isFocused: {
      true: 'border-ring ring-ring/50 z-10 ring-2',
    },
    isInvalid: {
      true: 'ring-destructive/20 dark:ring-destructive/40 border-destructive',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

export type InputSize = NonNullable<VariantProps<typeof inputStyles>['size']>;

export interface InputProps extends RACInputProps {
  inputSize?: InputSize;
}

function Input({ className, inputSize, type, ...props }: InputProps) {
  return (
    <RACInput
      type={type}
      data-slot="input"
      className={composeRenderProps(className, (className, renderProps) =>
        inputStyles({ ...renderProps, size: inputSize, className }),
      )}
      {...props}
    />
  );
}

export { Input };
