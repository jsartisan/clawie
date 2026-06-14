'use client';

import React from 'react';
import { IconX } from '@tabler/icons-react';

import { Icon } from './Icon';
import { Modal } from './Modal';
import { Button } from './Button';
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from './Dialog';

interface ConfirmDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'destructive' | 'default';
  isPending?: boolean;
  children?: React.ReactNode;
  overlayClassName?: string;
}

export function ConfirmDialog({
  cancelLabel = 'Cancel',
  children,
  confirmLabel = 'Confirm',
  description,
  isOpen,
  isPending = false,
  onConfirm,
  onOpenChange,
  overlayClassName,
  title,
  variant = 'destructive',
}: ConfirmDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      overlayClassName={overlayClassName}
    >
      <Dialog className="w-[28rem] max-w-full">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close"
          onPress={() => onOpenChange(false)}
          className="absolute top-3 right-3"
        >
          <Icon icon={IconX} size="sm" />
        </Button>
        <DialogHeader className="pr-8">
          <DialogTitle className="text-lg">{title}</DialogTitle>
          {description && (
            <DialogDescription slot="description">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onPress={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onPress={onConfirm} isDisabled={isPending}>
            {isPending ? `${confirmLabel}...` : confirmLabel}
          </Button>
        </div>
      </Dialog>
    </Modal>
  );
}
