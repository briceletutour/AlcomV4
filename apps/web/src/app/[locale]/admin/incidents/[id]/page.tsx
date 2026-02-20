'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api-client';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { ArrowLeft, AlertTriangle, User, Check, RotateCcw, ExternalLink, Camera, ClipboardCheck } from 'lucide-react';
import { StatusBadge } from '@/components/shared/status-badge';
import Link from 'next/link';
import { toast } from 'sonner';

interface IncidentDetail {
  id: string;
  stationId: string;
  checklistSubmissionId?: string;
  category: string;
  description: string;
  photoUrl?: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  assignedToId?: string;
  resolvedAt?: string;
  resolutionNote?: string;
  reportedById: string;
  createdAt: string;
  updatedAt: string;
  station: { name: string; code: string };
  reportedBy: { id: string; fullName: string; email: string };
  assignedTo?: { id: string; fullName: string; email: string };
  checklistSubmission?: {
    id: string;
    shiftDate: string;
    shiftType: string;
    template: { name: string };
  };
}

interface User {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

const statusMap: Record<string, { status: 'success' | 'warning' | 'error' | 'neutral'; key: string }> = {
  OPEN: { status: 'error', key: 'statusOpen' },
  IN_PROGRESS: { status: 'warning', key: 'statusInProgress' },
  RESOLVED: { status: 'success', key: 'statusResolved' },
  CLOSED: { status: 'neutral', key: 'statusClosed' },
};

export default function IncidentDetailPage() {
  const t = useTranslations('Incidents');
  const tChecklists = useTranslations('Checklists');
  const locale = useLocale();
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');


  const incidentId = params.id as string;

  const { data, isLoading } = useQuery({
    queryKey: ['incident', incidentId],
    queryFn: () => api.get<IncidentDetail>(`/incidents/${incidentId}`),
  });

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<{ data: User[] }>('/users?limit=100'),
  });

  const incident = data as unknown as IncidentDetail;
  const users = (usersData as unknown as { data: User[] })?.data || [];

  const assignMutation = useMutation({
    mutationFn: (assignedToId: string) =>
      api.put(`/incidents/${incidentId}/assign`, { assignedToId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', incidentId] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      setShowAssignModal(false);
    },
    onError: (error: ApiError) => toast.error(error.message),
  });

  const resolveMutation = useMutation({
    mutationFn: (resolutionNote: string) =>
      api.put(`/incidents/${incidentId}/resolve`, { resolutionNote }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', incidentId] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      setShowResolveModal(false);
    },
    onError: (error: ApiError) => toast.error(error.message),
  });

  const closeMutation = useMutation({
    mutationFn: () => api.put(`/incidents/${incidentId}/close`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', incidentId] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
    },
    onError: (error: ApiError) => toast.error(error.message),
  });

  const reopenMutation = useMutation({
    mutationFn: () => api.put(`/incidents/${incidentId}/reopen`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', incidentId] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
    },
    onError: (error: ApiError) => toast.error(error.message),
  });

  const getCategoryLabel = (category: string) => {
    const key = `category${category.charAt(0).toUpperCase() + category.slice(1).toLowerCase().replace('_', '')}` as keyof typeof t;
    return t(key as any) || category;
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">{t('notFound')}</p>
        <Link href={`/${locale}/admin/incidents`} className="text-primary hover:underline">
          Back to list
        </Link>
      </div>
    );
  }

  const statusInfo = statusMap[incident.status] || statusMap.OPEN;
  const canAssign = incident.status !== 'CLOSED';
  const canResolve = ['OPEN', 'IN_PROGRESS'].includes(incident.status);
  const canClose = incident.status === 'RESOLVED';
  const canReopen = ['RESOLVED', 'CLOSED'].includes(incident.status);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/${locale}/admin/incidents`} className="rounded-md p-2 hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <AlertTriangle
              className={`h-6 w-6 ${incident.status === 'OPEN'
                  ? 'text-red-500'
                  : incident.status === 'IN_PROGRESS'
                    ? 'text-yellow-500'
                    : 'text-green-500'
                }`}
            />
            <h1 className="text-2xl font-bold">{getCategoryLabel(incident.category)}</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {incident.station.name} • {new Date(incident.createdAt).toLocaleString(locale)}
          </p>
        </div>
        <StatusBadge status={statusInfo.status} label={t(statusInfo.key)} />
      </div>



      {/* Incident Info */}
      <div className="rounded-xl border p-6">
        <h2 className="mb-4 text-lg font-semibold">{t('description')}</h2>
        <p className="mb-4 whitespace-pre-wrap">{incident.description}</p>

        {incident.photoUrl && (
          <div className="mb-4">
            <a
              href={incident.photoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <Camera className="h-4 w-4" />
              View Photo Evidence
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}

        <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">{t('reportedBy')}</p>
            <p className="font-medium">{incident.reportedBy.fullName}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('assignedTo')}</p>
            <p className="font-medium">{incident.assignedTo?.fullName || t('unassigned')}</p>
          </div>
          {incident.resolvedAt && (
            <>
              <div>
                <p className="text-sm text-muted-foreground">{t('resolvedAt')}</p>
                <p className="font-medium">{new Date(incident.resolvedAt).toLocaleString(locale)}</p>
              </div>
              {incident.resolutionNote && (
                <div className="sm:col-span-2">
                  <p className="text-sm text-muted-foreground">{t('resolutionNote')}</p>
                  <p className="font-medium">{incident.resolutionNote}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Linked Checklist */}
      {incident.checklistSubmission && (
        <div className="rounded-xl border p-6">
          <h3 className="mb-3 font-semibold">{t('linkedChecklist')}</h3>
          <Link
            href={`/${locale}/admin/checklists/${incident.checklistSubmissionId}`}
            className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50"
          >
            <ClipboardCheck className="h-6 w-6 text-muted-foreground" />
            <div>
              <p className="font-medium">{incident.checklistSubmission.template.name}</p>
              <p className="text-sm text-muted-foreground">
                {new Date(incident.checklistSubmission.shiftDate).toLocaleDateString(locale)} •{' '}
                {incident.checklistSubmission.shiftType === 'MORNING'
                  ? tChecklists('morning')
                  : tChecklists('evening')}
              </p>
            </div>
            <ExternalLink className="ml-auto h-4 w-4 text-muted-foreground" />
          </Link>
        </div>
      )}

      {/* Timeline */}
      <div className="rounded-xl border p-6">
        <h3 className="mb-4 font-semibold">{t('timeline')}</h3>
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </div>
            <div>
              <p className="font-medium">Reported</p>
              <p className="text-sm text-muted-foreground">
                {new Date(incident.createdAt).toLocaleString(locale)} by {incident.reportedBy.fullName}
              </p>
            </div>
          </div>

          {incident.assignedTo && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-100">
                <User className="h-4 w-4 text-yellow-600" />
              </div>
              <div>
                <p className="font-medium">Assigned</p>
                <p className="text-sm text-muted-foreground">
                  to {incident.assignedTo.fullName}
                </p>
              </div>
            </div>
          )}

          {incident.resolvedAt && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
                <Check className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="font-medium">Resolved</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(incident.resolvedAt).toLocaleString(locale)}
                </p>
              </div>
            </div>
          )}

          {incident.status === 'CLOSED' && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
                <Check className="h-4 w-4 text-gray-600" />
              </div>
              <div>
                <p className="font-medium">Closed</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(incident.updatedAt).toLocaleString(locale)}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {canAssign && (
          <button
            onClick={() => setShowAssignModal(true)}
            className="flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium hover:bg-muted"
          >
            <User className="h-4 w-4" />
            {t('assign')}
          </button>
        )}
        {canResolve && (
          <button
            onClick={() => setShowResolveModal(true)}
            className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700"
          >
            <Check className="h-4 w-4" />
            {t('resolve')}
          </button>
        )}
        {canClose && (
          <button
            onClick={() => {
              if (confirm(t('closeConfirmMessage'))) {
                closeMutation.mutate();
              }
            }}
            disabled={closeMutation.isPending}
            className="flex items-center gap-2 rounded-md bg-gray-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {t('close')}
          </button>
        )}
        {canReopen && (
          <button
            onClick={() => {
              if (confirm(t('reopenConfirmMessage'))) {
                reopenMutation.mutate();
              }
            }}
            disabled={reopenMutation.isPending}
            className="flex items-center gap-2 rounded-md border border-yellow-500 px-4 py-2.5 text-sm font-medium text-yellow-600 hover:bg-yellow-50 disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            {t('reopen')}
          </button>
        )}
      </div>

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-background p-6">
            <h3 className="mb-4 text-lg font-semibold">{t('assignTo')}</h3>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="mb-4 w-full rounded-md border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">{t('selectUser')}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({u.role})
                </option>
              ))}
            </select>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAssignModal(false)}
                className="flex-1 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (selectedUserId) {
                    assignMutation.mutate(selectedUserId);
                  }
                }}
                disabled={!selectedUserId || assignMutation.isPending}
                className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {t('assign')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Modal */}
      {showResolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-background p-6">
            <h3 className="mb-4 text-lg font-semibold">{t('resolveIncident')}</h3>
            <textarea
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              placeholder={t('resolutionNotePlaceholder')}
              className="mb-4 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              rows={4}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowResolveModal(false)}
                className="flex-1 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (resolutionNote.length >= 5) {
                    resolveMutation.mutate(resolutionNote);
                  }
                }}
                disabled={resolutionNote.length < 5 || resolveMutation.isPending}
                className="flex-1 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {t('resolve')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
