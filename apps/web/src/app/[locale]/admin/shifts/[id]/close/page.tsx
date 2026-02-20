'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { closeShiftSchema, type CloseShiftInput } from '@alcom/shared/src/schemas/shift.schema';
import { useTranslations, useFormatter } from 'next-intl';
import { useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import Decimal from 'decimal.js';
import {
  calculateVolumeSold,
  calculateRevenue,
  calculateTheoreticalCash,
  calculateCashVariance,
  calculateTheoreticalStock,
  calculateStockVariance,
} from '@alcom/shared/src/calculations';
import { AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, Gauge, Banknote, Fuel } from 'lucide-react';

interface SaleField {
  nozzleId: string;
  closingIndex: number;
  _openingIndex: number;
  _unitPrice: number;
  _label: string;
  _fuelType: string;
}

interface DipField {
  tankId: string;
  physicalLevel: number;
  _openingLevel: number;
  _label: string;
  _capacity: number;
}

export default function CloseShiftPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const t = useTranslations('Shifts');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch shift details
  const { data: shiftData, isLoading } = useQuery({
    queryKey: ['shift', id],
    queryFn: () => api.get<any>(`/shifts/${id}`),
  });

  const shift = shiftData?.data || shiftData;

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<CloseShiftInput>({
    resolver: zodResolver(closeShiftSchema),
    defaultValues: {
      sales: [],
      tankDips: [],
      cash: { counted: 0, card: 0, expenses: 0 },
      justification: undefined,
    },
  });

  // Populate form once data is loaded
  useEffect(() => {
    if (shift && shift.status === 'OPEN') {
      const priceSnapshot = shift.appliedPriceSnapshot || {};

      const initialSales: SaleField[] = (shift.sales || []).map((s: any) => ({
        nozzleId: s.nozzleId,
        closingIndex: Number(s.openingIndex),
        _openingIndex: Number(s.openingIndex),
        _unitPrice: Number(s.unitPrice) || priceSnapshot[s.nozzle?.pump?.tank?.fuelType] || 0,
        _label: `P${s.nozzle?.pump?.code || '?'} — Bec ${s.nozzle?.side || '?'}`,
        _fuelType: s.nozzle?.pump?.tank?.fuelType || 'ESSENCE',
      }));
      setValue('sales', initialSales as any);

      const initialDips: DipField[] = (shift.tankDips || []).map((td: any) => ({
        tankId: td.tankId,
        physicalLevel: Number(td.openingLevel),
        _openingLevel: Number(td.openingLevel),
        _label: `${td.tank?.fuelType || '?'} (${td.tank?.id?.substring(0, 6) || ''})`,
        _capacity: Number(td.tank?.capacity) || 0,
      }));
      setValue('tankDips', initialDips as any);
    }
  }, [shift, setValue]);

  const { fields: salesFields } = useFieldArray({ control, name: 'sales' });
  const { fields: dipsFields } = useFieldArray({ control, name: 'tankDips' });

  const salesValues = watch('sales') as SaleField[];
  const dipsValues = watch('tankDips') as DipField[];
  const cashValues = watch('cash');

  // Live calculations
  const calculations = useMemo(() => {
    if (!salesValues?.length) return { totalRevenue: 0, saleDetails: [] };

    const saleDetails = salesValues.map((s) => {
      const volume = calculateVolumeSold(s._openingIndex, s.closingIndex);
      const revenue = calculateRevenue(volume, s._unitPrice);
      return {
        nozzleId: s.nozzleId,
        label: s._label,
        fuelType: s._fuelType,
        volume: volume.toNumber(),
        revenue: revenue.toNumber(),
      };
    });

    const totalRevenue = saleDetails.reduce((sum, d) => sum + d.revenue, 0);
    return { totalRevenue, saleDetails };
  }, [salesValues]);

  const cashCalcs = useMemo(() => {
    const totalRevenue = new Decimal(calculations.totalRevenue);
    const card = new Decimal(cashValues?.card || 0);
    const expenses = new Decimal(cashValues?.expenses || 0);
    const counted = new Decimal(cashValues?.counted || 0);

    const theoretical = calculateTheoreticalCash(totalRevenue, card, expenses);
    const variance = calculateCashVariance(counted, theoretical);

    return {
      theoreticalCash: theoretical.toNumber(),
      cashVariance: variance.toNumber(),
    };
  }, [calculations.totalRevenue, cashValues]);

  // Calculate stock variance for all tanks
  const stockCalcs = useMemo(() => {
    if (!dipsValues?.length || !salesValues?.length) {
      return { totalStockVariance: 0, tankVariances: [] };
    }

    // Calculate total volume sold per tank
    const volumeByTank: Record<string, Decimal> = {};

    salesValues.forEach((sale) => {
      // Find which tank this nozzle belongs to
      const matchingSaleField = shift?.sales?.find((s: any) => s.nozzleId === sale.nozzleId);
      const tankId = matchingSaleField?.nozzle?.pump?.tankId;

      if (tankId) {
        const volume = calculateVolumeSold(sale._openingIndex, sale.closingIndex);
        volumeByTank[tankId] = (volumeByTank[tankId] || new Decimal(0)).plus(volume);
      }
    });

    // Calculate variance for each tank
    const tankVariances = dipsValues.map((dip) => {
      const openingLevel = new Decimal(dip._openingLevel || 0);
      const physicalLevel = new Decimal(dip.physicalLevel || 0);
      const salesVolume = volumeByTank[dip.tankId] || new Decimal(0);

      // Deliveries would come from shift data, default to 0 for now
      const deliveries = new Decimal(0);

      const theoreticalStock = calculateTheoreticalStock(openingLevel, deliveries, salesVolume);
      const stockVariance = calculateStockVariance(physicalLevel, theoreticalStock);

      return {
        tankId: dip.tankId,
        label: dip._label,
        variance: stockVariance.toNumber(),
        theoretical: theoreticalStock.toNumber(),
        physical: physicalLevel.toNumber(),
      };
    });

    const totalStockVariance = tankVariances.reduce(
      (sum, tv) => sum + Math.abs(tv.variance),
      0
    );

    return { totalStockVariance, tankVariances };
  }, [dipsValues, salesValues, shift?.sales]);

  const hasVariance = cashCalcs.cashVariance !== 0 || stockCalcs.totalStockVariance !== 0;

  const mutation = useMutation({
    mutationFn: (data: CloseShiftInput) =>
      api.post(`/shifts/${id}/close`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['shift', id] });
      queryClient.invalidateQueries({ queryKey: ['shift-current'] });
      router.push(`/admin/shifts/${id}`);
    },
    onError: (err: any) => {
      setSubmitError(err.message || 'Erreur lors de la fermeture');
    },
  });

  const nextStep = async () => {
    // Validate current step
    if (step === 0) {
      const valid = await trigger('sales');
      if (!valid) return;
    } else if (step === 1) {
      const valid = await trigger('tankDips');
      if (!valid) return;
    } else if (step === 2) {
      const valid = await trigger('cash');
      if (!valid) return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const prevStep = () => setStep((s) => Math.max(s - 1, 0));

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!shift) return <div className="p-6 text-center text-gray-500">{t('shiftNotFound')}</div>;

  if (shift.status !== 'OPEN') {
    return (
      <div className="mx-auto max-w-md rounded-lg bg-amber-50 p-6 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-500" />
        <h2 className="text-lg font-bold">{t('shiftAlreadyClosed')}</h2>
        <button
          onClick={() => router.push(`/admin/shifts/${id}`)}
          className="mt-4 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          {t('viewDetails')}
        </button>
      </div>
    );
  }

  const STEPS = [t('stepPump'), t('stepTank'), t('stepCash'), t('stepSummary')];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('closeShift')}</h1>
          <p className="text-sm text-gray-500">
            {shift.station?.name} — {shift.shiftDate} — {shift.shiftType}
          </p>
        </div>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => i <= step && setStep(i)}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors',
                i === step
                  ? 'bg-blue-600 text-white'
                  : i < step
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-400',
              )}
            >
              {i < step ? '✓' : i + 1}
            </button>
            <span
              className={cn(
                'hidden text-sm md:inline',
                i === step ? 'font-medium' : 'text-gray-400',
              )}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && <div className="mx-2 h-px w-8 bg-gray-200" />}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit((data) => mutation.mutate(data))}>
        {/* Step 1: Pump Readings */}
        {step === 0 && (
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="mb-4 flex items-center gap-2">
              <Gauge className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-medium">{t('pumpIndexReadings')}</h3>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {salesFields.map((field, index) => {
                const val = salesValues?.[index] as SaleField | undefined;
                const volume = val
                  ? calculateVolumeSold(val._openingIndex, val.closingIndex).toNumber()
                  : 0;
                const revenue = val
                  ? calculateRevenue(volume, val._unitPrice).toNumber()
                  : 0;

                return (
                  <div key={field.id} className="rounded border bg-gray-50 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-bold">{val?._label}</span>
                      <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                        {val?._fuelType}
                      </span>
                    </div>
                    <div className="mb-2 text-xs text-gray-500">
                      Index début: <strong>{val?._openingIndex?.toFixed(2)}</strong> | Prix:{' '}
                      <strong>{val?._unitPrice?.toLocaleString('fr-FR')} FCFA/L</strong>
                    </div>
                    <label className="mb-1 block text-sm">Index Fin</label>
                    <input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      {...register(`sales.${index}.closingIndex`, { valueAsNumber: true })}
                      className="w-full rounded border p-2 text-lg"
                    />
                    <input type="hidden" {...register(`sales.${index}.nozzleId`)} />
                    {errors.sales?.[index]?.closingIndex && (
                      <p className="mt-1 text-xs text-red-500">
                        {errors.sales[index]?.closingIndex?.message}
                      </p>
                    )}
                    {/* Live calculation */}
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-500">Volume: </span>
                        <span className="font-medium">{volume.toFixed(2)} L</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Montant: </span>
                        <span className="font-medium">
                          {revenue.toLocaleString('fr-FR')} FCFA
                        </span>
                      </div>
                    </div>
                    {volume > 5000 && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                        <AlertTriangle className="h-3 w-3" />
                        Volume élevé — Vérifiez la valeur
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Tank Dips */}
        {step === 1 && (
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="mb-4 flex items-center gap-2">
              <Fuel className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-medium">{t('tankDipping')}</h3>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {dipsFields.map((field, index) => {
                const val = dipsValues?.[index] as DipField | undefined;
                const fillPercent = val && val._capacity > 0
                  ? Math.round((val.physicalLevel / val._capacity) * 100)
                  : 0;

                return (
                  <div key={field.id} className="rounded border bg-gray-50 p-4">
                    <span className="text-sm font-bold">{val?._label}</span>
                    <div className="mb-2 text-xs text-gray-500">
                      Ouverture: <strong>{val?._openingLevel?.toFixed(0)} L</strong> |
                      Capacité: <strong>{val?._capacity?.toLocaleString('fr-FR')} L</strong>
                    </div>
                    <label className="mb-1 block text-sm">Jauge Physique (L)</label>
                    <input
                      type="number"
                      step="1"
                      inputMode="numeric"
                      {...register(`tankDips.${index}.physicalLevel`, { valueAsNumber: true })}
                      className="w-full rounded border p-2 text-lg"
                    />
                    <input type="hidden" {...register(`tankDips.${index}.tankId`)} />
                    {/* Tank fill bar */}
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Remplissage</span>
                        <span>{fillPercent}%</span>
                      </div>
                      <div className="mt-1 h-2 w-full rounded-full bg-gray-200">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            fillPercent > 75
                              ? 'bg-green-500'
                              : fillPercent > 30
                                ? 'bg-blue-500'
                                : 'bg-red-500',
                          )}
                          style={{ width: `${Math.min(fillPercent, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 3: Cash */}
        {step === 2 && (
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="mb-4 flex items-center gap-2">
              <Banknote className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-medium">{t('cashDeposits')}</h3>
            </div>

            <div className="mb-6 rounded bg-gray-50 p-4">
              <p className="text-sm text-gray-500">{t('totalRevenue')}</p>
              <p className="text-2xl font-bold">
                {calculations.totalRevenue.toLocaleString('fr-FR')} FCFA
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">{t('actualCash')}</label>
                <input
                  type="number"
                  inputMode="numeric"
                  {...register('cash.counted', { valueAsNumber: true })}
                  className="w-full rounded border p-2 text-lg"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t('cardMobile')}</label>
                <input
                  type="number"
                  inputMode="numeric"
                  {...register('cash.card', { valueAsNumber: true })}
                  className="w-full rounded border p-2 text-lg"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t('expenses')}</label>
                <input
                  type="number"
                  inputMode="numeric"
                  {...register('cash.expenses', { valueAsNumber: true })}
                  className="w-full rounded border p-2 text-lg"
                />
              </div>
            </div>

            {/* Live variance display */}
            <div className="mt-6 grid grid-cols-2 gap-4 rounded border p-4">
              <div>
                <p className="text-sm text-gray-500">{t('theoreticalCash')}</p>
                <p className="text-xl font-bold">
                  {cashCalcs.theoreticalCash.toLocaleString('fr-FR')} FCFA
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">{t('cashVariance')}</p>
                <p
                  className={cn(
                    'text-xl font-bold',
                    cashCalcs.cashVariance === 0
                      ? 'text-green-600'
                      : cashCalcs.cashVariance > 0
                        ? 'text-blue-600'
                        : 'text-red-600',
                  )}
                >
                  {cashCalcs.cashVariance > 0 ? '+' : ''}
                  {cashCalcs.cashVariance.toLocaleString('fr-FR')} FCFA
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Revenue summary */}
            <div className="rounded-lg bg-white p-6 shadow">
              <h3 className="mb-3 text-lg font-medium">{t('salesSummary')}</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 text-left">{t('pumpNozzle')}</th>
                    <th className="py-2 text-left">{t('fuelSales').replace('Ventes ', '')}</th>
                    <th className="py-2 text-right">{t('volume')}</th>
                    <th className="py-2 text-right">{t('amount')} (FCFA)</th>
                  </tr>
                </thead>
                <tbody>
                  {calculations.saleDetails.map((d) => (
                    <tr key={d.nozzleId} className="border-b">
                      <td className="py-2">{d.label}</td>
                      <td className="py-2">{d.fuelType}</td>
                      <td className="py-2 text-right">{d.volume.toFixed(2)}</td>
                      <td className="py-2 text-right font-medium">
                        {d.revenue.toLocaleString('fr-FR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold">
                    <td colSpan={3} className="py-3">Total</td>
                    <td className="py-3 text-right">
                      {calculations.totalRevenue.toLocaleString('fr-FR')} FCFA
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Cash reconciliation summary */}
            <div className="rounded-lg bg-white p-6 shadow">
              <h3 className="mb-3 text-lg font-medium">{t('cashReconciliation')}</h3>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div>
                  <p className="text-xs text-gray-500">{t('actualCash')}</p>
                  <p className="font-bold">{(cashValues?.counted || 0).toLocaleString('fr-FR')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('card')}</p>
                  <p className="font-bold">{(cashValues?.card || 0).toLocaleString('fr-FR')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('expenses')}</p>
                  <p className="font-bold">{(cashValues?.expenses || 0).toLocaleString('fr-FR')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('variance')}</p>
                  <p
                    className={cn(
                      'font-bold',
                      cashCalcs.cashVariance === 0
                        ? 'text-green-600'
                        : 'text-red-600',
                    )}
                  >
                    {cashCalcs.cashVariance > 0 ? '+' : ''}
                    {cashCalcs.cashVariance.toLocaleString('fr-FR')} FCFA
                  </p>
                </div>
              </div>
            </div>

            {/* Stock variance summary */}
            <div className="rounded-lg bg-white p-6 shadow">
              <h3 className="mb-3 text-lg font-medium">Stock Reconciliation</h3>
              <div className="space-y-3">
                {stockCalcs.tankVariances.map((tv) => (
                  <div key={tv.tankId} className="flex items-center justify-between border-b pb-2">
                    <div>
                      <p className="text-sm font-medium">{tv.label}</p>
                      <p className="text-xs text-gray-500">
                        Theoretical: {tv.theoretical.toFixed(2)} L | Physical: {tv.physical.toFixed(2)} L
                      </p>
                    </div>
                    <div>
                      <p
                        className={cn(
                          'text-sm font-bold',
                          tv.variance === 0
                            ? 'text-green-600'
                            : tv.variance > 0
                              ? 'text-blue-600'
                              : 'text-red-600',
                        )}
                      >
                        {tv.variance > 0 ? '+' : ''}
                        {tv.variance.toFixed(2)} L
                      </p>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t pt-3">
                  <p className="font-medium">Total Stock Variance (Absolute)</p>
                  <p
                    className={cn(
                      'text-lg font-bold',
                      stockCalcs.totalStockVariance === 0
                        ? 'text-green-600'
                        : 'text-red-600',
                    )}
                  >
                    {stockCalcs.totalStockVariance.toFixed(2)} L
                  </p>
                </div>
              </div>
            </div>

            {/* Justification required */}
            {hasVariance && (
              <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-6">
                <div className="mb-3 flex items-center gap-2 text-amber-700">
                  <AlertTriangle className="h-5 w-5" />
                  <h3 className="font-medium">{t('justificationRequired')}</h3>
                </div>
                <div className="mb-3 text-sm text-amber-800">
                  {cashCalcs.cashVariance !== 0 && stockCalcs.totalStockVariance !== 0 && (
                    <p>Cash variance detected: <strong>{cashCalcs.cashVariance.toLocaleString('fr-FR')} FCFA</strong> and Stock variance detected: <strong>{stockCalcs.totalStockVariance.toFixed(2)} L</strong></p>
                  )}
                  {cashCalcs.cashVariance !== 0 && stockCalcs.totalStockVariance === 0 && (
                    <p>Cash variance detected: <strong>{cashCalcs.cashVariance.toLocaleString('fr-FR')} FCFA</strong></p>
                  )}
                  {cashCalcs.cashVariance === 0 && stockCalcs.totalStockVariance !== 0 && (
                    <p>Stock variance detected: <strong>{stockCalcs.totalStockVariance.toFixed(2)} L</strong></p>
                  )}
                  <p className="mt-1">Please provide an explanation for this discrepancy.</p>
                </div>
                <textarea
                  {...register('justification')}
                  placeholder={t('submitJustification')}
                  rows={4}
                  className="w-full rounded border p-3"
                />
                {errors.justification && (
                  <p className="mt-1 text-sm text-red-500">{errors.justification.message}</p>
                )}
              </div>
            )}

            {/* Error */}
            {submitError && (
              <div className="rounded bg-red-50 p-3 text-sm text-red-600">{submitError}</div>
            )}
          </div>
        )}

        {/* Sticky footer with variance */}
        {step >= 2 && hasVariance && (
          <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white p-3 shadow-lg md:left-64">
            <div className="mx-auto flex max-w-4xl items-center justify-center gap-6">
              {cashCalcs.cashVariance !== 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Cash {t('variance')}:</span>
                  <span
                    className={cn(
                      'text-lg font-bold',
                      cashCalcs.cashVariance < 0 ? 'text-red-600' : 'text-blue-600',
                    )}
                  >
                    {cashCalcs.cashVariance > 0 ? '+' : ''}
                    {cashCalcs.cashVariance.toLocaleString('fr-FR')} FCFA
                  </span>
                </div>
              )}
              {stockCalcs.totalStockVariance !== 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Stock {t('variance')}:</span>
                  <span className="text-lg font-bold text-red-600">
                    {stockCalcs.totalStockVariance.toFixed(2)} L
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex justify-between pt-4 pb-20">
          <button
            type="button"
            onClick={step === 0 ? () => router.back() : prevStep}
            className="flex items-center gap-2 rounded border px-4 py-2 hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" />
            {step === 0 ? t('cancel') : t('previous')}
          </button>

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={nextStep}
              className="flex items-center gap-2 rounded bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
            >
              {t('next')}
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex items-center gap-2 rounded bg-green-600 px-6 py-2 text-white hover:bg-green-700 disabled:opacity-50"
            >
              {mutation.isPending ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {t('closing')}
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" />
                  {t('closeFinal')}
                </>
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
