'use client';

import { type ReactNode } from 'react';
import { FileQuestion, Inbox, Search, Plus } from 'lucide-react';

interface EmptyStateProps {
  /** Icon to show - defaults to Inbox */
  icon?: 'inbox' | 'search' | 'file' | ReactNode;
  /** Main title */
  title: string;
  /** Description text */
  description?: string;
  /** Primary action button */
  action?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
  };
}

const iconMap = {
  inbox: Inbox,
  search: Search,
  file: FileQuestion,
};

export function EmptyState({
  icon = 'inbox',
  title,
  description,
  action,
}: EmptyStateProps) {
  const IconComponent = typeof icon === 'string' ? iconMap[icon] : null;

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed bg-muted/30 px-6 py-12 text-center">
      {IconComponent ? (
        <IconComponent className="h-12 w-12 text-muted-foreground/50 mb-4" />
      ) : (
        <div className="mb-4">{icon}</div>
      )}
      <h3 className="text-lg font-medium text-foreground mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm mb-4">
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {action.icon || <Plus className="h-4 w-4" />}
          {action.label}
        </button>
      )}
    </div>
  );
}
