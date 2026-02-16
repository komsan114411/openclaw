# Build stage for Frontend (static export)
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
ENV NEXT_PUBLIC_API_URL=/api
ENV NEXT_OUTPUT=export
RUN npm run build

# Build stage for Backend
FROM node:20-slim AS backend-builder

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci

COPY backend/ ./
RUN npm run build

# Production stage - Single container with Chromium for Puppeteer
# Cache bust: 2026-02-01-v4-bundled-extension
FROM node:20-slim AS production

# Install Chromium, xvfb (virtual display), and dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    xvfb \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend (including bundled LINE extension)
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY --from=backend-builder /app/backend/package*.json ./
COPY --from=backend-builder /app/backend/extensions ./extensions

# Copy frontend static files to public directory
COPY --from=frontend-builder /app/frontend/out ./public

# Set Puppeteer environment variables - NON-HEADLESS for extension support
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_HEADLESS=false \
    LINE_EXTENSION_PATH=/app/extensions/line \
    DISPLAY=:99 \
    NODE_ENV=production \
    PORT=4000

# Increase Node.js memory limit to 8GB
ENV NODE_OPTIONS="--max-old-space-size=8192"

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "const http = require('http'); http.get('http://localhost:4000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start xvfb and then node
CMD Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset & sleep 2 && node dist/main.js
