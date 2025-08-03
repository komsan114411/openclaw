# main.py
import json
import hmac
import hashlib
import base64
import threading
import logging
import os
import time
import sys
from typing import Dict, Any

import requests
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates

# ตั้งค่า logging สำหรับ Heroku
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger("main_app")

# สร้าง FastAPI app
app = FastAPI(title="LINE OA Middleware")

# ตั้งค่า templates
templates = Jinja2Templates(directory="templates")

# Import modules แบบ safe
try:
    from utils.config_manager import config_manager
    logger.info("✅ Config manager imported successfully")
except ImportError as e:
    logger.error(f"❌ Failed to import config_manager: {e}")
    # สร้าง config manager แบบง่าย
    class SimpleConfigManager:
        def __init__(self):
            self.config = {
                "line_channel_secret": os.getenv("LINE_CHANNEL_SECRET", ""),
                "line_channel_access_token": os.getenv("LINE_CHANNEL_ACCESS_TOKEN", ""),
                "thunder_api_token": os.getenv("THUNDER_API_TOKEN", ""),
                "openai_api_key": os.getenv("OPENAI_API_KEY", ""),
                "ai_prompt": os.getenv("AI_PROMPT", "คุณเป็นผู้ช่วยระบบชำระเงิน"),
                "ai_enabled": True,
                "slip_enabled": True,
                "wallet_phone_number": os.getenv("WALLET_PHONE_NUMBER", ""),
            }
        
        def get(self, key, default=None):
            return self.config.get(key, default)
        
        def update_multiple(self, updates):
            self.config.update(updates)
            return True
        
        def reload_config(self):
            pass
    
    config_manager = SimpleConfigManager()

try:
    from models.database import (
        init_database,
        save_chat_history,
        get_chat_history_count,
        get_recent_chat_history,
    )
    # เริ่มต้นฐานข้อมูล
    init_database()
    logger.info("✅ Database initialized successfully")
except ImportError as e:
    logger.error(f"❌ Failed to import database: {e}")
    # สร้าง functions แบบ dummy
    def init_database(): pass
    def save_chat_history(*args): pass
    def get_chat_history_count(): return 0
    def get_recent_chat_history(*args): return []

try:
    from services.chat_bot import get_chat_response
    logger.info("✅ Chat bot service imported successfully")
except ImportError as e:
    logger.error(f"❌ Failed to import chat_bot: {e}")
    def get_chat_response(text, user_id):
        return f"Echo: {text}"

try:
    from services.slip_checker import verify_slip_with_thunder
    logger.info("✅ Slip checker service imported successfully")
except ImportError as e:
    logger.error(f"❌ Failed to import slip_checker: {e}")
    def verify_slip_with_thunder(message_id):
        return {"status": "error", "message": "ระบบตรวจสอบสลิปยังไม่พร้อม"}

# -------------- Helper Functions -----------------

def verify_line_signature(body: bytes, signature: str, channel_secret: str) -> bool:
    """ตรวจสอบลายเซ็นของ Webhook จาก LINE"""
    if not channel_secret:
        logger.warning("⚠️ No LINE channel secret configured")
        return True
    try:
        h = hmac.new(channel_secret.encode(), body, hashlib.sha256).digest()
        computed = base64.b64encode(h).decode()
        return hmac.compare_digest(computed, signature)
    except Exception as e:
        logger.error(f"❌ Signature verification error: {e}")
        return False

def send_line_reply(reply_token: str, text: str) -> bool:
    """ส่งข้อความธรรมดากลับไปยัง LINE"""
    try:
        access_token = config_manager.get("line_channel_access_token")
        if not access_token:
            logger.error("❌ Missing LINE_CHANNEL_ACCESS_TOKEN")
            return False
        
        url = "https://api.line.me/v2/bot/message/reply"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        payload = {
            "replyToken": reply_token,
            "messages": [{"type": "text", "text": text}],
        }
        
        resp = requests.post(url, headers=headers, data=json.dumps(payload), timeout=10)
        if resp.status_code == 200:
            logger.info(f"✅ Sent reply: {text[:50]}...")
            return True
        else:
            logger.error(f"❌ LINE reply failed: {resp.status_code}")
            return False
    except Exception as e:
        logger.error(f"❌ Failed to send LINE reply: {e}")
        return False

def dispatch_event(event: Dict[str, Any]) -> None:
    """ประมวลผลเหตุการณ์จาก LINE"""
    try:
        event_type = event.get("type")
        if event_type == "message":
            message = event.get("message", {})
            reply_token = event.get("replyToken")
            source = event.get("source", {})
            user_id = source.get("userId", "unknown")
            
            if message.get("type") == "text":
                user_text = message.get("text", "")
                logger.info(f"💬 Text message: {user_text[:30]}...")
                
                # บันทึกข้อความ
                save_chat_history(user_id, "in", message, sender="user")
                
                # ตอบกลับ
                ai_response = get_chat_response(user_text, user_id)
                save_chat_history(user_id, "out", {"type": "text", "text": ai_response}, sender="bot")
                send_line_reply(reply_token, ai_response)
                
            elif message.get("type") == "image":
                logger.info("🖼️ Image message (slip verification)")
                save_chat_history(user_id, "in", message, sender="user")
                
                result = verify_slip_with_thunder(message.get("id"))
                response_text = result.get("message", "ตรวจสอบสลิปไม่สำเร็จ")
                
                save_chat_history(user_id, "out", {"type": "text", "text": response_text}, sender="slip_bot")
                send_line_reply(reply_token, response_text)
        
    except Exception as e:
        logger.exception(f"❌ Error processing event: {e}")

# -------------- Routes --------------

@app.get("/")
async def root():
    """Redirect to /admin"""
    return RedirectResponse(url="/admin")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return JSONResponse(content={
        "status": "healthy",
        "timestamp": time.time(),
        "config_loaded": bool(config_manager)
    })

@app.post("/line/webhook")
async def line_webhook(request: Request) -> JSONResponse:
    """รับ Webhook จาก LINE"""
    try:
        body = await request.body()
        signature = request.headers.get("x-line-signature", "")
        channel_secret = config_manager.get("line_channel_secret", "")
        
        if not verify_line_signature(body, signature, channel_secret):
            logger.error("❌ Invalid LINE signature")
            raise HTTPException(status_code=403, detail="Invalid signature")
        
        payload = json.loads(body.decode("utf-8"))
        events = payload.get("events", [])
        
        logger.info(f"📨 Received {len(events)} events from LINE")
        
        for ev in events:
            threading.Thread(target=dispatch_event, args=(ev,), daemon=True).start()
        
        return JSONResponse(content={"status": "ok", "events": len(events)})
        
    except json.JSONDecodeError:
        logger.error("❌ Invalid JSON payload")
        raise HTTPException(status_code=400, detail="Invalid JSON")
    except Exception as e:
        logger.error(f"❌ Webhook error: {e}")
        raise HTTPException(status_code=500, detail="Internal error")

@app.get("/admin", response_class=HTMLResponse)
async def admin_home(request: Request):
    """หน้า dashboard"""
    try:
        total_count = get_chat_history_count()
        return templates.TemplateResponse("admin_home.html", {
            "request": request,
            "config": config_manager.config if hasattr(config_manager, 'config') else {},
            "total_chat_history": total_count,
        })
    except Exception as e:
        logger.error(f"❌ Admin home error: {e}")
        return HTMLResponse("<h1>Error loading admin page</h1>")

@app.get("/admin/settings", response_class=HTMLResponse)
async def admin_settings(request: Request):
    """หน้า Settings"""
    try:
        return templates.TemplateResponse("settings.html", {
            "request": request,
            "config": config_manager.config if hasattr(config_manager, 'config') else {},
        })
    except Exception as e:
        logger.error(f"❌ Settings page error: {e}")
        return HTMLResponse("<h1>Error loading settings page</h1>")

@app.post("/admin/settings/update")
async def update_settings(request: Request) -> JSONResponse:
    """อัปเดต settings"""
    try:
        data = await request.json()
        
        updates = {}
        allowed_fields = [
            "line_channel_secret", "line_channel_access_token", 
            "thunder_api_token", "openai_api_key", "ai_prompt", 
            "wallet_phone_number"
        ]
        
        for key in allowed_fields:
            if key in data:
                updates[key] = data[key].strip()
        
        updates["ai_enabled"] = bool(data.get("ai_enabled"))
        updates["slip_enabled"] = bool(data.get("slip_enabled"))
        
        config_manager.update_multiple(updates)
        
        return JSONResponse(content={
            "status": "success",
            "message": "✅ บันทึกการตั้งค่าเรียบร้อยแล้ว"
        })
        
    except Exception as e:
        logger.error(f"❌ Update settings error: {e}")
        return JSONResponse(content={
            "status": "error",
            "message": f"❌ เกิดข้อผิดพลาด: {str(e)}"
        })

# Error handlers
@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    return JSONResponse(status_code=404, content={"error": "Not Found"})

@app.exception_handler(500)
async def internal_error_handler(request: Request, exc):
    logger.error(f"❌ Internal server error: {exc}")
    return JSONResponse(status_code=500, content={"error": "Internal Server Error"})

# Startup event
@app.on_event("startup")
async def startup_event():
    """เหตุการณ์เมื่อ server เริ่มทำงาน"""
    logger.info("🚀 LINE OA Middleware starting up on Heroku...")
    logger.info(f"🤖 AI enabled: {config_manager.get('ai_enabled')}")
    logger.info(f"🧾 Slip verification enabled: {config_manager.get('slip_enabled')}")
    logger.info("✅ Server started successfully!")

# สำหรับรัน local
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
