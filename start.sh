#!/bin/bash

# ALCOM V3 PRO - Start Script

echo "🚀 Starting Alcom V3 Pro Stack..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker Desktop and try again."
  exit 1
fi

# Create .env if not exists
if [ ! -f .env ]; then
  echo "⚠️ .env file not found. Copying .env.example..."
  cp .env.example .env
fi

# Build and Start Containers
echo "📦 Building and starting containers..."
docker compose up -d --build

if [ $? -eq 0 ]; then
  echo "✅ Stack is running!"
  echo "   - Web: http://localhost:3000"
  echo "   - API: http://localhost:4000"
  echo "   - DB:  localhost:5432"
  
  # Run Migrations
  # echo "🔄 Running database migrations..."
  # sleep 5 # Wait for DB to be ready
  # docker exec alcom-api npx prisma migrate deploy
  
  echo "🎉 ALCOM V3 PRO is fully deployed!"
else
  echo "❌ Failed to start stack. Check logs above."
  exit 1
fi
