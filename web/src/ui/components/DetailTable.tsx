import type { ReactNode } from 'react';

import { Card } from './Card';

interface DetailRow {
  label: string;
  value: ReactNode;
}

interface DetailTableProps {
  title?: string;
  rows: DetailRow[];
}

export function DetailTable({ rows, title }: DetailTableProps) {
  if (rows.length === 0) return null;

  return (
    <Card className="gap-0 p-0">
      {title && (
        <div className="border-border border-b px-4 py-3">
          <h3 className="text-sm font-medium">{title}</h3>
        </div>
      )}
      <div className="divide-border divide-y text-sm">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-start justify-between gap-4 px-4 py-2.5"
          >
            <span className="text-muted-foreground shrink-0">{row.label}</span>
            <span className="text-right font-mono text-xs">{row.value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
