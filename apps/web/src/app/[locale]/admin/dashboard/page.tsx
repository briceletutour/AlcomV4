'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { KPICard } from '@/components/shared/kpi-card';
import { TankProgress } from '@/components/shared/tank-progress';
import {
  DollarSign,
  TrendingDown,
  TrendingUp,
  Fuel,
  CalendarClock,
  ClipboardCheck,
  AlertTriangle,
  FileText,
  Receipt,
  Mail,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';

// ─── Types ───
interface ManagerDashboard {
  type: 'manager';
  todayRevenue: number;
  yesterdayRevenue: number;
  revenueChangePercent: number;
  openShifts: number;
  pendingChecklists: number;
  currentVariance: number;
  varianceTrend: { date: string; cashVariance: number; stockVariance: number }[];
  tankLevels: { tankId: string; fuelType: string; level: number; capacity: number; percentage: number }[];
  pendingExpenses: number;
  openIncidents: number;
}

interface ExecutiveDashboard {
  type: 'executive';
  totalRevenue: number;
  revenueTarget: number;
  revenueVsTargetPercent: number;
  totalVariance: number;
  avgVariancePerStation: number;
  pendingInvoices: number;
  pendingInvoiceAmount: number;
  pendingExpenses: number;
  pendingExpenseAmount: number;
  stationRanking: { stationId: string; name: string; code: string; revenue: number; variance: number }[];
  overdueMails: number;
  revenueByStation: { stationId: string; name: string; revenue: number }[];
  revenueTrend: { date: string; revenue: number }[];
}

type DashboardData = ManagerDashboard | ExecutiveDashboard;

// ─── Helpers ───
function formatCurrency(val: number): string {
  return new Intl.NumberFormat('fr-CM', {
    style: 'decimal',
    maximumFractionDigits: 0,
  }).format(val) + ' FCFA';
}

function formatShortDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  } catch {
    return dateStr;
  }
}

// ─── Skeleton ───
function CardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm animate-pulse">
      <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
      <div className="h-8 w-32 bg-gray-200 rounded mb-2" />
      <div className="h-3 w-20 bg-gray-200 rounded" />
    </div>
  );
}

function ChartSkeleton({ title }: { title: string }) {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <h3 className="text-sm font-medium text-muted-foreground mb-4">{title}</h3>
      <div className="h-64 bg-gray-100 rounded animate-pulse" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Main Dashboard
// ═══════════════════════════════════════════════════════════════════
export default function DashboardPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const locale = useLocale();

  const isExecutive = ['SUPER_ADMIN', 'CEO', 'CFO', 'FINANCE_DIR', 'DCO'].includes(
    user?.role || '',
  );

  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/stats/dashboard'),
    refetchInterval: 60_000,
  });

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center text-red-500">
        Erreur lors du chargement du tableau de bord
      </div>
    );
  }

  const navigate = (path: string) => router.push(`/${locale}/admin${path}`);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tableau de bord</h1>
          <p className="text-muted-foreground">
            {isExecutive ? 'Vue globale — Toutes les stations' : `Station: ${user?.stationName || ''}`}
          </p>
        </div>
      </div>

      {isLoading ? (
        <DashboardSkeleton />
      ) : data?.type === 'manager' ? (
        <ManagerView data={data} navigate={navigate} />
      ) : data?.type === 'executive' ? (
        <ExecutiveView data={data} navigate={navigate} />
      ) : null}
    </div>
  );
}

// ─── Skeleton Loading ───
function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartSkeleton title="Chargement..." />
        <ChartSkeleton title="Chargement..." />
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Manager View
// ═══════════════════════════════════════════════════════════════════
function ManagerView({ data, navigate }: { data: ManagerDashboard; navigate: (path: string) => void }) {
  return (
    <>
      {/* KPI Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <button onClick={() => navigate('/shifts')} className="text-left w-full">
          <KPICard
            title="Recette du jour"
            value={formatCurrency(data.todayRevenue)}
            icon={DollarSign}
            trend={{
              value: data.revenueChangePercent,
              label: 'vs hier',
            }}
            className="hover:ring-2 hover:ring-primary/30 transition-shadow cursor-pointer"
          />
        </button>

        <button onClick={() => navigate('/shifts')} className="text-left w-full">
          <KPICard
            title="Écart caisse"
            value={formatCurrency(data.currentVariance)}
            icon={data.currentVariance >= 0 ? TrendingUp : TrendingDown}
            className={cn(
              'hover:ring-2 hover:ring-primary/30 transition-shadow cursor-pointer',
              data.currentVariance === 0
                ? ''
                : data.currentVariance > 0
                  ? 'border-blue-200'
                  : 'border-red-200',
            )}
          />
        </button>

        <button onClick={() => navigate('/shifts')} className="text-left w-full">
          <KPICard
            title="Tâches en cours"
            value={`${data.openShifts} quart(s) · ${data.pendingChecklists} CL`}
            icon={CalendarClock}
            className="hover:ring-2 hover:ring-primary/30 transition-shadow cursor-pointer"
          />
        </button>

        <button onClick={() => navigate('/incidents')} className="text-left w-full">
          <KPICard
            title="Incidents ouverts"
            value={data.openIncidents}
            icon={AlertTriangle}
            className={cn(
              'hover:ring-2 hover:ring-primary/30 transition-shadow cursor-pointer',
              data.openIncidents > 0 ? 'border-orange-200' : '',
            )}
          />
        </button>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Tank Levels */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
            <Fuel className="h-4 w-4" /> Niveaux des cuves
          </h3>
          {data.tankLevels.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucune cuve configurée</p>
          ) : (
            <div className="space-y-4">
              {data.tankLevels.map((tank) => (
                <TankProgress
                  key={tank.tankId}
                  fuelType={tank.fuelType as 'ESSENCE' | 'GASOIL' | 'PETROLE'}
                  currentLevel={tank.level}
                  capacity={tank.capacity}
                />
              ))}
            </div>
          )}
        </div>

        {/* Variance Trend (7 days) */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">
            Tendance des écarts (7 jours)
          </h3>
          {data.varianceTrend.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucune donnée disponible</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.varianceTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={formatShortDate} fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  labelFormatter={formatShortDate}
                />
                <ReferenceLine y={0} stroke="#666" />
                <Bar dataKey="cashVariance" name="Écart caisse">
                  {data.varianceTrend.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.cashVariance >= 0 ? '#3b82f6' : '#ef4444'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Badges Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <button
          onClick={() => navigate('/shifts')}
          className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm hover:bg-muted/30 transition-colors"
        >
          <CalendarClock className="h-8 w-8 text-blue-500" />
          <div className="text-left">
            <p className="text-sm text-muted-foreground">Quarts ouverts</p>
            <p className="text-xl font-bold">{data.openShifts}</p>
          </div>
        </button>

        <button
          onClick={() => navigate('/checklists')}
          className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm hover:bg-muted/30 transition-colors"
        >
          <ClipboardCheck className="h-8 w-8 text-amber-500" />
          <div className="text-left">
            <p className="text-sm text-muted-foreground">Checklists en attente</p>
            <p className="text-xl font-bold">{data.pendingChecklists}</p>
          </div>
        </button>

        <button
          onClick={() => navigate('/finance/expenses')}
          className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm hover:bg-muted/30 transition-colors"
        >
          <Receipt className="h-8 w-8 text-green-500" />
          <div className="text-left">
            <p className="text-sm text-muted-foreground">Dépenses en attente</p>
            <p className="text-xl font-bold">{data.pendingExpenses}</p>
          </div>
        </button>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Executive View
// ═══════════════════════════════════════════════════════════════════
function ExecutiveView({
  data,
  navigate,
}: {
  data: ExecutiveDashboard;
  navigate: (path: string) => void;
}) {
  const [sortKey, setSortKey] = React.useState<'revenue' | 'variance'>('revenue');
  const [sortAsc, setSortAsc] = React.useState(false);

  const sortedStations = [...data.stationRanking].sort((a, b) => {
    const multiplier = sortAsc ? 1 : -1;
    return multiplier * (a[sortKey] - b[sortKey]);
  });

  return (
    <>
      {/* KPI Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <button onClick={() => navigate('/shifts')} className="text-left w-full">
          <KPICard
            title="Recette du mois"
            value={formatCurrency(data.totalRevenue)}
            icon={DollarSign}
            className="hover:ring-2 hover:ring-primary/30 transition-shadow cursor-pointer"
          />
        </button>

        <button onClick={() => navigate('/shifts')} className="text-left w-full">
          <KPICard
            title="Écart total (mois)"
            value={formatCurrency(data.totalVariance)}
            icon={data.totalVariance >= 0 ? TrendingUp : TrendingDown}
            trend={{
              value: 0,
              label: `Moy: ${formatCurrency(data.avgVariancePerStation)}/station`,
            }}
            className={cn(
              'hover:ring-2 hover:ring-primary/30 transition-shadow cursor-pointer',
              data.totalVariance === 0
                ? ''
                : data.totalVariance > 0
                  ? 'border-blue-200'
                  : 'border-red-200',
            )}
          />
        </button>

        <button onClick={() => navigate('/finance/invoices')} className="text-left w-full">
          <KPICard
            title="Factures en attente"
            value={data.pendingInvoices}
            icon={FileText}
            trend={{
              value: 0,
              label: formatCurrency(data.pendingInvoiceAmount),
            }}
            className="hover:ring-2 hover:ring-primary/30 transition-shadow cursor-pointer"
          />
        </button>

        <button onClick={() => navigate('/finance/expenses')} className="text-left w-full">
          <KPICard
            title="Dépenses en attente"
            value={data.pendingExpenses}
            icon={Receipt}
            trend={{
              value: 0,
              label: formatCurrency(data.pendingExpenseAmount),
            }}
            className="hover:ring-2 hover:ring-primary/30 transition-shadow cursor-pointer"
          />
        </button>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Revenue Trend (30 days) */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">
            Tendance des recettes (30 jours)
          </h3>
          {data.revenueTrend.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucune donnée</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data.revenueTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={formatShortDate} fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  labelFormatter={formatShortDate}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name="Recette"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Variance by Station (bar chart) */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">
            Écart par station (mois en cours)
          </h3>
          {data.stationRanking.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucune donnée</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.stationRanking}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="code" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <ReferenceLine y={0} stroke="#666" />
                <Bar dataKey="variance" name="Écart">
                  {data.stationRanking.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.variance >= 0 ? '#3b82f6' : '#ef4444'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Station Ranking Table */}
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-muted-foreground">Classement des stations</h3>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (sortKey === 'revenue') setSortAsc(!sortAsc);
                else { setSortKey('revenue'); setSortAsc(false); }
              }}
              className={cn(
                'px-3 py-1 text-xs rounded-md border',
                sortKey === 'revenue' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              Recette {sortKey === 'revenue' ? (sortAsc ? '↑' : '↓') : ''}
            </button>
            <button
              onClick={() => {
                if (sortKey === 'variance') setSortAsc(!sortAsc);
                else { setSortKey('variance'); setSortAsc(true); }
              }}
              className={cn(
                'px-3 py-1 text-xs rounded-md border',
                sortKey === 'variance' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              Écart {sortKey === 'variance' ? (sortAsc ? '↑' : '↓') : ''}
            </button>
          </div>
        </div>

        {sortedStations.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucune station</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">#</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Station</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Recette</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Écart</th>
                </tr>
              </thead>
              <tbody>
                {sortedStations.map((st, i) => (
                  <tr key={st.stationId} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{i + 1}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{st.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{st.code}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(st.revenue)}</td>
                    <td
                      className={cn(
                        'px-4 py-3 text-right font-mono font-medium',
                        st.variance === 0
                          ? 'text-green-600'
                          : st.variance > 0
                            ? 'text-blue-600'
                            : 'text-red-600',
                      )}
                    >
                      {st.variance > 0 ? '+' : ''}
                      {formatCurrency(st.variance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <button
          onClick={() => navigate('/mails')}
          className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm hover:bg-muted/30 transition-colors"
        >
          <Mail className={cn('h-8 w-8', data.overdueMails > 0 ? 'text-red-500' : 'text-green-500')} />
          <div className="text-left">
            <p className="text-sm text-muted-foreground">Courriers en retard</p>
            <p className="text-xl font-bold">{data.overdueMails}</p>
          </div>
        </button>

        <button
          onClick={() => navigate('/finance/invoices')}
          className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm hover:bg-muted/30 transition-colors"
        >
          <FileText className="h-8 w-8 text-amber-500" />
          <div className="text-left">
            <p className="text-sm text-muted-foreground">Factures à approuver</p>
            <p className="text-xl font-bold">{data.pendingInvoices}</p>
          </div>
        </button>

        <button
          onClick={() => navigate('/finance/expenses')}
          className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm hover:bg-muted/30 transition-colors"
        >
          <Receipt className="h-8 w-8 text-green-500" />
          <div className="text-left">
            <p className="text-sm text-muted-foreground">Dépenses à traiter</p>
            <p className="text-xl font-bold">{data.pendingExpenses}</p>
          </div>
        </button>
      </div>
    </>
  );
}
