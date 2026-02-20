'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiFetchEnvelope } from '@/lib/api-client';
import { DataTable } from '@/components/shared/data-table';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

interface NotificationList {
  items: NotificationItem[];
  unreadCount: number;
}

async function fetchNotifications(): Promise<NotificationList> {
  const response = await apiFetchEnvelope<NotificationItem[]>('/notifications?page=1&limit=100', {
    method: 'GET',
  });

  return {
    items: response.data,
    unreadCount: Number(response.meta?.unreadCount || 0),
  };
}

export default function NotificationsPage() {
  const t = useTranslations('Notifications');
  const locale = useLocale();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'all'],
    queryFn: fetchNotifications,
    refetchInterval: 30_000,
  });

  const markRead = useMutation({
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

  const items = data?.items || [];
  const unreadCount = data?.unreadCount || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('subtitle', { unreadCount })}
          </p>
        </div>

        <button
          onClick={() => markAllRead.mutate()}
          disabled={markAllRead.isPending || unreadCount === 0}
          className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {t('markAllRead')}
        </button>
      </div>

      <DataTable
        columns={[
          {
            key: 'title',
            header: t('columns.title'),
            render: (item: NotificationItem) => (
              <div className="space-y-1">
                <p className={`font-medium ${item.isRead ? 'text-gray-700' : 'text-gray-900'}`}>{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.message}</p>
              </div>
            ),
          },
          {
            key: 'status',
            header: t('columns.status'),
            render: (item: NotificationItem) => (
              <span
                className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                  item.isRead ? 'bg-gray-100 text-gray-700' : 'bg-red-100 text-red-700'
                }`}
              >
                {item.isRead ? t('read') : t('unread')}
              </span>
            ),
          },
          {
            key: 'createdAt',
            header: t('columns.date'),
            render: (item: NotificationItem) => new Date(item.createdAt).toLocaleString(),
          },
          {
            key: 'actions',
            header: t('columns.actions'),
            render: (item: NotificationItem) => (
              <div className="flex items-center gap-3">
                {item.link ? (
                  <Link
                    href={`/${locale}${item.link}`}
                    onClick={() => {
                      if (!item.isRead) {
                        markRead.mutate(item.id);
                      }
                    }}
                    className="text-xs font-medium text-blue-600 hover:underline"
                  >
                    {t('open')}
                  </Link>
                ) : null}

                {!item.isRead ? (
                  <button
                    onClick={() => markRead.mutate(item.id)}
                    className="text-xs font-medium text-gray-600 hover:underline"
                  >
                    {t('markRead')}
                  </button>
                ) : null}
              </div>
            ),
          },
        ]}
        data={items}
        keyExtractor={(item) => item.id}
        emptyMessage={t('empty')}
        isLoading={isLoading}
      />
    </div>
  );
}
