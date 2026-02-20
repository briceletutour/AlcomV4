'use client';

import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CsvDownloadButtonProps {
  endpoint: string;
  filename?: string;
  label?: string;
  className?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export function CsvDownloadButton({
  endpoint,
  filename,
  label = 'Télécharger CSV',
  className,
}: CsvDownloadButtonProps) {
  const handleDownload = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

      const response = await fetch(`${API_BASE}${endpoint}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('CSV download failed:', error);
    }
  };

  return (
    <button
      onClick={handleDownload}
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors',
        className,
      )}
    >
      <Download className="h-4 w-4" />
      {label}
    </button>
  );
}
