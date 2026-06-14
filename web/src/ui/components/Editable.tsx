'use client';

import * as React from 'react';
import {
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
} from 'react-aria-components';

import { cn } from '../lib/utils';
import { inputStyles, type InputSize } from './Input';

/* -------------------------------------------------------------------------------------------------
 * Context
 * -------------------------------------------------------------------------------------------------*/

interface EditableContextValue {
  editing: boolean;
  value: string;
  disabled: boolean;
  readOnly: boolean;
  autosize: boolean;
  inputSize: InputSize;
  inputId: string;
  placeholder: string;
  onEdit: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  onChange: (value: string) => void;
}

const EditableContext = React.createContext<EditableContextValue | null>(null);

function useEditableContext(consumer: string) {
  const ctx = React.useContext(EditableContext);
  if (!ctx) throw new Error(`<${consumer}> must be used within <Editable>`);
  return ctx;
}

/* -------------------------------------------------------------------------------------------------
 * Editable (root)
 * -------------------------------------------------------------------------------------------------*/

interface EditableProps extends Omit<React.ComponentProps<'div'>, 'onSubmit'> {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  defaultEditing?: boolean;
  onSubmit?: (value: string) => void;
  onCancel?: () => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  autosize?: boolean;
  inputSize?: InputSize;
}

function Editable({
  autosize = true,
  children,
  className,
  defaultEditing = false,
  defaultValue = '',
  disabled = false,
  inputSize = 'default',
  onCancel: onCancelProp,
  onSubmit: onSubmitProp,
  onValueChange,
  placeholder = 'Click to edit',
  readOnly = false,
  value: valueProp,
  ...props
}: EditableProps) {
  const inputId = React.useId();
  const isControlled = valueProp !== undefined;
  const [editing, setEditing] = React.useState(defaultEditing);
  const [draftValue, setDraftValue] = React.useState(valueProp ?? defaultValue);
  const previousValueRef = React.useRef(valueProp ?? defaultValue);

  // Always display draftValue — sync from prop only when the prop itself changes
  React.useEffect(() => {
    if (isControlled) {
      setDraftValue(valueProp);
    }
  }, [valueProp, isControlled]);

  const onChange = React.useCallback(
    (next: string) => {
      setDraftValue(next);
      onValueChange?.(next);
    },
    [onValueChange],
  );

  const onEdit = React.useCallback(() => {
    if (disabled || readOnly) return;
    previousValueRef.current = draftValue;
    setDraftValue(draftValue);
    setEditing(true);
  }, [disabled, readOnly, draftValue]);

  const onCancel = React.useCallback(() => {
    const prev = previousValueRef.current;
    setDraftValue(prev);
    setEditing(false);
    onCancelProp?.();
  }, [onCancelProp]);

  const onSubmit = React.useCallback(() => {
    setEditing(false);
    onSubmitProp?.(draftValue);
  }, [draftValue, onSubmitProp]);

  const ctx = React.useMemo<EditableContextValue>(
    () => ({
      editing,
      value: draftValue,
      disabled,
      readOnly,
      autosize,
      inputSize,
      inputId,
      placeholder,
      onEdit,
      onCancel,
      onSubmit,
      onChange,
    }),
    [
      editing,
      draftValue,
      disabled,
      readOnly,
      autosize,
      inputSize,
      inputId,
      placeholder,
      onEdit,
      onCancel,
      onSubmit,
      onChange,
    ],
  );

  return (
    <EditableContext.Provider value={ctx}>
      <div
        data-slot="editable"
        data-editing={editing ? '' : undefined}
        data-disabled={disabled ? '' : undefined}
        {...props}
        className={cn('inline-flex min-w-0 items-center', className)}
      >
        {children}
      </div>
    </EditableContext.Provider>
  );
}

/* -------------------------------------------------------------------------------------------------
 * EditablePreview
 * -------------------------------------------------------------------------------------------------*/

type EditablePreviewProps = Omit<React.ComponentProps<'input'>, 'size'>;

function EditablePreview({ className, ...props }: EditablePreviewProps) {
  const ctx = useEditableContext('EditablePreview');
  const previewRef = React.useRef<HTMLInputElement>(null);

  // Autosize preview to match content width
  React.useEffect(() => {
    if (ctx.editing || !ctx.autosize || !previewRef.current) return;
    const el = previewRef.current;
    el.style.width = '0';
    el.style.width = `${el.scrollWidth + 4}px`;
  }, [ctx.value, ctx.editing, ctx.autosize]);

  if (ctx.editing) return null;

  return (
    <input
      readOnly
      tabIndex={ctx.disabled ? undefined : 0}
      data-slot="editable-preview"
      data-empty={!ctx.value ? '' : undefined}
      data-disabled={ctx.disabled ? '' : undefined}
      data-readonly={ctx.readOnly ? '' : undefined}
      size={ctx.autosize ? 1 : undefined}
      value={ctx.value || ctx.placeholder}
      {...props}
      ref={previewRef}
      onClick={() => ctx.onEdit()}
      onFocus={() => ctx.onEdit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') ctx.onEdit();
      }}
      className={cn(
        inputStyles({ size: ctx.inputSize }),
        'hover:shadow-50 hover:bg-background cursor-text border-transparent bg-transparent px-0.5 shadow-none',
        ctx.autosize && 'w-auto',
        className,
      )}
    />
  );
}

/* -------------------------------------------------------------------------------------------------
 * EditableInput
 * -------------------------------------------------------------------------------------------------*/

interface EditableInputProps extends Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'size'
> {
  autoSelect?: boolean;
}

function EditableInput({
  autoSelect = true,
  className,
  ...props
}: EditableInputProps) {
  const ctx = useEditableContext('EditableInput');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const resizeInput = React.useCallback(
    (el: HTMLInputElement) => {
      if (!ctx.autosize) return;
      el.style.width = '0';
      el.style.width = `${el.scrollWidth + 4}px`;
    },
    [ctx.autosize],
  );

  React.useEffect(() => {
    if (!ctx.editing || !inputRef.current) return;

    const frame = requestAnimationFrame(() => {
      if (!inputRef.current) return;
      inputRef.current.focus();
      if (autoSelect) inputRef.current.select();
      resizeInput(inputRef.current);
    });

    return () => cancelAnimationFrame(frame);
  }, [ctx.editing, autoSelect, resizeInput]);

  if (!ctx.editing) return null;

  return (
    <input
      data-slot="editable-input"
      id={ctx.inputId}
      placeholder={ctx.placeholder}
      size={ctx.autosize ? 1 : undefined}
      {...props}
      ref={inputRef}
      value={ctx.value}
      disabled={ctx.disabled}
      readOnly={ctx.readOnly}
      onChange={(e) => {
        ctx.onChange(e.target.value);
        resizeInput(e.target);
      }}
      onBlur={(e) => {
        const related = e.relatedTarget;
        if (
          related instanceof HTMLElement &&
          related.closest('[data-slot="editable"]')
        ) {
          return;
        }
        ctx.onSubmit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          ctx.onSubmit();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          ctx.onCancel();
        }
      }}
      className={cn(
        inputStyles({ size: ctx.inputSize }),
        'px-0.5',
        ctx.autosize ? 'w-auto min-w-16' : 'w-full',
        className,
      )}
    />
  );
}

/* -------------------------------------------------------------------------------------------------
 * EditableCancel
 * -------------------------------------------------------------------------------------------------*/

type EditableCancelProps = AriaButtonProps;

function EditableCancel({ className, ...props }: EditableCancelProps) {
  const ctx = useEditableContext('EditableCancel');

  if (!ctx.editing) return null;

  return (
    <AriaButton
      data-slot="editable-cancel"
      {...props}
      onPress={() => ctx.onCancel()}
      className={cn('cursor-default', className)}
    />
  );
}

/* -------------------------------------------------------------------------------------------------
 * EditableSubmit
 * -------------------------------------------------------------------------------------------------*/

type EditableSubmitProps = AriaButtonProps;

function EditableSubmit({ className, ...props }: EditableSubmitProps) {
  const ctx = useEditableContext('EditableSubmit');

  if (!ctx.editing) return null;

  return (
    <AriaButton
      data-slot="editable-submit"
      {...props}
      onPress={() => ctx.onSubmit()}
      className={cn('cursor-default', className)}
    />
  );
}

/* -------------------------------------------------------------------------------------------------
 * Exports
 * -------------------------------------------------------------------------------------------------*/

export {
  Editable,
  EditablePreview,
  EditableInput,
  EditableCancel,
  EditableSubmit,
  type EditableProps,
  type EditablePreviewProps,
  type EditableInputProps,
  type EditableCancelProps,
  type EditableSubmitProps,
};
