#!/bin/sh

# Start frontend in background
cd /app/frontend
HOSTNAME=0.0.0.0 PORT=3000 node server.js &

# Start backend in foreground
cd /app
node dist/main.js
