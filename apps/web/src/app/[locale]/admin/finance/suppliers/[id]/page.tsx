'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api-client';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Building2,
  Mail,
  Phone,
  MapPin,
  FileText,
  Save,
  Loader2,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  status: string;
  dueDate: string;
  createdAt: string;
}

interface Supplier {
  id: string;
  name: string;
  taxId: string;
  category: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  invoices: Invoice[];
  totalInvoices: number;
  createdAt: string;
  updatedAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  FUEL_SUPPLY: 'Fuel Supply',
  MAINTENANCE: 'Maintenance',
  UTILITIES: 'Utilities',
  EQUIPMENT: 'Equipment',
  OTHER: 'Other',
};

const INVOICE_STATUS_MAP: Record<string, { status: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; label: string }> = {
  PENDING_APPROVAL: { status: 'warning', label: 'Pending' },
  APPROVED: { status: 'info', label: 'Approved' },
  REJECTED: { status: 'danger', label: 'Rejected' },
  PAID: { status: 'success', label: 'Paid' },
};

const MANAGER_ROLES = ['SUPER_ADMIN', 'CEO', 'CFO', 'FINANCE_DIR'];
const DELETE_ROLES = ['SUPER_ADMIN', 'CFO'];

export default function SupplierDetailPage() {
  const t = useTranslations('Finance');
  const locale = useLocale();
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const supplierId = params.id as string;

  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Supplier>>({});

  const canManage = user && MANAGER_ROLES.includes(user.role);
  const canDelete = user && DELETE_ROLES.includes(user.role);

  // Fetch supplier
  const { data: supplier, isLoading, error } = useQuery({
    queryKey: ['suppliers', supplierId],
    queryFn: () => api.get<Supplier>(`/suppliers/${supplierId}`),
  });

  // Update mutation
  const updateSupplier = useMutation({
    mutationFn: (data: Partial<Supplier>) => api.patch(`/suppliers/${supplierId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers', supplierId] });
      setIsEditing(false);
    },
  });

  // Delete mutation
  const deleteSupplier = useMutation({
    mutationFn: () => api.delete(`/suppliers/${supplierId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      router.push(`/${locale}/admin/finance/suppliers`);
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !supplier) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">{t('suppliers.notFound')}</p>
        <Link
          href={`/${locale}/admin/finance/suppliers`}
          className="text-primary hover:underline"
        >
          {t('common.backToList')}
        </Link>
      </div>
    );
  }

  const sup = supplier as Supplier;

  const handleEdit = () => {
    setEditForm({
      name: sup.name,
      email: sup.email || '',
      phone: sup.phone || '',
      address: sup.address || '',
      isActive: sup.isActive,
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    updateSupplier.mutate(editForm);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditForm({});
  };

  const invoiceColumns = [
    {
      key: 'invoiceNumber',
      header: t('invoices.number'),
      render: (item: Invoice) => (
        <Link
          href={`/${locale}/admin/finance/invoices/${item.id}`}
          className="font-medium text-primary hover:underline"
        >
          #{item.invoiceNumber}
        </Link>
      ),
    },
    {
      key: 'amount',
      header: t('invoices.amount'),
      render: (item: Invoice) => (
        <span className="font-mono">
          {new Intl.NumberFormat('fr-CM', { style: 'currency', currency: 'XAF' }).format(item.amount)}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('invoices.status'),
      render: (item: Invoice) => {
        const statusInfo = INVOICE_STATUS_MAP[item.status] || { status: 'neutral', label: item.status };
        return <StatusBadge status={statusInfo.status} label={statusInfo.label} />;
      },
    },
    {
      key: 'dueDate',
      header: t('invoices.dueDate'),
      render: (item: Invoice) => new Date(item.dueDate).toLocaleDateString(),
    },
    {
      key: 'createdAt',
      header: t('invoices.submittedAt'),
      render: (item: Invoice) => new Date(item.createdAt).toLocaleDateString(),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={`/${locale}/admin/finance/suppliers`}
            className="rounded-lg p-2 hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{sup.name}</h1>
            <p className="text-muted-foreground">
              NIU: {sup.taxId} &bull; {CATEGORY_LABELS[sup.category] || sup.category}
            </p>
          </div>
        </div>
        {canManage && !isEditing && (
          <div className="flex gap-2">
            <button
              onClick={handleEdit}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted"
            >
              <Edit className="h-4 w-4" />
              {t('common.edit')}
            </button>
            {canDelete && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                {t('common.delete')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Status Badge */}
      <StatusBadge
        status={sup.isActive ? 'success' : 'neutral'}
        label={sup.isActive ? t('suppliers.active') : t('suppliers.inactive')}
      />

      {/* Info Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Contact Info */}
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="font-semibold">{t('suppliers.contactInfo')}</h2>
          
          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('suppliers.name')}</label>
                <input
                  type="text"
                  value={editForm.name || ''}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('suppliers.email')}</label>
                <input
                  type="email"
                  value={editForm.email || ''}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('suppliers.phone')}</label>
                <input
                  type="tel"
                  value={editForm.phone || ''}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('suppliers.address')}</label>
                <textarea
                  value={editForm.address || ''}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, address: e.target.value }))}
                  rows={2}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editForm.isActive}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                  className="rounded border"
                />
                <span className="text-sm">{t('suppliers.isActive')}</span>
              </label>
              <div className="flex gap-2">
                <button
                  onClick={handleCancel}
                  className="rounded-lg border px-3 py-2 text-sm hover:bg-muted"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={updateSupplier.isPending}
                  className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {updateSupplier.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {t('common.save')}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{sup.email || '-'}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{sup.phone || '-'}</span>
              </div>
              <div className="flex items-start gap-3 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span>{sup.address || '-'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="font-semibold">{t('suppliers.statistics')}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-2xl font-bold">{sup.totalInvoices}</p>
              <p className="text-sm text-muted-foreground">{t('suppliers.totalInvoices')}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('suppliers.createdAt')}</p>
              <p className="font-medium">{new Date(sup.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Invoices */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t('suppliers.recentInvoices')}
          </h2>
          <Link
            href={`/${locale}/admin/finance/invoices/new?supplierId=${supplierId}`}
            className="text-sm text-primary hover:underline"
          >
            {t('invoices.createNew')}
          </Link>
        </div>
        <DataTable
          columns={invoiceColumns}
          data={sup.invoices || []}
          keyExtractor={(item) => item.id}
          emptyMessage={t('suppliers.noInvoices')}
        />
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-background p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{t('suppliers.deleteConfirmTitle')}</h3>
              <button onClick={() => setShowDeleteConfirm(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-muted-foreground">{t('suppliers.deleteConfirmMessage')}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg border px-4 py-2 text-sm hover:bg-muted"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => deleteSupplier.mutate()}
                disabled={deleteSupplier.isPending}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteSupplier.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
