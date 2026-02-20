'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HelpAccordionProps {
  title: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  badge?: string;
  children: ReactNode;
  isOpen?: boolean;
}

export function HelpAccordion({
  title,
  icon,
  defaultOpen = false,
  badge,
  children,
  isOpen,
}: HelpAccordionProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // Handle controlled open state (for search filtering)
  useEffect(() => {
    if (detailsRef.current && isOpen !== undefined) {
      detailsRef.current.open = isOpen;
    }
  }, [isOpen]);

  return (
    <details
      ref={detailsRef}
      className="group border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow duration-200"
      open={defaultOpen}
    >
      <summary
        className="flex items-center justify-between cursor-pointer select-none px-6 py-4 hover:bg-gray-50 transition-colors duration-150 list-none"
        style={{ listStyle: 'none' }}
      >
        <div className="flex items-center gap-3 flex-1">
          {icon && <div className="flex-shrink-0 text-blue-600">{icon}</div>}
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          {badge && (
            <span className="px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
              {badge}
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            'w-5 h-5 text-gray-500 transition-transform duration-200 flex-shrink-0',
            'group-open:rotate-180'
          )}
        />
      </summary>

      <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50">
        {children}
      </div>
    </details>
  );
}

// Remove default disclosure triangle in WebKit browsers
const style = `
  details > summary::-webkit-details-marker {
    display: none;
  }
  details > summary::marker {
    display: none;
  }
`;

if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = style;
  document.head.appendChild(styleSheet);
}
