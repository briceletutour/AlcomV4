'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api-client';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { ArrowLeft, Check, X, AlertCircle, Camera, ExternalLink } from 'lucide-react';
import { StatusBadge } from '@/components/shared/status-badge';
import Link from 'next/link';
import { toast } from 'sonner';

interface ChecklistDetail {
  id: string;
  stationId: string;
  templateId: string;
  templateVersion: number;
  shiftDate: string;
  shiftType: 'MORNING' | 'EVENING';
  computedScore: number;
  status: 'DRAFT' | 'PENDING_VALIDATION' | 'VALIDATED' | 'REJECTED';
  items: Array<{
    itemId: string;
    status: 'CONFORME' | 'NON_CONFORME';
    comment?: string;
    photoUrl?: string;
    rejectionComment?: string;
  }>;
  createdAt: string;
  station: { name: string; code: string };
  template: {
    name: string;
    version: number;
    categories: Array<{
      name: string;
      items: Array<{ id: string; label: string; labelFr: string }>;
    }>;
  };
  submittedBy: { id: string; fullName: string };
  validatedBy?: { id: string; fullName: string };
  incidents: Array<{
    id: string;
    category: string;
    description: string;
    status: string;
    createdAt: string;
  }>;
}

const statusMap: Record<string, { status: 'success' | 'warning' | 'error' | 'neutral'; key: string }> = {
  DRAFT: { status: 'neutral', key: 'statusDraft' },
  PENDING_VALIDATION: { status: 'warning', key: 'statusPending' },
  VALIDATED: { status: 'success', key: 'statusValidated' },
  REJECTED: { status: 'error', key: 'statusRejected' },
};

export default function ChecklistDetailPage() {
  const t = useTranslations('Checklists');
  const tIncidents = useTranslations('Incidents');
  const locale = useLocale();
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const checklistId = params.id as string;

  const { data, isLoading } = useQuery({
    queryKey: ['checklist', checklistId],
    queryFn: () => api.get<ChecklistDetail>(`/checklists/${checklistId}`),
  });

  const checklist = data as unknown as ChecklistDetail;

  const validateMutation = useMutation({
    mutationFn: (payload: { action: 'approve' | 'reject'; comment?: string }) =>
      api.put(`/checklists/${checklistId}/validate`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist', checklistId] });
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
      setShowRejectModal(false);
    },
    onError: (error: ApiError) => {
      toast.error(error.message);
    },
  });

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600 bg-green-50';
    if (score >= 70) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  // Build item lookup from template
  const itemLookup: Record<string, { label: string; labelFr: string; category: string }> = {};
  // Handle both nested { categories: [...] } and direct [...] structure
  const templateCategories = checklist?.template?.categories;
  const categoriesArray = Array.isArray(templateCategories) 
    ? templateCategories 
    : (templateCategories as any)?.categories && Array.isArray((templateCategories as any).categories)
      ? (templateCategories as any).categories
      : [];
  categoriesArray.forEach((cat: any) => {
    if (Array.isArray(cat.items)) {
      cat.items.forEach((item: any) => {
        itemLookup[item.id] = { ...item, category: cat.name };
      });
    }
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!checklist) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">{t('notFound')}</p>
        <Link href={`/${locale}/admin/checklists`} className="text-primary hover:underline">
          Back to list
        </Link>
      </div>
    );
  }

  const statusInfo = statusMap[checklist.status] || statusMap.DRAFT;
  const canValidate = checklist.status === 'PENDING_VALIDATION';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/${locale}/admin/checklists`} className="rounded-md p-2 hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{t('detail.checklistDetails')}</h1>
          <p className="text-sm text-muted-foreground">
            {checklist.station.name} • {new Date(checklist.shiftDate).toLocaleDateString(locale)} •{' '}
            {checklist.shiftType === 'MORNING' ? t('morning') : t('evening')}
          </p>
        </div>
        <StatusBadge status={statusInfo.status} label={t(statusInfo.key)} />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-red-600">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Score Card */}
      <div className="rounded-xl border p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{t('template')}: {checklist.template.name}</p>
            <p className="text-sm text-muted-foreground">{t('submittedBy')}: {checklist.submittedBy.fullName}</p>
            {checklist.validatedBy && (
              <p className="text-sm text-muted-foreground">{t('validatedBy')}: {checklist.validatedBy.fullName}</p>
            )}
          </div>
          <div
            className={`flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold ${getScoreColor(checklist.computedScore)}`}
          >
            {checklist.computedScore}%
          </div>
        </div>
      </div>

      {/* Items by Category */}
      <div className="space-y-4">
        {categoriesArray.map((category: any) => {
          // Handle items as { responses: [...] } or direct array
          const checklistItems = Array.isArray(checklist.items) 
            ? checklist.items 
            : (checklist.items as any)?.responses || [];
          const categoryItems = checklistItems.filter((item: any) =>
            (Array.isArray(category.items) ? category.items : []).some((ci: any) => ci.id === item.itemId)
          );

          return (
            <div key={category.name} className="rounded-xl border">
              <div className="border-b bg-muted/50 px-4 py-3">
                <h3 className="font-semibold">{category.name}</h3>
              </div>
              <div className="divide-y">
                {(Array.isArray(category.items) ? category.items : []).map((templateItem: any) => {
                  const response = checklistItems.find((i: any) => i.itemId === templateItem.id);
                  const isConforme = response?.status === 'CONFORME';

                  return (
                    <div key={templateItem.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <span className="flex-1">
                          {(locale === 'fr' && templateItem.labelFr) ? templateItem.labelFr : templateItem.label}
                        </span>
                        {isConforme ? (
                          <span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-sm text-green-700">
                            <Check className="h-4 w-4" /> OK
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-sm text-red-700">
                            <X className="h-4 w-4" /> Not OK
                          </span>
                        )}
                      </div>
                      {!isConforme && response && (
                        <div className="mt-3 rounded-lg bg-red-50 p-3">
                          {response.comment && (
                            <p className="mb-2 text-sm text-red-700">
                              <strong>Comment:</strong> {response.comment}
                            </p>
                          )}
                          {response.photoUrl && (
                            <a
                              href={response.photoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline"
                            >
                              <Camera className="h-4 w-4" /> View Photo
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Linked Incidents */}
      {checklist.incidents.length > 0 && (
        <div className="rounded-xl border">
          <div className="border-b bg-muted/50 px-4 py-3">
            <h3 className="font-semibold">{t('detail.linkedIncidents')}</h3>
          </div>
          <div className="divide-y">
            {checklist.incidents.map((incident) => (
              <Link
                key={incident.id}
                href={`/${locale}/admin/incidents/${incident.id}`}
                className="flex items-center justify-between p-4 hover:bg-muted/50"
              >
                <div>
                  <p className="font-medium">{incident.description.slice(0, 50)}...</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(incident.createdAt).toLocaleString(locale)}
                  </p>
                </div>
                <StatusBadge
                  status={
                    incident.status === 'CLOSED'
                      ? 'success'
                      : incident.status === 'RESOLVED'
                      ? 'success'
                      : incident.status === 'IN_PROGRESS'
                      ? 'warning'
                      : 'error'
                  }
                  label={tIncidents(`status${incident.status.replace('_', '')}`)}
                />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Validation Actions */}
      {canValidate && (
        <div className="flex gap-3">
          <button
            onClick={() => setShowRejectModal(true)}
            className="flex-1 rounded-md border border-red-300 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <X className="mr-2 inline h-4 w-4" />
            {t('detail.reject')}
          </button>
          <button
            onClick={() => validateMutation.mutate({ action: 'approve' })}
            disabled={validateMutation.isPending}
            className="flex-1 rounded-md bg-green-600 px-4 py-3 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            <Check className="mr-2 inline h-4 w-4" />
            {t('detail.validate')}
          </button>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-background p-6">
            <h3 className="mb-4 text-lg font-semibold">{t('detail.reject')}</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t('detail.rejectReasonPlaceholder')}
              className="mb-4 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              rows={3}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowRejectModal(false)}
                className="flex-1 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  validateMutation.mutate({ action: 'reject', comment: rejectReason })
                }
                disabled={validateMutation.isPending}
                className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {t('detail.reject')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
