'use client';

import React from 'react';
import { tv } from 'tailwind-variants';
import {
  composeRenderProps,
  ModalOverlay,
  ModalOverlayProps,
  Modal as RACModal,
} from 'react-aria-components';

import { cn } from '../lib/utils';

const overlayStyles = tv({
  base: 'absolute top-0 left-0 isolate z-20 h-(--page-height) w-full bg-black/[50%] backdrop-blur-sm',
  variants: {
    isEntering: {
      true: 'animate-in fade-in duration-200 ease-out',
    },
    isExiting: {
      true: 'animate-out fade-out duration-200 ease-in',
    },
  },
});

const modalStyles = tv({
  base: 'bg-background max-h-[inherit] overflow-auto rounded-lg border shadow-lg outline outline-0 sm:rounded-lg',
  variants: {
    isEntering: {
      true: 'animate-in fade-in-0 zoom-in-95 duration-200',
    },
    isExiting: {
      true: 'animate-out fade-out-0 zoom-out-95 duration-200',
    },
  },
});

interface ModalProps extends Omit<ModalOverlayProps, 'className'> {
  className?: React.ComponentProps<typeof RACModal>['className'];
  overlayClassName?: ModalOverlayProps['className'];
}

export function Modal(props: ModalProps) {
  const {
    className,
    isDismissable = true,
    overlayClassName,
    ...overlayProps
  } = props;

  return (
    <ModalOverlay
      {...overlayProps}
      className={composeRenderProps(
        overlayClassName,
        (className, renderProps) => cn(overlayStyles(renderProps), className),
      )}
      isDismissable={isDismissable}
    >
      <div className="sticky top-0 left-0 box-border flex h-(--visual-viewport-height) w-full items-center justify-center p-4">
        <RACModal
          className={composeRenderProps(className, (className, renderProps) =>
            cn(modalStyles(renderProps), className),
          )}
        >
          {overlayProps.children}
        </RACModal>
      </div>
    </ModalOverlay>
  );
}
