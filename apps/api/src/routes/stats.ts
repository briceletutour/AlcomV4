import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import prisma from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/response';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { UserRole } from '@alcom/shared';
import logger from '../lib/logger';

const router = Router();

// ─── Role Groups ───
const EXECUTIVE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.CEO,
  UserRole.CFO,
  UserRole.FINANCE_DIR,
  UserRole.DCO,
];

const ALL_DASHBOARD_ROLES = [
  ...EXECUTIVE_ROLES,
  UserRole.STATION_MANAGER,
  UserRole.CHEF_PISTE,
  UserRole.LOGISTICS,
];

// ─── Helpers ───

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ══════════════════════════════════════════════════════════════════
//  GET /stats/dashboard — role-aware main dashboard endpoint
// ══════════════════════════════════════════════════════════════════
router.get(
  '/dashboard',
  requireAuth,
  requireRole(...ALL_DASHBOARD_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const isExecutive = EXECUTIVE_ROLES.includes(user.role as any);

      if (isExecutive) {
        const data = await getExecutiveDashboard();
        sendSuccess(res, { data });
      } else {
        // Station-scoped
        const stationId = user.stationId;
        if (!stationId) {
          sendError(res, {
            code: 'NO_STATION',
            message: 'User has no assigned station',
            statusCode: 400,
          });
          return;
        }
        const data = await getManagerDashboard(stationId);
        sendSuccess(res, { data });
      }
    } catch (error) {
      logger.error(`Dashboard stats error: ${error}`);
      sendError(res, {
        code: 'DASHBOARD_ERROR',
        message: 'Failed to load dashboard data',
        statusCode: 500,
      });
    }
  },
);

// ─── Manager Dashboard (single station) ───
async function getManagerDashboard(stationId: string) {
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = startOfDay(new Date(now.getTime() - 86400000));
  const yesterdayEnd = endOfDay(yesterday);
  const sevenDaysAgo = daysAgo(7);

  // Run all queries in parallel
  const [
    todayRevenueResult,
    yesterdayRevenueResult,
    openShiftsCount,
    pendingChecklistsCount,
    varianceTrend,
    tankLevels,
    pendingExpensesCount,
    openIncidentsCount,
  ] = await Promise.all([
    // Today's revenue
    prisma.shiftReport.aggregate({
      where: {
        stationId,
        shiftDate: { gte: today },
        status: 'CLOSED',
      },
      _sum: { totalRevenue: true },
    }),

    // Yesterday's revenue
    prisma.shiftReport.aggregate({
      where: {
        stationId,
        shiftDate: { gte: yesterday, lt: today },
        status: 'CLOSED',
      },
      _sum: { totalRevenue: true },
    }),

    // Open shifts count
    prisma.shiftReport.count({
      where: { stationId, status: 'OPEN' },
    }),

    // Pending checklists (DRAFT or PENDING_VALIDATION)
    prisma.checklistSubmission.count({
      where: {
        stationId,
        status: { in: ['DRAFT', 'PENDING_VALIDATION'] },
      },
    }),

    // 7-day variance trend
    prisma.shiftReport.findMany({
      where: {
        stationId,
        shiftDate: { gte: sevenDaysAgo },
        status: 'CLOSED',
      },
      select: {
        shiftDate: true,
        cashVariance: true,
        stockVariance: true,
      },
      orderBy: { shiftDate: 'asc' },
    }),

    // Tank levels
    prisma.tank.findMany({
      where: { stationId, deletedAt: null },
      select: {
        id: true,
        fuelType: true,
        currentLevel: true,
        capacity: true,
      },
      orderBy: { fuelType: 'asc' },
    }),

    // Pending expenses
    prisma.expense.count({
      where: {
        stationId,
        status: { in: ['SUBMITTED', 'PENDING_MANAGER'] },
      },
    }),

    // Open incidents
    prisma.incident.count({
      where: {
        stationId,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
      },
    }),
  ]);

  const todayRevenue = new Decimal(todayRevenueResult._sum.totalRevenue?.toString() || '0');
  const yesterdayRevenue = new Decimal(yesterdayRevenueResult._sum.totalRevenue?.toString() || '0');

  const revenueChange = yesterdayRevenue.isZero()
    ? 0
    : todayRevenue.minus(yesterdayRevenue).div(yesterdayRevenue).mul(100).toDecimalPlaces(2).toNumber();

  const todayCashVariance = varianceTrend
    .filter((v) => {
      const vDate = new Date(v.shiftDate);
      return vDate >= today;
    })
    .reduce((sum, v) => sum.plus(new Decimal(v.cashVariance?.toString() || '0')), new Decimal(0));

  return {
    type: 'manager' as const,
    todayRevenue: todayRevenue.toNumber(),
    yesterdayRevenue: yesterdayRevenue.toNumber(),
    revenueChangePercent: revenueChange,
    openShifts: openShiftsCount,
    pendingChecklists: pendingChecklistsCount,
    currentVariance: todayCashVariance.toNumber(),
    varianceTrend: varianceTrend.map((v) => ({
      date: v.shiftDate,
      cashVariance: Number(v.cashVariance || 0),
      stockVariance: Number(v.stockVariance || 0),
    })),
    tankLevels: tankLevels.map((t) => ({
      tankId: t.id,
      fuelType: t.fuelType,
      level: Number(t.currentLevel),
      capacity: Number(t.capacity),
      percentage: Number(t.capacity) > 0
        ? Number(new Decimal(t.currentLevel.toString()).div(t.capacity.toString()).mul(100).toDecimalPlaces(1))
        : 0,
    })),
    pendingExpenses: pendingExpensesCount,
    openIncidents: openIncidentsCount,
  };
}

// ─── Executive Dashboard (all stations) ───
async function getExecutiveDashboard() {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const thirtyDaysAgo = daysAgo(30);

  const [
    monthRevenueResult,
    monthVarianceResult,
    stationRevenueBreakdown,
    pendingInvoicesResult,
    pendingExpensesResult,
    overdueMailsCount,
    revenueTrendRaw,
  ] = await Promise.all([
    // Total monthly revenue
    prisma.shiftReport.aggregate({
      where: {
        shiftDate: { gte: monthStart },
        status: 'CLOSED',
      },
      _sum: { totalRevenue: true },
    }),

    // Total monthly variance (cash)
    prisma.shiftReport.aggregate({
      where: {
        shiftDate: { gte: monthStart },
        status: 'CLOSED',
      },
      _sum: { cashVariance: true },
      _count: { _all: true },
    }),

    // Revenue breakdown per station (current month)
    prisma.shiftReport.groupBy({
      by: ['stationId'],
      where: {
        shiftDate: { gte: monthStart },
        status: 'CLOSED',
      },
      _sum: { totalRevenue: true, cashVariance: true },
    }),

    // Pending invoices
    prisma.invoice.aggregate({
      where: { status: 'PENDING_APPROVAL' },
      _count: { _all: true },
      _sum: { amount: true },
    }),

    // Pending expenses
    prisma.expense.aggregate({
      where: { status: { in: ['SUBMITTED', 'PENDING_MANAGER', 'PENDING_FINANCE'] } },
      _count: { _all: true },
      _sum: { amount: true },
    }),

    // Overdue mails
    prisma.incomingMail.count({
      where: { slaState: 'OVERDUE' },
    }),

    // Daily revenue trend (30 days) — group shifts by date
    prisma.shiftReport.groupBy({
      by: ['shiftDate'],
      where: {
        shiftDate: { gte: thirtyDaysAgo },
        status: 'CLOSED',
      },
      _sum: { totalRevenue: true },
      orderBy: { shiftDate: 'asc' },
    }),
  ]);

  // Fetch station names for the ranking
  const stationIds = stationRevenueBreakdown.map((s) => s.stationId);
  const stations = stationIds.length > 0
    ? await prisma.station.findMany({
        where: { id: { in: stationIds } },
        select: { id: true, name: true, code: true },
      })
    : [];

  const stationMap = new Map(stations.map((s) => [s.id, s]));

  // Count unique stations that had closed shifts
  const activeStationCount = stationRevenueBreakdown.length || 1;

  const totalRevenue = new Decimal(monthRevenueResult._sum.totalRevenue?.toString() || '0');
  const totalVariance = new Decimal(monthVarianceResult._sum.cashVariance?.toString() || '0');
  const avgVariancePerStation = totalVariance.div(activeStationCount).toDecimalPlaces(2);

  // Build station ranking (sorted by revenue desc)
  const stationRanking = stationRevenueBreakdown
    .map((s) => {
      const station = stationMap.get(s.stationId);
      return {
        stationId: s.stationId,
        name: station?.name || 'Unknown',
        code: station?.code || '',
        revenue: Number(s._sum.totalRevenue || 0),
        variance: Number(s._sum.cashVariance || 0),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  return {
    type: 'executive' as const,
    totalRevenue: totalRevenue.toNumber(),
    revenueTarget: 0, // Target can be configured later
    revenueVsTargetPercent: 0,
    totalVariance: totalVariance.toNumber(),
    avgVariancePerStation: avgVariancePerStation.toNumber(),
    pendingInvoices: pendingInvoicesResult._count._all,
    pendingInvoiceAmount: Number(pendingInvoicesResult._sum.amount || 0),
    pendingExpenses: pendingExpensesResult._count._all,
    pendingExpenseAmount: Number(pendingExpensesResult._sum.amount || 0),
    stationRanking,
    overdueMails: overdueMailsCount,
    revenueByStation: stationRanking.map((s) => ({
      stationId: s.stationId,
      name: s.name,
      revenue: s.revenue,
    })),
    revenueTrend: revenueTrendRaw.map((r) => ({
      date: r.shiftDate,
      revenue: Number(r._sum.totalRevenue || 0),
    })),
  };
}

// ══════════════════════════════════════════════════════════════════
//  GET /stats/sales-trend — daily revenue line chart
// ══════════════════════════════════════════════════════════════════
router.get(
  '/sales-trend',
  requireAuth,
  requireRole(...ALL_DASHBOARD_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const stationId = req.query.stationId as string | undefined;
      const days = Math.min(parseInt(req.query.days as string) || 30, 365);
      const since = daysAgo(days);

      const where: Prisma.ShiftReportWhereInput = {
        shiftDate: { gte: since },
        status: 'CLOSED',
      };

      // Apply station scoping
      if (stationId) {
        where.stationId = stationId;
      } else if (!EXECUTIVE_ROLES.includes(req.user!.role as any)) {
        where.stationId = req.user!.stationId || 'none';
      }

      const trend = await prisma.shiftReport.groupBy({
        by: ['shiftDate'],
        where,
        _sum: { totalRevenue: true },
        orderBy: { shiftDate: 'asc' },
      });

      sendSuccess(res, {
        data: trend.map((t) => ({
          date: t.shiftDate,
          revenue: Number(t._sum.totalRevenue || 0),
        })),
      });
    } catch (error) {
      logger.error(`Sales trend error: ${error}`);
      sendError(res, {
        code: 'STATS_ERROR',
        message: 'Failed to load sales trend',
        statusCode: 500,
      });
    }
  },
);

// ══════════════════════════════════════════════════════════════════
//  GET /stats/tank-levels — current tank levels for chart
// ══════════════════════════════════════════════════════════════════
router.get(
  '/tank-levels',
  requireAuth,
  requireRole(...ALL_DASHBOARD_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const stationId = req.query.stationId as string | undefined;

      const where: Prisma.TankWhereInput = { deletedAt: null };
      if (stationId) {
        where.stationId = stationId;
      } else if (!EXECUTIVE_ROLES.includes(req.user!.role as any)) {
        where.stationId = req.user!.stationId || 'none';
      }

      const tanks = await prisma.tank.findMany({
        where,
        include: { station: { select: { name: true, code: true } } },
        orderBy: [{ stationId: 'asc' }, { fuelType: 'asc' }],
      });

      sendSuccess(res, {
        data: tanks.map((t) => ({
          tankId: t.id,
          stationName: t.station.name,
          stationCode: t.station.code,
          fuelType: t.fuelType,
          level: Number(t.currentLevel),
          capacity: Number(t.capacity),
          percentage: Number(t.capacity) > 0
            ? Number(new Decimal(t.currentLevel.toString()).div(t.capacity.toString()).mul(100).toDecimalPlaces(1))
            : 0,
        })),
      });
    } catch (error) {
      logger.error(`Tank levels error: ${error}`);
      sendError(res, {
        code: 'STATS_ERROR',
        message: 'Failed to load tank levels',
        statusCode: 500,
      });
    }
  },
);

// ══════════════════════════════════════════════════════════════════
//  GET /stats/variance-report — variance per shift for bar chart
// ══════════════════════════════════════════════════════════════════
router.get(
  '/variance-report',
  requireAuth,
  requireRole(...ALL_DASHBOARD_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const stationId = req.query.stationId as string | undefined;
      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : daysAgo(30);
      const endDate = req.query.endDate
        ? endOfDay(new Date(req.query.endDate as string))
        : endOfDay(new Date());

      const where: Prisma.ShiftReportWhereInput = {
        shiftDate: { gte: startDate, lte: endDate },
        status: 'CLOSED',
      };

      if (stationId) {
        where.stationId = stationId;
      } else if (!EXECUTIVE_ROLES.includes(req.user!.role as any)) {
        where.stationId = req.user!.stationId || 'none';
      }

      const shifts = await prisma.shiftReport.findMany({
        where,
        select: {
          id: true,
          shiftDate: true,
          shiftType: true,
          cashVariance: true,
          stockVariance: true,
          station: { select: { name: true, code: true } },
        },
        orderBy: { shiftDate: 'asc' },
      });

      sendSuccess(res, {
        data: shifts.map((s) => ({
          shiftId: s.id,
          date: s.shiftDate,
          shiftType: s.shiftType,
          station: s.station.name,
          cashVariance: Number(s.cashVariance),
          stockVariance: Number(s.stockVariance),
        })),
      });
    } catch (error) {
      logger.error(`Variance report error: ${error}`);
      sendError(res, {
        code: 'STATS_ERROR',
        message: 'Failed to load variance report',
        statusCode: 500,
      });
    }
  },
);

// ══════════════════════════════════════════════════════════════════
//  GET /stats/checklist-scores — daily checklist scores line chart
// ══════════════════════════════════════════════════════════════════
router.get(
  '/checklist-scores',
  requireAuth,
  requireRole(...ALL_DASHBOARD_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const stationId = req.query.stationId as string | undefined;
      const days = Math.min(parseInt(req.query.days as string) || 30, 365);
      const since = daysAgo(days);

      const where: Prisma.ChecklistSubmissionWhereInput = {
        shiftDate: { gte: since },
        status: 'VALIDATED',
      };

      if (stationId) {
        where.stationId = stationId;
      } else if (!EXECUTIVE_ROLES.includes(req.user!.role as any)) {
        where.stationId = req.user!.stationId || 'none';
      }

      const submissions = await prisma.checklistSubmission.groupBy({
        by: ['shiftDate'],
        where,
        _avg: { computedScore: true },
        _count: { _all: true },
        orderBy: { shiftDate: 'asc' },
      });

      sendSuccess(res, {
        data: submissions.map((s) => ({
          date: s.shiftDate,
          avgScore: Math.round(s._avg.computedScore || 0),
          count: s._count._all,
        })),
      });
    } catch (error) {
      logger.error(`Checklist scores error: ${error}`);
      sendError(res, {
        code: 'STATS_ERROR',
        message: 'Failed to load checklist scores',
        statusCode: 500,
      });
    }
  },
);

export default router;
