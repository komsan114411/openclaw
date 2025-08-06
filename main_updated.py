# main_updated.py - Fixed Production Version
import json
import hmac
import hashlib
import base64
import asyncio
import time
import signal
import sys
from datetime import datetime
from typing import Dict, Any, Optional, List, Union
import logging
import os
from contextlib import asynccontextmanager

# Basic imports
import requests
from requests.exceptions import RequestException, Timeout, ConnectionError

import httpx
from fastapi import FastAPI, Request, HTTPException, status, WebSocket, WebSocketDisconnect, Header, BackgroundTasks
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.base import BaseHTTPMiddleware

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("main_app")

# Global state
IS_READY = False
SHUTDOWN_INITIATED = False

class ErrorHandlingMiddleware(BaseHTTPMiddleware):
    """Middleware for handling errors"""
    
    async def dispatch(self, request: Request, call_next):
        try:
            response = await call_next(request)
            return response
        except Exception as e:
            logger.error(f"❌ Unhandled error in {request.url.path}: {e}")
            return JSONResponse(
                status_code=500,
                content={"status": "error", "message": "Internal server error"}
            )

class NotificationManager:
    """WebSocket notification manager"""
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.pending_notifications: List[Dict] = []
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket):
        try:
            await websocket.accept()
            async with self._lock:
                self.active_connections.append(websocket)
            logger.info(f"📱 WebSocket connected. Total: {len(self.active_connections)}")
        except Exception as e:
            logger.error(f"❌ WebSocket connect error: {e}")

    async def disconnect(self, websocket: WebSocket):
        try:
            async with self._lock:
                if websocket in self.active_connections:
                    self.active_connections.remove(websocket)
            logger.info(f"📱 WebSocket disconnected. Total: {len(self.active_connections)}")
        except Exception as e:
            logger.error(f"❌ WebSocket disconnect error: {e}")

    async def send_notification(self, message: str, notification_type: str = "info", data: Dict = None):
        if SHUTDOWN_INITIATED or not self.active_connections:
            return

        notification = {
            "message": message,
            "type": notification_type,
            "timestamp": datetime.now().isoformat(),
            "data": data or {}
        }

        disconnected = []
        async with self._lock:
            for connection in self.active_connections.copy():
                try:
                    await connection.send_text(json.dumps(notification))
                except Exception as e:
                    logger.warning(f"Error sending notification: {e}")
                    disconnected.append(connection)

        for conn in disconnected:
            await self.disconnect(conn)

notification_manager = NotificationManager()

# Global services
config_manager = None
database_functions = {}
ai_functions = {}
slip_functions = {}
user_manager = None
message_sender = None

class FallbackConfigManager:
    """Simple fallback configuration manager"""
    def __init__(self):
        self.config = {
            "line_channel_secret": os.getenv("LINE_CHANNEL_SECRET", ""),
            "line_channel_access_token": os.getenv("LINE_CHANNEL_ACCESS_TOKEN", ""),
            "thunder_api_token": os.getenv("THUNDER_API_TOKEN", ""),
            "openai_api_key": os.getenv("OPENAI_API_KEY", ""),
            "ai_enabled": os.getenv("AI_ENABLED", "true").lower() == "true",
            "slip_enabled": os.getenv("SLIP_ENABLED", "true").lower() == "true",
            "thunder_enabled": os.getenv("THUNDER_ENABLED", "true").lower() == "true",
            "ai_prompt": "คุณเป็นผู้ช่วยระบบชำระเงินที่เชี่ยวชาญ",
            "openai_model": "gpt-3.5-turbo",
            "openai_max_tokens": 150
        }
    
    def get(self, key, default=None):
        return self.config.get(key, default)
    
    def get_all(self):
        return self.config.copy()
    
    def update(self, key, value):
        self.config[key] = value
        return True
    
    def update_multiple(self, updates):
        self.config.update(updates)
        return True

class FallbackUser:
    """Simple user object"""
    def __init__(self, user_id, display_name=None):
        self.user_id = user_id
        self.display_name = display_name or f'User {user_id[:8]}...'
        self.first_name = ""
        self.last_name = ""
        self.is_blocked = False
        self.created_at = datetime.now()
        self.last_active = datetime.now()
        self.chat_history = []

class FallbackUserManager:
    """Simple user manager"""
    def __init__(self):
        self.users = {}
    
    def set_line_token(self, token):
        pass
    
    async def get_or_create_user(self, user_id):
        if user_id not in self.users:
            self.users[user_id] = FallbackUser(user_id)
        return self.users[user_id]
    
    def get_all_users(self, limit=100, search=None):
        return list(self.users.values())[:limit]
    
    def get_user_stats(self):
        return {
            "total_users": len(self.users),
            "active_24h": len(self.users),
            "new_this_week": len(self.users)
        }

class FallbackMessageSender:
    """Simple message sender"""
    def set_line_token(self, token):
        pass
    
    async def send_message_to_user(self, user_id, message):
        return {"status": "error", "message": "Message sender not available"}
    
    async def broadcast_message(self, user_ids, message):
        return {"status": "error", "message": "Broadcast not available"}

def safe_import_modules():
    """Safely import modules with fallbacks"""
    global IS_READY, config_manager, database_functions, ai_functions, slip_functions, user_manager, message_sender
    
    logger.info("🔄 Starting safe module imports...")
    
    # Config Manager
    config_manager = FallbackConfigManager()
    logger.info("✅ Fallback config manager created")
    
    # Database Functions - In-memory storage
    chat_storage = []
    
    class ChatHistory:
        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)
    
    def save_chat(user_id, direction, message, sender):
        try:
            chat_data = {
                'id': len(chat_storage) + 1,
                'user_id': user_id,
                'direction': direction,
                'message_type': message.get('type', 'text') if isinstance(message, dict) else 'text',
                'message_text': message.get('text', str(message)) if isinstance(message, dict) else str(message),
                'sender': sender,
                'created_at': datetime.now()
            }
            chat_storage.append(chat_data)
        except Exception as e:
            logger.error(f"❌ Error saving chat: {e}")
    
    def get_count():
        return len(chat_storage)
    
    def get_recent(limit=50):
        recent_chats = chat_storage[-limit:] if chat_storage else []
        return [ChatHistory(**chat) for chat in recent_chats]
    
    def get_user_history(user_id, limit=10):
        user_chats = [c for c in chat_storage if c['user_id'] == user_id][-limit:]
        return [
            {"role": "user" if c['direction'] == "in" else "assistant", "content": c['message_text'] or ''} 
            for c in user_chats if c['message_text']
        ]
    
    database_functions = {
        'init_database': lambda: None,
        'save_chat_history': save_chat,
        'get_chat_history_count': get_count,
        'get_recent_chat_history': get_recent,
        'get_user_chat_history': get_user_history,
        'log_api_call': lambda *args, **kwargs: None,
        'get_api_statistics': lambda *args, **kwargs: {},
        'cleanup_old_data': lambda *args, **kwargs: {}
    }
    logger.info("✅ Fallback database functions created")
    
    # AI Functions
    def get_chat_response(text, user_id):
        if not config_manager.get("ai_enabled", False):
            return "ระบบ AI ถูกปิดการใช้งานในขณะนี้"
        if not config_manager.get("openai_api_key"):
            return "ยังไม่ได้ตั้งค่า OpenAI API Key กรุณาติดต่อผู้ดูแลระบบ"
        return f"ขออภัย ระบบ AI ไม่พร้อมใช้งานในขณะนี้ แต่เราได้รับข้อความของคุณแล้ว"
    
    ai_functions = {'get_chat_response': get_chat_response}
    logger.info("✅ Fallback AI functions created")
    
    # Slip Functions
    def verify_slip(message_id, test_data=None):
        if not config_manager.get("thunder_enabled", True):
            return {"status": "error", "message": "Thunder API ถูกปิดใช้งาน"}
        if not config_manager.get("thunder_api_token"):
            return {"status": "error", "message": "ยังไม่ได้ตั้งค่า Thunder API Token"}
        return {"status": "error", "message": "ระบบตรวจสอบสลิปไม่พร้อมใช้งาน"}
    
    def test_thunder(token):
        return {"status": "error", "message": "Thunder API connection test ไม่พร้อมใช้งาน"}
    
    slip_functions = {
        'verify_slip_with_thunder': verify_slip,
        'test_thunder_api_connection': test_thunder,
        'extract_slip_info_from_text': lambda t: {"bank_code": None, "trans_ref": None}
    }
    logger.info("✅ Fallback slip functions created")
    
    # User Services
    user_manager = FallbackUserManager()
    message_sender = FallbackMessageSender()
    logger.info("✅ Fallback user services created")
    
    # Try to import real modules if available
    try:
        from utils.stable_config_manager import config_manager as stable_cm
        config_manager = stable_cm
        logger.info("✅ Stable config manager imported")
    except ImportError:
        pass
    
    try:
        from models.postgres_database import (
            init_database, save_chat_history, get_chat_history_count, 
            get_recent_chat_history, get_user_chat_history
        )
        database_functions.update({
            'init_database': init_database,
            'save_chat_history': save_chat_history,
            'get_chat_history_count': get_chat_history_count,
            'get_recent_chat_history': get_recent_chat_history,
            'get_user_chat_history': get_user_chat_history
        })
        logger.info("✅ PostgreSQL database functions imported")
    except ImportError:
        pass
    
    try:
        from services.chat_bot import get_chat_response
        ai_functions = {'get_chat_response': get_chat_response}
        logger.info("✅ AI chat functions imported")
    except ImportError:
        pass
    
    try:
        from services.slip_checker import verify_slip_with_thunder, test_thunder_api_connection
        slip_functions.update({
            'verify_slip_with_thunder': verify_slip_with_thunder,
            'test_thunder_api_connection': test_thunder_api_connection
        })
        logger.info("✅ Thunder slip verification imported")
    except ImportError:
        pass
    
    try:
        from services.user_manager import user_manager as um
        from services.message_sender import message_sender as ms
        user_manager = um
        message_sender = ms
        logger.info("✅ User management services imported")
    except ImportError:
        pass
    
    # Initialize database
    try:
        database_functions['init_database']()
        logger.info("✅ Database initialized")
    except Exception as e:
        logger.error(f"❌ Database init error: {e}")
    
    IS_READY = True
    logger.info("✅ System READY")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("🚀 LINE OA Middleware starting...")
    safe_import_modules()
    
    if IS_READY and config_manager:
        try:
            access_token = config_manager.get("line_channel_access_token")
            if access_token:
                logger.info("✅ LINE Bot credentials loaded")
            else:
                logger.warning("⚠️ LINE credentials not found")
        except Exception as e:
            logger.error(f"❌ LINE Bot init error: {e}")
    
    try:
        await notification_manager.send_notification("🚀 ระบบเริ่มทำงานแล้ว", "success")
    except Exception as e:
        logger.error(f"❌ Startup notification error: {e}")
    
    yield
    
    # Shutdown
    global SHUTDOWN_INITIATED
    SHUTDOWN_INITIATED = True
    logger.info("🛑 LINE OA Middleware shutting down...")

# Create FastAPI app
app = FastAPI(
    title="LINE OA Middleware",
    description="LINE OA Middleware with Thunder slip verification",
    version="2.0.0",
    lifespan=lifespan
)

# Add middlewares
app.add_middleware(ErrorHandlingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Templates
templates = Jinja2Templates(directory="templates")

# Static files
if os.path.exists("static"):
    app.mount("/static", StaticFiles(directory="static"), name="static")

# Utility Functions
def get_api_status_summary():
    """Get API status summary"""
    try:
        if not config_manager:
            return {"thunder": {"enabled": False, "configured": False, "connected": False}}
            
        thunder_token = config_manager.get("thunder_api_token", "").strip()
        thunder_enabled = config_manager.get("thunder_enabled", True)
        
        return {
            "thunder": {
                "name": "Thunder API",
                "enabled": thunder_enabled,
                "configured": bool(thunder_token),
                "connected": bool(thunder_token and thunder_enabled),
                "recent_failures": 0
            }
        }
    except Exception as e:
        logger.error(f"❌ Error in get_api_status_summary: {e}")
        return {"thunder": {"enabled": False, "configured": False, "connected": False}}

async def send_line_reply(reply_token: str, text: str) -> bool:
    """Send LINE reply message"""
    if SHUTDOWN_INITIATED:
        return False
        
    try:
        access_token = config_manager.get("line_channel_access_token")
        if not access_token or not reply_token:
            return False
        
        if len(text) > 5000:
            text = text[:4900] + "\n\n(ข้อความถูกตัดเนื่องจากยาวเกินไป)"
        
        url = "https://api.line.me/v2/bot/message/reply"
        headers = {
            "Authorization": f"Bearer {access_token}", 
            "Content-Type": "application/json"
        }
        payload = {
            "replyToken": reply_token, 
            "messages": [{"type": "text", "text": text}]
        }
        
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(url, headers=headers, json=payload)
            
            if response.status_code == 200:
                logger.info("✅ LINE reply sent successfully")
                return True
            else:
                logger.error(f"❌ LINE Reply API {response.status_code}: {response.text}")
                return False
                
    except Exception as e:
        logger.error(f"❌ send_line_reply error: {e}")
        return False

async def send_line_push(user_id: str, text: str) -> bool:
    """Send LINE push message"""
    if SHUTDOWN_INITIATED:
        return False
        
    try:
        access_token = config_manager.get("line_channel_access_token")
        if not access_token or not user_id:
            return False

        if len(text) > 5000:
            text = text[:4900] + "\n\n(ข้อความถูกตัดเนื่องจากยาวเกินไป)"

        url = "https://api.line.me/v2/bot/message/push"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        payload = {
            "to": user_id,
            "messages": [{"type": "text", "text": text}]
        }

        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(url, headers=headers, json=payload)
            
            if response.status_code == 200:
                logger.info("✅ Push message sent successfully")
                return True
            else:
                logger.error(f"❌ LINE Push API {response.status_code}: {response.text}")
                return False
                
    except Exception as e:
        logger.error(f"❌ send_line_push error: {e}")
        return False

def create_slip_reply_message(result: Dict[str, Any]) -> str:
    """Create slip verification reply message"""
    try:
        status = result.get("status")
        data = result.get("data", {})

        if not data:
            error_msg = result.get("message", "ไม่ทราบสาเหตุ")
            return f"❌ ไม่สามารถดึงข้อมูลสลิปได้\n\nสาเหตุ: {error_msg}"

        amount_display = data.get("amount_display", f"฿{data.get('amount', 'N/A')}")
        date = data.get("date", "N/A")
        trans_ref = data.get("reference", data.get("transRef", "N/A"))
        sender_name = data.get("sender_name_th") or data.get("sender", "ไม่พบชื่อผู้โอน")
        receiver_name = data.get("receiver_name_th") or data.get("receiver_name", "ไม่พบชื่อผู้รับ")

        if status == "success":
            header = "✅ สลิปถูกต้อง ตรวจสอบสำเร็จ"
        elif status == "duplicate":
            header = "🔄 สลิปนี้เคยถูกตรวจสอบแล้ว"
        else:
            header = "ℹ️ ผลการตรวจสอบสลิป"

        message_parts = [
            header,
            "━━━━━━━━━━━━━━━━━━━━",
            f"💰 จำนวนเงิน: {amount_display}",
            f"📅 วันที่: {date}",
            f"🔢 เลขที่อ้างอิง: {trans_ref}",
            f"👤 ผู้โอน: {sender_name}",
            f"🎯 ผู้รับ: {receiver_name}",
            "━━━━━━━━━━━━━━━━━━━━",
            "🔍 ตรวจสอบโดย: Thunder API"
        ]
        
        return "\n".join(message_parts)
        
    except Exception as e:
        logger.error(f"❌ Error creating slip reply: {e}")
        return f"❌ เกิดข้อผิดพลาดในการสร้างข้อความตอบกลับ"

# Event Handlers
async def send_message_safe(user_id: str, reply_token: str, message: str, message_type: str = "general") -> bool:
    """Send message safely"""
    try:
        success = False
        
        if reply_token and len(reply_token.strip()) > 10:
            success = await send_line_reply(reply_token, message)
        
        if not success:
            success = await send_line_push(user_id, message)
        
        if success:
            try:
                database_functions['save_chat_history'](user_id, "out", {"type": "text", "text": message}, sender=message_type)
            except Exception:
                pass
        
        return success
        
    except Exception as e:
        logger.error(f"❌ send_message_safe error: {e}")
        return False

async def handle_ai_chat(user_id: str, reply_token: str, user_text: str):
    """Handle AI chat"""
    try:
        ai_enabled = config_manager.get("ai_enabled", False)
        openai_key = config_manager.get("openai_api_key", "")
        
        if not ai_enabled:
            response = "ระบบ AI ถูกปิดการใช้งานในขณะนี้ค่ะ"
        elif not openai_key:
            response = "ยังไม่ได้ตั้งค่า OpenAI API Key กรุณาติดต่อผู้ดูแลระบบค่ะ"
        else:
            try:
                response = ai_functions['get_chat_response'](user_text, user_id)
            except Exception as e:
                logger.error(f"❌ AI response error: {e}")
                response = "ขออภัย เกิดข้อผิดพลาดในการประมวลผล AI"
        
        await send_message_safe(user_id, reply_token, response, "ai_bot")
        
    except Exception as e:
        logger.error(f"❌ AI chat error: {e}")
        await send_message_safe(user_id, reply_token, "ขออภัย เกิดข้อผิดพลาดในระบบ AI", "ai_bot_error")

async def handle_slip_verification(user_id: str, reply_token: str, message_id: str = None):
    """Handle slip verification"""
    try:
        slip_enabled = config_manager.get("slip_enabled", False)
        if not slip_enabled:
            await send_message_safe(user_id, reply_token, "ขออภัย ระบบตรวจสอบสลิปถูกปิดใช้งาน", "system_error")
            return
        
        thunder_enabled = config_manager.get("thunder_enabled", True)
        thunder_token = config_manager.get("thunder_api_token", "").strip()
        
        if not thunder_enabled or not thunder_token:
            await send_message_safe(user_id, reply_token, "ระบบตรวจสอบสลิปไม่พร้อมใช้งาน", "system_error")
            return

        processing_msg = "🔍 กรุณารอสักครู่... ระบบกำลังตรวจสอบสลิป"
        await send_line_reply(reply_token, processing_msg)

        try:
            if message_id:
                result = slip_functions['verify_slip_with_thunder'](message_id, None)
            else:
                await send_line_push(user_id, "❌ ไม่สามารถตรวจสอบสลิปได้ ข้อมูลไม่ครบถ้วน")
                return
                
        except Exception as e:
            logger.error(f"❌ Slip verification error: {e}")
            await send_line_push(user_id, "❌ เกิดข้อผิดพลาดในการตรวจสอบสลิป")
            return
        
        if result and result.get("status") in ["success", "duplicate"]:
            reply_message = create_slip_reply_message(result)
            await send_line_push(user_id, reply_message)
            try:
                database_functions['save_chat_history'](user_id, "out", {"type": "text", "text": reply_message}, sender="slip_bot")
            except Exception:
                pass
        else:
            error_msg = result.get('message', 'ไม่ทราบสาเหตุ') if result else 'ไม่มีผลลัพธ์'
            await send_line_push(user_id, f"❌ ไม่สามารถตรวจสอบสลิปได้\n\nสาเหตุ: {error_msg}")
        
    except Exception as e:
        logger.error(f"❌ Critical slip verification error: {e}")
        await send_line_push(user_id, "เกิดข้อผิดพลาดในระบบตรวจสอบสลิป")

async def dispatch_event_async(event: Dict[str, Any]) -> None:
    """Process LINE event"""
    if not IS_READY or SHUTDOWN_INITIATED:
        return
        
    try:
        if event.get("type") != "message":
            return
        
        message = event.get("message", {})
        user_id = event.get("source", {}).get("userId")
        reply_token = event.get("replyToken")
        message_type = message.get("type")
        
        if not user_id or not reply_token:
            return
        
        try:
            user = await user_manager.get_or_create_user(user_id)
        except Exception:
            pass
        
        logger.info(f"🔄 Processing {message_type} from {user_id[:10]}...")
        
        try:
            database_functions['save_chat_history'](user_id, "in", message, sender="user")
        except Exception:
            pass
        
        if message_type == "text":
            user_text = message.get("text", "")
            await handle_ai_chat(user_id, reply_token, user_text)
        elif message_type == "image":
            message_id = message.get("id")
            if message_id:
                await handle_slip_verification(user_id, reply_token, message_id=message_id)
            else:
                await send_message_safe(user_id, reply_token, "ไม่สามารถประมวลผลรูปภาพได้", "system_error")
        else:
            await send_message_safe(user_id, reply_token, "ขออภัย ระบบรองรับเฉพาะข้อความและรูปภาพเท่านั้น", "system")
        
    except Exception as e:
        logger.error(f"❌ Event processing error: {e}")

# API Routes
@app.websocket("/ws/notifications")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint"""
    await notification_manager.connect(websocket)
    
    try:
        while not SHUTDOWN_INITIATED:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await notification_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await notification_manager.disconnect(websocket)

@app.post("/line/webhook")
async def line_webhook(request: Request, background_tasks: BackgroundTasks) -> JSONResponse:
    """LINE webhook endpoint"""
    if not IS_READY:
        return JSONResponse(content={"status": "error", "message": "System not ready"}, status_code=503)

    if SHUTDOWN_INITIATED:
        return JSONResponse(content={"status": "error", "message": "System shutting down"}, status_code=503)

    try:
        body = await request.body()
        payload = json.loads(body.decode("utf-8"))
        events = payload.get("events", [])
        
        for event in events:
            background_tasks.add_task(dispatch_event_async, event)
            
        return JSONResponse(content={"status": "ok", "message": f"{len(events)} events queued"})
        
    except Exception as e:
        logger.error(f"❌ Webhook error: {e}")
        return JSONResponse(content={"status": "error", "message": "Internal error"}, status_code=500)

@app.get("/", response_class=RedirectResponse)
async def root():
    return RedirectResponse(url="/admin")

@app.get("/admin", response_class=HTMLResponse)
async def admin_home(request: Request):
    """Admin home page"""
    try:
        total_count = database_functions['get_chat_history_count']()
        api_statuses = get_api_status_summary()
        system_enabled = config_manager.get("slip_enabled", False) if config_manager else False
        any_api_available = api_statuses.get("thunder", {}).get("configured", False)

        return templates.TemplateResponse(
            "admin_home.html",
            {
                "request": request,
                "config": config_manager,
                "total_chat_history": total_count,
                "system_status": {
                    "system_enabled": system_enabled,
                    "any_api_available": any_api_available
                },
                "api_statuses": api_statuses
            },
        )
    except Exception as e:
        logger.error(f"❌ Admin home error: {e}")
        return templates.TemplateResponse(
            "admin_home.html",
            {
                "request": request,
                "config": config_manager or {},
                "total_chat_history": 0,
                "system_status": {"system_enabled": False, "any_api_available": False},
                "api_statuses": {}
            },
        )

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return JSONResponse({
        "status": "ok" if IS_READY and not SHUTDOWN_INITIATED else "degraded",
        "system_ready": IS_READY,
        "shutting_down": SHUTDOWN_INITIATED,
        "timestamp": datetime.now().isoformat(),
        "version": "2.0.0"
    })

@app.get("/admin/settings", response_class=HTMLResponse)
async def admin_settings(request: Request):
    """Settings page"""
    try:
        config_data = {}
        if config_manager:
            config_data = {
                "line_channel_secret": config_manager.get("line_channel_secret", ""),
                "line_channel_access_token": config_manager.get("line_channel_access_token", ""),
                "thunder_api_token": config_manager.get("thunder_api_token", ""),
                "openai_api_key": config_manager.get("openai_api_key", ""),
                "ai_prompt": config_manager.get("ai_prompt", ""),
                "ai_enabled": config_manager.get("ai_enabled", False),
                "slip_enabled": config_manager.get("slip_enabled", False),
                "thunder_enabled": config_manager.get("thunder_enabled", True),
            }
        
        return templates.TemplateResponse(
            "settings.html",
            {"request": request, "config": config_data}
        )
    except Exception as e:
        logger.error(f"❌ Settings page error: {e}")
        return templates.TemplateResponse(
            "settings.html",
            {"request": request, "config": {}}
        )

@app.post("/admin/settings/update")
async def update_settings(request: Request):
    """Update settings"""
    try:
        data = await request.json()
        
        if config_manager:
            success = config_manager.update_multiple(data)
            
            if success:
                await notification_manager.send_notification("⚙️ อัปเดตการตั้งค่าแล้ว", "success")
                return JSONResponse({
                    "status": "success",
                    "message": "บันทึกการตั้งค่าสำเร็จ"
                })
        
        return JSONResponse({
            "status": "error",
            "message": "ไม่สามารถบันทึกการตั้งค่าได้"
        })
        
    except Exception as e:
        logger.error(f"❌ Update settings error: {e}")
        return JSONResponse({
            "status": "error",
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        })

@app.get("/admin/chat-history", response_class=HTMLResponse)
async def admin_chat_history(request: Request):
    """Chat history page"""
    try:
        chat_history = database_functions['get_recent_chat_history'](100)
        return templates.TemplateResponse(
            "chat_history.html",
            {"request": request, "chat_history": chat_history}
        )
    except Exception as e:
        logger.error(f"❌ Chat history page error: {e}")
        return templates.TemplateResponse(
            "chat_history.html",
            {"request": request, "chat_history": []}
        )

@app.get("/admin/debug", response_class=HTMLResponse)
async def admin_debug(request: Request):
    """Debug page"""
    return templates.TemplateResponse("debug.html", {"request": request})

@app.post("/admin/test-line-connection")
async def test_line_connection():
    """Test LINE API connection"""
    try:
        if not config_manager:
            return JSONResponse({
                "status": "error",
                "message": "Configuration manager ไม่พร้อมใช้งาน"
            })
            
        access_token = config_manager.get("line_channel_access_token")
        if not access_token:
            return JSONResponse({
                "status": "error",
                "message": "LINE Access Token ไม่ได้ตั้งค่า"
            })
        
        url = "https://api.line.me/v2/bot/info"
        headers = {"Authorization": f"Bearer {access_token}"}
        
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(url, headers=headers)
        
        if response.status_code == 200:
            bot_info = response.json()
            return JSONResponse({
                "status": "success",
                "message": "เชื่อมต่อ LINE API สำเร็จ",
                "data": {
                    "bot_name": bot_info.get("displayName", "Unknown"),
                    "user_id": bot_info.get("userId", "Unknown")
                }
            })
        else:
            return JSONResponse({
                "status": "error",
                "message": f"LINE API Error: {response.status_code}"
            })
            
    except Exception as e:
        logger.error(f"❌ Test LINE connection error: {e}")
        return JSONResponse({
            "status": "error",
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        })

@app.post("/admin/test-thunder-connection")
async def test_thunder_connection():
    """Test Thunder API connection"""
    try:
        if not config_manager:
            return JSONResponse({
                "status": "error",
                "message": "Configuration manager ไม่พร้อมใช้งาน"
            })
            
        token = config_manager.get("thunder_api_token", "")
        if not token:
            return JSONResponse({
                "status": "error",
                "message": "Thunder API Token ไม่ได้ตั้งค่า"
            })
        
        result = slip_functions['test_thunder_api_connection'](token)
        
        return JSONResponse({
            "status": result.get("status", "error"),
            "message": result.get("message", "Unknown error"),
            "data": result
        })
        
    except Exception as e:
        logger.error(f"❌ Test Thunder connection error: {e}")
        return JSONResponse({
            "status": "error",
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        })

# Error handlers
@app.exception_handler(404)
async def not_found_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=404,
        content={"status": "error", "message": "Endpoint not found"}
    )

@app.exception_handler(500)
async def internal_error_handler(request: Request, exc: HTTPException):
    logger.error(f"Internal server error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"status": "error", "message": "Internal server error"}
    )

# Main entry point
if __name__ == "__main__":
    import uvicorn
    
    # Environment configuration
    port = int(os.getenv("PORT", 8000))
    host = "0.0.0.0"
    environment = os.getenv("ENVIRONMENT", "development")
    
    logger.info("🚀 Starting LINE OA Middleware...")
    logger.info(f"🌐 Host: {host}")
    logger.info(f"🔌 Port: {port}")
    logger.info(f"🔧 Environment: {environment}")
    logger.info("🔗 Admin UI: http://localhost:8000/admin")
    logger.info("🔗 Health Check: http://localhost:8000/health")
    
    # Check environment variables
    line_secret = os.getenv("LINE_CHANNEL_SECRET")
    line_token = os.getenv("LINE_CHANNEL_ACCESS_TOKEN")
    thunder_token = os.getenv("THUNDER_API_TOKEN")
    
    if line_secret:
        logger.info("✅ LINE_CHANNEL_SECRET configured")
    else:
        logger.warning("⚠️ LINE_CHANNEL_SECRET not set")
    
    if line_token:
        logger.info("✅ LINE_CHANNEL_ACCESS_TOKEN configured")
    else:
        logger.warning("⚠️ LINE_CHANNEL_ACCESS_TOKEN not set")
    
    if thunder_token:
        logger.info("✅ THUNDER_API_TOKEN configured")
    else:
        logger.warning("⚠️ THUNDER_API_TOKEN not set")
    
    try:
        uvicorn.run(
            "main_updated:app",
            host=host,
            port=port,
            workers=1,
            log_level="info",
            access_log=True,
            timeout_keep_alive=30,
            timeout_graceful_shutdown=30,
            reload=(environment == "development")
        )
    except Exception as e:
        logger.error(f"❌ Server startup failed: {e}")
        sys.exit(1)
