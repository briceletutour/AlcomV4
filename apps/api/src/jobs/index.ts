/**
 * Background Jobs (Simplified without BullMQ/Redis)
 */

import { Prisma } from '@prisma/client';
import logger from '../lib/logger';
import { processActivatePrices } from './price-activation.job';
import { processAutoReplenishment } from './auto-replenishment.job';
import { processDailyDigest, processSendEmailJob } from './email';
import prisma from '../lib/prisma';
import { processMonitorSla } from './sla-monitor.job';

let intervals: NodeJS.Timeout[] = [];

/**
 * Initialize all job schedulers
 */
export async function initializeJobs(): Promise<void> {
  logger.info('Initializing scheduled jobs...');

  // Price Activation - runs every day at 00:00:00 (approximate using interval)
  // Run once immediately
  setTimeout(() => {
    processActivatePrices().catch(e => logger.error(`Price activation error: ${e.message}`));
  }, 5000);

  intervals.push(setInterval(() => {
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0) {
      processActivatePrices().catch(e => logger.error(`Price activation error: ${e.message}`));
    }
  }, 60000)); // check every minute

  // Auto-Replenishment - runs every day at 06:00:00
  intervals.push(setInterval(() => {
    const now = new Date();
    if (now.getHours() === 6 && now.getMinutes() === 0) {
      processAutoReplenishment().catch(e => logger.error(`Auto-replenishment error: ${e.message}`));
    }
  }, 60000));

  // Daily Digest - runs every day at 08:00:00
  intervals.push(setInterval(() => {
    const now = new Date();
    if (now.getHours() === 8 && now.getMinutes() === 0) {
      processDailyDigest().catch(e => logger.error(`Daily digest error: ${e.message}`));
    }
  }, 60000));

  // Incoming Mail SLA monitor - runs every hour
  intervals.push(setInterval(() => {
    const now = new Date();
    if (now.getMinutes() === 0) {
      processMonitorSla().catch(e => logger.error(`SLA monitor error: ${e.message}`));
    }
  }, 60000));

  logger.info('Scheduled jobs initialized');
}

/**
 * Graceful shutdown of job workers
 */
export async function shutdownJobs(): Promise<void> {
  logger.info('Shutting down background jobs...');
  intervals.forEach(i => clearInterval(i));
  intervals = [];
  logger.info('Background jobs shut down');
}

/**
 * Manually trigger price activation (for testing/admin purposes)
 */
export async function triggerPriceActivation(): Promise<string> {
  setTimeout(() => {
    processActivatePrices().catch(e => logger.error(`Triggered price activation error: ${e.message}`));
  }, 0);
  return 'sync-job';
}

/**
 * Manually trigger auto-replenishment check (for testing/admin purposes)
 */
export async function triggerAutoReplenishment(): Promise<string> {
  setTimeout(() => {
    processAutoReplenishment().catch(e => logger.error(`Triggered auto-replenishment error: ${e.message}`));
  }, 0);
  return 'sync-job';
}

export interface EnqueueEmailOptions {
  to: string;
  subject: string;
  template:
    | 'invite-user'
    | 'password-reset'
    | 'invoice-approval'
    | 'shift-variance-alert'
    | 'incident-alert'
    | 'sla-overdue'
    | 'daily-digest';
  templateData?: Record<string, unknown>;
  scheduledAt?: Date;
}

export async function enqueueEmail(options: EnqueueEmailOptions): Promise<string | null> {
  try {
    const payload: Prisma.InputJsonValue = {
      to: options.to,
      subject: options.subject,
      template: options.template,
      templateData: (options.templateData || {}) as Prisma.InputJsonValue,
    };

    const dbJob = await prisma.job.create({
      data: {
        type: 'send_email',
        payload,
        status: 'PENDING',
        scheduledAt: options.scheduledAt || new Date(),
      },
    });

    // Execute directly asynchronously
    const delay = options.scheduledAt ? Math.max(0, options.scheduledAt.getTime() - Date.now()) : 0;
    setTimeout(() => {
      processSendEmailJob(dbJob.id).catch(e => logger.error(`Direct email send error: ${e.message}`));
    }, delay);

    return dbJob.id;
  } catch (error) {
    logger.warn(`Unable to insert email job: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Manually trigger incoming mail SLA monitor (for testing/admin purposes)
 */
export async function triggerSlaMonitor(): Promise<string> {
  setTimeout(() => {
    processMonitorSla().catch(e => logger.error(`Triggered SLA monitor error: ${e.message}`));
  }, 0);
  return 'sync-job';
}

