import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/response';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { UserRole, createChecklistTemplateSchema } from '@alcom/shared';
import logger from '../lib/logger';
import { z } from 'zod';

const router: Router = Router();

// Apply authentication middleware
router.use(requireAuth);

// ─── TEMPLATES LIST FILTER SCHEMA ───
const templateListFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  includeInactive: z.enum(['true', 'false']).optional(),
});

// ─── LIST CHECKLIST TEMPLATES ───
// GET /checklist-templates
router.get('/', async (req: Request, res: Response) => {
  const parsed = templateListFiltersSchema.safeParse(req.query);
  if (!parsed.success) {
    sendError(res, {
      code: 'VALIDATION_ERROR',
      message: 'Invalid query parameters',
      details: { errors: parsed.error.errors },
      statusCode: 400,
    });
    return;
  }

  const { page, limit, includeInactive } = parsed.data;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  
  // Only show active templates unless includeInactive is true
  if (includeInactive !== 'true') {
    where.isActive = true;
  }

  const [templates, total] = await Promise.all([
    prisma.checklistTemplate.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ name: 'asc' }, { version: 'desc' }],
    }),
    prisma.checklistTemplate.count({ where }),
  ]);

  sendSuccess(res, {
    data: templates,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// ─── GET SINGLE TEMPLATE ───
// GET /checklist-templates/:id
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  const template = await prisma.checklistTemplate.findUnique({
    where: { id },
    include: {
      _count: {
        select: { submissions: true },
      },
    },
  });

  if (!template) {
    sendError(res, {
      code: 'NOT_FOUND',
      message: 'Checklist template not found',
      statusCode: 404,
    });
    return;
  }

  sendSuccess(res, { data: template });
});

// ─── CREATE TEMPLATE ───
// POST /checklist-templates
// Only STATION_MANAGER and above can create templates
router.post(
  '/',
  requireRole(UserRole.STATION_MANAGER, UserRole.DCO, UserRole.SUPER_ADMIN),
  validate(createChecklistTemplateSchema),
  async (req: Request, res: Response) => {
    const { name, categories } = req.body;
    const userId = req.user!.userId;

    // Check if a template with the same name already exists
    const existing = await prisma.checklistTemplate.findFirst({
      where: { name, isActive: true },
      orderBy: { version: 'desc' },
    });

    // Create new template (version 1 or increment if updating)
    const newVersion = existing ? existing.version + 1 : 1;
    
    // If creating a new version, deactivate the old one
    if (existing) {
      await prisma.checklistTemplate.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
    }

    const template = await prisma.checklistTemplate.create({
      data: {
        name,
        version: newVersion,
        categories,
        isActive: true,
      },
    });

    logger.info({ templateId: template.id, name, version: newVersion, userId }, 'Checklist template created');

    sendSuccess(res, {
      data: template,
      statusCode: 201,
    });
  },
);

// ─── UPDATE TEMPLATE (creates new version) ───
// PUT /checklist-templates/:id
// Editing creates a new version, the old one is retained but deactivated
router.put(
  '/:id',
  requireRole(UserRole.STATION_MANAGER, UserRole.DCO, UserRole.SUPER_ADMIN),
  validate(createChecklistTemplateSchema),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, categories } = req.body;
    const userId = req.user!.userId;

    // Find the existing template
    const existing = await prisma.checklistTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      sendError(res, {
        code: 'NOT_FOUND',
        message: 'Checklist template not found',
        statusCode: 404,
      });
      return;
    }

    // Deactivate the old version
    await prisma.checklistTemplate.update({
      where: { id },
      data: { isActive: false },
    });

    // Create new version
    const newTemplate = await prisma.checklistTemplate.create({
      data: {
        name: name || existing.name,
        version: existing.version + 1,
        categories,
        isActive: true,
      },
    });

    logger.info(
      { oldTemplateId: id, newTemplateId: newTemplate.id, version: newTemplate.version, userId },
      'Checklist template updated (new version created)',
    );

    sendSuccess(res, { data: newTemplate });
  },
);

// ─── DEACTIVATE TEMPLATE ───
// DELETE /checklist-templates/:id
// Soft delete - just deactivates the template
router.delete(
  '/:id',
  requireRole(UserRole.DCO, UserRole.SUPER_ADMIN),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.userId;

    const template = await prisma.checklistTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      sendError(res, {
        code: 'NOT_FOUND',
        message: 'Checklist template not found',
        statusCode: 404,
      });
      return;
    }

    await prisma.checklistTemplate.update({
      where: { id },
      data: { isActive: false },
    });

    logger.info({ templateId: id, userId }, 'Checklist template deactivated');

    sendSuccess(res, { data: { message: 'Template deactivated successfully' } });
  },
);

export default router;
