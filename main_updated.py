# main.py
import os
import json
import hmac
import base64
import hashlib
import threading
import logging
from datetime import datetime
from typing import Dict, Any

import requests
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.responses import JSONResponse, HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

# ====================== Setup ======================
logger = logging.getLogger("main_app")
logger.setLevel(logging.INFO)

app = FastAPI(title="LINE OA Middleware")
templates = Jinja2Templates(directory="templates")

# ====================== Imports ======================
try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

try:
    from utils.config_manager import config_manager
    from models.database import (
        init_database,
        save_chat_history,
        get_chat_history_count,
        get_recent_chat_history,
    )
    from services.chat_bot import get_chat_response
    from services.slip_checker import verify_slip_with_thunder
    init_database()
except Exception as e:
    logger.error(f"Startup error: {e}")
    raise SystemExit("Startup failed.")

# ====================== Utility ======================
def verify_line_signature(body: bytes, signature: str, channel_secret: str) -> bool:
    if not channel_secret:
        return True
    h = hmac.new(channel_secret.encode(), body, hashlib.sha256).digest()
    computed = base64.b64encode(h).decode()
    return hmac.compare_digest(computed, signature)

def build_slip_flex_contents(slip: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "type": "bubble",
        "size": "mega",
        "body": {
            "type": "box",
            "layout": "vertical",
            "spacing": "md",
            "contents": [
                {"type": "text", "text": "สลิปถูกต้อง ✅", "weight": "bold", "size": "lg", "color": "#00B900"},
                {"type": "text", "text": f"฿{slip.get('amount')}", "weight": "bold", "size": "xxl", "margin": "md"},
                {"type": "text", "text": slip.get("date", ""), "size": "sm", "color": "#999999", "margin": "sm"},
                {"type": "separator", "margin": "md"},
                {"type": "box", "layout": "vertical", "margin": "md", "contents": [
                    {"type": "text", "text": f"ผู้โอน: {slip.get('sender', slip.get('sender_bank', ''))}", "size": "sm"},
                    {"type": "text", "text": f"ผู้รับ: {slip.get('receiver_name', slip.get('receiver_bank', ''))}", "size": "sm"},
                    {"type": "text", "text": f"เบอร์ผู้รับ: {slip.get('receiver_phone', '')}", "size": "sm", "color": "#666666"},
                ]},
            ],
        },
        "footer": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {"type": "text", "text": "ตรวจสอบโดย Thunder", "size": "xs", "color": "#AAAAAA", "align": "center"}
            ],
        },
    }

def send_line_reply(reply_token: str, text: str) -> None:
    token = config_manager.get("line_channel_access_token")
    url = "https://api.line.me/v2/bot/message/reply"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {"replyToken": reply_token, "messages": [{"type": "text", "text": text}]}
    try:
        requests.post(url, headers=headers, data=json.dumps(payload), timeout=10)
    except Exception as e:
        logger.error("Reply error: %s", e)

def send_line_flex_reply(reply_token: str, slip_data: Dict[str, Any]) -> None:
    token = config_manager.get("line_channel_access_token")
    url = "https://api.line.me/v2/bot/message/reply"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    contents = build_slip_flex_contents(slip_data)
    payload = {"replyToken": reply_token, "messages": [{"type": "flex", "altText": "ผลตรวจสลิป", "contents": contents}]}
    try:
        requests.post(url, headers=headers, data=json.dumps(payload), timeout=10)
    except Exception as e:
        logger.error("Flex reply error: %s", e)

# ====================== Dispatcher ======================
def dispatch_event(event: Dict[str, Any]) -> None:
    try:
        if event.get("type") != "message":
            return
        message = event.get("message", {})
        user_id = event.get("source", {}).get("userId")
        reply_token = event.get("replyToken")
        save_chat_history(user_id, "in", message, sender="user")

        if message.get("type") == "image":
            result = verify_slip_with_thunder(message.get("id"))
            if result["status"] == "success":
                save_chat_history(user_id, "out", {"type": "flex", "content": result["data"]}, sender="slip_bot")
                send_line_flex_reply(reply_token, result["data"])
            else:
                save_chat_history(user_id, "out", {"type": "text", "text": result["message"]}, sender="slip_bot")
                send_line_reply(reply_token, result["message"])
        elif message.get("type") == "text":
            text = message.get("text", "")
            response = get_chat_response(text, user_id)
            save_chat_history(user_id, "out", {"type": "text", "text": response}, sender="bot")
            send_line_reply(reply_token, response)
    except Exception as e:
        logger.exception("Event error: %s", e)

# ====================== Routes ======================
@app.post("/line/webhook")
async def line_webhook(request: Request) -> JSONResponse:
    body = await request.body()
    signature = request.headers.get("x-line-signature", "")
    channel_secret = config_manager.get("line_channel_secret", "")
    if not verify_line_signature(body, signature, channel_secret):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid signature")
    try:
        payload = json.loads(body.decode())
        for ev in payload.get("events", []):
            threading.Thread(target=dispatch_event, args=(ev,), daemon=True).start()
        return JSONResponse(content={"status": "ok"})
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")

@app.get("/", response_class=HTMLResponse)
async def root(): return RedirectResponse("/admin")

@app.get("/admin", response_class=HTMLResponse)
async def admin_home(request: Request):
    return templates.TemplateResponse("admin_home.html", {
        "request": request,
        "config": config_manager.config,
        "total_chat_history": get_chat_history_count(),
    })

@app.get("/admin/chat", response_class=HTMLResponse)
async def admin_chat(request: Request):
    return templates.TemplateResponse("chat_history.html", {
        "request": request,
        "chat_history": get_recent_chat_history(limit=100),
    })

@app.get("/admin/settings", response_class=HTMLResponse)
async def admin_settings(request: Request):
    return templates.TemplateResponse("settings.html", {
        "request": request,
        "config": config_manager.config,
    })

# ====================== Admin API ======================
@app.get("/admin/api-status")
async def api_status_check():
    status = {
        "thunder": {"configured": False, "connected": False},
        "line": {"configured": False, "connected": False},
        "openai": {"configured": False, "connected": False},
    }
    try:
        token = config_manager.get("thunder_api_token")
        if token:
            status["thunder"]["configured"] = True
            r = requests.get("https://api.thunder.in.th/v1/user", headers={"Authorization": f"Bearer {token}"}, timeout=5)
            status["thunder"]["connected"] = True
            status["thunder"]["balance"] = r.json().get("balance", 0)
    except Exception as e:
        status["thunder"]["error"] = str(e)
    try:
        token = config_manager.get("line_channel_access_token")
        if token:
            status["line"]["configured"] = True
            r = requests.get("https://api.line.me/v2/bot/profile/me", headers={"Authorization": f"Bearer {token}"}, timeout=5)
            status["line"]["connected"] = True
            status["line"]["bot_name"] = r.json().get("displayName")
    except Exception as e:
        status["line"]["error"] = str(e)
    try:
        key = config_manager.get("openai_api_key")
        if key:
            status["openai"]["configured"] = True
            if OpenAI:
                client = OpenAI(api_key=key)
                client.models.list()
                status["openai"]["connected"] = True
            else:
                status["openai"]["error"] = "Library not installed"
    except Exception as e:
        status["openai"]["error"] = str(e)
    return JSONResponse(content=status)

@app.post("/admin/test-slip-upload")
async def test_slip_upload(request: Request):
    form = await request.form()
    file = form.get("file")
    if not file:
        return JSONResponse(content={"status": "error", "message": "ไม่พบไฟล์"})
    image_data = await file.read()
    result = verify_slip_with_thunder("test_img", test_image_data=image_data)
    return JSONResponse(content=result)

@app.post("/admin/settings/update")
async def update_settings(request: Request):
    data = await request.json()
    keys = [
        "line_channel_secret", "line_channel_access_token",
        "thunder_api_token", "openai_api_key",
        "ai_prompt", "wallet_phone_number"
    ]
    updates = {k: data[k].strip() for k in keys if k in data}
    updates["ai_enabled"] = bool(data.get("ai_enabled"))
    updates["slip_enabled"] = bool(data.get("slip_enabled"))
    config_manager.update_multiple(updates)
    return JSONResponse(content={"status": "success", "message": "บันทึกแล้ว"})

