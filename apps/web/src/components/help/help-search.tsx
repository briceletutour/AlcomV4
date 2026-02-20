'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface HelpSearchProps {
  onSearch: (query: string) => void;
  resultCount?: number;
  placeholder?: string;
}

export function HelpSearch({
  onSearch,
  resultCount,
  placeholder,
}: HelpSearchProps) {
  const t = useTranslations('Help');
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout>();

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      onSearch(query);
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, onSearch]);

  const handleClear = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
          <Search className="w-5 h-5 text-gray-400" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder || t('searchPlaceholder')}
          className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow text-gray-900 placeholder-gray-400"
          aria-label={placeholder || t('searchPlaceholder')}
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label={t('clearSearch')}
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {query && resultCount !== undefined && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>
            {t('resultsFound', { count: resultCount })}
          </span>
        </div>
      )}
    </div>
  );
}
