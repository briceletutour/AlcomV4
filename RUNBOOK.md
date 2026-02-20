# ════════════════════════════════════════════════════════════════════════════════
# ALCOM V3 — Operations Runbook
# ════════════════════════════════════════════════════════════════════════════════
# 
# This document contains step-by-step procedures for common operations.
# Keep this document updated and accessible to all DevOps team members.
#
# Last Updated: 2026-02-17
# ════════════════════════════════════════════════════════════════════════════════

## Table of Contents

1. [Deployment](#1-deployment)
2. [Rollback](#2-rollback)
3. [Logs](#3-checking-logs)
4. [Database Operations](#4-database-operations)
5. [User Management](#5-user-management)
6. [Backup & Restore](#6-backup--restore)
7. [Common Issues](#7-common-issues--solutions)
8. [Emergency Contacts](#8-emergency-contacts)

---

## 1. Deployment

### 1.1 Standard Deployment (via Git)

Alcom V3 uses continuous deployment. Pushing to `main` triggers automatic deployment.

```bash
# Ensure you're on main branch and up-to-date
git checkout main
git pull origin main

# Make changes and commit
git add .
git commit -m "Description of changes"

# Push to trigger deployment
git push origin main
```

### 1.2 Verify Deployment

```bash
# Check API health
curl https://api.alcom.cm/health

# Expected response:
# {"status":"ok","version":"X.X.X","uptime":...}

# Check detailed health (includes DB/Redis status)
curl https://api.alcom.cm/health/ready
```

### 1.3 Manual Deploy via Railway CLI

```bash
# Install Railway CLI if not installed
npm install -g @railway/cli

# Login
railway login

# Deploy specific service
cd apps/api
railway up

# Or for web
cd apps/web
railway up
```

---

## 2. Rollback

### 2.1 Quick Rollback via Railway Dashboard

1. Go to https://railway.app
2. Select the Alcom project
3. Click on the service (API or Web)
4. Go to "Deployments" tab
5. Find the last working deployment
6. Click "..." menu → "Redeploy"

### 2.2 Rollback via Git

```bash
# Find the commit to rollback to
git log --oneline -20

# Revert to specific commit
git revert <commit-hash>
git push origin main

# Or hard reset (use with caution!)
git reset --hard <commit-hash>
git push --force origin main
```

### 2.3 Emergency Rollback - Disable Service

If you need to take a service offline immediately:

1. Go to Railway Dashboard
2. Click on the service
3. Click "Settings" → "Remove Service" (or pause via CLI)

```bash
# Via CLI
railway service pause
```

---

## 3. Checking Logs

### 3.1 Railway Dashboard

1. Go to https://railway.app → Your project
2. Click on the service (API or Web)
3. Click "Logs" tab
4. Use filters: Error, Warn, Info

### 3.2 Railway CLI

```bash
# View recent logs
railway logs

# Follow logs in real-time
railway logs -f

# Filter by deployment
railway logs --deployment <deployment-id>
```

### 3.3 Better Stack (if configured)

1. Go to https://logs.betterstack.com
2. Search by:
   - `requestId`: Trace a specific request
   - `service:alcom-api`: All API logs
   - `level:error`: All errors
   - `path:/api/shifts`: Specific endpoint

### 3.4 Finding Specific Requests

Each request has a unique `requestId` in the `X-Request-Id` header.

```bash
# Search logs for specific request
# In Better Stack: requestId:"abc-123-def"
```

---

## 4. Database Operations

### 4.1 Run Migrations

```bash
# Production migrations (deploy only, safe for production)
cd apps/api
DATABASE_URL="<production-url>" npx prisma migrate deploy
```

Via Railway:
```bash
railway run prisma migrate deploy
```

### 4.2 Check Migration Status

```bash
npx prisma migrate status
```

### 4.3 Connect to Database (Read Only)

```bash
# Via Railway CLI
railway connect postgres

# Or using psql directly
psql "<DATABASE_URL>"
```

### 4.4 Run SQL Queries

```bash
# Connect then run
psql "<DATABASE_URL>" -c "SELECT COUNT(*) FROM users;"
```

### 4.5 Add Production Seed Data

```bash
# Run production seed script (idempotent - safe to run multiple times)
cd apps/api
DATABASE_URL="<production-url>" pnpm db:seed:prod
```

---

## 5. User Management

### 5.1 Reset User Password (via Admin UI)

1. Login as SUPER_ADMIN or CEO
2. Go to Settings → Users
3. Find the user
4. Click "Reset Password"
5. New temporary password will be sent via email

### 5.2 Reset User Password (via Database)

```bash
# Generate new password hash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('NewPassword123!', 12).then(h => console.log(h))"

# Update in database
psql "<DATABASE_URL>" -c "UPDATE users SET password_hash = '<hash>' WHERE email = 'user@alcom.cm';"
```

### 5.3 Unlock User Account

```bash
psql "<DATABASE_URL>" -c "UPDATE users SET is_active = true, locked_until = NULL, failed_login_attempts = 0 WHERE email = 'user@alcom.cm';"
```

### 5.4 Create New Admin User

```bash
# Via production seed (add to CONFIG in seed-production.ts)
# Or via SQL:
psql "<DATABASE_URL>" -c "
INSERT INTO users (id, email, password_hash, full_name, role, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'newadmin@alcom.cm',
  '<bcrypt-hash>',
  'New Admin',
  'SUPER_ADMIN',
  true,
  NOW(),
  NOW()
);
"
```

---

## 6. Backup & Restore

### 6.1 Railway Automatic Backups

Railway PostgreSQL includes automatic daily backups.

To verify:
1. Go to Railway → PostgreSQL service
2. Click "Backups" tab
3. Verify recent backups exist

### 6.2 Manual Backup

```bash
# Export database
pg_dump "$DATABASE_URL" --format=custom --file=backup-$(date +%Y%m%d-%H%M%S).dump

# Export specific tables
pg_dump "$DATABASE_URL" --format=custom --table=users --table=stations --file=partial-backup.dump

# Export data only (no schema)
pg_dump "$DATABASE_URL" --data-only --file=data-only-backup.sql
```

### 6.3 Restore from Backup

```bash
# Restore full backup (CAREFUL: overwrites existing data!)
pg_restore --clean --if-exists -d "$DATABASE_URL" backup-20260217.dump

# Restore specific tables
pg_restore -d "$DATABASE_URL" --table=users backup.dump
```

### 6.4 Point-in-Time Recovery (Railway)

Contact Railway support for point-in-time recovery from automated backups.

---

## 7. Common Issues & Solutions

### Issue: API returns 503 "Service Degraded"

**Symptoms:** `/health/ready` shows database or redis as "error"

**Solution:**
1. Check Railway service status
2. Verify DATABASE_URL and REDIS_URL are correct
3. Check service logs for connection errors
4. Restart the affected service via Railway

### Issue: "Too Many Requests" (429)

**Symptoms:** Users see rate limit errors

**Solution:**
1. Check if legitimate traffic spike
2. If attack, consider enabling Cloudflare WAF rules
3. Temporarily adjust rate limits if needed:
   ```bash
   # In environment variables
   RATE_LIMIT_MAX_REQUESTS=200
   ```

### Issue: File Upload Fails

**Symptoms:** Users cannot upload files, 500 error

**Solution:**
1. Verify R2 credentials:
   ```bash
   curl -X GET "https://<R2_ENDPOINT>/<bucket>" \
     -H "Authorization: AWS4-HMAC-SHA256 ..."
   ```
2. Check R2 bucket exists and permissions are correct
3. Check logs for specific error message

### Issue: Emails Not Sending

**Symptoms:** Password reset, notifications not received

**Solution:**
1. Verify Resend API key is valid
2. Check domain verification in Resend dashboard
3. Check Resend logs for delivery status
4. Verify EMAIL_FROM matches verified domain

### Issue: Shift Won't Close

**Symptoms:** "Cannot close shift" error

**Solution:**
1. Check all required fields are filled (sales, dips)
2. Verify no validation errors in response
3. Check for concurrent modification (another user editing)
4. Look for error in API logs with requestId

### Issue: Dashboard Shows Wrong Data

**Symptoms:** Metrics don't match expected values

**Solution:**
1. Clear browser cache
2. Check if data is cached (wait for refresh interval)
3. Verify timezone settings
4. Check for filtering issues in query

### Issue: Memory Usage High

**Symptoms:** Service slow or crashing, OOM errors

**Solution:**
1. Check `/health/metrics` for memory usage
2. Restart service to clear memory
3. Review recent changes for memory leaks
4. Consider increasing service resources in Railway

---

## 8. Emergency Contacts

### Technical Emergency

| Role | Name | Phone | Email |
|------|------|-------|-------|
| Lead Developer | [TBD] | +237XXXXXXXXX | dev@alcom.cm |
| DevOps | [TBD] | +237XXXXXXXXX | devops@alcom.cm |
| On-Call | [TBD] | +237XXXXXXXXX | oncall@alcom.cm |

### Business Emergency

| Role | Name | Phone | Email |
|------|------|-------|-------|
| IT Manager | [TBD] | +237XXXXXXXXX | it@alcom.cm |
| Operations | [TBD] | +237XXXXXXXXX | ops@alcom.cm |

### External Services

| Service | Support URL | Notes |
|---------|-------------|-------|
| Railway | https://help.railway.app | Platform issues |
| Cloudflare | https://support.cloudflare.com | DNS, R2 issues |
| Resend | https://resend.com/help | Email delivery |

---

## Quick Reference Commands

```bash
# Check service health
curl https://api.alcom.cm/health

# View logs
railway logs -f

# Run migration
railway run prisma migrate deploy

# Connect to database
railway connect postgres

# Restart service
railway service restart

# Deploy current branch
railway up
```

---

## Document History

| Date | Author | Changes |
|------|--------|---------|
| 2026-02-17 | Initial | Created runbook |

---

**Remember:** When in doubt, check the logs first. Most issues can be diagnosed by examining the `requestId` in the error response and finding the corresponding log entry.
