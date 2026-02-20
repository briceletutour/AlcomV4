'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { openShiftSchema, type OpenShiftInput } from '@alcom/shared/src/schemas/shift.schema';
import { api } from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, Fuel } from 'lucide-react';

export default function OpenShiftPage() {
  const t = useTranslations('Shifts');
  const router = useRouter();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();


  // Check if there's already an open shift for this station
  const stationId = user?.stationId;
  const { data: currentShift, isLoading: loadingCurrent } = useQuery({
    queryKey: ['shift-current', stationId],
    queryFn: () => api.get<any>(`/shifts/current?stationId=${stationId}`),
    enabled: !!stationId,
  });

  // Fetch stations for admins
  const { data: stationsData } = useQuery({
    queryKey: ['stations'],
    queryFn: () => api.get<any>('/stations?limit=100'),
    enabled: !stationId, // Only fetch if user is global role
  });
  const stations = stationsData?.data || stationsData || [];

  // Fetch active prices
  const { data: pricesData } = useQuery({
    queryKey: ['prices-active'],
    queryFn: () => api.get<any>('/prices/active'),
  });

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<OpenShiftInput>({
    resolver: zodResolver(openShiftSchema),
    defaultValues: {
      stationId: stationId || '',
      shiftDate: new Date().toISOString().split('T')[0],
      shiftType: 'MORNING',
    },
  });

  const mutation = useMutation({
    mutationFn: (data: OpenShiftInput) => api.post<any>('/shifts/open', data),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['shift-current'] });
      const shiftId = result?.id || result?.data?.id;
      router.push(shiftId ? `/admin/shifts/${shiftId}` : '/admin/shifts');
    },
    onError: (err: any) => {
      toast.error(t('openError'), { description: err.message });
    },
  });



  // If already an open shift
  if (!loadingCurrent && currentShift) {
    const shift = currentShift;
    return (
      <div className="mx-auto max-w-md rounded-lg bg-white p-6 shadow">
        <div className="mb-4 flex items-center gap-3 text-amber-600">
          <AlertTriangle className="h-6 w-6" />
          <h2 className="text-lg font-bold">{t('shiftAlreadyOpen')}</h2>
        </div>
        <p className="mb-4 text-gray-600">
          {t('shiftAlreadyOpenDesc')} ({shift.shiftType === 'MORNING' ? t('morning') : t('evening')} - {shift.shiftDate}).
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => router.push(`/admin/shifts/${shift.id}`)}
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            {t('viewShift')}
          </button>
          <button
            onClick={() => router.push(`/admin/shifts/${shift.id}/close`)}
            className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
          >
            {t('closeShift')}
          </button>
        </div>
      </div>
    );
  }

  const prices = Array.isArray(pricesData) ? pricesData : pricesData?.data || [];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t('openShift')}</h1>

      <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-6">
        {/* Station selector — only for global roles */}
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-medium">{t('shiftInfo')}</h2>

          {!stationId ? (
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium">{t('station')}</label>
              <select {...register('stationId')} className="w-full rounded border p-2">
                <option value="">{t('selectStation')}</option>
                {(Array.isArray(stations) ? stations : []).map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
              {errors.stationId && (
                <p className="text-sm text-red-500">{errors.stationId.message}</p>
              )}
            </div>
          ) : (
            <input type="hidden" {...register('stationId')} value={stationId} />
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">{t('shiftDate')}</label>
              <input type="date" {...register('shiftDate')} className="w-full rounded border p-2" />
              {errors.shiftDate && (
                <p className="text-sm text-red-500">{errors.shiftDate.message}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('shiftType')}</label>
              <select {...register('shiftType')} className="w-full rounded border p-2">
                <option value="MORNING">🌅 {t('morning')}</option>
                <option value="EVENING">🌙 {t('evening')}</option>
              </select>
              {errors.shiftType && (
                <p className="text-sm text-red-500">{errors.shiftType.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Active prices preview */}
        {prices.length > 0 && (
          <div className="rounded-lg bg-blue-50 p-6 shadow">
            <div className="mb-3 flex items-center gap-2">
              <Fuel className="h-5 w-5 text-blue-600" />
              <h3 className="font-medium text-blue-900">{t('activePrices')}</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {prices.map((p: any) => (
                <div key={p.id || p.fuelType} className="rounded bg-white p-3">
                  <p className="text-xs text-gray-500">{p.fuelType}</p>
                  <p className="text-lg font-bold">
                    {Number(p.price).toLocaleString('fr-FR')} FCFA/L
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}



        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded border px-4 py-2 hover:bg-gray-50"
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="flex items-center gap-2 rounded bg-green-600 px-6 py-2 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {mutation.isPending ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                {t('opening')}
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                {t('openShift')}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
