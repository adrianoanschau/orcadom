# syntax=docker/dockerfile:1
# Imagem só de migration/seed. A imagem da API instala dependências de
# produção e não traz o CLI do Prisma nem prisma/migrations.

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS pruner
RUN npm install -g turbo@2
COPY . .
RUN turbo prune @orcadom/database --docker

FROM base AS builder
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
ENV HUSKY=0
# prisma.config.ts exige DATABASE_URL até no generate. Não vai para a imagem final.
ENV DATABASE_URL=postgresql://x:x@127.0.0.1:5432/x?schema=public
# Todas as deps, inclusive devDependencies (prisma, tsx, bcryptjs).
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @orcadom/database db:generate

FROM base AS runner
ENV NODE_ENV=production
ENV HUSKY=0
RUN addgroup -S orcadom && adduser -S orcadom -G orcadom
COPY --from=builder --chown=orcadom:orcadom /app /app
WORKDIR /app/packages/database
USER orcadom
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]
