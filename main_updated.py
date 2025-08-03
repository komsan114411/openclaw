# main.py
import json
import hmac
import hashlib
import base64
import threading
import logging
import os
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
    get_user_chat_history,
)
from services.chat_bot import get_chat_response
from services.slip_checker import verify_slip_with_thunder

logger = logging.getLogger("main_app")
logger.setLevel(logging.INFO)

app = FastAPI(title="LINE OA Middleware (Full Version)")
templates = Jinja2Templates(directory="templates")

# เริ่มต้นฐานข้อมูล SQLite
init_database()


# -------------- Helper Functions -----------------

def verify_line_signature(body: bytes, signature: str, channel_secret: str) -> bool:
    """ตรวจสอบลายเซ็นของ Webhook จาก LINE"""
    if not channel_secret:
        return True
    h = hmac.new(channel_secret.encode(), body, hashlib.sha256).digest()
    computed = base64.b64encode(h).decode()
    return hmac.compare_digest(computed, signature)


def build_slip_flex_contents(slip: Dict[str, Any]) -> Dict[str, Any]:
    """สร้าง payload ของ Flex Message สำหรับผลสลิป"""
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


def send_line_reply(reply_token: str, text: str) -> None:
    """ส่งข้อความธรรมดากลับไปยัง LINE"""
    access_token = config_manager.get("line_channel_access_token")
    if not access_token:
        logger.error("Missing LINE_CHANNEL_ACCESS_TOKEN.")
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
        logger.error("Failed to send text message: %s", e)


def send_line_flex_reply(reply_token: str, slip_data: Dict[str, Any]) -> None:
    """ส่ง Flex Message กลับไปยัง LINE"""
    access_token = config_manager.get("line_channel_access_token")
    if not access_token:
        logger.error("Missing LINE_CHANNEL_ACCESS_TOKEN.")
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
        logger.error("Failed to send flex message: %s", e)


# -------------- Event Dispatcher --------------

def dispatch_event(event: Dict[str, Any]) -> None:
    """ประมวลผลเหตุการณ์จาก LINE แล้วดำเนินการตามประเภทข้อความ"""
    try:
        event_type = event.get("type")
        source = event.get("source", {})
        user_id = source.get("userId")
        if event_type == "message":
            message = event.get("message", {})
            reply_token = event.get("replyToken")
            # บันทึกข้อความขาเข้า
            save_chat_history(user_id, "in", message, sender="user")
            if message.get("type") == "image":
                # ตรวจสอบสลิป
                result = verify_slip_with_thunder(message.get("id"))
                if result["status"] == "success":
                    # ส่ง Flex Message ผลลัพธ์
                    save_chat_history(user_id, "out", {"type": "flex", "content": result["data"]}, sender="slip_bot")
                    send_line_flex_reply(reply_token, result["data"])
                else:
                    # หากผิดพลาด ให้ตอบข้อความธรรมดา
                    save_chat_history(user_id, "out", {"type": "text", "text": result["message"]}, sender="slip_bot")
                    send_line_reply(reply_token, result["message"])
            elif message.get("type") == "text":
                # AI ตอบแชท พร้อมดึงประวัติหลายข้อความ
                user_text = message.get("text", "")
                ai_response = get_chat_response(user_text, user_id)
                save_chat_history(user_id, "out", {"type": "text", "text": ai_response}, sender="bot")
                send_line_reply(reply_token, ai_response)
        else:
            logger.info("Unhandled event type: %s", event_type)
    except Exception as e:
        logger.exception("Error processing event: %s", e)


# -------------- LINE Webhook --------------

@app.post("/line/webhook")
async def line_webhook(request: Request) -> JSONResponse:
    """รับ Webhook จาก LINE และส่งงานต่อให้ dispatcher"""
    body = await request.body()
    signature = request.headers.get("x-line-signature", "")
    channel_secret = config_manager.get("line_channel_secret", "")
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


# -------------- Admin Routes --------------

@app.get("/", response_class=HTMLResponse)
async def root():
    """Redirect to /admin"""
    return RedirectResponse(url="/admin", status_code=status.HTTP_302_FOUND)

@app.get("/admin", response_class=HTMLResponse)
async def admin_home(request: Request):
    """หน้า dashboard แสดงภาพรวม"""
    total_count = get_chat_history_count()
    return templates.TemplateResponse("admin_home.html", {
        "request": request,
        "config": config_manager.config,
        "total_chat_history": total_count,
    })

@app.get("/admin/chat", response_class=HTMLResponse)
async def admin_chat(request: Request):
    """หน้าแสดงประวัติการสนทนาล่าสุด 100 รายการ"""
    history = get_recent_chat_history(limit=100)
    return templates.TemplateResponse("chat_history.html", {
        "request": request,
        "chat_history": history,
    })

@app.get("/admin/settings", response_class=HTMLResponse)
async def admin_settings(request: Request):
    """หน้า Settings สำหรับปรับ config"""
    return templates.TemplateResponse("settings.html", {
        "request": request,
        "config": config_manager.config,
    })

@app.post("/admin/settings/update")
async def update_settings(request: Request) -> JSONResponse:
    """อัปเดต config และบันทึกลงไฟล์"""
    try:
        data = await request.json()
        
        # เตรียมข้อมูลที่จะอัปเดต
        updates = {}
        
        # รายการ field ที่อนุญาตให้อัปเดต
        allowed_fields = [
            "line_channel_secret",
            "line_channel_access_token", 
            "thunder_api_token",
            "openai_api_key",
            "ai_prompt",
            "wallet_phone_number",
        ]
        
        for key in allowed_fields:
            if key in data:
                updates[key] = data[key].strip()
        
        # จัดการ boolean fields
        updates["ai_enabled"] = bool(data.get("ai_enabled"))
        updates["slip_enabled"] = bool(data.get("slip_enabled"))
        
        # บันทึกการเปลี่ยนแปลง
        if config_manager.update_multiple(updates):
            logger.info(f"Config updated: {list(updates.keys())}")
            return JSONResponse(content={
                "status": "success", 
                "message": "บันทึกการตั้งค่าเรียบร้อยแล้ว (AI Prompt จะใช้งานได้ทันที)"
            })
        else:
            return JSONResponse(content={
                "status": "error", 
                "message": "ไม่สามารถบันทึกการตั้งค่าได้"
            })
            
    except Exception as e:
        logger.error("Error updating settings: %s", e)
        return JSONResponse(content={
            "status": "error", 
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        })

@app.post("/admin/settings/reset")
async def reset_settings() -> JSONResponse:
    """รีเซ็ต config กลับเป็น default"""
    try:
        # ลบไฟล์ config ที่บันทึกไว้
        if os.path.exists(config_manager.config_file):
            os.remove(config_manager.config_file)
        
        # โหลด config ใหม่
        config_manager.config = config_manager.load_config()
        
        return JSONResponse(content={
            "status": "success", 
            "message": "รีเซ็ตการตั้งค่ากลับเป็นค่าเริ่มต้นแล้ว"
        })
    except Exception as e:
        logger.error("Error resetting settings: %s", e)
        return JSONResponse(content={
            "status": "error", 
            "message": "ไม่สามารถรีเซ็ตการตั้งค่าได้"
        })

@app.get("/admin/config/current")
async def get_current_config():
    """ดู config ปัจจุบัน (สำหรับ debug)"""
    return JSONResponse(content={
        "config": config_manager.config,
        "config_file_exists": os.path.exists(config_manager.config_file)
    })
