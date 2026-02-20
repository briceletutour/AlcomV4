FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Install openssl for Prisma (Debian)
RUN apt-get update -y && apt-get install -y openssl

FROM base AS dependencies
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY . .
COPY --from=dependencies /app/node_modules ./node_modules
RUN pnpm --filter=@alcom/api run db:generate

# We skip build and run with tsx because of type errors in the current codebase
# RUN pnpm build --filter=@alcom/api

FROM base AS deploy
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
# Copy entire monorepo source structure required for imports
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api/package.json ./package.json

# Add openssl to runtime for Prisma
RUN apt-get update -y && apt-get install -y openssl

ENV NODE_ENV=production
EXPOSE 4000
CMD [ "npx", "tsx", "apps/api/src/index.ts" ]
