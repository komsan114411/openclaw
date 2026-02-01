# Build stage
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage - With Chromium + Xvfb for LINE Extension support
FROM node:20-slim AS runner

# Install Chromium, Xvfb (virtual display), and dependencies for Puppeteer
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

# Set Puppeteer environment variables - NON-HEADLESS for extension support
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_HEADLESS=false \
    DISPLAY=:99 \
    NODE_ENV=production

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Copy extensions directory (for LINE extension)
COPY --from=builder /app/extensions ./extensions
RUN mkdir -p /app/extensions/line

# Set extension path
ENV LINE_EXTENSION_PATH=/app/extensions/line

EXPOSE 4000

# Increase Node.js memory limit to 8GB
ENV NODE_OPTIONS="--max-old-space-size=8192"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "const http = require('http'); http.get('http://localhost:4000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start Xvfb (virtual display) then node
CMD Xvfb :99 -screen 0 1280x800x24 & sleep 2 && node dist/main.js
