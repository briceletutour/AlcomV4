'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale, useFormatter } from 'next-intl';
import { useAuthStore } from '@/stores/auth-store';
import { Plus, Search, Filter } from 'lucide-react';
import { CsvDownloadButton } from '@/components/shared/csv-download-button';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export default function ShiftsPage() {
  const t = useTranslations('Shifts');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterStation, setFilterStation] = useState('');
  const limit = 20;

  const statusMap: Record<string, { status: 'success' | 'warning' | 'neutral' | 'info'; label: string }> = {
    OPEN: { status: 'success', label: t('statusOpen') },
    CLOSED: { status: 'neutral', label: t('statusClosed') },
    LOCKED: { status: 'info', label: t('statusLocked') },
  };

  const isGlobalRole = ['SUPER_ADMIN', 'CEO', 'CFO', 'FINANCE_DIR', 'LOGISTICS', 'DCO'].includes(
    user?.role || '',
  );

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(filterStatus && { status: filterStatus }),
    ...(filterStation && { stationId: filterStation }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['shifts', page, filterStatus, filterStation],
    queryFn: () => api.get<any>(`/shifts?${queryParams}`),
  });

  const { data: stationsData } = useQuery({
    queryKey: ['stations-list'],
    queryFn: () => api.get<any>('/stations?limit=100'),
    enabled: isGlobalRole,
  });

  const shifts = data?.data || [];
  const meta = data?.meta || { total: 0, page: 1, totalPages: 0 };
  const stations = stationsData?.data || stationsData || [];

  const columns = [
    {
      key: 'shiftDate',
      header: t('shiftDate'),
      render: (s: any) => format.dateTime(new Date(s.shiftDate), { dateStyle: 'short' }),
    },
    {
      key: 'shiftType',
      header: t('shiftType'),
      render: (s: any) => (
        <span>{s.shiftType === 'MORNING' ? `🌅 ${t('morning')}` : `🌙 ${t('evening')}`}</span>
      ),
    },
    ...(isGlobalRole
      ? [
          {
            key: 'station',
            header: t('station'),
            render: (s: any) => s.station?.name || '-',
          },
        ]
      : []),
    {
      key: 'status',
      header: t('status'),
      render: (s: any) => {
        const sm = statusMap[s.status] || { status: 'neutral' as const, label: s.status };
        return <StatusBadge status={sm.status} label={sm.label} />;
      },
    },
    {
      key: 'totalRevenue',
      header: t('totalRevenue'),
      render: (s: any) =>
        s.status === 'CLOSED' ? `${format.number(Number(s.totalRevenue))} FCFA` : '-',
      className: 'text-right',
    },
    {
      key: 'cashVariance',
      header: t('variance'),
      render: (s: any) => {
        if (s.status !== 'CLOSED') return '-';
        const val = Number(s.cashVariance);
        return (
          <span
            className={cn(
              'font-medium',
              val === 0 ? 'text-green-600' : val > 0 ? 'text-blue-600' : 'text-red-600',
            )}
          >
            {val > 0 ? '+' : ''}
            {format.number(val)}
          </span>
        );
      },
      className: 'text-right',
    },
    {
      key: 'openedBy',
      header: t('openedBy'),
      render: (s: any) => s.openedBy?.fullName || '-',
    },
    {
      key: 'actions',
      header: t('status').replace(/.*/, ''), // empty header
      render: (s: any) => (
        <div className="flex gap-2">
          <Link
            href={`/${locale}/admin/shifts/${s.id}`}
            className="text-sm text-blue-600 hover:underline"
          >
            {t('viewDetails')}
          </Link>
          {s.status === 'OPEN' && (
            <Link
              href={`/${locale}/admin/shifts/${s.id}/close`}
              className="text-sm text-green-600 hover:underline"
            >
              {t('close')}
            </Link>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <div className="flex items-center gap-2">
          <CsvDownloadButton
            endpoint={`/exports/shifts?${filterStation ? `stationId=${filterStation}&` : ''}${filterStatus ? `status=${filterStatus}` : ''}`}
            filename="shifts_export.csv"
          />
          <Link
            href={`/${locale}/admin/shifts/open`}
            className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700"
          >
            <Plus className="h-4 w-4" />
            {t('openShift')}
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
            setPage(1);
          }}
          className="rounded border px-3 py-2 text-sm"
        >
          <option value="">{t('allStatuses')}</option>
          <option value="OPEN">{t('statusOpen')}</option>
          <option value="CLOSED">{t('statusClosed')}</option>
          <option value="LOCKED">{t('statusLocked')}</option>
        </select>

        {isGlobalRole && Array.isArray(stations) && stations.length > 0 && (
          <select
            value={filterStation}
            onChange={(e) => {
              setFilterStation(e.target.value);
              setPage(1);
            }}
            className="rounded border px-3 py-2 text-sm"
          >
            <option value="">{t('allStations')}</option>
            {stations.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.code} — {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={shifts}
        keyExtractor={(s: any) => s.id}
        isLoading={isLoading}
        onRowClick={(s: any) => router.push(`/admin/shifts/${s.id}`)}
        emptyMessage={t('noShifts')}
      />

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            {t('pageOf', { page: meta.page, totalPages: meta.totalPages, total: meta.total })}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded border px-3 py-1 disabled:opacity-50"
            >
              {t('previous')}
            </button>
            <button
              disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border px-3 py-1 disabled:opacity-50"
            >
              {t('next')}
            </button>
          </div>
        </div>
      )}

      {/* Mobile cards — shown on small screens */}
      <div className="block md:hidden">
        {shifts.map((s: any) => {
          const sm = statusMap[s.status] || { status: 'neutral' as const, label: s.status };
          return (
            <Link
              key={s.id}
              href={`/${locale}/admin/shifts/${s.id}`}
              className="mb-3 block rounded-lg border bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{format.dateTime(new Date(s.shiftDate), { dateStyle: 'short' })}</span>
                <StatusBadge status={sm.status} label={sm.label} />
              </div>
              <div className="mt-1 text-sm text-gray-500">
                {s.shiftType === 'MORNING' ? `🌅 ${t('morning')}` : `🌙 ${t('evening')}`}
                {s.station && ` • ${s.station.name}`}
              </div>
              {s.status === 'CLOSED' && (
                <div className="mt-2 flex justify-between text-sm">
                  <span>{format.number(Number(s.totalRevenue))} FCFA</span>
                  <span
                    className={cn(
                      'font-medium',
                      Number(s.cashVariance) === 0
                        ? 'text-green-600'
                        : 'text-red-600',
                    )}
                  >
                    {t('variance')}: {format.number(Number(s.cashVariance))} FCFA
                  </span>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
