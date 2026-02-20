'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api-client';
import { useParams, useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import Link from 'next/link';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { 
  ArrowLeft, 
  Building2, 
  Fuel, 
  Calendar, 
  User, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Truck,
  Package,
  Clock,
  ArrowRight
} from 'lucide-react';
import { StatusBadge } from '@/components/shared/status-badge';
import { useState } from 'react';
import { toast } from 'sonner';

interface ReplenishmentRequest {
  id: string;
  stationId: string;
  fuelType: 'ESSENCE' | 'GASOIL' | 'PETROLE';
  requestedVolume: number;
  status: 'DRAFT' | 'PENDING_VALIDATION' | 'VALIDATED' | 'ORDERED' | 'COMPLETED';
  createdAt: string;
  updatedAt: string;
  station: { id: string; name: string; code: string };
  requestedBy: { fullName: string };
  tankCapacity?: number;
  currentLevel?: number;
  ullage?: number;
  overflowWarning?: boolean;
  deliveries?: Array<{
    id: string;
    blNumber: string;
    status: string;
    createdAt: string;
  }>;
}

const statusColors: Record<string, 'neutral' | 'warning' | 'info' | 'success' | 'error'> = {
  DRAFT: 'neutral',
  PENDING_VALIDATION: 'warning',
  VALIDATED: 'info',
  ORDERED: 'info',
  COMPLETED: 'success',
};

const statusLabels: Record<string, string> = {
  DRAFT: 'Brouillon',
  PENDING_VALIDATION: 'En attente de validation',
  VALIDATED: 'Validé',
  ORDERED: 'Commandé',
  COMPLETED: 'Terminé',
};

export default function ReplenishmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const locale = useLocale();
  const dateLocale = locale === 'fr' ? fr : enUS;
  const queryClient = useQueryClient();

  const id = params.id as string;

  const { data, isLoading, error: fetchError } = useQuery({
    queryKey: ['replenishment', id],
    queryFn: () => api.get<ReplenishmentRequest>(`/deliveries/requests/${id}`),
  });

  const request = data as ReplenishmentRequest | undefined;

  // Mutations for status transitions
  const submitMutation = useMutation({
    mutationFn: () => api.put(`/deliveries/requests/${id}/submit`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['replenishment', id] });
      },
    onError: (err: ApiError) => toast.error(err.message),
  });

  const validateMutation = useMutation({
    mutationFn: () => api.put(`/deliveries/requests/${id}/validate`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['replenishment', id] });
      },
    onError: (err: ApiError) => toast.error(err.message),
  });

  const orderMutation = useMutation({
    mutationFn: () => api.put(`/deliveries/requests/${id}/order`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['replenishment', id] });
      },
    onError: (err: ApiError) => toast.error(err.message),
  });

  const completeMutation = useMutation({
    mutationFn: () => api.put(`/deliveries/requests/${id}/complete`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['replenishment', id] });
      },
    onError: (err: ApiError) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/deliveries/requests/${id}`),
    onSuccess: () => {
      router.push(`/${locale}/admin/supply/replenishment`);
    },
    onError: (err: ApiError) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center text-muted-foreground">
        Chargement…
      </div>
    );
  }

  if (fetchError || !request) {
    return (
      <div className="flex h-96 items-center justify-center text-destructive">
        Demande non trouvée
      </div>
    );
  }

  const percentFull = request.tankCapacity && request.currentLevel
    ? (request.currentLevel / request.tankCapacity) * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={`/${locale}/admin/supply/replenishment`}
            className="rounded-md p-2 hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Demande #{id.slice(0, 8)}</h1>
            <p className="text-muted-foreground">{request.station.name}</p>
          </div>
        </div>
        <StatusBadge
          status={statusColors[request.status]}
          label={statusLabels[request.status]}
        />
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Status Workflow */}
      <div className="flex items-center justify-between rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            request.status === 'DRAFT' ? 'bg-gray-500 text-white' : 'bg-green-500 text-white'
          }`}>
            1
          </div>
          <span className={request.status === 'DRAFT' ? 'font-medium' : 'text-muted-foreground'}>Brouillon</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            request.status === 'PENDING_VALIDATION' ? 'bg-yellow-500 text-white' : 
            ['VALIDATED', 'ORDERED', 'COMPLETED'].includes(request.status) ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'
          }`}>
            2
          </div>
          <span className={request.status === 'PENDING_VALIDATION' ? 'font-medium' : 'text-muted-foreground'}>Validation</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            request.status === 'VALIDATED' ? 'bg-blue-500 text-white' : 
            ['ORDERED', 'COMPLETED'].includes(request.status) ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'
          }`}>
            3
          </div>
          <span className={request.status === 'VALIDATED' ? 'font-medium' : 'text-muted-foreground'}>Validé</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            request.status === 'ORDERED' ? 'bg-blue-500 text-white' : 
            request.status === 'COMPLETED' ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'
          }`}>
            4
          </div>
          <span className={request.status === 'ORDERED' ? 'font-medium' : 'text-muted-foreground'}>Commandé</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            request.status === 'COMPLETED' ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'
          }`}>
            <CheckCircle className="h-5 w-5" />
          </div>
          <span className={request.status === 'COMPLETED' ? 'font-medium text-green-600' : 'text-muted-foreground'}>Terminé</span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Request Details */}
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="font-semibold">Détails de la demande</h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Building2 className="h-4 w-4" />
                Station
              </div>
              <div className="font-medium">{request.station.name}</div>
              <div className="text-sm text-muted-foreground">{request.station.code}</div>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Fuel className="h-4 w-4" />
                Carburant
              </div>
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                request.fuelType === 'ESSENCE' ? 'bg-yellow-100 text-yellow-800' : request.fuelType === 'PETROLE' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'
              }`}>
                {request.fuelType === 'ESSENCE' ? 'Super' : request.fuelType === 'PETROLE' ? 'Pétrole' : 'Gasoil'}
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Package className="h-4 w-4" />
                Volume demandé
              </div>
              <div className="font-mono text-xl font-bold">
                {Number(request.requestedVolume).toLocaleString()} L
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                Demandé par
              </div>
              <div className="font-medium">{request.requestedBy?.fullName || '-'}</div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Date de création
              </div>
              <div className="font-medium">
                {format(new Date(request.createdAt), 'dd MMMM yyyy HH:mm', { locale: dateLocale })}
              </div>
            </div>
          </div>

          {request.overflowWarning && (
            <div className="flex items-start gap-3 rounded-md bg-yellow-50 border border-yellow-200 p-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
              <div className="text-sm text-yellow-700">
                Attention: Le volume demandé dépasse le creux disponible
              </div>
            </div>
          )}
        </div>

        {/* Tank Status */}
        {request.tankCapacity && (
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <h2 className="font-semibold">État de la cuve</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Capacité</div>
                <div className="font-mono font-medium">
                  {request.tankCapacity.toLocaleString()} L
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Niveau actuel</div>
                <div className="font-mono font-medium">
                  {request.currentLevel?.toLocaleString()} L
                </div>
              </div>
              <div className="col-span-2 space-y-1">
                <div className="text-sm text-muted-foreground">Creux disponible</div>
                <div className={`font-mono text-2xl font-bold ${
                  percentFull < 20 ? 'text-red-600' : percentFull < 50 ? 'text-yellow-600' : 'text-green-600'
                }`}>
                  {request.ullage?.toLocaleString()} L
                </div>
              </div>
            </div>

            {/* Tank visualization */}
            <div className="h-6 w-full bg-muted rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all ${
                  percentFull < 20 ? 'bg-red-500' : percentFull < 50 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${percentFull}%` }}
              />
            </div>
            <div className="text-center text-sm text-muted-foreground">
              {percentFull.toFixed(1)}% rempli
            </div>
          </div>
        )}
      </div>

      {/* Linked Deliveries */}
      {request.deliveries && request.deliveries.length > 0 && (
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="font-semibold flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Livraisons associées
          </h2>
          <div className="space-y-2">
            {request.deliveries.map((d) => (
              <Link
                key={d.id}
                href={`/${locale}/admin/supply/deliveries/${d.id}`}
                className="flex items-center justify-between p-3 rounded-md border hover:bg-muted"
              >
                <div>
                  <span className="font-mono font-medium">{d.blNumber}</span>
                  <span className="text-sm text-muted-foreground ml-2">
                    {format(new Date(d.createdAt), 'dd/MM/yyyy', { locale: dateLocale })}
                  </span>
                </div>
                <StatusBadge
                  status={d.status === 'VALIDATED' ? 'success' : d.status === 'DISPUTED' ? 'error' : 'info'}
                  label={d.status}
                />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3 rounded-lg border bg-card p-6">
        {request.status === 'DRAFT' && (
          <>
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <ArrowRight className="h-4 w-4" />
              {submitMutation.isPending ? 'Envoi...' : 'Soumettre pour validation'}
            </button>
            <button
              onClick={() => {
                if (confirm('Êtes-vous sûr de vouloir supprimer cette demande ?')) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
              className="inline-flex items-center gap-2 rounded-md border border-destructive text-destructive px-4 py-2.5 text-sm font-medium hover:bg-destructive/10 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              Supprimer
            </button>
          </>
        )}

        {request.status === 'PENDING_VALIDATION' && (
          <button
            onClick={() => validateMutation.mutate()}
            disabled={validateMutation.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            <CheckCircle className="h-4 w-4" />
            {validateMutation.isPending ? 'Validation...' : 'Valider la demande'}
          </button>
        )}

        {request.status === 'VALIDATED' && (
          <button
            onClick={() => orderMutation.mutate()}
            disabled={orderMutation.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Truck className="h-4 w-4" />
            {orderMutation.isPending ? 'Commande...' : 'Marquer comme commandé'}
          </button>
        )}

        {request.status === 'ORDERED' && (
          <>
            <Link
              href={`/${locale}/admin/supply/deliveries/new?requestId=${id}&stationId=${request.stationId}`}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Truck className="h-4 w-4" />
              Créer une livraison
            </Link>
            <button
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle className="h-4 w-4" />
              {completeMutation.isPending ? 'Finalisation...' : 'Marquer comme terminé'}
            </button>
          </>
        )}

        {request.status === 'COMPLETED' && (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-5 w-5" />
            <span className="font-medium">Cette demande a été traitée</span>
          </div>
        )}
      </div>
    </div>
  );
}
