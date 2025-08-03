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

Note: This example uses in‑memory storage for simplicity. In a real system you
would likely persist configurations and chat logs to a database and add
authentication for admin endpoints.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import threading
from datetime import datetime
from typing import Any, Dict, List

import requests
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

# Setup basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("line_middleware")

app = FastAPI(title="LINE OA Webhook Middleware")
templates = Jinja2Templates(directory="templates")

# Persistent storage configuration. All state (config, chat history, forward endpoints)
# will be stored in this JSON file. If the file does not exist at startup it
# will be created with default values.
STORAGE_PATH = os.path.join(os.path.dirname(__file__), "storage.json")

# Check if running on Heroku
if 'DYNO' in os.environ:
    # Use temporary storage on Heroku
    STORAGE_PATH = "/tmp/storage.json"

config_store: Dict[str, str] = {}
chat_history: List[Dict[str, Any]] = []
forward_endpoints: List[Dict[str, Any]] = []


def load_storage() -> None:
    """Load configuration and data from storage file."""
    global config_store, chat_history, forward_endpoints
    if os.path.exists(STORAGE_PATH):
        try:
            with open(STORAGE_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            config_store = data.get("config_store", {})
            chat_history = data.get("chat_history", [])
            forward_endpoints = data.get("forward_endpoints", [])
        except Exception as e:
            logger.error("Failed to load storage: %s", e)
            config_store = {}
            chat_history = []
            forward_endpoints = []
    else:
        # Initialize defaults
        config_store = {}
        chat_history = []
        forward_endpoints = []

    # Always prioritize environment variables over stored values
    config_store.update({
        "line_channel_secret": os.getenv("LINE_CHANNEL_SECRET", config_store.get("line_channel_secret", "")),
        "line_channel_access_token": os.getenv("LINE_CHANNEL_ACCESS_TOKEN", config_store.get("line_channel_access_token", "")),
        "openai_api_key": os.getenv("OPENAI_API_KEY", config_store.get("openai_api_key", "")),
        "wallet_phone_number": os.getenv("WALLET_PHONE_NUMBER", config_store.get("wallet_phone_number", "")),
    })
    
    save_storage()


def save_storage() -> None:
    """Persist configuration and data to storage file."""
    data = {
        "config_store": config_store,
        "chat_history": chat_history,
        "forward_endpoints": forward_endpoints,
    }
    try:
        with open(STORAGE_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error("Failed to save storage: %s", e)


# Load existing data on application start
load_storage()

def verify_line_signature(body: bytes, signature: str, channel_secret: str) -> bool:
    """Verify LINE webhook signature using HMAC‑SHA256.

    Args:
        body: Raw request body (bytes).
        signature: Value of `x‑line‑signature` header.
        channel_secret: Channel secret string.

    Returns:
        True if signature matches; False otherwise.
    """
    if not channel_secret:
        # If the secret isn't configured, skip verification (not recommended).
        logger.warning("Channel secret is not configured; skipping signature verification.")
        return True
    hash_digest = hmac.new(channel_secret.encode("utf-8"), body, hashlib.sha256).digest()
    computed = base64.b64encode(hash_digest).decode()
    valid = hmac.compare_digest(computed, signature)
    if not valid:
        logger.error("Invalid x‑line‑signature: computed %s but received %s", computed, signature)
    return valid


def dispatch_event(event: Dict[str, Any]) -> None:
    """Dispatch a single LINE webhook event to appropriate sub‑services.

    For demonstration, this function handles three event types:
    message (calls slip checker and/or chatbot),
    postback (could be used for other interactions),
    others – logged but ignored.

    The real implementation should include error handling, asynchronous queues
    and persistence.
    """
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
        # Check if the message contains image (slip)
        if message.get("type") == "image":
            handle_slip_message(event)
        elif message.get("type") == "text":
            handle_chat_message(event)
    elif event_type == "postback":
        # Example: handle postback data for top‑up etc.
        logger.info("Received postback: %s", event.get("postback"))
    else:
        logger.info("Unhandled event type: %s", event_type)

    # After internal processing, forward the event to all registered endpoints
    forward_event_to_external(event)


def handle_slip_message(event: Dict[str, Any]) -> None:
    """Placeholder slip checking handler.

    Retrieves image content ID from the event and logs a message. In a real
    implementation, this would download the image using LINE content API
    and perform OCR or other verification logic.
    """
    message = event["message"]
    message_id = message.get("id")
    user_id = event["source"].get("userId")
    logger.info("Received slip image message_id=%s from user=%s", message_id, user_id)
    # TODO: download image using message_id and check slip
    # For demonstration we just reply confirming receipt
    reply_token = event.get("replyToken")
    reply_text = "ได้รับสลิปแล้ว กำลังตรวจสอบ..."
    send_line_reply(reply_token, reply_text)


def handle_chat_message(event: Dict[str, Any]) -> None:
    """Handle normal text messages using ChatGPT or echo back.

    Uses the OpenAI API if an API key is configured; otherwise echoes the
    received message. Maintains chat history and replies via LINE's reply API.
    """
    message = event["message"]
    text = message.get("text", "")
    reply_token = event.get("replyToken")
    user_id = event["source"].get("userId")

    response_text = None
    api_key = config_store.get("openai_api_key")
    if api_key:
        try:
            # Call OpenAI Chat API
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
        # If no API key, echo the user's message
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

    # Send reply back to LINE user
    send_line_reply(reply_token, response_text)


def send_line_reply(reply_token: str, text: str) -> None:
    """Send a reply message to the user via LINE's reply API.

    Uses the configured channel access token. If not configured, logs an error
    instead of sending. See LINE Messaging API reference for details on
    reply API endpoints.
    """
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
        "messages": [
            {
                "type": "text",
                "text": text,
            }
        ],
    }
    try:
        resp = requests.post(url, headers=headers, data=json.dumps(body), timeout=10)
        resp.raise_for_status()
        logger.info("Replied to user: %s", text)
    except Exception as e:
        logger.error("Failed to reply to LINE: %s", e)


def send_line_push(user_id: str, text: str) -> None:
    """Send a push message to the user via LINE's push API.

    This is used when there is no reply token (e.g. when a background bot
    processes a slip and wants to notify the user). Requires the channel
    access token to be configured.
    """
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
        "messages": [
            {
                "type": "text",
                "text": text,
            }
        ],
    }
    try:
        resp = requests.post(url, headers=headers, data=json.dumps(body), timeout=10)
        resp.raise_for_status()
        logger.info("Pushed message to user: %s", text)
    except Exception as e:
        logger.error("Failed to push message to LINE: %s", e)


def forward_event_to_external(event: Dict[str, Any]) -> None:
    """Forward the event to all registered external webhook endpoints.

    Each endpoint is expected to be a URL stored in forward_endpoints. The
    function sends the raw event payload as JSON. Failures are logged but do
    not interrupt processing. In production you may want to implement retry
    logic or a message queue.
    """
    for endpoint in forward_endpoints:
        url = endpoint.get("url")
        if not url:
            continue
        try:
            headers = {"Content-Type": "application/json"}
            # Send the single event. If you want to send the entire payload you
            # could wrap the event in a dict.
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
    
    # Send message via LINE API
    send_line_push(user_id, text)
    
    # Store admin message to chat history
    chat_history.append({
        "timestamp": datetime.utcnow().isoformat(),
        "user_id": user_id,
        "direction": "out",
        "message": {"type": "text", "text": text},
        "sender": "admin"  # Mark as admin sent
    })
    save_storage()
    
    return JSONResponse(content={"status": "sent", "message": "Message sent successfully"})


# ===== WEB ROUTES =====

@app.get("/", response_class=HTMLResponse)
async def root():
    """Redirect root path to admin page."""
    return RedirectResponse(url="/admin", status_code=status.HTTP_302_FOUND)


@app.post("/line/webhook")
async def line_webhook(request: Request) -> JSONResponse:
    """Endpoint to receive LINE webhook events.

    Verifies signature, parses JSON body and dispatches each event.
    """
    body = await request.body()
    signature = request.headers.get("x-line-signature", "")
    channel_secret = config_store.get("line_channel_secret", "")
    # Verify signature
    if not verify_line_signature(body, signature, channel_secret):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid signature")
    # Parse JSON
    try:
        payload = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")
    events = payload.get("events", [])
    for event in events:
        # Dispatch asynchronously using thread to avoid blocking
        threading.Thread(target=dispatch_event, args=(event,), daemon=True).start()
    return JSONResponse(content={"status": "ok"})


@app.get("/admin", response_class=HTMLResponse)
async def admin_home(request: Request):
    """Admin home page showing simple menu and current configuration."""
    # สร้าง webhook URL แบบไดนามิก
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
    """Add a new forwarding endpoint.

    Expects a JSON payload with field "url". The URL will be added to
    forward_endpoints with an automatically assigned id.
    """
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON body")
    url = data.get("url", "").strip()
    if not url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="URL cannot be empty")
    # Assign id as next integer
    next_id = 1
    if forward_endpoints:
        # Find max id value
        next_id = max(ep.get("id", 0) for ep in forward_endpoints) + 1
    forward_endpoints.append({"id": next_id, "url": url})
    save_storage()
    return RedirectResponse(url=app.url_path_for("admin_forwarding"), status_code=status.HTTP_302_FOUND)


@app.post("/admin/forwarding/delete")
async def delete_forwarding(request: Request) -> RedirectResponse:
    """Delete a forwarding endpoint by id.

    Expects JSON payload with field "id".
    """
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
    """Endpoint for the slip‑checking bot to send results back to the middleware.

    Accepts JSON payload with either a reply_token or user_id and a text
    message. The middleware will send the message to the appropriate LINE user
    using reply (if reply_token is provided) or push.
    Example payloads:
        {"reply_token": "<token>", "text": "ตรวจสอบสลิปสำเร็จ"}
        {"user_id": "U123456", "text": "สลิปไม่ถูกต้อง"}
    """
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
        # Store slip bot message to chat history
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
    """Update configuration based on JSON payload from the settings page.
    
    Also update Heroku environment variables if possible.
    """
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON body")
    
    # Update known configuration keys if present
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
    
    # Note: We cannot directly update Heroku config vars from the app
    # User needs to set them in Heroku Dashboard for persistence
    if updated_keys:
        logger.info(f"Updated config keys: {updated_keys}")
    
    return JSONResponse(content={
        "status": "success", 
        "message": "การตั้งค่าถูกอัปเดตแล้ว! หากต้องการให้การตั้งค่าคงอยู่หลัง restart ให้อัปเดต Config Vars ใน Heroku Dashboard ด้วย",
        "updated_keys": updated_keys
    })
