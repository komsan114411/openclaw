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
from jinja2 import Environment

from config import config_store
from models.database import init_database, save_chat_history, get_user_chat_history
from services.chat_bot import get_chat_response
from services.slip_checker import verify_slip_with_thunder

# Setup basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("line_middleware")

app = FastAPI(title="LINE OA Webhook Middleware")
templates = Jinja2Templates(directory="templates")

# สร้างสภาพแวดล้อม Jinja2 และเพิ่มฟิลเตอร์ strftime
def format_datetime(value, format_string="%Y-%m-%d %H:%M:%S"):
    """
    Custom Jinja2 filter to format datetime objects.
    Note: Jinja2 doesn't have strftime by default.
    """
    if isinstance(value, datetime):
        return value.strftime(format_string)
    if value == "now":
        return datetime.now().strftime(format_string)
    return value

templates.env.filters['strftime'] = format_datetime

# Storage configuration with multiple backends
STORAGE_PATH = os.path.join(os.path.dirname(__file__), "storage.json")
DB_PATH = os.path.join(os.path.dirname(__file__), "storage.db")

# In-memory storage (fallback)
chat_history: List[Dict[str, Any]] = []
forward_endpoints: List[Dict[str, Any]] = []
virtual_channels: List[Dict[str, Any]] = []

# Storage backend flag
USE_DATABASE = True

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
        
        conn.close()
        logger.info(f"Data loaded from database: {len(virtual_channels)} channels")
        return True
        
    except Exception as e:
        logger.error(f"Failed to load from database: {e}")
        return False

def save_storage() -> None:
    """Persist configuration and data to storage backends."""
    if save_to_database():
        logger.debug("Data saved to database")
    
    data = {
        "config_store": config_store,
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

init_database()

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
    reply_token = event.get("replyToken")

    logger.info("Processing event_type=%s for user %s", event_type, user_id)

    if event_type == "message":
        message = event.get("message", {})
        
        # Save incoming message to chat history
        save_chat_history(user_id, "in", message, "user")
        
        # Handle different message types
        if message.get("type") == "image":
            reply_text = verify_slip_with_thunder(message.get("id"))
            send_line_reply(reply_token, reply_text)
            save_chat_history(user_id, "out", {"type": "text", "text": reply_text}, "slip_bot")
        elif message.get("type") == "text":
            reply_text = get_chat_response(message.get("text"), user_id)
            send_line_reply(reply_token, reply_text)
            save_chat_history(user_id, "out", {"type": "text", "text": reply_text}, "chat_bot")
    
    # After internal processing, forward the event to all registered endpoints
    # forward_event_to_external(event) # This function is not defined in the new structure
    
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


# ===== WEB ROUTES =====

@app.get("/", response_class=HTMLResponse)
async def root():
    return RedirectResponse(url="/admin", status_code=status.HTTP_302_FOUND)

@app.post("/line/webhook")
async def line_webhook(request: Request) -> JSONResponse:
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
    base_url = str(request.base_url).rstrip('/')
    webhook_url = f"{base_url}/line/webhook"
    slip_url = f"{base_url}/bot/slip"
    current_time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    return templates.TemplateResponse(
        "admin_home.html", 
        {
            "request": request, 
            "config": config_store,
            "webhook_url": webhook_url,
            "slip_webhook_url": slip_url,
            "virtual_channels_count": len([c for c in virtual_channels if c.get("status") == "active"]),
            "total_chat_history": len(chat_history),
            "storage_backend": "Database + JSON" if USE_DATABASE else "JSON only",
            "last_updated_time": current_time_str
        }
    )

@app.get("/admin/chat", response_class=HTMLResponse)
async def admin_chat(request: Request):
    # ปรับให้ดึง chat history จากฐานข้อมูล
    # chat_history = get_all_chat_history() # ฟังก์ชันนี้ต้องสร้างเพิ่ม
    return templates.TemplateResponse("chat_history.html", {"request": request, "chat_history": chat_history})

@app.post("/admin/send-message")
async def send_admin_message(request: Request) -> JSONResponse:
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")
    
    user_id = data.get("user_id", "").strip()
    text = data.get("text", "").strip()
    
    if not user_id or not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="user_id and text are required")
    
    send_line_push(user_id, text)
    
    save_chat_history(user_id, "out", {"type": "text", "text": text}, "admin")
    
    return JSONResponse(content={"status": "sent", "message": "Message sent successfully"})

# ===== VIRTUAL CHANNEL ROUTES =====
# These are kept for completeness, but they might need to be adjusted or removed
# depending on your final project scope.
@app.post("/admin/virtual-channels/create")
async def create_virtual_channel(request: Request) -> JSONResponse:
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")
    
    name = data.get("name", "").strip()
    description = data.get("description", "").strip()
    
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Channel name is required")
    
    virtual_channel = {
        "channel_id": f"VC{uuid.uuid4().hex[:10].upper()}",
        "channel_secret": secrets.token_urlsafe(32),
        "access_token": f"VT{secrets.token_urlsafe(40)}",
        "created_at": datetime.utcnow().isoformat(),
        "status": "active",
        "type": "virtual",
        "name": name,
        "description": description,
        "id": len(virtual_channels) + 1
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

@app.post("/admin/virtual-channels/import-line")
async def import_line_credentials(request: Request) -> JSONResponse:
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
    
    for existing_channel in virtual_channels:
        if existing_channel.get("channel_id") == line_channel_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Channel ID already exists")
    
    access_token = f"VT{secrets.token_urlsafe(40)}"
    
    virtual_channel = {
        "id": len(virtual_channels) + 1,
        "channel_id": line_channel_id,
        "channel_secret": line_channel_secret,
        "access_token": access_token,
        "name": name,
        "description": description,
        "created_at": datetime.utcnow().isoformat(),
        "status": "active",
        "type": "line_import"
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
            "chat_history": 0, # Note: This needs a function to count entries in the DB
            "forward_endpoints": len(forward_endpoints),
            "config_items": len(config_store)
        },
        "environment": {
            "is_heroku": 'DYNO' in os.environ,
            "database_url_available": bool(os.getenv("DATABASE_URL"))
        }
    })

@app.get("/admin/forwarding", response_class=HTMLResponse)
async def admin_forwarding(request: Request):
    return templates.TemplateResponse(
        "forwarding.html", {
            "request": request,
            "endpoints": forward_endpoints,
        }
    )

@app.post("/admin/forwarding/add")
async def add_forwarding(request: Request) -> RedirectResponse:
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

@app.get("/admin/settings", response_class=HTMLResponse)
async def admin_settings(request: Request):
    return templates.TemplateResponse("settings.html", {"request": request, "config": config_store})

@app.post("/admin/settings/update")
async def update_settings(request: Request) -> JSONResponse:
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
        "THUNDER_API_TOKEN", # Added Thunder API Token
        "AI_ENABLED",
        "SLIP_ENABLED",
        "AI_PROMPT"
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

# The following endpoints are related to Virtual Channels and are kept for completeness,
# but they need proper implementation to interact with the new database model.
@app.post("/virtual/{channel_id}/webhook")
async def virtual_channel_webhook(channel_id: str, request: Request) -> JSONResponse:
    pass

@app.post("/virtual-api/v2/bot/message/push")
async def virtual_push_message(request: Request) -> JSONResponse:
    pass

@app.post("/virtual-api/v2/bot/message/reply")
async def virtual_reply_message(request: Request) -> JSONResponse:
    pass

@app.get("/virtual-api/v2/bot/message/{message_id}/content")
async def virtual_get_content(message_id: str, request: Request):
    pass
