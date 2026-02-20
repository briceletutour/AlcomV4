'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, AlertTriangle, Fuel, Info } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

interface Station {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

interface UllageInfo {
  tankId: string;
  fuelType: string;
  tankCapacity: number;
  currentLevel: number;
  ullage: number;
  percentFull: number;
}

export default function NewReplenishmentPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('Supply');

  const [stationId, setStationId] = useState('');
  const [fuelType, setFuelType] = useState<'ESSENCE' | 'GASOIL' | 'PETROLE'>('ESSENCE');
  const [requestedVolume, setRequestedVolume] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Fetch stations
  const { data: stationsData } = useQuery({
    queryKey: ['stations'],
    queryFn: () => api.get<{ data: Station[] }>('/stations?limit=100&isActive=true'),
  });
  const stations = (stationsData as any)?.data || [];

  // Fetch ullage when station and fuel type are selected
  const { data: ullageData } = useQuery({
    queryKey: ['ullage', stationId, fuelType],
    queryFn: () => api.get<UllageInfo>(`/deliveries/ullage?stationId=${stationId}&fuelType=${fuelType}`),
    enabled: !!stationId && !!fuelType,
  });
  const ullage = ullageData as UllageInfo | undefined;

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: { stationId: string; fuelType: string; requestedVolume: number }) =>
      api.post('/deliveries/requests', data),
    onSuccess: (response: any) => {
      router.push(`/${locale}/admin/supply/replenishment/${response.id}`);
    },
    onError: (err: ApiError) => {
      setError(err.message || t('replenishment.errors.creationFailed'));
      toast.error(err.message);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!stationId || !fuelType || !requestedVolume) {
      toast.error(t('replenishment.errors.fillAllFields'));
      return;
    }

    const volume = parseFloat(requestedVolume);
    if (isNaN(volume) || volume <= 0) {
      toast.error(t('replenishment.errors.positiveVolume'));
      return;
    }

    createMutation.mutate({
      stationId,
      fuelType,
      requestedVolume: volume,
    });
  };

  const volume = parseFloat(requestedVolume) || 0;
  const isOverflow = ullage && volume > ullage.ullage;
  const percentOfUllage = ullage && ullage.ullage > 0 ? (volume / ullage.ullage) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/${locale}/admin/supply/replenishment`}
          className="rounded-md p-2 hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{t('replenishment.newRequestTitle')}</h1>
          <p className="text-muted-foreground">{t('replenishment.newRequestSubtitle')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Station Selection */}
        <div className="space-y-2">
          <label htmlFor="station" className="text-sm font-medium">
            {t('common.station')} <span className="text-destructive">*</span>
          </label>
          <select
            id="station"
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            required
          >
            <option value="">{t('replenishment.selectStation')}</option>
            {stations.map((s: Station) => (
              <option key={s.id} value={s.id}>
                {s.code} - {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Fuel Type */}
        <div className="space-y-2">
          <label className="text-sm font-medium">
            {t('common.fuelType')} <span className="text-destructive">*</span>
          </label>
          <div className="flex gap-4">
            <label className={`flex-1 flex items-center justify-center gap-2 rounded-lg border-2 p-4 cursor-pointer transition-colors ${fuelType === 'ESSENCE' ? 'border-yellow-500 bg-yellow-50' : 'border-muted hover:border-muted-foreground'
              }`}>
              <input
                type="radio"
                name="fuelType"
                value="ESSENCE"
                checked={fuelType === 'ESSENCE'}
                onChange={() => setFuelType('ESSENCE')}
                className="sr-only"
              />
              <Fuel className="h-5 w-5 text-yellow-600" />
              <span className="font-medium">{t('fuelTypes.ESSENCE')}</span>
            </label>
            <label className={`flex-1 flex items-center justify-center gap-2 rounded-lg border-2 p-4 cursor-pointer transition-colors ${fuelType === 'GASOIL' ? 'border-orange-500 bg-orange-50' : 'border-muted hover:border-muted-foreground'
              }`}>
              <input
                type="radio"
                name="fuelType"
                value="GASOIL"
                checked={fuelType === 'GASOIL'}
                onChange={() => setFuelType('GASOIL')}
                className="sr-only"
              />
              <Fuel className="h-5 w-5 text-orange-600" />
              <span className="font-medium">{t('fuelTypes.GASOIL')}</span>
            </label>
            <label className={`flex-1 flex items-center justify-center gap-2 rounded-lg border-2 p-4 cursor-pointer transition-colors ${fuelType === 'PETROLE' ? 'border-blue-500 bg-blue-50' : 'border-muted hover:border-muted-foreground'
              }`}>
              <input
                type="radio"
                name="fuelType"
                value="PETROLE"
                checked={fuelType === 'PETROLE'}
                onChange={() => setFuelType('PETROLE')}
                className="sr-only"
              />
              <Fuel className="h-5 w-5 text-blue-600" />
              <span className="font-medium">{t('fuelTypes.PETROLE')}</span>
            </label>
          </div>
        </div>

        {/* Ullage Info */}
        {stationId && ullage && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-500" />
              <span className="font-medium">{t('replenishment.tankStatus')}</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">{t('replenishment.capacity')}</div>
                <div className="font-mono font-medium">
                  {ullage.tankCapacity.toLocaleString()} L
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">{t('replenishment.currentLevel')}</div>
                <div className="font-mono font-medium">
                  {ullage.currentLevel.toLocaleString()} L ({ullage.percentFull.toFixed(1)}%)
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-muted-foreground">{t('replenishment.ullageAvailable')}</div>
                <div className={`font-mono text-xl font-bold ${ullage.percentFull < 20 ? 'text-red-600' : ullage.percentFull < 50 ? 'text-yellow-600' : 'text-green-600'
                  }`}>
                  {ullage.ullage.toLocaleString()} L
                </div>
              </div>
            </div>
            {/* Tank level visualization */}
            <div className="h-4 w-full bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${ullage.percentFull < 20 ? 'bg-red-500' : ullage.percentFull < 50 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                style={{ width: `${ullage.percentFull}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0%</span>
              <span>{t('replenishment.filled', { percent: ullage.percentFull.toFixed(1) })}</span>
              <span>100%</span>
            </div>
          </div>
        )}

        {/* Volume */}
        <div className="space-y-2">
          <label htmlFor="volume" className="text-sm font-medium">
            {t('replenishment.requestedVolumeLabel')} <span className="text-destructive">*</span>
          </label>
          <div className="relative">
            <input
              id="volume"
              type="number"
              min="0"
              step="1"
              value={requestedVolume}
              onChange={(e) => setRequestedVolume(e.target.value)}
              placeholder={t('replenishment.volumePlaceholder')}
              className={`w-full rounded-md border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${isOverflow ? 'border-yellow-500 focus:ring-yellow-500' : 'focus:ring-primary'
                }`}
              required
            />
            {ullage && requestedVolume && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {t('replenishment.percentOfUllage', { percent: percentOfUllage.toFixed(0) })}
              </div>
            )}
          </div>
          {ullage && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRequestedVolume(Math.round(ullage.ullage * 0.5).toString())}
                className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
              >
                50% ({Math.round(ullage.ullage * 0.5).toLocaleString()} L)
              </button>
              <button
                type="button"
                onClick={() => setRequestedVolume(Math.round(ullage.ullage * 0.75).toString())}
                className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
              >
                75% ({Math.round(ullage.ullage * 0.75).toLocaleString()} L)
              </button>
              <button
                type="button"
                onClick={() => setRequestedVolume(Math.round(ullage.ullage).toString())}
                className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
              >
                100% ({Math.round(ullage.ullage).toLocaleString()} L)
              </button>
            </div>
          )}
        </div>

        {/* Overflow Warning */}
        {isOverflow && (
          <div className="flex items-start gap-3 rounded-md bg-yellow-50 border border-yellow-200 p-4">
            <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-yellow-800">{t('replenishment.overflowRisk')}</div>
              <div className="text-sm text-yellow-700">
                {t('replenishment.overflowWarning', { requested: volume.toLocaleString(), available: ullage?.ullage.toLocaleString() })}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <Link
            href={`/${locale}/admin/supply/replenishment`}
            className="rounded-md border px-4 py-2.5 text-sm font-medium hover:bg-muted"
          >
            {t('common.cancel')}
          </Link>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createMutation.isPending ? t('replenishment.creating') : t('replenishment.createRequest')}
          </button>
        </div>
      </form>
    </div>
  );
}
