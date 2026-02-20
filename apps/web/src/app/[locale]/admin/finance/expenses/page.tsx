'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { handleQueryError } from '@/lib/use-mutation-toast';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Building2,
  User,
  Calendar,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { CsvDownloadButton } from '@/components/shared/csv-download-button';

interface Expense {
  id: string;
  title: string;
  amount: number;
  category: 'MAINTENANCE' | 'UTILITIES' | 'SUPPLIES' | 'TRANSPORT' | 'PERSONNEL' | 'MISCELLANEOUS';
  status: 'SUBMITTED' | 'PENDING_MANAGER' | 'PENDING_FINANCE' | 'APPROVED' | 'REJECTED' | 'DISBURSED';
  createdAt: string;
  requester: {
    id: string;
    fullName: string;
  };
  station?: {
    id: string;
    name: string;
    code: string;
  };
}

interface ExpensesResponse {
  data: Expense[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const STATUS_MAP: Record<string, { status: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; labelKey: string }> = {
  SUBMITTED: { status: 'info', labelKey: 'submitted' },
  PENDING_MANAGER: { status: 'warning', labelKey: 'pendingManager' },
  PENDING_FINANCE: { status: 'warning', labelKey: 'pendingFinance' },
  APPROVED: { status: 'info', labelKey: 'approved' },
  REJECTED: { status: 'danger', labelKey: 'rejected' },
  DISBURSED: { status: 'success', labelKey: 'disbursed' },
};

const CATEGORY_MAP: Record<string, { labelKey: string; emoji: string }> = {
  MAINTENANCE: { labelKey: 'categoryMaintenance', emoji: '🔧' },
  UTILITIES: { labelKey: 'categoryUtilities', emoji: '💡' },
  SUPPLIES: { labelKey: 'categorySupplies', emoji: '📦' },
  TRANSPORT: { labelKey: 'categoryTransport', emoji: '🚗' },
  PERSONNEL: { labelKey: 'categoryPersonnel', emoji: '👤' },
  MISCELLANEOUS: { labelKey: 'categoryMiscellaneous', emoji: '📋' },
};

export default function ExpensesPage() {
  const t = useTranslations('Finance');
  const tErrors = useTranslations('Errors');
  const locale = useLocale();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const limit = 20;

  // Build query params
  const queryParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(filterStatus && { status: filterStatus }),
    ...(filterCategory && { category: filterCategory }),
  });

  // Fetch expenses
  const { data: expensesData, isLoading, error, refetch } = useQuery({
    queryKey: ['expenses', page, filterStatus, filterCategory],
    queryFn: () => api.get<ExpensesResponse>(`/expenses?${queryParams}`),
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

  const expenses = Array.isArray(expensesData) ? expensesData : (expensesData as any)?.data || [];
  const meta = (expensesData as any)?.meta || { total: 0, page: 1, totalPages: 0 };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-CM', {
      style: 'currency',
      currency: 'XAF',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const columns = [
    {
      key: 'title',
      header: t('expenses.title'),
      render: (item: Expense) => (
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{item.title}</span>
        </div>
      ),
    },
    {
      key: 'requester',
      header: t('expenses.requester'),
      render: (item: Expense) => (
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <span>{item.requester?.fullName || '-'}</span>
        </div>
      ),
    },
    {
      key: 'station',
      header: t('expenses.station'),
      render: (item: Expense) => (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span>{item.station?.name || t('expenses.headOffice')}</span>
        </div>
      ),
    },
    {
      key: 'amount',
      header: t('expenses.amount'),
      render: (item: Expense) => (
        <span className="font-mono font-medium">{formatCurrency(item.amount)}</span>
      ),
    },
    {
      key: 'category',
      header: t('expenses.category'),
      render: (item: Expense) => {
        const cat = CATEGORY_MAP[item.category] || { labelKey: 'categoryMiscellaneous', emoji: '📋' };
        return (
          <span className="flex items-center gap-1">
            <span>{cat.emoji}</span>
            <span>{t(`expenses.${cat.labelKey}`)}</span>
          </span>
        );
      },
    },
    {
      key: 'status',
      header: t('expenses.status'),
      render: (item: Expense) => {
        const statusInfo = STATUS_MAP[item.status] || { status: 'neutral', labelKey: item.status.toLowerCase() };
        return <StatusBadge status={statusInfo.status} label={t(`expenses.${statusInfo.labelKey}`)} />;
      },
    },
    {
      key: 'createdAt',
      header: t('expenses.submittedAt'),
      render: (item: Expense) => (
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span>{new Date(item.createdAt).toLocaleDateString()}</span>
        </div>
      ),
    },
  ];

  const handleRowClick = (item: Expense) => {
    router.push(`/${locale}/admin/finance/expenses/${item.id}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('expenses.pageTitle')}</h1>
          <p className="text-muted-foreground">{t('expenses.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <CsvDownloadButton
            endpoint={`/exports/expenses?${filterStatus ? `status=${filterStatus}` : ''}`}
            filename="expenses_export.csv"
          />
          <Link
            href={`/${locale}/admin/finance/expenses/new`}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t('expenses.newExpense')}
          </Link>
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
          <option value="">{t('expenses.allStatuses')}</option>
          {Object.entries(STATUS_MAP).map(([key, { labelKey }]) => (
            <option key={key} value={key}>
              {t(`expenses.${labelKey}`)}
            </option>
          ))}
        </select>
        <select
          value={filterCategory}
          onChange={(e) => {
            setFilterCategory(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">{t('expenses.allCategories')}</option>
          {Object.entries(CATEGORY_MAP).map(([key, { labelKey }]) => (
            <option key={key} value={key}>
              {t(`expenses.${labelKey}`)}
            </option>
          ))}
        </select>
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={expenses}
        keyExtractor={(item) => item.id}
        onRowClick={handleRowClick}
        emptyMessage={t('expenses.noExpenses')}
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
