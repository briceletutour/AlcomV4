'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { Plus, AlertTriangle, Search } from 'lucide-react';
import { useState } from 'react';

interface Incident {
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
  station: { name: string; code: string };
  reportedBy: { fullName: string };
  assignedTo?: { fullName: string };
  checklistSubmission?: { id: string; shiftDate: string; shiftType: string };
}

interface IncidentListResponse {
  data: Incident[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const statusMap: Record<string, { status: 'success' | 'warning' | 'error' | 'neutral'; key: string }> = {
  OPEN: { status: 'error', key: 'statusOpen' },
  IN_PROGRESS: { status: 'warning', key: 'statusInProgress' },
  RESOLVED: { status: 'success', key: 'statusResolved' },
  CLOSED: { status: 'neutral', key: 'statusClosed' },
};

export default function IncidentsPage() {
  const t = useTranslations('Incidents');
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const limit = 20;

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(filterStatus && { status: filterStatus }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['incidents', page, filterStatus],
    queryFn: () => api.get<IncidentListResponse>(`/incidents?${queryParams}`),
  });

  const incidents = (data as unknown as IncidentListResponse)?.data || [];
  const meta = (data as unknown as IncidentListResponse)?.meta || { total: 0, page: 1, totalPages: 0 };

  const getCategoryLabel = (category: string) => {
    const categoryKey = `category${category.charAt(0).toUpperCase() + category.slice(1).toLowerCase().replace('_', '')}` as keyof typeof t;
    return t(categoryKey as any) || category;
  };

  const columns = [
    {
      key: 'station',
      header: t('station'),
      render: (i: Incident) => (
        <div>
          <p className="font-medium">{i.station.name}</p>
          <p className="text-xs text-muted-foreground">{i.station.code}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: t('category'),
      render: (i: Incident) => getCategoryLabel(i.category),
    },
    {
      key: 'description',
      header: t('description'),
      render: (i: Incident) => (
        <span className="line-clamp-2 max-w-xs">{i.description}</span>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (i: Incident) => {
        const statusInfo = statusMap[i.status] || statusMap.OPEN;
        return <StatusBadge status={statusInfo.status} label={t(statusInfo.key)} />;
      },
    },
    {
      key: 'assignedTo',
      header: t('assignedTo'),
      render: (i: Incident) => i.assignedTo?.fullName || t('unassigned'),
    },
    {
      key: 'reportedAt',
      header: t('reportedAt'),
      render: (i: Incident) => new Date(i.createdAt).toLocaleDateString(locale),
    },
    {
      key: 'actions',
      header: '',
      render: (i: Incident) => (
        <Link
          href={`/${locale}/admin/incidents/${i.id}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          View
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Link
          href={`/${locale}/admin/incidents/new`}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          {t('newIncident')}
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-md border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">{t('allStatuses')}</option>
          <option value="OPEN">{t('statusOpen')}</option>
          <option value="IN_PROGRESS">{t('statusInProgress')}</option>
          <option value="RESOLVED">{t('statusResolved')}</option>
          <option value="CLOSED">{t('statusClosed')}</option>
        </select>
      </div>

      {/* Desktop: DataTable */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={incidents}
          keyExtractor={(i) => i.id}
          isLoading={isLoading}
          onRowClick={(i) => {
            window.location.href = `/${locale}/admin/incidents/${i.id}`;
          }}
          emptyMessage={t('noIncidents')}
        />
      </div>

      {/* Mobile: Card layout */}
      <div className="grid gap-3 md:hidden">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            Loading...
          </div>
        ) : incidents.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {t('noIncidents')}
          </div>
        ) : (
          incidents.map((incident) => {
            const statusInfo = statusMap[incident.status];
            return (
              <Link
                key={incident.id}
                href={`/${locale}/admin/incidents/${incident.id}`}
                className="rounded-xl border bg-card p-4 shadow-sm active:bg-muted/30"
              >
                <div className="mb-2 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle
                      className={`h-5 w-5 ${
                        incident.status === 'OPEN'
                          ? 'text-red-500'
                          : incident.status === 'IN_PROGRESS'
                          ? 'text-yellow-500'
                          : 'text-green-500'
                      }`}
                    />
                    <span className="text-sm font-medium">{getCategoryLabel(incident.category)}</span>
                  </div>
                  <StatusBadge status={statusInfo.status} label={t(statusInfo.key)} />
                </div>
                <p className="mb-2 line-clamp-2 text-sm">{incident.description}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{incident.station.code}</span>
                  <span>{new Date(incident.createdAt).toLocaleDateString(locale)}</span>
                </div>
                {incident.assignedTo && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    → {incident.assignedTo.fullName}
                  </p>
                )}
              </Link>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-sm text-muted-foreground">
            Page {meta.page} of {meta.totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={page === meta.totalPages}
              className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
