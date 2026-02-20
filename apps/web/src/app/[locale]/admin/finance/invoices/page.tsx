'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
  Building2,
  Calendar,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { CsvDownloadButton } from '@/components/shared/csv-download-button';

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'PAID';
  dueDate: string;
  createdAt: string;
  supplier: {
    id: string;
    name: string;
    taxId: string;
  };
  submittedBy: {
    id: string;
    fullName: string;
  };
}

interface InvoicesResponse {
  data: Invoice[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const STATUS_MAP: Record<string, { status: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; label: string }> = {
  DRAFT: { status: 'neutral', label: 'Draft' },
  PENDING_APPROVAL: { status: 'warning', label: 'Pending Approval' },
  APPROVED: { status: 'info', label: 'Approved' },
  REJECTED: { status: 'danger', label: 'Rejected' },
  PAID: { status: 'success', label: 'Paid' },
};

const CAN_CREATE_ROLES = ['SUPER_ADMIN', 'CEO', 'CFO', 'FINANCE_DIR', 'LOGISTICS', 'DCO'];

export default function InvoicesPage() {
  const t = useTranslations('Finance');
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterSupplierId, setFilterSupplierId] = useState<string>('');
  const limit = 20;

  const canCreate = user && CAN_CREATE_ROLES.includes(user.role);

  // Build query params
  const queryParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(filterStatus && { status: filterStatus }),
    ...(filterSupplierId && { supplierId: filterSupplierId }),
  });

  // Fetch invoices
  const { data: invoicesData, isLoading, error } = useQuery({
    queryKey: ['invoices', page, filterStatus, filterSupplierId],
    queryFn: () => api.get<InvoicesResponse>(`/invoices?${queryParams}`),
  });

  // Fix: Extract data properly from the response
  const responseData = invoicesData as unknown as InvoicesResponse;
  const invoices = responseData?.data || [];
  const meta = responseData?.meta || { total: 0, page: 1, totalPages: 0 };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-CM', { 
      style: 'currency', 
      currency: 'XAF',
      maximumFractionDigits: 0 
    }).format(amount);
  };

  const columns = [
    {
      key: 'invoiceNumber',
      header: t('invoices.number'),
      render: (item: Invoice) => (
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">#{item.invoiceNumber}</span>
        </div>
      ),
    },
    {
      key: 'supplier',
      header: t('invoices.supplier'),
      render: (item: Invoice) => (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="font-medium">{item.supplier.name}</p>
            <p className="text-xs text-muted-foreground">{item.supplier.taxId}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'amount',
      header: t('invoices.amount'),
      render: (item: Invoice) => (
        <span className="font-mono font-medium">{formatCurrency(item.amount)}</span>
      ),
    },
    {
      key: 'status',
      header: t('invoices.status'),
      render: (item: Invoice) => {
        const statusInfo = STATUS_MAP[item.status] || { status: 'neutral', label: item.status };
        return <StatusBadge status={statusInfo.status} label={statusInfo.label} />;
      },
    },
    {
      key: 'dueDate',
      header: t('invoices.dueDate'),
      render: (item: Invoice) => (
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span>{new Date(item.dueDate).toLocaleDateString()}</span>
        </div>
      ),
    },
    {
      key: 'submittedBy',
      header: t('invoices.submittedBy'),
      render: (item: Invoice) => item.submittedBy?.fullName || '-',
    },
    {
      key: 'createdAt',
      header: t('invoices.submittedAt'),
      render: (item: Invoice) => new Date(item.createdAt).toLocaleDateString(),
    },
  ];

  const handleRowClick = (item: Invoice) => {
    router.push(`/${locale}/admin/finance/invoices/${item.id}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('invoices.title')}</h1>
          <p className="text-muted-foreground">{t('invoices.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <CsvDownloadButton
            endpoint={`/exports/invoices?${filterStatus ? `status=${filterStatus}` : ''}`}
            filename="invoices_export.csv"
          />
          {canCreate && (
            <Link
              href={`/${locale}/admin/finance/invoices/new`}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              {t('invoices.newInvoice')}
            </Link>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">{t('invoices.allStatuses')}</option>
          {Object.entries(STATUS_MAP).map(([key, { label }]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {t('invoices.error')}
        </div>
      )}

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={Array.isArray(invoices) ? invoices : []}
        keyExtractor={(item) => item.id}
        onRowClick={handleRowClick}
        emptyMessage={t('invoices.noInvoices')}
        isLoading={isLoading}
      />

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('common.showingResults', {
              from: (page - 1) * limit + 1,
              to: Math.min(page * limit, meta.total),
              total: meta.total,
            })}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              {t('common.previous')}
            </button>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= meta.totalPages}
              className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
            >
              {t('common.next')}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
