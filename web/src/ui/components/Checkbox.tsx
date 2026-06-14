'use client';

import { tv } from 'tailwind-variants';
import React, { type ReactNode } from 'react';
import { IconCheck, IconMinus } from '@tabler/icons-react';
import {
  CheckboxProps as RACCheckboxProps,
  composeRenderProps,
  Checkbox as RACCheckbox,
  CheckboxGroup as RACCheckboxGroup,
  CheckboxGroupProps as RACCheckboxGroupProps,
  ValidationResult,
} from 'react-aria-components';

import { cn, focusRing } from '../lib/utils';
import { FieldDescription, FieldError, FieldLabel } from './Field';

export interface CheckboxGroupProps extends Omit<
  RACCheckboxGroupProps,
  'children'
> {
  label?: string;
  children?: ReactNode;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
}

export function CheckboxGroup(props: CheckboxGroupProps) {
  return (
    <RACCheckboxGroup
      {...props}
      className={composeRenderProps(props.className, (className) =>
        cn('flex flex-col gap-3', className),
      )}
    >
      <FieldLabel>{props.label}</FieldLabel>
      {props.children}
      {props.description && (
        <FieldDescription>{props.description}</FieldDescription>
      )}
      <FieldError>{props.errorMessage}</FieldError>
    </RACCheckboxGroup>
  );
}

const checkboxStyles = tv({
  base: 'group flex items-center gap-3 text-sm leading-none font-medium transition',
  variants: {
    isDisabled: {
      false: 'text-foreground',
      true: 'cursor-not-allowed opacity-50',
    },
  },
});

const boxStyles = tv({
  extend: focusRing,
  base: 'peer grid size-4 shrink-0 place-content-center rounded-[4px] border shadow-xs transition-shadow outline-none',
  variants: {
    isSelected: {
      false: 'bg-card',
      true: 'border-black/10 bg-primary text-primary-foreground',
    },
    isInvalid: {
      true: 'border-destructive ring-destructive/20 ring-[3px] ',
    },
    isDisabled: {
      true: 'cursor-not-allowed opacity-50',
    },
  },
});

const iconStyles = 'size-3.5 text-current transition-none';

export type CheckboxProps = RACCheckboxProps;

export function Checkbox(props: CheckboxProps) {
  return (
    <RACCheckbox
      {...props}
      data-slot="checkbox"
      className={composeRenderProps(props.className, (className, renderProps) =>
        checkboxStyles({ ...renderProps, className }),
      )}
    >
      {({ isIndeterminate, isSelected, ...renderProps }) => (
        <>
          <div
            data-slot="checkbox-indicator"
            className={boxStyles({
              isSelected: isSelected || isIndeterminate,
              ...renderProps,
            })}
          >
            {isIndeterminate ? (
              <IconMinus aria-hidden className={iconStyles} />
            ) : isSelected ? (
              <IconCheck aria-hidden className={iconStyles} />
            ) : null}
          </div>
          {props.children}
        </>
      )}
    </RACCheckbox>
  );
}
