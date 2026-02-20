'use client';

import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createStationSchema, type CreateStationInput } from '@alcom/shared/src/schemas/station.schema';
import { api } from '@/lib/api-client';
import { showSuccessToast, showErrorToast } from '@/lib/toast';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, ArrowLeft, ArrowRight, Check, Fuel, Gauge } from 'lucide-react';

type WizardStep = 1 | 2 | 3;

export default function NewStationWizardPage() {
  const t = useTranslations('Stations');
  const tErrors = useTranslations('Errors');
  const router = useRouter();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<WizardStep>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    watch,
    trigger,
  } = useForm<CreateStationInput>({
    resolver: zodResolver(createStationSchema),
    defaultValues: {
      code: '',
      name: '',
      settings: {
        tolerance: { cashVariance: 5000, stockVariance: 50 },
        openingHours: { morning: '06:00', evening: '18:00' },
      },
      tanks: [],
      pumps: [],
    },
  });

  const {
    fields: tankFields,
    append: addTank,
    remove: removeTank,
  } = useFieldArray({ control, name: 'tanks' });

  const {
    fields: pumpFields,
    append: addPump,
    remove: removePump,
  } = useFieldArray({ control, name: 'pumps' });

  const tanks = watch('tanks') || [];

  // Handle step navigation
  const goToStep = async (target: WizardStep) => {
    if (target > step) {
      // Validate current step before advancing
      if (step === 1) {
        const valid = await trigger(['code', 'name', 'settings']);
        if (!valid) return;
      }
    }
    setStep(target);
  };

  const onSubmit = async (data: CreateStationInput) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await api.post('/stations', data);
      queryClient.invalidateQueries({ queryKey: ['stations'] });
      showSuccessToast(t('successCreate'));
      router.push(`/${locale}/admin/stations`);
    } catch (err: any) {
      setError(err?.message || err?.error?.message || tErrors('generic'));
      showErrorToast(err, {
        title: tErrors('generic'),
        onRetry: () => handleSubmit(onSubmit)(),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepLabels = [
    { num: 1, label: t('wizardStep1'), icon: Fuel },
    { num: 2, label: t('wizardStep2'), icon: Fuel },
    { num: 3, label: t('wizardStep3'), icon: Gauge },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      {/* Stepper */}
      <div className="mb-8 flex items-center justify-center gap-2">
        {stepLabels.map((s, i) => (
          <div key={s.num} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => s.num <= step && setStep(s.num as WizardStep)}
              className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-colors ${s.num === step
                ? 'bg-primary text-primary-foreground'
                : s.num < step
                  ? 'bg-green-100 text-green-700'
                  : 'bg-muted text-muted-foreground'
                }`}
            >
              {s.num < step ? <Check className="h-5 w-5" /> : s.num}
            </button>
            <span className="hidden text-sm font-medium sm:inline">{s.label}</span>
            {i < stepLabels.length - 1 && (
              <div className={`mx-2 h-0.5 w-8 ${s.num < step ? 'bg-green-400' : 'bg-muted'}`} />
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          {/* ═══ Step 1: Station Info ═══ */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold">{t('stationInfo')}</h2>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('code')}</label>
                  <input
                    {...register('code')}
                    className="w-full rounded-md border bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="ST-DLA-004"
                  />
                  {errors.code && (
                    <p className="mt-1 text-sm text-destructive">{errors.code.message}</p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('name')}</label>
                  <input
                    {...register('name')}
                    className="w-full rounded-md border bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Station Centrale"
                  />
                  {errors.name && (
                    <p className="mt-1 text-sm text-destructive">{errors.name.message}</p>
                  )}
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="mb-3 font-medium">{t('toleranceSettings')}</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      {t('cashTolerance')} (XAF)
                    </label>
                    <input
                      type="number"
                      {...register('settings.tolerance.cashVariance', { valueAsNumber: true })}
                      className="w-full rounded-md border bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      {t('stockTolerance')} (L)
                    </label>
                    <input
                      type="number"
                      {...register('settings.tolerance.stockVariance', { valueAsNumber: true })}
                      className="w-full rounded-md border bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="mb-3 font-medium">{t('openingHours')}</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium">{t('morningShift')}</label>
                    <input
                      type="time"
                      {...register('settings.openingHours.morning')}
                      className="w-full rounded-md border bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">{t('eveningShift')}</label>
                    <input
                      type="time"
                      {...register('settings.openingHours.evening')}
                      className="w-full rounded-md border bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ Step 2: Tanks ═══ */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">{t('addTanks')}</h2>
                <button
                  type="button"
                  onClick={() =>
                    addTank({
                      fuelType: 'ESSENCE',
                      capacity: 30000,
                      currentLevel: 0,
                      tempId: `tank-${Date.now()}`,
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" />
                  {t('addTank')}
                </button>
              </div>

              {tankFields.length === 0 && (
                <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground">
                  {t('noTanksYet')}
                </div>
              )}

              {tankFields.map((field, index) => (
                <div
                  key={field.id}
                  className="rounded-lg border bg-muted/20 p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-medium">
                      {t('tank')} #{index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeTank(index)}
                      className="text-destructive hover:bg-destructive/10 rounded p-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium">{t('fuelType')}</label>
                      <select
                        {...register(`tanks.${index}.fuelType`)}
                        className="w-full rounded-md border bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="ESSENCE">Essence (Super)</option>
                        <option value="GASOIL">Gasoil (Diesel)</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        {t('capacity')} (L)
                      </label>
                      <input
                        type="number"
                        {...register(`tanks.${index}.capacity`, { valueAsNumber: true })}
                        className="w-full rounded-md border bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        {t('currentLevel')} (L)
                      </label>
                      <input
                        type="number"
                        {...register(`tanks.${index}.currentLevel`, { valueAsNumber: true })}
                        className="w-full rounded-md border bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>
                  {/* Hidden tempId */}
                  <input type="hidden" {...register(`tanks.${index}.tempId`)} />
                </div>
              ))}
            </div>
          )}

          {/* ═══ Step 3: Pumps ═══ */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">{t('addPumps')}</h2>
                <button
                  type="button"
                  onClick={() =>
                    addPump({
                      code: `P-${pumpFields.length + 1}`,
                      tankId: tanks[0]?.tempId || '',
                    })
                  }
                  disabled={tanks.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  {t('addPump')}
                </button>
              </div>

              {tanks.length === 0 && (
                <div className="rounded-lg border border-warning/50 bg-warning/10 p-4 text-sm">
                  {t('addTanksFirst')}
                </div>
              )}

              {pumpFields.length === 0 && tanks.length > 0 && (
                <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground">
                  {t('noPumpsYet')}
                </div>
              )}

              {pumpFields.map((field, index) => (
                <div
                  key={field.id}
                  className="rounded-lg border bg-muted/20 p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-medium">
                      {t('pump')} #{index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removePump(index)}
                      className="text-destructive hover:bg-destructive/10 rounded p-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium">{t('pumpCode')}</label>
                      <input
                        {...register(`pumps.${index}.code`)}
                        className="w-full rounded-md border bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="P-1"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        {t('linkedTank')}
                      </label>
                      <select
                        {...register(`pumps.${index}.tankId`)}
                        className="w-full rounded-md border bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">{t('selectTank')}</option>
                        {tanks.map((tank, tIdx) => (
                          <option key={tank.tempId || tIdx} value={tank.tempId || ''}>
                            {t('tank')} #{tIdx + 1} — {tank.fuelType} ({tank.capacity}L)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('nozzlesAutoCreated')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Error display */}
        {error && (
          <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Navigation buttons */}
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => (step === 1 ? router.back() : goToStep((step - 1) as WizardStep))}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
            {step === 1 ? t('cancel') : t('previous')}
          </button>

          {step < 3 ? (
            <button
              type="button"
              onClick={() => goToStep((step + 1) as WizardStep)}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {t('next')}
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              {isSubmitting ? t('creating') : t('createStation')}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
