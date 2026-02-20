import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { sendError } from '../lib/response';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { UserRole } from '@alcom/shared';
import logger from '../lib/logger';

const router = Router();

const EXPORT_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.CEO,
  UserRole.CFO,
  UserRole.FINANCE_DIR,
  UserRole.DCO,
  UserRole.STATION_MANAGER,
  UserRole.LOGISTICS,
];

const EXECUTIVE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.CEO,
  UserRole.CFO,
  UserRole.FINANCE_DIR,
  UserRole.DCO,
];

// ─── CSV Helper ───
function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const escape = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = headers.map(escape).join(',');
  const dataLines = rows.map((row) =>
    headers.map((h) => escape(row[h])).join(','),
  );

  return [headerLine, ...dataLines].join('\n');
}

function sendCsv(res: Response, filename: string, csv: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // BOM for Excel UTF-8 compat
  res.send('\uFEFF' + csv);
}

// ══════════════════════════════════════════════════════════════════
//  GET /exports/shifts — shift reports CSV
// ══════════════════════════════════════════════════════════════════
router.get(
  '/shifts',
  requireAuth,
  requireRole(...EXPORT_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const stationId = req.query.stationId as string | undefined;
      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : undefined;
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : undefined;

      const where: Prisma.ShiftReportWhereInput = { status: 'CLOSED' };
      if (stationId) {
        where.stationId = stationId;
      } else if (!EXECUTIVE_ROLES.includes(req.user!.role as any)) {
        where.stationId = req.user!.stationId || 'none';
      }
      if (startDate || endDate) {
        where.shiftDate = {};
        if (startDate) (where.shiftDate as Prisma.DateTimeFilter).gte = startDate;
        if (endDate) (where.shiftDate as Prisma.DateTimeFilter).lte = endDate;
      }

      const shifts = await prisma.shiftReport.findMany({
        where,
        include: {
          station: { select: { name: true, code: true } },
          openedBy: { select: { fullName: true } },
          closedBy: { select: { fullName: true } },
        },
        orderBy: { shiftDate: 'desc' },
        take: 5000,
      });

      const headers = [
        'Date',
        'ShiftType',
        'Station',
        'StationCode',
        'Status',
        'TotalRevenue',
        'CashVariance',
        'StockVariance',
        'CashCounted',
        'CardAmount',
        'ExpensesAmount',
        'TheoreticalCash',
        'OpenedBy',
        'ClosedBy',
        'Justification',
      ];

      const rows = shifts.map((s) => ({
        Date: new Date(s.shiftDate).toISOString().split('T')[0],
        ShiftType: s.shiftType,
        Station: s.station.name,
        StationCode: s.station.code,
        Status: s.status,
        TotalRevenue: Number(s.totalRevenue),
        CashVariance: Number(s.cashVariance),
        StockVariance: Number(s.stockVariance),
        CashCounted: Number(s.cashCounted),
        CardAmount: Number(s.cardAmount),
        ExpensesAmount: Number(s.expensesAmount),
        TheoreticalCash: Number(s.theoreticalCash),
        OpenedBy: s.openedBy.fullName,
        ClosedBy: s.closedBy?.fullName || '',
        Justification: s.justification || '',
      }));

      const csv = toCsv(headers, rows);
      sendCsv(res, `shifts_export_${new Date().toISOString().split('T')[0]}.csv`, csv);
    } catch (error) {
      logger.error(`Shift export error: ${error}`);
      sendError(res, {
        code: 'EXPORT_ERROR',
        message: 'Failed to export shifts',
        statusCode: 500,
      });
    }
  },
);

// ══════════════════════════════════════════════════════════════════
//  GET /exports/invoices — invoices CSV
// ══════════════════════════════════════════════════════════════════
router.get(
  '/invoices',
  requireAuth,
  requireRole(...EXPORT_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const status = req.query.status as string | undefined;

      const where: Prisma.InvoiceWhereInput = {};
      if (status) {
        where.status = status as any;
      }

      const invoices = await prisma.invoice.findMany({
        where,
        include: {
          supplier: { select: { name: true, taxId: true } },
          submittedBy: { select: { fullName: true } },
          approvedBy: { select: { fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      });

      const headers = [
        'InvoiceNumber',
        'Supplier',
        'SupplierTaxId',
        'Amount',
        'Currency',
        'Status',
        'DueDate',
        'SubmittedBy',
        'ApprovedBy',
        'RejectionReason',
        'CreatedAt',
      ];

      const rows = invoices.map((inv) => ({
        InvoiceNumber: inv.invoiceNumber,
        Supplier: inv.supplier.name,
        SupplierTaxId: inv.supplier.taxId,
        Amount: Number(inv.amount),
        Currency: inv.currency,
        Status: inv.status,
        DueDate: new Date(inv.dueDate).toISOString().split('T')[0],
        SubmittedBy: inv.submittedBy.fullName,
        ApprovedBy: inv.approvedBy?.fullName || '',
        RejectionReason: inv.rejectionReason || '',
        CreatedAt: new Date(inv.createdAt).toISOString(),
      }));

      const csv = toCsv(headers, rows);
      sendCsv(res, `invoices_export_${new Date().toISOString().split('T')[0]}.csv`, csv);
    } catch (error) {
      logger.error(`Invoice export error: ${error}`);
      sendError(res, {
        code: 'EXPORT_ERROR',
        message: 'Failed to export invoices',
        statusCode: 500,
      });
    }
  },
);

// ══════════════════════════════════════════════════════════════════
//  GET /exports/expenses — expenses CSV
// ══════════════════════════════════════════════════════════════════
router.get(
  '/expenses',
  requireAuth,
  requireRole(...EXPORT_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const stationId = req.query.stationId as string | undefined;
      const status = req.query.status as string | undefined;

      const where: Prisma.ExpenseWhereInput = {};
      if (stationId) {
        where.stationId = stationId;
      } else if (!EXECUTIVE_ROLES.includes(req.user!.role as any)) {
        where.stationId = req.user!.stationId || 'none';
      }
      if (status) {
        where.status = status as any;
      }

      const expenses = await prisma.expense.findMany({
        where,
        include: {
          requester: { select: { fullName: true } },
          station: { select: { name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      });

      const headers = [
        'Title',
        'Amount',
        'Category',
        'Status',
        'Station',
        'RequestedBy',
        'DisbursementMethod',
        'RejectionReason',
        'CreatedAt',
      ];

      const rows = expenses.map((exp) => ({
        Title: exp.title,
        Amount: Number(exp.amount),
        Category: exp.category,
        Status: exp.status,
        Station: exp.station?.name || '',
        RequestedBy: exp.requester.fullName,
        DisbursementMethod: exp.disbursementMethod || '',
        RejectionReason: exp.rejectionReason || '',
        CreatedAt: new Date(exp.createdAt).toISOString(),
      }));

      const csv = toCsv(headers, rows);
      sendCsv(res, `expenses_export_${new Date().toISOString().split('T')[0]}.csv`, csv);
    } catch (error) {
      logger.error(`Expense export error: ${error}`);
      sendError(res, {
        code: 'EXPORT_ERROR',
        message: 'Failed to export expenses',
        statusCode: 500,
      });
    }
  },
);

export default router;
