import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// Track server start time for uptime calculation
const startTime = Date.now();

// Get version from package.json
const version = process.env.npm_package_version || '0.0.1';

// Basic liveness check - used by PaaS health checks
router.get('/health', (_req: Request, res: Response) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  res.json({
    status: 'ok',
    version,
    uptime: uptimeSeconds,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Readiness check (DB + Redis) - for detailed service health
router.get('/health/ready', async (_req: Request, res: Response) => {
  const checks: Record<string, { status: string; latencyMs?: number }> = {};

  // Check Database
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
  } catch (error) {
    checks.database = { status: 'error', latencyMs: Date.now() - dbStart };
  }

  const allOk = Object.values(checks).every((v) => v.status === 'ok');
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ready' : 'degraded',
    version,
    uptime: uptimeSeconds,
    checks,
    timestamp: new Date().toISOString(),
  });
});

// Detailed metrics endpoint for monitoring dashboards
router.get('/health/metrics', async (_req: Request, res: Response) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const memoryUsage = process.memoryUsage();

  res.json({
    version,
    uptime: uptimeSeconds,
    memory: {
      heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      rssMB: Math.round(memoryUsage.rss / 1024 / 1024),
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
