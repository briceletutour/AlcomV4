'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Plus, Building2 } from 'lucide-react';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';

interface Station {
  name: string;
  code: string;
}

interface ReplenishmentRequest {
  id: string;
  stationId: string;
  fuelType: 'ESSENCE' | 'GASOIL' | 'PETROLE';
  requestedVolume: number;
  status: 'DRAFT' | 'PENDING_VALIDATION' | 'VALIDATED' | 'ORDERED' | 'COMPLETED';
  createdAt: string;
  station: Station;
  requestedBy: { fullName: string };
}

interface ReplenishmentListResponse {
  data: ReplenishmentRequest[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const statusColors: Record<string, 'neutral' | 'warning' | 'info' | 'success' | 'danger'> = {
  DRAFT: 'neutral',
  PENDING_VALIDATION: 'warning',
  VALIDATED: 'info',
  ORDERED: 'info',
  COMPLETED: 'success',
};

export default function ReplenishmentPage() {
  const locale = useLocale();
  const t = useTranslations('Supply');
  const dateLocale = locale === 'fr' ? fr : enUS;
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterFuelType, setFilterFuelType] = useState<string>('');
  const limit = 20;

  const statusLabels: Record<string, string> = {
    DRAFT: t('replenishment.statusDraft'),
    PENDING_VALIDATION: t('replenishment.statusPendingValidation'),
    VALIDATED: t('replenishment.statusValidated'),
    ORDERED: t('replenishment.statusOrdered'),
    COMPLETED: t('replenishment.statusCompleted'),
  };

  const fuelTypeLabels: Record<string, string> = {
    ESSENCE: t('fuelTypes.ESSENCE'),
    GASOIL: t('fuelTypes.GASOIL'),
    PETROLE: t('fuelTypes.PETROLE'),
  };

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(filterStatus && { status: filterStatus }),
    ...(filterFuelType && { fuelType: filterFuelType }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['replenishment-requests', page, filterStatus, filterFuelType],
    queryFn: () => api.get<ReplenishmentListResponse>(`/deliveries/requests?${queryParams}`),
  });

  const requests = (data as any)?.data || [];
  const meta = (data as any)?.meta || { total: 0, page: 1, totalPages: 0 };

  const columns = [
    {
      key: 'station',
      header: t('common.station'),
      render: (r: ReplenishmentRequest) => (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="font-medium">{r.station.name}</div>
            <div className="text-xs text-muted-foreground">{r.station.code}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'fuelType',
      header: t('common.fuelType'),
      render: (r: ReplenishmentRequest) => {
        const colorClass = r.fuelType === 'ESSENCE' 
          ? 'bg-yellow-100 text-yellow-800' 
          : r.fuelType === 'PETROLE' 
            ? 'bg-blue-100 text-blue-800' 
            : 'bg-orange-100 text-orange-800';
        return (
          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${colorClass}`}>
            {fuelTypeLabels[r.fuelType]}
          </span>
        );
      },
    },
    {
      key: 'requestedVolume',
      header: t('common.volume'),
      render: (r: ReplenishmentRequest) => (
        <span className="font-mono font-medium">
          {Number(r.requestedVolume).toLocaleString()} L
        </span>
      ),
    },
    {
      key: 'status',
      header: t('common.status'),
      render: (r: ReplenishmentRequest) => (
        <StatusBadge
          status={statusColors[r.status] || 'neutral'}
          label={statusLabels[r.status] || r.status}
        />
      ),
    },
    {
      key: 'requestedBy',
      header: t('replenishment.requestedBy'),
      render: (r: ReplenishmentRequest) => (
        <span className="text-sm">{r.requestedBy?.fullName || '-'}</span>
      ),
    },
    {
      key: 'createdAt',
      header: t('common.date'),
      render: (r: ReplenishmentRequest) => (
        <span className="text-sm text-muted-foreground">
          {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true, locale: dateLocale })}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (r: ReplenishmentRequest) => (
        <Link
          href={`/${locale}/admin/supply/replenishment/${r.id}`}
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
          <h1 className="text-2xl font-bold">{t('replenishment.title')}</h1>
          <p className="text-muted-foreground">{t('replenishment.subtitle')}</p>
        </div>
        <Link
          href={`/${locale}/admin/supply/replenishment/new`}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          {t('replenishment.newRequest')}
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
          aria-label={t('replenishment.allStatuses')}
        >
          <option value="">{t('replenishment.allStatuses')}</option>
          <option value="DRAFT">{t('replenishment.statusDraft')}</option>
          <option value="PENDING_VALIDATION">{t('replenishment.statusPendingValidation')}</option>
          <option value="VALIDATED">{t('replenishment.statusValidated')}</option>
          <option value="ORDERED">{t('replenishment.statusOrdered')}</option>
          <option value="COMPLETED">{t('replenishment.statusCompleted')}</option>
        </select>
        <select
          value={filterFuelType}
          onChange={(e) => {
            setFilterFuelType(e.target.value);
            setPage(1);
          }}
          className="rounded-md border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label={t('replenishment.allFuelTypes')}
        >
          <option value="">{t('replenishment.allFuelTypes')}</option>
          <option value="ESSENCE">{t('fuelTypes.ESSENCE')}</option>
          <option value="GASOIL">{t('fuelTypes.GASOIL')}</option>
          <option value="PETROLE">{t('fuelTypes.PETROLE')}</option>
        </select>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm text-muted-foreground">{t('replenishment.drafts')}</div>
          <div className="text-2xl font-bold">
            {requests.filter((r: ReplenishmentRequest) => r.status === 'DRAFT').length}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm text-muted-foreground">{t('replenishment.pending')}</div>
          <div className="text-2xl font-bold text-yellow-600">
            {requests.filter((r: ReplenishmentRequest) => r.status === 'PENDING_VALIDATION').length}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm text-muted-foreground">{t('replenishment.ordered')}</div>
          <div className="text-2xl font-bold text-blue-600">
            {requests.filter((r: ReplenishmentRequest) => r.status === 'ORDERED').length}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm text-muted-foreground">{t('replenishment.completedThisMonth')}</div>
          <div className="text-2xl font-bold text-green-600">
            {requests.filter((r: ReplenishmentRequest) => r.status === 'COMPLETED').length}
          </div>
        </div>
      </div>

      {/* Desktop: DataTable */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={requests}
          keyExtractor={(r) => r.id}
          isLoading={isLoading}
          emptyMessage={t('replenishment.noRequests')}
        />
      </div>

      {/* Mobile: Card layout */}
      <div className="grid gap-3 md:hidden">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {t('common.loading')}
          </div>
        ) : requests.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {t('replenishment.noRequests')}
          </div>
        ) : (
          requests.map((r: ReplenishmentRequest) => (
            <Link
              key={r.id}
              href={`/${locale}/admin/supply/replenishment/${r.id}`}
              className="rounded-xl border bg-card p-4 shadow-sm active:bg-muted/30"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  r.fuelType === 'ESSENCE' ? 'bg-yellow-100 text-yellow-800' : r.fuelType === 'PETROLE' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'
                }`}>
                  {fuelTypeLabels[r.fuelType]}
                </span>
                <StatusBadge
                  status={statusColors[r.status] || 'neutral'}
                  label={statusLabels[r.status] || r.status}
                />
              </div>
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{r.station.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-mono text-lg font-bold">
                  {Number(r.requestedVolume).toLocaleString()} L
                </span>
                <span className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true, locale: dateLocale })}
                </span>
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
