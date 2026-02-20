import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess, sendError, sendPaginated, getHeader, getParam } from '../lib/response';
import { validate, validateQuery } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  UserRole,
  createExpenseSchema,
  approveExpenseSchema,
  rejectExpenseSchema,
  disburseExpenseSchema,
  expenseListFiltersSchema,
  EXPENSE_THRESHOLD_FINANCE,
  EXPENSE_THRESHOLD_CFO,
} from '@alcom/shared';
import logger from '../lib/logger';

const router: Router = Router();

// Apply authentication middleware
router.use(requireAuth);

// ─── HELPER FUNCTIONS ───

/**
 * Determine the next approver based on expense amount and current approval state
 * Flow: Line Manager → then based on amount:
 *   <500k: goes to Finance for final check
 *   500k-5M: goes to Finance Director
 *   >5M: goes to CFO, then CEO
 */
function getNextApproverRoles(amount: number, currentStatus: string, approvedRoles: string[]): string[] {
  // If just submitted, needs line manager first
  if (currentStatus === 'SUBMITTED') {
    return ['LINE_MANAGER'];
  }

  // After line manager, route based on amount
  if (currentStatus === 'PENDING_MANAGER') {
    if (amount >= EXPENSE_THRESHOLD_CFO) {
      // >5M: needs CFO then CEO
      if (!approvedRoles.includes(UserRole.CFO)) {
        return [UserRole.CFO];
      }
      return [UserRole.CEO];
    } else if (amount >= EXPENSE_THRESHOLD_FINANCE) {
      // 500k-5M: needs Finance Director
      return [UserRole.FINANCE_DIR];
    } else {
      // <500k: needs Finance check (any finance person)
      return [UserRole.FINANCE_DIR, UserRole.CFO];
    }
  }

  // If pending finance (for high amounts)
  if (currentStatus === 'PENDING_FINANCE') {
    if (amount >= EXPENSE_THRESHOLD_CFO) {
      if (!approvedRoles.includes(UserRole.CFO)) {
        return [UserRole.CFO];
      }
      if (!approvedRoles.includes(UserRole.CEO)) {
        return [UserRole.CEO];
      }
    }
  }

  return [];
}

/**
 * Check if user can approve the expense (either line manager or appropriate finance role)
 */
function canUserApproveExpense(
  user: { userId: string; role: string },
  expense: any,
  approvedRoles: string[],
  isLineManager: boolean,
): boolean {
  const amount = Number(expense.amount);
  const status = expense.status;

  // SUPER_ADMIN can always approve
  if (user.role === UserRole.SUPER_ADMIN) {
    return true;
  }

  // If expense is SUBMITTED, only line manager can approve
  if (status === 'SUBMITTED') {
    return isLineManager;
  }

  // If PENDING_MANAGER (line manager approved), route to finance based on amount
  if (status === 'PENDING_MANAGER') {
    const requiredRoles = getNextApproverRoles(amount, status, approvedRoles);

    // For high amounts requiring CFO+CEO
    if (amount >= EXPENSE_THRESHOLD_CFO) {
      if (!approvedRoles.includes(UserRole.CFO) && user.role === UserRole.CFO) {
        return true;
      }
      if (approvedRoles.includes(UserRole.CFO) && user.role === UserRole.CEO) {
        return true;
      }
      return false;
    }

    return requiredRoles.includes(user.role);
  }

  // If PENDING_FINANCE, check remaining approvals needed
  if (status === 'PENDING_FINANCE') {
    if (amount >= EXPENSE_THRESHOLD_CFO) {
      if (!approvedRoles.includes(UserRole.CFO) && user.role === UserRole.CFO) {
        return true;
      }
      if (approvedRoles.includes(UserRole.CFO) && !approvedRoles.includes(UserRole.CEO) && user.role === UserRole.CEO) {
        return true;
      }
    }
    return [UserRole.FINANCE_DIR, UserRole.CFO].includes(user.role as any);
  }

  return false;
}

/**
 * Check if all required approvals are complete based on amount
 */
function isFullyApproved(amount: number, hasLineManagerApproval: boolean, financeApprovedRoles: string[]): boolean {
  if (!hasLineManagerApproval) return false;

  if (amount >= EXPENSE_THRESHOLD_CFO) {
    // High amounts need CFO + CEO (or SUPER_ADMIN can substitute)
    const hasCFO = financeApprovedRoles.includes(UserRole.CFO) || financeApprovedRoles.includes(UserRole.SUPER_ADMIN);
    const hasCEO = financeApprovedRoles.includes(UserRole.CEO) || financeApprovedRoles.includes(UserRole.SUPER_ADMIN);
    return hasCFO && hasCEO;
  }

  // Any finance approval is sufficient for amounts < 5M (SUPER_ADMIN counts as finance)
  return financeApprovedRoles.some((r) => [UserRole.FINANCE_DIR, UserRole.CFO, UserRole.CEO, UserRole.SUPER_ADMIN].includes(r as any));
}

/**
 * Get the effective approver considering delegation
 */
async function getEffectiveApproverId(primaryUserId: string): Promise<string> {
  const now = new Date();
  const user = await prisma.user.findUnique({
    where: { id: primaryUserId },
    select: {
      id: true,
      backupApproverId: true,
      delegationStart: true,
      delegationEnd: true,
    },
  });

  if (!user) return primaryUserId;

  // Check if delegation is active
  if (
    user.backupApproverId &&
    user.delegationStart &&
    user.delegationEnd &&
    now >= user.delegationStart &&
    now <= user.delegationEnd
  ) {
    return user.backupApproverId;
  }

  return primaryUserId;
}

// ═══════════════════════════════════════════════════════════════════
// GET /expenses — List all expenses with filters
// ═══════════════════════════════════════════════════════════════════
router.get(
  '/',
  requireRole(
    UserRole.FINANCE_DIR,
    UserRole.CFO,
    UserRole.CEO,
    UserRole.SUPER_ADMIN,
    UserRole.STATION_MANAGER,
    UserRole.CHEF_PISTE,
  ),
  validateQuery(expenseListFiltersSchema),
  async (req: Request, res: Response) => {
    try {
      const query = req.query as Record<string, any>;
      const page = Number(query.page) || 1;
      const limit = Number(query.limit) || 20;

      const where: Record<string, unknown> = {};

      // Station-level users can only see their station's expenses
      const userRole = req.user!.role;
      if ([UserRole.STATION_MANAGER, UserRole.CHEF_PISTE].includes(userRole as any)) {
        if (req.user!.stationId) {
          where.stationId = req.user!.stationId;
        } else {
          where.requesterId = req.user!.userId;
        }
      }

      if (query.status) where.status = query.status;
      if (query.category) where.category = query.category;
      if (query.stationId && !where.stationId) where.stationId = query.stationId;
      if (query.startDate || query.endDate) {
        where.createdAt = {} as Record<string, unknown>;
        if (query.startDate) (where.createdAt as Record<string, unknown>).gte = new Date(query.startDate);
        if (query.endDate) (where.createdAt as Record<string, unknown>).lte = new Date(query.endDate);
      }

      const [expenses, total] = await Promise.all([
        prisma.expense.findMany({
          where: where as any,
          include: {
            requester: { select: { id: true, fullName: true, email: true } },
            station: { select: { id: true, name: true, code: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.expense.count({ where: where as any }),
      ]);

      const formatted = expenses.map((exp: any) => ({
        ...exp,
        amount: Number(exp.amount),
      }));

      sendPaginated(res, formatted, total, page, limit);
    } catch (error) {
      logger.error(`Error listing expenses: ${error}`);
      sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to fetch expenses', statusCode: 500 });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// GET /expenses/pending — Get expenses pending my approval
// ═══════════════════════════════════════════════════════════════════
router.get('/pending', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    // Fetch expenses that might need this user's approval
    const pendingExpenses = await prisma.expense.findMany({
      where: {
        status: { in: ['SUBMITTED', 'PENDING_MANAGER', 'PENDING_FINANCE'] },
      },
      include: {
        requester: {
          select: { id: true, fullName: true, lineManagerId: true },
        },
        station: { select: { id: true, name: true, code: true } },
        approvals: { select: { role: true, action: true, userId: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const canApproveList: any[] = [];

    for (const exp of pendingExpenses) {
      const approvedRoles = (exp.approvals || [])
        .filter((a: any) => a.action === 'APPROVE')
        .map((a: any) => a.role);

      // Check if user is line manager (considering delegation)
      let isLineManager = false;
      if (exp.requester.lineManagerId) {
        const effectiveManagerId = await getEffectiveApproverId(exp.requester.lineManagerId);
        isLineManager = effectiveManagerId === userId;
      }

      // Check if user already approved
      const userAlreadyApproved = (exp.approvals || []).some(
        (a: any) => a.userId === userId && a.action === 'APPROVE',
      );

      if (!userAlreadyApproved && canUserApproveExpense(req.user as any, exp, approvedRoles, isLineManager)) {
        canApproveList.push({
          id: exp.id,
          title: exp.title,
          amount: Number(exp.amount),
          category: exp.category,
          status: exp.status,
          requester: exp.requester,
          station: exp.station,
          createdAt: exp.createdAt,
        });
      }
    }

    sendSuccess(res, { data: canApproveList });
  } catch (error) {
    logger.error(`Error fetching pending expenses: ${error}`);
    sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to fetch pending expenses', statusCode: 500 });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /expenses/stats/monthly — Monthly spending summary per station
// ═══════════════════════════════════════════════════════════════════
router.get(
  '/stats/monthly',
  requireRole(UserRole.FINANCE_DIR, UserRole.CFO, UserRole.CEO, UserRole.SUPER_ADMIN, UserRole.STATION_MANAGER),
  async (req: Request, res: Response) => {
    try {
      const { year, month, stationId } = req.query;

      const targetYear = year ? Number(year) : new Date().getFullYear();
      const targetMonth = month ? Number(month) : new Date().getMonth() + 1;

      const startDate = new Date(targetYear, targetMonth - 1, 1);
      const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

      const where: any = {
        status: { in: ['APPROVED', 'DISBURSED'] },
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      };

      // Station-level users can only see their station
      if ([UserRole.STATION_MANAGER, UserRole.CHEF_PISTE].includes(req.user!.role as any)) {
        if (req.user!.stationId) {
          where.stationId = req.user!.stationId;
        }
      } else if (stationId) {
        where.stationId = stationId;
      }

      const stats = await prisma.expense.groupBy({
        by: ['stationId', 'category'],
        where,
        _sum: { amount: true },
        _count: { id: true },
      });

      // Fetch station names
      const stationIds = [...new Set(stats.filter((s: { stationId: string | null }) => s.stationId).map((s: { stationId: string | null }) => s.stationId!))];
      const stations = await prisma.station.findMany({
        where: { id: { in: stationIds } },
        select: { id: true, name: true, code: true },
      });
      const stationMap = new Map(stations.map((s: { id: string; name: string; code: string }) => [s.id, s]));

      // Group by station
      const byStation: Record<string, any> = {};
      for (const stat of stats) {
        const stationKey = stat.stationId || 'HQ';
        if (!byStation[stationKey]) {
          byStation[stationKey] = {
            stationId: stat.stationId,
            station: stat.stationId ? stationMap.get(stat.stationId) : { name: 'Head Office', code: 'HQ' },
            totalAmount: 0,
            totalCount: 0,
            byCategory: {},
          };
        }
        byStation[stationKey].totalAmount += Number(stat._sum.amount || 0);
        byStation[stationKey].totalCount += stat._count.id;
        byStation[stationKey].byCategory[stat.category] = {
          amount: Number(stat._sum.amount || 0),
          count: stat._count.id,
        };
      }

      sendSuccess(res, {
        data: {
          year: targetYear,
          month: targetMonth,
          stations: Object.values(byStation),
        },
      });
    } catch (error) {
      logger.error(`Error fetching expense stats: ${error}`);
      sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to fetch expense statistics', statusCode: 500 });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// GET /expenses/:id — Get expense detail with approval chain
// ═══════════════════════════════════════════════════════════════════
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = getParam(req, 'id');

    const expense = await prisma.expense.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, fullName: true, email: true, lineManagerId: true } },
        station: { select: { id: true, name: true, code: true } },
        approvals: {
          include: { user: { select: { id: true, fullName: true } } },
          orderBy: { actedAt: 'asc' },
        },
      },
    });

    if (!expense) {
      sendError(res, { code: 'NOT_FOUND', message: 'Expense not found', statusCode: 404 });
      return;
    }

    const exp = expense as any;
    const amount = Number(exp.amount);
    const approvedRoles = (exp.approvals || []).filter((a: any) => a.action === 'APPROVE').map((a: any) => a.role);
    const hasLineManagerApproval = approvedRoles.includes('LINE_MANAGER');

    // Check if current user can approve
    let isLineManager = false;
    if (exp.requester.lineManagerId) {
      const effectiveManagerId = await getEffectiveApproverId(exp.requester.lineManagerId);
      isLineManager = effectiveManagerId === req.user!.userId;
    }

    const userAlreadyApproved = (exp.approvals || []).some(
      (a: any) => a.userId === req.user!.userId && a.action === 'APPROVE',
    );

    const canApprove =
      !userAlreadyApproved &&
      ['SUBMITTED', 'PENDING_MANAGER', 'PENDING_FINANCE'].includes(exp.status) &&
      canUserApproveExpense(req.user as any, exp, approvedRoles, isLineManager);

    const canDisburse =
      exp.status === 'APPROVED' &&
      [UserRole.CFO, UserRole.FINANCE_DIR, UserRole.SUPER_ADMIN].includes(req.user!.role as any);

    // Determine next approver info
    const nextApproverRoles = getNextApproverRoles(amount, exp.status, approvedRoles);

    sendSuccess(res, {
      data: {
        ...exp,
        amount,
        hasLineManagerApproval,
        approvedRoles,
        nextApproverRoles,
        canApprove,
        canReject: canApprove,
        canDisburse,
      },
    });
  } catch (error) {
    logger.error(`Error fetching expense: ${error}`);
    sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to fetch expense', statusCode: 500 });
  }
});

// ═══════════════════════════════════════════════════════════════════
// POST /expenses — Submit new expense
// ═══════════════════════════════════════════════════════════════════
router.post('/', validate(createExpenseSchema), async (req: Request, res: Response) => {
  try {
    const { title, amount, category, stationId } = req.body;

    // Auto-attach station from user if not provided
    const effectiveStationId = stationId || req.user!.stationId || null;

    // Get requester's line manager
    const requester = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { lineManagerId: true, fullName: true },
    });

    if (!requester) {
      sendError(res, { code: 'USER_NOT_FOUND', message: 'User not found', statusCode: 404 });
      return;
    }

    // Determine initial status: if no line manager, go directly to finance
    let initialStatus: 'SUBMITTED' | 'PENDING_MANAGER' = 'SUBMITTED';
    if (!requester.lineManagerId) {
      // No line manager assigned, skip to finance approval
      initialStatus = 'PENDING_MANAGER';
    }

    const expense = await prisma.expense.create({
      data: {
        title,
        amount,
        category,
        stationId: effectiveStationId,
        requesterId: req.user!.userId,
        status: initialStatus,
      },
      include: {
        requester: { select: { id: true, fullName: true } },
        station: { select: { id: true, name: true, code: true } },
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: 'CREATE_EXPENSE',
        entityType: 'EXPENSE',
        entityId: expense.id,
        changes: { title, amount, category, stationId: effectiveStationId },
      },
    });

    sendSuccess(res, { data: { ...expense, amount: Number(expense.amount) }, statusCode: 201 });
  } catch (error) {
    logger.error(`Error creating expense: ${error}`);
    sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to create expense', statusCode: 500 });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PUT /expenses/:id/approve — Approve expense
// ═══════════════════════════════════════════════════════════════════
router.put('/:id/approve', validate(approveExpenseSchema), async (req: Request, res: Response) => {
  try {
    const id = getParam(req, 'id');
    const { comment } = req.body;
    const idempotencyKey = getHeader(req, 'idempotency-key');

    // Idempotency check
    if (idempotencyKey) {
      const existing = await prisma.approvalStep.findFirst({
        where: { expenseId: id, userId: req.user!.userId, action: 'APPROVE' },
      });
      if (existing) {
        const expense = await prisma.expense.findUnique({ where: { id } });
        sendSuccess(res, { data: expense });
        return;
      }
    }

    const expense = await prisma.expense.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, fullName: true, lineManagerId: true } },
        approvals: { where: { action: 'APPROVE' }, select: { role: true, userId: true } },
      },
    });

    if (!expense) {
      sendError(res, { code: 'NOT_FOUND', message: 'Expense not found', statusCode: 404 });
      return;
    }

    if (!['SUBMITTED', 'PENDING_MANAGER', 'PENDING_FINANCE'].includes(expense.status)) {
      sendError(res, {
        code: 'INVALID_STATUS',
        message: `Cannot approve expense with status ${expense.status}`,
        statusCode: 400,
      });
      return;
    }

    const exp = expense as any;
    const amount = Number(exp.amount);
    const approvedRoles = (exp.approvals || []).map((a: any) => a.role);

    // Check if user already approved
    const userAlreadyApproved = (exp.approvals || []).some((a: any) => a.userId === req.user!.userId);
    if (userAlreadyApproved) {
      sendError(res, { code: 'ALREADY_APPROVED', message: 'You have already approved this expense', statusCode: 400 });
      return;
    }

    // Check if user is line manager (considering delegation)
    let isLineManager = false;
    if (exp.requester.lineManagerId) {
      const effectiveManagerId = await getEffectiveApproverId(exp.requester.lineManagerId);
      isLineManager = effectiveManagerId === req.user!.userId;
    }

    if (!canUserApproveExpense(req.user as any, exp, approvedRoles, isLineManager)) {
      sendError(res, { code: 'FORBIDDEN', message: 'You cannot approve this expense', statusCode: 403 });
      return;
    }

    // Determine the role to record for this approval
    let approvalRole: string;
    if (expense.status === 'SUBMITTED' && isLineManager) {
      approvalRole = 'LINE_MANAGER';
    } else {
      approvalRole = req.user!.role;
    }

    // Determine new status and if fully approved
    const newApprovedRoles = [...approvedRoles, approvalRole];
    const hasLineManagerApproval = newApprovedRoles.includes('LINE_MANAGER') || expense.status !== 'SUBMITTED';
    const financeApprovedRoles = newApprovedRoles.filter((r) =>
      [UserRole.FINANCE_DIR, UserRole.CFO, UserRole.CEO, UserRole.SUPER_ADMIN].includes(r as any),
    );

    let newStatus: string;
    if (isFullyApproved(amount, hasLineManagerApproval, financeApprovedRoles)) {
      newStatus = 'APPROVED';
    } else if (expense.status === 'SUBMITTED') {
      // Line manager just approved, move to finance
      newStatus = 'PENDING_MANAGER';
    } else if (amount >= EXPENSE_THRESHOLD_CFO && !financeApprovedRoles.includes(UserRole.CEO)) {
      // High amount, still waiting for CEO after CFO
      newStatus = 'PENDING_FINANCE';
    } else {
      newStatus = 'PENDING_FINANCE';
    }

    const result = await prisma.$transaction(async (tx: typeof prisma) => {
      await tx.approvalStep.create({
        data: {
          entityType: 'EXPENSE',
          expenseId: id,
          role: approvalRole,
          userId: req.user!.userId,
          action: 'APPROVE',
          comment: comment || null,
        },
      });

      return tx.expense.update({
        where: { id },
        data: { status: newStatus as any },
        include: {
          requester: { select: { id: true, fullName: true } },
          station: { select: { id: true, name: true } },
          approvals: {
            include: { user: { select: { id: true, fullName: true } } },
            orderBy: { actedAt: 'asc' },
          },
        },
      });
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: 'APPROVE_EXPENSE',
        entityType: 'EXPENSE',
        entityId: id,
        changes: { approvalRole, newStatus },
      },
    });

    sendSuccess(res, {
      data: {
        ...(result as any),
        amount,
        message: newStatus === 'APPROVED' ? 'Expense fully approved' : 'Approval recorded. Waiting for additional approvals.',
      },
    });
  } catch (error) {
    logger.error(`Error approving expense: ${error}`);
    sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to approve expense', statusCode: 500 });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PUT /expenses/:id/reject — Reject expense
// ═══════════════════════════════════════════════════════════════════
router.put('/:id/reject', validate(rejectExpenseSchema), async (req: Request, res: Response) => {
  try {
    const id = getParam(req, 'id');
    const { reason } = req.body;
    const idempotencyKey = getHeader(req, 'idempotency-key');

    // Idempotency check
    if (idempotencyKey) {
      const existing = await prisma.approvalStep.findFirst({
        where: { expenseId: id, userId: req.user!.userId, action: 'REJECT' },
      });
      if (existing) {
        const expense = await prisma.expense.findUnique({ where: { id } });
        sendSuccess(res, { data: expense });
        return;
      }
    }

    const expense = await prisma.expense.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, fullName: true, lineManagerId: true } },
        approvals: { where: { action: 'APPROVE' }, select: { role: true } },
      },
    });

    if (!expense) {
      sendError(res, { code: 'NOT_FOUND', message: 'Expense not found', statusCode: 404 });
      return;
    }

    if (!['SUBMITTED', 'PENDING_MANAGER', 'PENDING_FINANCE'].includes(expense.status)) {
      sendError(res, {
        code: 'INVALID_STATUS',
        message: `Cannot reject expense with status ${expense.status}`,
        statusCode: 400,
      });
      return;
    }

    const exp = expense as any;
    const approvedRoles = (exp.approvals || []).map((a: any) => a.role);

    // Check if user can reject (same logic as approve)
    let isLineManager = false;
    if (exp.requester.lineManagerId) {
      const effectiveManagerId = await getEffectiveApproverId(exp.requester.lineManagerId);
      isLineManager = effectiveManagerId === req.user!.userId;
    }

    if (!canUserApproveExpense(req.user as any, exp, approvedRoles, isLineManager)) {
      sendError(res, { code: 'FORBIDDEN', message: 'You cannot reject this expense', statusCode: 403 });
      return;
    }

    // Determine the role to record
    let rejectionRole: string;
    if (expense.status === 'SUBMITTED' && isLineManager) {
      rejectionRole = 'LINE_MANAGER';
    } else {
      rejectionRole = req.user!.role;
    }

    const result = await prisma.$transaction(async (tx: typeof prisma) => {
      await tx.approvalStep.create({
        data: {
          entityType: 'EXPENSE',
          expenseId: id,
          role: rejectionRole,
          userId: req.user!.userId,
          action: 'REJECT',
          comment: reason,
        },
      });

      return tx.expense.update({
        where: { id },
        data: { status: 'REJECTED', rejectionReason: reason },
        include: {
          requester: { select: { id: true, fullName: true } },
          station: { select: { id: true, name: true } },
          approvals: {
            include: { user: { select: { id: true, fullName: true } } },
            orderBy: { actedAt: 'asc' },
          },
        },
      });
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: 'REJECT_EXPENSE',
        entityType: 'EXPENSE',
        entityId: id,
        changes: { rejectionRole, reason },
      },
    });

    sendSuccess(res, { data: { ...(result as any), amount: Number(expense.amount) } });
  } catch (error) {
    logger.error(`Error rejecting expense: ${error}`);
    sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to reject expense', statusCode: 500 });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PUT /expenses/:id/disburse — Disburse approved expense
// ═══════════════════════════════════════════════════════════════════
router.put(
  '/:id/disburse',
  requireRole(UserRole.CFO, UserRole.FINANCE_DIR, UserRole.SUPER_ADMIN),
  validate(disburseExpenseSchema),
  async (req: Request, res: Response) => {
    try {
      const id = getParam(req, 'id');
      const { method } = req.body;
      const idempotencyKey = getHeader(req, 'idempotency-key');

      // Idempotency check
      if (idempotencyKey) {
        const expense = await prisma.expense.findUnique({ where: { id } });
        if (expense?.status === 'DISBURSED') {
          sendSuccess(res, { data: expense });
          return;
        }
      }

      const expense = await prisma.expense.findUnique({
        where: { id },
        include: {
          requester: { select: { id: true, fullName: true } },
          station: { select: { id: true, name: true } },
        },
      });

      if (!expense) {
        sendError(res, { code: 'NOT_FOUND', message: 'Expense not found', statusCode: 404 });
        return;
      }

      if (expense.status !== 'APPROVED') {
        sendError(res, {
          code: 'INVALID_STATUS',
          message: 'Only approved expenses can be disbursed',
          statusCode: 400,
        });
        return;
      }

      const updated = await prisma.expense.update({
        where: { id },
        data: {
          status: 'DISBURSED',
          disbursementMethod: method,
          disbursedAt: new Date(),
        },
        include: {
          requester: { select: { id: true, fullName: true } },
          station: { select: { id: true, name: true } },
        },
      });

      // Log audit
      await prisma.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: 'DISBURSE_EXPENSE',
          entityType: 'EXPENSE',
          entityId: id,
          changes: { method },
        },
      });

      sendSuccess(res, { data: { ...updated, amount: Number(updated.amount) } });
    } catch (error) {
      logger.error(`Error disbursing expense: ${error}`);
      sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to disburse expense', statusCode: 500 });
    }
  },
);

export default router;
