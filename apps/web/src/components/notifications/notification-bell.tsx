'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Bell } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiFetchEnvelope } from '@/lib/api-client';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationList {
  items: NotificationItem[];
  unreadCount: number;
}

async function fetchRecentNotifications(): Promise<NotificationList> {
  const res = await apiFetchEnvelope<NotificationItem[]>('/notifications?page=1&limit=10', {
    method: 'GET',
  });

  return {
    items: res.data,
    unreadCount: Number(res.meta?.unreadCount || 0),
  };
}

function formatRelativeDate(date: string): string {
  const ts = new Date(date).getTime();
  const diffMs = Date.now() - ts;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

export function NotificationBell() {
  const t = useTranslations('Notifications');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const query = useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: fetchRecentNotifications,
    refetchInterval: 30_000,
  });

  const markOneRead = useMutation({
    mutationFn: (id: string) => api.put(`/notifications/${id}/read`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => api.put('/notifications/read-all', {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  useEffect(() => {
    function onOutsideClick(event: MouseEvent): void {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', onOutsideClick);
    return () => {
      document.removeEventListener('mousedown', onOutsideClick);
    };
  }, []);

  const unreadCount = useMemo(() => query.data?.unreadCount || 0, [query.data?.unreadCount]);
  const notifications = query.data?.items || [];

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="relative rounded-lg border border-gray-200 bg-white p-2 text-gray-700 hover:bg-gray-50"
        aria-label={t('bell')}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[360px] overflow-hidden rounded-xl border bg-white shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">{t('title')}</h3>
            <button
              onClick={() => markAllRead.mutate()}
              className="text-xs font-medium text-blue-600 hover:underline"
              disabled={markAllRead.isPending}
            >
              {t('markAllRead')}
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500">{t('empty')}</p>
            ) : (
              notifications.map((item) => {
                const href = item.link ? `/${locale}${item.link}` : `/${locale}/admin/notifications`;
                return (
                  <Link
                    key={item.id}
                    href={href}
                    onClick={() => {
                      if (!item.isRead) {
                        markOneRead.mutate(item.id);
                      }
                      setOpen(false);
                    }}
                    className={`block border-b px-4 py-3 last:border-b-0 hover:bg-gray-50 ${
                      item.isRead ? 'bg-white' : 'bg-red-50/40'
                    }`}
                  >
                    <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-gray-600">{item.message}</p>
                    <p className="mt-2 text-[11px] text-gray-400">{formatRelativeDate(item.createdAt)}</p>
                  </Link>
                );
              })
            )}
          </div>

          <div className="border-t px-4 py-3 text-right">
            <Link
              href={`/${locale}/admin/notifications`}
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              {t('viewAll')}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
