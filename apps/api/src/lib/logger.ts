import pino from 'pino';

// Configure transport based on environment
function getTransport() {
  if (process.env.NODE_ENV === 'development') {
    return { target: 'pino-pretty', options: { colorize: true } };
  }

  // Production: JSON logs to stdout (can be picked up by Logtail, etc.)
  // If LOGTAIL_SOURCE_TOKEN is set, you can use pino-logtail transport
  // npm install @logtail/pino
  // return { target: '@logtail/pino', options: { sourceToken: process.env.LOGTAIL_SOURCE_TOKEN } };

  return undefined; // Default JSON output to stdout
}

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: getTransport(),
  base: {
    // Add application metadata to all logs
    service: 'alcom-api',
    version: process.env.npm_package_version || '0.0.1',
    env: process.env.NODE_ENV || 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  // Redact sensitive fields from logs
  redact: {
    paths: ['password', 'accessToken', 'refreshToken', 'authorization', '*.password'],
    censor: '[REDACTED]',
  },
});

export default logger;
