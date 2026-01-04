# =============================================================================
# Dockerfile - MCP Memory Server
# =============================================================================

FROM node:20-alpine

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Create data directory for SQLite
RUN mkdir -p /data
VOLUME /data

# Set database path to persistent volume
ENV DB_PATH=/data/brain.db

# Expose port (for future HTTP mode)
EXPOSE 3100

# Run the server
CMD ["node", "dist/index.js"]
