#!/bin/bash
# deploy_heroku.sh - Heroku deployment script

echo "🚀 Starting Heroku deployment..."

# Check if heroku CLI is installed
if ! command -v heroku &> /dev/null; then
    echo "❌ Heroku CLI not found. Please install it first."
    exit 1
fi

# Check if logged in to Heroku
if ! heroku auth:whoami &> /dev/null; then
    echo "🔐 Please login to Heroku first:"
    heroku login
fi

# Set app name (change this to your app name)
APP_NAME=${1:-line-oa-middleware-stable}

echo "📱 App name: $APP_NAME"

# Create Heroku app if it doesn't exist
if heroku apps:info $APP_NAME &> /dev/null; then
    echo "✅ App $APP_NAME already exists"
else
    echo "🆕 Creating new Heroku app: $APP_NAME"
    heroku create $APP_NAME
fi

# Add PostgreSQL addon
echo "🐘 Adding PostgreSQL addon..."
heroku addons:create heroku-postgresql:essential-0 --app $APP_NAME || echo "PostgreSQL addon already exists"

# Set environment variables (if provided)
echo "⚙️ Setting environment variables..."

if [ ! -z "$LINE_CHANNEL_SECRET" ]; then
    heroku config:set LINE_CHANNEL_SECRET="$LINE_CHANNEL_SECRET" --app $APP_NAME
fi

if [ ! -z "$LINE_CHANNEL_ACCESS_TOKEN" ]; then
    heroku config:set LINE_CHANNEL_ACCESS_TOKEN="$LINE_CHANNEL_ACCESS_TOKEN" --app $APP_NAME
fi

if [ ! -z "$THUNDER_API_TOKEN" ]; then
    heroku config:set THUNDER_API_TOKEN="$THUNDER_API_TOKEN" --app $APP_NAME
fi

if [ ! -z "$OPENAI_API_KEY" ]; then
    heroku config:set OPENAI_API_KEY="$OPENAI_API_KEY" --app $APP_NAME
fi

# Set additional config vars
heroku config:set PYTHONPATH="." --app $APP_NAME
heroku config:set AI_ENABLED="true" --app $APP_NAME
heroku config:set SLIP_ENABLED="true" --app $APP_NAME
heroku config:set THUNDER_ENABLED="true" --app $APP_NAME

# Deploy to Heroku
echo "🚢 Deploying to Heroku..."
git add .
git commit -m "Deploy stable PostgreSQL version" || echo "No changes to commit"
git push heroku main

# Run migrations
echo "🔄 Running database migrations..."
heroku run python migrate_to_stable.py --app $APP_NAME

# Open the app
echo "🎉 Deployment completed!"
echo "🌐 App URL: https://$APP_NAME.herokuapp.com"
echo "🔧 Admin Panel: https://$APP_NAME.herokuapp.com/admin"
echo "💊 Health Check: https://$APP_NAME.herokuapp.com/health/comprehensive"

# Show logs
echo "📋 Showing recent logs..."
heroku logs --tail --app $APP_NAME
