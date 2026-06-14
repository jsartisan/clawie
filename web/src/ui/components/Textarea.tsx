'use client';

import * as React from 'react';
import { tv, type VariantProps } from 'tailwind-variants';
import { TextArea as RACTextarea } from 'react-aria-components';

import { cn } from '../lib/utils';

export const textareaStyles = tv({
  base: 'placeholder:text-muted-foreground text-foreground focus-visible:border-ring resize-none focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex field-sizing-content min-h-16 w-full rounded-md px-3 py-2 text-base transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus:border-ring focus:ring-ring/50 focus:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
  variants: {
    variant: {
      default: 'border-input bg-background shadow-100',
      subtle:
        'border-transparent bg-muted shadow-none focus:bg-background dark:focus:bg-input/30',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export type TextareaVariant = NonNullable<
  VariantProps<typeof textareaStyles>['variant']
>;

export interface TextareaProps extends React.ComponentProps<'textarea'> {
  variant?: TextareaVariant;
}

function Textarea({ className, variant, ...props }: TextareaProps) {
  return (
    <RACTextarea
      data-slot="textarea"
      className={cn(textareaStyles({ variant }), className)}
      {...props}
    />
  );
}

export { Textarea };
