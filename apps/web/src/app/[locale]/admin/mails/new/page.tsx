'use client';

import { FormEvent, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Upload, FileText, X } from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from 'sonner';

interface CreateMailPayload {
  sender: string;
  subject: string;
  receivedAt: string;
  priority: 'NORMAL' | 'URGENT';
  recipientDepartment: string;
  attachmentUrl?: string;
}

export default function NewMailPage() {
  const t = useTranslations('Mail');
  const locale = useLocale();
  const router = useRouter();

  const [form, setForm] = useState({
    sender: '',
    subject: '',
    receivedAt: '',
    priority: 'NORMAL' as 'NORMAL' | 'URGENT',
    recipientDepartment: '',
    attachmentUrl: '',
  });

  const [uploadedFile, setUploadedFile] = useState<{ name: string; url: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large (Max 10MB)');
      return;
    }

    setIsUploading(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);

      const token = localStorage.getItem('access_token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/files/upload?module=mails`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formDataUpload,
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error?.message || 'Upload failed');
      }

      setUploadedFile({ name: file.name, url: json.data.fileUrl });
      setForm((prev) => ({ ...prev, attachmentUrl: json.data.fileUrl }));
    } catch (error) {
      toast.error('Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = () => {
    setUploadedFile(null);
    setForm((prev) => ({ ...prev, attachmentUrl: '' }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const createMutation = useMutation({
    mutationFn: (payload: CreateMailPayload) => api.post<{ id: string }>('/mails', payload),
    onSuccess: (created) => {
      const id = (created as any)?.id;
      if (id) {
        router.push(`/${locale}/admin/mails/${id}`);
        return;
      }
      router.push(`/${locale}/admin/mails`);
    },
    onError: (e: unknown) => {
      toast.error((e as Error)?.message || t('errorGeneric'));
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (!form.sender || !form.subject || !form.receivedAt || !form.recipientDepartment) {
      toast.warning(t('requiredFields'));
      return;
    }

    const payload: CreateMailPayload = {
      sender: form.sender,
      subject: form.subject,
      receivedAt: new Date(form.receivedAt).toISOString(),
      priority: form.priority,
      recipientDepartment: form.recipientDepartment,
      ...(form.attachmentUrl ? { attachmentUrl: form.attachmentUrl } : {}),
    };

    createMutation.mutate(payload);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('newMail')}</h1>
        <p className="text-muted-foreground">{t('newMailSubtitle')}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border bg-card p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">{t('sender')}</label>
            <input
              value={form.sender}
              onChange={(e) => setForm((prev) => ({ ...prev, sender: e.target.value }))}
              className="w-full rounded-md border px-3 py-2"
              placeholder={t('senderPlaceholder')}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t('department')}</label>
            <input
              value={form.recipientDepartment}
              onChange={(e) => setForm((prev) => ({ ...prev, recipientDepartment: e.target.value }))}
              className="w-full rounded-md border px-3 py-2"
              placeholder={t('departmentPlaceholder')}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">{t('subject')}</label>
          <input
            value={form.subject}
            onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
            className="w-full rounded-md border px-3 py-2"
            placeholder={t('subjectPlaceholder')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">{t('receivedAt')}</label>
            <input
              type="datetime-local"
              title={t('receivedAt')}
              aria-label={t('receivedAt')}
              value={form.receivedAt}
              onChange={(e) => setForm((prev) => ({ ...prev, receivedAt: e.target.value }))}
              className="w-full rounded-md border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t('priority')}</label>
            <select
              title={t('priority')}
              aria-label={t('priority')}
              value={form.priority}
              onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value as 'NORMAL' | 'URGENT' }))}
              className="w-full rounded-md border px-3 py-2"
            >
              <option value="NORMAL">{t('priorityNormal')}</option>
              <option value="URGENT">{t('priorityUrgent')}</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">{t('attachmentUrl')}</label>
          {uploadedFile ? (
            <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-green-600" />
                <div>
                  <p className="font-medium">{uploadedFile.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={removeFile}
                className="rounded-lg p-2 hover:bg-green-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors hover:bg-muted/50 border-muted-foreground/25`}
            >
              {isUploading ? (
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
              ) : (
                <>
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium">{t('attachmentPlaceholder')}</p>
                </>
              )}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>



        <div className="flex items-center justify-end gap-3">
          <Link
            href={`/${locale}/admin/mails`}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            {t('cancel')}
          </Link>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('create')}
          </button>
        </div>
      </form>
    </div>
  );
}
