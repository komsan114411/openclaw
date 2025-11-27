#!/bin/bash

# LINE OA Management System - Start Script

echo "🚀 Starting LINE OA Management System..."
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please copy .env.example to .env and configure it:"
    echo "  cp .env.example .env"
    echo ""
    exit 1
fi

# Check if MongoDB URI is configured
if grep -q "mongodb+srv://username:password" .env; then
    echo "⚠️  Warning: MongoDB URI is not configured!"
    echo "Please edit .env file and set your MONGODB_URI"
    echo ""
    exit 1
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "📥 Installing dependencies..."
pip install -r requirements.txt

# Run the application
echo ""
echo "✅ Starting server..."
echo "🌐 Access the application at: http://localhost:8000"
echo "👤 Default admin credentials:"
echo "   Username: admin"
echo "   Password: admin123"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

uvicorn main:app --host 0.0.0.0 --port 8000 --reload

