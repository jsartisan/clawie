'use client';

import { VariantProps } from 'tailwind-variants';
import { createLink } from '@tanstack/react-router';
import {
  composeRenderProps,
  Link as RACLink,
  LinkProps as RACLinkProps,
} from 'react-aria-components';

import { buttonVariants } from './Button';
import { wrapTextChildren } from '../lib/utils';

export interface LinkButtonProps
  extends RACLinkProps, VariantProps<typeof buttonVariants> {
  useNativeAnchor?: boolean;
}

export function _LinkButton(props: LinkButtonProps) {
  const { children } = props;

  return (
    <RACLink
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        buttonVariants({
          ...renderProps,
          variant: props.variant,
          size: props.size,
          className,
        }),
      )}
    >
      {composeRenderProps(children, (children) => (
        <>{wrapTextChildren(children)}</>
      ))}
    </RACLink>
  );
}

export const LinkButton = createLink(_LinkButton);
