'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useTranslations, useLocale } from 'next-intl';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth-store';

interface Station {
  id: string;
  name: string;
  code: string;
}

const CATEGORIES = [
  { value: 'MAINTENANCE', labelKey: 'categoryMaintenance' },
  { value: 'UTILITIES', labelKey: 'categoryUtilities' },
  { value: 'SUPPLIES', labelKey: 'categorySupplies' },
  { value: 'TRANSPORT', labelKey: 'categoryTransport' },
  { value: 'PERSONNEL', labelKey: 'categoryPersonnel' },
  { value: 'MISCELLANEOUS', labelKey: 'categoryMiscellaneous' },
];

export default function NewExpensePage() {
  const t = useTranslations('Finance');
  const locale = useLocale();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [category, setCategory] = useState('');
  const [stationId, setStationId] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch stations for dropdown
  const { data: stationsData } = useQuery({
    queryKey: ['stations'],
    queryFn: () => api.get<{ data: Station[] }>('/stations'),
  });

  const stations = Array.isArray(stationsData) ? stationsData : (stationsData as any)?.data || [];

  // Create expense mutation
  const createExpenseMutation = useMutation({
    mutationFn: (data: { title: string; amount: number; category: string; stationId?: string }) =>
      api.post('/expenses', data),
    onSuccess: () => {
      router.push(`/${locale}/admin/finance/expenses`);
    },
    onError: (error: any) => {
      if (error.details) {
        setErrors(error.details);
      } else {
        setErrors({ general: error.message });
      }
    },
  });

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!title || title.length < 3) {
      newErrors.title = t('expenses.errors.titleRequired');
    }

    if (!amount || amount <= 0) {
      newErrors.amount = t('expenses.errors.amountRequired');
    }

    if (!category) {
      newErrors.category = t('expenses.errors.categoryRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    createExpenseMutation.mutate({
      title,
      amount: Number(amount),
      category,
      ...(stationId && { stationId }),
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/${locale}/admin/finance/expenses`}
          className="rounded-lg p-2 hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{t('expenses.newExpense')}</h1>
          <p className="text-muted-foreground">{t('expenses.newExpenseSubtitle')}</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-xl space-y-6">
        {errors.general && (
          <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
            {errors.general}
          </div>
        )}

        {/* Title */}
        <div className="space-y-2">
          <label htmlFor="title" className="text-sm font-medium">
            {t('expenses.expenseTitle')} <span className="text-destructive">*</span>
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('expenses.titlePlaceholder')}
            className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary ${
              errors.title ? 'border-destructive' : ''
            }`}
          />
          {errors.title && <p className="text-sm text-destructive">{errors.title}</p>}
        </div>

        {/* Amount */}
        <div className="space-y-2">
          <label htmlFor="amount" className="text-sm font-medium">
            {t('expenses.amount')} (XAF) <span className="text-destructive">*</span>
          </label>
          <input
            id="amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
            placeholder={t('expenses.amountPlaceholder')}
            min={0}
            className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary ${
              errors.amount ? 'border-destructive' : ''
            }`}
          />
          {errors.amount && <p className="text-sm text-destructive">{errors.amount}</p>}
        </div>

        {/* Category */}
        <div className="space-y-2">
          <label htmlFor="category" className="text-sm font-medium">
            {t('expenses.category')} <span className="text-destructive">*</span>
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary ${
              errors.category ? 'border-destructive' : ''
            }`}
          >
            <option value="">{t('expenses.selectCategory')}</option>
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {t(`expenses.${cat.labelKey}`)}
              </option>
            ))}
          </select>
          {errors.category && <p className="text-sm text-destructive">{errors.category}</p>}
        </div>

        {/* Station (optional) */}
        <div className="space-y-2">
          <label htmlFor="station" className="text-sm font-medium">
            {t('expenses.station')} ({t('expenses.optional')})
          </label>
          <select
            id="station"
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            className="w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">{t('expenses.headOffice')}</option>
            {stations.map((station: Station) => (
              <option key={station.id} value={station.id}>
                {station.name} ({station.code})
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{t('expenses.stationHint')}</p>
        </div>

        {/* Approval Info */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
          <h3 className="font-medium text-amber-800 dark:text-amber-200">
            {t('expenses.approvalRequired')}
          </h3>
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
            {t('expenses.approvalDescription')}
          </p>
        </div>

        {/* Submit */}
        <div className="flex gap-4">
          <Link
            href={`/${locale}/admin/finance/expenses`}
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            {t('common.cancel')}
          </Link>
          <button
            type="submit"
            disabled={createExpenseMutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createExpenseMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('expenses.submitting')}
              </>
            ) : (
              t('expenses.submitForApproval')
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
