/**
 * SLA Monitor Job
 *
 * Runs every hour to:
 * - Mark incoming mails as OVERDUE when deadline has passed
 * - Identify DUE_SOON mails (deadline within 24h)
 * - Notify assignees and admins
 */

import prisma from '../lib/prisma';
import logger from '../lib/logger';
import { MailStatus } from '@prisma/client';

export interface SlaMonitorResult {
  overdueCount: number;
  dueSoonCount: number;
  notificationsSent: number;
}

export async function processMonitorSla(): Promise<SlaMonitorResult> {
  const now = new Date();
  const dueSoonLimit = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  logger.info(`Starting SLA monitor job at ${now.toISOString()}`);

  const activeFilter = {
    status: { notIn: [MailStatus.RESPONDED, MailStatus.ARCHIVED] },
  };

  // 1) Overdue mails
  const overdueMails = await prisma.incomingMail.findMany({
    where: {
      ...activeFilter,
      deadline: { lt: now },
    },
    include: {
      assignedTo: { select: { id: true } },
    },
  });

  if (overdueMails.length > 0) {
    await prisma.incomingMail.updateMany({
      where: {
        id: { in: overdueMails.map((m) => m.id) },
      },
      data: { slaState: 'OVERDUE' },
    });
  }

  // 2) Due soon mails
  const dueSoonMails = await prisma.incomingMail.findMany({
    where: {
      ...activeFilter,
      deadline: {
        gte: now,
        lte: dueSoonLimit,
      },
    },
    include: {
      assignedTo: { select: { id: true } },
    },
  });

  if (dueSoonMails.length > 0) {
    await prisma.incomingMail.updateMany({
      where: {
        id: { in: dueSoonMails.map((m) => m.id) },
      },
      data: { slaState: 'DUE_SOON' },
    });
  }

  // Ensure ON_TIME for other active mails to keep DB state fresh
  await prisma.incomingMail.updateMany({
    where: {
      ...activeFilter,
      deadline: { gt: dueSoonLimit },
    },
    data: { slaState: 'ON_TIME' },
  });

  // Notification recipients
  const adminUsers = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ['SUPER_ADMIN', 'CEO', 'CFO', 'FINANCE_DIR'] },
    },
    select: { id: true },
  });

  const notifications: Array<{
    userId: string;
    type: string;
    title: string;
    message: string;
    link: string;
  }> = [];

  // Overdue => assignee + admins
  for (const mail of overdueMails) {
    const recipients = new Set<string>();
    if (mail.assignedToId) recipients.add(mail.assignedToId);
    adminUsers.forEach((admin) => recipients.add(admin.id));

    recipients.forEach((userId) => {
      notifications.push({
        userId,
        type: 'MAIL_SLA_OVERDUE',
        title: 'Incoming mail SLA overdue',
        message: `Mail "${mail.subject}" is overdue.`,
        link: `/admin/mails/${mail.id}`,
      });
    });
  }

  // Due soon => assignee only
  for (const mail of dueSoonMails) {
    if (!mail.assignedToId) continue;

    notifications.push({
      userId: mail.assignedToId,
      type: 'MAIL_SLA_DUE_SOON',
      title: 'Incoming mail due soon',
      message: `Mail "${mail.subject}" is due within 24 hours.`,
      link: `/admin/mails/${mail.id}`,
    });
  }

  if (notifications.length > 0) {
    await prisma.notification.createMany({ data: notifications });
  }

  logger.info(
    `SLA monitor job completed: overdue=${overdueMails.length}, dueSoon=${dueSoonMails.length}, notifications=${notifications.length}`,
  );

  return {
    overdueCount: overdueMails.length,
    dueSoonCount: dueSoonMails.length,
    notificationsSent: notifications.length,
  };
}
