#!/bin/bash
# ════════════════════════════════════════════════════════════════════════════════
# ALCOM V3 — Production Database Migration Script
# ════════════════════════════════════════════════════════════════════════════════
# This script safely runs database migrations in production
# ════════════════════════════════════════════════════════════════════════════════

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}════════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  ALCOM V3 — Production Database Migration${NC}"
echo -e "${YELLOW}════════════════════════════════════════════════════════════════${NC}"

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}ERROR: DATABASE_URL environment variable is not set${NC}"
  exit 1
fi

# Check if we're in the right directory
if [ ! -f "prisma/schema.prisma" ]; then
  echo -e "${RED}ERROR: Must run from apps/api directory${NC}"
  exit 1
fi

# Confirm production migration
if [ "$NODE_ENV" = "production" ]; then
  echo -e "${YELLOW}WARNING: You are about to run migrations in PRODUCTION${NC}"
  echo -e "Database: ${DATABASE_URL%%@*}@***"
  echo ""
  read -p "Are you sure you want to continue? (yes/no): " confirm
  if [ "$confirm" != "yes" ]; then
    echo -e "${RED}Migration cancelled${NC}"
    exit 0
  fi
fi

echo ""
echo -e "${GREEN}Step 1: Generating Prisma Client...${NC}"
npx prisma generate

echo ""
echo -e "${GREEN}Step 2: Checking pending migrations...${NC}"
npx prisma migrate status

echo ""
echo -e "${GREEN}Step 3: Running migrations...${NC}"
npx prisma migrate deploy

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Migration completed successfully!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
