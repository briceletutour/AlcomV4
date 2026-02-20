'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, Truck, Building2, Fuel, Plus, Trash2, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

interface Station {
  id: string;
  code: string;
  name: string;
}

interface Tank {
  id: string;
  fuelType: string;
  capacity: number;
  currentLevel: number;
}

interface Compartment {
  tankId: string;
  fuelType: 'ESSENCE' | 'GASOIL' | 'PETROLE';
  blVolume: number;
}

interface ReplenishmentRequest {
  id: string;
  urgency: string;
  fuelType: string;
  requestedVolume: number;
  status: string;
  station: {
    id: string;
    code: string;
    name: string;
  };
  createdAt: string;
}

export default function NewDeliveryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useTranslations('Supply');
  
  const STEPS = [
    t('deliveries.steps.truckInfo'),
    t('deliveries.steps.station'),
    t('deliveries.steps.compartments'),
    t('deliveries.steps.summary')
  ];
  
  const [step, setStep] = useState(0);
  
  // Form data
  const [blNumber, setBlNumber] = useState('');
  const [blTotalVolume, setBlTotalVolume] = useState('');
  const [truckPlate, setTruckPlate] = useState('');
  const [driverName, setDriverName] = useState('');
  const [stationId, setStationId] = useState(searchParams.get('stationId') || '');
  const [replenishmentRequestId, setReplenishmentRequestId] = useState(searchParams.get('requestId') || '');
  const [compartments, setCompartments] = useState<Compartment[]>([]);

  // Sync stationId with replenishment request when it's set (especially from URL)
  useEffect(() => {
    if (replenishmentRequestId && orderedRequests.length > 0) {
      const selectedRequest = orderedRequests.find((r: ReplenishmentRequest) => r.id === replenishmentRequestId);
      if (selectedRequest && selectedRequest.station.id !== stationId) {
        setStationId(selectedRequest.station.id);
      }
    }
  }, [replenishmentRequestId, orderedRequests, stationId]);

  // Fetch replenishment requests (ORDERED status - ready for delivery)
  const { data: requestsData } = useQuery({
    queryKey: ['replenishment-requests-ordered'],
    queryFn: () => api.get<ReplenishmentRequest[]>('/deliveries/requests?status=ORDERED&limit=100'),
  });
  const orderedRequests = Array.isArray(requestsData) ? requestsData : (requestsData as any)?.data || [];

  // Fetch stations
  const { data: stationsData } = useQuery({
    queryKey: ['stations'],
    queryFn: () => api.get<Station[]>('/stations?limit=100&isActive=true'),
  });
  const stations = Array.isArray(stationsData) ? stationsData : (stationsData as any)?.data || [];

  // Fetch tanks for selected station
  const { data: tanksData } = useQuery({
    queryKey: ['tanks', stationId],
    queryFn: () => api.get<Tank[]>(`/tanks?stationId=${stationId}`),
    enabled: !!stationId,
  });
  const tanks = Array.isArray(tanksData) ? tanksData : (tanksData as any)?.data || [];

  // Create delivery mutation
  const createDeliveryMutation = useMutation({
    mutationFn: (data: {
      stationId: string;
      blNumber: string;
      blTotalVolume?: number;
      truckPlate: string;
      driverName: string;
      replenishmentRequestId?: string;
    }) => api.post('/deliveries', data),
    onError: (err: ApiError) => toast.error(err.message),
  });

  // Add compartment mutation
  const addCompartmentMutation = useMutation({
    mutationFn: ({ deliveryId, comp }: { deliveryId: string; comp: Compartment }) =>
      api.post(`/deliveries/${deliveryId}/compartments`, comp),
    onError: (err: ApiError) => toast.error(err.message),
  });

  const handleNext = () => {
    
    // Validate current step
    if (step === 0) {
      if (!blNumber || !truckPlate || !driverName) {
        toast.error(t('deliveries.errors.fillRequiredFields'));
        return;
      }
    } else if (step === 1) {
      if (!stationId) {
        toast.error(t('deliveries.errors.selectStation'));
        return;
      }
    } else if (step === 2) {
      if (compartments.length === 0) {
        toast.error(t('deliveries.errors.addCompartment'));
        return;
      }
      // Validate BL total if set
      if (blTotalVolume) {
        const total = compartments.reduce((sum, c) => sum + c.blVolume, 0);
        const blTotal = parseFloat(blTotalVolume);
        if (Math.abs(total - blTotal) > 0.01) {
          toast.error(t('deliveries.errors.volumeMismatch', { total: total.toLocaleString(), blTotal: blTotal.toLocaleString() }));
          return;
        }
      }
    }
    
    setStep(s => Math.min(STEPS.length - 1, s + 1));
  };

  const handleBack = () => {
    setStep(s => Math.max(0, s - 1));
  };

  const addCompartment = () => {
    if (tanks.length === 0) return;
    const defaultTank = tanks[0];
    setCompartments([...compartments, {
      tankId: defaultTank.id,
      fuelType: defaultTank.fuelType,
      blVolume: 0,
    }]);
  };

  const removeCompartment = (index: number) => {
    setCompartments(compartments.filter((_, i) => i !== index));
  };

  const updateCompartment = (index: number, field: keyof Compartment, value: unknown) => {
    const updated = [...compartments];
    const current = updated[index];
    if (!current) return;
    
    if (field === 'tankId') {
      const tank = tanks.find((t: Tank) => t.id === value);
      if (tank) {
        updated[index] = { 
          tankId: value as string, 
          fuelType: tank.fuelType as 'ESSENCE' | 'GASOIL' | 'PETROLE',
          blVolume: current.blVolume 
        };
      }
    } else if (field === 'blVolume') {
      updated[index] = { 
        tankId: current.tankId, 
        fuelType: current.fuelType,
        blVolume: parseFloat(value as string) || 0 
      };
    } else if (field === 'fuelType') {
      updated[index] = { 
        tankId: current.tankId, 
        fuelType: value as 'ESSENCE' | 'GASOIL' | 'PETROLE',
        blVolume: current.blVolume 
      };
    }
    setCompartments(updated);
  };

  const handleSubmit = async () => {
    
    try {
      // Create delivery
      const delivery = await createDeliveryMutation.mutateAsync({
        stationId,
        blNumber,
        blTotalVolume: blTotalVolume ? parseFloat(blTotalVolume) : undefined,
        truckPlate,
        driverName,
        replenishmentRequestId: replenishmentRequestId || undefined,
      }) as { id: string };

      // Add compartments
      for (const comp of compartments) {
        await addCompartmentMutation.mutateAsync({
          deliveryId: delivery.id,
          comp,
        });
      }

      router.push(`/${locale}/admin/supply/deliveries/${delivery.id}`);
    } catch {
      // Error already handled by mutations
    }
  };

  const totalVolume = compartments.reduce((sum, c) => sum + c.blVolume, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/${locale}/admin/supply/deliveries`}
          className="rounded-md p-2 hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{t('deliveries.newDeliveryTitle')}</h1>
          <p className="text-muted-foreground">{t('deliveries.newDeliverySubtitle')}</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between max-w-2xl">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
              i < step ? 'bg-green-500 text-white' :
              i === step ? 'bg-primary text-primary-foreground' :
              'bg-muted text-muted-foreground'
            }`}>
              {i < step ? <CheckCircle className="h-5 w-5" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-12 h-0.5 mx-2 ${i < step ? 'bg-green-500' : 'bg-muted'}`} />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between max-w-2xl px-4 text-sm text-muted-foreground">
        {STEPS.map((label) => (
          <span key={label} className="w-24 text-center">{label}</span>
        ))}
      </div>

      {/* Step Content */}
      <div className="max-w-2xl">
        {/* Step 1: Truck Info */}
        {step === 0 && (
          <div className="space-y-6 rounded-lg border bg-card p-6">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <Truck className="h-5 w-5" />
              {t('deliveries.form.truckAndBlInfo')}
            </div>
            
            <div className="space-y-4">
              {/* Replenishment Request Dropdown */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t('deliveries.form.replenishmentRequestLabel')}
                </label>
                <select
                  value={replenishmentRequestId}
                  onChange={(e) => {
                    const requestId = e.target.value;
                    setReplenishmentRequestId(requestId);
                    // Auto-fill station when selecting a request
                    if (requestId) {
                      const selectedRequest = orderedRequests.find((r: ReplenishmentRequest) => r.id === requestId);
                      if (selectedRequest) {
                        setStationId(selectedRequest.station.id);
                      }
                    }
                  }}
                  className="w-full rounded-md border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  aria-label={t('deliveries.form.replenishmentRequestLabel')}
                >
                  <option value="">{t('deliveries.form.noLinkedRequest')}</option>
                  {orderedRequests.map((r: ReplenishmentRequest) => (
                    <option key={r.id} value={r.id}>
                      {r.station.code} - {r.fuelType} - {r.requestedVolume.toLocaleString()}L ({r.urgency})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {t('deliveries.form.replenishmentRequestHelp')}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t('deliveries.form.blNumberLabel')} <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={blNumber}
                  onChange={(e) => setBlNumber(e.target.value)}
                  placeholder={t('deliveries.form.blNumberPlaceholder')}
                  className="w-full rounded-md border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t('deliveries.form.blTotalVolumeLabel')}
                </label>
                <input
                  type="number"
                  value={blTotalVolume}
                  onChange={(e) => setBlTotalVolume(e.target.value)}
                  placeholder={t('deliveries.form.blTotalVolumePlaceholder')}
                  className="w-full rounded-md border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t('deliveries.form.truckPlateLabel')} <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={truckPlate}
                  onChange={(e) => setTruckPlate(e.target.value)}
                  placeholder={t('deliveries.form.truckPlatePlaceholder')}
                  className="w-full rounded-md border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t('deliveries.form.driverNameLabel')} <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder={t('deliveries.form.driverNamePlaceholder')}
                  className="w-full rounded-md border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Station Selection */}
        {step === 1 && (
          <div className="space-y-6 rounded-lg border bg-card p-6">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <Building2 className="h-5 w-5" />
              {t('deliveries.form.stationDestination')}
            </div>
            
            {/* When replenishment request is selected, show locked station info */}
            {replenishmentRequestId ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t('deliveries.form.selectStationLabel')}
                </label>
                <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2.5">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {(() => {
                      const req = orderedRequests.find((r: ReplenishmentRequest) => r.id === replenishmentRequestId);
                      return req ? `${req.station.code} - ${req.station.name}` : '';
                    })()}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {t('deliveries.form.stationFromRequest')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('deliveries.form.stationLockedHelp')}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t('deliveries.form.selectStationLabel')} <span className="text-destructive">*</span>
                </label>
                <select
                  value={stationId}
                  onChange={(e) => {
                    setStationId(e.target.value);
                    setCompartments([]); // Reset compartments when station changes
                  }}
                  className="w-full rounded-md border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  aria-label={t('deliveries.form.selectStationLabel')}
                >
                  <option value="">{t('deliveries.form.chooseStation')}</option>
                  {stations.map((s: Station) => (
                    <option key={s.id} value={s.id}>
                      {s.code} - {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {stationId && tanks.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium">{t('deliveries.form.availableTanks')}</div>
                <div className="grid gap-2">
                  {tanks.map((tank: Tank) => {
                    const percentFull = (tank.currentLevel / tank.capacity) * 100;
                    const ullage = tank.capacity - tank.currentLevel;
                    return (
                      <div key={tank.id} className="rounded-md border p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            tank.fuelType === 'ESSENCE' ? 'bg-yellow-100 text-yellow-800' : tank.fuelType === 'PETROLE' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'
                          }`}>
                            {tank.fuelType === 'ESSENCE' ? t('deliveries.form.super') : tank.fuelType === 'PETROLE' ? t('deliveries.form.petrole') : t('deliveries.form.gasoil')}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {t('deliveries.form.ullage')}: <span className="font-mono font-medium">{ullage.toLocaleString()} L</span>
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${
                              percentFull < 20 ? 'bg-red-500' : percentFull < 50 ? 'bg-yellow-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${percentFull}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                          <span>{tank.currentLevel.toLocaleString()} L</span>
                          <span>{tank.capacity.toLocaleString()} L</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Compartments */}
        {step === 2 && (
          <div className="space-y-6 rounded-lg border bg-card p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <Fuel className="h-5 w-5" />
                {t('deliveries.compartments')}
              </div>
              <button
                onClick={addCompartment}
                className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                <Plus className="h-4 w-4" />
                {t('deliveries.form.addCompartmentBtn')}
              </button>
            </div>

            {compartments.length === 0 ? (
              <div className="flex h-32 items-center justify-center rounded-md border-2 border-dashed text-muted-foreground">
                {t('deliveries.form.addFirstCompartment')}
              </div>
            ) : (
              <div className="space-y-4">
                {compartments.map((comp, index) => {
                  const tank = tanks.find((t: Tank) => t.id === comp.tankId);
                  return (
                    <div key={index} className="rounded-md border p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-medium">{t('deliveries.compartment')} {index + 1}</span>
                        <button
                          onClick={() => removeCompartment(index)}
                          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                          title={t('deliveries.form.removeCompartmentTitle')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">{t('deliveries.tank')}</label>
                          <select
                            value={comp.tankId}
                            onChange={(e) => updateCompartment(index, 'tankId', e.target.value)}
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            aria-label={t('deliveries.selectTank')}
                          >
                            {tanks.map((tnk: Tank) => (
                              <option key={tnk.id} value={tnk.id}>
                                {tnk.fuelType === 'ESSENCE' ? t('deliveries.form.super') : tnk.fuelType === 'PETROLE' ? t('deliveries.form.petrole') : t('deliveries.form.gasoil')} -{t('deliveries.form.ullage')}: {(tnk.capacity - tnk.currentLevel).toLocaleString()} L
                              </option>
                            ))}
                          </select>
                        </div>
                        
                        <div className="space-y-2">
                          <label className="text-sm font-medium">{t('deliveries.form.volumeBlLabel')}</label>
                          <input
                            type="number"
                            min="0"
                            value={comp.blVolume || ''}
                            onChange={(e) => updateCompartment(index, 'blVolume', e.target.value)}
                            placeholder={t('deliveries.form.volumePlaceholder')}
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                          {tank && comp.blVolume > (tank.capacity - tank.currentLevel) && (
                            <p className="text-xs text-yellow-600">
                              ⚠️ {t('Errors.tankOverflow')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="flex items-center justify-between p-4 bg-muted rounded-md">
                  <span className="font-medium">{t('deliveries.form.total')} {t('deliveries.compartments').toLowerCase()}</span>
                  <span className="font-mono text-lg font-bold">
                    {totalVolume.toLocaleString()} L
                  </span>
                </div>

                {blTotalVolume && (
                  <div className={`p-3 rounded-md text-sm ${
                    Math.abs(totalVolume - parseFloat(blTotalVolume)) < 0.01
                      ? 'bg-green-50 text-green-700'
                      : 'bg-yellow-50 text-yellow-700'
                  }`}>
                    {Math.abs(totalVolume - parseFloat(blTotalVolume)) < 0.01
                      ? `✓ ${locale === 'fr' ? 'Les volumes correspondent au total BL' : 'Volumes match BL total'}`
                      : `⚠️ ${locale === 'fr' ? 'Différence avec le total BL' : 'Difference with BL total'}: ${Math.abs(totalVolume - parseFloat(blTotalVolume)).toFixed(2)} L`
                    }
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Summary */}
        {step === 3 && (
          <div className="space-y-6 rounded-lg border bg-card p-6">
            <div className="text-lg font-semibold">{t('deliveries.form.summaryTitle')}</div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">{t('deliveries.blNumber')}</div>
                <div className="font-mono font-medium">{blNumber}</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">{t('deliveries.truck')}</div>
                <div className="font-medium">{truckPlate}</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">{t('deliveries.driverName')}</div>
                <div className="font-medium">{driverName}</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">{t('common.station')}</div>
                <div className="font-medium">
                  {stations.find((s: Station) => s.id === stationId)?.name || '-'}
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="text-sm font-medium mb-3">{t('deliveries.compartments')} ({compartments.length})</div>
              <div className="space-y-2">
                {compartments.map((comp, index) => {
                  return (
                    <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-md">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          comp.fuelType === 'ESSENCE' ? 'bg-yellow-100 text-yellow-800' : comp.fuelType === 'PETROLE' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'
                        }`}>
                          {comp.fuelType === 'ESSENCE' ? t('deliveries.form.super') : comp.fuelType === 'PETROLE' ? t('deliveries.form.petrole') : t('deliveries.form.gasoil')}
                        </span>
                        <span className="text-sm">{t('deliveries.compartment')} {index + 1}</span>
                      </div>
                      <span className="font-mono font-medium">{comp.blVolume.toLocaleString()} L</span>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between p-3 bg-primary/10 rounded-md">
                  <span className="font-semibold">{t('deliveries.form.total')}</span>
                  <span className="font-mono text-lg font-bold">{totalVolume.toLocaleString()} L</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between pt-6">
          <button
            onClick={handleBack}
            disabled={step === 0}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('deliveries.form.previous')}
          </button>

          {step < STEPS.length - 1 ? (
            <button
              onClick={handleNext}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {t('deliveries.form.next')}
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={createDeliveryMutation.isPending || addCompartmentMutation.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle className="h-4 w-4" />
              {createDeliveryMutation.isPending ? t('deliveries.form.creating') : t('deliveries.form.createDelivery')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}