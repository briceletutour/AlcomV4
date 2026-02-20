'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { ArrowLeft, Fuel, Calendar, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

interface ActivePricesResponse {
  ESSENCE: { price: number } | null;
  GASOIL: { price: number } | null;
  PETROLE: { price: number } | null;
}

export default function NewPricePage() {
  const t = useTranslations('Prices');
  const locale = useLocale();
  const router = useRouter();

  const [fuelType, setFuelType] = useState<'ESSENCE' | 'GASOIL' | 'PETROLE'>('ESSENCE');
  const [price, setPrice] = useState<string>('');
  const [effectiveDate, setEffectiveDate] = useState<string>('');
  const [effectiveTime, setEffectiveTime] = useState<string>('06:00');

  // Fetch current prices for comparison
  const { data: activePrices } = useQuery({
    queryKey: ['prices', 'active'],
    queryFn: () => api.get<ActivePricesResponse>('/prices/active'),
  });

  const createMutation = useMutation({
    mutationFn: (data: { fuelType: string; price: number; effectiveDate: string }) =>
      api.post('/prices', data),
    onSuccess: () => {
      router.push(`/${locale}/admin/prices`);
    },
    onError: (err: any) => {
      toast.error(err.message || t('errorGeneric'));
    },
  });

  // Calculate minimum date (tomorrow)
  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 1);
  const minDateStr = minDate.toISOString().split('T')[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.error('');

    const priceNum = parseFloat(price.replace(/\s/g, ''));
    if (isNaN(priceNum) || priceNum <= 0) {
      toast.error(t('invalidPrice'));
      return;
    }

    if (!effectiveDate) {
      toast.error(t('invalidDate'));
      return;
    }

    // Combine date and time
    const dateTime = new Date(`${effectiveDate}T${effectiveTime}:00`);
    if (dateTime <= new Date()) {
      toast.error(t('dateMustBeFuture'));
      return;
    }

    createMutation.mutate({
      fuelType,
      price: priceNum,
      effectiveDate: dateTime.toISOString(),
    });
  };

  const formatPrice = (num: number) => {
    return new Intl.NumberFormat('fr-FR').format(num) + ' XAF';
  };

  const currentPrice =
    fuelType === 'ESSENCE'
      ? (activePrices as any)?.ESSENCE?.price
      : fuelType === 'PETROLE'
        ? (activePrices as any)?.PETROLE?.price
        : (activePrices as any)?.GASOIL?.price;

  const priceNum = parseFloat(price.replace(/\s/g, '')) || 0;
  const priceDiff = currentPrice ? priceNum - currentPrice : 0;
  const priceDiffPercent = currentPrice ? ((priceDiff / currentPrice) * 100).toFixed(1) : 0;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/${locale}/admin/prices`}
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('backToList')}
        </Link>
        <h1 className="text-2xl font-bold">{t('newPrice')}</h1>
        <p className="text-muted-foreground">{t('newPriceDescription')}</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">


        {/* Fuel Type */}
        <div>
          <label className="mb-2 block text-sm font-medium">{t('fuelType')}</label>
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setFuelType('ESSENCE')}
              className={`flex items-center justify-center gap-2 rounded-lg border-2 p-4 transition-colors ${fuelType === 'ESSENCE'
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-gray-200 hover:border-gray-300'
                }`}
            >
              <Fuel className="h-5 w-5" />
              <span className="font-medium">{t('essence')}</span>
            </button>
            <button
              type="button"
              onClick={() => setFuelType('GASOIL')}
              className={`flex items-center justify-center gap-2 rounded-lg border-2 p-4 transition-colors ${fuelType === 'GASOIL'
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-gray-200 hover:border-gray-300'
                }`}
            >
              <Fuel className="h-5 w-5" />
              <span className="font-medium">{t('gasoil')}</span>
            </button>
            <button
              type="button"
              onClick={() => setFuelType('PETROLE')}
              className={`flex items-center justify-center gap-2 rounded-lg border-2 p-4 transition-colors ${fuelType === 'PETROLE'
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-gray-200 hover:border-gray-300'
                }`}
            >
              <Fuel className="h-5 w-5" />
              <span className="font-medium">{t('petrole')}</span>
            </button>
          </div>
        </div>

        {/* Current Price Info */}
        {currentPrice && (
          <div className="rounded-lg bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">{t('currentPrice')}</p>
            <p className="text-lg font-semibold">{formatPrice(currentPrice)}</p>
          </div>
        )}

        {/* Price Input */}
        <div>
          <label htmlFor="price" className="mb-2 block text-sm font-medium">
            {t('newPriceValue')}
          </label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              id="price"
              type="text"
              inputMode="numeric"
              value={price}
              onChange={(e) => {
                // Allow only numbers and spaces for formatting
                const val = e.target.value.replace(/[^\d\s]/g, '');
                setPrice(val);
              }}
              placeholder="650"
              className="w-full rounded-md border bg-background py-3 pl-10 pr-16 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              XAF
            </span>
          </div>

          {/* Price Difference Preview */}
          {priceNum > 0 && currentPrice && (
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`text-sm font-medium ${priceDiff > 0 ? 'text-green-600' : priceDiff < 0 ? 'text-red-600' : ''
                  }`}
              >
                {priceDiff > 0 ? '+' : ''}
                {formatPrice(priceDiff)} ({priceDiff > 0 ? '+' : ''}
                {priceDiffPercent}%)
              </span>
              <span className="text-sm text-muted-foreground">{t('fromCurrent')}</span>
            </div>
          )}
        </div>

        {/* Effective Date */}
        <div>
          <label htmlFor="effectiveDate" className="mb-2 block text-sm font-medium">
            {t('effectiveDate')}
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <input
                id="effectiveDate"
                type="date"
                min={minDateStr}
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-full rounded-md border bg-background py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <input
              type="time"
              value={effectiveTime}
              onChange={(e) => setEffectiveTime(e.target.value)}
              className="rounded-md border bg-background px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t('effectiveDateHint')}</p>
        </div>

        {/* Info Box */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h3 className="mb-2 font-medium text-amber-800">{t('approvalRequired')}</h3>
          <p className="text-sm text-amber-700">{t('approvalRequiredDescription')}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <Link
            href={`/${locale}/admin/prices`}
            className="flex-1 rounded-md border py-3 text-center font-medium hover:bg-muted"
          >
            {t('cancel')}
          </Link>
          <button
            type="submit"
            disabled={createMutation.isPending || !price || !effectiveDate}
            className="flex-1 rounded-md bg-primary py-3 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createMutation.isPending ? t('submitting') : t('submitForApproval')}
          </button>
        </div>
      </form>
    </div>
  );
}
