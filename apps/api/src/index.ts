import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import routes from './routes';
import logger from './lib/logger';
import { initializeJobs, shutdownJobs } from './jobs';

const app = express();

// ─── Security ───
app.use(helmet());
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  }),
);

// ─── Rate Limiting ───
app.use(
  rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT',
        message: 'Too many requests, please try again later',
      },
    },
  }),
);

// ─── Body Parsing ───
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Request Logging ───
app.use(requestLogger);

// ─── Routes ───
app.use(routes);

// ─── Global Error Handler ───
app.use(errorHandler);

// ─── Start Server (skip in test mode) ───
if (process.env.NODE_ENV !== 'test') {
  const PORT = parseInt(process.env.PORT || '4000', 10);

  app.listen(PORT, async () => {
    logger.info(`🚀 API server running on port ${PORT}`);
    logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`   Health: http://localhost:${PORT}/health`);

    // Initialize background jobs
    try {
      await initializeJobs();
      logger.info('✓ Background jobs initialized');
    } catch (error) {
      logger.error(`Failed to initialize background jobs: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    await shutdownJobs();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully...');
    await shutdownJobs();
    process.exit(0);
  });
}

export default app;
