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
  Building2,
  FileText,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

interface Supplier {
  id: string;
  name: string;
  taxId: string;
  category: 'FUEL_SUPPLY' | 'MAINTENANCE' | 'UTILITIES' | 'EQUIPMENT' | 'OTHER';
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  invoiceCount: number;
  pendingInvoiceCount: number;
  createdAt: string;
}

interface SuppliersResponse {
  data: Supplier[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const CATEGORY_LABELS: Record<string, string> = {
  FUEL_SUPPLY: 'Fuel Supply',
  MAINTENANCE: 'Maintenance',
  UTILITIES: 'Utilities',
  EQUIPMENT: 'Equipment',
  OTHER: 'Other',
};

const MANAGER_ROLES = ['SUPER_ADMIN', 'CEO', 'CFO', 'FINANCE_DIR'];

export default function SuppliersPage() {
  const t = useTranslations('Finance');
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterActive, setFilterActive] = useState<string>('');
  const limit = 20;

  const canManage = user && MANAGER_ROLES.includes(user.role);

  // Build query params
  const queryParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(search && { search }),
    ...(filterCategory && { category: filterCategory }),
    ...(filterActive && { isActive: filterActive }),
  });

  // Fetch suppliers
  const { data: suppliersData, isLoading } = useQuery({
    queryKey: ['suppliers', page, search, filterCategory, filterActive],
    queryFn: () => api.get<SuppliersResponse>(`/suppliers?${queryParams}`),
  });

  const suppliers = (suppliersData as any) || [];
  const meta = (suppliersData as any)?.meta || { total: 0, page: 1, totalPages: 0 };

  const columns = [
    {
      key: 'name',
      header: t('suppliers.name'),
      render: (item: Supplier) => (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{item.name}</span>
        </div>
      ),
    },
    {
      key: 'taxId',
      header: t('suppliers.taxId'),
      render: (item: Supplier) => (
        <span className="font-mono text-sm">{item.taxId}</span>
      ),
    },
    {
      key: 'category',
      header: t('suppliers.category'),
      render: (item: Supplier) => CATEGORY_LABELS[item.category] || item.category,
    },
    {
      key: 'email',
      header: t('suppliers.email'),
      render: (item: Supplier) => item.email || '-',
    },
    {
      key: 'invoiceCount',
      header: t('suppliers.invoices'),
      render: (item: Supplier) => (
        <div className="flex items-center gap-1">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span>{item.invoiceCount}</span>
          {item.pendingInvoiceCount > 0 && (
            <StatusBadge status="warning" label={`${item.pendingInvoiceCount} pending`} />
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: t('suppliers.status'),
      render: (item: Supplier) => (
        <StatusBadge
          status={item.isActive ? 'success' : 'neutral'}
          label={item.isActive ? t('suppliers.active') : t('suppliers.inactive')}
        />
      ),
    },
  ];

  const handleRowClick = (item: Supplier) => {
    router.push(`/${locale}/admin/finance/suppliers/${item.id}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('suppliers.title')}</h1>
          <p className="text-muted-foreground">{t('suppliers.subtitle')}</p>
        </div>
        {canManage && (
          <Link
            href={`/${locale}/admin/finance/suppliers/new`}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t('suppliers.newSupplier')}
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('suppliers.searchPlaceholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border bg-background px-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <select
          value={filterCategory}
          onChange={(e) => {
            setFilterCategory(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">{t('suppliers.allCategories')}</option>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={filterActive}
          onChange={(e) => {
            setFilterActive(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">{t('suppliers.allStatuses')}</option>
          <option value="true">{t('suppliers.active')}</option>
          <option value="false">{t('suppliers.inactive')}</option>
        </select>
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={Array.isArray(suppliers) ? suppliers : []}
        keyExtractor={(item) => item.id}
        onRowClick={handleRowClick}
        emptyMessage={t('suppliers.noSuppliers')}
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
