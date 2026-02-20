# 🐳 Quick Start - Docker Deployment

Get your Alcom V4 application running with Docker in minutes!

## ⚡ Super Quick Start (Development)

Just run this single command:

```bash
./docker-deploy.sh dev
```

That's it! Your application will be available at:
- **Frontend**: http://localhost:3004
- **API**: http://localhost:4004

## 📋 Prerequisites

Make sure you have installed:
- Docker Desktop (Mac/Windows) or Docker Engine (Linux)
- Docker Compose

[Install Docker](https://docs.docker.com/get-docker/)

## 🚀 Commands

### Development Deployment

```bash
# Start everything
./docker-deploy.sh dev

# View logs
./docker-deploy.sh logs

# Stop everything
./docker-deploy.sh stop
```

### Production Deployment

```bash
# 1. Create environment file
cp .env.docker.example .env.docker

# 2. Edit with your values (IMPORTANT!)
nano .env.docker

# 3. Deploy
./docker-deploy.sh prod
```

### Other Commands

```bash
# Show running containers
./docker-deploy.sh status

# Backup database
./docker-deploy.sh backup

# View logs (production)
./docker-deploy.sh logs prod

# Stop production
./docker-deploy.sh stop prod
```

## 🎯 What's Running?

The deployment includes:

1. **PostgreSQL** (Database)
   - Port: 5434 (dev) / 5432 (prod)
   - User: alcom
   - Database: alcom_v4

2. **Redis** (Cache)
   - Port: 6380 (dev) / 6379 (prod)

3. **API** (Backend)
   - Port: 4004 (dev) / 4000 (prod)
   - Auto-runs migrations on start

4. **Web** (Frontend)
   - Port: 3004 (dev) / 3000 (prod)
   - Next.js application

## 🔧 Manual Docker Commands

If you prefer manual control:

### Development

```bash
docker-compose up --build -d
docker-compose logs -f
docker-compose down
```

### Production

```bash
docker-compose -f docker-compose.prod.yml --env-file .env.docker up --build -d
docker-compose -f docker-compose.prod.yml --env-file .env.docker logs -f
docker-compose -f docker-compose.prod.yml --env-file .env.docker down
```

## 🐛 Troubleshooting

### Ports already in use?

```bash
# Check what's using the ports
lsof -i :3004
lsof -i :4004
lsof -i :5434

# Kill the process or change ports in docker-compose.yml
```

### Services won't start?

```bash
# Check logs
docker-compose logs -f

# Rebuild from scratch
docker-compose down -v
docker-compose up --build
```

### Clear everything and start fresh

```bash
# WARNING: This removes all data!
docker-compose down -v
docker system prune -a
./docker-deploy.sh dev
```

## 📚 Full Documentation

For detailed information, see [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md)

## 🆘 Need Help?

Common solutions:
1. Make sure Docker is running (`docker ps`)
2. Check logs (`./docker-deploy.sh logs`)
3. Verify ports aren't in use
4. Try rebuilding (`docker-compose build --no-cache`)

## 🎉 You're Ready!

Your application is now running in Docker. Happy coding! 🚀
