# ════════════════════════════════════════════════════════════════════════════════
# ALCOM V3 — Monitoring Setup Guide
# ════════════════════════════════════════════════════════════════════════════════

## Health Check Endpoints

The API provides three health check endpoints:

| Endpoint | Purpose | Used By |
|----------|---------|---------|
| `/health` | Basic liveness check | PaaS health checks (Railway) |
| `/health/ready` | Readiness check (DB + Redis) | Load balancers, deployment |
| `/health/metrics` | Memory and uptime metrics | Monitoring dashboards |

### Response Examples

**GET /health**
```json
{
  "status": "ok",
  "version": "0.0.1",
  "uptime": 3600,
  "timestamp": "2024-02-17T10:00:00.000Z",
  "environment": "production"
}
```

**GET /health/ready**
```json
{
  "status": "ready",
  "version": "0.0.1",
  "uptime": 3600,
  "checks": {
    "database": { "status": "ok", "latencyMs": 5 },
    "redis": { "status": "ok", "latencyMs": 2 }
  },
  "timestamp": "2024-02-17T10:00:00.000Z"
}
```

---

## 1. UptimeRobot Configuration

[UptimeRobot](https://uptimerobot.com) provides free uptime monitoring.

### 1.1 Create Monitors

1. Go to https://uptimerobot.com and sign up/login
2. Click "Add New Monitor"

**API Health Monitor:**
- Monitor Type: HTTP(s)
- Friendly Name: Alcom API
- URL: `https://api.alcom.cm/health`
- Monitoring Interval: 5 minutes
- Alert contacts: Your email

**API Readiness Monitor (optional):**
- Monitor Type: HTTP(s)
- Friendly Name: Alcom API Ready
- URL: `https://api.alcom.cm/health/ready`
- Monitoring Interval: 5 minutes

**Web App Monitor:**
- Monitor Type: HTTP(s)
- Friendly Name: Alcom Web
- URL: `https://app.alcom.cm`
- Monitoring Interval: 5 minutes

### 1.2 Status Page (Optional)

Create a public status page at `status.alcom.cm`:
1. In UptimeRobot, go to "Status Pages"
2. Click "Add Status Page"
3. Select your monitors
4. Configure CNAME: `status.alcom.cm` → Status page URL

---

## 2. Log Aggregation (Better Stack / Logtail)

The API outputs JSON structured logs that can be aggregated by Better Stack (Logtail).

### 2.1 Setup Better Stack

1. Go to https://betterstack.com and create account
2. Go to Sources → Create Source
3. Select "HTTP" as the source type
4. Note the Source Token

### 2.2 Configure Application

Add to your production environment variables:

```env
LOGTAIL_SOURCE_TOKEN=your_source_token_here
```

### 2.3 Optional: Use Logtail Transport

For direct log shipping, install the transport:

```bash
pnpm add @logtail/pino
```

Then update `lib/logger.ts` transport configuration.

### 2.4 Log Format

All logs include:
- `requestId`: Unique identifier for request correlation
- `service`: "alcom-api"
- `version`: Application version
- `env`: Environment (production/development)
- `timestamp`: ISO 8601 timestamp

Request logs include:
- `method`: HTTP method
- `path`: Request path
- `statusCode`: Response status
- `latencyMs`: Request duration
- `userId`: Authenticated user or "anonymous"

---

## 3. Error Tracking

### 3.1 Sentry (Optional)

For more advanced error tracking with stack traces:

```bash
pnpm add @sentry/node
```

Then add to API startup:

```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
```

---

## 4. Database Backups

### 4.1 Railway PostgreSQL Backups

Railway automatically creates daily point-in-time backups for PostgreSQL.

To verify:
1. Go to Railway Dashboard → PostgreSQL service
2. Click "Backups" tab
3. Verify daily snapshots are listed

### 4.2 Manual Backup

```bash
# Using pg_dump (requires DATABASE_URL)
pg_dump "$DATABASE_URL" > backup-$(date +%Y%m%d).sql
```

### 4.3 Restore from Backup

```bash
# Restore to database
psql "$DATABASE_URL" < backup-20240217.sql
```

---

## 5. Performance Monitoring

### 5.1 Built-in Metrics

GET `/health/metrics` provides:
- Memory usage (heap, RSS)
- Application uptime
- Version information

### 5.2 Recommended Alerts

Set up alerts for:
- API response time > 5 seconds
- API downtime > 1 minute
- Database connection failures
- Redis connection failures
- Memory usage > 80% of limit

---

## 6. Monitoring Checklist

### Before Launch
- [ ] UptimeRobot monitors created
- [ ] Alert contacts configured
- [ ] Status page set up (optional)
- [ ] Log aggregation connected
- [ ] Database backups verified

### Weekly Check
- [ ] Review UptimeRobot uptime percentage
- [ ] Check log aggregation for errors
- [ ] Verify database backups exist
- [ ] Review memory/performance trends

### Monthly Check  
- [ ] Test database restore procedure
- [ ] Review and rotate API keys if needed
- [ ] Update monitoring thresholds if needed
- [ ] Review incident response times
