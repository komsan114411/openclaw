"""
Simple LINE OA Webhook Middleware implemented with FastAPI.

This application demonstrates how to receive webhook events from LINE's Messaging API,
verify their signatures, dispatch them to sub‑services (e.g. slip checking,
chatbot, top‑up), and offer a minimal web interface for monitoring and
configuration. It is intended as a starting point for further development and
should not be used as‑is in production without additional security,
error‑handling, persistence and authentication.

Features:
  * Receives LINE webhook events on `/line/webhook`.
  * Verifies the `x‑line‑signature` header using the channel secret to ensure
    authenticity (see LINE docs: verifying the webhook signature is important
    【294202361817782†L63-L67】).
  * Dispatches events to placeholder sub‑services: slip checker, chatbot
    (using ChatGPT API via HTTP), and wallet top‑up.
  * Stores chat history in memory for review and provides a simple admin
    interface to view logs and add/update endpoints and API keys.
  * Persistent configuration using Heroku environment variables.
  * Virtual Channels for external bot integration.
  * Data persistence with fallback storage options.

Requirements:
  * Python 3.11 or later.
  * fastapi, uvicorn and requests are available in this environment.
  * Set the following environment variables before running:
      LINE_CHANNEL_SECRET – your LINE channel secret for signature verification.
      LINE_CHANNEL_ACCESS_TOKEN – your LINE channel access token to reply to users.
      OPENAI_API_KEY – your OpenAI API key (optional; if not set, chatbot will
        echo the received message instead of calling the API).
      WALLET_PHONE_NUMBER – phone number for wallet top-up (optional).

Running the app:
    uvicorn main_updated:app --host 0.0.0.0 --port 8000

Access admin page at http://localhost:8000/admin

Note: This example uses multiple storage backends for maximum persistence.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import sqlite3
import threading
import uuid
from datetime import datetime
from typing import Any, Dict, List

import requests
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.templating import Jinja2Templates

# Setup basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("line_middleware")

app = FastAPI(title="LINE OA Webhook Middleware")
templates = Jinja2Templates(directory="templates")

# Storage configuration with multiple backends
STORAGE_PATH = os.path.join(os.path.dirname(__file__), "storage.json")
DB_PATH = os.path.join(os.path.dirname(__file__), "storage.db")

# Check if running on Heroku
if 'DYNO' in os.environ:
    # Use temporary storage on Heroku, but try to use DATABASE_URL if available
    STORAGE_PATH = "/tmp/storage.json"
    DB_PATH = "/tmp/storage.db"
    
    # Try to use Heroku Postgres if available
    DATABASE_URL = os.getenv("DATABASE_URL")
    if DATABASE_URL:
        # Parse PostgreSQL URL for production use
        logger.info("PostgreSQL database detected, but using SQLite for simplicity")

# In-memory storage (fallback)
config_store: Dict[str, str] = {}
chat_history: List[Dict[str, Any]] = []
forward_endpoints: List[Dict[str, Any]] = []
virtual_channels: List[Dict[str, Any]] = []

# Storage backend flag
USE_DATABASE = True

def init_database() -> None:
    """Initialize SQLite database with required tables."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Config table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS config_store (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Chat history table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS chat_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                user_id TEXT,
                virtual_channel_id TEXT,
                channel_name TEXT,
                direction TEXT NOT NULL,
                message_data TEXT NOT NULL,
                sender TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Forward endpoints table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS forward_endpoints (
                id INTEGER PRIMARY KEY,
                url TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Virtual channels table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS virtual_channels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                channel_id TEXT UNIQUE NOT NULL,
                channel_secret TEXT NOT NULL,
                access_token TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                status TEXT DEFAULT 'active',
                channel_type TEXT DEFAULT 'virtual',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
        logger.info("Database initialized successfully")
        
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        global USE_DATABASE
        USE_DATABASE = False


def save_to_database() -> bool:
    """Save current in-memory data to database."""
    if not USE_DATABASE:
        return False
        
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Save config
        for key, value in config_store.items():
            cursor.execute('''
                INSERT OR REPLACE INTO config_store (key, value, updated_at)
                VALUES (?, ?, ?)
            ''', (key, value, datetime.utcnow().isoformat()))
        
        # Save virtual channels (clear and re-insert for simplicity)
        cursor.execute('DELETE FROM virtual_channels')
        for channel in virtual_channels:
            cursor.execute('''
                INSERT INTO virtual_channels 
                (channel_id, channel_secret, access_token, name, description, status, channel_type)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                channel.get('channel_id', ''),
                channel.get('channel_secret', ''),
                channel.get('access_token', ''),
                channel.get('name', ''),
                channel.get('description', ''),
                channel.get('status', 'active'),
                channel.get('type', 'virtual')
            ))
        
        # Save forward endpoints
        cursor.execute('DELETE FROM forward_endpoints')
        for endpoint in forward_endpoints:
            cursor.execute('''
                INSERT INTO forward_endpoints (id, url) VALUES (?, ?)
            ''', (endpoint.get('id', 0), endpoint.get('url', '')))
        
        # Save recent chat history (last 1000 entries)
        cursor.execute('DELETE FROM chat_history')
        for entry in chat_history[-1000:]:  # Keep only recent entries
            cursor.execute('''
                INSERT INTO chat_history 
                (timestamp, user_id, virtual_channel_id, channel_name, direction, message_data, sender)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                entry.get('timestamp', ''),
                entry.get('user_id', ''),
                entry.get('virtual_channel_id', ''),
                entry.get('channel_name', ''),
                entry.get('direction', ''),
                json.dumps(entry.get('message', entry.get('data', {}))),
                entry.get('sender', 'unknown')
            ))
        
        conn.commit()
        conn.close()
        logger.info("Data saved to database successfully")
        return True
        
    except Exception as e:
        logger.error(f"Failed to save to database: {e}")
        return False


def load_from_database() -> bool:
    """Load data from database to in-memory storage."""
    if not USE_DATABASE:
        return False
        
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Load config
        cursor.execute('SELECT key, value FROM config_store')
        global config_store
        config_store = dict(cursor.fetchall())
        
        # Load virtual channels
        cursor.execute('''
            SELECT channel_id, channel_secret, access_token, name, description, status, channel_type, created_at
            FROM virtual_channels ORDER BY id
        ''')
        global virtual_channels
        virtual_channels = []
        for row in cursor.fetchall():
            virtual_channels.append({
                'channel_id': row[0],
                'channel_secret': row[1],
                'access_token': row[2],
                'name': row[3],
                'description': row[4] or '',
                'status': row[5],
                'type': row[6],
                'created_at': row[7],
                'id': len(virtual_channels) + 1
            })
        
        # Load forward endpoints
        cursor.execute('SELECT id, url FROM forward_endpoints ORDER BY id')
        global forward_endpoints
        forward_endpoints = []
        for row in cursor.fetchall():
            forward_endpoints.append({
                'id': row[0],
                'url': row[1]
            })
        
        # Load chat history
        cursor.execute('''
            SELECT timestamp, user_id, virtual_channel_id, channel_name, direction, message_data, sender
            FROM chat_history ORDER BY created_at DESC LIMIT 1000
        ''')
        global chat_history
        chat_history = []
        for row in cursor.fetchall():
            try:
                message_data = json.loads(row[5]) if row[5] else {}
            except:
                message_data = {'type': 'text', 'text': str(row[5])}
                
            chat_history.append({
                'timestamp': row[0],
                'user_id': row[1] or '',
                'virtual_channel_id': row[2] or '',
                'channel_name': row[3] or '',
                'direction': row[4],
                'message': message_data,
                'data': message_data,
                'sender': row[6]
            })
        
        conn.close()
        logger.info(f"Data loaded from database: {len(virtual_channels)} channels, {len(chat_history)} chat entries")
        return True
        
    except Exception as e:
        logger.error(f"Failed to load from database: {e}")
        return False


def generate_virtual_channel() -> Dict[str, str]:
    """Generate virtual channel credentials for external bots."""
    channel_id = f"VC{uuid.uuid4().hex[:10].upper()}"
    channel_secret = secrets.token_urlsafe(32)
    access_token = f"VT{secrets.token_urlsafe(40)}"
    
    return {
        "channel_id": channel_id,
        "channel_secret": channel_secret,
        "access_token": access_token,
        "created_at": datetime.utcnow().isoformat(),
        "status": "active",
        "type": "virtual"
    }


def verify_virtual_channel(channel_id: str, channel_secret: str) -> bool:
    """Verify virtual channel credentials."""
    for channel in virtual_channels:
        if (channel.get("channel_id") == channel_id and 
            channel.get("channel_secret") == channel_secret and
            channel.get("status") == "active"):
            return True
    return False


def get_virtual_channel_by_token(access_token: str) -> Dict[str, Any]:
    """Get virtual channel by access token."""
    for channel in virtual_channels:
        if (channel.get("access_token") == access_token and
            channel.get("status") == "active"):
            return channel
    return {}


def get_virtual_channel_by_id(channel_id: str) -> Dict[str, Any]:
    """Get virtual channel by channel ID."""
    for channel in virtual_channels:
        if channel.get("channel_id") == channel_id:
            return channel
    return {}


def load_storage() -> None:
    """Load configuration and data from storage backends."""
    global config_store, chat_history, forward_endpoints, virtual_channels
    
    # Try database first
    if load_from_database():
        logger.info("Loaded data from database")
    elif os.path.exists(STORAGE_PATH):
        # Fallback to JSON file
        try:
            with open(STORAGE_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            config_store = data.get("config_store", {})
            chat_history = data.get("chat_history", [])
            forward_endpoints = data.get("forward_endpoints", [])
            virtual_channels = data.get("virtual_channels", [])
            logger.info("Loaded data from JSON file")
        except Exception as e:
            logger.error("Failed to load from JSON: %s", e)
            # Initialize defaults
            config_store = {}
            chat_history = []
            forward_endpoints = []
            virtual_channels = []
    else:
        # Initialize defaults
        config_store = {}
        chat_history = []
        forward_endpoints = []
        virtual_channels = []
        logger.info("Initialized with default data")

    # Always prioritize environment variables over stored values
    config_store.update({
        "line_channel_secret": os.getenv("LINE_CHANNEL_SECRET", config_store.get("line_channel_secret", "")),
        "line_channel_access_token": os.getenv("LINE_CHANNEL_ACCESS_TOKEN", config_store.get("line_channel_access_token", "")),
        "openai_api_key": os.getenv("OPENAI_API_KEY", config_store.get("openai_api_key", "")),
        "wallet_phone_number": os.getenv("WALLET_PHONE_NUMBER", config_store.get("wallet_phone_number", "")),
    })
    
    save_storage()


def save_storage() -> None:
    """Persist configuration and data to storage backends."""
    # Try database first
    if save_to_database():
        logger.debug("Data saved to database")
    
    # Always save to JSON as backup
    data = {
        "config_store": config_store,
        "chat_history": chat_history[-500:],  # Keep only recent entries in JSON
        "forward_endpoints": forward_endpoints,
        "virtual_channels": virtual_channels,
        "last_updated": datetime.utcnow().isoformat()
    }
    try:
        with open(STORAGE_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        logger.debug("Data saved to JSON file")
    except Exception as e:
        logger.error("Failed to save to JSON: %s", e)


# Initialize database and load existing data on application start
init_database()
load_storage()


def verify_line_signature(body: bytes, signature: str, channel_secret: str) -> bool:
    """Verify LINE webhook signature using HMAC‑SHA256."""
    if not channel_secret:
        logger.warning("Channel secret is not configured; skipping signature verification.")
        return True
    hash_digest = hmac.new(channel_secret.encode("utf-8"), body, hashlib.sha256).digest()
    computed = base64.b64encode(hash_digest).decode()
    valid = hmac.compare_digest(computed, signature)
    if not valid:
        logger.error("Invalid x‑line‑signature: computed %s but received %s", computed, signature)
    return valid


def dispatch_event(event: Dict[str, Any]) -> None:
    """Dispatch a single LINE webhook event to appropriate sub‑services."""
    event_type = event.get("type")
    source = event.get("source", {})
    user_id = source.get("userId")
    logger.info("Processing event_type=%s for user %s", event_type, user_id)

    if event_type == "message":
        message = event.get("message", {})
        # Store incoming message to chat history
        chat_history.append({
            "timestamp": datetime.utcnow().isoformat(),
            "user_id": user_id,
            "direction": "in",
            "message": message,
            "sender": "user"
        })
        save_storage()
        
        # Forward to virtual channels
        forward_event_to_virtual_channels(event)
        
        # Check if the message contains image (slip)
        if message.get("type") == "image":
            handle_slip_message(event)
        elif message.get("type") == "text":
            handle_chat_message(event)
    elif event_type == "postback":
        logger.info("Received postback: %s", event.get("postback"))
        forward_event_to_virtual_channels(event)
    else:
        logger.info("Unhandled event type: %s", event_type)

    # After internal processing, forward the event to all registered endpoints
    forward_event_to_external(event)


def forward_event_to_virtual_channels(event: Dict[str, Any]) -> None:
    """Forward LINE events to all active virtual channels."""
    for virtual_channel in virtual_channels:
        if virtual_channel.get("status") != "active":
            continue
            
        channel_id = virtual_channel.get("channel_id")
        # Create webhook payload similar to LINE format
        webhook_payload = {
            "destination": channel_id,
            "events": [event]
        }
        
        # Store forwarded event
        chat_history.append({
            "timestamp": datetime.utcnow().isoformat(),
            "virtual_channel_id": channel_id,
            "channel_name": virtual_channel.get("name", ""),
            "direction": "forwarded_to_virtual",
            "data": webhook_payload,
            "sender": "middleware"
        })
        
        logger.info(f"Forwarded event to virtual channel {channel_id}")
    
    save_storage()


def handle_slip_message(event: Dict[str, Any]) -> None:
    """Handle slip image messages."""
    message = event["message"]
    message_id = message.get("id")
    user_id = event["source"].get("userId")
    logger.info("Received slip image message_id=%s from user=%s", message_id, user_id)
    
    reply_token = event.get("replyToken")
    reply_text = "ได้รับสลิปแล้ว กำลังตรวจสอบ..."
    send_line_reply(reply_token, reply_text)


def handle_chat_message(event: Dict[str, Any]) -> None:
    """Handle normal text messages using ChatGPT or echo back."""
    message = event["message"]
    text = message.get("text", "")
    reply_token = event.get("replyToken")
    user_id = event["source"].get("userId")

    response_text = None
    api_key = config_store.get("openai_api_key")
    if api_key:
        try:
            url = "https://api.openai.com/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": "gpt-3.5-turbo",
                "messages": [
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user", "content": text},
                ],
                "max_tokens": 100,
                "temperature": 0.7,
            }
            r = requests.post(url, headers=headers, data=json.dumps(payload), timeout=10)
            r.raise_for_status()
            data = r.json()
            response_text = data["choices"][0]["message"]["content"].strip()
        except Exception as e:
            logger.error("ChatGPT API call failed: %s", e)
            response_text = "ขออภัย ระบบไม่สามารถตอบกลับได้ขณะนี้."
    else:
        response_text = f"คุณพิมพ์ว่า: {text}"

    # Store chat reply to history
    chat_history.append({
        "timestamp": datetime.utcnow().isoformat(),
        "user_id": user_id,
        "direction": "out",
        "message": {"type": "text", "text": response_text},
        "sender": "bot"
    })
    save_storage()

    send_line_reply(reply_token, response_text)


def send_line_reply(reply_token: str, text: str) -> None:
    """Send a reply message to the user via LINE's reply API."""
    access_token = config_store.get("line_channel_access_token")
    if not access_token:
        logger.error("Cannot reply because LINE channel access token is missing.")
        return
    url = "https://api.line.me/v2/bot/message/reply"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    body = {
        "replyToken": reply_token,
        "messages": [{"type": "text", "text": text}],
    }
    try:
        resp = requests.post(url, headers=headers, data=json.dumps(body), timeout=10)
        resp.raise_for_status()
        logger.info("Replied to user: %s", text)
    except Exception as e:
        logger.error("Failed to reply to LINE: %s", e)


def send_line_push(user_id: str, text: str) -> None:
    """Send a push message to the user via LINE's push API."""
    access_token = config_store.get("line_channel_access_token")
    if not access_token:
        logger.error("Cannot push because LINE channel access token is missing.")
        return
    url = "https://api.line.me/v2/bot/message/push"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    body = {
        "to": user_id,
        "messages": [{"type": "text", "text": text}],
    }
    try:
        resp = requests.post(url, headers=headers, data=json.dumps(body), timeout=10)
        resp.raise_for_status()
        logger.info("Pushed message to user: %s", text)
    except Exception as e:
        logger.error("Failed to push message to LINE: %s", e)


def forward_event_to_external(event: Dict[str, Any]) -> None:
    """Forward the event to all registered external webhook endpoints."""
    for endpoint in forward_endpoints:
        url = endpoint.get("url")
        if not url:
            continue
        try:
            headers = {"Content-Type": "application/json"}
            resp = requests.post(url, headers=headers, data=json.dumps(event), timeout=5)
            resp.raise_for_status()
            logger.info("Forwarded event to %s", url)
        except Exception as e:
            logger.error("Failed to forward event to %s: %s", url, e)


@app.post("/admin/send-message")
async def send_admin_message(request: Request) -> JSONResponse:
    """Send message from admin to user via API and store in chat history."""
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")
    
    user_id = data.get("user_id", "").strip()
    text = data.get("text", "").strip()
    
    if not user_id or not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="user_id and text are required")
    
    send_line_push(user_id, text)
    
    chat_history.append({
        "timestamp": datetime.utcnow().isoformat(),
        "user_id": user_id,
        "direction": "out",
        "message": {"type": "text", "text": text},
        "sender": "admin"
    })
    save_storage()
    
    return JSONResponse(content={"status": "sent", "message": "Message sent successfully"})


# ===== VIRTUAL CHANNEL ROUTES =====

@app.post("/admin/virtual-channels/create")
async def create_virtual_channel(request: Request) -> JSONResponse:
    """Create a new virtual channel for external bot integration."""
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")
    
    name = data.get("name", "").strip()
    description = data.get("description", "").strip()
    
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Channel name is required")
    
    virtual_channel = generate_virtual_channel()
    virtual_channel.update({
        "name": name,
        "description": description,
        "id": len(virtual_channels) + 1
    })
    
    virtual_channels.append(virtual_channel)
    save_storage()
    
    base_url = f"https://{request.headers.get('host', 'localhost')}"
    
    return JSONResponse(content={
        "status": "success",
        "channel": virtual_channel,
        "webhook_urls": {
            "messaging_api": f"{base_url}/virtual/{virtual_channel['channel_id']}/webhook",
            "content_api": f"{base_url}/virtual/{virtual_channel['channel_id']}/content",
            "push_api": f"{base_url}/virtual-api/v2/bot/message/push"
        }
    })


@app.post("/admin/virtual-channels/import-line")
async def import_line_credentials(request: Request) -> JSONResponse:
    """Import existing LINE channel credentials into virtual channel."""
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")
    
    name = data.get("name", "").strip()
    description = data.get("description", "").strip()
    line_channel_id = data.get("line_channel_id", "").strip()
    line_channel_secret = data.get("line_channel_secret", "").strip()
    
    if not all([name, line_channel_id, line_channel_secret]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing required fields")
    
    # Check if channel ID already exists
    for existing_channel in virtual_channels:
        if existing_channel.get("channel_id") == line_channel_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Channel ID already exists")
    
    # Generate access token for API calls
    access_token = f"VT{secrets.token_urlsafe(40)}"
    
    # Create virtual channel with LINE credentials
    virtual_channel = {
        "id": len(virtual_channels) + 1,
        "channel_id": line_channel_id,  # Use real LINE Channel ID
        "channel_secret": line_channel_secret,  # Use real LINE Channel Secret
        "access_token": access_token,  # Generated token for our API
        "name": name,
        "description": description,
        "created_at": datetime.utcnow().isoformat(),
        "status": "active",
        "type": "line_import"  # Mark as imported from LINE
    }
    
    virtual_channels.append(virtual_channel)
    save_storage()
    
    base_url = f"https://{request.headers.get('host', 'localhost')}"
    
    return JSONResponse(content={
        "status": "success",
        "channel": virtual_channel,
        "webhook_urls": {
            "messaging_api": f"{base_url}/virtual/{virtual_channel['channel_id']}/webhook",
            "content_api": f"{base_url}/virtual/{virtual_channel['channel_id']}/content",
            "push_api": f"{base_url}/virtual-api/v2/bot/message/push"
        }
    })


@app.get("/admin/virtual-channels", response_class=HTMLResponse)
async def admin_virtual_channels(request: Request):
    """Display virtual channels management page."""
    base_url = f"https://{request.headers.get('host', 'localhost')}"
    return templates.TemplateResponse(
        "virtual_channels.html", 
        {
            "request": request,
            "channels": virtual_channels,
            "base_url": base_url
        }
    )


@app.post("/admin/virtual-channels/{channel_id}/toggle")
async def toggle_virtual_channel(channel_id: str) -> JSONResponse:
    """Toggle virtual channel active/inactive status."""
    for channel in virtual_channels:
        if channel.get("channel_id") == channel_id:
            current_status = channel.get("status", "active")
            new_status = "inactive" if current_status == "active" else "active"
            channel["status"] = new_status
            save_storage()
            return JSONResponse(content={
                "status": "success", 
                "new_status": new_status,
                "message": f"Channel {channel_id} is now {new_status}"
            })
    
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Virtual channel not found")


@app.get("/admin/data-info")
async def get_data_info() -> JSONResponse:
    """Get information about data storage status."""
    db_exists = os.path.exists(DB_PATH) if USE_DATABASE else False
    json_exists = os.path.exists(STORAGE_PATH)
    
    try:
        json_size = os.path.getsize(STORAGE_PATH) if json_exists else 0
        db_size = os.path.getsize(DB_PATH) if db_exists else 0
    except:
        json_size = db_size = 0
    
    return JSONResponse(content={
        "storage_backends": {
            "database": {
                "enabled": USE_DATABASE,
                "exists": db_exists,
                "path": DB_PATH,
                "size_bytes": db_size
            },
            "json_file": {
                "enabled": True,
                "exists": json_exists,
                "path": STORAGE_PATH,
                "size_bytes": json_size
            }
        },
        "data_counts": {
            "virtual_channels": len(virtual_channels),
            "chat_history": len(chat_history),
            "forward_endpoints": len(forward_endpoints),
            "config_items": len(config_store)
        },
        "environment": {
            "is_heroku": 'DYNO' in os.environ,
            "database_url_available": bool(os.getenv("DATABASE_URL"))
        }
    })


# Virtual Channel API Endpoints

@app.post("/virtual/{channel_id}/webhook")
async def virtual_channel_webhook(channel_id: str, request: Request) -> JSONResponse:
    """Virtual webhook endpoint for external bots."""
    virtual_channel = get_virtual_channel_by_id(channel_id)
    
    if not virtual_channel or virtual_channel.get("status") != "active":
       raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Virtual channel not found or inactive")
   
   try:
       data = await request.json()
   except Exception:
       raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")
   
   logger.info(f"Received webhook from virtual channel {channel_id}: {data}")
   
   message_data = {
       "timestamp": datetime.utcnow().isoformat(),
       "virtual_channel_id": channel_id,
       "channel_name": virtual_channel.get("name", ""),
       "direction": "in",
       "data": data,
       "sender": "virtual_bot"
   }
   
   chat_history.append(message_data)
   save_storage()
   
   return JSONResponse(content={"status": "ok"})


@app.post("/virtual-api/v2/bot/message/push")
async def virtual_push_message(request: Request) -> JSONResponse:
   """Virtual LINE Push API for external bots."""
   auth_header = request.headers.get("authorization", "")
   if not auth_header.startswith("Bearer "):
       raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authorization header")
   
   access_token = auth_header[7:]
   virtual_channel = get_virtual_channel_by_token(access_token)
   
   if not virtual_channel or virtual_channel.get("status") != "active":
       raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token or inactive channel")
   
   try:
       data = await request.json()
   except Exception:
       raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")
   
   to_user = data.get("to")
   messages = data.get("messages", [])
   
   if not to_user or not messages:
       raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing required fields")
   
   # Send message via real LINE API
   for message in messages:
       if message.get("type") == "text":
           send_line_push(to_user, message.get("text", ""))
   
   # Log virtual channel outbound message
   chat_history.append({
       "timestamp": datetime.utcnow().isoformat(),
       "user_id": to_user,
       "virtual_channel_id": virtual_channel.get("channel_id"),
       "channel_name": virtual_channel.get("name", ""),
       "direction": "out",
       "message": messages[0] if messages else {},
       "sender": "virtual_bot"
   })
   save_storage()
   
   logger.info(f"Virtual channel {virtual_channel.get('channel_id')} sent message to {to_user}")
   
   return JSONResponse(content={"status": "ok"})


@app.post("/virtual-api/v2/bot/message/reply")
async def virtual_reply_message(request: Request) -> JSONResponse:
   """Virtual LINE Reply API for external bots."""
   auth_header = request.headers.get("authorization", "")
   if not auth_header.startswith("Bearer "):
       raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authorization header")
   
   access_token = auth_header[7:]
   virtual_channel = get_virtual_channel_by_token(access_token)
   
   if not virtual_channel or virtual_channel.get("status") != "active":
       raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token or inactive channel")
   
   try:
       data = await request.json()
   except Exception:
       raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")
   
   reply_token = data.get("replyToken")
   messages = data.get("messages", [])
   
   if not reply_token or not messages:
       raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing required fields")
   
   # Send message via real LINE API
   for message in messages:
       if message.get("type") == "text":
           send_line_reply(reply_token, message.get("text", ""))
   
   # Log virtual channel reply message
   chat_history.append({
       "timestamp": datetime.utcnow().isoformat(),
       "reply_token": reply_token,
       "virtual_channel_id": virtual_channel.get("channel_id"),
       "channel_name": virtual_channel.get("name", ""),
       "direction": "out",
       "message": messages[0] if messages else {},
       "sender": "virtual_bot"
   })
   save_storage()
   
   logger.info(f"Virtual channel {virtual_channel.get('channel_id')} replied with token {reply_token}")
   
   return JSONResponse(content={"status": "ok"})


@app.get("/virtual-api/v2/bot/message/{message_id}/content")
async def virtual_get_content(message_id: str, request: Request):
   """Virtual LINE Content API for external bots."""
   auth_header = request.headers.get("authorization", "")
   if not auth_header.startswith("Bearer "):
       raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authorization header")
   
   access_token = auth_header[7:]
   virtual_channel = get_virtual_channel_by_token(access_token)
   
   if not virtual_channel or virtual_channel.get("status") != "active":
       raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token or inactive channel")
   
   # Proxy request to real LINE API
   real_access_token = config_store.get("line_channel_access_token")
   if not real_access_token:
       raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Real LINE API not configured")
   
   try:
       real_url = f"https://api-data.line.me/v2/bot/message/{message_id}/content"
       headers = {"Authorization": f"Bearer {real_access_token}"}
       
       response = requests.get(real_url, headers=headers, timeout=30, stream=True)
       response.raise_for_status()
       
       def iterfile():
           for chunk in response.iter_content(chunk_size=8192):
               yield chunk
       
       return StreamingResponse(
           iterfile(),
           media_type=response.headers.get("Content-Type", "application/octet-stream"),
           headers={
               "Content-Length": response.headers.get("Content-Length", ""),
               "Content-Disposition": response.headers.get("Content-Disposition", "")
           }
       )
       
   except Exception as e:
       logger.error(f"Failed to get content from LINE API: {e}")
       raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve content")


# ===== WEB ROUTES =====

@app.get("/", response_class=HTMLResponse)
async def root():
   """Redirect root path to admin page."""
   return RedirectResponse(url="/admin", status_code=status.HTTP_302_FOUND)


@app.post("/line/webhook")
async def line_webhook(request: Request) -> JSONResponse:
   """Endpoint to receive LINE webhook events."""
   body = await request.body()
   signature = request.headers.get("x-line-signature", "")
   channel_secret = config_store.get("line_channel_secret", "")
   
   if not verify_line_signature(body, signature, channel_secret):
       raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid signature")
   
   try:
       payload = json.loads(body.decode("utf-8"))
   except json.JSONDecodeError:
       raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")
   
   events = payload.get("events", [])
   for event in events:
       threading.Thread(target=dispatch_event, args=(event,), daemon=True).start()
   
   return JSONResponse(content={"status": "ok"})


@app.get("/admin", response_class=HTMLResponse)
async def admin_home(request: Request):
   """Admin home page showing simple menu and current configuration."""
   base_url = str(request.base_url).rstrip('/')
   webhook_url = f"{base_url}/line/webhook"
   slip_url = f"{base_url}/bot/slip"
   
   return templates.TemplateResponse(
       "admin_home.html", 
       {
           "request": request, 
           "config": config_store,
           "webhook_url": webhook_url,
           "slip_webhook_url": slip_url,
           "virtual_channels_count": len([c for c in virtual_channels if c.get("status") == "active"]),
           "total_chat_history": len(chat_history),
           "storage_backend": "Database + JSON" if USE_DATABASE else "JSON only"
       }
   )


@app.get("/admin/chat", response_class=HTMLResponse)
async def admin_chat(request: Request):
   """View chat history in a table."""
   return templates.TemplateResponse("chat_history.html", {"request": request, "chat_history": chat_history})


@app.get("/admin/forwarding", response_class=HTMLResponse)
async def admin_forwarding(request: Request):
   """Display and manage external forwarding endpoints."""
   return templates.TemplateResponse(
       "forwarding.html", {
           "request": request,
           "endpoints": forward_endpoints,
       }
   )


@app.post("/admin/forwarding/add")
async def add_forwarding(request: Request) -> RedirectResponse:
   """Add a new forwarding endpoint."""
   try:
       data = await request.json()
   except Exception:
       raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON body")
   
   url = data.get("url", "").strip()
   if not url:
       raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="URL cannot be empty")
   
   next_id = 1
   if forward_endpoints:
       next_id = max(ep.get("id", 0) for ep in forward_endpoints) + 1
   
   forward_endpoints.append({"id": next_id, "url": url})
   save_storage()
   
   return RedirectResponse(url=app.url_path_for("admin_forwarding"), status_code=status.HTTP_302_FOUND)


@app.post("/admin/forwarding/delete")
async def delete_forwarding(request: Request) -> RedirectResponse:
   """Delete a forwarding endpoint by id."""
   try:
       data = await request.json()
   except Exception:
       raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON body")
   
   try:
       remove_id = int(data.get("id"))
   except (TypeError, ValueError):
       raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid id")
   
   global forward_endpoints
   forward_endpoints = [ep for ep in forward_endpoints if ep.get("id") != remove_id]
   save_storage()
   
   return RedirectResponse(url=app.url_path_for("admin_forwarding"), status_code=status.HTTP_302_FOUND)


@app.post("/bot/slip")
async def slip_bot_webhook(request: Request) -> JSONResponse:
   """Endpoint for the slip‑checking bot to send results back to the middleware."""
   try:
       data = await request.json()
   except Exception:
       raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON body")
   
   text = data.get("text", "").strip()
   reply_token = data.get("reply_token")
   user_id = data.get("user_id")
   
   if not text:
       raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Text is required")
   
   if reply_token:
       send_line_reply(reply_token, text)
   elif user_id:
       send_line_push(user_id, text)
       chat_history.append({
           "timestamp": datetime.utcnow().isoformat(),
           "user_id": user_id,
           "direction": "out",
           "message": {"type": "text", "text": text},
           "sender": "slip_bot"
       })
       save_storage()
   else:
       raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Either reply_token or user_id must be provided")
   
   return JSONResponse(content={"status": "sent"})


@app.get("/admin/settings", response_class=HTMLResponse)
async def admin_settings(request: Request):
   """Display configuration form for updating tokens and settings."""
   return templates.TemplateResponse("settings.html", {"request": request, "config": config_store})


@app.post("/admin/settings/update")
async def update_settings(request: Request) -> JSONResponse:
   """Update configuration based on JSON payload from the settings page."""
   try:
       data = await request.json()
   except Exception:
       raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON body")
   
   updated_keys = []
   for key in [
       "line_channel_secret",
       "line_channel_access_token", 
       "openai_api_key",
       "wallet_phone_number",
   ]:
       if key in data:
           old_value = config_store.get(key, "")
           new_value = str(data[key]).strip()
           config_store[key] = new_value
           if old_value != new_value:
               updated_keys.append(key)
   
   save_storage()
   
   if updated_keys:
       logger.info(f"Updated config keys: {updated_keys}")
   
   return JSONResponse(content={
       "status": "success", 
       "message": "การตั้งค่าถูกอัปเดตแล้ว! หากต้องการให้การตั้งค่าคงอยู่หลัง restart ให้อัปเดต Config Vars ใน Heroku Dashboard ด้วย",
       "updated_keys": updated_keys
   })
