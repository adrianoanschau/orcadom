# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS pruner
RUN npm install -g turbo@2
COPY . .
RUN turbo prune @orcadom/web --docker

FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=/backend
ENV HUSKY=0
ENV DATABASE_URL=postgresql://orcadom:orcadom@127.0.0.1:5432/orcadom_db?schema=public
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=@orcadom/web

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_PUBLIC_API_URL=/backend
RUN addgroup -S orcadom && adduser -S orcadom -G orcadom
COPY --from=builder --chown=orcadom:orcadom /app/apps/web/.next/standalone ./
COPY --from=builder --chown=orcadom:orcadom /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=orcadom:orcadom /app/apps/web/public ./apps/web/public
USER orcadom
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
