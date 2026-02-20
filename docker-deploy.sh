#!/bin/bash

# Alcom V4 - Docker Deployment Script
# This script helps you deploy the application using Docker

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Check if Docker is installed
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    print_success "Docker is installed"
}

# Check if Docker Compose is installed
check_docker_compose() {
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    print_success "Docker Compose is installed"
}

# Development deployment
deploy_dev() {
    print_info "Starting development deployment..."

    docker-compose down
    docker-compose build
    docker-compose up -d

    print_success "Development deployment complete!"
    print_info "Frontend: http://localhost:3004"
    print_info "API: http://localhost:4004"
    print_info "PostgreSQL: localhost:5434"
    print_info "Redis: localhost:6380"
    echo ""
    print_info "To view logs: docker-compose logs -f"
}

# Production deployment
deploy_prod() {
    print_info "Starting production deployment..."

    # Check if .env.docker exists
    if [ ! -f .env.docker ]; then
        print_warning ".env.docker not found. Creating from example..."
        if [ -f .env.docker.example ]; then
            cp .env.docker.example .env.docker
            print_warning "Please edit .env.docker with your production values before continuing."
            print_info "Run: nano .env.docker"
            exit 1
        else
            print_error ".env.docker.example not found!"
            exit 1
        fi
    fi

    # Validate critical environment variables
    source .env.docker

    if [ "$JWT_SECRET" = "CHANGE_THIS_TO_A_RANDOM_64_CHAR_STRING_FOR_PRODUCTION" ]; then
        print_error "Please change JWT_SECRET in .env.docker before deploying to production!"
        exit 1
    fi

    if [ "$POSTGRES_PASSWORD" = "CHANGE_THIS_STRONG_PASSWORD_123" ]; then
        print_error "Please change POSTGRES_PASSWORD in .env.docker before deploying to production!"
        exit 1
    fi

    print_success "Environment validation passed"

    docker-compose -f docker-compose.prod.yml --env-file .env.docker down
    docker-compose -f docker-compose.prod.yml --env-file .env.docker build
    docker-compose -f docker-compose.prod.yml --env-file .env.docker up -d

    print_success "Production deployment complete!"
    print_info "Use 'docker-compose -f docker-compose.prod.yml logs -f' to view logs"
}

# Stop services
stop_services() {
    print_info "Stopping services..."

    if [ "$1" = "prod" ]; then
        docker-compose -f docker-compose.prod.yml --env-file .env.docker down
    else
        docker-compose down
    fi

    print_success "Services stopped"
}

# View logs
view_logs() {
    if [ "$1" = "prod" ]; then
        docker-compose -f docker-compose.prod.yml --env-file .env.docker logs -f
    else
        docker-compose logs -f
    fi
}

# Backup database
backup_db() {
    BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"

    print_info "Creating database backup..."

    if [ "$1" = "prod" ]; then
        docker exec alcom-v4-postgres-prod pg_dump -U alcom alcom_v4 > "$BACKUP_FILE"
    else
        docker exec alcom-v4-postgres pg_dump -U alcom alcom_v4 > "$BACKUP_FILE"
    fi

    print_success "Backup created: $BACKUP_FILE"
}

# Show usage
show_usage() {
    echo "Alcom V4 - Docker Deployment Script"
    echo ""
    echo "Usage: ./docker-deploy.sh [command] [options]"
    echo ""
    echo "Commands:"
    echo "  dev              Deploy for development (with hot-reload)"
    echo "  prod             Deploy for production"
    echo "  stop [prod]      Stop services (add 'prod' for production)"
    echo "  logs [prod]      View logs (add 'prod' for production)"
    echo "  backup [prod]    Backup database (add 'prod' for production)"
    echo "  status           Show running containers"
    echo ""
    echo "Examples:"
    echo "  ./docker-deploy.sh dev"
    echo "  ./docker-deploy.sh prod"
    echo "  ./docker-deploy.sh stop"
    echo "  ./docker-deploy.sh logs prod"
    echo "  ./docker-deploy.sh backup prod"
}

# Show status
show_status() {
    print_info "Docker containers status:"
    docker ps -a | grep alcom-v4 || echo "No Alcom containers running"
}

# Main script
main() {
    echo "╔════════════════════════════════════════╗"
    echo "║   Alcom V4 - Docker Deployment         ║"
    echo "╚════════════════════════════════════════╝"
    echo ""

    # Check prerequisites
    check_docker
    check_docker_compose
    echo ""

    # Handle commands
    case "$1" in
        dev)
            deploy_dev
            ;;
        prod)
            deploy_prod
            ;;
        stop)
            stop_services "$2"
            ;;
        logs)
            view_logs "$2"
            ;;
        backup)
            backup_db "$2"
            ;;
        status)
            show_status
            ;;
        *)
            show_usage
            ;;
    esac
}

# Run main function
main "$@"
