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
    get_chat_history_count,
    get_recent_chat_history,
    get_user_chat_history,
)
from services.chat_bot import get_chat_response
from services.slip_checker import verify_slip_with_thunder

logger = logging.getLogger("main_app")
logger.setLevel(logging.INFO)

app = FastAPI(title="LINE OA Middleware")
templates = Jinja2Templates(directory="templates")
init_database()  # สร้างฐานข้อมูล SQLite ถ้ายังไม่มี

# ตรวจสอบลายเซ็นของ webhook
def verify_line_signature(body: bytes, signature: str, channel_secret: str) -> bool:
    if not channel_secret:
        return True
    h = hmac.new(channel_secret.encode(), body, hashlib.sha256).digest()
    computed = base64.b64encode(h).decode()
    return hmac.compare_digest(computed, signature)

# สร้าง Flex Message สำหรับผลตรวจสอบสลิป
def build_slip_flex_contents(slip: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "type": "bubble",
        "size": "mega",
        "body": {
            "type": "box",
            "layout": "vertical",
            "spacing": "md",
            "contents": [
                {
                    "type": "text",
                    "text": "สลิปถูกต้อง ✅",
                    "weight": "bold",
                    "size": "lg",
                    "color": "#00B900"
                },
                {
                    "type": "text",
                    "text": f"฿{slip.get('amount')}",
                    "weight": "bold",
                    "size": "xxl",
                    "margin": "md"
                },
                {
                    "type": "text",
                    "text": slip.get("date", ""),
                    "size": "sm",
                    "color": "#999999",
                    "margin": "sm"
                },
                {
                    "type": "separator",
                    "margin": "md"
                },
                {
                    "type": "box",
                    "layout": "vertical",
                    "margin": "md",
                    "contents": [
                        {
                            "type": "text",
                            "text": f"ผู้โอน: {slip.get('sender', slip.get('sender_bank', ''))}",
                            "size": "sm"
                        },
                        {
                            "type": "text",
                            "text": f"ผู้รับ: {slip.get('receiver_name', slip.get('receiver_bank', ''))}",
                            "size": "sm"
                        },
                        {
                            "type": "text",
                            "text": f"เบอร์ผู้รับ: {slip.get('receiver_phone', '')}",
                            "size": "sm",
                            "color": "#666666"
                        },
                    ]
                }
            ]
        },
        "footer": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {
                    "type": "text",
                    "text": "ตรวจสอบโดย Thunder",
                    "size": "xs",
                    "color": "#AAAAAA",
                    "align": "center"
                }
            ]
        }
    }

# ส่งข้อความปกติ
def send_line_reply(reply_token: str, text: str) -> None:
    access_token = config_store.get("line_channel_access_token")
    if not access_token:
        logger.error("LINE_CHANNEL_ACCESS_TOKEN is missing.")
        return
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "replyToken": reply_token,
        "messages": [{"type": "text", "text": text}],
    }
    requests.post("https://api.line.me/v2/bot/message/reply", headers=headers,
                  data=json.dumps(payload), timeout=10)

# ส่ง Flex Message
def send_line_flex_reply(reply_token: str, slip_data: Dict[str, Any]) -> None:
    access_token = config_store.get("line_channel_access_token")
    if not access_token:
        logger.error("LINE_CHANNEL_ACCESS_TOKEN is missing.")
        return
    contents = build_slip_flex_contents(slip_data)
    payload = {
        "replyToken": reply_token,
        "messages": [
            {
                "type": "flex",
                "altText": "ผลการตรวจสอบสลิป",
                "contents": contents,
            }
        ],
    }
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    requests.post("https://api.line.me/v2/bot/message/reply", headers=headers,
                  data=json.dumps(payload), timeout=10)

# ประมวลผล event ที่มาจาก LINE
def dispatch_event(event: Dict[str, Any]) -> None:
    try:
        if event.get("type") != "message":
            return
        user_id = event.get("source", {}).get("userId")
        reply_token = event.get("replyToken")
        message = event.get("message", {})
        # บันทึกข้อความเข้า
        save_chat_history(user_id, "in", message, sender="user")
        if message.get("type") == "image":
            # ตรวจสอบสลิป
            result = verify_slip_with_thunder(message.get("id"))
            if result["status"] == "success":
                save_chat_history(user_id, "out",
                                  {"type": "flex", "content": result["data"]},
                                  sender="slip_bot")
                send_line_flex_reply(reply_token, result["data"])
            else:
                save_chat_history(user_id, "out",
                                  {"type": "text", "text": result["message"]},
                                  sender="slip_bot")
                send_line_reply(reply_token, result["message"])
        elif message.get("type") == "text":
            # เรียก AI ตอบกลับ (ฟังก์ชันใน services/chat_bot.py ต้องดึง history หลายข้อความขึ้น)
            user_text = message.get("text", "")
            ai_response = get_chat_response(user_text, user_id)
            save_chat_history(user_id, "out",
                              {"type": "text", "text": ai_response},
                              sender="bot")
            send_line_reply(reply_token, ai_response)
    except Exception as e:
        logger.exception("Error in dispatch_event: %s", e)

# Webhook ของ LINE
@app.post("/line/webhook")
async def line_webhook(request: Request) -> JSONResponse:
    body = await request.body()
    signature = request.headers.get("x-line-signature", "")
    if not verify_line_signature(body, signature, config_store.get("line_channel_secret", "")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid signature")
    try:
        payload = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")
    for ev in payload.get("events", []):
        threading.Thread(target=dispatch_event, args=(ev,), daemon=True).start()
    return JSONResponse(content={"status": "ok"})

# Admin Route: redirect ไปหน้า admin
@app.get("/", response_class=HTMLResponse)
async def root():
    return RedirectResponse(url="/admin", status_code=status.HTTP_302_FOUND)

# หน้า Dashboard
@app.get("/admin", response_class=HTMLResponse)
async def admin_home(request: Request):
    total_count = get_chat_history_count()
    return templates.TemplateResponse("admin_home.html", {
        "request": request,
        "config": config_store,
        "total_chat_history": total_count,
    })

# ประวัติการแชท
@app.get("/admin/chat", response_class=HTMLResponse)
async def admin_chat(request: Request):
    history = get_recent_chat_history(limit=100)
    return templates.TemplateResponse("chat_history.html", {
        "request": request,
        "chat_history": history,
    })

# ตั้งค่าระบบ
@app.get("/admin/settings", response_class=HTMLResponse)
async def admin_settings(request: Request):
    return templates.TemplateResponse("settings.html", {
        "request": request,
        "config": config_store,
    })

@app.post("/admin/settings/update")
async def update_settings(request: Request) -> JSONResponse:
    data = await request.json()
    # อัปเดตค่าที่รับมาจากฟอร์ม
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
    # toggle switches
    config_store["ai_enabled"] = bool(data.get("ai_enabled"))
    config_store["slip_enabled"] = bool(data.get("slip_enabled"))
    return JSONResponse(content={"status": "success", "message": "บันทึกการตั้งค่าแล้ว"})
