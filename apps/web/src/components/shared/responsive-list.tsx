'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from './skeleton';

interface ResponsiveListProps<T> {
  items: T[];
  renderCard: (item: T, index: number) => ReactNode;
  renderTableRow?: (item: T, index: number) => ReactNode;
  tableHeaders?: string[];
  emptyMessage?: string;
  className?: string;
  isLoading?: boolean;
  skeletonCount?: number;
}

/**
 * Responsive list component that shows cards on mobile and table on desktop.
 * Use Tailwind's responsive classes to toggle between views.
 */
export function ResponsiveList<T>({
  items,
  renderCard,
  renderTableRow,
  tableHeaders = [],
  emptyMessage = 'No items found',
  className,
  isLoading,
  skeletonCount = 5,
}: ResponsiveListProps<T>) {
  if (isLoading) {
    return (
      <div className={cn('w-full', className)}>
        {/* Mobile: Skeleton Cards */}
        <div className="md:hidden space-y-3">
          {Array.from({ length: skeletonCount }).map((_, index) => (
            <div key={index} className="border rounded-lg p-4 bg-card shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-5 w-3/4 mb-2" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
        
        {/* Desktop: Skeleton Table */}
        {renderTableRow && (
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse">
              {tableHeaders.length > 0 && (
                <thead>
                  <tr className="border-b bg-muted/50">
                    {tableHeaders.map((header, i) => (
                      <th key={i} className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {Array.from({ length: skeletonCount }).map((_, index) => (
                  <tr key={index} className="border-b">
                    {tableHeaders.map((_, i) => (
                      <td key={i} className="px-4 py-3">
                        <Skeleton className="h-4 w-full max-w-[100px]" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground rounded-lg border bg-muted/10">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn('w-full', className)}>
      {/* Mobile: Card Layout */}
      <div className="md:hidden space-y-3">
        {items.map((item, index) => (
          <div key={index} className="border rounded-lg p-4 bg-card shadow-sm">
            {renderCard(item, index)}
          </div>
        ))}
      </div>

      {/* Desktop: Table Layout */}
      {renderTableRow && (
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full border-collapse">
            {tableHeaders.length > 0 && (
              <thead>
                <tr className="border-b bg-muted/50">
                  {tableHeaders.map((header, i) => (
                    <th key={i} className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {items.map((item, index) => (
                <tr key={index} className="border-b hover:bg-muted/30 transition-colors">
                  {renderTableRow(item, index)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Desktop: Card Grid (if no table row renderer) */}
      {!renderTableRow && (
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item, index) => (
            <div key={index} className="border rounded-lg p-4 bg-card shadow-sm">
              {renderCard(item, index)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface CardGridProps {
  children: ReactNode;
  className?: string;
}

/**
 * Simple responsive card grid - 1 column mobile, 2 tablet, 3 desktop
 */
export function CardGrid({ children, className }: CardGridProps) {
  return (
    <div className={cn(
      'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4',
      className
    )}>
      {children}
    </div>
  );
}
