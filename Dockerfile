FROM node:22-bookworm-slim AS builder

WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    SUPABASE_DATABASE_URL=postgresql://build:build@localhost:5432/build \
    DIRECT_URL=postgresql://build:build@localhost:5432/build

COPY . .
RUN npm ci
RUN npm run build:shared
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/apps/backend
RUN npx prisma generate --schema prisma/schema.prisma
WORKDIR /app
RUN npx tsc -p apps/backend --noEmitOnError false --pretty false || test -f apps/backend/dist/server.js

WORKDIR /app/apps/mobile
ENV EXPO_PUBLIC_APP_ENV=production
ENV EXPO_PUBLIC_API_URL=https://migoapp.com
RUN NODE_PATH=/app/apps/mobile/node_modules npx expo export --platform web --output-dir dist

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    WEB_DIST_DIR=/app/web \
    UPLOADS_DIR=/data/uploads

RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-core fonts-noto-color-emoji ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=builder /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/public ./apps/backend/public
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/mobile/dist ./web

WORKDIR /app/apps/backend
RUN mkdir -p /data/uploads

VOLUME ["/data"]
EXPOSE 5000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
