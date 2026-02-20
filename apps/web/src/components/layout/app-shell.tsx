'use client';

import { Sidebar } from './sidebar';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useUIStore();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main
        className={cn(
          'min-h-screen transition-all duration-300',
          sidebarOpen ? 'ml-64' : 'ml-16',
        )}
      >
        <div className="container py-6">{children}</div>
      </main>
    </div>
  );
}
