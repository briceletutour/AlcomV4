'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  updateStationSchema,
  type UpdateStationInput,
  createTankSchema,
  type CreateTankInput,
  createPumpSchema,
  type CreatePumpInput,
} from '@alcom/shared/src/schemas/station.schema';
import { useTranslations, useLocale } from 'next-intl';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  Fuel, Gauge, Users, Settings, Plus, Trash2, Edit, ArrowLeft,
  Droplets, AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';

interface Tank {
  id: string;
  fuelType: string;
  capacity: number;
  currentLevel: number;
  version: number;
}

interface Nozzle {
  id: string;
  side: string;
  meterIndex: number;
}

interface Pump {
  id: string;
  code: string;
  tankId: string;
  tank: { id: string; fuelType: string };
  nozzles: Nozzle[];
}

interface Agent {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

interface StationDetail {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  settings: any;
  tanks: Tank[];
  pumps: Pump[];
  users: Agent[];
  createdAt: string;
}

function TankLevelBar({ level, capacity }: { level: number; capacity: number }) {
  const percent = capacity > 0 ? (level / capacity) * 100 : 0;
  const color =
    percent > 50 ? 'bg-green-500' : percent > 20 ? 'bg-amber-500' : 'bg-red-500';
  const textColor =
    percent > 50 ? 'text-green-700' : percent > 20 ? 'text-amber-700' : 'text-red-700';

  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className={`font-medium ${textColor}`}>{percent.toFixed(1)}%</span>
        <span className="text-muted-foreground">
          {Number(level).toLocaleString()}L / {Number(capacity).toLocaleString()}L
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function StationDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const t = useTranslations('Stations');
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [showAddTank, setShowAddTank] = useState(false);
  const [showAddPump, setShowAddPump] = useState(false);
  const [showAssignUser, setShowAssignUser] = useState(false);

  // ─── Fetch station detail ───
  const { data: station, isLoading } = useQuery<StationDetail>({
    queryKey: ['station', id],
    queryFn: async () => {
      const res = await api.get<any>(`/stations/${id}`);
      return (res as any).data || res;
    },
  });

  // ─── Edit station form ───
  const {
    register,
    handleSubmit,
    formState: { isSubmitting: isUpdating },
  } = useForm<UpdateStationInput>({
    resolver: zodResolver(updateStationSchema),
    values: station
      ? { name: station.name, isActive: station.isActive }
      : undefined,
  });

  const updateMutation = useMutation({
    mutationFn: (data: UpdateStationInput) => api.put(`/stations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['station', id] });
      queryClient.invalidateQueries({ queryKey: ['stations'] });
      setEditMode(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/stations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stations'] });
      router.push('/admin/stations');
    },
  });

  // ─── Add tank ───
  const tankForm = useForm<CreateTankInput>({
    resolver: zodResolver(createTankSchema),
    defaultValues: { fuelType: 'ESSENCE', capacity: 30000, currentLevel: 0 },
  });

  const addTankMutation = useMutation({
    mutationFn: (data: CreateTankInput) => api.post(`/stations/${id}/tanks`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['station', id] });
      setShowAddTank(false);
      tankForm.reset();
    },
  });

  // ─── Add pump ───
  const pumpForm = useForm<CreatePumpInput>({
    resolver: zodResolver(createPumpSchema),
    defaultValues: { code: '', tankId: '' },
  });

  const addPumpMutation = useMutation({
    mutationFn: (data: CreatePumpInput) => api.post(`/stations/${id}/pumps`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['station', id] });
      setShowAddPump(false);
      pumpForm.reset();
    },
  });

  // ─── Delete tank / pump ───
  const deleteTankMutation = useMutation({
    mutationFn: (tankId: string) => api.delete(`/stations/${id}/tanks/${tankId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['station', id] }),
  });

  const deletePumpMutation = useMutation({
    mutationFn: (pumpId: string) => api.delete(`/stations/${id}/pumps/${pumpId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['station', id] }),
  });

  // ─── Assign user ───
  const [assignUserId, setAssignUserId] = useState('');
  const { data: availableUsers } = useQuery({
    queryKey: ['users-for-assignment'],
    queryFn: () => api.get<any>('/users?limit=100'),
    enabled: showAssignUser,
  });

  const assignMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post(`/stations/${id}/agents`, { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['station', id] });
      setShowAssignUser(false);
      setAssignUserId('');
    },
  });

  const unassignMutation = useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/stations/${id}/agents/${userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['station', id] }),
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        {t('loading')}
      </div>
    );
  }

  if (!station) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        {t('stationNotFound')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/admin/stations')}
            className="rounded-md p-1.5 hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{station.name}</h1>
              <StatusBadge
                status={station.isActive ? 'success' : 'neutral'}
                label={station.isActive ? t('active') : t('inactive')}
              />
            </div>
            <p className="font-mono text-sm text-muted-foreground">{station.code}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/${locale}/admin/stations/${id}/settings`}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            <Settings className="h-4 w-4" />
            {t('settings')}
          </Link>
          <button
            onClick={() => setEditMode(!editMode)}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            <Edit className="h-4 w-4" />
            {editMode ? t('cancel') : t('edit')}
          </button>
          <button
            onClick={() => {
              if (confirm(t('deleteConfirm'))) deleteMutation.mutate();
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
            {t('delete')}
          </button>
        </div>
      </div>

      {/* Edit mode */}
      {editMode && (
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h3 className="mb-4 font-semibold">{t('editStation')}</h3>
          <form
            onSubmit={handleSubmit((data) => updateMutation.mutate(data))}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">{t('name')}</label>
                <input
                  {...register('name')}
                  className="w-full rounded-md border bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input type="checkbox" {...register('isActive')} id="isActive" className="h-4 w-4" />
                <label htmlFor="isActive" className="text-sm font-medium">
                  {t('active')}
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditMode(false)}
                className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={isUpdating}
                className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isUpdating ? t('saving') : t('save')}
              </button>
            </div>
          </form>
          {deleteMutation.error && (
            <p className="mt-2 text-sm text-destructive">
              {(deleteMutation.error as any)?.message || t('errorGeneric')}
            </p>
          )}
        </div>
      )}

      {/* ═══ Tanks Section ═══ */}
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Fuel className="h-5 w-5 text-primary" />
            {t('tanks')} ({station.tanks.length})
          </h2>
          <button
            onClick={() => setShowAddTank(!showAddTank)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t('addTank')}
          </button>
        </div>

        {/* Add tank form */}
        {showAddTank && (
          <form
            onSubmit={tankForm.handleSubmit((data) => addTankMutation.mutate(data))}
            className="mb-4 rounded-lg border bg-muted/20 p-4"
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">{t('fuelType')}</label>
                <select
                  {...tankForm.register('fuelType')}
                  className="w-full rounded-md border bg-background px-3 py-2.5 text-base"
                >
                  <option value="ESSENCE">Essence</option>
                  <option value="GASOIL">Gasoil</option>
                  <option value="PETROLE">Pétrole</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t('capacity')} (L)</label>
                <input
                  type="number"
                  {...tankForm.register('capacity', { valueAsNumber: true })}
                  className="w-full rounded-md border bg-background px-3 py-2.5 text-base"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t('currentLevel')} (L)</label>
                <input
                  type="number"
                  {...tankForm.register('currentLevel', { valueAsNumber: true })}
                  className="w-full rounded-md border bg-background px-3 py-2.5 text-base"
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddTank(false)}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={addTankMutation.isPending}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
              >
                {addTankMutation.isPending ? t('saving') : t('addTank')}
              </button>
            </div>
            {addTankMutation.error && (
              <p className="mt-2 text-sm text-destructive">
                {(addTankMutation.error as any)?.message}
              </p>
            )}
          </form>
        )}

        {station.tanks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noTanks')}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {station.tanks.map((tank) => {
              const percent =
                Number(tank.capacity) > 0
                  ? (Number(tank.currentLevel) / Number(tank.capacity)) * 100
                  : 0;
              return (
                <div key={tank.id} className="rounded-lg border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Droplets
                        className={`h-5 w-5 ${tank.fuelType === 'ESSENCE' ? 'text-amber-500' : 'text-blue-500'}`}
                      />
                      <span className="font-semibold">{tank.fuelType}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {percent < 20 && (
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                      )}
                      <button
                        onClick={() => {
                          if (confirm(t('deleteTankConfirm')))
                            deleteTankMutation.mutate(tank.id);
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <TankLevelBar
                    level={Number(tank.currentLevel)}
                    capacity={Number(tank.capacity)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ Pumps Section ═══ */}
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Gauge className="h-5 w-5 text-primary" />
            {t('pumps')} ({station.pumps.length})
          </h2>
          <button
            onClick={() => setShowAddPump(!showAddPump)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t('addPump')}
          </button>
        </div>

        {/* Add pump form */}
        {showAddPump && (
          <form
            onSubmit={pumpForm.handleSubmit((data) => addPumpMutation.mutate(data))}
            className="mb-4 rounded-lg border bg-muted/20 p-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">{t('pumpCode')}</label>
                <input
                  {...pumpForm.register('code')}
                  className="w-full rounded-md border bg-background px-3 py-2.5 text-base"
                  placeholder="P-3"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t('linkedTank')}</label>
                <select
                  {...pumpForm.register('tankId')}
                  className="w-full rounded-md border bg-background px-3 py-2.5 text-base"
                >
                  <option value="">{t('selectTank')}</option>
                  {station.tanks.map((tank) => (
                    <option key={tank.id} value={tank.id}>
                      {tank.fuelType} — {Number(tank.capacity).toLocaleString()}L
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t('nozzlesAutoCreated')}</p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddPump(false)}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={addPumpMutation.isPending}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
              >
                {addPumpMutation.isPending ? t('saving') : t('addPump')}
              </button>
            </div>
            {addPumpMutation.error && (
              <p className="mt-2 text-sm text-destructive">
                {(addPumpMutation.error as any)?.message}
              </p>
            )}
          </form>
        )}

        {station.pumps.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noPumps')}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {station.pumps.map((pump) => (
              <div key={pump.id} className="rounded-lg border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold">{pump.code}</span>
                  <button
                    onClick={() => {
                      if (confirm(t('deletePumpConfirm')))
                        deletePumpMutation.mutate(pump.id);
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <p className="mb-2 text-sm text-muted-foreground">
                  {t('linkedTo')}: {pump.tank.fuelType}
                </p>
                <div className="space-y-1">
                  {pump.nozzles.map((nozzle) => (
                    <div
                      key={nozzle.id}
                      className="flex items-center justify-between rounded bg-muted/30 px-2 py-1 text-sm"
                    >
                      <span>
                        {t('nozzle')} {nozzle.side}
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {Number(nozzle.meterIndex).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ Assigned Users Section ═══ */}
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Users className="h-5 w-5 text-primary" />
            {t('assignedUsers')} ({station.users.length})
          </h2>
          <button
            onClick={() => setShowAssignUser(!showAssignUser)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t('assignUser')}
          </button>
        </div>

        {/* Assign user form */}
        {showAssignUser && (
          <div className="mb-4 rounded-lg border bg-muted/20 p-4">
            <div className="flex gap-3">
              <select
                value={assignUserId}
                onChange={(e) => setAssignUserId(e.target.value)}
                className="flex-1 rounded-md border bg-background px-3 py-2.5 text-base"
              >
                <option value="">{t('selectUser')}</option>
                {((availableUsers as any)?.data || [])
                  .filter(
                    (u: any) =>
                      !station.users.find((su) => su.id === u.id),
                  )
                  .map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} — {u.role}
                    </option>
                  ))}
              </select>
              <button
                onClick={() => assignUserId && assignMutation.mutate(assignUserId)}
                disabled={!assignUserId || assignMutation.isPending}
                className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
              >
                {assignMutation.isPending ? t('saving') : t('assign')}
              </button>
            </div>
            {assignMutation.error && (
              <p className="mt-2 text-sm text-destructive">
                {(assignMutation.error as any)?.message}
              </p>
            )}
          </div>
        )}

        {station.users.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noAssignedUsers')}</p>
        ) : (
          <div className="space-y-2">
            {station.users.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between rounded-lg border px-4 py-3"
              >
                <div>
                  <p className="font-medium">{user.fullName}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status="info" label={user.role} />
                  <button
                    onClick={() => {
                      if (confirm(t('unassignConfirm')))
                        unassignMutation.mutate(user.id);
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
