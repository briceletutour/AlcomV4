import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { sendError, sendSuccess } from '../lib/response';

const router = Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;
  const userId = req.user!.userId;

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.notification.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  sendSuccess(res, {
    data: notifications,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      unreadCount,
    },
  });
});

router.put('/:id/read', async (req, res) => {
  const id = req.params.id;
  const userId = req.user!.userId;

  const notification = await prisma.notification.findFirst({
    where: { id, userId },
  });

  if (!notification) {
    sendError(res, {
      code: 'NOT_FOUND',
      message: 'Notification not found',
      statusCode: 404,
    });
    return;
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: {
      isRead: true,
      readAt: notification.readAt ?? new Date(),
    },
  });

  sendSuccess(res, { data: updated });
});

router.put('/read-all', async (req, res) => {
  const userId = req.user!.userId;

  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });

  sendSuccess(res, {
    data: {
      updatedCount: result.count,
    },
  });
});

export default router;
