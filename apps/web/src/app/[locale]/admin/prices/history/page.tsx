'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { ArrowLeft, Fuel, TrendingUp, TrendingDown } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface PriceHistoryItem {
  id: string;
  fuelType: 'ESSENCE' | 'GASOIL' | 'PETROLE';
  price: number;
  effectiveDate: string;
  isActive: boolean;
}

export default function PriceHistoryPage() {
  const t = useTranslations('Prices');
  const locale = useLocale();

  const [months, setMonths] = useState(12);
  const [selectedFuelType, setSelectedFuelType] = useState<string>('');

  // Fetch price history
  const { data, isLoading } = useQuery({
    queryKey: ['prices', 'history', months, selectedFuelType],
    queryFn: () => {
      const params = new URLSearchParams({ months: String(months) });
      if (selectedFuelType) params.append('fuelType', selectedFuelType);
      return api.get<{ data: PriceHistoryItem[] }>(`/prices/history?${params}`);
    },
  });

  const priceHistory = (data as any)?.data || [];

  // Process data for chart - group by date
  const chartData = processChartData(priceHistory);

  // Calculate statistics
  const stats = calculateStats(priceHistory);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/${locale}/admin/prices`}
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('backToList')}
        </Link>
        <h1 className="text-2xl font-bold">{t('priceHistory')}</h1>
        <p className="text-muted-foreground">{t('priceHistoryDescription')}</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
          className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value={3}>{t('last3Months')}</option>
          <option value={6}>{t('last6Months')}</option>
          <option value={12}>{t('last12Months')}</option>
          <option value={24}>{t('last24Months')}</option>
        </select>
        <select
          value={selectedFuelType}
          onChange={(e) => setSelectedFuelType(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">{t('allFuelTypes')}</option>
          <option value="ESSENCE">{t('essence')}</option>
          <option value="GASOIL">{t('gasoil')}</option>
          <option value="PETROLE">{t('petrole')}</option>
        </select>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Essence Stats */}
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-muted-foreground">
            <Fuel className="h-5 w-5" />
            <span className="text-sm font-medium">{t('essence')}</span>
          </div>
          <p className="text-2xl font-bold">
            {stats.essence.current
              ? formatPrice(stats.essence.current)
              : '-'}
          </p>
          {stats.essence.change !== 0 && (
            <div className="mt-1 flex items-center gap-1">
              {stats.essence.change > 0 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
              <span
                className={`text-sm ${
                  stats.essence.change > 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {stats.essence.change > 0 ? '+' : ''}
                {stats.essence.changePercent.toFixed(1)}%
              </span>
              <span className="text-xs text-muted-foreground">{t('vsPrevious')}</span>
            </div>
          )}
        </div>

        {/* Gasoil Stats */}
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-muted-foreground">
            <Fuel className="h-5 w-5" />
            <span className="text-sm font-medium">{t('gasoil')}</span>
          </div>
          <p className="text-2xl font-bold">
            {stats.gasoil.current
              ? formatPrice(stats.gasoil.current)
              : '-'}
          </p>
          {stats.gasoil.change !== 0 && (
            <div className="mt-1 flex items-center gap-1">
              {stats.gasoil.change > 0 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
              <span
                className={`text-sm ${
                  stats.gasoil.change > 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {stats.gasoil.change > 0 ? '+' : ''}
                {stats.gasoil.changePercent.toFixed(1)}%
              </span>
              <span className="text-xs text-muted-foreground">{t('vsPrevious')}</span>
            </div>
          )}
        </div>

        {/* Petrole Stats */}
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-muted-foreground">
            <Fuel className="h-5 w-5" />
            <span className="text-sm font-medium">{t('petrole')}</span>
          </div>
          <p className="text-2xl font-bold">
            {stats.petrole.current
              ? formatPrice(stats.petrole.current)
              : '-'}
          </p>
          {stats.petrole.change !== 0 && (
            <div className="mt-1 flex items-center gap-1">
              {stats.petrole.change > 0 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
              <span
                className={`text-sm ${
                  stats.petrole.change > 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {stats.petrole.change > 0 ? '+' : ''}
                {stats.petrole.changePercent.toFixed(1)}%
              </span>
              <span className="text-xs text-muted-foreground">{t('vsPrevious')}</span>
            </div>
          )}
        </div>

        {/* Total Changes */}
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-2 text-sm font-medium text-muted-foreground">
            {t('totalChanges')}
          </div>
          <p className="text-2xl font-bold">{priceHistory.length}</p>
          <p className="text-xs text-muted-foreground">
            {t('inPeriod', { months })}
          </p>
        </div>

        {/* Average Price */}
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-2 text-sm font-medium text-muted-foreground">
            {t('averagePrice')}
          </div>
          <p className="text-2xl font-bold">
            {priceHistory.length > 0
              ? formatPrice(
                  priceHistory.reduce((sum: number, p: PriceHistoryItem) => sum + p.price, 0) /
                    priceHistory.length
                )
              : '-'}
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">{t('priceEvolution')}</h2>
        {isLoading ? (
          <div className="flex h-80 items-center justify-center text-muted-foreground">
            {t('loading')}
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-80 items-center justify-center text-muted-foreground">
            {t('noData')}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) =>
                  new Date(value).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
                    month: 'short',
                    year: '2-digit',
                  })
                }
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => `${value.toLocaleString()} XAF`}
                domain={['dataMin - 20', 'dataMax + 20']}
              />
              <Tooltip
                formatter={(value: number) => [`${value.toLocaleString()} XAF`, '']}
                labelFormatter={(label) =>
                  new Date(label).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                }
              />
              <Legend />
              {(!selectedFuelType || selectedFuelType === 'ESSENCE') && (
                <Line
                  type="stepAfter"
                  dataKey="ESSENCE"
                  name={t('essence')}
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  connectNulls
                />
              )}
              {(!selectedFuelType || selectedFuelType === 'GASOIL') && (
                <Line
                  type="stepAfter"
                  dataKey="GASOIL"
                  name={t('gasoil')}
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Price History Table */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="border-b p-4">
          <h2 className="text-lg font-semibold">{t('detailedHistory')}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left text-sm font-medium">
                  {t('fuelType')}
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium">
                  {t('price')}
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium">
                  {t('effectiveDate')}
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium">
                  {t('status')}
                </th>
              </tr>
            </thead>
            <tbody>
              {priceHistory.map((price: PriceHistoryItem, index: number) => {
                // Calculate change from previous price of same type
                const prevOfType = priceHistory
                  .slice(index + 1)
                  .find((p: PriceHistoryItem) => p.fuelType === price.fuelType);
                const change = prevOfType ? price.price - prevOfType.price : 0;

                return (
                  <tr key={price.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Fuel className="h-4 w-4 text-muted-foreground" />
                        <span>
                          {price.fuelType === 'ESSENCE' ? t('essence') : t('gasoil')}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-mono font-semibold">
                        {formatPrice(price.price)}
                      </span>
                      {change !== 0 && (
                        <span
                          className={`ml-2 text-xs ${
                            change > 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          ({change > 0 ? '+' : ''})
                          {formatPrice(change)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {new Date(price.effectiveDate).toLocaleDateString(
                        locale === 'fr' ? 'fr-FR' : 'en-US',
                        {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        }
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {price.isActive ? (
                        <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                          {t('active')}
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                          {t('historical')}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {priceHistory.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    {t('noData')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Helper functions
function formatPrice(num: number): string {
  return new Intl.NumberFormat('fr-FR').format(Math.round(num)) + ' XAF';
}

function processChartData(priceHistory: PriceHistoryItem[]): any[] {
  // Group prices by date and fuel type
  const dateMap = new Map<string, { ESSENCE?: number; GASOIL?: number; PETROLE?: number }>();

  // Sort by date ascending
  const sorted = [...priceHistory].sort(
    (a, b) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime()
  );

  let lastEssence: number | undefined;
  let lastGasoil: number | undefined;
  let lastPetrole: number | undefined;

  for (const price of sorted) {
    const dateStr = price.effectiveDate.split('T')[0] ?? price.effectiveDate;

    if (!dateMap.has(dateStr)) {
      dateMap.set(dateStr, {
        ESSENCE: lastEssence,
        GASOIL: lastGasoil,
        PETROLE: lastPetrole,
      });
    }

    const entry = dateMap.get(dateStr)!;
    (entry as Record<string, number | undefined>)[price.fuelType] = price.price;

    if (price.fuelType === 'ESSENCE') lastEssence = price.price;
    if (price.fuelType === 'GASOIL') lastGasoil = price.price;
    if (price.fuelType === 'PETROLE') lastPetrole = price.price;
  }

  return Array.from(dateMap.entries()).map(([date, prices]) => ({
    date,
    ...prices,
  }));
}

function calculateStats(priceHistory: PriceHistoryItem[]) {
  const essencePrices = priceHistory
    .filter((p) => p.fuelType === 'ESSENCE')
    .sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime());

  const gasoilPrices = priceHistory
    .filter((p) => p.fuelType === 'GASOIL')
    .sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime());

  const petrolePrices = priceHistory
    .filter((p) => p.fuelType === 'PETROLE')
    .sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime());

  const essenceCurrent = essencePrices[0]?.price;
  const essencePrev = essencePrices[1]?.price;
  const essenceChange = essenceCurrent && essencePrev ? essenceCurrent - essencePrev : 0;
  const essenceChangePercent = essencePrev ? (essenceChange / essencePrev) * 100 : 0;

  const gasoilCurrent = gasoilPrices[0]?.price;
  const gasoilPrev = gasoilPrices[1]?.price;
  const gasoilChange = gasoilCurrent && gasoilPrev ? gasoilCurrent - gasoilPrev : 0;
  const gasoilChangePercent = gasoilPrev ? (gasoilChange / gasoilPrev) * 100 : 0;

  const petroleCurrent = petrolePrices[0]?.price;
  const petrolePrev = petrolePrices[1]?.price;
  const petroleChange = petroleCurrent && petrolePrev ? petroleCurrent - petrolePrev : 0;
  const petroleChangePercent = petrolePrev ? (petroleChange / petrolePrev) * 100 : 0;

  return {
    essence: {
      current: essenceCurrent,
      previous: essencePrev,
      change: essenceChange,
      changePercent: essenceChangePercent,
    },
    gasoil: {
      current: gasoilCurrent,
      previous: gasoilPrev,
      change: gasoilChange,
      changePercent: gasoilChangePercent,
    },
    petrole: {
      current: petroleCurrent,
      previous: petrolePrev,
      change: petroleChange,
      changePercent: petroleChangePercent,
    },
  };
}
