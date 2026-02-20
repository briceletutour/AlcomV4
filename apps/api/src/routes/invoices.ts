import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess, sendError, sendPaginated, getHeader, getParam } from '../lib/response';
import { validate, validateQuery } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  UserRole,
  createInvoiceSchema,
  approveInvoiceSchema,
  rejectInvoiceSchema,
  payInvoiceSchema,
  invoiceListFiltersSchema,
  INVOICE_THRESHOLD_CFO,
} from '@alcom/shared';
import logger from '../lib/logger';
import { enqueueEmail } from '../jobs';

const router: Router = Router();

// Apply authentication middleware
router.use(requireAuth);

// Helper: Determine required approvers based on amount
function getRequiredApprovers(amount: number): string[] {
  if (amount >= INVOICE_THRESHOLD_CFO) {
    return [UserRole.CFO, UserRole.CEO];
  }
  return [UserRole.FINANCE_DIR];
}

// Helper: Check if user can approve invoice based on amount
function canUserApprove(userRole: string, amount: number, existingApprovals: string[]): boolean {
  const requiredApprovers = getRequiredApprovers(amount);

  if (userRole !== UserRole.SUPER_ADMIN && !requiredApprovers.includes(userRole)) {
    return false;
  }

  if (amount >= INVOICE_THRESHOLD_CFO) {
    if (userRole === UserRole.CEO && !existingApprovals.includes(UserRole.CFO)) {
      return false;
    }
  }

  if (existingApprovals.includes(userRole)) {
    return false;
  }

  return true;
}

// Helper: Check if all required approvals are complete
function isFullyApproved(amount: number, approvals: string[]): boolean {
  const required = getRequiredApprovers(amount);
  return required.every((r) => approvals.includes(r));
}

// ═══════════════════════════════════════════════════════════════════
// GET /invoices — List all invoices with filters
// ═══════════════════════════════════════════════════════════════════
router.get(
  '/',
  requireRole(UserRole.FINANCE_DIR, UserRole.CFO, UserRole.CEO, UserRole.SUPER_ADMIN, UserRole.LOGISTICS, UserRole.DCO),
  validateQuery(invoiceListFiltersSchema),
  async (req: Request, res: Response) => {
    try {
      const query = req.query as Record<string, any>;
      const page = Number(query.page) || 1;
      const limit = Number(query.limit) || 20;

      const where: Record<string, unknown> = {};
      if (query.status) where.status = query.status;
      if (query.supplierId) where.supplierId = query.supplierId;
      if (query.startDate || query.endDate) {
        where.createdAt = {} as Record<string, unknown>;
        if (query.startDate) (where.createdAt as Record<string, unknown>).gte = new Date(query.startDate);
        if (query.endDate) (where.createdAt as Record<string, unknown>).lte = new Date(query.endDate);
      }

      const [invoices, total] = await Promise.all([
        prisma.invoice.findMany({
          where: where as any,
          include: {
            supplier: { select: { id: true, name: true, taxId: true } },
            submittedBy: { select: { id: true, fullName: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.invoice.count({ where: where as any }),
      ]);

      const formatted = invoices.map((inv: any) => ({
        ...inv,
        amount: Number(inv.amount),
      }));

      sendPaginated(res, formatted, total, page, limit);
    } catch (error) {
      logger.error(`Error listing invoices: ${error}`);
      sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to fetch invoices', statusCode: 500 });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// GET /invoices/pending — Get invoices pending my approval
// ═══════════════════════════════════════════════════════════════════
router.get(
  '/pending',
  requireRole(UserRole.FINANCE_DIR, UserRole.CFO, UserRole.CEO, UserRole.SUPER_ADMIN),
  async (req: Request, res: Response) => {
    try {
      const userRole = req.user!.role;

      const pendingInvoices = await prisma.invoice.findMany({
        where: { status: 'PENDING_APPROVAL' },
        include: {
          supplier: { select: { id: true, name: true } },
          approvals: { select: { role: true, action: true } },
        },
        orderBy: { createdAt: 'asc' },
      });

      const canApproveList = pendingInvoices.filter((inv: any) => {
        const approved = (inv.approvals || [])
          .filter((a: any) => a.action === 'APPROVE')
          .map((a: any) => a.role);
        return canUserApprove(userRole, Number(inv.amount), approved);
      });

      const formatted = canApproveList.map((inv: any) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amount: Number(inv.amount),
        status: inv.status,
        dueDate: inv.dueDate,
        supplier: inv.supplier,
        createdAt: inv.createdAt,
      }));

      sendSuccess(res, { data: formatted });
    } catch (error) {
      logger.error(`Error fetching pending invoices: ${error}`);
      sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to fetch pending invoices', statusCode: 500 });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// GET /invoices/:id — Get invoice detail with approval chain
// ═══════════════════════════════════════════════════════════════════
router.get(
  '/:id',
  requireRole(UserRole.FINANCE_DIR, UserRole.CFO, UserRole.CEO, UserRole.SUPER_ADMIN, UserRole.LOGISTICS, UserRole.DCO),
  async (req: Request, res: Response) => {
    try {
      const id = getParam(req, 'id');

      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: {
          supplier: true,
          submittedBy: { select: { id: true, fullName: true, email: true } },
          approvedBy: { select: { id: true, fullName: true } },
          approvals: {
            include: { user: { select: { id: true, fullName: true } } },
            orderBy: { actedAt: 'asc' },
          },
        },
      });

      if (!invoice) {
        sendError(res, { code: 'NOT_FOUND', message: 'Invoice not found', statusCode: 404 });
        return;
      }

      const inv = invoice as any;
      const amount = Number(inv.amount);
      const requiredApprovers = getRequiredApprovers(amount);
      const existingApprovals = (inv.approvals || [])
        .filter((a: any) => a.action === 'APPROVE')
        .map((a: any) => a.role);
      const canApprove = canUserApprove(req.user!.role, amount, existingApprovals);

      sendSuccess(res, {
        data: {
          ...inv,
          amount,
          requiredApprovers,
          existingApprovals,
          canApprove: canApprove && inv.status === 'PENDING_APPROVAL',
          canReject: canApprove && inv.status === 'PENDING_APPROVAL',
          canPay:
            inv.status === 'APPROVED' &&
            [UserRole.CFO, UserRole.FINANCE_DIR, UserRole.SUPER_ADMIN].includes(req.user!.role as any),
        },
      });
    } catch (error) {
      logger.error(`Error fetching invoice: ${error}`);
      sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to fetch invoice', statusCode: 500 });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// POST /invoices — Submit new invoice
// ═══════════════════════════════════════════════════════════════════
router.post(
  '/',
  requireRole(UserRole.FINANCE_DIR, UserRole.CFO, UserRole.SUPER_ADMIN, UserRole.LOGISTICS, UserRole.DCO),
  validate(createInvoiceSchema),
  async (req: Request, res: Response) => {
    try {
      const { supplierId, invoiceNumber, amount, dueDate, fileUrl } = req.body;
      const idempotencyKey = getHeader(req, 'idempotency-key');

      if (idempotencyKey) {
        const existing = await prisma.invoice.findUnique({ where: { idempotencyKey } });
        if (existing) {
          sendSuccess(res, { data: existing });
          return;
        }
      }

      const supplier = await prisma.supplier.findFirst({
        where: { id: supplierId, deletedAt: null, isActive: true },
      });

      if (!supplier) {
        sendError(res, { code: 'SUPPLIER_NOT_FOUND', message: 'Supplier not found or inactive', statusCode: 404 });
        return;
      }

      const duplicate = await prisma.invoice.findFirst({
        where: { supplierId, invoiceNumber },
      });

      const invoice = await prisma.invoice.create({
        data: {
          supplierId,
          invoiceNumber,
          amount,
          dueDate: new Date(dueDate),
          fileUrl,
          status: 'PENDING_APPROVAL',
          submittedById: req.user!.userId,
          idempotencyKey: idempotencyKey || null,
        },
        include: { supplier: { select: { id: true, name: true } } },
      });

      const response: Record<string, unknown> = { ...invoice, amount: Number(invoice.amount) };
      if (duplicate) {
        response.warning = `Duplicate invoice number detected: Invoice #${invoiceNumber} already exists for this supplier`;
      }

      sendSuccess(res, { data: response, statusCode: 201 });
    } catch (error) {
      logger.error(`Error creating invoice: ${error}`);
      sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to create invoice', statusCode: 500 });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// PUT /invoices/:id/approve — Approve invoice
// ═══════════════════════════════════════════════════════════════════
router.put(
  '/:id/approve',
  requireRole(UserRole.FINANCE_DIR, UserRole.CFO, UserRole.CEO, UserRole.SUPER_ADMIN),
  validate(approveInvoiceSchema),
  async (req: Request, res: Response) => {
    try {
      const id = getParam(req, 'id');
      const { comment } = req.body;
      const idempotencyKey = getHeader(req, 'idempotency-key');

      if (idempotencyKey) {
        const existing = await prisma.approvalStep.findFirst({
          where: { invoiceId: id, userId: req.user!.userId, action: 'APPROVE' },
        });
        if (existing) {
          const invoice = await prisma.invoice.findUnique({ where: { id } });
          sendSuccess(res, { data: invoice });
          return;
        }
      }

      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: { approvals: { where: { action: 'APPROVE' }, select: { role: true } } },
      });

      if (!invoice) {
        sendError(res, { code: 'NOT_FOUND', message: 'Invoice not found', statusCode: 404 });
        return;
      }

      if (invoice.status !== 'PENDING_APPROVAL') {
        sendError(res, { code: 'INVALID_STATUS', message: `Cannot approve invoice with status ${invoice.status}`, statusCode: 400 });
        return;
      }

      const inv = invoice as any;
      const amount = Number(inv.amount);
      const existingApprovals = (inv.approvals || []).map((a: any) => a.role);

      if (!canUserApprove(req.user!.role, amount, existingApprovals)) {
        sendError(res, { code: 'FORBIDDEN', message: 'You cannot approve this invoice', statusCode: 403 });
        return;
      }

      const newApprovals = [...existingApprovals, req.user!.role];
      const fullyApproved = isFullyApproved(amount, newApprovals);

      const result = await prisma.$transaction(async (tx) => {
        await tx.approvalStep.create({
          data: {
            entityType: 'INVOICE',
            invoiceId: id,
            role: req.user!.role,
            userId: req.user!.userId,
            action: 'APPROVE',
            comment: comment || null,
          },
        });

        if (fullyApproved) {
          return tx.invoice.update({
            where: { id },
            data: { status: 'APPROVED', approvedById: req.user!.userId },
            include: {
              supplier: { select: { id: true, name: true } },
              submittedBy: { select: { id: true, fullName: true, email: true } },
              approvals: { orderBy: { actedAt: 'asc' } },
            },
          });
        }

        return tx.invoice.findUnique({
          where: { id },
          include: {
            supplier: { select: { id: true, name: true } },
            submittedBy: { select: { id: true, fullName: true, email: true } },
            approvals: { orderBy: { actedAt: 'asc' } },
          },
        });
      });

      if (fullyApproved && result) {
        await prisma.notification.create({
          data: {
            userId: result.submittedBy.id,
            type: 'INVOICE_APPROVED',
            title: 'Facture approuvée',
            message: `Votre facture #${result.invoiceNumber} a été approuvée.`,
            link: `/admin/finance/invoices/${result.id}`,
          },
        });

        await enqueueEmail({
          to: result.submittedBy.email,
          subject: `Facture #${result.invoiceNumber} approuvée`,
          template: 'invoice-approval',
          templateData: {
            name: result.submittedBy.fullName,
            invoiceNumber: result.invoiceNumber,
            status: 'APPROUVÉE',
            amount,
            link: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/finance/invoices/${result.id}`,
          },
        });
      }

      sendSuccess(res, {
        data: {
          ...result,
          amount,
          message: fullyApproved ? 'Invoice fully approved' : 'Approval recorded. Waiting for additional approvals.',
        },
      });
    } catch (error) {
      logger.error(`Error approving invoice: ${error}`);
      sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to approve invoice', statusCode: 500 });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// PUT /invoices/:id/reject — Reject invoice
// ═══════════════════════════════════════════════════════════════════
router.put(
  '/:id/reject',
  requireRole(UserRole.FINANCE_DIR, UserRole.CFO, UserRole.CEO, UserRole.SUPER_ADMIN),
  validate(rejectInvoiceSchema),
  async (req: Request, res: Response) => {
    try {
      const id = getParam(req, 'id');
      const { reason } = req.body;
      const idempotencyKey = getHeader(req, 'idempotency-key');

      if (idempotencyKey) {
        const existing = await prisma.approvalStep.findFirst({
          where: { invoiceId: id, userId: req.user!.userId, action: 'REJECT' },
        });
        if (existing) {
          const invoice = await prisma.invoice.findUnique({ where: { id } });
          sendSuccess(res, { data: invoice });
          return;
        }
      }

      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: { approvals: { where: { action: 'APPROVE' }, select: { role: true } } },
      });

      if (!invoice) {
        sendError(res, { code: 'NOT_FOUND', message: 'Invoice not found', statusCode: 404 });
        return;
      }

      if (invoice.status !== 'PENDING_APPROVAL') {
        sendError(res, { code: 'INVALID_STATUS', message: `Cannot reject invoice with status ${invoice.status}`, statusCode: 400 });
        return;
      }

      const inv = invoice as any;
      const amount = Number(inv.amount);
      const existingApprovals = (inv.approvals || []).map((a: any) => a.role);

      if (!canUserApprove(req.user!.role, amount, existingApprovals)) {
        sendError(res, { code: 'FORBIDDEN', message: 'You cannot reject this invoice', statusCode: 403 });
        return;
      }

      const result = await prisma.$transaction(async (tx) => {
        await tx.approvalStep.create({
          data: {
            entityType: 'INVOICE',
            invoiceId: id,
            role: req.user!.role,
            userId: req.user!.userId,
            action: 'REJECT',
            comment: reason,
          },
        });

        return tx.invoice.update({
          where: { id },
          data: { status: 'REJECTED', rejectionReason: reason },
          include: {
            supplier: { select: { id: true, name: true } },
            submittedBy: { select: { id: true, fullName: true, email: true } },
            approvals: { orderBy: { actedAt: 'asc' } },
          },
        });
      });

      await prisma.notification.create({
        data: {
          userId: result.submittedBy.id,
          type: 'INVOICE_REJECTED',
          title: 'Facture rejetée',
          message: `Votre facture #${result.invoiceNumber} a été rejetée.`,
          link: `/admin/finance/invoices/${result.id}`,
        },
      });

      await enqueueEmail({
        to: result.submittedBy.email,
        subject: `Facture #${result.invoiceNumber} rejetée`,
        template: 'invoice-approval',
        templateData: {
          name: result.submittedBy.fullName,
          invoiceNumber: result.invoiceNumber,
          status: 'REJETÉE',
          amount,
          reason,
          link: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/finance/invoices/${result.id}`,
        },
      });

      sendSuccess(res, { data: { ...result, amount } });
    } catch (error) {
      logger.error(`Error rejecting invoice: ${error}`);
      sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to reject invoice', statusCode: 500 });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// PUT /invoices/:id/pay — Mark invoice as paid (Treasurer)
// ═══════════════════════════════════════════════════════════════════
router.put(
  '/:id/pay',
  requireRole(UserRole.CFO, UserRole.FINANCE_DIR, UserRole.SUPER_ADMIN),
  validate(payInvoiceSchema),
  async (req: Request, res: Response) => {
    try {
      const id = getParam(req, 'id');
      const { proofOfPaymentUrl } = req.body;
      const idempotencyKey = getHeader(req, 'idempotency-key');

      if (idempotencyKey) {
        const invoice = await prisma.invoice.findUnique({ where: { id } });
        if (invoice?.status === 'PAID') {
          sendSuccess(res, { data: invoice });
          return;
        }
      }

      const invoice = await prisma.invoice.findUnique({ where: { id } });

      if (!invoice) {
        sendError(res, { code: 'NOT_FOUND', message: 'Invoice not found', statusCode: 404 });
        return;
      }

      if (invoice.status !== 'APPROVED') {
        sendError(res, { code: 'INVALID_STATUS', message: 'Only approved invoices can be marked as paid', statusCode: 400 });
        return;
      }

      if (!proofOfPaymentUrl) {
        sendError(res, { code: 'PROOF_REQUIRED', message: 'Proof of payment file is required', statusCode: 400 });
        return;
      }

      const updated = await prisma.invoice.update({
        where: { id },
        data: { status: 'PAID', proofOfPaymentUrl },
        include: {
          supplier: { select: { id: true, name: true } },
          submittedBy: { select: { id: true, fullName: true, email: true } },
        },
      });

      await prisma.notification.create({
        data: {
          userId: updated.submittedBy.id,
          type: 'INVOICE_PAID',
          title: 'Facture payée',
          message: `Votre facture #${updated.invoiceNumber} a été marquée comme payée.`,
          link: `/admin/finance/invoices/${updated.id}`,
        },
      });

      await enqueueEmail({
        to: updated.submittedBy.email,
        subject: `Facture #${updated.invoiceNumber} payée`,
        template: 'invoice-approval',
        templateData: {
          name: updated.submittedBy.fullName,
          invoiceNumber: updated.invoiceNumber,
          status: 'PAYÉE',
          amount: Number(updated.amount),
          link: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/finance/invoices/${updated.id}`,
        },
      });

      sendSuccess(res, { data: { ...updated, amount: Number(updated.amount) } });
    } catch (error) {
      logger.error(`Error marking invoice as paid: ${error}`);
      sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to update invoice', statusCode: 500 });
    }
  },
);

export default router;
