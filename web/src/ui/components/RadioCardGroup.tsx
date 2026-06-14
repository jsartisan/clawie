'use client';

import { ReactNode } from 'react';
import { tv } from 'tailwind-variants';
import {
  composeRenderProps,
  Radio as RACRadio,
  RadioGroup as RACRadioGroup,
  RadioGroupProps as RACRadioGroupProps,
  RadioProps as RACRadioProps,
  ValidationResult,
} from 'react-aria-components';

import { cn } from '../lib/utils';
import { FieldDescription, FieldError, FieldLabel } from './Field';

export interface RadioCardGroupProps extends Omit<
  RACRadioGroupProps,
  'children'
> {
  label?: string;
  children?: ReactNode;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
  /** Tailwind classes for the inner grid wrapping the cards. Default: `grid grid-cols-2 gap-4`. */
  gridClassName?: string;
}

export function RadioCardGroup({
  children,
  className,
  description,
  errorMessage,
  gridClassName,
  label,
  ...props
}: RadioCardGroupProps) {
  return (
    <RACRadioGroup
      {...props}
      className={composeRenderProps(className, (cls) =>
        cn('flex flex-col gap-3', cls),
      )}
    >
      {(renderProps) => (
        <>
          {label && <FieldLabel>{label}</FieldLabel>}
          <div
            className={cn('group/rcg grid grid-cols-2 gap-4', gridClassName)}
            data-has-selection={
              renderProps.state.selectedValue != null ? 'true' : undefined
            }
          >
            {children}
          </div>
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldError>{errorMessage}</FieldError>
        </>
      )}
    </RACRadioGroup>
  );
}

const radioCardVariants = tv({
  base: cn(
    'bg-card text-card-foreground shadow-100 flex cursor-pointer flex-col items-center gap-3 rounded-xl px-5 py-5 text-center',
    'transition-[box-shadow,opacity,transform] duration-200 ease-out',
    'outline-none',
    'group-data-[has-selection]/rcg:data-[selected=false]:opacity-50',
    'group-data-[has-selection]/rcg:data-[selected=false]:hover:opacity-100',
  ),
  variants: {
    isHovered: {
      true: 'ring-primary/50 ring-2',
    },
    isSelected: {
      true: 'ring-primary ring-2',
    },
    isPressed: {
      true: 'translate-y-px duration-75',
    },
    isFocusVisible: {
      true: 'ring-ring/50 ring-[3px]',
    },
    isDisabled: {
      true: 'cursor-not-allowed opacity-50',
    },
  },
});

export type RadioCardProps = RACRadioProps;

export function RadioCard(props: RadioCardProps) {
  return (
    <RACRadio
      {...props}
      className={composeRenderProps(props.className, (cls, renderProps) =>
        radioCardVariants({ ...renderProps, className: cls }),
      )}
    />
  );
}
