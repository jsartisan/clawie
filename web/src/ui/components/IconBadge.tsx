import * as React from 'react';
import { tv, type VariantProps } from 'tailwind-variants';

export const iconBadgeVariants = tv({
  base: 'flex shrink-0 items-center justify-center rounded-lg [&_svg]:pointer-events-none [&_svg]:shrink-0',
  variants: {
    variant: {
      subtle: 'bg-muted text-foreground',
      primary: 'bg-primary text-primary-foreground',
      info: 'bg-info/20 text-foreground border-overlay',
      warning: 'bg-warning/20 text-foreground border-overlay',
      outline: 'border-overlay text-foreground',
    },
    size: {
      xxs: 'size-5',
      xs: 'size-6',
      sm: 'size-7 rounded-sm',
      default: 'size-9',
      lg: 'size-10',
    },
  },
  defaultVariants: {
    variant: 'subtle',
    size: 'default',
  },
});

export function IconBadge({
  className,
  size,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof iconBadgeVariants>) {
  return (
    <div
      data-slot="icon-badge"
      className={iconBadgeVariants({ variant, size, className })}
      {...props}
    />
  );
}
