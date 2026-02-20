'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Settings, Save } from 'lucide-react';

interface StationSettings {
  id: string;
  code: string;
  name: string;
  settings: {
    tolerance: {
      cashVariance: number;
      stockVariance: number;
    };
    openingHours: {
      morning: string;
      evening: string;
    };
  };
}

interface SettingsFormData {
  tolerance: {
    cashVariance: number;
    stockVariance: number;
  };
  openingHours: {
    morning: string;
    evening: string;
  };
}

export default function StationSettingsPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const t = useTranslations('Stations');
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: station, isLoading } = useQuery<StationSettings>({
    queryKey: ['station-settings', id],
    queryFn: async () => {
      const res = await api.get<any>(`/stations/${id}/settings`);
      return (res as any).data || res;
    },
  });

  const {
    register,
    handleSubmit,
    formState: { isSubmitting, isDirty },
  } = useForm<SettingsFormData>({
    values: station?.settings,
  });

  const mutation = useMutation({
    mutationFn: (data: SettingsFormData) =>
      api.put(`/stations/${id}/settings`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['station-settings', id] });
      queryClient.invalidateQueries({ queryKey: ['station', id] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        {t('loading')}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push(`/admin/stations/${id}`)}
          className="rounded-md p-1.5 hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Settings className="h-6 w-6" />
            {t('stationSettings')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {station?.name} ({station?.code})
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
        className="space-y-6"
      >
        {/* Tolerance Settings */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">{t('toleranceSettings')}</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {t('toleranceDescription')}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">
                {t('cashTolerance')} (XAF)
              </label>
              <input
                type="number"
                {...register('tolerance.cashVariance', { valueAsNumber: true })}
                className="w-full rounded-md border bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t('cashToleranceHint')}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                {t('stockTolerance')} (L)
              </label>
              <input
                type="number"
                {...register('tolerance.stockVariance', { valueAsNumber: true })}
                className="w-full rounded-md border bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t('stockToleranceHint')}
              </p>
            </div>
          </div>
        </div>

        {/* Opening Hours */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">{t('openingHours')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">
                {t('morningShift')}
              </label>
              <input
                type="time"
                {...register('openingHours.morning')}
                className="w-full rounded-md border bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                {t('eveningShift')}
              </label>
              <input
                type="time"
                {...register('openingHours.evening')}
                className="w-full rounded-md border bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        {/* Success / Error messages */}
        {mutation.isSuccess && (
          <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            {t('settingsSaved')}
          </div>
        )}
        {mutation.error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {(mutation.error as any)?.message || t('errorGeneric')}
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting || !isDirty}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isSubmitting ? t('saving') : t('saveSettings')}
          </button>
        </div>
      </form>
    </div>
  );
}
