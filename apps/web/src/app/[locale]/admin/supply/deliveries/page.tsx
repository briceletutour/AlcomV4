'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Plus, Truck, Building2, FileText } from 'lucide-react';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';

interface Compartment {
  id: string;
  fuelType: string;
  blVolume: number;
  physicalReceived: number | null;
  variance: number | null;
  status: string | null;
}

interface Delivery {
  id: string;
  stationId: string;
  blNumber: string;
  truckPlate: string;
  driverName: string;
  status: 'IN_PROGRESS' | 'VALIDATED' | 'DISPUTED';
  globalVariance: number | null;
  totalBlVolume: number;
  createdAt: string;
  station: { name: string; code: string };
  compartments: Compartment[];
}

interface DeliveryListResponse {
  data: Delivery[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const statusColors: Record<string, 'neutral' | 'warning' | 'info' | 'success' | 'danger'> = {
  IN_PROGRESS: 'warning',
  VALIDATED: 'success',
  DISPUTED: 'danger',
};

export default function DeliveriesPage() {
  const locale = useLocale();
  const t = useTranslations('Supply');
  const dateLocale = locale === 'fr' ? fr : enUS;
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const limit = 20;

  const statusLabels: Record<string, string> = {
    IN_PROGRESS: t('deliveries.statusInProgress'),
    VALIDATED: t('deliveries.statusValidated'),
    DISPUTED: t('deliveries.statusDisputed'),
  };

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(filterStatus && { status: filterStatus }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['deliveries', page, filterStatus],
    queryFn: () => api.get<DeliveryListResponse>(`/deliveries?${queryParams}`),
  });

  const deliveries = (data as any)?.data || [];
  const meta = (data as any)?.meta || { total: 0, page: 1, totalPages: 0 };

  const columns = [
    {
      key: 'blNumber',
      header: t('deliveries.blNumber'),
      render: (d: Delivery) => (
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono font-medium">{d.blNumber}</span>
        </div>
      ),
    },
    {
      key: 'station',
      header: t('common.station'),
      render: (d: Delivery) => (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="font-medium">{d.station.name}</div>
            <div className="text-xs text-muted-foreground">{d.station.code}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'truck',
      header: t('deliveries.truck'),
      render: (d: Delivery) => (
        <div>
          <div className="font-medium">{d.truckPlate}</div>
          <div className="text-xs text-muted-foreground">{d.driverName}</div>
        </div>
      ),
    },
    {
      key: 'volume',
      header: t('deliveries.volumeBL'),
      render: (d: Delivery) => (
        <span className="font-mono font-medium">
          {d.totalBlVolume?.toLocaleString() || '-'} L
        </span>
      ),
    },
    {
      key: 'variance',
      header: t('deliveries.variance'),
      render: (d: Delivery) => {
        if (d.globalVariance === null) return <span className="text-muted-foreground">-</span>;
        const variance = Number(d.globalVariance);
        const isNegative = variance < 0;
        return (
          <span className={`font-mono font-medium ${
            isNegative ? 'text-red-600' : variance > 0 ? 'text-green-600' : ''
          }`}>
            {isNegative ? '' : '+'}{variance.toFixed(2)} L
          </span>
        );
      },
    },
    {
      key: 'status',
      header: t('common.status'),
      render: (d: Delivery) => (
        <StatusBadge
          status={statusColors[d.status] || 'neutral'}
          label={statusLabels[d.status] || d.status}
        />
      ),
    },
    {
      key: 'createdAt',
      header: t('common.date'),
      render: (d: Delivery) => (
        <span className="text-sm text-muted-foreground">
          {formatDistanceToNow(new Date(d.createdAt), { addSuffix: true, locale: dateLocale })}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (d: Delivery) => (
        <Link
          href={`/${locale}/admin/supply/deliveries/${d.id}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          {t('common.details')}
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('deliveries.title')}</h1>
          <p className="text-muted-foreground">{t('deliveries.subtitle')}</p>
        </div>
        <Link
          href={`/${locale}/admin/supply/deliveries/new`}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          {t('deliveries.newDelivery')}
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-md border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label={t('deliveries.allStatuses')}
        >
          <option value="">{t('deliveries.allStatuses')}</option>
          <option value="IN_PROGRESS">{t('deliveries.statusInProgress')}</option>
          <option value="VALIDATED">{t('deliveries.statusValidated')}</option>
          <option value="DISPUTED">{t('deliveries.statusDisputed')}</option>
        </select>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm text-muted-foreground">{t('deliveries.inProgress')}</div>
          <div className="text-2xl font-bold text-yellow-600">
            {deliveries.filter((d: Delivery) => d.status === 'IN_PROGRESS').length}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm text-muted-foreground">{t('deliveries.validated')}</div>
          <div className="text-2xl font-bold text-green-600">
            {deliveries.filter((d: Delivery) => d.status === 'VALIDATED').length}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm text-muted-foreground">{t('deliveries.disputed')}</div>
          <div className="text-2xl font-bold text-red-600">
            {deliveries.filter((d: Delivery) => d.status === 'DISPUTED').length}
          </div>
        </div>
      </div>

      {/* Desktop: DataTable */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={deliveries}
          keyExtractor={(d) => d.id}
          isLoading={isLoading}
          emptyMessage={t('deliveries.noDeliveries')}
        />
      </div>

      {/* Mobile: Card layout */}
      <div className="grid gap-3 md:hidden">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {t('common.loading')}
          </div>
        ) : deliveries.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {t('deliveries.noDeliveries')}
          </div>
        ) : (
          deliveries.map((d: Delivery) => (
            <Link
              key={d.id}
              href={`/${locale}/admin/supply/deliveries/${d.id}`}
              className="rounded-xl border bg-card p-4 shadow-sm active:bg-muted/30"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono font-medium">{d.blNumber}</span>
                <StatusBadge
                  status={statusColors[d.status] || 'neutral'}
                  label={statusLabels[d.status] || d.status}
                />
              </div>
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{d.station.name}</span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <Truck className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{d.truckPlate} - {d.driverName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-mono text-lg font-bold">
                  {d.totalBlVolume?.toLocaleString() || '-'} L
                </span>
                {d.globalVariance !== null && (
                  <span className={`font-mono ${
                    Number(d.globalVariance) < 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {Number(d.globalVariance) > 0 ? '+' : ''}{Number(d.globalVariance).toFixed(2)} L
                  </span>
                )}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {formatDistanceToNow(new Date(d.createdAt), { addSuffix: true, locale: dateLocale })}
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {t('common.previous')}
          </button>
          <span className="text-sm text-muted-foreground">
            {t('common.pageOf', { page, totalPages: meta.totalPages })}
          </span>
          <button
            onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
            disabled={page === meta.totalPages}
            className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {t('common.next')}
          </button>
        </div>
      )}
    </div>
  );
}
