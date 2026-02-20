'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Clock, User, Send, Archive } from 'lucide-react';
import { api } from '@/lib/api-client';
import { StatusBadge } from '@/components/shared/status-badge';

interface MailDetail {
  id: string;
  sender: string;
  subject: string;
  receivedAt: string;
  priority: 'NORMAL' | 'URGENT';
  recipientDepartment: string;
  deadline: string;
  status: 'RECEIVED' | 'IN_PROGRESS' | 'RESPONDED' | 'ARCHIVED';
  slaState: 'ON_TIME' | 'DUE_SOON' | 'OVERDUE';
  attachmentUrl: string | null;
  assignedToId: string | null;
  assignedTo?: {
    id: string;
    fullName: string;
    email: string;
  } | null;
}

interface UserOption {
  id: string;
  fullName: string;
  email: string;
}

const SLA_BADGE: Record<MailDetail['slaState'], { status: 'success' | 'warning' | 'danger'; labelKey: string }> = {
  ON_TIME: { status: 'success', labelKey: 'slaOnTime' },
  DUE_SOON: { status: 'warning', labelKey: 'slaDueSoon' },
  OVERDUE: { status: 'danger', labelKey: 'slaOverdue' },
};

export default function MailDetailPage() {
  const t = useTranslations('Mail');
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [assignedToId, setAssignedToId] = useState('');
  const [note, setNote] = useState('');
  const id = params.id;

  const { data, isLoading } = useQuery({
    queryKey: ['mail', id],
    queryFn: () => api.get<MailDetail>(`/mails/${id}`),
    enabled: Boolean(id),
  });

  const { data: usersData } = useQuery({
    queryKey: ['users', 'options'],
    queryFn: () => api.get<{ data: UserOption[] }>(`/users?page=1&limit=100`),
  });

  const users = useMemo<UserOption[]>(() => {
    if (Array.isArray(usersData)) return usersData as unknown as UserOption[];
    return (usersData as any)?.data || [];
  }, [usersData]);

  const assignMutation = useMutation({
    mutationFn: () => api.put(`/mails/${id}/assign`, { assignedToId }),
    onSuccess: () => {
      setAssignedToId('');
      queryClient.invalidateQueries({ queryKey: ['mail', id] });
      queryClient.invalidateQueries({ queryKey: ['mails'] });
    },
  });

  const respondMutation = useMutation({
    mutationFn: () => api.put(`/mails/${id}/respond`, { note }),
    onSuccess: () => {
      setNote('');
      queryClient.invalidateQueries({ queryKey: ['mail', id] });
      queryClient.invalidateQueries({ queryKey: ['mails'] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => api.put(`/mails/${id}/archive`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mail', id] });
      queryClient.invalidateQueries({ queryKey: ['mails'] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const mail = data as any as MailDetail | undefined;

  if (!mail) {
    return (
      <div className="space-y-4">
        <Link href={`/${locale}/admin/mails`} className="text-sm text-muted-foreground hover:underline">
          ← {t('backToList')}
        </Link>
        <p className="rounded-md bg-red-50 p-4 text-red-700">{t('notFound')}</p>
      </div>
    );
  }

  const deadlineMs = new Date(mail.deadline).getTime() - Date.now();
  const hoursLeft = Math.round(deadlineMs / (1000 * 60 * 60));
  const sla = SLA_BADGE[mail.slaState];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/${locale}/admin/mails`} className="text-sm text-muted-foreground hover:underline">
            ← {t('backToList')}
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{mail.subject}</h1>
          <p className="text-muted-foreground">{mail.sender}</p>
        </div>
        <StatusBadge status={sla.status} label={t(sla.labelKey)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border bg-card p-5">
          <h2 className="font-semibold">{t('details')}</h2>
          <p><strong>{t('department')}:</strong> {mail.recipientDepartment}</p>
          <p><strong>{t('priority')}:</strong> {mail.priority === 'URGENT' ? t('priorityUrgent') : t('priorityNormal')}</p>
          <p><strong>{t('status')}:</strong> {mail.status}</p>
          <p><strong>{t('receivedAt')}:</strong> {new Date(mail.receivedAt).toLocaleString()}</p>
          <p><strong>{t('deadline')}:</strong> {new Date(mail.deadline).toLocaleString()}</p>

          <div className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm">
            <Clock className="h-4 w-4" />
            {hoursLeft >= 0 ? t('countdownHours', { count: hoursLeft }) : t('overdueByHours', { count: Math.abs(hoursLeft) })}
          </div>

          {mail.attachmentUrl && (
            <p>
              <strong>{t('attachment')}:</strong>{' '}
              <a href={mail.attachmentUrl} className="text-primary hover:underline" target="_blank" rel="noreferrer">
                {t('openAttachment')}
              </a>
            </p>
          )}
        </div>

        <div className="space-y-4 rounded-lg border bg-card p-5">
          <h2 className="font-semibold">{t('actions')}</h2>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('assignTo')}</label>
            {users.length > 0 ? (
              <select
                title={t('assignTo')}
                aria-label={t('assignTo')}
                value={assignedToId}
                onChange={(e) => setAssignedToId(e.target.value)}
                className="w-full rounded-md border px-3 py-2"
              >
                <option value="">{t('selectUser')}</option>
                {users.map((user: UserOption) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName} ({user.email})
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={assignedToId}
                onChange={(e) => setAssignedToId(e.target.value)}
                placeholder={t('assigneeIdPlaceholder')}
                className="w-full rounded-md border px-3 py-2"
              />
            )}
            <button
              onClick={() => assignMutation.mutate()}
              disabled={!assignedToId || assignMutation.isPending || mail.status === 'ARCHIVED'}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
            >
              {assignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
              {t('assign')}
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('respondNote')}</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-md border px-3 py-2"
              placeholder={t('respondNotePlaceholder')}
            />
            <button
              onClick={() => respondMutation.mutate()}
              disabled={respondMutation.isPending || mail.status === 'ARCHIVED'}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {respondMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {t('markResponded')}
            </button>
          </div>

          <button
            onClick={() => archiveMutation.mutate()}
            disabled={archiveMutation.isPending || mail.status === 'ARCHIVED'}
            className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
          >
            {archiveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
            {t('archive')}
          </button>
        </div>
      </div>
    </div>
  );
}
