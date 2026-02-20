'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { CardSkeleton } from '@/components/shared/skeleton';
import { handleQueryError } from '@/lib/use-mutation-toast';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { Plus, Fuel, Gauge, Search, Users, AlertCircle, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';

interface Station {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  _count: {
    tanks: number;
    pumps: number;
    users: number;
  };
}

interface StationListResponse {
  data: Station[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export default function StationsPage() {
  const t = useTranslations('Stations');
  const tErrors = useTranslations('Errors');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<string>('');
  const limit = 20;

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(search && { search }),
    ...(filterActive && { isActive: filterActive }),
  });

  const queryKey = ['stations', page, search, filterActive];
  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () => api.get<StationListResponse>(`/stations?${queryParams}`),
  });

  // Handle query error with toast
  useEffect(() => {
    if (error) {
      handleQueryError(error, {
        errorMessage: tErrors('generic'),
        showRetry: true,
        onRetry: () => refetch(),
      });
    }
  }, [error, refetch, tErrors]);

  const stations = (data as any)?.data || [];
  const meta = (data as any)?.meta || { total: 0, page: 1, totalPages: 0 };

  const columns = [
    { key: 'code', header: t('code') },
    { key: 'name', header: t('name') },
    {
      key: 'tanks',
      header: t('tanks'),
      render: (s: Station) => (
        <div className="flex items-center gap-1">
          <Fuel className="h-4 w-4 text-muted-foreground" />
          <span>{s._count.tanks}</span>
        </div>
      ),
    },
    {
      key: 'pumps',
      header: t('pumps'),
      render: (s: Station) => (
        <div className="flex items-center gap-1">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          <span>{s._count.pumps}</span>
        </div>
      ),
    },
    {
      key: 'users',
      header: t('agents'),
      render: (s: Station) => (
        <div className="flex items-center gap-1">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span>{s._count.users}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (s: Station) => (
        <StatusBadge
          status={s.isActive ? 'success' : 'neutral'}
          label={s.isActive ? t('active') : t('inactive')}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (s: Station) => (
        <Link
          href={`/${locale}/admin/stations/${s.id}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          {t('viewDetails')}
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Link
          href={`/${locale}/admin/stations/new`}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          {t('newStation')}
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-md border bg-background pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <select
          value={filterActive}
          onChange={(e) => {
            setFilterActive(e.target.value);
            setPage(1);
          }}
          className="rounded-md border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">{t('allStatuses')}</option>
          <option value="true">{t('active')}</option>
          <option value="false">{t('inactive')}</option>
        </select>
      </div>

      {/* Desktop: DataTable */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={stations}
          keyExtractor={(s) => s.id}
          isLoading={isLoading}
          onRowClick={(s) => {
            window.location.href = `/admin/stations/${s.id}`;
          }}
          emptyMessage={t('noStations')}
        />
      </div>

      {/* Mobile: Card layout */}
      <div className="grid gap-3 md:hidden">
        {isLoading ? (
          <>
            {Array.from({ length: 5 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </>
        ) : error ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-lg border bg-red-50 text-red-700">
            <AlertCircle className="h-8 w-8" />
            <span>{tErrors('generic')}</span>
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-100 px-3 py-1.5 text-sm font-medium hover:bg-red-200"
            >
              <RefreshCw className="h-4 w-4" />
              {tErrors('retry')}
            </button>
          </div>
        ) : stations.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-lg border bg-muted/10 text-muted-foreground">
            {t('noStations')}
          </div>
        ) : (
          stations.map((s: Station) => (
            <Link
              key={s.id}
              href={`/${locale}/admin/stations/${s.id}`}
              className="rounded-xl border bg-card p-4 shadow-sm active:bg-muted/30"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-sm font-medium text-muted-foreground">
                  {s.code}
                </span>
                <StatusBadge
                  status={s.isActive ? 'success' : 'neutral'}
                  label={s.isActive ? t('active') : t('inactive')}
                />
              </div>
              <p className="mb-3 text-lg font-semibold">{s.name}</p>
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Fuel className="h-4 w-4" /> {s._count.tanks} {t('tanks')}
                </span>
                <span className="flex items-center gap-1">
                  <Gauge className="h-4 w-4" /> {s._count.pumps} {t('pumps')}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" /> {s._count.users} {t('agents')}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-sm text-muted-foreground">
            {t('showingResults', {
              from: (page - 1) * limit + 1,
              to: Math.min(page * limit, meta.total),
              total: meta.total,
            })}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {t('previous')}
            </button>
            <button
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={page >= meta.totalPages}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {t('next')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
