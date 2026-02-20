import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess, sendError, sendPaginated, getHeader, getParam } from '../lib/response';
import { validate, validateQuery } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  UserRole,
  createSupplierSchema,
  updateSupplierSchema,
  supplierListFiltersSchema,
} from '@alcom/shared';
import logger from '../lib/logger';

const router: Router = Router();

// Apply auth middleware
router.use(requireAuth);

// ═══════════════════════════════════════════════════════════════════
// GET /suppliers — Paginated list with search & filters
// ═══════════════════════════════════════════════════════════════════
router.get(
  '/',
  requireRole(UserRole.FINANCE_DIR, UserRole.CFO, UserRole.CEO, UserRole.SUPER_ADMIN, UserRole.LOGISTICS, UserRole.DCO),
  validateQuery(supplierListFiltersSchema),
  async (req: Request, res: Response) => {
    try {
      const {
        search,
        category,
        isActive,
        page = 1,
        limit = 20,
      } = req.query as Record<string, any>;

      const where: Record<string, unknown> = { deletedAt: null };

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { taxId: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (category) {
        where.category = category;
      }

      if (isActive !== undefined) {
        where.isActive = isActive === 'true' || isActive === true;
      }

      const [suppliers, total] = await Promise.all([
        prisma.supplier.findMany({
          where: where as any,
          include: {
            _count: { select: { invoices: true } },
            invoices: {
              where: { status: 'PENDING_APPROVAL' },
              select: { id: true },
            },
          },
          orderBy: { name: 'asc' },
          skip: (Number(page) - 1) * Number(limit),
          take: Number(limit),
        }),
        prisma.supplier.count({ where: where as any }),
      ]);

      const formatted = suppliers.map((sup: any) => ({
        id: sup.id,
        name: sup.name,
        taxId: sup.taxId,
        category: sup.category,
        email: sup.email,
        phone: sup.phone,
        address: sup.address,
        isActive: sup.isActive,
        invoiceCount: sup._count?.invoices ?? 0,
        pendingInvoiceCount: sup.invoices?.length ?? 0,
        createdAt: sup.createdAt,
        updatedAt: sup.updatedAt,
      }));

      sendPaginated(res, formatted, total, Number(page), Number(limit));
    } catch (error) {
      logger.error(`Error listing suppliers: ${error}`);
      sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to fetch suppliers', statusCode: 500 });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// GET /suppliers/:id — Single supplier with recent invoices
// ═══════════════════════════════════════════════════════════════════
router.get(
  '/:id',
  requireRole(UserRole.FINANCE_DIR, UserRole.CFO, UserRole.CEO, UserRole.SUPER_ADMIN, UserRole.LOGISTICS, UserRole.DCO),
  async (req: Request, res: Response) => {
    try {
      const id = getParam(req, 'id');

      const supplier = await prisma.supplier.findFirst({
        where: { id, deletedAt: null },
        include: {
          invoices: {
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: {
              id: true,
              invoiceNumber: true,
              amount: true,
              status: true,
              dueDate: true,
              createdAt: true,
            },
          },
        },
      });

      if (!supplier) {
        sendError(res, { code: 'NOT_FOUND', message: 'Supplier not found', statusCode: 404 });
        return;
      }

      const sup = supplier as any;
      const recentInvoices = (sup.invoices ?? []).map((inv: any) => ({
        ...inv,
        amount: Number(inv.amount),
      }));

      sendSuccess(res, {
        data: {
          ...supplier,
          invoices: recentInvoices,
          totalInvoices: recentInvoices.length,
        },
      });
    } catch (error) {
      logger.error(`Error fetching supplier: ${error}`);
      sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to fetch supplier', statusCode: 500 });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// POST /suppliers — Create new supplier
// ═══════════════════════════════════════════════════════════════════
router.post(
  '/',
  requireRole(UserRole.FINANCE_DIR, UserRole.CFO, UserRole.SUPER_ADMIN),
  validate(createSupplierSchema),
  async (req: Request, res: Response) => {
    try {
      const { name, taxId, category, email, phone, address } = req.body;
      const idempotencyKey = getHeader(req, 'idempotency-key');

      // Check idempotency
      if (idempotencyKey) {
        const existing = await prisma.supplier.findFirst({
          where: { taxId, deletedAt: null },
        });
        if (existing) {
          sendSuccess(res, { data: existing });
          return;
        }
      }

      // Check for duplicate taxId
      const existing = await prisma.supplier.findFirst({
        where: { taxId, deletedAt: null },
      });

      if (existing) {
        sendError(res, {
          code: 'DUPLICATE_TAX_ID',
          message: `A supplier with NIU ${taxId} already exists`,
          statusCode: 409,
        });
        return;
      }

      const supplier = await prisma.supplier.create({
        data: {
          name,
          taxId,
          category,
          email: email || null,
          phone: phone || null,
          address: address || null,
          isActive: true,
        },
      });

      logger.info(`Supplier created: ${supplier.id} by user ${req.user!.userId}`);
      sendSuccess(res, { data: supplier, statusCode: 201 });
    } catch (error) {
      logger.error(`Error creating supplier: ${error}`);
      sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to create supplier', statusCode: 500 });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// PATCH /suppliers/:id — Update supplier
// ═══════════════════════════════════════════════════════════════════
router.patch(
  '/:id',
  requireRole(UserRole.FINANCE_DIR, UserRole.CFO, UserRole.SUPER_ADMIN),
  validate(updateSupplierSchema),
  async (req: Request, res: Response) => {
    try {
      const id = getParam(req, 'id');
      const updates = req.body;

      const supplier = await prisma.supplier.findFirst({
        where: { id, deletedAt: null },
      });

      if (!supplier) {
        sendError(res, { code: 'NOT_FOUND', message: 'Supplier not found', statusCode: 404 });
        return;
      }

      // Check for duplicate taxId if updating
      if (updates.taxId && updates.taxId !== supplier.taxId) {
        const dup = await prisma.supplier.findFirst({
          where: { taxId: updates.taxId, id: { not: id }, deletedAt: null },
        });
        if (dup) {
          sendError(res, { code: 'DUPLICATE_TAX_ID', message: `NIU ${updates.taxId} already in use`, statusCode: 409 });
          return;
        }
      }

      // Warn about deactivation if pending invoices
      let warning: string | undefined;
      if (updates.isActive === false && supplier.isActive) {
        const pendingCount = await prisma.invoice.count({
          where: { supplierId: id, status: 'PENDING_APPROVAL' },
        });
        if (pendingCount > 0) {
          warning = `Warning: This supplier has ${pendingCount} pending invoice(s).`;
        }
      }

      const updated = await prisma.supplier.update({
        where: { id },
        data: updates,
      });

      const response: Record<string, unknown> = { ...updated };
      if (warning) response.warning = warning;

      sendSuccess(res, { data: response });
    } catch (error) {
      logger.error(`Error updating supplier: ${error}`);
      sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to update supplier', statusCode: 500 });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// DELETE /suppliers/:id — Soft delete supplier
// ═══════════════════════════════════════════════════════════════════
router.delete(
  '/:id',
  requireRole(UserRole.CFO, UserRole.SUPER_ADMIN),
  async (req: Request, res: Response) => {
    try {
      const id = getParam(req, 'id');

      const supplier = await prisma.supplier.findFirst({
        where: { id, deletedAt: null },
      });

      if (!supplier) {
        sendError(res, { code: 'NOT_FOUND', message: 'Supplier not found', statusCode: 404 });
        return;
      }

      // Check for pending invoices
      const pendingCount = await prisma.invoice.count({
        where: { supplierId: id, status: { in: ['PENDING_APPROVAL', 'APPROVED'] } },
      });

      if (pendingCount > 0) {
        sendError(res, {
          code: 'HAS_PENDING_INVOICES',
          message: `Cannot delete supplier with ${pendingCount} pending/approved invoice(s)`,
          statusCode: 400,
        });
        return;
      }

      await prisma.supplier.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      logger.info(`Supplier soft-deleted: ${id} by user ${req.user!.userId}`);
      sendSuccess(res, { data: { message: 'Supplier deleted successfully' } });
    } catch (error) {
      logger.error(`Error deleting supplier: ${error}`);
      sendError(res, { code: 'INTERNAL_ERROR', message: 'Failed to delete supplier', statusCode: 500 });
    }
  },
);

export default router;
