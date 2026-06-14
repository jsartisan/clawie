import { forwardRef, HTMLAttributes } from 'react';

import { cn } from '../lib/utils';

export const MAX_WIDTH_CLASSES = 'mx-auto w-full max-w-[1200px]';
export const PADDING_CLASSES = 'px-4 @lg:px-6 @xl:px-12 @2xl:px-20 @3xl:px-24';
export const MAX_WIDTH_CLASSES_COLUMN = 'min-w-[420px]';

export const ScaffoldContainer = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & {
    bottomPadding?: boolean;
    size?: 'small' | 'default' | 'large' | 'full';
  }
>(({ bottomPadding, className, size = 'default', ...props }, ref) => {
  const maxWidthClass = {
    small: 'max-w-[768px]',
    default: 'max-w-[1200px]',
    large: 'max-w-[1600px]',
    full: 'max-w-none',
  }[size];

  return (
    <div
      ref={ref}
      {...props}
      className={cn(
        'mx-auto w-full',
        maxWidthClass,
        size === 'full' ? 'px-4' : PADDING_CLASSES,
        bottomPadding && 'pb-4',
        className,
      )}
      data-size={size}
    />
  );
});

export const ScaffoldHeader = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <header
      {...props}
      ref={ref}
      className={cn('w-full', 'flex-col gap-3 py-6', className)}
    />
  );
});

export const ScaffoldTitle = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => {
  return (
    <h1
      ref={ref}
      {...props}
      className={cn('text-lg font-semibold', className)}
    />
  );
});

export const ScaffoldDescription = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => {
  return (
    <p
      ref={ref}
      {...props}
      className={cn('text-muted-foreground text-sm', className)}
    />
  );
});

export const ScaffoldSection = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { isFullWidth?: boolean }
>(({ className, isFullWidth, ...props }, ref) => {
  return (
    <div
      ref={ref}
      {...props}
      className={cn(
        'flex flex-col',
        isFullWidth ? 'w-full' : 'gap-3 md:grid-cols-12 lg:grid',
        className,
      )}
    />
  );
});

export const ScaffoldDivider = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      {...props}
      className={cn('bg-border h-px w-full', className)}
    />
  );
});

export const ScaffoldSectionTitle = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => {
  return (
    <h3
      ref={ref}
      {...props}
      className={cn('text-foreground text-xl', className)}
    />
  );
});

export const ScaffoldSectionDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  return (
    <p
      ref={ref}
      {...props}
      className={cn('text-foreground-light text-sm', className)}
    />
  );
});

export const ScaffoldSectionDetail = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ children, className, title, ...props }, ref) => {
  return (
    <div
      ref={ref}
      {...props}
      className={cn('prose col-span-4 text-sm xl:col-span-5', className)}
    >
      {title && <h2>{title}</h2>}
      {children}
    </div>
  );
});

export const ScaffoldSectionContent = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      {...props}
      className={cn(
        'col-span-8 xl:col-span-7',
        'flex flex-col gap-6',
        className,
      )}
    />
  );
});

export const ScaffoldFilterAndContent = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      {...props}
      className={cn('flex flex-col items-center gap-3', className)}
    />
  );
});

export const ScaffoldActionsContainer = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      {...props}
      className={cn('flex w-full items-center', className)}
    />
  );
});

export const ScaffoldActionsGroup = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      {...props}
      className={cn('flex flex-row gap-3', className)}
    />
  );
});

export const ScaffoldColumn = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      {...props}
      className={cn('flex flex-col gap-3', MAX_WIDTH_CLASSES_COLUMN, className)}
    />
  );
});

/**
 * @deprecated Use ScaffoldContainer instead
 */
export const ScaffoldContainerLegacy = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      {...props}
      className={cn(
        MAX_WIDTH_CLASSES,
        PADDING_CLASSES,
        'my-8 flex flex-col gap-8',
        className,
      )}
    />
  );
});

ScaffoldHeader.displayName = 'ScaffoldHeader';
ScaffoldTitle.displayName = 'ScaffoldTitle';
ScaffoldDescription.displayName = 'ScaffoldDescription';
ScaffoldContainer.displayName = 'ScaffoldContainer';
ScaffoldDivider.displayName = 'ScaffoldDivider';
ScaffoldSection.displayName = 'ScaffoldSection';
ScaffoldColumn.displayName = 'ScaffoldColumn';
ScaffoldSectionDetail.displayName = 'ScaffoldSectionDetail';
ScaffoldSectionContent.displayName = 'ScaffoldSectionContent';
ScaffoldFilterAndContent.displayName = 'ScaffoldFilterAndContent';
ScaffoldActionsContainer.displayName = 'ScaffoldActionsContainer';
ScaffoldActionsGroup.displayName = 'ScaffoldActionsGroup';
ScaffoldContainerLegacy.displayName = 'ScaffoldContainerLegacy';
ScaffoldSectionTitle.displayName = 'ScaffoldSectionTitle';
ScaffoldSectionDescription.displayName = 'ScaffoldSectionDescription';
