# main.py
import json
import hmac
import hashlib
import base64
import threading
import logging
from typing import Dict, Any

import requests
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates

from config import config_store
from models.database import (
    init_database,
    save_chat_history,
    get_user_chat_history,
    get_chat_history_count,
    get_recent_chat_history
)
from services.chat_bot import get_chat_response
from services.slip_checker import verify_slip_with_thunder

logger = logging.getLogger("main_app")
logger.setLevel(logging.INFO)

app = FastAPI(title="LINE OA Middleware")
templates = Jinja2Templates(directory="templates")

# เริ่มต้นฐานข้อมูลเมื่อสตาร์ท
init_database()

def verify_line_signature(body: bytes, signature: str, channel_secret: str) -> bool:
    if not channel_secret:
        return True  # ไม่ตรวจหากไม่มี Secret
    digest = hmac.new(channel_secret.encode(), body, hashlib.sha256).digest()
    computed = base64.b64encode(digest).decode()
    return hmac.compare_digest(computed, signature)

def send_line_reply(reply_token: str, text: str) -> None:
    access_token = config_store.get("line_channel_access_token")
    if not access_token:
        logger.error("Missing LINE channel access token.")
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
        logger.error("Failed to send reply: %s", e)

def dispatch_event(event: Dict[str, Any]) -> None:
    """จัดการ event แต่ละรายการจาก LINE"""
    event_type = event.get("type")
    source = event.get("source", {})
    user_id = source.get("userId")
    if event_type == "message":
        message = event.get("message", {})
        # บันทึกข้อความขาเข้า
        save_chat_history(user_id, "in", message, sender="user")
        # ตรวจสอบชนิดข้อความ
        if message.get("type") == "image":
            reply_token = event.get("replyToken")
            msg_id = message.get("id")
            reply_text = verify_slip_with_thunder(msg_id)
            save_chat_history(user_id, "out", {"type": "text", "text": reply_text}, sender="slip_bot")
            send_line_reply(reply_token, reply_text)
        elif message.get("type") == "text":
            reply_token = event.get("replyToken")
            text = message.get("text", "")
            response_text = get_chat_response(text, user_id)
            save_chat_history(user_id, "out", {"type": "text", "text": response_text}, sender="bot")
            send_line_reply(reply_token, response_text)
    else:
        logger.info("Unhandled event: %s", event_type)

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
    for ev in events:
        threading.Thread(target=dispatch_event, args=(ev,), daemon=True).start()
    return JSONResponse(content={"status": "ok"})

# ===== Admin Pages =====

@app.get("/", response_class=HTMLResponse)
async def root():
    return RedirectResponse(url="/admin", status_code=status.HTTP_302_FOUND)

@app.get("/admin", response_class=HTMLResponse)
async def admin_home(request: Request):
    total_count = get_chat_history_count()
    context = {
        "request": request,
        "config": config_store,
        "total_chat_history": total_count
    }
    return templates.TemplateResponse("admin_home.html", context)

@app.get("/admin/chat", response_class=HTMLResponse)
async def admin_chat(request: Request):
    history = get_recent_chat_history(limit=100)
    return templates.TemplateResponse("chat_history.html", {"request": request, "chat_history": history})

@app.get("/admin/settings", response_class=HTMLResponse)
async def admin_settings(request: Request):
    return templates.TemplateResponse("settings.html", {"request": request, "config": config_store})

@app.post("/admin/settings/update")
async def update_settings(request: Request) -> JSONResponse:
    data = await request.json()
    # อัปเดตค่า config
    for key in [
        "line_channel_secret", "line_channel_access_token",
        "thunder_api_token", "openai_api_key",
        "ai_prompt", "wallet_phone_number"
    ]:
        if key in data:
            config_store[key] = data[key].strip()
    # toggle switch
    config_store["ai_enabled"] = bool(data.get("ai_enabled"))
    config_store["slip_enabled"] = bool(data.get("slip_enabled"))
    return JSONResponse(content={"status": "success", "message": "บันทึกการตั้งค่าแล้ว"})
