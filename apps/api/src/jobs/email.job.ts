import { UserRole } from '@alcom/shared';
import prisma from '../lib/prisma';
import logger from '../lib/logger';
import { EmailTemplateName, emailService } from '../services/email.service';

interface StoredEmailPayload {
  to: string;
  subject: string;
  template: EmailTemplateName;
  templateData?: Record<string, unknown>;
}

export async function processSendEmailJob(dbJobId: string): Promise<void> {
  const dbJob = await prisma.job.findUnique({ where: { id: dbJobId } });

  if (!dbJob || dbJob.type !== 'send_email') {
    throw new Error(`Job not found or invalid type: ${dbJobId}`);
  }

  try {
    await prisma.job.update({
      where: { id: dbJobId },
      data: {
        status: 'PROCESSING',
      },
    });

    const payload = dbJob.payload as unknown as StoredEmailPayload;
    const htmlBody = await emailService.renderTemplate(payload.template, payload.templateData || {});
    await emailService.sendEmail(payload.to, payload.subject, htmlBody);

    await prisma.job.update({
      where: { id: dbJobId },
      data: {
        status: 'COMPLETED',
        processedAt: new Date(),
        error: null,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await prisma.job.update({
      where: { id: dbJobId },
      data: {
        status: 'FAILED',
        processedAt: new Date(),
        error: errorMessage,
      },
    });
    throw error;
  }
}

export async function processDailyDigest(): Promise<{ sent: number; skipped: number }> {
  const now = new Date();
  logger.info(`Starting daily digest job at ${now.toISOString()}`);

  const executives = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: [UserRole.CEO, UserRole.CFO, UserRole.FINANCE_DIR] },
      deletedAt: null,
    },
    select: { id: true, email: true, fullName: true, role: true },
  });

  let sent = 0;
  let skipped = 0;

  for (const executive of executives) {
    const [pendingInvoiceApprovals, pendingExpenseApprovals, openIncidents, overdueMails] = await Promise.all([
      prisma.invoice.count({ where: { status: 'PENDING_APPROVAL' } }),
      prisma.expense.count({ where: { status: { in: ['PENDING_MANAGER', 'PENDING_FINANCE'] } } }),
      prisma.incident.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      prisma.incomingMail.count({
        where: {
          status: { notIn: ['RESPONDED', 'ARCHIVED'] },
          deadline: { lt: now },
        },
      }),
    ]);

    const totalPending = pendingInvoiceApprovals + pendingExpenseApprovals + openIncidents + overdueMails;
    if (totalPending === 0) {
      skipped++;
      continue;
    }

    const htmlBody = await emailService.renderTemplate('daily-digest', {
      name: executive.fullName,
      date: now.toLocaleDateString('fr-FR'),
      pendingInvoiceApprovals,
      pendingExpenseApprovals,
      openIncidents,
      overdueMails,
    });

    await emailService.sendEmail(
      executive.email,
      `ALCOM Daily Digest — ${now.toLocaleDateString('fr-FR')}`,
      htmlBody
    );

    sent++;
  }

  logger.info(`Daily digest job completed: sent=${sent}, skipped=${skipped}`);
  return { sent, skipped };
}
