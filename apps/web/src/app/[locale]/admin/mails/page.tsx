'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Mail, Plus, Clock, User } from 'lucide-react';
import { api } from '@/lib/api-client';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';

interface MailItem {
  id: string;
  sender: string;
  subject: string;
  priority: 'NORMAL' | 'URGENT';
  recipientDepartment: string;
  status: 'RECEIVED' | 'IN_PROGRESS' | 'RESPONDED' | 'ARCHIVED';
  slaState: 'ON_TIME' | 'DUE_SOON' | 'OVERDUE';
  deadline: string;
  assignedToId: string | null;
  assignedTo?: { id: string; fullName: string } | null;
}

interface MailListResponse {
  data: MailItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const SLA_MAP: Record<MailItem['slaState'], { labelKey: string; status: 'success' | 'warning' | 'danger' }> = {
  ON_TIME: { labelKey: 'slaOnTime', status: 'success' },
  DUE_SOON: { labelKey: 'slaDueSoon', status: 'warning' },
  OVERDUE: { labelKey: 'slaOverdue', status: 'danger' },
};

const PRIORITY_MAP: Record<MailItem['priority'], { labelKey: string; status: 'warning' | 'danger' }> = {
  NORMAL: { labelKey: 'priorityNormal', status: 'warning' },
  URGENT: { labelKey: 'priorityUrgent', status: 'danger' },
};

export default function MailsPage() {
  const t = useTranslations('Mail');
  const locale = useLocale();

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [department, setDepartment] = useState('');
  const limit = 20;

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(department ? { department } : {}),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['mails', page, status, priority, department],
    queryFn: () => api.get<MailListResponse>(`/mails?${queryParams.toString()}`),
  });

  const rows = (data as any)?.data || [];
  const meta = (data as any)?.meta || { page: 1, total: 0, totalPages: 1 };

  const columns = [
    {
      key: 'sender',
      header: t('sender'),
      render: (item: MailItem) => (
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{item.sender}</span>
        </div>
      ),
    },
    {
      key: 'subject',
      header: t('subject'),
      render: (item: MailItem) => <span>{item.subject}</span>,
    },
    {
      key: 'priority',
      header: t('priority'),
      render: (item: MailItem) => {
        const conf = PRIORITY_MAP[item.priority];
        return <StatusBadge status={conf.status} label={t(conf.labelKey)} />;
      },
    },
    {
      key: 'recipientDepartment',
      header: t('department'),
    },
    {
      key: 'slaState',
      header: t('slaStatus'),
      render: (item: MailItem) => {
        const conf = SLA_MAP[item.slaState];
        return <StatusBadge status={conf.status} label={t(conf.labelKey)} />;
      },
    },
    {
      key: 'deadline',
      header: t('deadline'),
      render: (item: MailItem) => (
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span>{new Date(item.deadline).toLocaleString()}</span>
        </div>
      ),
    },
    {
      key: 'assignedTo',
      header: t('assignedTo'),
      render: (item: MailItem) => (
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <span>{item.assignedTo?.fullName || '-'}</span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: t('actions'),
      render: (item: MailItem) => (
        <Link
          href={`/${locale}/admin/mails/${item.id}`}
          className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          {t('view')}
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Link
          href={`/${locale}/admin/mails/new`}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          {t('newMail')}
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          title={t('status')}
          aria-label={t('status')}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="">{t('allStatuses')}</option>
          <option value="RECEIVED">{t('statusReceived')}</option>
          <option value="IN_PROGRESS">{t('statusInProgress')}</option>
          <option value="RESPONDED">{t('statusResponded')}</option>
          <option value="ARCHIVED">{t('statusArchived')}</option>
        </select>

        <select
          title={t('priority')}
          aria-label={t('priority')}
          value={priority}
          onChange={(e) => {
            setPriority(e.target.value);
            setPage(1);
          }}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="">{t('allPriorities')}</option>
          <option value="NORMAL">{t('priorityNormal')}</option>
          <option value="URGENT">{t('priorityUrgent')}</option>
        </select>

        <input
          value={department}
          onChange={(e) => {
            setDepartment(e.target.value);
            setPage(1);
          }}
          placeholder={t('departmentPlaceholder')}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        keyExtractor={(item) => item.id}
        isLoading={isLoading}
        emptyMessage={t('noMails')}
      />

      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {t('showingResults', {
              from: (page - 1) * limit + 1,
              to: Math.min(page * limit, meta.total),
              total: meta.total,
            })}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-md border px-3 py-1.5 disabled:opacity-50"
            >
              {t('previous')}
            </button>
            <button
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={page >= meta.totalPages}
              className="rounded-md border px-3 py-1.5 disabled:opacity-50"
            >
              {t('next')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
