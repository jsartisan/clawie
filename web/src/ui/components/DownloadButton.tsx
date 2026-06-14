import type { ReactNode } from 'react';

import { IconDownload } from '@tabler/icons-react';

import { Icon } from './Icon';
import { downloadFile } from '../lib/downloadFile';
import { Button, type ButtonProps } from './Button';

interface DownloadButtonProps extends Omit<ButtonProps, 'onPress'> {
  url: string;
  filename?: string;
  label?: string;
  children?: ReactNode;
}

export function DownloadButton({
  children,
  filename,
  label,
  size = 'icon-sm',
  url,
  variant = 'outline',
  ...rest
}: DownloadButtonProps) {
  return (
    <Button
      {...rest}
      variant={variant}
      size={size}
      onPress={() => downloadFile(url, filename)}
    >
      {children ?? (
        <>
          <Icon icon={IconDownload} size="sm" />
          {label}
        </>
      )}
    </Button>
  );
}
