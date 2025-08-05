# main_updated.py - Complete Production Version with Enhanced Error Handling
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
    """Enhanced error handling middleware"""
    
    async def dispatch(self, request: Request, call_next):
        try:
            response = await call_next(request)
            return response
        except Exception as e:
            logger.error(f"❌ Unhandled error in {request.url.path}: {e}")
            
            # Don't expose internal errors in production
            if request.url.path.startswith('/admin'):
                error_detail = str(e)
            else:
                error_detail = "Internal server error"
                
            return JSONResponse(
                status_code=500,
                content={"status": "error", "message": error_detail}
            )

class NotificationManager:
    """Enhanced WebSocket notification manager"""
    
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
        if SHUTDOWN_INITIATED:
            return
            
        if not self.active_connections:
            self.pending_notifications.append({
                "message": message,
                "type": notification_type,
                "timestamp": datetime.now().isoformat(),
                "data": data or {}
            })
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

def create_fallback_config_manager():
    """Create fallback configuration manager"""
    global config_manager
    
    class FallbackConfigManager:
        def __init__(self):
            self.config = {
                "line_channel_secret": os.getenv("LINE_CHANNEL_SECRET", ""),
                "line_channel_access_token": os.getenv("LINE_CHANNEL_ACCESS_TOKEN", ""),
                "thunder_api_token": os.getenv("THUNDER_API_TOKEN", ""),
                "openai_api_key": os.getenv("OPENAI_API_KEY", ""),
                "ai_enabled": os.getenv("AI_ENABLED", "true").lower() == "true",
                "slip_enabled": os.getenv("SLIP_ENABLED", "true").lower() == "true",
                "thunder_enabled": os.getenv("THUNDER_ENABLED", "true").lower() == "true",
                "ai_prompt": "คุณเป็นผู้ช่วยระบบชำระเงินที่เชี่ยวชาญ ตอบเฉพาะเรื่องที่เกี่ยวข้องกับธุรกิจเท่านั้น",
                "openai_model": "gpt-3.5-turbo",
                "openai_max_tokens": 150,
                "openai_temperature": 0.7
            }
        
        def get(self, key, default=None):
            return self.config.get(key, default)
        
        def get_all(self):
            return self.config.copy()
        
        def update(self, key, value):
            self.config[key] = value
            logger.info(f"✅ Config updated: {key}")
            return True
        
        def update_multiple(self, updates):
            self.config.update(updates)
            logger.info(f"✅ Updated {len(updates)} configurations")
            return True
        
        def delete(self, key):
            if key in self.config:
                del self.config[key]
                return True
            return False
        
        def reload(self):
            logger.info("🔄 Config reloaded (fallback mode)")
    
    config_manager = FallbackConfigManager()
    logger.info("✅ Fallback config manager created")

def create_fallback_database_functions():
    """Create fallback database functions with in-memory storage"""
    global database_functions
    
    # In-memory storage
    chat_storage = []
    
    class ChatHistory:
        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)
    
    def fallback_init_database():
        logger.info("✅ Fallback database initialized (in-memory)")
    
    def fallback_save_chat(user_id, direction, message, sender):
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
            logger.debug(f"💬 Chat saved: {user_id} ({direction}) - {sender}")
        except Exception as e:
            logger.error(f"❌ Error saving chat: {e}")
    
    def fallback_get_count():
        return len(chat_storage)
    
    def fallback_get_recent(limit=50):
        recent_chats = chat_storage[-limit:] if chat_storage else []
        return [ChatHistory(**chat) for chat in recent_chats]
    
    def fallback_get_user_history(user_id, limit=10):
        user_chats = [c for c in chat_storage if c['user_id'] == user_id][-limit:]
        return [
            {
                "role": "user" if c['direction'] == "in" else "assistant", 
                "content": c['message_text'] or ''
            } 
            for c in user_chats if c['message_text']
        ]
    
    def fallback_log_api_call(api_name, endpoint, method, status_code, response_time, error_message=None):
        logger.info(f"📊 API Call: {api_name} {method} {endpoint} -> {status_code} ({response_time}ms)")
    
    def fallback_get_api_statistics(hours=24):
        return {
            "total_calls": 0,
            "success_calls": 0,
            "success_rate": 100.0,
            "average_response_time": 0.0,
            "period_hours": hours
        }
    
    def fallback_cleanup_old_data(days=30):
        return {
            "deleted_chats": 0,
            "deleted_logs": 0,
            "days": days
        }
    
    database_functions = {
        'init_database': fallback_init_database,
        'save_chat_history': fallback_save_chat,
        'get_chat_history_count': fallback_get_count,
        'get_recent_chat_history': fallback_get_recent,
        'get_user_chat_history': fallback_get_user_history,
        'log_api_call': fallback_log_api_call,
        'get_api_statistics': fallback_get_api_statistics,
        'cleanup_old_data': fallback_cleanup_old_data
    }
    logger.info("✅ Fallback database functions created")

def create_fallback_ai_functions():
    """Create fallback AI functions"""
    global ai_functions
    
    def fallback_get_chat_response(text, user_id):
        if not config_manager.get("ai_enabled", False):
            return "ระบบ AI ถูกปิดการใช้งานในขณะนี้"
        
        if not config_manager.get("openai_api_key"):
            return "ยังไม่ได้ตั้งค่า OpenAI API Key กรุณาติดต่อผู้ดูแลระบบ"
        
        # Simple response for fallback
        return f"ขออภัย ระบบ AI ไม่พร้อมใช้งานในขณะนี้ แต่เราได้รับข้อความของคุณแล้ว: {text[:50]}..."
    
    ai_functions = {
        'get_chat_response': fallback_get_chat_response
    }
    logger.info("✅ Fallback AI functions created")

def create_fallback_slip_functions():
    """Create fallback slip functions"""
    global slip_functions
    
    def fallback_verify_slip(message_id, test_data=None):
        if not config_manager.get("thunder_enabled", True):
            return {"status": "error", "message": "Thunder API ถูกปิดใช้งาน"}
        
        if not config_manager.get("thunder_api_token"):
            return {"status": "error", "message": "ยังไม่ได้ตั้งค่า Thunder API Token"}
        
        return {
            "status": "error",
            "message": "ระบบตรวจสอบสลิปไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง"
        }
    
    def fallback_test_thunder(token):
        return {
            "status": "error",
            "message": "Thunder API connection test ไม่พร้อมใช้งาน"
        }
    
    def fallback_extract_slip_info(text):
        return {"bank_code": None, "trans_ref": None}
    
    slip_functions = {
        'verify_slip_with_thunder': fallback_verify_slip,
        'test_thunder_api_connection': fallback_test_thunder,
        'extract_slip_info_from_text': fallback_extract_slip_info
    }
    logger.info("✅ Fallback slip functions created")

def create_fallback_user_services():
    """Create fallback user management services"""
    global user_manager, message_sender
    
    class FallbackUser:
        def __init__(self, user_id, display_name=None):
            self.user_id = user_id
            self.display_name = display_name or f'User {user_id[:8]}...'
            self.first_name = ""
            self.last_name = ""
            self.profile_picture_url = ""
            self.is_blocked = False
            self.created_at = datetime.now()
            self.updated_at = datetime.now()
            self.last_active = datetime.now()
            self.chat_history = []
    
    class FallbackUserManager:
        def __init__(self):
            self.users = {}
        
        def set_line_token(self, token):
            pass
        
        async def get_or_create_user(self, user_id):
            if user_id not in self.users:
                self.users[user_id] = FallbackUser(user_id)
            return self.users[user_id]
        
        def get_all_users(self, limit=100, search=None):
            users = list(self.users.values())[:limit]
            if search:
                search_lower = search.lower()
                users = [u for u in users if search_lower in u.display_name.lower() or search_lower in u.user_id.lower()]
            return users
        
        def get_user_stats(self):
            return {
                "total_users": len(self.users),
                "active_24h": len(self.users),  # Simplified
                "new_this_week": len(self.users)  # Simplified
            }
        
        def update_user(self, user_id, updates):
            if user_id in self.users:
                for key, value in updates.items():
                    setattr(self.users[user_id], key, value)
                return True
            return False
    
    class FallbackMessageSender:
        def set_line_token(self, token):
            pass
        
        async def send_message_to_user(self, user_id, message):
            logger.info(f"📤 [Fallback] Would send message to {user_id}: {message[:50]}...")
            return {"status": "error", "message": "Message sender ไม่พร้อมใช้งาน"}
        
        async def broadcast_message(self, user_ids, message):
            logger.info(f"📢 [Fallback] Would broadcast to {len(user_ids)} users: {message[:50]}...")
            return {"status": "error", "message": "Broadcast ไม่พร้อมใช้งาน"}
    
    user_manager = FallbackUserManager()
    message_sender = FallbackMessageSender()
    logger.info("✅ Fallback user services created")

def safe_import_modules():
    """Safely import all required modules with comprehensive fallbacks"""
    global IS_READY, config_manager, database_functions, ai_functions, slip_functions, user_manager, message_sender
    
    logger.info("🔄 Starting safe module imports...")
    
    try:
        # Config Manager - Try multiple options
        config_loaded = False
        for config_module in [
            "utils.stable_config_manager",
            "utils.postgres_config_manager", 
            "utils.config_manager"
        ]:
            try:
                module = __import__(config_module, fromlist=['config_manager'])
                config_manager = module.config_manager
                logger.info(f"✅ Config manager imported from {config_module}")
                config_loaded = True
                break
            except ImportError as e:
                logger.warning(f"⚠️ {config_module} import failed: {e}")
        
        if not config_loaded:
            create_fallback_config_manager()
        
        # Database Functions - Try multiple options
        db_loaded = False 
        for db_module in [
            "models.postgres_database",
            "models.database"
        ]:
            try:
                module = __import__(db_module, fromlist=[
                    'init_database', 'save_chat_history', 'get_chat_history_count',
                    'get_recent_chat_history', 'get_user_chat_history'
                ])
                
                database_functions = {
                    'init_database': getattr(module, 'init_database'),
                    'save_chat_history': getattr(module, 'save_chat_history'),
                    'get_chat_history_count': getattr(module, 'get_chat_history_count'),
                    'get_recent_chat_history': getattr(module, 'get_recent_chat_history'),
                    'get_user_chat_history': getattr(module, 'get_user_chat_history'),
                    'log_api_call': getattr(module, 'log_api_call', lambda *a, **k: None),
                    'get_api_statistics': getattr(module, 'get_api_statistics', lambda *a, **k: {}),
                    'cleanup_old_data': getattr(module, 'cleanup_old_data', lambda *a, **k: {})
                }
                logger.info(f"✅ Database functions imported from {db_module}")
                db_loaded = True
                break
            except ImportError as e:
                logger.warning(f"⚠️ {db_module} import failed: {e}")
        
        if not db_loaded:
            create_fallback_database_functions()
        
        # AI Chat Functions
        ai_loaded = False
        try:
            from services.chat_bot import get_chat_response
            ai_functions = {'get_chat_response': get_chat_response}
            logger.info("✅ AI chat functions imported")
            ai_loaded = True
        except ImportError as e:
            logger.warning(f"⚠️ AI chat import failed: {e}")
        
        if not ai_loaded:
            create_fallback_ai_functions()
        
        # Slip Verification Functions  
        slip_loaded = False
        try:
            from services.slip_checker import verify_slip_with_thunder, test_thunder_api_connection
            slip_functions = {
                'verify_slip_with_thunder': verify_slip_with_thunder,
                'test_thunder_api_connection': test_thunder_api_connection,
                'extract_slip_info_from_text': lambda t: {"bank_code": None, "trans_ref": None}
            }
            logger.info("✅ Thunder slip verification imported")
            slip_loaded = True
        except ImportError as e:
            logger.warning(f"⚠️ Slip verification import failed: {e}")
        
        if not slip_loaded:
            create_fallback_slip_functions()
        
        # User Management Services
        user_services_loaded = False
        try:
            from services.user_manager import user_manager as um
            from services.message_sender import message_sender as ms
            user_manager = um
            message_sender = ms
            logger.info("✅ User management services imported")
            user_services_loaded = True
        except ImportError as e:
            logger.warning(f"⚠️ User management import failed: {e}")
        
        if not user_services_loaded:
            create_fallback_user_services()
        
        # Initialize Database
        try:
            database_functions['init_database']()
            logger.info("✅ Database initialized")
        except Exception as e:
            logger.error(f"❌ Database init error: {e}")
        
        IS_READY = True
        logger.info("✅ All modules loaded successfully - System READY")
        
        # Log system configuration
        db_type = "PostgreSQL" if 'postgres' in str(database_functions.get('init_database', '')) else "Fallback"
        config_type = "PostgreSQL" if hasattr(config_manager, '_cache') else "Fallback"
        logger.info(f"📊 Active Systems: Database={db_type}, Config={config_type}")
        
    except Exception as e:
        logger.error(f"❌ Critical import error: {e}")
        IS_READY = False
        
        # Create all fallback services
        create_fallback_config_manager()
        create_fallback_database_functions()
        create_fallback_ai_functions()
        create_fallback_slip_functions()
        create_fallback_user_services()

# Graceful shutdown handler
async def shutdown_handler(signum=None, frame=None):
    global SHUTDOWN_INITIATED
    SHUTDOWN_INITIATED = True
    logger.info(f"🛑 Received shutdown signal: {signum}")
    await notification_manager.send_notification("🛑 ระบบกำลังปิดทำงาน", "warning")

def setup_signal_handlers():
    try:
        signal.signal(signal.SIGTERM, lambda s, f: asyncio.create_task(shutdown_handler(s, f)))
        signal.signal(signal.SIGINT, lambda s, f: asyncio.create_task(shutdown_handler(s, f)))
        logger.info("✅ Signal handlers setup complete")
    except Exception as e:
        logger.warning(f"⚠️ Could not setup signal handlers: {e}")

# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    setup_signal_handlers()
    safe_import_modules()
    
    logger.info("🚀 LINE OA Middleware starting...")
    logger.info(f"🔧 System ready: {IS_READY}")
    
    if IS_READY:
        try:
            init_line_bot()
        except Exception as e:
            logger.error(f"❌ LINE Bot init error: {e}")
    
    try:
        await notification_manager.send_notification("🚀 ระบบ LINE OA Middleware เริ่มทำงานแล้ว", "success")
    except Exception as e:
        logger.error(f"❌ Startup notification error: {e}")
    
    yield
    
    # Shutdown
    logger.info("🛑 LINE OA Middleware shutting down...")
    try:
        await notification_manager.send_notification("🛑 ระบบหยุดทำงานแล้ว", "info")
    except Exception as e:
        logger.error(f"❌ Shutdown notification error: {e}")

# Create FastAPI app
app = FastAPI(
    title="LINE OA Middleware (Production)",
    description="Enhanced LINE OA Middleware with Thunder slip verification",
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

# Static files (if exists)
if os.path.exists("static"):
    app.mount("/static", StaticFiles(directory="static"), name="static")

# ====================== Utility Functions ======================

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
                "recent_failures": 0,
                "last_failure": 0,
                "recently_failed": False
            }
        }
    except Exception as e:
        logger.error(f"❌ Error in get_api_status_summary: {e}")
        return {"thunder": {"enabled": False, "configured": False, "connected": False}}

def init_line_bot():
    """Initialize LINE Bot credentials"""
    try:
        access_token = config_manager.get("line_channel_access_token")
        channel_secret = config_manager.get("line_channel_secret")
        
        if access_token and channel_secret:
            logger.info("✅ LINE Bot credentials loaded")
            return True
        else:
            logger.warning("⚠️ LINE credentials not found")
            return False
    except Exception as e:
        logger.error(f"❌ LINE Bot init error: {e}")
        return False

async def send_line_reply(reply_token: str, text: str, max_retries: int = 2) -> bool:
    """Send LINE reply message"""
    if SHUTDOWN_INITIATED:
        return False
        
    try:
        access_token = config_manager.get("line_channel_access_token")
        if not access_token:
            logger.error("❌ LINE_CHANNEL_ACCESS_TOKEN is missing")
            return False
        
        if not reply_token or len(reply_token.strip()) < 10:
            logger.error("❌ Invalid reply token")
            return False
        
        if len(text) > 5000:
            text = text[:4900] + "\n\n(ข้อความถูกตัดเนื่องจากยาวเกินไป)"
        
        url = "https://api.line.me/v2/bot/message/reply"
        headers = {
            "Authorization": f"Bearer {access_token}", 
            "Content-Type": "application/json",
            "User-Agent": "LINE-OA-Middleware/2.0",
        }
        payload = {
            "replyToken": reply_token, 
            "messages": [{"type": "text", "text": text}]
        }
        
        timeout = httpx.Timeout(15.0, connect=5.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            for attempt in range(max_retries):
                try:
                    logger.info(f"📤 Sending LINE reply (attempt {attempt + 1}/{max_retries})")
                    response = await client.post(url, headers=headers, json=payload)
                    
                    if response.status_code == 200:
                        logger.info("✅ LINE reply sent successfully")
                        return True
                    elif response.status_code == 400:
                        logger.error(f"❌ LINE Reply API 400: {response.text}")
                        return False
                    elif response.status_code == 401:
                        logger.error("❌ LINE Reply API 401: Invalid token")
                        return False
                    elif response.status_code >= 500 and attempt < max_retries - 1:
                        await asyncio.sleep(1)
                        continue
                    else:
                        logger.error(f"❌ LINE Reply API {response.status_code}: {response.text}")
                        return False
                        
                except (httpx.TimeoutException, httpx.RequestError) as e:
                    logger.warning(f"⚠️ LINE Reply request error (attempt {attempt + 1}): {e}")
                    if attempt < max_retries - 1:
                        await asyncio.sleep(1)
                        continue
                except Exception as e:
                    logger.error(f"❌ Unexpected error in reply: {e}")
                    return False
        
        return False
        
    except Exception as e:
        logger.error(f"❌ send_line_reply error: {e}")
        return False

async def send_line_push(user_id: str, text: str, max_retries: int = 2) -> bool:
    """Send LINE push message"""
    if SHUTDOWN_INITIATED:
        return False
        
    try:
        access_token = config_manager.get("line_channel_access_token")
        if not access_token:
            logger.error("❌ LINE_CHANNEL_ACCESS_TOKEN is missing")
            return False

        if not user_id or user_id.strip() == "":
            logger.error("❌ User ID is empty")
            return False

        if len(text) > 5000:
            text = text[:4900] + "\n\n(ข้อความถูกตัดเนื่องจากยาวเกินไป)"

        url = "https://api.line.me/v2/bot/message/push"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "User-Agent": "LINE-OA-Middleware/2.0",
        }
        payload = {
            "to": user_id,
            "messages": [{"type": "text", "text": text}],
        }

        timeout = httpx.Timeout(15.0, connect=5.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            for attempt in range(max_retries):
                try:
                    logger.info(f"📤 Sending LINE push (attempt {attempt + 1}/{max_retries})")
                    response = await client.post(url, headers=headers, json=payload)
                    
                    if response.status_code == 200:
                        logger.info("✅ Push message sent successfully")
                        return True
                    elif response.status_code == 400:
                        logger.error(f"❌ LINE Push API 400: {response.text}")
                        return False
                    elif response.status_code == 401:
                        logger.error("❌ LINE Push API 401: Invalid token")  
                        return False
                    elif response.status_code == 403:
                        logger.error(f"❌ LINE Push API 403: {response.text}")
                        return False
                    elif response.status_code >= 500 and attempt < max_retries - 1:
                        await asyncio.sleep(2)
                        continue
                    else:
                        logger.error(f"❌ LINE Push API {response.status_code}: {response.text}")
                        return False
                        
                except (httpx.TimeoutException, httpx.RequestError) as e:
                    logger.warning(f"⚠️ LINE Push request error (attempt {attempt + 1}): {e}")
                    if attempt < max_retries - 1:
                        await asyncio.sleep(2)
                        continue
                except Exception as e:
                    logger.error(f"❌ Unexpected error in push: {e}")
                    return False
        
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

        # Extract basic information
        amount_display = data.get("amount_display", f"฿{data.get('amount', 'N/A')}")
        date = data.get("date", data.get("trans_date", "N/A"))
        time_str = data.get("time", data.get("trans_time", ""))
        trans_ref = data.get("reference", data.get("transRef", "N/A"))
        
        # Sender and receiver names
        sender_name = (
            data.get("sender_name_th") or 
            data.get("sender_name_en") or 
            data.get("sender", "ไม่พบชื่อผู้โอน")
        )
        
        receiver_name = (
            data.get("receiver_name_th") or 
            data.get("receiver_name_en") or 
            data.get("receiver_name", data.get("receiver", "ไม่พบชื่อผู้รับ"))
        )
        
        # Banks
        sender_bank = data.get("sender_bank_short", data.get("sender_bank", ""))
        receiver_bank = data.get("receiver_bank_short", data.get("receiver_bank", ""))
        verified_by = data.get("verified_by", "Thunder API")

        # Create message
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
            f"📅 วันที่: {date}" + (f" {time_str}" if time_str else ""),
            f"🔢 เลขที่อ้างอิง: {trans_ref}",
            "",
            f"👤 ผู้โอน: {sender_name}"
        ]
        
        if sender_bank:
            message_parts.append(f"🏦 จาก: ธ.{sender_bank}")
        
        message_parts.extend([
            "",
            f"🎯 ผู้รับ: {receiver_name}"
        ])
        
        if receiver_bank:
            message_parts.append(f"🏦 ไปยัง: ธ.{receiver_bank}")
        
        message_parts.extend([
            "━━━━━━━━━━━━━━━━━━━━",
            f"🔍 ตรวจสอบโดย: {verified_by}"
        ])
        
        if status == "duplicate":
            message_parts.extend([
                "",
                "⚠️ หมายเหตุ: สลิปนี้เคยถูกใช้แล้ว"
            ])
        elif status == "success":
            message_parts.extend([
                "",
                "✅ สลิปนี้ถูกต้องและยืนยันแล้ว"
            ])
        
        return "\n".join(message_parts)
        
    except Exception as e:
        logger.error(f"❌ Error creating slip reply: {e}")
        return f"❌ เกิดข้อผิดพลาดในการสร้างข้อความตอบกลับ: {str(e)}"

# ====================== Event Handlers ======================

async def send_message_safe(user_id: str, reply_token: str, message: str, message_type: str = "general") -> bool:
    """Send message safely with fallback"""
    try:
        success = False
        
        # Try reply first
        if reply_token and len(reply_token.strip()) > 10:
            success = await send_line_reply(reply_token, message)
            if success:
                logger.info("✅ Reply sent successfully")
            else:
                logger.warning("⚠️ Reply failed, trying push...")
        
        # If reply failed, try push
        if not success:
            success = await send_line_push(user_id, message)
            if success:
                logger.info("✅ Push sent successfully")
        
        # Save chat history
        if success:
            try:
                database_functions['save_chat_history'](user_id, "out", {"type": "text", "text": message}, sender=message_type)
            except Exception as e:
                logger.warning(f"⚠️ Failed to save chat history: {e}")
        
        return success
        
    except Exception as e:
        logger.error(f"❌ send_message_safe error: {e}")
        return False

async def handle_ai_chat(user_id: str, reply_token: str, user_text: str):
    """Handle AI chat with enhanced error handling"""
    try:
        ai_enabled = config_manager.get("ai_enabled", False)
        openai_key = config_manager.get("openai_api_key", "")
        
        if not ai_enabled:
            response = "ระบบ AI ถูกปิดการใช้งานในขณะนี้ค่ะ"
        elif not openai_key:
            response = "ยังไม่ได้ตั้งค่า OpenAI API Key กรุณาติดต่อผู้ดูแลระบบค่ะ"
        else:
            try:
                response = await asyncio.wait_for(
                    asyncio.to_thread(ai_functions['get_chat_response'], user_text, user_id),
                    timeout=30.0
                )
            except asyncio.TimeoutError:
                response = "ขออภัย AI ตอบสนองช้าเกินไป กรุณาลองใหม่อีกครั้ง"
            except Exception as e:
                logger.error(f"❌ AI response error: {e}")
                response = "ขออภัย เกิดข้อผิดพลาดในการประมวลผล AI"
        
        success = await send_message_safe(user_id, reply_token, response, "ai_bot")
        
        if not success:
            logger.error("❌ Failed to send AI response")
        
    except Exception as e:
        logger.error(f"❌ AI chat error: {e}")
        error_msg = "ขออภัย เกิดข้อผิดพลาดในระบบ AI"
        await send_message_safe(user_id, reply_token, error_msg, "ai_bot_error")

async def handle_slip_verification(user_id: str, reply_token: str, message_id: str = None):
    """Handle slip verification with Thunder API"""
    try:
        # Check if slip system is enabled
        slip_enabled = config_manager.get("slip_enabled", False)
        if not slip_enabled:
            await send_message_safe(user_id, reply_token, "ขออภัย ระบบตรวจสอบสลิปถูกปิดใช้งาน", "system_error")
            return
        
        # Check Thunder API
        thunder_enabled = config_manager.get("thunder_enabled", True)
        thunder_token = config_manager.get("thunder_api_token", "").strip()
        
        if not thunder_enabled:
            await send_message_safe(user_id, reply_token, "ระบบตรวจสอบสลิปถูกปิดใช้งาน", "system_error")
            return
            
        if not thunder_token:
            await send_message_safe(user_id, reply_token, "ระบบยังไม่ได้ตั้งค่า Thunder API กรุณาติดต่อผู้ดูแล", "system_error")
            return

        # Notify user
        processing_msg = "🔍 กรุณารอสักครู่... ระบบกำลังตรวจสอบสลิป"
        await send_line_reply(reply_token, processing_msg)

        # Verify slip
        try:
            if message_id:
                result = await asyncio.wait_for(
                    asyncio.to_thread(
                        slip_functions['verify_slip_with_thunder'], 
                        message_id, None
                    ),
                    timeout=60.0
                )
            else:
                await send_line_push(user_id, "❌ ไม่สามารถตรวจสอบสลิปได้ ข้อมูลไม่ครบถ้วน")
                return
                
        except asyncio.TimeoutError:
            await send_line_push(user_id, "❌ การตรวจสอบสลิปใช้เวลานานเกินไป กรุณาลองใหม่")
            return
        except Exception as e:
            logger.error(f"❌ Slip verification error: {e}")
            await send_line_push(user_id, f"❌ เกิดข้อผิดพลาดในการตรวจสอบสลิป")
            return
        
        # Process result
        if result and result.get("status") in ["success", "duplicate"]:
            reply_message = create_slip_reply_message(result)
            push_success = await send_line_push(user_id, reply_message)
            
            if push_success:
                try:
                    database_functions['save_chat_history'](user_id, "out", {"type": "text", "text": reply_message}, sender="slip_bot")
                except Exception as e:
                    logger.warning(f"⚠️ Failed to save slip result: {e}")
            else:
                # Try short message
                short_msg = f"✅ ตรวจสอบสลิปสำเร็จ\n💰 จำนวน: {result.get('data', {}).get('amount_display', 'N/A')}"
                await send_line_push(user_id, short_msg)
        else:
            error_msg = result.get('message', 'ไม่ทราบสาเหตุ') if result else 'ไม่มีผลลัพธ์'
            full_error_msg = f"❌ ไม่สามารถตรวจสอบสลิปได้\n\nสาเหตุ: {error_msg}"
            await send_line_push(user_id, full_error_msg)
        
    except Exception as e:
        logger.error(f"❌ Critical slip verification error: {e}")
        error_msg = "เกิดข้อผิดพลาดในระบบตรวจสอบสลิป กรุณาติดต่อผู้ดูแล"
        await send_line_push(user_id, error_msg)

async def dispatch_event_async(event: Dict[str, Any]) -> None:
    """Process LINE event with user management"""
    if not IS_READY or SHUTDOWN_INITIATED:
        logger.error("❌ System not ready or shutting down")
        return
        
    try:
        if event.get("type") != "message":
            return
        
        message = event.get("message", {})
        user_id = event.get("source", {}).get("userId")
        reply_token = event.get("replyToken")
        message_type = message.get("type")
        
        if not user_id or not reply_token:
            logger.error("❌ Missing user ID or reply token")
            return
        
        # Manage user
        line_token = config_manager.get("line_channel_access_token")
        if user_manager and hasattr(user_manager, 'set_line_token'):
            user_manager.set_line_token(line_token)
        if message_sender and hasattr(message_sender, 'set_line_token'):
            message_sender.set_line_token(line_token)
        
        try:
            user = await user_manager.get_or_create_user(user_id)
            user_display = user.display_name if user and hasattr(user, 'display_name') else user_id[:10]
        except Exception as e:
            logger.warning(f"⚠️ User management error: {e}")
            user_display = user_id[:10]
        
        logger.info(f"🔄 Processing {message_type} from {user_display}...")
        
        # Save chat history
        try:
            database_functions['save_chat_history'](user_id, "in", message, sender="user")
        except Exception as e:
            logger.warning(f"⚠️ Failed to save chat history: {e}")
        
        # Process message
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
        try:
            user_id = event.get("source", {}).get("userId")
            reply_token = event.get("replyToken")
            if user_id and reply_token:
                await send_message_safe(user_id, reply_token, "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่", "system_error")
        except Exception:
            pass

# ====================== API Routes ======================

@app.websocket("/ws/notifications")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time notifications"""
    await notification_manager.connect(websocket)
    
    # Send pending notifications
    for notification in notification_manager.pending_notifications:
        try:
            await websocket.send_text(json.dumps(notification))
        except Exception as e:
            logger.error(f"Error sending pending notification: {e}")
    notification_manager.pending_notifications.clear()
    
    try:
        while not SHUTDOWN_INITIATED:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await notification_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await notification_manager.disconnect(websocket)

@app.post("/line/webhook")
async def line_webhook(request: Request, background_tasks: BackgroundTasks, x_line_signature: str = Header(None)) -> JSONResponse:
    """LINE webhook endpoint"""
    if not IS_READY:
        logger.error("❌ System not ready")
        return JSONResponse(content={"status": "error", "message": "System not ready"}, status_code=503)

    if SHUTDOWN_INITIATED:
        logger.warning("⚠️ Shutdown in progress, rejecting webhook")
        return JSONResponse(content={"status": "error", "message": "System shutting down"}, status_code=503)

    try:
        body = await request.body()
        
        try:
            payload = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError as e:
            logger.error(f"❌ JSON decode error: {e}")
            raise HTTPException(status_code=400, detail="Invalid JSON")
        
        events = payload.get("events", [])
        
        # Process events in background
        for event in events:
            background_tasks.add_task(dispatch_event_async, event)
            
        return JSONResponse(content={"status": "ok", "message": f"{len(events)} events queued"})
        
    except Exception as e:
        logger.error(f"❌ Webhook error: {e}")
        return JSONResponse(content={"status": "error", "message": "Internal error"}, status_code=500)

@app.get("/", response_class=RedirectResponse)
async def root():
    """Root redirect"""
    return RedirectResponse(url="/admin")

@app.get("/admin", response_class=HTMLResponse)
async def admin_home(request: Request):
    """Admin home page"""
    try:
        total_count = database_functions['get_chat_history_count']()
        api_statuses = get_api_status_summary()
        system_enabled = config_manager.get("slip_enabled", False) if config_manager else False
        any_api_available = api_statuses.get("thunder", {}).get("enabled", False) and api_statuses.get("thunder", {}).get("configured", False)

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
    """Basic health check endpoint"""
    return JSONResponse({
        "status": "ok" if IS_READY and not SHUTDOWN_INITIATED else "degraded",
        "system_ready": IS_READY,
        "shutting_down": SHUTDOWN_INITIATED,
        "timestamp": datetime.now().isoformat(),
        "active_connections": len(notification_manager.active_connections),
        "version": "2.0.0"
    })

@app.get("/health/comprehensive")
async def comprehensive_health_check():
    """Comprehensive health check with detailed information"""
    try:
        # Test database
        db_healthy = True
        message_count = 0
        try:
            message_count = database_functions['get_chat_history_count']()
            db_healthy = True
        except Exception as e:
            db_healthy = False
            logger.error(f"Database health check failed: {e}")
        
        # Test config
        config_healthy = config_manager is not None
        
        # Test LINE API
        line_healthy = False
        if config_manager:
            line_token = config_manager.get("line_channel_access_token")
            line_healthy = bool(line_token and len(line_token.strip()) > 10)
        
        # Test Thunder API
        thunder_healthy = False
        if config_manager:
            thunder_token = config_manager.get("thunder_api_token")
            thunder_healthy = bool(thunder_token and len(thunder_token.strip()) > 10)
        
        overall_healthy = all([IS_READY, not SHUTDOWN_INITIATED, db_healthy, config_healthy])
        
        return JSONResponse({
            "status": "healthy" if overall_healthy else "unhealthy",
            "timestamp": datetime.now().isoformat(),
            "version": "2.0.0",
            "checks": {
                "system_ready": IS_READY,
                "not_shutting_down": not SHUTDOWN_INITIATED,
                "database": db_healthy,
                "configuration": config_healthy,
                "line_api": line_healthy,
                "thunder_api": thunder_healthy
            },
            "details": {
                "message_count": message_count,
                "websocket_connections": len(notification_manager.active_connections),
                "modules_loaded": {
                    "config_manager": config_manager is not None,
                    "database_functions": bool(database_functions),
                    "ai_functions": bool(ai_functions), 
                    "slip_functions": bool(slip_functions),
                    "user_manager": user_manager is not None,
                    "message_sender": message_sender is not None
                }
            }
        })
        
    except Exception as e:
        logger.error(f"❌ Comprehensive health check error: {e}")
        return JSONResponse({
            "status": "error",
            "timestamp": datetime.now().isoformat(),
            "error": str(e)
        }, status_code=500)

# Additional essential routes (simplified versions for space)
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
    """Update system settings"""
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
            "message": f"เกิดข้อผิดพลาดในการบันทึก: {str(e)}"
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
                    "user_id": bot_info.get("userId", "Unknown"),
                    "premium_id": bot_info.get("premiumId", "Unknown")
                }
            })
        elif response.status_code == 401:
            return JSONResponse({
                "status": "error",
                "message": "LINE Access Token ไม่ถูกต้อง"
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
    """Handle 404 errors"""
    return JSONResponse(
        status_code=404,
        content={"status": "error", "message": "Endpoint not found"}
    )

@app.exception_handler(500)
async def internal_error_handler(request: Request, exc: HTTPException):
    """Handle 500 errors"""
    logger.error(f"Internal server error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"status": "error", "message": "Internal server error"}
    )

# Main entry point
if __name__ == "__main__":
    import uvicorn
    
    print("🚀 Starting LINE OA Middleware (Production - Enhanced Error Handling)...")
    print("🔗 Admin UI: http://localhost:8000/admin")  
    print("🔗 Debug Console: http://localhost:8000/admin/debug")
    print("🔗 Health Check: http://localhost:8000/health")
    print("🔗 Comprehensive Health: http://localhost:8000/health/comprehensive")
    print("⚡ Thunder API Support: Enabled")
    print("🔒 Enhanced Error Handling: Enabled")
    
    try:
        uvicorn.run(
            "main_updated:app",
            host="0.0.0.0",
            port=int(os.getenv("PORT", 8000)),
            workers=1,
            reload=False,
            log_level="info",
            access_log=True,
            timeout_keep_alive=5,
            timeout_graceful_shutdown=10
        )
    except Exception as e:
        logger.error(f"❌ Server startup failed: {e}")
        sys.exit(1)
