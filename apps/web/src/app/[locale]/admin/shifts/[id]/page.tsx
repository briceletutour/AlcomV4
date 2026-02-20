'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import { useTranslations, useFormatter } from 'next-intl';
import { StatusBadge } from '@/components/shared/status-badge';
import { KPICard } from '@/components/shared/kpi-card';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  Fuel,
  Gauge,
  Lock,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

export default function ShiftDetailsPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const t = useTranslations('Shifts');
  const format = useFormatter();
  const router = useRouter();

  const statusMap: Record<string, { status: 'success' | 'warning' | 'neutral' | 'info'; label: string }> = {
    OPEN: { status: 'success', label: t('statusOpen') },
    CLOSED: { status: 'neutral', label: t('statusClosed') },
    LOCKED: { status: 'info', label: t('statusLocked') },
  };

  const { data: shiftData, isLoading } = useQuery({
    queryKey: ['shift', id],
    queryFn: () => api.get<any>(`/shifts/${id}`),
  });

  const shift = shiftData?.data || shiftData;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!shift) {
    return <div className="p-6 text-center text-gray-500">{t('shiftNotFound')}</div>;
  }

  const sm = statusMap[shift.status] || { status: 'neutral' as const, label: shift.status };
  const isClosed = shift.status === 'CLOSED' || shift.status === 'LOCKED';
  const cashVar = Number(shift.cashVariance || 0);
  const stockVar = Number(shift.stockVariance || 0);
  const priceSnapshot = shift.appliedPriceSnapshot || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <button
            onClick={() => router.push('/admin/shifts')}
            className="mb-2 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" /> {t('backToShifts')}
          </button>
          <h1 className="text-2xl font-bold md:text-3xl">
            {t('shiftOf')} {format.dateTime(new Date(shift.shiftDate), { dateStyle: 'short' })}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span className="text-gray-500">
              {shift.shiftType === 'MORNING' ? `🌅 ${t('morning')}` : `🌙 ${t('evening')}`}
            </span>
            <StatusBadge status={sm.status} label={sm.label} />
            {shift.station && (
              <span className="text-sm text-gray-500">{shift.station.name}</span>
            )}
          </div>
        </div>

        {shift.status === 'OPEN' && (
          <button
            onClick={() => router.push(`/admin/shifts/${shift.id}/close`)}
            className="flex items-center gap-2 rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
          >
            <Lock className="h-4 w-4" />
            {t('closeThisShift')}
          </button>
        )}
      </div>

      {/* KPI Cards (only when closed) */}
      {isClosed && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KPICard
            title={t('totalRevenue')}
            value={`${format.number(Number(shift.totalRevenue))} FCFA`}
            icon={TrendingUp}
          />
          <KPICard
            title={t('theoreticalCash')}
            value={`${format.number(Number(shift.theoreticalCash || 0))} FCFA`}
            icon={Banknote}
          />
          <KPICard
            title={t('cashVariance')}
            value={`${cashVar > 0 ? '+' : ''}${format.number(cashVar)} FCFA`}
            icon={cashVar < 0 ? TrendingDown : TrendingUp}
            className={cn(
              cashVar === 0 ? 'border-green-200' : cashVar > 0 ? 'border-blue-200' : 'border-red-200',
            )}
          />
          <KPICard
            title={t('variance')} 
            value={`${format.number(stockVar)} L`}
            icon={Fuel}
            className={cn(stockVar === 0 ? 'border-green-200' : 'border-amber-200')}
          />
        </div>
      )}

      {/* Locked prices */}
      {Object.keys(priceSnapshot).length > 0 && (
        <div className="rounded bg-blue-50 p-4">
          <p className="mb-2 text-sm font-medium text-blue-800">
            {t('lockedPrices')}
          </p>
          <div className="flex flex-wrap gap-4">
            {Object.entries(priceSnapshot).map(([fuel, price]) => (
              <span key={fuel} className="rounded bg-white px-3 py-1 text-sm">
                <strong>{fuel}:</strong> {format.number(Number(price))} FCFA/L
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Sales */}
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="mb-4 flex items-center gap-2">
            <Gauge className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-bold">{t('fuelSales')}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 text-left">{t('pumpNozzle')}</th>
                  <th className="py-2 text-right">{t('startIndex')}</th>
                  <th className="py-2 text-right">{t('endIndex')}</th>
                  <th className="py-2 text-right">{t('volume')}</th>
                  <th className="py-2 text-right">{t('amount')}</th>
                </tr>
              </thead>
              <tbody>
                {(shift.sales || []).map((sale: any) => (
                  <tr key={sale.id} className="border-b">
                    <td className="py-2">
                      P{sale.nozzle?.pump?.code || '?'} — {sale.nozzle?.side || '?'}
                    </td>
                    <td className="py-2 text-right">
                      {Number(sale.openingIndex).toFixed(2)}
                    </td>
                    <td className="py-2 text-right">
                      {sale.closingIndex != null
                        ? Number(sale.closingIndex).toFixed(2)
                        : '-'}
                    </td>
                    <td className="py-2 text-right">
                      {sale.volumeSold != null
                        ? Number(sale.volumeSold).toFixed(2)
                        : '-'}
                    </td>
                    <td className="py-2 text-right font-medium">
                      {sale.revenue != null
                        ? `${format.number(Number(sale.revenue))} FCFA`
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              {isClosed && (
                <tfoot>
                  <tr className="font-bold">
                    <td colSpan={4} className="py-3">
                      {t('total')}
                    </td>
                    <td className="py-3 text-right">
                      {format.number(Number(shift.totalRevenue))} FCFA
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Tank Dips + Cash */}
        <div className="space-y-6">
          {/* Tank Dips */}
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="mb-4 flex items-center gap-2">
              <Fuel className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-bold">{t('tankDipping')}</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 text-left">{t('tank')}</th>
                  <th className="py-2 text-right">{t('openingLevel')}</th>
                  <th className="py-2 text-right">{t('closingLevel')}</th>
                  {isClosed && (
                    <>
                      <th className="py-2 text-right">{t('theoretical')}</th>
                      <th className="py-2 text-right">{t('variance')}</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {(shift.tankDips || []).map((dip: any) => {
                  const sv = Number(dip.stockVariance || 0);
                  return (
                    <tr key={dip.id} className="border-b">
                      <td className="py-2">{dip.tank?.fuelType || '-'}</td>
                      <td className="py-2 text-right">
                        {Number(dip.openingLevel).toFixed(0)}
                      </td>
                      <td className="py-2 text-right">
                        {dip.closingLevel != null
                          ? Number(dip.closingLevel).toFixed(0)
                          : '-'}
                      </td>
                      {isClosed && (
                        <>
                          <td className="py-2 text-right">
                            {dip.theoreticalStock != null
                              ? Number(dip.theoreticalStock).toFixed(0)
                              : '-'}
                          </td>
                          <td
                            className={cn(
                              'py-2 text-right font-medium',
                              sv === 0
                                ? 'text-green-600'
                                : sv > 0
                                  ? 'text-blue-600'
                                  : 'text-red-600',
                            )}
                          >
                            {sv > 0 ? '+' : ''}
                            {sv.toFixed(0)} L
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Cash Reconciliation */}
          {isClosed && (
            <div className="rounded-lg bg-white p-6 shadow">
              <div className="mb-4 flex items-center gap-2">
                <Banknote className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-bold">{t('cashReconciliation')}</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500">{t('actualCash')}</p>
                  <p className="text-lg font-bold">
                    {format.number(Number(shift.cashCounted || 0))} FCFA
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('cardMobile')}</p>
                  <p className="text-lg font-bold">
                    {format.number(Number(shift.cardAmount || 0))} FCFA
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('expenses')}</p>
                  <p className="text-lg font-bold">
                    {format.number(Number(shift.expensesAmount || 0))} FCFA
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('cashVariance')}</p>
                  <p
                    className={cn(
                      'text-lg font-bold',
                      cashVar === 0
                        ? 'text-green-600'
                        : cashVar > 0
                          ? 'text-blue-600'
                          : 'text-red-600',
                    )}
                  >
                    {cashVar > 0 ? '+' : ''}
                    {format.number(cashVar)} FCFA
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Justification */}
          {isClosed && shift.justification && (
            <div className="rounded-lg border-2 border-amber-200 bg-amber-50 p-4">
              <p className="mb-1 text-sm font-medium text-amber-800">{t('justification')}</p>
              <p className="text-sm text-amber-900">{shift.justification}</p>
            </div>
          )}
        </div>
      </div>

      {/* Meta info */}
      <div className="rounded bg-gray-50 p-4 text-xs text-gray-500">
        <div className="flex flex-wrap gap-6">
          <span>
            {t('openedBy')}: <strong>{shift.openedBy?.fullName || '-'}</strong>
          </span>
          {shift.closedBy && (
            <span>
              {t('closedBy')}: <strong>{shift.closedBy.fullName}</strong>
            </span>
          )}
          <span>
            {t('createdAt')}:{' '}
            {format.dateTime(new Date(shift.createdAt), { dateStyle: 'short', timeStyle: 'short' })}
          </span>
        </div>
      </div>
    </div>
  );
}
