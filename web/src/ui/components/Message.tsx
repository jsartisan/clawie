import type { HTMLAttributes } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';

import { cn } from '../lib/utils';
import { Avatar } from './Avatar';

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: 'user' | 'assistant' | 'system';
};

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      'group flex w-full flex-col items-end gap-2',
      from === 'user' ? 'is-user' : 'is-assistant items-start',
      className,
    )}
    {...props}
  />
);

const messageContentVariants = tv({
  base: 'flex flex-col gap-2 overflow-hidden rounded-lg text-sm',
  variants: {
    variant: {
      contained: [
        'max-w-[80%] px-4 py-3',
        'group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground',
        'group-[.is-assistant]:w-full group-[.is-assistant]:max-w-full',
      ],
      flat: [
        'group-[.is-user]:max-w-[80%] group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground',
        'group-[.is-assistant]:w-full group-[.is-assistant]:max-w-full',
      ],
    },
  },
  defaultVariants: {
    variant: 'contained',
  },
});

export type MessageContentProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof messageContentVariants>;

export const MessageContent = ({ children, className, variant, ...props }: MessageContentProps) => (
  <div className={messageContentVariants({ variant, className })} {...props}>
    {children}
  </div>
);

export type MessageAvatarProps = {
  name: string;
  className?: string;
};

export const MessageAvatar = ({ name, className }: MessageAvatarProps) => (
  <Avatar name={name} identity size="sm" className={cn('shrink-0', className)} />
);
