# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS pruner
RUN npm install -g turbo@2
COPY . .
RUN turbo prune @orcadom/api --docker

FROM base AS builder
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
ENV HUSKY=0
# prisma.config.ts exige DATABASE_URL até no generate
ENV DATABASE_URL=postgresql://orcadom:orcadom@127.0.0.1:5432/orcadom_db?schema=public
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=@orcadom/api

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HUSKY=0
RUN addgroup -S orcadom && adduser -S orcadom -G orcadom
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile --prod --ignore-scripts
COPY --from=builder --chown=orcadom:orcadom /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=orcadom:orcadom /app/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=orcadom:orcadom /app/packages/types/dist ./packages/types/dist
USER orcadom
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]
