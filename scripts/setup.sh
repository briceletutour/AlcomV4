#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Alcom V4Local — Local Setup"
echo ""

# 1. Copy env if missing
if [ ! -f apps/api/.env ]; then
  echo "📋 Creating apps/api/.env from .env.example…"
  cp .env.example apps/api/.env
fi

# 2. Start infra
echo "🐳 Starting PostgreSQL…"
docker compose up -d

echo "⏳ Waiting for PostgreSQL…"
until docker compose exec -T postgres pg_isready -U alcom -d alcom_v4 > /dev/null 2>&1; do
  sleep 1
done
echo "  ✓ PostgreSQL ready"

# 3. Install deps
echo "📦 Installing dependencies…"
pnpm install

# 4. Generate Prisma client & migrate
echo "🔧 Generating Prisma client…"
cd apps/api
pnpm exec prisma generate
echo "🗃️  Running migrations…"
pnpm exec prisma migrate dev --name init
echo "🌱 Seeding database…"
pnpm exec tsx prisma/seed.ts
cd ../..

echo ""
echo "✅ Setup complete!"
echo "   Start dev: pnpm dev"
echo "   API:      http://localhost:4000/health"
echo "   Frontend: http://localhost:3000"
