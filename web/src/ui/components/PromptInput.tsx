import {
  useState,
  type ComponentProps,

  type HTMLAttributes,
  type KeyboardEventHandler,
} from 'react';
import { IconSend } from '@tabler/icons-react';

import { cn } from '../lib/utils';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from './InputGroup';

// ── PromptInput ──────────────────────────────────────────────────────────────

export type PromptInputProps = Omit<HTMLAttributes<HTMLFormElement>, 'onSubmit'> & {
  onSubmit?: () => void;
};

export const PromptInput = ({ className, children, onSubmit, ...props }: PromptInputProps) => (
  <form
    className={cn('w-full', className)}
    onSubmit={(e) => {
      e.preventDefault();
      onSubmit?.();
    }}
    {...props}
  >
    <InputGroup className="h-auto">{children}</InputGroup>
  </form>
);

// ── PromptInputBody ──────────────────────────────────────────────────────────

export type PromptInputBodyProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputBody = ({ className, ...props }: PromptInputBodyProps) => (
  <div className={cn('contents', className)} {...props} />
);

// ── PromptInputTextarea ──────────────────────────────────────────────────────

export type PromptInputTextareaProps = ComponentProps<typeof InputGroupTextarea>;

export const PromptInputTextarea = ({
  onKeyDown,
  className,
  placeholder = 'What would you like to know?',
  ...props
}: PromptInputTextareaProps) => {
  const [isComposing, setIsComposing] = useState(false);

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === 'Enter' && !isComposing && !e.nativeEvent.isComposing && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
    onKeyDown?.(e);
  };

  return (
    <InputGroupTextarea
      className={cn('field-sizing-content max-h-48 min-h-10', className)}
      name="message"
      onCompositionStart={() => setIsComposing(true)}
      onCompositionEnd={() => setIsComposing(false)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      {...props}
    />
  );
};

// ── PromptInputFooter ────────────────────────────────────────────────────────

export type PromptInputFooterProps = Omit<ComponentProps<typeof InputGroupAddon>, 'align'>;

export const PromptInputFooter = ({ className, ...props }: PromptInputFooterProps) => (
  <InputGroupAddon align="block-end" className={cn('justify-between gap-1', className)} {...props} />
);

// ── PromptInputTools ─────────────────────────────────────────────────────────

export type PromptInputToolsProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputTools = ({ className, ...props }: PromptInputToolsProps) => (
  <div className={cn('flex items-center gap-1', className)} {...props} />
);

// ── PromptInputButton ────────────────────────────────────────────────────────

export type PromptInputButtonProps = ComponentProps<typeof InputGroupButton>;

export const PromptInputButton = ({ ...props }: PromptInputButtonProps) => (
  <InputGroupButton {...props} />
);

// ── PromptInputSubmit ────────────────────────────────────────────────────────

export type PromptInputSubmitProps = ComponentProps<typeof InputGroupButton>;

export const PromptInputSubmit = ({
  className,
  variant = 'default',
  size = 'icon-sm',
  children,
  ...props
}: PromptInputSubmitProps) => (
  <InputGroupButton
    aria-label="Submit"
    className={cn(className)}
    size={size}
    type="submit"
    variant={variant}
    {...props}
  >
    {children ?? <IconSend className="size-4" />}
  </InputGroupButton>
);
