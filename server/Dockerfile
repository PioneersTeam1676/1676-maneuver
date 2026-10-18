FROM node:20-bookworm-slim

WORKDIR /app

# openssl: Prisma engines. curl: container healthcheck.
RUN apt-get update && apt-get install -y openssl curl \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
# Full install first: the prisma CLI is a devDependency and is needed to
# generate the client for this image's platform. Prune dev deps afterwards
# (the generated client lives in node_modules/.prisma and survives).
RUN npm ci && npx prisma generate && npm prune --omit=dev

COPY src ./src

# Uploaded pit photos must outlive redeploys: mount a persistent volume here
# (Dokploy: Advanced → Volumes). Never bake data/ into the image — each
# rebuild would otherwise reset the photos to whatever was in git.
ENV NODE_ENV=production \
    PORT=4000 \
    IMAGE_STORAGE_DIR=/app/data/images
RUN mkdir -p /app/data/images && chown -R node:node /app/data

USER node
EXPOSE 4000

# /health returns 503 when MySQL is unreachable, so this reports a DB outage too.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["node", "src/index.js"]
