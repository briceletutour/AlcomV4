# Docker Deployment Guide - Alcom V4

This guide will help you deploy the Alcom V4 application using Docker.

## 📋 Prerequisites

- Docker (version 20.10+)
- Docker Compose (version 2.0+)
- At least 4GB of available RAM
- At least 10GB of available disk space

## 🚀 Quick Start - Local Development

For local development with Docker:

```bash
# 1. Build and start all services
docker-compose up --build

# 2. Access the application
# - Frontend: http://localhost:3004
# - API: http://localhost:4004
# - PostgreSQL: localhost:5434
# - Redis: localhost:6380
```

To stop the services:

```bash
docker-compose down
```

To remove all data (containers, volumes, networks):

```bash
docker-compose down -v
```

## 🏭 Production Deployment

### Step 1: Configure Environment

```bash
# Copy the example environment file
cp .env.docker.example .env.docker

# Edit the file with your production values
nano .env.docker
```

**Important**: Change these values in `.env.docker`:
- `POSTGRES_PASSWORD` - Strong database password
- `REDIS_PASSWORD` - Strong Redis password
- `JWT_SECRET` - Random 64-character string
- `FRONTEND_URL` - Your production frontend URL
- `NEXT_PUBLIC_API_URL` - Your production API URL

### Step 2: Build and Deploy

```bash
# Build the images
docker-compose -f docker-compose.prod.yml --env-file .env.docker build

# Start the services
docker-compose -f docker-compose.prod.yml --env-file .env.docker up -d
```

### Step 3: Verify Deployment

```bash
# Check service status
docker-compose -f docker-compose.prod.yml ps

# Check logs
docker-compose -f docker-compose.prod.yml logs -f

# Check specific service
docker-compose -f docker-compose.prod.yml logs -f web
docker-compose -f docker-compose.prod.yml logs -f api
```

## 🔧 Common Operations

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f web
docker-compose logs -f postgres
```

### Restart Services

```bash
# Restart all services
docker-compose restart

# Restart specific service
docker-compose restart api
docker-compose restart web
```

### Run Database Migrations

Migrations run automatically on container start, but you can run them manually:

```bash
docker-compose exec api sh -c "cd apps/api && pnpm exec prisma migrate deploy"
```

### Seed Database

```bash
docker-compose exec api sh -c "cd apps/api && pnpm exec tsx prisma/seed.ts"
```

### Access Database

```bash
# Using docker exec
docker-compose exec postgres psql -U alcom -d alcom_v4

# Or using Prisma Studio (run from host)
pnpm db:studio
```

### Access Redis CLI

```bash
docker-compose exec redis redis-cli
```

## 🔄 Update and Rebuild

When you update the code:

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose up --build -d

# For production
docker-compose -f docker-compose.prod.yml --env-file .env.docker up --build -d
```

## 📊 Monitoring

### Check Resource Usage

```bash
# Container stats
docker stats

# Disk usage
docker system df
```

### Health Checks

```bash
# Check container health
docker-compose ps

# Detailed inspect
docker inspect alcom-v4-api
docker inspect alcom-v4-web
```

## 🔐 Security Best Practices

1. **Change all default passwords** in `.env.docker`
2. **Use strong JWT_SECRET** - Generate with:
   ```bash
   openssl rand -hex 32
   ```
3. **Enable firewall** - Only expose necessary ports
4. **Use HTTPS** - Set up a reverse proxy (nginx/traefik) with SSL
5. **Regular backups** - Backup PostgreSQL data regularly:
   ```bash
   docker-compose exec postgres pg_dump -U alcom alcom_v4 > backup.sql
   ```

## 🌐 Reverse Proxy Setup (Optional)

For production, use nginx or Traefik as a reverse proxy:

### Nginx Example

```nginx
# /etc/nginx/sites-available/alcom
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3004;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 80;
    server_name api.your-domain.com;

    location / {
        proxy_pass http://localhost:4004;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Then enable SSL with Let's Encrypt:
```bash
sudo certbot --nginx -d your-domain.com -d api.your-domain.com
```

## 🐛 Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose logs [service-name]

# Check if ports are already in use
lsof -i :3004
lsof -i :4004
lsof -i :5434
```

### Database connection issues

```bash
# Check if PostgreSQL is healthy
docker-compose ps postgres

# Check database logs
docker-compose logs postgres

# Test connection
docker-compose exec postgres pg_isready -U alcom -d alcom_v4
```

### Build issues

```bash
# Clean build (removes cache)
docker-compose build --no-cache

# Clean everything and rebuild
docker-compose down -v
docker system prune -a
docker-compose up --build
```

### Out of disk space

```bash
# Remove unused images, containers, networks
docker system prune -a

# Remove unused volumes (WARNING: This deletes data!)
docker volume prune
```

## 📦 Backup and Restore

### Backup Database

```bash
# Create backup
docker-compose exec postgres pg_dump -U alcom alcom_v4 > backup_$(date +%Y%m%d_%H%M%S).sql

# Or with docker command
docker exec alcom-v4-postgres pg_dump -U alcom alcom_v4 > backup.sql
```

### Restore Database

```bash
# Restore from backup
cat backup.sql | docker-compose exec -T postgres psql -U alcom -d alcom_v4
```

### Backup Volumes

```bash
# Backup PostgreSQL volume
docker run --rm -v alcom_v4_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_backup.tar.gz -C /data .

# Backup Redis volume
docker run --rm -v alcom_v4_redis_data:/data -v $(pwd):/backup alpine tar czf /backup/redis_backup.tar.gz -C /data .
```

## 🎯 Performance Tuning

### PostgreSQL

Edit `docker-compose.prod.yml` to add PostgreSQL tuning:

```yaml
postgres:
  command: postgres -c 'max_connections=100' -c 'shared_buffers=256MB' -c 'effective_cache_size=1GB'
```

### Node.js Memory

For the API service, increase memory limit:

```yaml
api:
  environment:
    - NODE_OPTIONS=--max-old-space-size=2048
```

## 📝 Notes

- The development setup (`docker-compose.yml`) uses hot-reloading for faster development
- The production setup (`docker-compose.prod.yml`) uses optimized builds
- Database migrations run automatically on container start
- All services restart automatically unless stopped manually (production only)

## 🆘 Support

If you encounter issues:

1. Check the logs: `docker-compose logs -f`
2. Verify environment variables in `.env.docker`
3. Ensure all ports are available (not used by other services)
4. Check Docker resources (CPU, memory, disk)

## 🔗 Useful Links

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Next.js Docker Documentation](https://nextjs.org/docs/deployment#docker-image)
- [PostgreSQL Docker Hub](https://hub.docker.com/_/postgres)
