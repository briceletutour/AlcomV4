'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { Modal } from '@/components/shared/Modal';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import {
  Plus,
  Check,
  X,
  Fuel,
  History,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

interface FuelPrice {
  id: string;
  fuelType: 'ESSENCE' | 'GASOIL' | 'PETROLE';
  price: number;
  effectiveDate: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  isActive: boolean;
  createdById: string;
  approvedById: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  createdAt: string;
  createdBy: { id: string; fullName: string };
  approvedBy: { id: string; fullName: string } | null;
}

interface PriceListResponse {
  data: FuelPrice[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

interface ActivePricesResponse {
  ESSENCE: FuelPrice | null;
  GASOIL: FuelPrice | null;
  PETROLE: FuelPrice | null;
}

const APPROVER_ROLES = ['SUPER_ADMIN', 'CEO', 'CFO'];

export default function PricesPage() {
  const t = useTranslations('Prices');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  const [page, setPage] = useState(1);
  const [filterFuelType, setFilterFuelType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [showApproveModal, setShowApproveModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const limit = 20;

  const canApprove = user && APPROVER_ROLES.includes(user.role);

  // Build query params
  const queryParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(filterFuelType && { fuelType: filterFuelType }),
    ...(filterStatus && { status: filterStatus }),
  });

  // Fetch prices list
  const { data: pricesData, isLoading } = useQuery({
    queryKey: ['prices', page, filterFuelType, filterStatus],
    queryFn: () => api.get<PriceListResponse>(`/prices?${queryParams}`),
  });

  // Fetch current active prices
  const { data: activePrices } = useQuery({
    queryKey: ['prices', 'active'],
    queryFn: () => api.get<ActivePricesResponse>('/prices/active'),
  });

  const prices = (pricesData as any)?.data || [];
  const meta = (pricesData as any)?.meta || { total: 0, page: 1, totalPages: 0 };

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: (id: string) => api.put(`/prices/${id}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prices'] });
      setShowApproveModal(null);
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.put(`/prices/${id}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prices'] });
      setShowRejectModal(null);
      setRejectReason('');
    },
  });

  const handleApprove = (id: string) => {
    setShowApproveModal(id);
  };

  const confirmApprove = () => {
    if (showApproveModal) {
      approveMutation.mutate(showApproveModal);
    }
  };

  const handleReject = () => {
    if (showRejectModal && rejectReason.length >= 10) {
      rejectMutation.mutate({ id: showRejectModal, reason: rejectReason });
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('fr-FR').format(price) + ' XAF';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (price: FuelPrice) => {
    if (price.status === 'PENDING') {
      return <StatusBadge status="warning" label={t('statusPending')} />;
    }
    if (price.status === 'REJECTED') {
      return <StatusBadge status="danger" label={t('statusRejected')} />;
    }
    if (price.isActive) {
      return <StatusBadge status="success" label={t('statusActive')} />;
    }
    return <StatusBadge status="info" label={t('statusApproved')} />;
  };

  const columns = [
    {
      key: 'fuelType',
      header: t('fuelType'),
      render: (p: FuelPrice) => {
        const label = p.fuelType === 'ESSENCE' ? t('essence') : p.fuelType === 'PETROLE' ? t('petrole') : t('gasoil');
        return (
          <div className="flex items-center gap-2">
            <Fuel className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{label}</span>
          </div>
        );
      },
    },
    {
      key: 'price',
      header: t('price'),
      render: (p: FuelPrice) => (
        <span className="font-mono font-semibold">{formatPrice(p.price)}</span>
      ),
    },
    {
      key: 'effectiveDate',
      header: t('effectiveDate'),
      render: (p: FuelPrice) => formatDate(p.effectiveDate),
    },
    {
      key: 'status',
      header: t('status'),
      render: getStatusBadge,
    },
    {
      key: 'createdBy',
      header: t('createdBy'),
      render: (p: FuelPrice) => p.createdBy?.fullName || '-',
    },
    {
      key: 'approvedBy',
      header: t('approvedBy'),
      render: (p: FuelPrice) => p.approvedBy?.fullName || '-',
    },
    {
      key: 'actions',
      header: '',
      render: (p: FuelPrice) => {
        if (p.status !== 'PENDING' || !canApprove) return null;
        // 4-eyes: can't approve own submission
        if (p.createdById === user?.userId) {
          return (
            <span className="text-xs text-muted-foreground">
              {t('cannotApproveSelf')}
            </span>
          );
        }
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleApprove(p.id)}
              disabled={approveMutation.isPending}
              className="rounded bg-green-600 p-1.5 text-white hover:bg-green-700 disabled:opacity-50"
              title={t('approve')}
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={() => setShowRejectModal(p.id)}
              className="rounded bg-red-600 p-1.5 text-white hover:bg-red-700"
              title={t('reject')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <div className="flex gap-2">
          <Link
            href={`/${locale}/admin/prices/history`}
            className="inline-flex items-center gap-2 rounded-md border bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted"
          >
            <History className="h-4 w-4" />
            {t('viewHistory')}
          </Link>
          <Link
            href={`/${locale}/admin/prices/new`}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t('newPrice')}
          </Link>
        </div>
      </div>

      {/* Current Active Prices Card */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-muted-foreground">
            <Fuel className="h-5 w-5" />
            <span className="text-sm font-medium">{t('essence')}</span>
          </div>
          <p className="text-2xl font-bold">
            {(activePrices as any)?.ESSENCE
              ? formatPrice((activePrices as any).ESSENCE.price)
              : '-'}
          </p>
          {(activePrices as any)?.ESSENCE && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('effectiveSince')}{' '}
              {formatDate((activePrices as any).ESSENCE.effectiveDate)}
            </p>
          )}
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-muted-foreground">
            <Fuel className="h-5 w-5" />
            <span className="text-sm font-medium">{t('gasoil')}</span>
          </div>
          <p className="text-2xl font-bold">
            {(activePrices as any)?.GASOIL
              ? formatPrice((activePrices as any).GASOIL.price)
              : '-'}
          </p>
          {(activePrices as any)?.GASOIL && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('effectiveSince')}{' '}
              {formatDate((activePrices as any).GASOIL.effectiveDate)}
            </p>
          )}
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-muted-foreground">
            <Fuel className="h-5 w-5" />
            <span className="text-sm font-medium">{t('petrole')}</span>
          </div>
          <p className="text-2xl font-bold">
            {(activePrices as any)?.PETROLE
              ? formatPrice((activePrices as any).PETROLE.price)
              : '-'}
          </p>
          {(activePrices as any)?.PETROLE && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('effectiveSince')}{' '}
              {formatDate((activePrices as any).PETROLE.effectiveDate)}
            </p>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <select
          value={filterFuelType}
          onChange={(e) => {
            setFilterFuelType(e.target.value);
            setPage(1);
          }}
          className="rounded-md border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">{t('allFuelTypes')}</option>
          <option value="ESSENCE">{t('essence')}</option>
          <option value="GASOIL">{t('gasoil')}</option>
          <option value="PETROLE">{t('petrole')}</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-md border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">{t('allStatuses')}</option>
          <option value="PENDING">{t('statusPending')}</option>
          <option value="APPROVED">{t('statusApproved')}</option>
          <option value="REJECTED">{t('statusRejected')}</option>
        </select>
      </div>

      {/* Desktop: DataTable */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={prices}
          keyExtractor={(p) => p.id}
          isLoading={isLoading}
          emptyMessage={t('noPrices')}
        />
      </div>

      {/* Mobile: Card layout */}
      <div className="grid gap-3 md:hidden">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {t('loading')}
          </div>
        ) : prices.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {t('noPrices')}
          </div>
        ) : (
          prices.map((p: FuelPrice) => (
            <div
              key={p.id}
              className={`rounded-xl border bg-card p-4 shadow-sm ${p.status === 'PENDING' ? 'border-amber-300 bg-amber-50' : ''
                }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Fuel className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">
                    {p.fuelType === 'ESSENCE' ? t('essence') : p.fuelType === 'PETROLE' ? t('petrole') : t('gasoil')}
                  </span>
                </div>
                {getStatusBadge(p)}
              </div>
              <p className="mb-2 text-xl font-bold">{formatPrice(p.price)}</p>
              <p className="text-sm text-muted-foreground">
                {t('effectiveDate')}: {formatDate(p.effectiveDate)}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('createdBy')}: {p.createdBy?.fullName}
              </p>
              {p.status === 'PENDING' &&
                canApprove &&
                p.createdById !== user?.userId && (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => handleApprove(p.id)}
                      disabled={approveMutation.isPending}
                      className="flex-1 rounded bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700"
                    >
                      {t('approve')}
                    </button>
                    <button
                      onClick={() => setShowRejectModal(p.id)}
                      className="flex-1 rounded bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700"
                    >
                      {t('reject')}
                    </button>
                  </div>
                )}
              {p.rejectedReason && (
                <p className="mt-2 text-sm text-red-600">
                  {t('reason')}: {p.rejectedReason}
                </p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between border-t pt-4 text-sm">
          <span className="text-muted-foreground">
            {t('showingResults', {
              from: (page - 1) * limit + 1,
              to: Math.min(page * limit, meta.total),
              total: meta.total,
            })}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-md border px-3 py-1.5 hover:bg-muted disabled:opacity-50"
            >
              {t('previous')}
            </button>
            <button
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={page >= meta.totalPages}
              className="rounded-md border px-3 py-1.5 hover:bg-muted disabled:opacity-50"
            >
              {t('next')}
            </button>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold">{t('rejectTitle')}</h2>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t('rejectReasonPlaceholder')}
              className="mb-4 w-full rounded-md border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              rows={4}
            />
            <p className="mb-4 text-xs text-muted-foreground">
              {t('minCharacters', { count: 10 })} ({rejectReason.length}/10)
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowRejectModal(null);
                  setRejectReason('');
                }}
                className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleReject}
                disabled={rejectReason.length < 10 || rejectMutation.isPending}
                className="rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                {t('confirmReject')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve Modal */}
      <Modal
        open={!!showApproveModal}
        title={t('approveTitle') || "Approuver ce prix"}
        description={t('confirmApprove') || "Êtes-vous sûr de vouloir approuver ce prix?"}
        confirmLabel={t('approve') || "Approuver"}
        onConfirm={confirmApprove}
        onCancel={() => setShowApproveModal(null)}
      />
    </div>
  );
}
