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

from utils.config_manager import config_manager
from models.database import (
    init_database,
    save_chat_history,
    get_chat_history_count,
    get_recent_chat_history,
)
from services.chat_bot import get_chat_response
from services.slip_checker import verify_slip_with_thunder

# ตั้งค่า logger
logger = logging.getLogger("main_app")
logger.setLevel(logging.INFO)

# สร้าง FastAPI instance และกำหนดตำแหน่งเทมเพลต
app = FastAPI(title="LINE OA Middleware (Improved)")
templates = Jinja2Templates(directory="templates")

# เริ่มต้นฐานข้อมูลเมื่อแอปถูกเริ่ม
init_database()

# ====================== Utility Functions ======================

def verify_line_signature(body: bytes, signature: str, channel_secret: str) -> bool:
    """ตรวจสอบลายเซ็นของ webhook จาก LINE"""
    if not channel_secret:
        return True  # ไม่ตรวจหากไม่มี secret
    h = hmac.new(channel_secret.encode(), body, hashlib.sha256).digest()
    computed = base64.b64encode(h).decode()
    return hmac.compare_digest(computed, signature)

def build_slip_flex_contents(slip: Dict[str, Any]) -> Dict[str, Any]:
    """สร้าง payload ของ Flex Message สำหรับผลตรวจสอบสลิป"""
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
                    "color": "#00B900",
                },
                {
                    "type": "text",
                    "text": f"฿{slip.get('amount')}",
                    "weight": "bold",
                    "size": "xxl",
                    "margin": "md",
                },
                {
                    "type": "text",
                    "text": slip.get("date", ""),
                    "size": "sm",
                    "color": "#999999",
                    "margin": "sm",
                },
                {
                    "type": "separator",
                    "margin": "md",
                },
                {
                    "type": "box",
                    "layout": "vertical",
                    "margin": "md",
                    "contents": [
                        {
                            "type": "text",
                            "text": f"ผู้โอน: {slip.get('sender', slip.get('sender_bank', ''))}",
                            "size": "sm",
                        },
                        {
                            "type": "text",
                            "text": f"ผู้รับ: {slip.get('receiver_name', slip.get('receiver_bank', ''))}",
                            "size": "sm",
                        },
                        {
                            "type": "text",
                            "text": f"เบอร์ผู้รับ: {slip.get('receiver_phone', '')}",
                            "size": "sm",
                            "color": "#666666",
                        },
                    ],
                },
            ],
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
                    "align": "center",
                }
            ],
        },
    }

def send_line_reply(reply_token: str, text: str) -> None:
    """ส่งข้อความธรรมดากลับไปยังผู้ใช้ใน LINE"""
    access_token = config_manager.get("line_channel_access_token")
    if not access_token:
        logger.error("LINE_CHANNEL_ACCESS_TOKEN is missing.")
        return
    url = "https://api.line.me/v2/bot/message/reply"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "replyToken": reply_token,
        "messages": [{"type": "text", "text": text}],
    }
    try:
        requests.post(url, headers=headers, data=json.dumps(payload), timeout=10)
    except Exception as e:
        logger.error("Failed to send text reply: %s", e)

def send_line_flex_reply(reply_token: str, slip_data: Dict[str, Any]) -> None:
    """ส่ง Flex Message สำหรับผลตรวจสอบสลิป"""
    access_token = config_manager.get("line_channel_access_token")
    if not access_token:
        logger.error("LINE_CHANNEL_ACCESS_TOKEN is missing.")
        return
    url = "https://api.line.me/v2/bot/message/reply"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
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
    try:
        requests.post(url, headers=headers, data=json.dumps(payload), timeout=10)
    except Exception as e:
        logger.error("Failed to send flex reply: %s", e)

# ====================== Event Dispatcher ======================

def dispatch_event(event: Dict[str, Any]) -> None:
    """ประมวลผล event ที่รับมาจาก LINE แล้วดำเนินการตามประเภทข้อความ"""
    try:
        if event.get("type") != "message":
            return
        message = event.get("message", {})
        user_id = event.get("source", {}).get("userId")
        reply_token = event.get("replyToken")
        # บันทึกข้อความขาเข้า
        save_chat_history(user_id, "in", message, sender="user")

        if message.get("type") == "image":
            # ตรวจสอบสลิป
            result = verify_slip_with_thunder(message.get("id"))
            if result["status"] == "success":
                # ส่ง Flex message และบันทึกประวัติขาออก
                save_chat_history(
                    user_id,
                    "out",
                    {"type": "flex", "content": result["data"]},
                    sender="slip_bot",
                )
                send_line_flex_reply(reply_token, result["data"])
            else:
                # ส่งข้อความ error
                save_chat_history(
                    user_id,
                    "out",
                    {"type": "text", "text": result["message"]},
                    sender="slip_bot",
                )
                send_line_reply(reply_token, result["message"])
        elif message.get("type") == "text":
            # ใช้ AI ตอบข้อความ พร้อมส่งประวัติแชทย้อนหลังให้จำบริบท
            user_text = message.get("text", "")
            response = get_chat_response(user_text, user_id)
            save_chat_history(
                user_id, "out", {"type": "text", "text": response}, sender="bot"
            )
            send_line_reply(reply_token, response)
    except Exception as e:
        logger.exception("Error processing event: %s", e)

# ====================== LINE Webhook Route ======================

@app.post("/line/webhook")
async def line_webhook(request: Request) -> JSONResponse:
    """รับ Webhook จาก LINE"""
    body = await request.body()
    signature = request.headers.get("x-line-signature", "")
    channel_secret = config_manager.get("line_channel_secret", "")
    if not verify_line_signature(body, signature, channel_secret):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid signature")
    try:
        payload = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")
    # Dispatch ทุก event ใน thread แยก
    for ev in payload.get("events", []):
        threading.Thread(target=dispatch_event, args=(ev,), daemon=True).start()
    return JSONResponse(content={"status": "ok"})

# ====================== Admin Pages ======================

@app.get("/", response_class=HTMLResponse)
async def root():
    """Redirect หน้าแรกไปหน้า Admin"""
    return RedirectResponse(url="/admin", status_code=status.HTTP_302_FOUND)

@app.get("/admin", response_class=HTMLResponse)
async def admin_home(request: Request):
    """หน้าแสดงภาพรวมระบบ"""
    total_count = get_chat_history_count()
    return templates.TemplateResponse(
        "admin_home.html",
        {
            "request": request,
            "config": config_manager.config,
            "total_chat_history": total_count,
        },
    )

@app.get("/admin/chat", response_class=HTMLResponse)
async def admin_chat(request: Request):
    """หน้าแสดงประวัติการสนทนาล่าสุด (เช่น 100 รายการ)"""
    history = get_recent_chat_history(limit=100)
    return templates.TemplateResponse(
        "chat_history.html",
        {
            "request": request,
            "chat_history": history,
        },
    )

@app.get("/admin/settings", response_class=HTMLResponse)
async def admin_settings(request: Request):
    """หน้า Settings สำหรับตั้งค่าระบบ"""
    return templates.TemplateResponse(
        "settings.html",
        {
            "request": request,
            "config": config_manager.config,
        },
    )

@app.post("/admin/settings/update")
async def update_settings(request: Request) -> JSONResponse:
    """บันทึกการตั้งค่าจากหน้า Admin"""
    data = await request.json()
    updates = {}
    # อัปเดตค่าแต่ละคีย์
    for key in [
        "line_channel_secret",
        "line_channel_access_token",
        "thunder_api_token",
        "openai_api_key",
        "ai_prompt",
        "wallet_phone_number",
    ]:
        if key in data:
            updates[key] = data[key].strip()
    # บันทึกเปิด/ปิดระบบ
    updates["ai_enabled"] = bool(data.get("ai_enabled"))
    updates["slip_enabled"] = bool(data.get("slip_enabled"))

    # update multiple config
    config_manager.update_multiple(updates)
    return JSONResponse(content={"status": "success", "message": "บันทึกการตั้งค่าแล้ว"})
