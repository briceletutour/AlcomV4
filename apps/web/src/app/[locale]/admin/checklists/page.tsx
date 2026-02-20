'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { Plus, ClipboardCheck, Search, Settings } from 'lucide-react';
import { useState } from 'react';

interface ChecklistSubmission {
  id: string;
  stationId: string;
  templateId: string;
  templateVersion: number;
  shiftDate: string;
  shiftType: 'MORNING' | 'EVENING';
  computedScore: number;
  status: 'DRAFT' | 'PENDING_VALIDATION' | 'VALIDATED' | 'REJECTED';
  createdAt: string;
  station: { name: string; code: string };
  template: { name: string; version: number };
  submittedBy: { fullName: string };
  validatedBy?: { fullName: string };
}

interface ChecklistListResponse {
  data: ChecklistSubmission[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const statusMap: Record<string, { status: 'success' | 'warning' | 'error' | 'neutral'; key: string }> = {
  DRAFT: { status: 'neutral', key: 'statusDraft' },
  PENDING_VALIDATION: { status: 'warning', key: 'statusPending' },
  VALIDATED: { status: 'success', key: 'statusValidated' },
  REJECTED: { status: 'error', key: 'statusRejected' },
};

export default function ChecklistsPage() {
  const t = useTranslations('Checklists');
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const limit = 20;

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(filterStatus && { status: filterStatus }),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['checklists', page, filterStatus],
    queryFn: () => api.get<ChecklistListResponse>(`/checklists?${queryParams}`),
  });

  // Extract data from the response
  const responseData = data as unknown as ChecklistListResponse;
  const checklists = responseData?.data || [];
  const meta = responseData?.meta || { total: 0, page: 1, totalPages: 0 };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600 bg-green-50';
    if (score >= 70) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const columns = [
    {
      key: 'station',
      header: t('station'),
      render: (c: ChecklistSubmission) => (
        <div>
          <p className="font-medium">{c.station.name}</p>
          <p className="text-xs text-muted-foreground">{c.station.code}</p>
        </div>
      ),
    },
    {
      key: 'date',
      header: t('shiftDate'),
      render: (c: ChecklistSubmission) => (
        <div>
          <p>{new Date(c.shiftDate).toLocaleDateString(locale)}</p>
          <p className="text-xs text-muted-foreground">
            {c.shiftType === 'MORNING' ? t('morning') : t('evening')}
          </p>
        </div>
      ),
    },
    {
      key: 'score',
      header: t('score'),
      render: (c: ChecklistSubmission) => (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium ${getScoreColor(c.computedScore)}`}>
          {c.computedScore}%
        </span>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (c: ChecklistSubmission) => {
        const statusInfo = statusMap[c.status] || { status: 'neutral', key: 'statusDraft' };
        return <StatusBadge status={statusInfo.status} label={t(statusInfo.key)} />;
      },
    },
    {
      key: 'submittedBy',
      header: t('submittedBy'),
      render: (c: ChecklistSubmission) => c.submittedBy.fullName,
    },
    {
      key: 'actions',
      header: '',
      render: (c: ChecklistSubmission) => (
        <Link
          href={`/${locale}/admin/checklists/${c.id}`}
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
        <div className="flex gap-2">
          <Link
            href={`/${locale}/admin/checklists/templates`}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium hover:bg-muted"
          >
            <Settings className="h-4 w-4" />
            {t('manageTemplates')}
          </Link>
          <Link
            href={`/${locale}/admin/checklists/new`}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t('newChecklist')}
          </Link>
        </div>
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
          <option value="PENDING_VALIDATION">{t('statusPending')}</option>
          <option value="VALIDATED">{t('statusValidated')}</option>
          <option value="REJECTED">{t('statusRejected')}</option>
        </select>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {t('error.loadFailed')}
        </div>
      )}

      {/* Desktop: DataTable */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={checklists}
          keyExtractor={(c) => c.id}
          isLoading={isLoading}
          onRowClick={(c) => {
            window.location.href = `/${locale}/admin/checklists/${c.id}`;
          }}
          emptyMessage={t('noChecklists')}
        />
      </div>

      {/* Mobile: Card layout */}
      <div className="grid gap-3 md:hidden">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            Loading...
          </div>
        ) : checklists.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {t('noChecklists')}
          </div>
        ) : (
          checklists.map((c) => (
            <Link
              key={c.id}
              href={`/${locale}/admin/checklists/${c.id}`}
              className="rounded-xl border bg-card p-4 shadow-sm active:bg-muted/30"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-sm text-muted-foreground">
                  {c.station.code}
                </span>
                {(() => {
                  const statusInfo = statusMap[c.status];
                  return <StatusBadge status={statusInfo.status} label={t(statusInfo.key)} />;
                })()}
              </div>
              <p className="mb-1 font-semibold">{c.station.name}</p>
              <p className="mb-3 text-sm text-muted-foreground">
                {new Date(c.shiftDate).toLocaleDateString(locale)} • {c.shiftType === 'MORNING' ? t('morning') : t('evening')}
              </p>
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium ${getScoreColor(c.computedScore)}`}>
                  {c.computedScore}%
                </span>
                <span className="text-sm text-muted-foreground">{c.submittedBy.fullName}</span>
              </div>
            </Link>
          ))
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
