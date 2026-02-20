'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api-client';
import { StatusBadge } from '@/components/shared/status-badge';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import {
  ArrowLeft,
  FileText,
  Building2,
  Calendar,
  User,
  Check,
  X,
  DollarSign,
  Loader2,
  Download,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

interface ApprovalStep {
  id: string;
  role: string;
  action: 'APPROVE' | 'REJECT';
  comment: string | null;
  actedAt: string;
  user: {
    id: string;
    fullName: string;
  };
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  status: string;
  dueDate: string;
  fileUrl: string;
  proofOfPaymentUrl: string | null;
  rejectionReason: string | null;
  createdAt: string;
  supplier: {
    id: string;
    name: string;
    taxId: string;
    category: string;
  };
  submittedBy: {
    id: string;
    fullName: string;
    email: string;
  };
  approvedBy: {
    id: string;
    fullName: string;
  } | null;
  approvals: ApprovalStep[];
  requiredApprovers: string[];
  existingApprovals: string[];
  canApprove: boolean;
  canReject: boolean;
  canPay: boolean;
}

const STATUS_MAP: Record<string, { status: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; label: string }> = {
  DRAFT: { status: 'neutral', label: 'Draft' },
  PENDING_APPROVAL: { status: 'warning', label: 'Pending Approval' },
  APPROVED: { status: 'info', label: 'Approved' },
  REJECTED: { status: 'danger', label: 'Rejected' },
  PAID: { status: 'success', label: 'Paid' },
};

const ROLE_LABELS: Record<string, string> = {
  FINANCE_DIR: 'Finance Director',
  CFO: 'Chief Financial Officer',
  CEO: 'Chief Executive Officer',
  SUPER_ADMIN: 'Super Admin',
};

const INVOICE_THRESHOLD_CFO = 5_000_000;

export default function InvoiceDetailPage() {
  const t = useTranslations('Finance');
  const locale = useLocale();
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const invoiceId = params.id as string;

  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [approveComment, setApproveComment] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [paymentProofUrl, setPaymentProofUrl] = useState('');

  // Fetch invoice
  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ['invoices', invoiceId],
    queryFn: () => api.get<Invoice>(`/invoices/${invoiceId}`),
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: (comment: string) => api.put(`/invoices/${invoiceId}/approve`, { comment }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId] });
      setShowApproveModal(false);
      setApproveComment('');
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: (reason: string) => api.put(`/invoices/${invoiceId}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId] });
      setShowRejectModal(false);
      setRejectReason('');
    },
  });

  // Pay mutation
  const payMutation = useMutation({
    mutationFn: (proofOfPaymentUrl: string) => api.put(`/invoices/${invoiceId}/pay`, { proofOfPaymentUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId] });
      setShowPayModal(false);
      setPaymentProofUrl('');
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">{t('invoices.notFound')}</p>
        <Link href={`/${locale}/admin/finance/invoices`} className="text-primary hover:underline">
          {t('common.backToList')}
        </Link>
      </div>
    );
  }

  const inv = invoice as Invoice;
  const statusInfo = STATUS_MAP[inv.status] || { status: 'neutral', label: inv.status };
  const isHighValue = inv.amount >= INVOICE_THRESHOLD_CFO;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-CM', {
      style: 'currency',
      currency: 'XAF',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Build approval timeline steps
  const timelineSteps = inv.requiredApprovers.map((role) => {
    const approval = inv.approvals.find((a) => a.role === role && a.action === 'APPROVE');
    const rejection = inv.approvals.find((a) => a.role === role && a.action === 'REJECT');
    
    if (rejection) {
      return {
        role,
        status: 'rejected' as const,
        user: rejection.user,
        timestamp: rejection.actedAt,
        comment: rejection.comment,
      };
    }
    
    if (approval) {
      return {
        role,
        status: 'approved' as const,
        user: approval.user,
        timestamp: approval.actedAt,
        comment: approval.comment,
      };
    }
    
    return {
      role,
      status: 'pending' as const,
      user: null,
      timestamp: null,
      comment: null,
    };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/${locale}/admin/finance/invoices`} className="rounded-lg p-2 hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6" />
              {t('invoices.invoice')} #{inv.invoiceNumber}
            </h1>
            <p className="text-muted-foreground">
              {inv.supplier.name} &bull; {formatCurrency(inv.amount)}
            </p>
          </div>
        </div>
        <StatusBadge status={statusInfo.status} label={statusInfo.label} />
      </div>

      {/* High Value Warning */}
      {isHighValue && inv.status === 'PENDING_APPROVAL' && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <AlertCircle className="h-5 w-5 text-amber-600" />
          <div>
            <p className="font-medium text-amber-800">{t('invoices.highValueInvoice')}</p>
            <p className="text-sm text-amber-700">{t('invoices.requiresCfoAndCeoApproval')}</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Invoice Details Card */}
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <h2 className="font-semibold">{t('invoices.details')}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">{t('invoices.supplier')}</p>
                  <Link
                    href={`/${locale}/admin/finance/suppliers/${inv.supplier.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {inv.supplier.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{inv.supplier.taxId}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <DollarSign className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">{t('invoices.amount')}</p>
                  <p className="font-mono text-lg font-bold">{formatCurrency(inv.amount)}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">{t('invoices.dueDate')}</p>
                  <p className="font-medium">{new Date(inv.dueDate).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">{t('invoices.submittedBy')}</p>
                  <p className="font-medium">{inv.submittedBy.fullName}</p>
                  <p className="text-xs text-muted-foreground">{new Date(inv.createdAt).toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* File Download */}
            <div className="flex items-center gap-4 pt-4 border-t">
              <a
                href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}${inv.fileUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-muted"
              >
                <Download className="h-4 w-4" />
                {t('invoices.viewDocument')}
              </a>
              {inv.proofOfPaymentUrl && (
                <a
                  href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}${inv.proofOfPaymentUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-muted"
                >
                  <Download className="h-4 w-4" />
                  {t('invoices.viewPaymentProof')}
                </a>
              )}
            </div>
          </div>

          {/* Rejection Reason */}
          {inv.status === 'REJECTED' && inv.rejectionReason && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <h3 className="flex items-center gap-2 font-semibold text-red-800">
                <XCircle className="h-5 w-5" />
                {t('invoices.rejectionReason')}
              </h3>
              <p className="mt-2 text-red-700">{inv.rejectionReason}</p>
            </div>
          )}

          {/* Actions */}
          {(inv.canApprove || inv.canReject || inv.canPay) && (
            <div className="flex gap-3">
              {inv.canApprove && (
                <button
                  onClick={() => setShowApproveModal(true)}
                  className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  <Check className="h-4 w-4" />
                  {t('invoices.approve')}
                </button>
              )}
              {inv.canReject && (
                <button
                  onClick={() => setShowRejectModal(true)}
                  className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  <X className="h-4 w-4" />
                  {t('invoices.reject')}
                </button>
              )}
              {inv.canPay && (
                <button
                  onClick={() => setShowPayModal(true)}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <DollarSign className="h-4 w-4" />
                  {t('invoices.markAsPaid')}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Approval Timeline */}
        <div className="space-y-6">
          <div className="rounded-lg border bg-card p-6">
            <h2 className="font-semibold mb-4">{t('invoices.approvalTimeline')}</h2>
            <div className="space-y-4">
              {timelineSteps.map((step, index) => (
                <div key={step.role} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${
                        step.status === 'approved'
                          ? 'bg-green-100 text-green-600'
                          : step.status === 'rejected'
                          ? 'bg-red-100 text-red-600'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {step.status === 'approved' ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : step.status === 'rejected' ? (
                        <XCircle className="h-5 w-5" />
                      ) : (
                        <Clock className="h-5 w-5" />
                      )}
                    </div>
                    {index < timelineSteps.length - 1 && (
                      <div className={`w-0.5 flex-1 mt-2 ${
                        step.status === 'approved' ? 'bg-green-200' : 'bg-muted'
                      }`} />
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    <p className="font-medium">{ROLE_LABELS[step.role] || step.role}</p>
                    {step.status === 'pending' ? (
                      <p className="text-sm text-muted-foreground">{t('invoices.pendingApproval')}</p>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground">
                          {step.user?.fullName} &bull; {new Date(step.timestamp!).toLocaleString()}
                        </p>
                        {step.comment && (
                          <p className="mt-1 text-sm italic">"{step.comment}"</p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Approve Modal */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-background p-6 space-y-4">
            <h3 className="text-lg font-semibold">{t('invoices.approveInvoice')}</h3>
            <p className="text-muted-foreground">{t('invoices.approveConfirmMessage')}</p>
            <div>
              <label className="block text-sm font-medium mb-1">{t('invoices.comment')}</label>
              <textarea
                value={approveComment}
                onChange={(e) => setApproveComment(e.target.value)}
                rows={3}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder={t('invoices.commentPlaceholder')}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowApproveModal(false)}
                className="rounded-lg border px-4 py-2 text-sm hover:bg-muted"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => approveMutation.mutate(approveComment)}
                disabled={approveMutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
              >
                {approveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('invoices.approve')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-background p-6 space-y-4">
            <h3 className="text-lg font-semibold">{t('invoices.rejectInvoice')}</h3>
            <p className="text-muted-foreground">{t('invoices.rejectConfirmMessage')}</p>
            <div>
              <label className="block text-sm font-medium mb-1">{t('invoices.reason')} *</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder={t('invoices.reasonPlaceholder')}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowRejectModal(false)}
                className="rounded-lg border px-4 py-2 text-sm hover:bg-muted"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => rejectMutation.mutate(rejectReason)}
                disabled={rejectMutation.isPending || rejectReason.length < 10}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                {rejectMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('invoices.reject')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pay Modal */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-background p-6 space-y-4">
            <h3 className="text-lg font-semibold">{t('invoices.markAsPaid')}</h3>
            <p className="text-muted-foreground">{t('invoices.payConfirmMessage')}</p>
            <div>
              <label className="block text-sm font-medium mb-1">{t('invoices.paymentProofUrl')} *</label>
              <input
                type="text"
                value={paymentProofUrl}
                onChange={(e) => setPaymentProofUrl(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder={t('invoices.paymentProofUrlPlaceholder')}
              />
              <p className="mt-1 text-xs text-muted-foreground">{t('invoices.paymentProofHint')}</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowPayModal(false)}
                className="rounded-lg border px-4 py-2 text-sm hover:bg-muted"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => payMutation.mutate(paymentProofUrl)}
                disabled={payMutation.isPending || !paymentProofUrl}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {payMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('invoices.confirmPayment')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
