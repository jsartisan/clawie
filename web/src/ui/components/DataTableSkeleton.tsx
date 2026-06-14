import { cn } from '../lib/utils';
import { Skeleton } from './Skeleton';

interface DataTableSkeletonProps {
  rows?: number;
  columns?: number;
  hasToolbar?: boolean;
  hasHeader?: boolean;
  className?: string;
}

function DataTableSkeleton({
  className,
  columns = 4,
  hasHeader = true,
  hasToolbar = true,
  rows = 5,
}: DataTableSkeletonProps) {
  return (
    <div
      data-slot="data-table-skeleton"
      className={cn(
        'shadow-100 bg-background overflow-hidden rounded-xl',
        className,
      )}
    >
      {hasToolbar && (
        <div className="flex items-center gap-1 border-b p-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton
              key={i}
              className={cn('h-7 rounded-md', i === 0 ? 'w-12' : 'w-16')}
            />
          ))}
        </div>
      )}

      <div>
        <table className="w-full text-sm">
          {hasHeader && (
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="w-12 px-4 py-2.5">
                  <Skeleton className="size-4 rounded" />
                </th>
                {Array.from({ length: columns }).map((_, i) => {
                  const isLast = i === columns - 1;
                  return (
                    <th
                      key={i}
                      className={cn(
                        'px-4 py-2.5',
                        isLast ? 'text-right' : 'text-left',
                      )}
                    >
                      <Skeleton
                        className={cn(
                          'h-3 rounded',
                          i === 0 ? 'w-20' : isLast ? 'w-0' : 'w-16',
                          isLast && 'ml-auto',
                        )}
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
          )}
          <tbody>
            {Array.from({ length: rows }).map((_, rowIdx) => (
              <tr key={rowIdx} className="border-b last:border-b-0">
                <td className="w-12 px-4 py-3">
                  <Skeleton className="size-4 rounded" />
                </td>
                {Array.from({ length: columns }).map((_, colIdx) => {
                  const isLast = colIdx === columns - 1;
                  return (
                    <td
                      key={colIdx}
                      className={cn('px-4 py-3', isLast && 'text-right')}
                    >
                      {colIdx === 0 ? (
                        <div className="flex flex-col gap-1.5">
                          <Skeleton className="h-3.5 w-32 rounded" />
                          <Skeleton className="h-2.5 w-48 rounded" />
                        </div>
                      ) : isLast ? (
                        <Skeleton className="ml-auto size-5 rounded" />
                      ) : (
                        <Skeleton className="h-3 w-20 rounded" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { DataTableSkeleton };
export type { DataTableSkeletonProps };
