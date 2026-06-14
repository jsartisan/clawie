'use client';

import React from 'react';
import { tv, type VariantProps } from 'tailwind-variants';
import {
  ToggleButton as AriaToggleButton,
  ToggleButtonProps as AriaToggleButtonProps,
  ToggleButtonGroup as AriaToggleButtonGroup,
  ToggleButtonGroupProps as AriaToggleButtonGroupProps,
  composeRenderProps,
} from 'react-aria-components';

import { wrapTextChildren } from '../lib/utils';
import { toggleButtonVariants } from './ToggleButton';

const ToggleButtonGroupContext = React.createContext<
  VariantProps<typeof toggleButtonVariants>
>({
  size: 'default',
  variant: 'default',
});

export interface ToggleButtonGroupProps extends AriaToggleButtonGroupProps {
  variant?: VariantProps<typeof toggleButtonGroupVariants>['variant'];
  size?: VariantProps<typeof toggleButtonGroupVariants>['size'];
}

const toggleButtonGroupVariants = tv({
  base: 'group/toggle-button-group flex w-fit items-center',
  variants: {
    variant: {
      default: '',
    },
    size: {
      default: 'gap-0.5 rounded-md',
      xs: 'gap-px rounded-sm',
      sm: 'gap-1 rounded-sm ',
      lg: 'gap-0.5 rounded-lg',
      icon: 'gap-0.5 rounded-md p-0.5',
      'icon-xs': 'gap-px rounded-sm',
      'icon-sm': 'gap-px rounded-md',
      'icon-lg': ' gap-0.5 rounded-lg',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

export function ToggleButtonGroup({
  children,
  className,
  size = 'default',
  variant = 'default',
  ...props
}: ToggleButtonGroupProps) {
  const contextValue = React.useMemo(
    () => ({ variant, size }),
    [variant, size],
  );
  return (
    <ToggleButtonGroupContext.Provider value={contextValue}>
      <AriaToggleButtonGroup
        data-slot="toggle-button-group"
        data-variant={variant}
        data-size={size}
        {...props}
        className={composeRenderProps(className, (cls, renderProps) =>
          toggleButtonGroupVariants({
            ...renderProps,
            variant,
            size,
            className: cls,
          }),
        )}
      >
        {composeRenderProps(children, (children) => (
          <>{children}</>
        ))}
      </AriaToggleButtonGroup>
    </ToggleButtonGroupContext.Provider>
  );
}

export interface ToggleButtonGroupItemProps extends AriaToggleButtonProps {
  variant?: ToggleButtonGroupProps['variant'];
  size?: ToggleButtonGroupProps['size'];
}

export function ToggleButtonGroupItem({
  children,
  className,
  size,
  variant,
  ...props
}: ToggleButtonGroupItemProps) {
  const context = React.useContext(ToggleButtonGroupContext);
  const finalVariant = context.variant || variant;
  const finalSize = context.size || size;

  return (
    <AriaToggleButton
      data-slot="toggle-button-group-item"
      data-variant={finalVariant}
      data-size={finalSize}
      {...props}
      className={composeRenderProps(className, (cls, renderProps) =>
        toggleButtonVariants({
          ...renderProps,
          variant: finalVariant as ToggleButtonGroupItemProps['variant'],
          size: finalSize as ToggleButtonGroupItemProps['size'],
          className: cls,
        }),
      )}
    >
      {composeRenderProps(children, (children) => (
        <>{wrapTextChildren(children)}</>
      ))}
    </AriaToggleButton>
  );
}
