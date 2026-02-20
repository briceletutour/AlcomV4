'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api-client';
import { useLocale } from 'next-intl';
import Link from 'next/link';
import {
  ArrowLeft,
  Truck,
  Building2,
  Calendar,
  User,
  FileText,
  Play,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Fuel,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface Delivery {
  id: string;
  blNumber: string;
  blTotalVolume: number | null;
  truckPlate: string;
  driverName: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  station: {
    id: string;
    code: string;
    name: string;
  };
  replenishmentRequest?: {
    id: string;
    status: string;
    requestedVolume: number;
  };
  compartments: {
    id: string;
    compartmentNumber: number;
    fuelType: 'ESSENCE' | 'GASOIL' | 'PETROLE';
    blVolume: number;
    receivedVolume: number | null;
    openingDip: number | null;
    closingDip: number | null;
    tank: {
      id: string;
      fuelType: string;
      capacity: number;
      currentLevel: number;
    };
  }[];
}

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
};

const statusLabels: Record<string, string> = {
  PENDING: 'En attente',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminée',
  REJECTED: 'Rejetée',
};

export default function DeliveryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const locale = useLocale();
  const queryClient = useQueryClient();
  
  const deliveryId = params.id as string;
  
  const [success, setSuccess] = useState<string | null>(null);
  const [showDipForm, setShowDipForm] = useState(false);
  const [dipReadings, setDipReadings] = useState<Record<string, { openingDip: string; closingDip: string }>>({});
  const [expandedCompartment, setExpandedCompartment] = useState<string | null>(null);

  // Fetch delivery
  const { data: delivery, isLoading } = useQuery({
    queryKey: ['delivery', deliveryId],
    queryFn: () => api.get<Delivery>(`/deliveries/${deliveryId}`),
  });

  // Start delivery mutation
  const startMutation = useMutation({
    mutationFn: () => api.post(`/deliveries/${deliveryId}/start`, {}),
    onSuccess: () => {
      setSuccess('Livraison démarrée avec succès');
      setShowDipForm(true);
      queryClient.invalidateQueries({ queryKey: ['delivery', deliveryId] });
    },
    onError: (err: ApiError) => toast.error(err.message),
  });

  // Complete delivery mutation
  const completeMutation = useMutation({
    mutationFn: (closingDips: Record<string, number>) => 
      api.post(`/deliveries/${deliveryId}/complete`, { closingDips }),
    onSuccess: () => {
      setSuccess('Livraison terminée avec succès');
      setShowDipForm(false);
      queryClient.invalidateQueries({ queryKey: ['delivery', deliveryId] });
    },
    onError: (err: ApiError) => toast.error(err.message),
  });

  // Start delivery with opening dips
  const handleStartDelivery = async () => {
    
    if (!delivery) return;
    
    try {
      // Initialize dip readings for all compartments
      const initialDips: Record<string, { openingDip: string; closingDip: string }> = {};
      delivery.compartments.forEach(comp => {
        initialDips[comp.id] = {
          openingDip: comp.tank.currentLevel.toString(),
          closingDip: '',
        };
      });
      setDipReadings(initialDips);
      
      await startMutation.mutateAsync();
    } catch {
      // Error handled by mutation
    }
  };

  // Complete delivery with closing dips
  const handleCompleteDelivery = async () => {
    
    if (!delivery) return;
    
    // Validate all closing dips are entered
    for (const comp of delivery.compartments) {
      const dip = dipReadings[comp.id];
      if (!dip?.closingDip) {
        toast.error(`Veuillez entrer le jaugeage final pour le compartiment ${comp.compartmentNumber}`);
        return;
      }
    }
    
    const closingDips: Record<string, number> = {};
    delivery.compartments.forEach(comp => {
      closingDips[comp.id] = parseFloat(dipReadings[comp.id].closingDip);
    });
    
    await completeMutation.mutateAsync(closingDips);
  };

  // Calculate variance
  const calculateVariance = (blVolume: number, receivedVolume: number | null) => {
    if (receivedVolume === null) return null;
    return receivedVolume - blVolume;
  };

  const calculateVariancePercent = (blVolume: number, receivedVolume: number | null) => {
    if (receivedVolume === null || blVolume === 0) return null;
    return ((receivedVolume - blVolume) / blVolume) * 100;
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!delivery) {
    return (
      <div className="p-8 text-center">
        <div className="text-lg text-muted-foreground">Livraison non trouvée</div>
        <Link 
          href={`/${locale}/admin/supply/deliveries`}
          className="mt-4 inline-flex items-center text-primary hover:underline"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour à la liste
        </Link>
      </div>
    );
  }

  const totalBL = delivery.compartments.reduce((sum, c) => sum + c.blVolume, 0);
  const totalReceived = delivery.compartments.reduce((sum, c) => sum + (c.receivedVolume || 0), 0);
  const totalVariance = delivery.status === 'COMPLETED' ? totalReceived - totalBL : null;
  const totalVariancePercent = delivery.status === 'COMPLETED' && totalBL > 0 
    ? ((totalReceived - totalBL) / totalBL) * 100 
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={`/${locale}/admin/supply/deliveries`}
            className="rounded-md p-2 hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-mono">BL {delivery.blNumber}</h1>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[delivery.status]}`}>
                {statusLabels[delivery.status]}
              </span>
            </div>
            <p className="text-muted-foreground">
              {delivery.station.code} - {delivery.station.name}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {delivery.status === 'PENDING' && (
            <button
              onClick={handleStartDelivery}
              disabled={startMutation.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {startMutation.isPending ? 'Démarrage...' : 'Démarrer la livraison'}
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-100 border border-green-200 p-4 text-sm text-green-800">
          {success}
        </div>
      )}

      {/* Info Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Truck className="h-4 w-4" />
            Camion
          </div>
          <div className="mt-1 font-mono font-semibold">{delivery.truckPlate}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-4 w-4" />
            Chauffeur
          </div>
          <div className="mt-1 font-semibold">{delivery.driverName}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            Créée le
          </div>
          <div className="mt-1 font-semibold">
            {new Date(delivery.createdAt).toLocaleDateString('fr-FR')}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" />
            Volume BL
          </div>
          <div className="mt-1 font-mono font-semibold">{totalBL.toLocaleString()} L</div>
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Chronologie</h2>
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-6">
            <div className="relative flex items-start gap-4">
              <div className="absolute left-4 w-px h-full bg-border -translate-x-1/2" />
              <div className={`relative z-10 rounded-full p-2 ${delivery.createdAt ? 'bg-green-100' : 'bg-muted'}`}>
                <FileText className={`h-4 w-4 ${delivery.createdAt ? 'text-green-600' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <div className="font-medium">BL créé</div>
                <div className="text-sm text-muted-foreground">
                  {new Date(delivery.createdAt).toLocaleString('fr-FR')}
                </div>
              </div>
            </div>
            <div className="relative flex items-start gap-4">
              <div className={`relative z-10 rounded-full p-2 ${delivery.startedAt ? 'bg-blue-100' : 'bg-muted'}`}>
                <Play className={`h-4 w-4 ${delivery.startedAt ? 'text-blue-600' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <div className="font-medium">Dépotage démarré</div>
                <div className="text-sm text-muted-foreground">
                  {delivery.startedAt 
                    ? new Date(delivery.startedAt).toLocaleString('fr-FR')
                    : 'En attente'}
                </div>
              </div>
            </div>
            <div className="relative flex items-start gap-4">
              <div className={`relative z-10 rounded-full p-2 ${delivery.completedAt ? 'bg-green-100' : 'bg-muted'}`}>
                <CheckCircle className={`h-4 w-4 ${delivery.completedAt ? 'text-green-600' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <div className="font-medium">Livraison terminée</div>
                <div className="text-sm text-muted-foreground">
                  {delivery.completedAt 
                    ? new Date(delivery.completedAt).toLocaleString('fr-FR')
                    : 'En attente'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Compartments */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Compartiments ({delivery.compartments.length})</h2>
        
        <div className="space-y-4">
          {delivery.compartments.map((comp) => {
            const variance = calculateVariance(comp.blVolume, comp.receivedVolume);
            const variancePercent = calculateVariancePercent(comp.blVolume, comp.receivedVolume);
            const isExpanded = expandedCompartment === comp.id;
            
            return (
              <div key={comp.id} className="rounded-md border overflow-hidden">
                <button
                  onClick={() => setExpandedCompartment(isExpanded ? null : comp.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-muted/50"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted font-bold">
                      {comp.compartmentNumber}
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          comp.fuelType === 'ESSENCE' ? 'bg-yellow-100 text-yellow-800' : comp.fuelType === 'PETROLE' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'
                        }`}>
                          {comp.fuelType === 'ESSENCE' ? 'Super' : comp.fuelType === 'PETROLE' ? 'Pétrole' : 'Gasoil'}
                        </span>
                        <span className="font-mono font-medium">{comp.blVolume.toLocaleString()} L</span>
                      </div>
                      {delivery.status === 'COMPLETED' && variance !== null && (
                        <div className={`text-sm ${
                          Math.abs(variancePercent!) <= 0.5 
                            ? 'text-green-600' 
                            : 'text-yellow-600'
                        }`}>
                          Reçu: {comp.receivedVolume?.toLocaleString()} L 
                          ({variance >= 0 ? '+' : ''}{variance.toLocaleString()} L / {variancePercent?.toFixed(2)}%)
                        </div>
                      )}
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                </button>
                
                {isExpanded && (
                  <div className="border-t p-4 bg-muted/30 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <div className="text-sm text-muted-foreground">Volume BL</div>
                        <div className="font-mono font-semibold">{comp.blVolume.toLocaleString()} L</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Jaugeage initial</div>
                        <div className="font-mono font-semibold">
                          {comp.openingDip !== null ? `${comp.openingDip.toLocaleString()} L` : '-'}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Jaugeage final</div>
                        <div className="font-mono font-semibold">
                          {comp.closingDip !== null ? `${comp.closingDip.toLocaleString()} L` : '-'}
                        </div>
                      </div>
                    </div>
                    
                    {delivery.status === 'COMPLETED' && (
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div>
                          <div className="text-sm text-muted-foreground">Volume reçu</div>
                          <div className="font-mono font-semibold text-green-600">
                            {comp.receivedVolume?.toLocaleString()} L
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Écart</div>
                          <div className={`font-mono font-semibold ${
                            variance !== null && Math.abs(variance) <= comp.blVolume * 0.005 
                              ? 'text-green-600' 
                              : 'text-yellow-600'
                          }`}>
                            {variance !== null && (
                              <>{variance >= 0 ? '+' : ''}{variance.toLocaleString()} L</>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">% écart</div>
                          <div className={`font-mono font-semibold ${
                            variancePercent !== null && Math.abs(variancePercent) <= 0.5 
                              ? 'text-green-600' 
                              : 'text-yellow-600'
                          }`}>
                            {variancePercent !== null && (
                              <>{variancePercent >= 0 ? '+' : ''}{variancePercent.toFixed(2)}%</>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Dip Input Form for IN_PROGRESS status */}
                    {delivery.status === 'IN_PROGRESS' && showDipForm && (
                      <div className="border-t pt-4 mt-4">
                        <div className="text-sm font-medium mb-3">Entrer le jaugeage final</div>
                        <div className="flex items-end gap-4">
                          <div className="flex-1">
                            <label className="text-sm text-muted-foreground">Niveau après dépotage (L)</label>
                            <input
                              type="number"
                              min="0"
                              value={dipReadings[comp.id]?.closingDip || ''}
                              onChange={(e) => setDipReadings(prev => ({
                                ...prev,
                                [comp.id]: { ...prev[comp.id], closingDip: e.target.value }
                              }))}
                              placeholder="Ex: 15000"
                              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary mt-1"
                            />
                          </div>
                          {dipReadings[comp.id]?.closingDip && (
                            <div className="text-sm text-muted-foreground pb-2">
                              = {(parseFloat(dipReadings[comp.id].closingDip) - (comp.openingDip || comp.tank.currentLevel)).toLocaleString()} L reçu
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Complete Button */}
        {delivery.status === 'IN_PROGRESS' && showDipForm && (
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleCompleteDelivery}
              disabled={completeMutation.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-green-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle className="h-4 w-4" />
              {completeMutation.isPending ? 'Finalisation...' : 'Finaliser la livraison'}
            </button>
          </div>
        )}
      </div>

      {/* Summary Card (for completed deliveries) */}
      {delivery.status === 'COMPLETED' && (
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Résumé de la livraison</h2>
          
          <div className="grid gap-6 md:grid-cols-3">
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-sm text-muted-foreground">Volume BL total</div>
              <div className="text-2xl font-mono font-bold mt-1">{totalBL.toLocaleString()} L</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-sm text-muted-foreground">Volume reçu total</div>
              <div className="text-2xl font-mono font-bold text-green-700 mt-1">{totalReceived.toLocaleString()} L</div>
            </div>
            <div className={`text-center p-4 rounded-lg ${
              totalVariancePercent !== null && Math.abs(totalVariancePercent) <= 0.5
                ? 'bg-green-50'
                : 'bg-yellow-50'
            }`}>
              <div className="text-sm text-muted-foreground">Écart total</div>
              <div className={`text-2xl font-mono font-bold mt-1 ${
                totalVariancePercent !== null && Math.abs(totalVariancePercent) <= 0.5
                  ? 'text-green-700'
                  : 'text-yellow-700'
              }`}>
                {totalVariance !== null && (
                  <>
                    {totalVariance >= 0 ? '+' : ''}{totalVariance.toLocaleString()} L
                    <span className="text-sm font-normal ml-2">
                      ({totalVariancePercent?.toFixed(2)}%)
                    </span>
                  </>
                )}
              </div>
              {totalVariancePercent !== null && Math.abs(totalVariancePercent) > 0.5 && (
                <div className="flex items-center justify-center gap-1 mt-2 text-yellow-600">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-xs">Écart supérieur à la tolérance (0.5%)</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Linked Replenishment Request */}
      {delivery.replenishmentRequest && (
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Demande d&apos;approvisionnement liée</h2>
          <Link 
            href={`/${locale}/admin/supply/replenishment/${delivery.replenishmentRequest.id}`}
            className="flex items-center justify-between p-4 rounded-md bg-muted hover:bg-muted/80"
          >
            <div>
              <div className="font-medium">Demande #{delivery.replenishmentRequest.id.slice(0, 8)}</div>
              <div className="text-sm text-muted-foreground">
                {delivery.replenishmentRequest.requestedVolume.toLocaleString()} L demandés
              </div>
            </div>
            <ArrowLeft className="h-5 w-5 rotate-180" />
          </Link>
        </div>
      )}
    </div>
  );
}
