'use client';

import * as React from 'react';
import { tv, type VariantProps } from 'tailwind-variants';
import { composeRenderProps, Group, GroupProps } from 'react-aria-components';

import { cn } from '../lib/utils';
import { Button } from './Button';
import { Textarea } from './Textarea';
import { Input, type InputSize } from './Input';

// ─── Size Context ────────────────────────────────────────────────────────────

const InputGroupSizeContext = React.createContext<InputSize>('default');

function useInputGroupSize() {
  return React.useContext(InputGroupSizeContext);
}

// ─── InputGroup ──────────────────────────────────────────────────────────────

const inputGroupVariants = tv({
  base: [
    'group/input-group relative flex w-full items-center rounded-md border transition-[color] outline-none',
    'min-w-0 has-[>textarea]:h-auto',

    // Variants based on alignment.
    'has-[>[data-align=inline-start]]:[&>input]:pl-2',
    'has-[>[data-align=inline-end]]:[&>input]:pr-2',
    'has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>[data-align=block-start]]:[&>input]:pb-3',
    'has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-end]]:[&>input]:pt-3',

    // Focus state.
    'has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50 has-[[data-slot=input-group-control]:focus-visible]:ring-2',
    // Focus within state ( needed for date picker inside input group )
    'has-[[data-slot=input-group-control]:focus-within]:border-ring has-[[data-slot=input-group-control]:focus-within]:ring-ring/50 has-[[data-slot=input-group-control]:focus-within]:ring-2',

    // Error state.
    'has-[[data-slot][aria-invalid=true]]:ring-destructive/20 has-[[data-slot][aria-invalid=true]]:border-destructive dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40',
  ],
  variants: {
    size: {
      sm: 'h-7',
      default: 'h-8',
      lg: 'h-9',
    },
    variant: {
      default: 'border-input bg-input shadow-100',
      subtle:
        'border-transparent bg-muted shadow-none has-[[data-slot=input-group-control]:focus]:bg-background dark:has-[[data-slot=input-group-control]:focus]:bg-input/30',
    },
  },
  defaultVariants: {
    size: 'default',
    variant: 'default',
  },
});

export type InputGroupProps = GroupProps &
  Pick<VariantProps<typeof inputGroupVariants>, 'size' | 'variant'>;

function InputGroup({
  className,
  size = 'default',
  variant = 'default',
  ...props
}: InputGroupProps) {
  return (
    <InputGroupSizeContext.Provider value={size!}>
      <Group
        data-slot="input-group"
        className={composeRenderProps(className, (className, renderProps) =>
          inputGroupVariants({ ...renderProps, size, variant, className }),
        )}
        {...props}
      />
    </InputGroupSizeContext.Provider>
  );
}

// ─── InputGroupAddon ─────────────────────────────────────────────────────────

const inputGroupAddonVariants = tv({
  base: 'text-muted-foreground flex h-auto cursor-text items-center justify-center gap-2 font-medium select-none [&>kbd]:rounded-[calc(var(--radius)-5px)] group-data-[disabled=true]/input-group:opacity-50',
  variants: {
    align: {
      'inline-start':
        'order-first has-[>button]:ml-[-0.45rem] has-[>kbd]:ml-[-0.35rem]',
      'inline-end':
        'order-last has-[>button]:mr-[-0.45rem] has-[>kbd]:mr-[-0.35rem]',
      'block-start':
        'order-first w-full justify-start px-3 pt-3 [.border-b]:pb-3 group-has-[>input]/input-group:pt-2.5',
      'block-end':
        'order-last w-full justify-start px-3 pb-3 [.border-t]:pt-3 group-has-[>input]/input-group:pb-2.5',
    },
    size: {
      sm: "py-1 text-sm [&>svg:not([class*='size-'])]:size-4",
      default: "py-1.5 text-sm [&>svg:not([class*='size-'])]:size-4",
      lg: "py-2 text-base [&>svg:not([class*='size-'])]:size-4",
    },
  },
  compoundVariants: [
    { align: 'inline-start', size: 'sm', class: 'pl-2.5' },
    { align: 'inline-start', size: 'default', class: 'pl-3' },
    { align: 'inline-start', size: 'lg', class: 'pl-3.5' },
    { align: 'inline-end', size: 'sm', class: 'pr-2.5' },
    { align: 'inline-end', size: 'default', class: 'pr-3' },
    { align: 'inline-end', size: 'lg', class: 'pr-3.5' },
  ],
  defaultVariants: {
    align: 'inline-start',
    size: 'default',
  },
});

function InputGroupAddon({
  align = 'inline-start',
  className,
  ...props
}: React.ComponentProps<'div'> &
  Pick<VariantProps<typeof inputGroupAddonVariants>, 'align'>) {
  const size = useInputGroupSize();

  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={inputGroupAddonVariants({ align, size, className })}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) {
          return;
        }
        e.currentTarget.parentElement?.querySelector('input')?.focus();
      }}
      {...props}
    />
  );
}

// ─── InputGroupButton ────────────────────────────────────────────────────────

const inputGroupButtonVariants = tv({
  base: 'text-sm shadow-none flex gap-2 items-center',
  variants: {
    size: {
      xs: "h-6 gap-1 px-2 rounded-[calc(var(--radius)-5px)] [&>svg:not([class*='size-'])]:size-3.5 has-[>svg]:px-2",
      sm: 'h-8 px-2.5 gap-1.5 rounded-md has-[>svg]:px-2.5',
      'icon-xs': 'size-6 rounded-[calc(var(--radius)-5px)] p-0 has-[>svg]:p-0',
      'icon-sm': 'size-8 p-0 has-[>svg]:p-0',
    },
  },
  defaultVariants: {
    size: 'xs',
  },
});

const inputGroupButtonSizeMap: Record<InputSize, 'xs' | 'sm'> = {
  sm: 'xs',
  default: 'xs',
  lg: 'sm',
};

const inputGroupButtonIconSizeMap: Record<InputSize, 'icon-xs' | 'icon-sm'> = {
  sm: 'icon-xs',
  default: 'icon-xs',
  lg: 'icon-sm',
};

function InputGroupButton({
  className,
  isIconOnly,
  size: sizeProp,
  type = 'button',
  variant = 'ghost',
  ...props
}: Omit<React.ComponentProps<typeof Button>, 'size'> &
  VariantProps<typeof inputGroupButtonVariants> & { isIconOnly?: boolean }) {
  const groupSize = useInputGroupSize();
  const resolvedSize =
    sizeProp ??
    (isIconOnly
      ? inputGroupButtonIconSizeMap[groupSize]
      : inputGroupButtonSizeMap[groupSize]);

  return (
    <Button
      type={type}
      data-size={resolvedSize}
      variant={variant}
      className={inputGroupButtonVariants({
        size: resolvedSize,
        className: typeof className === 'string' ? className : undefined,
      })}
      {...props}
    />
  );
}

// ─── InputGroupText ──────────────────────────────────────────────────────────

function InputGroupText({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        "text-muted-foreground flex items-center gap-2 text-sm [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

// ─── InputGroupInput ─────────────────────────────────────────────────────────

export const inputGroupInputStyles = tv({
  base: 'flex-1 rounded-none border-0 bg-transparent shadow-none focus:ring-0 focus-visible:ring-0 dark:bg-transparent placeholder:align-middle',
  variants: {
    isFocusVisible: {
      true: 'ring-0 border-0',
    },
    isFocusWithin: {
      true: 'ring-0 border-0',
    },
  },
});

function InputGroupInput({
  className,
  ...props
}: React.ComponentProps<'input'>) {
  const size = useInputGroupSize();

  return (
    <Input
      inputSize={size}
      data-slot="input-group-control"
      className={composeRenderProps(className, (className, renderProps) =>
        inputGroupInputStyles({ ...renderProps, className }),
      )}
      {...props}
    />
  );
}

// ─── InputGroupTextarea ──────────────────────────────────────────────────────

function InputGroupTextarea({
  className,
  ...props
}: React.ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      data-slot="input-group-control"
      className={cn(
        'flex-1 resize-none rounded-none border-0 bg-transparent py-3 shadow-none focus-visible:ring-0 dark:bg-transparent',
        'focus:ring-0 focus-visible:ring-0',
        className,
      )}
      {...props}
    />
  );
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
};
