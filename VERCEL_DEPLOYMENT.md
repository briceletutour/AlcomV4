# 🚀 Vercel Deployment Guide - Alcom V4

This guide covers deploying the **Next.js frontend** to Vercel. The backend API needs to be deployed separately.

## 📋 Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Frontend Deployment (Vercel)](#frontend-deployment-vercel)
- [Backend Deployment Options](#backend-deployment-options)
- [Environment Variables](#environment-variables)
- [Post-Deployment](#post-deployment)
- [Troubleshooting](#troubleshooting)

---

## 🏗️ Architecture Overview

This is a **monorepo** with separate frontend and backend:

- **Frontend**: Next.js app (`apps/web`) → Deploy to **Vercel**
- **Backend**: Express API (`apps/api`) → Deploy to **Railway/Render/DigitalOcean**
- **Database**: PostgreSQL → **Vercel Postgres** or **Supabase** or **Railway**
- **Redis**: Optional caching → **Upstash** or **Railway**

---

## ✅ Prerequisites

1. **GitHub Repository** - Push your code to GitHub
2. **Vercel Account** - Sign up at [vercel.com](https://vercel.com)
3. **Database** - PostgreSQL instance (see options below)
4. **Backend Hosting** - For the Express API (see options below)

---

## 🎯 Frontend Deployment (Vercel)

### Step 1: Import Project to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository**
3. Select your repository
4. Configure project settings:
   - **Framework Preset**: Next.js
   - **Root Directory**: Leave empty (monorepo is detected automatically)
   - **Build Command**: `cd apps/web && pnpm install && pnpm build`
   - **Output Directory**: `apps/web/.next`
   - **Install Command**: `pnpm install`

### Step 2: Configure Environment Variables

Add these environment variables in Vercel dashboard (Settings → Environment Variables):

```bash
# Frontend - Required
NEXT_PUBLIC_API_URL=https://your-api-domain.com

# Example for Railway backend:
# NEXT_PUBLIC_API_URL=https://alcom-api-production.up.railway.app

# Example for Render backend:
# NEXT_PUBLIC_API_URL=https://alcom-api.onrender.com
```

### Step 3: Deploy

1. Click **Deploy**
2. Wait for build to complete (2-3 minutes)
3. Your frontend will be live at `https://your-project.vercel.app`

### Step 4: Add Custom Domain (Optional)

1. Go to **Settings → Domains**
2. Add your custom domain (e.g., `app.alcom.cm`)
3. Configure DNS according to Vercel's instructions

---

## 🖥️ Backend Deployment Options

The Express API (`apps/api`) needs separate hosting. Here are the recommended options:

### Option 1: Railway (Recommended - Easiest)

**Pros**: Easy setup, includes PostgreSQL & Redis, great DX
**Pricing**: Free $5/month credit, then pay-as-you-go

1. Go to [railway.app](https://railway.app)
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your repository
4. Add **PostgreSQL** and **Redis** services
5. Configure build settings:
   - **Root Directory**: `apps/api`
   - **Build Command**: `pnpm install && pnpm db:generate && pnpm build`
   - **Start Command**: `pnpm start`
6. Add environment variables (see below)
7. Deploy!

### Option 2: Render

**Pros**: Simple, good free tier
**Pricing**: Free tier available, paid plans from $7/month

1. Go to [render.com](https://render.com)
2. Create **New Web Service**
3. Connect your GitHub repo
4. Configure:
   - **Root Directory**: `apps/api`
   - **Build Command**: `pnpm install && pnpm db:generate && pnpm build`
   - **Start Command**: `pnpm start`
5. Add environment variables
6. Add PostgreSQL database (Render offers managed PostgreSQL)

### Option 3: DigitalOcean App Platform

**Pros**: Full control, scalable
**Pricing**: From $5/month

Similar setup to Railway/Render, but with more configuration options.

### Option 4: Keep Using Docker

If you prefer Docker, continue using your current setup:
- Deploy to **DigitalOcean Droplet**, **AWS EC2**, or **Hetzner**
- Use the existing `docker-compose.prod.yml`
- Just update `FRONTEND_URL` to point to your Vercel deployment

---

## 🔐 Environment Variables

### Frontend (Vercel)

Add to Vercel dashboard:

```bash
NEXT_PUBLIC_API_URL=https://your-backend-url.com
```

### Backend (Railway/Render/etc.)

```bash
# Database
DATABASE_URL=postgresql://user:password@host:port/database?schema=public

# Redis (optional)
REDIS_URL=redis://default:password@host:port

# API
PORT=4000
NODE_ENV=production
JWT_SECRET=your-64-char-random-string-here
JWT_REFRESH_SECRET=your-64-char-random-string-here
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# CORS - Important!
FRONTEND_URL=https://your-vercel-app.vercel.app

# File Storage
UPLOAD_DIR=/app/uploads

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM=Alcom <noreply@alcom.cm>

# Logging
LOG_LEVEL=info

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### Database Options

#### Option 1: Vercel Postgres
- Go to Vercel dashboard → Storage → Create Database → Postgres
- Copy `DATABASE_URL` to your backend environment variables

#### Option 2: Supabase (Free tier available)
- Sign up at [supabase.com](https://supabase.com)
- Create project → Get connection string
- Add to backend as `DATABASE_URL`

#### Option 3: Railway/Render Managed PostgreSQL
- Both platforms offer managed PostgreSQL
- Automatically provisions when you add the service

---

## 🎉 Post-Deployment

### 1. Run Database Migrations

Connect to your backend service and run:

```bash
# Railway
railway run pnpm db:migrate:prod

# Render (via dashboard shell)
pnpm db:migrate:prod

# Or use Prisma Studio locally with production DB
pnpm db:studio
```

### 2. Seed Production Data (Optional)

```bash
pnpm db:seed:prod
```

### 3. Test Your Deployment

1. Visit your Vercel frontend URL
2. Try logging in
3. Check that API calls work
4. Verify file uploads work
5. Test email functionality

### 4. Set Up CI/CD

Vercel automatically deploys on every push to `main` branch. Configure deployment branches:

1. Go to Vercel → Settings → Git
2. Configure production branch: `main`
3. Enable automatic deployments for pull requests

---

## 🐛 Troubleshooting

### "Cannot find module '@alcom/shared'"

**Solution**: Ensure `transpilePackages: ['@alcom/shared']` is in `next.config.js` (already configured)

### CORS Errors

**Solution**: Make sure `FRONTEND_URL` in backend matches your Vercel domain exactly (including `https://`)

### Environment Variables Not Working

**Solution**:
- Vercel: Redeploy after adding env vars
- Railway/Render: Restart service after adding env vars

### Build Fails on Vercel

**Solution**:
- Check build logs in Vercel dashboard
- Ensure `pnpm` is selected as package manager
- Verify `vercel.json` configuration is correct

### API Calls Return 404

**Solution**:
- Verify `NEXT_PUBLIC_API_URL` is set correctly in Vercel
- Ensure backend is deployed and running
- Check backend logs for errors

### Database Connection Issues

**Solution**:
- Verify `DATABASE_URL` is correct
- Check if database allows connections from your backend host
- Ensure SSL is enabled if required: `?sslmode=require`

---

## 📚 Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Railway Documentation](https://docs.railway.app)
- [Render Documentation](https://render.com/docs)

---

## 🔄 Deployment Workflow

```mermaid
graph LR
    A[Push to GitHub] --> B[Vercel Auto-Deploy Frontend]
    A --> C[Railway/Render Auto-Deploy Backend]
    B --> D[Frontend Live]
    C --> E[Backend Live]
    D --> F[Test Application]
    E --> F
```

---

## ✅ Final Checklist

- [ ] Frontend deployed to Vercel
- [ ] Backend deployed to Railway/Render/other
- [ ] PostgreSQL database provisioned
- [ ] All environment variables configured
- [ ] Database migrations run
- [ ] Production data seeded (if needed)
- [ ] Custom domain configured (optional)
- [ ] SSL certificates active
- [ ] API endpoints tested
- [ ] User authentication working
- [ ] File uploads working
- [ ] Email sending working
- [ ] Monitoring/logging set up

---

## 🆘 Need Help?

If you encounter issues:
1. Check the troubleshooting section above
2. Review deployment logs in Vercel/Railway/Render dashboard
3. Verify all environment variables are set correctly
4. Ensure database migrations have run successfully

---

**Happy Deploying! 🚀**
