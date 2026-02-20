'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { ChevronLeft, Plus, Trash2, GripVertical } from 'lucide-react';
import { toast } from 'sonner';

interface TemplateItem {
  id: string;
  label: string;
  labelFr?: string;
  required: boolean;
}

interface TemplateCategory {
  name: string;
  items: TemplateItem[];
}

export default function NewTemplatePage() {
  const t = useTranslations('Checklists');
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [categories, setCategories] = useState<TemplateCategory[]>([
    { name: '', items: [{ id: '1', label: '', labelFr: '', required: true }] },
  ]);

  const createMutation = useMutation({
    mutationFn: (data: { name: string; categories: { categories: TemplateCategory[] } }) =>
      api.post('/checklist-templates', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist-templates'] });
      router.push(`/${locale}/admin/checklists/templates`);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const addCategory = () => {
    const nextId = String(
      Math.max(...categories.flatMap((c) => c.items.map((i) => parseInt(i.id)))) + 1
    );
    setCategories([
      ...categories,
      { name: '', items: [{ id: nextId, label: '', labelFr: '', required: true }] },
    ]);
  };

  const removeCategory = (index: number) => {
    if (categories.length > 1) {
      setCategories(categories.filter((_, i) => i !== index));
    }
  };

  const updateCategory = (index: number, name: string) => {
    const updated = [...categories];
    updated[index].name = name;
    setCategories(updated);
  };

  const addItem = (categoryIndex: number) => {
    const allIds = categories.flatMap((c) => c.items.map((i) => parseInt(i.id)));
    const nextId = String(Math.max(...allIds, 0) + 1);
    const updated = [...categories];
    updated[categoryIndex].items.push({ id: nextId, label: '', labelFr: '', required: true });
    setCategories(updated);
  };

  const removeItem = (categoryIndex: number, itemIndex: number) => {
    const updated = [...categories];
    if (updated[categoryIndex].items.length > 1) {
      updated[categoryIndex].items = updated[categoryIndex].items.filter((_, i) => i !== itemIndex);
      setCategories(updated);
    }
  };

  const updateItem = (
    categoryIndex: number,
    itemIndex: number,
    field: keyof TemplateItem,
    value: string | boolean
  ) => {
    const updated = [...categories];
    (updated[categoryIndex].items[itemIndex] as any)[field] = value;
    setCategories(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate
    if (!name.trim()) {
      toast.error(t('templateForm.nameRequired') || 'Template name is required');
      return;
    }

    for (const cat of categories) {
      if (!cat.name.trim()) {
        toast.error(t('templateForm.categoryNameRequired') || 'All categories need a name');
        return;
      }
      for (const item of cat.items) {
        if (!item.label.trim()) {
          toast.error(t('templateForm.itemLabelRequired') || 'All items need a label');
          return;
        }
      }
    }

    createMutation.mutate({
      name,
      categories: { categories },
    });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/${locale}/admin/checklists/templates`}
          className="flex h-10 w-10 items-center justify-center rounded-lg border hover:bg-muted"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{t('templates.newTemplate')}</h1>
          <p className="text-sm text-muted-foreground">{t('templateForm.createSubtitle') || 'Create a new checklist template'}</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Template Name */}
        <div className="rounded-xl border p-6">
          <label className="block text-sm font-medium text-muted-foreground">
            {t('templateForm.name')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-2 w-full rounded-lg border bg-background px-4 py-3 text-lg font-medium focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Ex: Inspection Quotidienne Station"
          />
        </div>

        {/* Categories */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t('templateForm.categories')}</h2>
            <button
              type="button"
              onClick={addCategory}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <Plus className="h-4 w-4" />
              {t('templateForm.addCategory')}
            </button>
          </div>

          {categories.map((category, catIndex) => (
            <div key={catIndex} className="rounded-xl border">
              {/* Category Header */}
              <div className="flex items-center gap-3 border-b bg-muted/50 p-4">
                <GripVertical className="h-5 w-5 text-muted-foreground" />
                <input
                  type="text"
                  value={category.name}
                  onChange={(e) => updateCategory(catIndex, e.target.value)}
                  className="flex-1 rounded-lg border bg-background px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={t('templateForm.categoryName')}
                />
                {categories.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCategory(catIndex)}
                    className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Items */}
              <div className="divide-y p-4">
                {category.items.map((item, itemIndex) => (
                  <div key={item.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={item.label}
                        onChange={(e) => updateItem(catIndex, itemIndex, 'label', e.target.value)}
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder={t('templateForm.itemLabel')}
                      />
                      <input
                        type="text"
                        value={item.labelFr || ''}
                        onChange={(e) => updateItem(catIndex, itemIndex, 'labelFr', e.target.value)}
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder={t('templateForm.itemLabelFr')}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={item.required}
                        onChange={(e) => updateItem(catIndex, itemIndex, 'required', e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <span className="text-muted-foreground">Required</span>
                    </label>
                    {category.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(catIndex, itemIndex)}
                        className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addItem(catIndex)}
                  className="mt-3 flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                >
                  <Plus className="h-4 w-4" />
                  {t('templateForm.addItem')}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Link
            href={`/${locale}/admin/checklists/templates`}
            className="rounded-lg border px-6 py-3 font-medium hover:bg-muted"
          >
            {t('common.cancel') || 'Cancel'}
          </Link>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Saving...' : t('templateForm.save')}
          </button>
        </div>
      </form>
    </div>
  );
}
