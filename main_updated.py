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

# Check if running on Heroku
if 'DYNO' in os.environ:
    STORAGE_PATH = "/tmp/storage.json"
    DB_PATH = "/tmp/storage.db"
    
    DATABASE_URL = os.getenv("DATABASE_URL")
    if DATABASE_URL:
        logger.info("PostgreSQL database detected, but using SQLite for simplicity")

# In-memory storage (fallback)
chat_history: List[Dict[str, Any]] = []
forward_endpoints: List[Dict[str, Any]] = []
virtual_channels: List[Dict[str, Any]] = []

USE_DATABASE = True

def save_to_database() -> bool:
    if not USE_DATABASE:
        return False
        
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        for key, value in config_store.items():
            cursor.execute('''
                INSERT OR REPLACE INTO config_store (key, value) VALUES (?, ?)
            ''', (key, value))
        
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
    if not USE_DATABASE:
        return False
        
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
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
        
        save_chat_history(user_id, "in", message, "user")
        
        if message.get("type") == "image":
            reply_text = verify_slip_with_thunder(message.get("id"))
            send_line_reply(reply_token, reply_text)
            save_chat_history(user_id, "out", {"type": "text", "text": reply_text}, "slip_bot")
        elif message.get("type") == "text":
            reply_text = get_chat_response(message.get("text"), user_id)
            send_line_reply(reply_token, reply_text)
            save_chat_history(user_id, "out", {"type": "text", "text": reply_text}, "chat_bot")

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
    # chat_history = get_all_chat_history()
    return templates.TemplateResponse("chat_history.html", {"request": request, "chat_history": chat_history})

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
    
@app.post("/bot/slip")
async def slip_bot_webhook(request: Request) -> JSONResponse:
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


@app.post("/virtual/{channel_id}/webhook")
async def virtual_channel_webhook(channel_id: str, request: Request) -> JSONResponse:
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
    
    for message in messages:
        if message.get("type") == "text":
            send_line_push(to_user, message.get("text", ""))
    
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
    
    for message in messages:
        if message.get("type") == "text":
            send_line_reply(reply_token, message.get("text", ""))
    
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
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authorization header")
    
    access_token = auth_header[7:]
    virtual_channel = get_virtual_channel_by_token(access_token)
    
    if not virtual_channel or virtual_channel.get("status") != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token or inactive channel")
    
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
