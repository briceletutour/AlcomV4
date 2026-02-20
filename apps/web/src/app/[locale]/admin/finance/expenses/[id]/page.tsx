'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useTranslations, useLocale } from 'next-intl';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  ArrowLeft,
  Loader2,
  CheckCircle,
  XCircle,
  Banknote,
  User,
  Building2,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth-store';

interface ApprovalStep {
  id: string;
  role: string;
  action: 'APPROVE' | 'REJECT';
  comment?: string;
  actedAt: string;
  user: {
    id: string;
    fullName: string;
  };
}

interface Expense {
  id: string;
  title: string;
  amount: number;
  category: string;
  status: string;
  rejectionReason?: string;
  disbursementMethod?: string;
  disbursedAt?: string;
  createdAt: string;
  requester: {
    id: string;
    fullName: string;
    email: string;
  };
  station?: {
    id: string;
    name: string;
    code: string;
  };
  approvals: ApprovalStep[];
  canApprove: boolean;
  canReject: boolean;
  canDisburse: boolean;
  hasLineManagerApproval: boolean;
  approvedRoles: string[];
  nextApproverRoles: string[];
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

const EXPENSE_THRESHOLD_CFO = 5_000_000;

export default function ExpenseDetailPage() {
  const t = useTranslations('Finance');
  const locale = useLocale();
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const expenseId = params.id as string;

  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showDisburseDialog, setShowDisburseDialog] = useState(false);
  const [comment, setComment] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [disbursementMethod, setDisbursementMethod] = useState<'PETTY_CASH' | 'BANK_TRANSFER'>('PETTY_CASH');

  // Fetch expense detail
  const { data: expense, isLoading, error } = useQuery<Expense>({
    queryKey: ['expense', expenseId],
    queryFn: () => api.get(`/expenses/${expenseId}`),
    enabled: !!expenseId,
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: () => api.put(`/expenses/${expenseId}/approve`, { comment }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense', expenseId] });
      setShowApproveDialog(false);
      setComment('');
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: () => api.put(`/expenses/${expenseId}/reject`, { reason: rejectReason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense', expenseId] });
      setShowRejectDialog(false);
      setRejectReason('');
    },
  });

  // Disburse mutation
  const disburseMutation = useMutation({
    mutationFn: () => api.put(`/expenses/${expenseId}/disburse`, { method: disbursementMethod }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense', expenseId] });
      setShowDisburseDialog(false);
    },
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-CM', {
      style: 'currency',
      currency: 'XAF',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-CM', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !expense) {
    return (
      <div className="space-y-4">
        <Link
          href={`/${locale}/admin/finance/expenses`}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('common.backToList')}
        </Link>
        <div className="rounded-lg bg-destructive/10 p-4 text-destructive">
          {t('expenses.notFound')}
        </div>
      </div>
    );
  }

  const statusInfo = STATUS_MAP[expense.status] || { status: 'neutral', labelKey: expense.status.toLowerCase() };
  const categoryInfo = CATEGORY_MAP[expense.category] || { labelKey: 'categoryMiscellaneous', emoji: '📋' };
  const isHighValue = expense.amount >= EXPENSE_THRESHOLD_CFO;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/${locale}/admin/finance/expenses`}
          className="rounded-lg p-2 hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{expense.title}</h1>
          <div className="mt-1 flex items-center gap-4">
            <StatusBadge status={statusInfo.status} label={t(`expenses.${statusInfo.labelKey}`)} />
            <span className="text-sm text-muted-foreground">
              {t('expenses.submittedAt')}: {formatDate(expense.createdAt)}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold">{formatCurrency(expense.amount)}</p>
        </div>
      </div>

      {/* High Value Warning */}
      {isHighValue && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <div>
            <h3 className="font-medium text-amber-800 dark:text-amber-200">
              {t('expenses.highValueExpense')}
            </h3>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              {t('expenses.requiresCfoAndCeoApproval')}
            </p>
          </div>
        </div>
      )}

      {/* Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Details Card */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">{t('expenses.details')}</h2>
          <dl className="space-y-4">
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-muted-foreground" />
              <div>
                <dt className="text-sm text-muted-foreground">{t('expenses.requester')}</dt>
                <dd className="font-medium">{expense.requester.fullName}</dd>
                <dd className="text-sm text-muted-foreground">{expense.requester.email}</dd>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <dt className="text-sm text-muted-foreground">{t('expenses.station')}</dt>
                <dd className="font-medium">
                  {expense.station ? `${expense.station.name} (${expense.station.code})` : t('expenses.headOffice')}
                </dd>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xl">{categoryInfo.emoji}</span>
              <div>
                <dt className="text-sm text-muted-foreground">{t('expenses.category')}</dt>
                <dd className="font-medium">{t(`expenses.${categoryInfo.labelKey}`)}</dd>
              </div>
            </div>

            {expense.disbursementMethod && (
              <div className="flex items-center gap-3">
                <Banknote className="h-5 w-5 text-muted-foreground" />
                <div>
                  <dt className="text-sm text-muted-foreground">{t('expenses.disbursementMethod')}</dt>
                  <dd className="font-medium">
                    {expense.disbursementMethod === 'PETTY_CASH'
                      ? t('expenses.pettyCash')
                      : t('expenses.bankTransfer')}
                  </dd>
                  {expense.disbursedAt && (
                    <dd className="text-sm text-muted-foreground">
                      {formatDate(expense.disbursedAt)}
                    </dd>
                  )}
                </div>
              </div>
            )}

            {expense.rejectionReason && (
              <div className="mt-4 rounded-lg bg-destructive/10 p-4">
                <dt className="font-medium text-destructive">{t('expenses.rejectionReason')}</dt>
                <dd className="mt-1 text-sm">{expense.rejectionReason}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Approval Timeline */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">{t('expenses.approvalTimeline')}</h2>
          
          {expense.approvals.length > 0 ? (
            <div className="space-y-4">
              {expense.approvals.map((approval, index) => (
                <div key={approval.id} className="flex items-start gap-3">
                  <div
                    className={`mt-1 rounded-full p-1 ${
                      approval.action === 'APPROVE'
                        ? 'bg-green-100 text-green-600'
                        : 'bg-red-100 text-red-600'
                    }`}
                  >
                    {approval.action === 'APPROVE' ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">
                      {approval.user.fullName}{' '}
                      <span className="text-sm text-muted-foreground">({approval.role})</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {approval.action === 'APPROVE' ? t('expenses.approved') : t('expenses.rejected')}
                      {' — '}
                      {formatDate(approval.actedAt)}
                    </p>
                    {approval.comment && (
                      <p className="mt-1 text-sm italic text-muted-foreground">
                        "{approval.comment}"
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-5 w-5" />
              <span>{t('expenses.pendingApproval')}</span>
            </div>
          )}

          {expense.nextApproverRoles.length > 0 && expense.status !== 'APPROVED' && expense.status !== 'REJECTED' && expense.status !== 'DISBURSED' && (
            <div className="mt-4 border-t pt-4">
              <p className="text-sm text-muted-foreground">{t('expenses.nextApprover')}:</p>
              <p className="font-medium">
                {expense.nextApproverRoles.join(' / ')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      {(expense.canApprove || expense.canReject || expense.canDisburse) && (
        <div className="flex gap-4 rounded-lg border bg-card p-4">
          {expense.canApprove && (
            <button
              onClick={() => setShowApproveDialog(true)}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4" />
              {t('expenses.approve')}
            </button>
          )}
          {expense.canReject && (
            <button
              onClick={() => setShowRejectDialog(true)}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              <XCircle className="h-4 w-4" />
              {t('expenses.reject')}
            </button>
          )}
          {expense.canDisburse && (
            <button
              onClick={() => setShowDisburseDialog(true)}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Banknote className="h-4 w-4" />
              {t('expenses.disburse')}
            </button>
          )}
        </div>
      )}

      {/* Approve Dialog */}
      {showApproveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-background p-6">
            <h3 className="text-lg font-semibold">{t('expenses.approveExpense')}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{t('expenses.approveConfirmMessage')}</p>
            <div className="mt-4 space-y-2">
              <label className="text-sm font-medium">{t('expenses.comment')}</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t('expenses.commentPlaceholder')}
                rows={3}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowApproveDialog(false)}
                className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {approveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('expenses.approve')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Dialog */}
      {showRejectDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-background p-6">
            <h3 className="text-lg font-semibold">{t('expenses.rejectExpense')}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{t('expenses.rejectConfirmMessage')}</p>
            <div className="mt-4 space-y-2">
              <label className="text-sm font-medium">
                {t('expenses.reason')} <span className="text-destructive">*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={t('expenses.reasonPlaceholder')}
                rows={3}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-muted-foreground">{t('expenses.minCharacters', { count: 10 })}</p>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowRejectDialog(false)}
                className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => rejectMutation.mutate()}
                disabled={rejectMutation.isPending || rejectReason.length < 10}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {rejectMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('expenses.reject')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disburse Dialog */}
      {showDisburseDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-background p-6">
            <h3 className="text-lg font-semibold">{t('expenses.disburseExpense')}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{t('expenses.disburseConfirmMessage')}</p>
            <div className="mt-4 space-y-2">
              <label className="text-sm font-medium">{t('expenses.disbursementMethod')}</label>
              <select
                value={disbursementMethod}
                onChange={(e) => setDisbursementMethod(e.target.value as 'PETTY_CASH' | 'BANK_TRANSFER')}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="PETTY_CASH">{t('expenses.pettyCash')}</option>
                <option value="BANK_TRANSFER">{t('expenses.bankTransfer')}</option>
              </select>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowDisburseDialog(false)}
                className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => disburseMutation.mutate()}
                disabled={disburseMutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {disburseMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('expenses.confirmDisburse')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
