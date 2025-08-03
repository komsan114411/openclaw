# main.py
import json
import hmac
import hashlib
import base64
import threading
import logging
from datetime import datetime
from typing import Dict, Any

import requests
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates

from config import config_store
from models.database import init_database, save_chat_history, get_user_chat_history
from services.chat_bot import get_chat_response
from services.slip_checker import verify_slip_with_thunder

logger = logging.getLogger("main_app")
logger.setLevel(logging.INFO)

app = FastAPI(title="LINE OA Middleware (modular version)")
templates = Jinja2Templates(directory="templates")

# initialize database on startup
init_database()

def verify_line_signature(body: bytes, signature: str, channel_secret: str) -> bool:
    """Verify LINE webhook signature using HMAC‑SHA256."""
    if not channel_secret:
        return True  # skip verification if secret is empty
    hash_digest = hmac.new(channel_secret.encode(), body, hashlib.sha256).digest()
    computed = base64.b64encode(hash_digest).decode()
    return hmac.compare_digest(computed, signature)

def send_line_reply(reply_token: str, text: str) -> None:
    """Send a reply message to the user via LINE's reply API."""
    access_token = config_store.get("line_channel_access_token")
    if not access_token:
        logger.error("LINE channel access token is missing.")
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
        requests.post(url, headers=headers, data=json.dumps(body), timeout=10)
    except Exception as e:
        logger.error("Failed to reply to LINE: %s", e)

def dispatch_event(event: Dict[str, Any]) -> None:
    """Process a single event from LINE."""
    event_type = event.get("type")
    source = event.get("source", {})
    user_id = source.get("userId")

    if event_type == "message":
        message = event.get("message", {})
        # save inbound message
        save_chat_history(user_id, "in", message, sender="user")

        if message.get("type") == "image":
            # slip verification
            reply_token = event.get("replyToken")
            message_id = message.get("id")
            result_text = verify_slip_with_thunder(message_id)
            save_chat_history(user_id, "out", {"type": "text", "text": result_text}, sender="slip_bot")
            send_line_reply(reply_token, result_text)
        elif message.get("type") == "text":
            reply_token = event.get("replyToken")
            text = message.get("text", "")
            response = get_chat_response(text, user_id)
            save_chat_history(user_id, "out", {"type": "text", "text": response}, sender="bot")
            send_line_reply(reply_token, response)
    else:
        logger.info("Unhandled event type: %s", event_type)

@app.post("/line/webhook")
async def line_webhook(request: Request) -> JSONResponse:
    """Receive LINE webhook events."""
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
        # process each event in a separate thread
        threading.Thread(target=dispatch_event, args=(event,), daemon=True).start()

    return JSONResponse(content={"status": "ok"})

# ===== ADMIN PAGES =====

@app.get("/", response_class=HTMLResponse)
async def root():
    """Redirect root to admin page."""
    return RedirectResponse(url="/admin", status_code=status.HTTP_302_FOUND)

@app.get("/admin", response_class=HTMLResponse)
async def admin_home(request: Request):
    """Admin dashboard."""
    # นับจำนวนแชททั้งหมดจากฐานข้อมูล
    # ในตัวอย่างนี้จะใช้ len(get_user_chat_history(...)) รวม, แต่สามารถเพิ่มฟังก์ชันนับใน database ได้เอง
    # เพื่อความง่าย ใช้จำนวนทั้งหมดของแชทที่บันทึกอยู่ในไฟล์ storage หรือฐานข้อมูล
    total_chat_history = len(get_user_chat_history("", limit=1000))  # ดึงมาเยอะๆ แล้วนับ

    context = {
        "request": request,
        "config": config_store,
        "total_chat_history": total_chat_history,
    }
    return templates.TemplateResponse("admin_home.html", context)

@app.get("/admin/chat", response_class=HTMLResponse)
async def admin_chat(request: Request):
    """Display chat history (all entries)."""
    # ดึงข้อมูลทั้งหมดจากฐานข้อมูล
    history = get_user_chat_history("", limit=100)  # สมมติว่า limit 100 รายการล่าสุด
    # แปลงข้อมูลให้แสดงง่ายขึ้น
    formatted = []
    for entry in history:
        formatted.append({
            "role": entry["role"],
            "content": entry["content"],
        })
    return templates.TemplateResponse("chat_history.html", {"request": request, "chat_history": formatted})

@app.get("/admin/settings", response_class=HTMLResponse)
async def admin_settings(request: Request):
    """Display settings page."""
    return templates.TemplateResponse("settings.html", {"request": request, "config": config_store})

@app.post("/admin/settings/update")
async def update_settings(request: Request) -> JSONResponse:
    """Update configuration based on JSON payload from the settings page."""
    data = await request.json()
    # อัปเดตค่าใน config_store
    for key in [
        "line_channel_secret",
        "line_channel_access_token",
        "thunder_api_token",
        "openai_api_key",
        "ai_prompt",
        "wallet_phone_number",
    ]:
        if key in data:
            config_store[key] = data[key].strip()
    # อัปเดตสวิตช์เปิด‑ปิด
    config_store["ai_enabled"] = bool(data.get("ai_enabled"))
    config_store["slip_enabled"] = bool(data.get("slip_enabled"))
    return JSONResponse(content={"status": "success", "message": "การตั้งค่าถูกอัปเดตแล้ว!"})
