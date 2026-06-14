'use client';

import React from 'react';
import { VariantProps } from 'tailwind-variants';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import {
  NumberField as AriaNumberField,
  NumberFieldProps as AriaNumberFieldProps,
  Button,
  ButtonProps,
  ValidationResult,
} from 'react-aria-components';

import { Icon } from './Icon';
import { cn } from '../lib/utils';
import { InputGroup, InputGroupInput } from './InputGroup';
import {
  FieldDescription,
  FieldError,
  FieldLabel,
  fieldVariants,
} from './Field';

export interface NumberFieldProps
  extends AriaNumberFieldProps, VariantProps<typeof fieldVariants> {
  label?: string;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
}

export function NumberField({
  description,
  errorMessage,
  label,
  orientation = 'vertical',
  ...props
}: NumberFieldProps) {
  return (
    <AriaNumberField {...props} className={fieldVariants({ orientation })}>
      <FieldLabel>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput />
        <div className="grid h-full grid-rows-[1fr_1px_1fr] flex-col rounded-r-[inherit] border-s">
          <StepperButton slot="increment" className="rounded-tr-[inherit]">
            <Icon icon={IconChevronUp} aria-hidden size="xs" />
          </StepperButton>
          <div className="border-b" />
          <StepperButton slot="decrement" className="rounded-br-[inherit]">
            <Icon icon={IconChevronDown} aria-hidden size="xs" />
          </StepperButton>
        </div>
      </InputGroup>

      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{errorMessage}</FieldError>
    </AriaNumberField>
  );
}

function StepperButton(props: ButtonProps) {
  return (
    <Button
      {...props}
      className={cn(
        'pressed:bg-gray-100 dark:pressed:bg-zinc-800 box-border cursor-default border-0 px-0.5 py-0 text-gray-500 group-disabled:text-gray-200 dark:text-zinc-400 dark:group-disabled:text-zinc-600 forced-colors:group-disabled:text-[GrayText]',
        props.className,
      )}
    />
  );
}
