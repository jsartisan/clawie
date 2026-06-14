import { useEffect, useState } from 'react';

import { cn } from '../lib/utils';

interface LabelWithDotsProps {
  label: string;
  className?: string;
}

export function LabelWithDots({ className, label }: LabelWithDotsProps) {
  const [dots, setDots] = useState('.');
  useEffect(() => {
    const id = window.setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '.' : prev + '.'));
    }, 400);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span
      className={cn(
        'text-sm font-medium text-white tabular-nums',
        'flex items-baseline',
        className,
      )}
    >
      {label}
      <span className="inline-block w-4 text-left">{dots}</span>
    </span>
  );
}
