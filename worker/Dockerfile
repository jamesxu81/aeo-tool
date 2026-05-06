FROM node:20-slim AS base

# Install system deps needed by Playwright (Chromium) + native modules
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    python3 \
    make \
    g++ \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Tell Playwright to use the system Chromium (skip its own download)
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# ---- deps stage ----
FROM base AS deps
WORKDIR /app

# Copy manifests first for layer caching
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma

RUN npm install -g pnpm@9 && \
    pnpm install --frozen-lockfile && \
    pnpm exec prisma generate

# ---- runner stage ----
FROM base AS runner
WORKDIR /app

# Copy node_modules + generated Prisma client from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source — worker + shared src/lib
COPY worker ./worker
COPY src ./src
COPY prisma ./prisma
COPY tsconfig.json ./
COPY package.json ./

# Non-root user for security
RUN useradd -m worker
USER worker

# Health: just keeps the process alive (BullMQ worker doesn't expose HTTP)
# Railway detects the process running as the health check

CMD ["node_modules/.bin/tsx", "worker/index.ts"]
