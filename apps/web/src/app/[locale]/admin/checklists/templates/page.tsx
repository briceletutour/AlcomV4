'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { Plus, ChevronLeft, ClipboardList } from 'lucide-react';

interface ChecklistTemplate {
  id: string;
  name: string;
  version: number;
  categories: {
    categories: Array<{
      name: string;
      items: Array<{
        id: string;
        label: string;
        required: boolean;
      }>;
    }>;
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TemplatesResponse {
  data: ChecklistTemplate[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export default function ChecklistTemplatesPage() {
  const t = useTranslations('Checklists');
  const locale = useLocale();

  const { data, isLoading, error } = useQuery({
    queryKey: ['checklist-templates'],
    queryFn: () => api.get<TemplatesResponse>('/checklist-templates'),
  });

  const templates = (data as unknown as TemplatesResponse)?.data || [];

  const getCategoryCount = (template: ChecklistTemplate) => {
    const cats = template.categories?.categories;
    return Array.isArray(cats) ? cats.length : 0;
  };

  const getItemCount = (template: ChecklistTemplate) => {
    const cats = template.categories?.categories;
    if (!Array.isArray(cats)) return 0;
    return cats.reduce((acc, cat) => acc + (cat.items?.length || 0), 0);
  };

  const columns = [
    {
      key: 'name',
      header: t('templates.name'),
      render: (tmpl: ChecklistTemplate) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-medium">{tmpl.name}</p>
            <p className="text-xs text-muted-foreground">v{tmpl.version}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'categories',
      header: t('templates.categories'),
      render: (tmpl: ChecklistTemplate) => (
        <span className="text-sm">{getCategoryCount(tmpl)}</span>
      ),
    },
    {
      key: 'items',
      header: t('templates.items'),
      render: (tmpl: ChecklistTemplate) => (
        <span className="text-sm">{getItemCount(tmpl)}</span>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (tmpl: ChecklistTemplate) => (
        <StatusBadge 
          status={tmpl.isActive ? 'success' : 'neutral'} 
          label={tmpl.isActive ? t('templates.active') : t('templates.inactive')} 
        />
      ),
    },
    {
      key: 'updatedAt',
      header: t('templates.lastUpdated'),
      render: (tmpl: ChecklistTemplate) => (
        <span className="text-sm text-muted-foreground">
          {new Date(tmpl.updatedAt).toLocaleDateString(locale)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={`/${locale}/admin/checklists`}
            className="flex h-10 w-10 items-center justify-center rounded-lg border hover:bg-muted"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{t('templates.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('templates.subtitle')}</p>
          </div>
        </div>
        <Link
          href={`/${locale}/admin/checklists/templates/new`}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          {t('templates.newTemplate')}
        </Link>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {t('error.loadFailed')}
        </div>
      )}

      {/* Templates Table */}
      <DataTable
        columns={columns}
        data={templates}
        keyExtractor={(tmpl) => tmpl.id}
        isLoading={isLoading}
        emptyMessage={t('templates.noTemplates')}
        onRowClick={(tmpl) => {
          window.location.href = `/${locale}/admin/checklists/templates/${tmpl.id}`;
        }}
      />

      {/* Template Preview Cards for Mobile */}
      <div className="space-y-4 md:hidden">
        {templates.map((tmpl) => (
          <div key={tmpl.id} className="rounded-xl border p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <ClipboardList className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{tmpl.name}</p>
                  <p className="text-xs text-muted-foreground">
                    v{tmpl.version} • {getCategoryCount(tmpl)} catégories • {getItemCount(tmpl)} items
                  </p>
                </div>
              </div>
              <StatusBadge 
                status={tmpl.isActive ? 'success' : 'neutral'} 
                label={tmpl.isActive ? t('templates.active') : t('templates.inactive')} 
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
