# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./backend/

# Install dependencies
RUN cd backend && npm ci

# Copy backend source
COPY backend/ ./backend/

# Build backend
RUN cd backend && npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy built backend
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/package*.json ./

# Set environment
ENV NODE_ENV=production
ENV PORT=4000

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/health || exit 1

# Start the application
CMD ["node", "dist/main.js"]
