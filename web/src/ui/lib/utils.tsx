import { tv } from 'tailwind-variants';
import { twMerge } from 'tailwind-merge';
import { clsx, type ClassValue } from 'clsx';
import { Children, type ReactNode } from 'react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function wrapTextChildren(
  children: ReactNode,
  wrapFn: (text: string, key: number) => ReactNode = (text, key) => (
    <span key={key} className="box-trim">
      {text}
    </span>
  ),
): ReactNode[] {
  const result: ReactNode[] = [];
  let textBuffer = '';

  Children.forEach(children, (child) => {
    if (typeof child === 'string' || typeof child === 'number') {
      textBuffer += child;
    } else {
      if (textBuffer) {
        result.push(wrapFn(textBuffer, result.length));
        textBuffer = '';
      }
      result.push(child);
    }
  });

  if (textBuffer) {
    result.push(wrapFn(textBuffer, result.length));
  }

  return result;
}

export const focusRing = tv({
  base: 'outline-none',
  variants: {
    isFocusVisible: {
      false: 'outline-0',
      true: 'ring-ring/50 border-ring ring-[3px]',
    },
  },
});
