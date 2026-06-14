'use client';
import { IconLoader } from '@tabler/icons-react';

import { cn } from '../lib/utils';
import { Icon, type IconProps } from './Icon';

export type SpinnerProps = Omit<IconProps, 'icon'>;

export function Spinner({ className, ...props }: SpinnerProps) {
  return (
    <Icon
      {...props}
      icon={IconLoader}
      className={cn('animate-spin', className)}
    />
  );
}
