'use client';
import React from 'react';
import { toast, Toaster as _Toaster, ToastClassnames } from 'sonner';

export const toastOptions: ToastClassnames = {
  toast: '!bg-background !text-foreground !shadow-xs !border !border-border',
  title: '!text-foreground',
  description: 'description',
  actionButton: 'action-button',
  cancelButton: 'cancel-button',
  closeButton: 'close-button',
};

const Toaster = () => {
  return (
    <_Toaster
      position="top-center"
      toastOptions={{
        classNames: toastOptions,
      }}
    />
  );
};

export { toast, Toaster };
