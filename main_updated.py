# main_updated.py (ฉบับแก้ไข)
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

# เพิ่มพาธปัจจุบันเข้าไปใน sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

# ตั้งค่า logging แบบ production
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('app.log', encoding='utf-8') if os.path.exists('.') else logging.StreamHandler()
    ]
)
logger = logging.getLogger("main_app")

import httpx
from fastapi import FastAPI, Request, HTTPException, status, WebSocket, WebSocketDisconnect, Header, BackgroundTasks
from models.line_account_db import LineAccountManager
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

# Global state
IS_READY = False
SHUTDOWN_INITIATED = False

class NotificationManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.pending_notifications: List[Dict] = []
        self.slip_processing_status = {}
        self.duplicate_slip_cache: Dict[str, Dict] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket):
        try:
            await websocket.accept()
            async with self._lock:
                self.active_connections.append(websocket)
            logger.info(f"📱 WebSocket connected. Total connections: {len(self.active_connections)}")
        except Exception as e:
            logger.error(f"❌ WebSocket connect error: {e}")

    async def disconnect(self, websocket: WebSocket):
        try:
            async with self._lock:
                if websocket in self.active_connections:
                    self.active_connections.remove(websocket)
            logger.info(f"📱 WebSocket disconnected. Total connections: {len(self.active_connections)}")
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
                    logger.error(f"Error sending notification: {e}")
                    disconnected.append(connection)

        for conn in disconnected:
            await self.disconnect(conn)

notification_manager = NotificationManager()
line_account_manager = None

# Graceful shutdown handler
async def shutdown_handler(signum=None, frame=None):
    global SHUTDOWN_INITIATED
    SHUTDOWN_INITIATED = True
    logger.info(f"🛑 Received shutdown signal: {signum}")
    await notification_manager.send_notification("🛑 ระบบกำลังปิดทำงาน", "warning")

# Setup signal handlers
def setup_signal_handlers():
    try:
        signal.signal(signal.SIGTERM, lambda s, f: asyncio.create_task(shutdown_handler(s, f)))
        signal.signal(signal.SIGINT, lambda s, f: asyncio.create_task(shutdown_handler(s, f)))
        logger.info("✅ Signal handlers setup complete")
    except Exception as e:
        logger.warning(f"⚠️ Could not setup signal handlers: {e}")

# Import modules with comprehensive error handling
config_manager = None
database_functions = {}
ai_functions = {}
slip_functions = {}

# ในส่วน safe_import_modules() แก้ไขเป็น:
# main_updated.py - แก้ไขในส่วน safe_import_modules() บรรทัดประมาณ 100-200

async def safe_import_modules():
    """Safely import all required modules with fallbacks"""
    global IS_READY, config_manager, database_functions, ai_functions, slip_functions, line_account_manager

    logger.info("🔄 Starting module imports...")

    try:
        # Initialize Config Manager
        try:
            from utils.config_manager import config_manager as cm
            config_manager = cm
            logger.info("✅ Config manager initialized")
        except Exception as e:
            logger.error(f"❌ Config manager init failed: {e}")
            # Create a simple config manager
            class SimpleConfigManager:
                def __init__(self):
                    self.config = {}
                def get(self, key, default=None):
                    return os.getenv(key.upper(), default)
                def update(self, key, value):
                    self.config[key] = value
                    return True
                def update_multiple(self, updates):
                    self.config.update(updates)
                    return True
            config_manager = SimpleConfigManager()

        # Database functions - Initialize async
        database_import_success = False
        db_manager = None  # Initialize as None first

        try:
            from models.database import (
                init_database, save_chat_history, get_chat_history_count,
                get_recent_chat_history, get_user_chat_history, test_connection,
                get_connection_info, get_database_status, get_config, set_config,
                get_user_chat_history_sync, save_event, save_raw_event,
                get_user_info, save_slip_data
            )
            
            init_result = await init_database()
            
            if init_result is True:
                logger.info("✅ Database initialized successfully")
                
                # CRITICAL FIX: Import db_manager
                try:
                    from models.database import db_manager as dbm
                    db_manager = dbm
                    logger.info("✅ db_manager imported successfully")
                except ImportError as e:
                    logger.error(f"❌ Failed to import db_manager: {e}")
                    db_manager = None
                
                database_functions = {
                    'init_database': init_database,
                    'save_chat_history': save_chat_history,
                    'get_chat_history_count': get_chat_history_count,
                    'get_recent_chat_history': get_recent_chat_history,
                    'get_user_chat_history': get_user_chat_history,
                    'get_user_chat_history_sync': get_user_chat_history_sync,
                    'test_connection': test_connection,
                    'get_connection_info': get_connection_info,
                    'get_database_status': get_database_status,
                    'get_config': get_config,
                    'set_config': set_config,
                    'save_event': save_event,
                    'save_raw_event': save_raw_event,
                    'get_user_info': get_user_info,
                    'save_slip_data': save_slip_data
                }
                
                if db_manager:
                    database_functions['db_manager'] = db_manager
                    
                # CRITICAL FIX: Bind config manager to database functions
                if config_manager and 'get_config' in database_functions and 'set_config' in database_functions:
                    config_manager.db_functions = {
                        'get_config': database_functions['get_config'],
                        'set_config': database_functions['set_config'],
                    }
                    logger.info("✅ Config Manager bound to database functions")
                
                # CRITICAL FIX: Initialize LineAccountManager
                if db_manager and hasattr(db_manager, 'db') and db_manager.db:
                    try:
                        from models.line_account_db import LineAccountManager
                        line_account_manager = LineAccountManager(db_manager.db)
                        
                        # Create indexes
                        try:
                            await line_account_manager.create_indexes()
                            logger.info("✅ Line Account Manager indexes created")
                        except Exception as e:
                            logger.warning(f"⚠️ Could not create LINE account indexes: {e}")
                        
                        logger.info("✅ Line Account Manager initialized successfully")
                    except Exception as e:
                        logger.error(f"❌ Line Account Manager init failed: {e}")
                        line_account_manager = None
                else:
                    logger.warning("⚠️ Cannot initialize Line Account Manager - db_manager.db not available")
                    line_account_manager = None
                
                database_import_success = True
                logger.info("✅ Database functions imported successfully")
            else:
                logger.error("❌ Database initialization returned False")
                database_import_success = False
                
        except Exception as e:
            logger.error(f"⚠️ Database import/init failed: {e}")
            logger.exception(e)
            database_import_success = False

        if not database_import_success:
            logger.warning("⚠️ Using dummy database functions")
            # [Keep all the dummy functions as they are]
            async def dummy_save(u, d, m, s): return False
            async def dummy_count(): return 0
            async def dummy_recent(l=50): return []
            async def dummy_user_history(u, l=10): return []
            def dummy_user_history_sync(u, l=10): return []
            async def dummy_test(): return {"status": "error", "message": "Database not available"}
            def dummy_info(): return {"connected": False, "type": "Unavailable"}
            async def dummy_get_status(): return {"status": "error", "message": "Database not available"}
            async def dummy_get_config(key, default=None): return default
            async def dummy_set_config(key, value, is_sensitive=False): return False
            async def dummy_save_event(u, t, e): return False
            async def dummy_save_raw_event(e): return False
            async def dummy_get_user_info(u): return {"user_id": u}
            async def dummy_save_slip_data(u, d): return False

            database_functions = {
                'init_database': lambda: False,
                'save_chat_history': dummy_save,
                'get_chat_history_count': dummy_count,
                'get_recent_chat_history': dummy_recent,
                'get_user_chat_history': dummy_user_history,
                'get_user_chat_history_sync': dummy_user_history_sync,
                'test_connection': dummy_test,
                'get_connection_info': dummy_info,
                'get_database_status': dummy_get_status,
                'get_config': dummy_get_config,
                'set_config': dummy_set_config,
                'save_event': dummy_save_event,
                'save_raw_event': dummy_save_raw_event,
                'get_user_info': dummy_get_user_info,
                'save_slip_data': dummy_save_slip_data
            }
            
            # LineAccountManager won't work without database
            line_account_manager = None
            logger.warning("⚠️ Line Account Manager disabled - no database")

        # Import AI modules
        try:
            from services.chat_bot import get_chat_response
            ai_functions['get_chat_response'] = get_chat_response
            logger.info("✅ AI modules imported")
        except Exception as e:
            logger.warning(f"⚠️ AI module import failed: {e}")
            def dummy_chat_response(text, user_id):
                return "ขออภัย ระบบ AI ไม่พร้อมใช้งานในขณะนี้"
            ai_functions['get_chat_response'] = dummy_chat_response

        # Import Slip verification modules
        try:
            from services.enhanced_slip_checker import (
                extract_slip_info_from_text, verify_slip_multiple_providers,
                get_api_status_summary, reset_api_failure_cache
            )
            from services.slip_checker import test_thunder_api_connection
            
            slip_functions['extract_slip_info_from_text'] = extract_slip_info_from_text
            slip_functions['verify_slip_multiple_providers'] = verify_slip_multiple_providers
            slip_functions['get_api_status_summary'] = get_api_status_summary
            slip_functions['reset_api_failure_cache'] = reset_api_failure_cache
            slip_functions['test_thunder_api_connection'] = test_thunder_api_connection
            logger.info("✅ Slip modules imported")
        except Exception as e:
            logger.warning(f"⚠️ Slip module import failed: {e}")
            def dummy_extract(text): return {"bank_code": None, "trans_ref": None}
            def dummy_verify(message_id=None, test_image_data=None, bank_code=None, trans_ref=None):
                return {"status": "error", "message": "Slip verification not available"}
            def dummy_api_status(): return {"thunder": {"enabled": False, "configured": False, "connected": False, "recent_failures": 0}}
            def dummy_reset(): return False
            def dummy_test_thunder(token): return {"status": "error", "message": "Thunder API not available"}
            
            slip_functions['extract_slip_info_from_text'] = dummy_extract
            slip_functions['verify_slip_multiple_providers'] = dummy_verify
            slip_functions['get_api_status_summary'] = dummy_api_status
            slip_functions['reset_api_failure_cache'] = dummy_reset
            slip_functions['test_thunder_api_connection'] = dummy_test_thunder

        IS_READY = True
        logger.info("✅ All modules loaded successfully - System READY")
        logger.info(f"📊 Line Account Manager status: {'Ready' if line_account_manager else 'Not Available'}")
        
        await notification_manager.send_notification(
            "🚀 System started successfully", 
            "success",
            {
                "database": database_functions.get('get_connection_info', lambda: {"connected": False})() if database_functions else {"connected": False},
                "ai_available": 'get_chat_response' in ai_functions,
                "slip_available": 'verify_slip_multiple_providers' in slip_functions,
                "accounts_available": line_account_manager is not None
            }
        )
        return True
        
    except Exception as e:
        logger.error(f"❌ Critical import error: {e}")
        logger.exception(e)
        IS_READY = False
        
        await notification_manager.send_notification(
            f"❌ System startup error: {str(e)}", 
            "error"
        )
        return False
# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    setup_signal_handlers()
    await safe_import_modules()
    
    logger.info("🚀 LINE OA Middleware starting...")
    logger.info(f"🔧 System ready: {IS_READY}")
    
    yield
    
    # Shutdown
    logger.info("🛑 LINE OA Middleware shutting down...")

# Create FastAPI app with lifespan
app = FastAPI(
    title="LINE OA Middleware (Production)",
    description="Enhanced LINE OA Middleware with slip verification",
    version="2.0.0",
    lifespan=lifespan
)

# Add CORS middleware
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
    """ดึงสรุปสถานะ API (Production version)"""
    try:
        if slip_functions and 'get_api_status_summary' in slip_functions:
            return slip_functions['get_api_status_summary']()
        return {
            "thunder": {"enabled": False, "configured": False, "connected": False, "recent_failures": 0},
            "kbank": {"enabled": False, "configured": False, "connected": False, "recent_failures": 0}
        }
    except Exception as e:
        logger.error(f"❌ Error in get_api_status_summary: {e}")
        return {
            "thunder": {"enabled": False, "configured": False, "connected": False, "recent_failures": 0},
            "kbank": {"enabled": False, "configured": False, "connected": False, "recent_failures": 0}
        }

def reset_api_failure_cache():
    """รีเซ็ต API failure cache"""
    try:
        if slip_functions and 'reset_api_failure_cache' in slip_functions:
            return slip_functions['reset_api_failure_cache']()
        return False
    except Exception as e:
        logger.error(f"❌ Error in reset_api_failure_cache: {e}")
        return False

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
    """Send LINE reply message (Production version)"""
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
    """Send LINE push message (Production version)"""
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
    """สร้างข้อความตอบกลับสำหรับผลการตรวจสอบสลิป"""
    try:
        status = result.get("status")
        data = result.get("data", {})

        if not data:
            error_msg = result.get("message", "ไม่ทราบสาเหตุ")
            return f"❌ ไม่สามารถดึงข้อมูลสลิปได้\n\nสาเหตุ: {error_msg}"

        # ดึงข้อมูลพื้นฐาน
        amount_display = data.get("amount_display", f"฿{data.get('amount', 'N/A')}")
        date = data.get("date", data.get("trans_date", "N/A"))
        time_str = data.get("time", data.get("trans_time", ""))
        trans_ref = data.get("reference", data.get("transRef", "N/A"))
        
        # ชื่อผู้ส่งและผู้รับ
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
        
        # ธนาคาร
        sender_bank = data.get("sender_bank_short", data.get("sender_bank", ""))
        receiver_bank = data.get("receiver_bank_short", data.get("receiver_bank", ""))
        verified_by = data.get("verified_by", "ระบบ")

        # สร้างข้อความ
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
    """ส่งข้อความอย่างปลอดภัย"""
    try:
        success = False
        
        # ลอง reply ก่อน
        if reply_token and len(reply_token.strip()) > 10:
            success = await send_line_reply(reply_token, message)
            if success:
                logger.info("✅ Reply sent successfully")
            else:
                logger.warning("⚠️ Reply failed, trying push...")
        
        # ถ้า reply ไม่ได้ ลอง push
        if not success:
            success = await send_line_push(user_id, message)
            if success:
                logger.info("✅ Push sent successfully")
        
        # บันทึกประวัติ
        if success:
            try:
                # ตรวจสอบว่า database_functions มี 'save_chat_history' และเรียกใช้ await
                if 'save_chat_history' in database_functions:
                    await database_functions['save_chat_history'](user_id, "out", {"type": "text", "text": message}, sender=message_type)
            except Exception as e:
                logger.warning(f"⚠️ Failed to save chat history: {e}")
        
        return success
        
    except Exception as e:
        logger.error(f"❌ send_message_safe error: {e}")
        return False

# แก้ไข handle_ai_chat ใน main_updated.py

async def handle_ai_chat(user_id: str, reply_token: str, user_text: str):
    """จัดการแชท AI พร้อมบันทึก"""
    try:
        # ตรวจสอบการตั้งค่า
        ai_enabled = False
        openai_key = ""
        
        if config_manager:
            ai_enabled = config_manager.get("ai_enabled", False)
            openai_key = config_manager.get("openai_api_key", "")
        
        if not ai_enabled:
            response = "ระบบ AI ถูกปิดการใช้งานค่ะ"
        elif not openai_key:
            response = "ยังไม่ได้ตั้งค่า OpenAI API Key ค่ะ"
        else:
            # เรียกใช้ AI
            try:
                if 'get_chat_response' in ai_functions:
                    response = await asyncio.wait_for(
                        asyncio.to_thread(ai_functions['get_chat_response'], user_text, user_id),
                        timeout=30.0
                    )
                    logger.info(f"🤖 AI response generated")
                else:
                    response = "ขออภัย ระบบ AI ไม่พร้อมใช้งาน"
            except asyncio.TimeoutError:
                response = "ขออภัย AI ตอบสนองช้า"
            except Exception as e:
                logger.error(f"❌ AI error: {e}")
                response = "ขออภัย เกิดข้อผิดพลาด"
        
        # ส่งข้อความตอบกลับ
        send_success = await send_line_reply(reply_token, response)
        
        # บันทึกข้อความขาออก
        if send_success:
            try:
                if 'save_chat_history' in database_functions:
                    result = await database_functions['save_chat_history'](
                        user_id, 
                        "out", 
                        {"type": "text", "text": response}, 
                        "ai_bot"
                    )
                    if result is True:
                        logger.info(f"✅ AI response saved")
            except Exception as e:
                logger.error(f"❌ Failed to save AI response: {e}")
        
    except Exception as e:
        logger.error(f"❌ AI chat error: {e}")
		
		
# เพิ่มฟังก์ชันใหม่นี้ (หลังฟังก์ชัน save_incoming_message เดิม)
async def save_chat_with_account(user_id: str, direction: str, message: Dict[str, Any], 
                                 sender: str, account_id: str = None) -> bool:
    """บันทึกข้อความพร้อม account_id"""
    try:
        if not IS_READY or 'save_chat_history' not in database_functions:
            logger.error("❌ Database not ready for saving chat")
            return False
            
        logger.info(f"💾 Saving chat from {user_id[:8]}... for account {account_id[:8] if account_id else 'default'}...")
        
        # เพิ่ม account_id ในข้อมูลที่จะบันทึก
        if 'save_chat_history' in database_functions:
            # สร้าง extended message ที่มี account_id
            extended_message = message.copy()
            extended_message['_account_id'] = account_id
            
            await database_functions['save_chat_history'](
                user_id, direction, extended_message, sender
            )
            
            # อัพเดท user กับ account association
            if db_manager and db_manager.db:
                await db_manager.db.users.update_one(
                    {"user_id": user_id},
                    {
                        "$set": {"last_account_id": account_id},
                        "$addToSet": {"account_ids": account_id}
                    }
                )
        
        logger.info(f"✅ Successfully saved chat with account {account_id}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to save chat with account: {e}")
        return False
		
# เพิ่มฟังก์ชันใหม่นี้ (หลังฟังก์ชัน dispatch_event_async เดิม)
async def dispatch_event_with_account(event: Dict[str, Any], account: Dict[str, Any]) -> None:
    """Process LINE event with account context"""
    if not IS_READY or SHUTDOWN_INITIATED:
        logger.error("❌ System not ready or shutting down")
        return
        
    try:
        # Save original config
        original_config = {}
        if config_manager:
            original_config = config_manager.config.copy()
            
            # Override with account-specific config
            config_manager.config.update({
                'line_channel_secret': account.get('channel_secret'),
                'line_channel_access_token': account.get('channel_access_token'),
                'thunder_api_token': account.get('thunder_api_token'),
                'openai_api_key': account.get('openai_api_key'),
                'kbank_consumer_id': account.get('kbank_consumer_id'),
                'kbank_consumer_secret': account.get('kbank_consumer_secret'),
                'ai_enabled': account.get('ai_enabled', False),
                'slip_enabled': account.get('slip_enabled', False),
                'thunder_enabled': account.get('thunder_enabled', True),
                'kbank_enabled': account.get('kbank_enabled', False),
                'ai_prompt': account.get('ai_prompt', 'คุณเป็นผู้ช่วยที่เป็นมิตร')
            })
        
        # Add account context to event
        event['_account_id'] = str(account.get('_id', ''))
        event['_account_config'] = account
        
        # Process event
        event_type = event.get("type")
        
        if event_type == "message":
            await handle_message_event_with_account(event)
        elif event_type == "follow":
            await handle_follow_event(event)
        elif event_type == "unfollow":
            await handle_unfollow_event(event)
        else:
            logger.info(f"📋 Received event type: {event_type}")
            
        # Restore original config
        if config_manager and original_config:
            config_manager.config = original_config
            
    except Exception as e:
        logger.error(f"❌ Event processing with account error: {e}")
        logger.exception(e)
		
# เพิ่มฟังก์ชันใหม่นี้ (หลัง handle_message_event เดิม)
async def handle_message_event_with_account(event: Dict[str, Any]) -> None:
    """Handle message event with account context"""
    message = event.get("message", {})
    user_id = event.get("source", {}).get("userId")
    reply_token = event.get("replyToken")
    message_type = message.get("type")
    account_id = event.get("_account_id")
    
    if not user_id:
        logger.error("❌ Missing user ID in message event")
        return
    
    logger.info(f"📨 Received {message_type} message from {user_id[:10]}... for account {account_id[:8] if account_id else 'unknown'}...")
    
    # สร้างข้อมูลข้อความสำหรับบันทึก
    save_message = {
        "type": message_type,
        "text": "",
        "id": message.get("id"),
        "timestamp": event.get("timestamp"),
        "_account_id": account_id  # เพิ่ม account_id
    }
    
    # จัดการตามประเภทข้อความ (เหมือนเดิม)
    if message_type == "text":
        save_message["text"] = message.get("text", "")
    elif message_type == "image":
        save_message["text"] = "[รูปภาพ]"
    elif message_type == "video":
        save_message["text"] = "[วิดีโอ]"
    elif message_type == "audio":
        save_message["text"] = "[ไฟล์เสียง]"
    elif message_type == "file":
        save_message["text"] = f"[ไฟล์: {message.get('fileName', 'unknown')}]"
    elif message_type == "location":
        save_message["text"] = f"[ตำแหน่ง: {message.get('title', 'Unknown')}]"
    elif message_type == "sticker":
        save_message["text"] = "[สติกเกอร์]"
    else:
        save_message["text"] = f"[{message_type}]"
    
    # บันทึกข้อความขาเข้าพร้อม account_id
    save_success = False
    try:
        save_success = await save_chat_with_account(
            user_id, "in", save_message, "user", account_id
        )
        
        if save_success:
            logger.info(f"✅ Message saved with account {account_id[:8] if account_id else 'unknown'}")
        else:
            logger.error(f"❌ Failed to save message with account")
            
    except Exception as e:
        logger.error(f"❌ Error saving incoming message: {e}")
    
    # ประมวลผลข้อความ (AI, slip verification)
    if message_type == "text":
        user_text = message.get("text", "")
        
        # ตรวจสอบสลิป
        slip_info = {"bank_code": None, "trans_ref": None}
        if slip_functions and 'extract_slip_info_from_text' in slip_functions:
            try:
                slip_info = slip_functions['extract_slip_info_from_text'](user_text)
            except Exception as e:
                logger.error(f"❌ Error extracting slip info: {e}")
        
        if slip_info.get("bank_code") and slip_info.get("trans_ref"):
            await handle_slip_verification(user_id, reply_token, slip_info=slip_info)
        else:
            await handle_ai_chat(user_id, reply_token, user_text)
            
    elif message_type == "image":
        message_id = message.get("id")
        if message_id:
            await handle_slip_verification(user_id, reply_token, message_id=message_id)
			
			


# เพิ่ม endpoint ใหม่นี้หลัง @app.post("/line/webhook") เดิม
@app.post("/line/{account_id}/webhook")
async def line_account_webhook(
    account_id: str, 
    request: Request, 
    background_tasks: BackgroundTasks,
    x_line_signature: str = Header(None)
) -> JSONResponse:
    """LINE webhook endpoint for specific account"""
    if not IS_READY:
        logger.error("❌ System not ready")
        return JSONResponse(content={"status": "error", "message": "System not ready"}, status_code=503)

    if SHUTDOWN_INITIATED:
        logger.warning("⚠️ Shutdown in progress, rejecting webhook")
        return JSONResponse(content={"status": "error", "message": "System shutting down"}, status_code=503)

    try:
        # Check if line_account_manager is initialized
        if not line_account_manager:
            logger.error("❌ Line Account Manager not initialized")
            return JSONResponse(
                content={"status": "error", "message": "Account manager not ready"}, 
                status_code=503
            )
        
        # Get account configuration
        account = await line_account_manager.get_account(account_id)
        if not account:
            logger.error(f"❌ Account not found: {account_id}")
            return JSONResponse(
                content={"status": "error", "message": "Account not found"}, 
                status_code=404
            )
        
        logger.info(f"📨 Webhook called for account: {account.get('display_name')} ({account_id[:8]}...)")
        
        body = await request.body()
        
        # Verify LINE signature with account's channel secret
        if x_line_signature and account.get('channel_secret'):
            import hmac
            import hashlib
            import base64
            
            channel_secret = account.get('channel_secret')
            hash = hmac.new(
                channel_secret.encode('utf-8'),
                body,
                hashlib.sha256
            ).digest()
            signature = base64.b64encode(hash).decode('utf-8')
            
            if signature != x_line_signature:
                logger.warning(f"⚠️ Invalid signature for account {account_id}")
                return JSONResponse(
                    content={"status": "error", "message": "Invalid signature"}, 
                    status_code=400
                )
        
        # Parse payload
        try:
            payload = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError as e:
            logger.error(f"❌ JSON decode error: {e}")
            return JSONResponse(
                content={"status": "error", "message": "Invalid JSON"}, 
                status_code=400
            )
        
        events = payload.get("events", [])
        logger.info(f"🔔 Account {account_id[:8]} received {len(events)} events")
        
        # Process events with account context
        for event in events:
            background_tasks.add_task(dispatch_event_with_account, event, account)
            
        return JSONResponse(content={"status": "ok", "message": f"{len(events)} events queued"})
        
    except Exception as e:
        logger.error(f"❌ Account webhook error: {e}")
        logger.exception(e)
        return JSONResponse(
            content={"status": "error", "message": "Internal error"}, 
            status_code=500
        )
		
		
async def handle_slip_verification(user_id: str, reply_token: str, message_id: str = None, slip_info: dict = None):
    """จัดการตรวจสอบสลิป - บันทึกเงียบๆ"""
    try:
        # ตรวจสอบระบบ
        slip_enabled = config_manager.get("slip_enabled", False)
        if not slip_enabled:
            logger.info(f"🚫 Slip system disabled for {user_id[:10]}")
            await send_line_reply(reply_token, "ขออภัย ระบบตรวจสอบสลิปถูกปิดใช้งาน")
            return
        
        # ตรวจสอบ API
        thunder_enabled = config_manager.get("thunder_enabled", True)
        thunder_token = config_manager.get("thunder_api_token", "").strip()
        kbank_enabled = config_manager.get("kbank_enabled", False)
        kbank_configured = bool(config_manager.get("kbank_consumer_id") and config_manager.get("kbank_consumer_secret"))
        
        if not thunder_enabled and not kbank_enabled:
            logger.warning(f"⚠️ No slip API enabled for {user_id[:10]}")
            await send_line_reply(reply_token, "ระบบตรวจสอบสลิปถูกปิดใช้งาน")
            return
            
        if not thunder_token and not kbank_configured:
            logger.error(f"❌ Slip API not configured for {user_id[:10]}")
            await send_line_reply(reply_token, "ระบบยังไม่ได้ตั้งค่า กรุณาติดต่อผู้ดูแล")
            return

        # แจ้งผู้ใช้ว่ากำลังตรวจสอบ
        processing_msg = "🔍 กรุณารอสักครู่... ระบบกำลังตรวจสอบสลิป"
        await send_line_reply(reply_token, processing_msg)
        
        logger.info(f"🔍 Starting slip verification for {user_id[:10]}")

        # ตรวจสอบสลิป
        try:
            if slip_info and slip_info.get("bank_code") and slip_info.get("trans_ref"):
                result = await asyncio.wait_for(
                    asyncio.to_thread(
                        slip_functions['verify_slip_multiple_providers'], 
                        None, None, 
                        slip_info.get("bank_code"), 
                        slip_info.get("trans_ref")
                    ),
                    timeout=60.0
                )
                logger.info(f"📝 Slip verification by text for {user_id[:10]}")
            elif message_id:
                result = await asyncio.wait_for(
                    asyncio.to_thread(
                        slip_functions['verify_slip_multiple_providers'], 
                        message_id=message_id
                    ),
                    timeout=60.0
                )
                logger.info(f"📝 Slip verification by image for {user_id[:10]}")
            else:
                logger.error(f"❌ No slip data for {user_id[:10]}")
                await send_line_push(user_id, "❌ ไม่สามารถตรวจสอบสลิปได้ ข้อมูลไม่ครบถ้วน")
                return
                
        except asyncio.TimeoutError:
            logger.error(f"⏱️ Slip verification timeout for {user_id[:10]}")
            await send_line_push(user_id, "❌ การตรวจสอบสลิปใช้เวลานานเกินไป กรุณาลองใหม่")
            return
        except Exception as e:
            logger.error(f"❌ Slip verification error for {user_id[:10]}: {e}")
            logger.exception(e)
            await send_line_push(user_id, f"❌ เกิดข้อผิดพลาดในการตรวจสอบสลิป")
            return
        
        # ประมวลผลผลลัพธ์
        if result and result.get("status") in ["success", "duplicate"]:
            reply_message = create_slip_reply_message(result)
            push_success = await send_line_push(user_id, reply_message)
            
            if push_success:
                logger.info(f"✅ Slip result sent to {user_id[:10]}")
                # บันทึกผลลัพธ์ (เงียบๆ)
                try:
                    if 'save_chat_history' in database_functions:
                        await database_functions['save_chat_history'](
                            user_id, "out", 
                            {"type": "text", "text": reply_message}, 
                            sender="slip_bot"
                        )
                        # บันทึกข้อมูลสลิปด้วย
                        if 'save_slip_data' in database_functions:
                            await database_functions['save_slip_data'](user_id, result)
                except Exception as e:
                    logger.error(f"❌ Failed to save slip result: {e}")
            else:
                logger.error(f"❌ Failed to send slip result to {user_id[:10]}")
        else:
            error_msg = result.get('message', 'ไม่ทราบสาเหตุ') if result else 'ไม่มีผลลัพธ์'
            full_error_msg = f"❌ ไม่สามารถตรวจสอบสลิปได้\n\nสาเหตุ: {error_msg}"
            await send_line_push(user_id, full_error_msg)
            logger.warning(f"⚠️ Slip verification failed for {user_id[:10]}: {error_msg}")
        
    except Exception as e:
        logger.error(f"❌ Critical slip verification error for {user_id[:10]}: {e}")
        logger.exception(e)
        await send_line_push(user_id, "เกิดข้อผิดพลาดในระบบตรวจสอบสลิป กรุณาติดต่อผู้ดูแล")

async def dispatch_event_async(event: Dict[str, Any]) -> None:
    """Process LINE event - บันทึกข้อมูลแบบเงียบ"""
    if not IS_READY or SHUTDOWN_INITIATED:
        logger.error("❌ System not ready or shutting down")
        return
        
    try:
        event_type = event.get("type")
        
        # บันทึก raw event ทั้งหมด
        await save_raw_event(event)
        
        # จัดการ event types ต่างๆ
        if event_type == "message":
            await handle_message_event(event)
        elif event_type == "follow":
            await handle_follow_event(event)
        elif event_type == "unfollow":
            await handle_unfollow_event(event)
        elif event_type == "join":
            await handle_join_event(event)
        elif event_type == "leave":
            await handle_leave_event(event)
        elif event_type == "postback":
            await handle_postback_event(event)
        elif event_type == "memberJoined":
            await handle_member_joined_event(event)
        elif event_type == "memberLeft":
            await handle_member_left_event(event)
        else:
            logger.info(f"📝 Received event type: {event_type}")
            
    except Exception as e:
        logger.error(f"❌ Event processing error: {e}")
        logger.exception(e)

# แก้ไข handle_message_event (บรรทัดประมาณ 400-500)

# แทนที่ฟังก์ชัน handle_message_event ทั้งหมดด้วยโค้ดนี้

async def handle_message_event(event: Dict[str, Any]) -> None:
    """Handle message event - บันทึกและประมวลผล"""
    message = event.get("message", {})
    user_id = event.get("source", {}).get("userId")
    reply_token = event.get("replyToken")
    message_type = message.get("type")
    
    if not user_id:
        logger.error("❌ Missing user ID in message event")
        return
    
    logger.info(f"📨 Received {message_type} message from {user_id[:10]}...")
    
    # สร้างข้อมูลข้อความสำหรับบันทึก
    save_message = {
        "type": message_type,
        "text": "",
        "id": message.get("id"),
        "timestamp": event.get("timestamp")
    }
    
    # จัดการตามประเภทข้อความ
    if message_type == "text":
        save_message["text"] = message.get("text", "")
    elif message_type == "image":
        save_message["text"] = "[รูปภาพ]"
        save_message["contentProvider"] = message.get("contentProvider", {})
    elif message_type == "video":
        save_message["text"] = "[วิดีโอ]"
        save_message["duration"] = message.get("duration")
    elif message_type == "audio":
        save_message["text"] = "[ไฟล์เสียง]"
        save_message["duration"] = message.get("duration")
    elif message_type == "file":
        save_message["text"] = f"[ไฟล์: {message.get('fileName', 'unknown')}]"
        save_message["fileName"] = message.get("fileName")
        save_message["fileSize"] = message.get("fileSize")
    elif message_type == "location":
        save_message["text"] = f"[ตำแหน่ง: {message.get('title', 'Unknown')}]"
        save_message["title"] = message.get("title")
        save_message["address"] = message.get("address")
        save_message["latitude"] = message.get("latitude")
        save_message["longitude"] = message.get("longitude")
    elif message_type == "sticker":
        save_message["text"] = "[สติกเกอร์]"
        save_message["packageId"] = message.get("packageId")
        save_message["stickerId"] = message.get("stickerId")
    else:
        save_message["text"] = f"[{message_type}]"
    
    # บันทึกข้อความขาเข้า
    save_success = False
    try:
        if 'save_chat_history' in database_functions:
            # เรียกใช้และรอผลลัพธ์
            result = await database_functions['save_chat_history'](
                user_id, 
                "in", 
                save_message, 
                "user"
            )
            
            # ตรวจสอบผลลัพธ์แบบชัดเจน
            if result is True:
                logger.info(f"✅ Successfully saved incoming message from {user_id[:10]}")
                save_success = True
            else:
                logger.error(f"❌ Failed to save message - result: {result}")
                save_success = False
        else:
            logger.error("❌ save_chat_history function not available in database_functions")
            
    except Exception as e:
        logger.error(f"❌ Error saving incoming message: {e}")
        logger.exception(e)
        save_success = False
    
    # แสดงสถานะการบันทึก
    if not save_success:
        logger.warning(f"⚠️ Message from {user_id[:10]} was NOT saved to database")
    
    # ประมวลผลข้อความ (AI, slip verification ฯลฯ)
    if message_type == "text":
        user_text = message.get("text", "")
        logger.info(f"📝 Text message: {user_text[:50]}...")
        
        # ตรวจสอบสลิป
        slip_info = {"bank_code": None, "trans_ref": None}
        if slip_functions and 'extract_slip_info_from_text' in slip_functions:
            try:
                slip_info = slip_functions['extract_slip_info_from_text'](user_text)
            except Exception as e:
                logger.error(f"❌ Error extracting slip info: {e}")
        
        if slip_info.get("bank_code") and slip_info.get("trans_ref"):
            # ตรวจสอบสลิป
            await handle_slip_verification(user_id, reply_token, slip_info=slip_info)
        else:
            # AI Chat
            await handle_ai_chat(user_id, reply_token, user_text)
            
    elif message_type == "image":
        logger.info(f"🖼️ Image message from {user_id[:10]}...")
        message_id = message.get("id")
        if message_id:
            # ตรวจสอบสลิป
            await handle_slip_verification(user_id, reply_token, message_id=message_id)
        else:
            # ตอบกลับทั่วไป
            reply_message = {
                "type": "text",
                "text": "ได้รับรูปภาพแล้ว ขอบคุณครับ"
            }
            await send_line_reply(reply_token, reply_message["text"])
            
            # บันทึกข้อความตอบกลับ
            if save_success and 'save_chat_history' in database_functions:
                try:
                    await database_functions['save_chat_history'](
                        user_id, "out", reply_message, "system"
                    )
                except Exception as e:
                    logger.error(f"❌ Failed to save reply: {e}")
    else:
        logger.info(f"📄 {message_type} message from {user_id[:10]}...")
        
        # ตอบกลับทั่วไป
        reply_text = f"ได้รับ{save_message['text']}แล้ว ขอบคุณครับ"
        await send_line_reply(reply_token, reply_text)
        
        # บันทึกข้อความตอบกลับ
        if save_success and 'save_chat_history' in database_functions:
            try:
                await database_functions['save_chat_history'](
                    user_id, "out", {"type": "text", "text": reply_text}, "system"
                )
            except Exception as e:
                logger.error(f"❌ Failed to save reply: {e}")

async def enhance_message_data(event: Dict[str, Any], message: Dict[str, Any]) -> Dict[str, Any]:
    """เพิ่มข้อมูลเสริมในข้อความ"""
    enhanced = message.copy()
    
    # เพิ่ม metadata
    enhanced["timestamp"] = event.get("timestamp")
    enhanced["source"] = event.get("source", {})
    enhanced["mode"] = event.get("mode")
    enhanced["webhookEventId"] = event.get("webhookEventId")
    enhanced["deliveryContext"] = event.get("deliveryContext", {})
    
    # สำหรับ media messages
    if message.get("type") in ["image", "video", "audio", "file"]:
        enhanced["contentProvider"] = message.get("contentProvider", {})
        enhanced["duration"] = message.get("duration")
        enhanced["fileName"] = message.get("fileName")
        enhanced["fileSize"] = message.get("fileSize")
        
    return enhanced

async def extract_and_save_urls(user_id: str, text: str):
    """ดึงและบันทึก URLs จากข้อความ"""
    try:
        import re
        url_pattern = r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+'
        urls = re.findall(url_pattern, text)
        
        if urls:
            for url in urls:
                logger.info(f"🔗 Found URL: {url[:50]}...")
                # บันทึกลง database
                if database_functions and 'save_url' in database_functions:
                    await database_functions['save_url'](user_id, url)
    except Exception as e:
        logger.error(f"❌ Error extracting URLs: {e}")

async def save_media_reference(user_id: str, message_id: str, media_type: str, message_data: Dict):
    """บันทึก media reference"""
    try:
        if database_functions and 'save_media_reference' in database_functions:
            await database_functions['save_media_reference'](
                user_id, message_id, media_type, message_data
            )
            
        # ดาวน์โหลดในพื้นหลัง (ถ้าต้องการ)
        if config_manager.get("auto_download_media", False):
            asyncio.create_task(download_media_background(message_id, media_type))
            
    except Exception as e:
        logger.error(f"❌ Error saving media reference: {e}")

async def save_location_data(user_id: str, location_message: Dict):
    """บันทึกข้อมูลตำแหน่ง"""
    try:
        if database_functions and 'save_location' in database_functions:
            await database_functions['save_location'](user_id, location_message)
        logger.info(f"📍 Location saved for {user_id[:10]}")
    except Exception as e:
        logger.error(f"❌ Error saving location: {e}")

async def download_media_background(message_id: str, media_type: str):
    """ดาวน์โหลด media ในพื้นหลัง"""
    try:
        line_token = config_manager.get("line_channel_access_token", "").strip()
        if not line_token:
            logger.error("❌ LINE token not configured for media download")
            return
        
        url = f"https://api-data.line.me/v2/bot/message/{message_id}/content"
        headers = {"Authorization": f"Bearer {line_token}"}
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, timeout=60)
            
            if response.status_code == 200:
                content_data = response.content
                logger.info(f"✅ Downloaded {media_type}: {len(content_data)} bytes")
                
                # บันทึกลง database หรือ storage
                if database_functions and 'save_media_content' in database_functions:
                    await database_functions['save_media_content'](
                        message_id, content_data, media_type
                    )
            else:
                logger.error(f"❌ Failed to download {media_type}: HTTP {response.status_code}")
                
    except Exception as e:
        logger.error(f"❌ Error downloading media: {e}")

async def save_raw_event(event: Dict[str, Any]):
    """บันทึก raw event ทั้งหมด"""
    try:
        if database_functions and 'save_raw_event' in database_functions:
            await database_functions['save_raw_event'](event)
            logger.debug(f"📝 Raw event saved")
    except Exception as e:
        logger.error(f"❌ Error saving raw event: {e}")

async def handle_follow_event(event: Dict[str, Any]):
    """Handle follow event - บันทึกเงียบๆ"""
    user_id = event.get("source", {}).get("userId")
    if user_id:
        logger.info(f"➕ New follower: {user_id[:10]}...")
        try:
            if database_functions and 'save_event' in database_functions:
                await database_functions['save_event'](user_id, "follow", event)
        except Exception as e:
            logger.error(f"❌ Error saving follow event: {e}")

async def handle_unfollow_event(event: Dict[str, Any]):
    """Handle unfollow event - บันทึกเงียบๆ"""
    user_id = event.get("source", {}).get("userId")
    if user_id:
        logger.info(f"➖ User unfollowed: {user_id[:10]}...")
        try:
            if database_functions and 'save_event' in database_functions:
                await database_functions['save_event'](user_id, "unfollow", event)
        except Exception as e:
            logger.error(f"❌ Error saving unfollow event: {e}")

async def handle_join_event(event: Dict[str, Any]):
    """Handle join group event"""
    group_id = event.get("source", {}).get("groupId")
    if group_id:
        logger.info(f"👥 Joined group: {group_id[:10]}...")
        try:
            if database_functions and 'save_event' in database_functions:
                await database_functions['save_event'](group_id, "join", event)
        except Exception as e:
            logger.error(f"❌ Error saving join event: {e}")

async def handle_leave_event(event: Dict[str, Any]):
    """Handle leave group event"""
    group_id = event.get("source", {}).get("groupId")
    if group_id:
        logger.info(f"👥 Left group: {group_id[:10]}...")
        try:
            if database_functions and 'save_event' in database_functions:
                await database_functions['save_event'](group_id, "leave", event)
        except Exception as e:
            logger.error(f"❌ Error saving leave event: {e}")

async def handle_postback_event(event: Dict[str, Any]):
    """Handle postback event"""
    user_id = event.get("source", {}).get("userId")
    postback_data = event.get("postback", {})
    if user_id:
        logger.info(f"📮 Postback from {user_id[:10]}: {postback_data.get('data', '')}")
        try:
            if database_functions and 'save_event' in database_functions:
                await database_functions['save_event'](user_id, "postback", event)
        except Exception as e:
            logger.error(f"❌ Error saving postback event: {e}")

async def handle_member_joined_event(event: Dict[str, Any]):
    """Handle member joined group event"""
    group_id = event.get("source", {}).get("groupId")
    joined = event.get("joined", {}).get("members", [])
    if group_id and joined:
        logger.info(f"👥 {len(joined)} members joined group {group_id[:10]}...")
        try:
            if database_functions and 'save_event' in database_functions:
                await database_functions['save_event'](group_id, "memberJoined", event)
        except Exception as e:
            logger.error(f"❌ Error saving member joined event: {e}")

async def handle_member_left_event(event: Dict[str, Any]):
    """Handle member left group event"""
    group_id = event.get("source", {}).get("groupId")
    left = event.get("left", {}).get("members", [])
    if group_id and left:
        logger.info(f"👥 {len(left)} members left group {group_id[:10]}...")
        try:
            if database_functions and 'save_event' in database_functions:
                await database_functions['save_event'](group_id, "memberLeft", event)
        except Exception as e:
            logger.error(f"❌ Error saving member left event: {e}")

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
        
        
        
@app.get("/admin/api/user-list")
async def get_user_list():
    """ดึงรายชื่อ users ทั้งหมด"""
    try:
        users = {}
        if 'get_recent_chat_history' in database_functions:
            history = await database_functions['get_recent_chat_history'](1000)
            
            for chat in history:
                if hasattr(chat, 'user_id') and chat.user_id:
                    user_id = chat.user_id
                    if user_id not in users:
                        users[user_id] = {
                            "user_id": user_id,
                            "display_name": f"User {user_id[:8]}",
                            "message_count": 0,
                            "last_message": None
                        }
                    users[user_id]["message_count"] += 1
                    if hasattr(chat, 'created_at') and chat.created_at:
                        if not users[user_id]["last_message"] or chat.created_at > users[user_id]["last_message"]:
                            users[user_id]["last_message"] = chat.created_at.isoformat()
        
        return JSONResponse({
            "status": "success",
            "users": list(users.values())
        })
    except Exception as e:
        logger.error(f"❌ Error getting user list: {e}")
        return JSONResponse({
            "status": "error",
            "message": str(e),
            "users": []
        })
        
        
@app.get("/admin/api/chat-messages")
async def get_chat_messages_api(limit: int = 100):
    """API endpoint สำหรับดึงข้อความแชททั้งหมด"""
    try:
        messages = []
        
        if database_functions and 'get_recent_chat_history' in database_functions:
            history = await database_functions['get_recent_chat_history'](limit)
            
            for chat in history:
                message_dict = {
                    "id": str(getattr(chat, 'id', '')) if hasattr(chat, 'id') else None,
                    "user_id": getattr(chat, 'user_id', None),
                    "direction": getattr(chat, 'direction', None),
                    "message_type": getattr(chat, 'message_type', None),
                    "message_text": getattr(chat, 'message_text', None),
                    "sender": getattr(chat, 'sender', None),
                    "created_at": None
                }
                
                # Handle datetime
                if hasattr(chat, 'created_at') and chat.created_at:
                    try:
                        message_dict["created_at"] = chat.created_at.isoformat()
                    except:
                        message_dict["created_at"] = str(chat.created_at)
                
                messages.append(message_dict)
        
        return JSONResponse({
            "status": "success",
            "messages": messages,
            "total": len(messages)
        })
        
    except Exception as e:
        logger.error(f"❌ Error getting chat messages: {e}")
        logger.exception(e)
        return JSONResponse({
            "status": "error",
            "message": str(e),
            "messages": []
        })

@app.post("/line/webhook")
async def line_webhook(request: Request, background_tasks: BackgroundTasks, x_line_signature: str = Header(None)) -> JSONResponse:
    """LINE webhook endpoint (Production version)"""
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


@app.post("/admin/kbank/setup-instant")
async def setup_kbank_instant():
    """ตั้งค่า KBank ให้ใช้งานได้ทันที"""
    try:
        from services.kbank_checker import setup_kbank_sandbox_instantly
        result = setup_kbank_sandbox_instantly()
        
        await notification_manager.send_notification(
            f"🏦 {result.get('message', 'ตั้งค่า KBank เสร็จสิ้น')}", 
            result.get('status', 'info')
        )
        
        return JSONResponse(result)
        
    except Exception as e:
        logger.error(f"❌ Setup KBank instant error: {e}")
        return JSONResponse({
            "status": "error",
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        })

@app.get("/", response_class=RedirectResponse)
async def root():
    """Root redirect"""
    return RedirectResponse(url="/admin")

# เพิ่มใน main_updated.py หลัง line 755

@app.get("/admin/settings", response_class=HTMLResponse)
async def admin_settings(request: Request):
    """Settings page"""
    try:
        config_data = {
            "line_channel_secret": config_manager.get("line_channel_secret", ""),
            "line_channel_access_token": config_manager.get("line_channel_access_token", ""),
            "thunder_api_token": config_manager.get("thunder_api_token", ""),
            "kbank_consumer_id": config_manager.get("kbank_consumer_id", ""),
            "kbank_consumer_secret": config_manager.get("kbank_consumer_secret", ""),
            "openai_api_key": config_manager.get("openai_api_key", ""),
            "ai_prompt": config_manager.get("ai_prompt", ""),
            "ai_enabled": config_manager.get("ai_enabled", False),
            "slip_enabled": config_manager.get("slip_enabled", False),
            "thunder_enabled": config_manager.get("thunder_enabled", True),
            "kbank_enabled": config_manager.get("kbank_enabled", False),
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
    """อัปเดตการตั้งค่าระบบ"""
    try:
        data = await request.json()
        
        # ใช้ sync version ของ config_manager
        if config_manager:
            success = config_manager.update_multiple(data)
        else:
            success = False
        
        # รีสตาร์ทบริการที่จำเป็น
        if data.get("kbank_enabled"):
            try:
                from services.kbank_checker import kbank_checker
                kbank_checker.is_sandbox = data.get("kbank_sandbox_mode", True)
                kbank_checker.clear_token_cache()
            except:
                pass
        
        await notification_manager.send_notification("⚙️ อัปเดตการตั้งค่าแล้ว", "success")
        
        return JSONResponse({
            "status": "success" if success else "error",
            "message": "บันทึกการตั้งค่าสำเร็จ" if success else "บันทึกการตั้งค่าล้มเหลว"
        })
        
    except Exception as e:
        logger.error(f"❌ Update settings error: {e}")
        return JSONResponse({
            "status": "error",
            "message": f"เกิดข้อผิดพลาดในการบันทึก: {str(e)}"
        })

@app.get("/admin/chat-history")
async def admin_chat_history_page(request: Request):
    """Chat history page"""
    return templates.TemplateResponse(
        "chat_history.html",
        {"request": request}
    )

@app.post("/admin/toggle-slip-system")
async def toggle_slip_system():
    """Toggle slip system on/off"""
    try:
        current_status = config_manager.get("slip_enabled", False)
        new_status = not current_status
        
        success = config_manager.update("slip_enabled", new_status)
        
        if success:
            status_text = "เปิด" if new_status else "ปิด"
            await notification_manager.send_notification(
                f"🔄 {status_text}ระบบตรวจสอบสลิปแล้ว", 
                "info"
            )
            return JSONResponse({
                "status": "success",
                "message": f"{status_text}ระบบตรวจสอบสลิปแล้ว",
                "slip_enabled": new_status
            })
        else:
            return JSONResponse({
                "status": "error",
                "message": "ไม่สามารถเปลี่ยนสถานะได้"
            })
            
    except Exception as e:
        logger.error(f"❌ Toggle slip system error: {e}")
        return JSONResponse({
            "status": "error",
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        })

@app.post("/admin/reset-failures")
async def reset_api_failures():
    """Reset API failure counters"""
    try:
        from services.enhanced_slip_checker import reset_api_failure_cache
        reset_api_failure_cache()
        
        await notification_manager.send_notification("🔄 รีเซ็ต API failure cache แล้ว", "info")
        return JSONResponse({
            "status": "success",
            "message": "รีเซ็ต API failure counters แล้ว"
        })
    except Exception as e:
        logger.error(f"❌ Reset failures error: {e}")
        return JSONResponse({
            "status": "error",
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        })

@app.get("/admin/system-logs")
async def get_system_logs():
    """Get system logs"""
    try:
        logs = []
        log_file = "app.log"
        
        if os.path.exists(log_file):
            with open(log_file, 'r', encoding='utf-8') as f:
                lines = f.readlines()
                # Get last 100 lines
                logs = lines[-100:] if len(lines) > 100 else lines
        
        return JSONResponse({
            "status": "success",
            "logs": logs
        })
    except Exception as e:
        logger.error(f"❌ Get system logs error: {e}")
        return JSONResponse({
            "status": "error",
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        })

@app.post("/admin/test-line-connection")
async def test_line_connection():
    """Test LINE API connection"""
    try:
        access_token = config_manager.get("line_channel_access_token")
        if not access_token:
            return JSONResponse({
                "status": "error",
                "message": "LINE Access Token ไม่ได้ตั้งค่า"
            })
        
        import requests
        url = "https://api.line.me/v2/bot/info"
        headers = {"Authorization": f"Bearer {access_token}"}
        
        response = requests.get(url, headers=headers, timeout=10)
        
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


@app.post("/admin/kbank/force-sandbox")
async def force_kbank_sandbox():
    """บังคับใช้ KBank Sandbox mode"""
    try:
        from services.kbank_checker import kbank_checker
        
        # บังคับใช้ sandbox
        kbank_checker.is_sandbox = True
        kbank_checker.base_url = "https://openapi-sandbox.kasikornbank.com"
        kbank_checker.oauth_url = f"{kbank_checker.base_url}/v2/oauth/token"
        kbank_checker.verify_url = f"{kbank_checker.base_url}/v1/verslip/kbank/verify"
        kbank_checker.clear_token_cache()
        
        # อัปเดต config
        config_manager.update_multiple({
            "kbank_sandbox_mode": True,
            "kbank_enabled": True,
            "kbank_consumer_id": "suDxvMLTLYsQwL1R0L9UL1m8Ceoibmcr",
            "kbank_consumer_secret": "goOfPtGLoGxYP3DG"
        })
        
        # ทดสอบการเชื่อมต่อ
        test_result = kbank_checker.test_connection()
        
        await notification_manager.send_notification("🧪 เปลี่ยนเป็น KBank Sandbox mode แล้ว", "success")
        
        return JSONResponse({
            "status": "success",
            "message": "เปลี่ยนเป็น KBank Sandbox mode สำเร็จ",
            "connection_test": test_result
        })
        
    except Exception as e:
        logger.error(f"❌ Force sandbox error: {e}")
        return JSONResponse({
            "status": "error", 
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        })

@app.post("/admin/kbank/test-slip-demo")
async def test_kbank_slip_demo():
    """ทดสอบ KBank Slip Verification ด้วยข้อมูลตัวอย่าง"""
    try:
        from services.kbank_checker import kbank_checker
        
        # ใช้ข้อมูลตัวอย่างสำหรับทดสอบ
        result = kbank_checker.verify_slip("004", f"TEST{int(time.time())}")
        
        return JSONResponse({
            "status": "success",
            "message": "ทดสอบ KBank Slip Verification สำเร็จ",
            "result": result
        })
        
    except Exception as e:
        logger.error(f"❌ Test slip demo error: {e}")
        return JSONResponse({
            "status": "error",
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        })

@app.get("/admin/export-data")
async def export_admin_data():
    """Export system data"""
    try:
        # Get chat history with await
        chat_history = []
        if database_functions and 'get_recent_chat_history' in database_functions:
            chat_history = await database_functions['get_recent_chat_history'](1000)
        
        # Get configuration (without sensitive data)
        config_export = {
            "ai_enabled": config_manager.get("ai_enabled", False) if config_manager else False,
            "slip_enabled": config_manager.get("slip_enabled", False) if config_manager else False,
            "thunder_enabled": config_manager.get("thunder_enabled", True) if config_manager else True,
            "kbank_enabled": config_manager.get("kbank_enabled", False) if config_manager else False,
            "ai_prompt": config_manager.get("ai_prompt", "") if config_manager else "",
        }
        
        # Prepare export data
        export_data = {
            "export_timestamp": datetime.now().isoformat(),
            "system_config": config_export,
            "chat_history": [
                {
                    "id": str(chat.id) if hasattr(chat, 'id') else None,
                    "user_id": chat.user_id[:8] + "..." if hasattr(chat, 'user_id') and len(chat.user_id) > 8 else chat.user_id if hasattr(chat, 'user_id') else None,
                    "direction": chat.direction if hasattr(chat, 'direction') else None,
                    "message_type": chat.message_type if hasattr(chat, 'message_type') else None,
                    "message_text": chat.message_text[:100] + "..." if hasattr(chat, 'message_text') and chat.message_text and len(chat.message_text) > 100 else chat.message_text if hasattr(chat, 'message_text') else None,
                    "sender": chat.sender if hasattr(chat, 'sender') else None,
                    "created_at": chat.created_at.isoformat() if hasattr(chat, 'created_at') and chat.created_at else None
                }
                for chat in chat_history
            ],
            "statistics": {
                "total_messages": len(chat_history),
                "unique_users": len(set(chat.user_id for chat in chat_history if hasattr(chat, 'user_id'))),
                "message_types": {}
            }
        }
        
        # Calculate message type statistics
        from collections import Counter
        message_types = Counter(chat.sender for chat in chat_history if hasattr(chat, 'sender'))
        export_data["statistics"]["message_types"] = dict(message_types)
        
        return JSONResponse({
            "status": "success",
            "data": export_data
        })
        
    except Exception as e:
        logger.error(f"❌ Export data error: {e}")
        return JSONResponse({
            "status": "error",
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        })

@app.get("/admin")
async def admin_home(request: Request):
    """Admin home page"""
    try:
        # Fix: ใช้ await กับ async functions
        total_count = 0
        if database_functions and 'get_chat_history_count' in database_functions:
            total_count = await database_functions['get_chat_history_count']()
        
        api_statuses = get_api_status_summary()
        system_enabled = config_manager.get("slip_enabled", False) if config_manager else False
        any_api_available = any(
            api.get("enabled", False) and api.get("configured", False) 
            for api in api_statuses.values()
        )

        return templates.TemplateResponse(
            "admin_home.html",
            {
                "request": request,
                "config": config_manager.config if config_manager else {},
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
                "config": {},
                "total_chat_history": 0,
                "system_status": {"system_enabled": False, "any_api_available": False},
                "api_statuses": {}
            },
        )

@app.get("/admin/debug", response_class=HTMLResponse)
async def admin_debug(request: Request):
    """Debug page"""
    return templates.TemplateResponse("debug.html", {"request": request})

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return JSONResponse({
        "status": "ok" if IS_READY and not SHUTDOWN_INITIATED else "degraded",
        "system_ready": IS_READY,
        "shutting_down": SHUTDOWN_INITIATED,
        "timestamp": datetime.now().isoformat(),
        "active_connections": len(notification_manager.active_connections)
    })



@app.get("/admin/api-status")
async def get_api_status():
    """ดึงสถานะ API ทั้งหมด"""
    try:
        # ตรวจสอบว่า config_manager พร้อมใช้งาน
        if not config_manager:
            return JSONResponse({
                "system_status": {"system_enabled": False},
                "line": {"configured": False, "connected": False},
                "thunder": {"configured": False, "enabled": False, "connected": False},
                "kbank": {"configured": False, "enabled": False, "connected": False}
            })
            
        status = {
            "system_status": {
                "system_enabled": config_manager.get("slip_enabled", False) if config_manager else False,
                "timestamp": datetime.now().isoformat()
            },
            "line": {
                "configured": bool(config_manager.get("line_channel_secret") and config_manager.get("line_channel_access_token")) if config_manager else False,
                "connected": False,
                "bot_name": "LINE Bot"
            },
            "thunder": {
                "configured": bool(config_manager.get("thunder_api_token")) if config_manager else False,
                "enabled": config_manager.get("thunder_enabled", True) if config_manager else False,
                "connected": bool(config_manager.get("thunder_api_token")) if config_manager else False,
                "recent_failures": 0
            },
            "kbank": {
                "configured": bool(config_manager.get("kbank_consumer_id") and config_manager.get("kbank_consumer_secret")) if config_manager else False,
                "enabled": config_manager.get("kbank_enabled", False) if config_manager else False,
                "connected": False,
                "recent_failures": 0,
                "environment": "Sandbox"
            }
        }
        
        return JSONResponse(status)
        
    except Exception as e:
        logger.error(f"❌ Get API status error: {e}")
        return JSONResponse({
            "system_status": {"system_enabled": False},
            "line": {"configured": False, "connected": False},
            "thunder": {"configured": False, "enabled": False, "connected": False},
            "kbank": {"configured": False, "enabled": False, "connected": False}
        })


@app.get("/admin/mongodb-status")
async def get_mongodb_status():
    """Get MongoDB connection status"""
    try:
        # ใช้ database_functions ที่ถูก import ไว้แล้ว
        if 'get_database_status' in database_functions:
            status = await database_functions['get_database_status']()
        else:
            status = {
                "status": "error",
                "message": "Database function not available"
            }

        return JSONResponse({
            "status": "success",
            "mongodb": status
        })
    except Exception as e:
        logger.error(f"❌ Get MongoDB status error: {e}")
        return JSONResponse({
            "status": "error",
            "message": str(e),
            "mongodb": {
                "status": "disconnected",
                "message": "Cannot check MongoDB status"
            }
        })

@app.post("/admin/test-mongodb")
async def test_mongodb_connection():
    """Test MongoDB connection"""
    try:
        if 'test_connection' in database_functions:
            result = await database_functions['test_connection']()
        else:
            result = {"status": "error", "message": "Database function not available"}
        
        await notification_manager.send_notification(
            result["message"],
            "success" if result["status"] == "connected" else "error"
        )
        
        return JSONResponse(result)
        
    except Exception as e:
        logger.error(f"❌ Test MongoDB error: {e}")
        return JSONResponse({
            "status": "error",
            "message": f"Test failed: {str(e)}"
        })

@app.get("/health")
async def health_check():
    """Health check endpoint with database status"""
    db_connected = False
    db_info = {}
    try:
        if 'test_connection' in database_functions:
            db_status = await database_functions['test_connection']()
            db_connected = db_status["status"] == "connected"
            db_info = db_status
    except Exception as e:
        logger.error(f"❌ Health check DB test error: {e}")

    return JSONResponse({
        "status": "ok" if IS_READY and db_connected and not SHUTDOWN_INITIATED else "degraded",
        "system_ready": IS_READY,
        "database_connected": db_connected,
        "database_info": db_info,
        "shutting_down": SHUTDOWN_INITIATED,
        "timestamp": datetime.now().isoformat(),
        "active_connections": len(notification_manager.active_connections)
    })

@app.get("/admin/config")
async def get_config():
    """Get configuration"""
    try:
        if not config_manager:
            return JSONResponse({})
            
        return JSONResponse({
            "slip_enabled": config_manager.get("slip_enabled", False),
            "ai_enabled": config_manager.get("ai_enabled", False),
            "thunder_enabled": config_manager.get("thunder_enabled", True),
            "kbank_enabled": config_manager.get("kbank_enabled", False),
            "line_channel_access_token": config_manager.get("line_channel_access_token", ""),
            "line_channel_secret": config_manager.get("line_channel_secret", ""),
            "thunder_api_token": config_manager.get("thunder_api_token", ""),
            "kbank_consumer_id": config_manager.get("kbank_consumer_id", ""),
            "kbank_consumer_secret": config_manager.get("kbank_consumer_secret", ""),
            "openai_api_key": config_manager.get("openai_api_key", ""),
            "openai_model": config_manager.get("openai_model", "gpt-3.5-turbo")
        })
    except Exception as e:
        logger.error(f"❌ Get config error: {e}")
        return JSONResponse({"status": "error", "message": str(e)})

@app.post("/admin/config")
async def update_config(request: Request):
    """Update configuration"""
    try:
        data = await request.json()
        updates = {}
        
        # Boolean fields
        for key in ["slip_enabled", "ai_enabled", "thunder_enabled", "kbank_enabled"]:
            if key in data:
                value = data[key]
                updates[key] = bool(value) if isinstance(value, bool) else str(value).lower() in ["true", "1", "yes", "on"]
        
        # String fields
        for key in ["line_channel_access_token", "line_channel_secret", "thunder_api_token", 
                   "kbank_consumer_id", "kbank_consumer_secret", "openai_api_key", "openai_model"]:
            if key in data:
                updates[key] = str(data[key]).strip()
        
        # Use sync version
        if config_manager:
            success = config_manager.update_multiple(updates)
        else:
            success = False
        
        if success:
            if any(key in updates for key in ["line_channel_access_token", "line_channel_secret"]):
                init_line_bot()
            
            await notification_manager.send_notification("⚙️ อัปเดตการตั้งค่าแล้ว", "success")
            return JSONResponse({"status": "success", "message": "บันทึกการตั้งค่าแล้ว"})
        else:
            return JSONResponse({"status": "error", "message": "ไม่สามารถบันทึกได้"})
            
    except Exception as e:
        logger.error(f"❌ Update config error: {e}")
        return JSONResponse({"status": "error", "message": str(e)})

# Additional endpoints for testing
@app.get("/admin/debug-config")
async def get_debug_config():
    """Debug config endpoint"""
    try:
        return JSONResponse({
            "api_status": get_api_status_summary(),
            "config_values": {
                "thunder_token": config_manager.get("thunder_api_token", "")[:20] + "..." if config_manager.get("thunder_api_token") else "",
                "kbank_consumer_id": config_manager.get("kbank_consumer_id", "")[:20] + "..." if config_manager.get("kbank_consumer_id") else "",
                "kbank_consumer_secret": config_manager.get("kbank_consumer_secret", "")[:20] + "..." if config_manager.get("kbank_consumer_secret") else "",
                "line_token": config_manager.get("line_channel_access_token", "")[:20] + "..." if config_manager.get("line_channel_access_token") else "",
            }
        })
    except Exception as e:
        logger.error(f"❌ Debug config error: {e}")
        return JSONResponse({"status": "error", "message": str(e)})

@app.get("/admin/get-config-value")
async def get_config_value(request: Request):
    """Get specific config value"""
    try:
        key = request.query_params.get("key")
        if not key:
            return JSONResponse({"status": "error", "message": "Key required"})
        
        value = config_manager.get(key, "")
        return JSONResponse({"status": "success", "key": key, "value": value})
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)})
        
        
        # เพิ่มหลังบรรทัด 1500
@app.get("/admin/users/{user_id}/chat")
async def get_user_chat_history_api(user_id: str, request: Request):
    """แสดงประวัติแชทของ user แต่ละคน"""
    try:
        # ดึงประวัติแชทของ user
        chat_history = []
        if database_functions and 'get_user_chat_history' in database_functions:
            # ดึงข้อความทั้งหมดของ user นี้
            chat_history = await database_functions['get_user_chat_history'](user_id, limit=100)
        
        # ดึงข้อมูล user
        user_info = {}
        if database_functions and 'get_user_info' in database_functions:
            user_info = await database_functions['get_user_info'](user_id)
        
        return templates.TemplateResponse(
            "user_chat.html",
            {
                "request": request,
                "user_id": user_id,
                "user_info": user_info,
                "chat_history": chat_history
            }
        )
    except Exception as e:
        logger.error(f"❌ Error getting user chat: {e}")
        return templates.TemplateResponse(
            "user_chat.html",
            {
                "request": request,
                "user_id": user_id,
                "user_info": {},
                "chat_history": []
            }
        )

@app.get("/admin/api/chat-history/{user_id}")
async def get_user_chat_api(user_id: str, limit: int = 100):
    """API สำหรับดึงประวัติแชทของ user"""
    try:
        if database_functions and 'get_recent_chat_history' in database_functions:
            # ดึงเฉพาะของ user นี้
            all_chats = await database_functions['get_recent_chat_history'](1000)
            user_chats = [chat for chat in all_chats if hasattr(chat, 'user_id') and chat.user_id == user_id]
            
            # จัดเรียงตามเวลา
            user_chats.sort(key=lambda x: x.created_at if hasattr(x, 'created_at') else datetime.min)
            
            # แปลงเป็น JSON serializable
            chat_data = []
            for chat in user_chats[:limit]:
                chat_data.append({
                    "user_id": chat.user_id if hasattr(chat, 'user_id') else None,
                    "direction": chat.direction if hasattr(chat, 'direction') else None,
                    "message_type": chat.message_type if hasattr(chat, 'message_type') else None,
                    "message_text": chat.message_text if hasattr(chat, 'message_text') else None,
                    "sender": chat.sender if hasattr(chat, 'sender') else None,
                    "created_at": chat.created_at.isoformat() if hasattr(chat, 'created_at') and chat.created_at else None
                })
            
            return JSONResponse({
                "status": "success",
                "user_id": user_id,
                "chat_history": chat_data,
                "total": len(chat_data)
            })
        else:
            return JSONResponse({
                "status": "error",
                "message": "Database not available"
            })
    except Exception as e:
        logger.error(f"❌ Error in chat API: {e}")
        return JSONResponse({
            "status": "error",
            "message": str(e)
        })

@app.post("/admin/test-kbank-sandbox")
async def test_kbank_sandbox(request: Request):
    """ทดสอบ KBank Sandbox API โดยเฉพาะ"""
    try:
        data = await request.json()
        consumer_id = data.get("consumer_id", "suDxvMLTLYsQwL1R0L9UL1m8Ceoibmcr")
        consumer_secret = data.get("consumer_secret", "goOfPtGLoGxYP3DG") 
        bank_id = data.get("bank_id", "004")
        trans_ref = data.get("trans_ref", "TEST123456789")
        
        logger.info(f"🧪 Testing KBank Sandbox API...")
        
        # Set temporary credentials
        original_id = config_manager.get("kbank_consumer_id")
        original_secret = config_manager.get("kbank_consumer_secret")
        original_enabled = config_manager.get("kbank_enabled")
        
        config_manager.config["kbank_consumer_id"] = consumer_id
        config_manager.config["kbank_consumer_secret"] = consumer_secret
        config_manager.config["kbank_enabled"] = True
        
        try:
            from services.kbank_checker import kbank_checker
            result = kbank_checker.verify_slip(bank_id, trans_ref)
            
            await notification_manager.send_notification("🧪 ทดสอบ KBank Sandbox API เสร็จสิ้น", "info")
            
            return JSONResponse({
                "status": "success" if result.get("status") == "success" else "error",
                "message": "KBank Sandbox API test completed", 
                "data": result,
                "sandbox_note": "This is using KBank Sandbox environment for testing"
            })
        finally:
            # Restore original values
            config_manager.config["kbank_consumer_id"] = original_id
            config_manager.config["kbank_consumer_secret"] = original_secret
            config_manager.config["kbank_enabled"] = original_enabled
        
    except Exception as e:
        logger.exception(f"❌ KBank Sandbox API test error: {e}")
        return JSONResponse({"status": "error", "message": str(e)})
        
@app.post("/admin/test-thunder-api")
async def test_thunder_api_direct(request: Request):
    """ทดสอบ Thunder API โดยตรง"""
    try:
        form = await request.form()
        token = form.get("token")
        file = form.get("file")
        
        if not token or not file:
            return JSONResponse({"status": "error", "message": "Missing token or file"})
        
        image_data = await file.read()
        
        logger.info(f"🧪 Testing Thunder API with token: {token[:10]}...")
        logger.info(f"🧪 Image size: {len(image_data)} bytes")
        
        original_token = config_manager.get("thunder_api_token")
        config_manager.config["thunder_api_token"] = token
        
        try:
            from services.slip_checker import verify_slip_with_thunder
            result = verify_slip_with_thunder(None, image_data)
            
            await notification_manager.send_notification("🧪 ทดสอบ Thunder API เสร็จสิ้น", "info")
            
            if result and result.get("status") == "success":
                return JSONResponse({
                    "status": "success", 
                    "message": "Thunder API test successful",
                    "data": result
                })
            else:
                return JSONResponse({
                    "status": "error",
                    "message": result.get("message", "Thunder API test failed"),
                    "data": result
                })
        finally:
            config_manager.config["thunder_api_token"] = original_token
    except Exception as e:
        logger.exception(f"❌ Thunder API test error: {e}")
        return JSONResponse({"status": "error", "message": str(e)})

@app.post("/admin/test-kbank-oauth")
async def test_kbank_oauth(request: Request):
    """ทดสอบ KBank OAuth"""
    try:
        from services.kbank_checker import kbank_checker
        
        data = await request.json()
        consumer_id = data.get("consumer_id", "").strip()
        consumer_secret = data.get("consumer_secret", "").strip()
        
        if not consumer_id or not consumer_secret:
            return JSONResponse({
                "status": "error",
                "message": "กรุณาใส่ Consumer ID และ Consumer Secret"
            })
        
        # ตั้งค่า credentials ชั่วคราว
        original_get_credentials = kbank_checker.get_credentials
        kbank_checker.get_credentials = lambda: (consumer_id, consumer_secret)
        
        try:
            # ทดสอบ OAuth
            access_token = kbank_checker._get_access_token()
            
            if access_token:
                return JSONResponse({
                    "status": "success",
                    "message": "KBank OAuth สำเร็จ",
                    "data": {
                        "token_preview": access_token[:30] + "..." if len(access_token) > 30 else access_token,
                        "token_length": len(access_token),
                        "environment": "Sandbox" if kbank_checker.is_sandbox else "Production"
                    }
                })
            else:
                return JSONResponse({
                    "status": "error",
                    "message": "ไม่สามารถขอ OAuth token ได้"
                })
                
        finally:
            # คืนค่า method เดิม
            kbank_checker.get_credentials = original_get_credentials
            
    except Exception as e:
        logger.error(f"❌ Test KBank OAuth error: {e}")
        return JSONResponse({
            "status": "error",
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        })

@app.post("/admin/test-kbank-api") 
async def test_kbank_api_direct(request: Request):
    """ทดสอบ KBank API โดยตรง"""
    try:
        data = await request.json()
        consumer_id = data.get("consumer_id")
        consumer_secret = data.get("consumer_secret")
        bank_id = data.get("bank_id")
        trans_ref = data.get("trans_ref")
        
        if not all([consumer_id, consumer_secret, bank_id, trans_ref]):
            return JSONResponse({"status": "error", "message": "Missing required fields"})
        
        logger.info(f"🧪 Testing KBank API...")
        
        original_id = config_manager.get("kbank_consumer_id")
        original_secret = config_manager.get("kbank_consumer_secret")
        original_enabled = config_manager.get("kbank_enabled")
        
        config_manager.config["kbank_consumer_id"] = consumer_id
        config_manager.config["kbank_consumer_secret"] = consumer_secret
        config_manager.config["kbank_enabled"] = True
        
        try:
            from services.kbank_checker import kbank_checker
            result = kbank_checker.verify_slip(bank_id, trans_ref)
            
            await notification_manager.send_notification("🧪 ทดสอบ KBank API เสร็จสิ้น", "info")
            
            if result and result.get("status") == "success":
                return JSONResponse({
                    "status": "success", 
                    "message": "KBank API test successful", 
                    "data": result
                })
            else:
                return JSONResponse({
                    "status": "error",
                    "message": result.get("message", "KBank API test failed"),
                    "data": result
                })
        finally:
            config_manager.config["kbank_consumer_id"] = original_id
            config_manager.config["kbank_consumer_secret"] = original_secret
            config_manager.config["kbank_enabled"] = original_enabled
            
    except Exception as e:
        logger.exception(f"❌ KBank API test error: {e}")
        return JSONResponse({"status": "error", "message": str(e)})


@app.get("/admin/db-status")
async def get_db_status():
    """Get database connection status"""
    try:
        if database_functions and 'test_connection' in database_functions:
            test_result = await database_functions['test_connection']()
        else:
            test_result = {
                "status": "error",
                "message": "Database not initialized"
            }
        
        if database_functions and 'get_connection_info' in database_functions:
            connection_info = database_functions['get_connection_info']()
        else:
            connection_info = {"connected": False, "type": "Unknown"}
        
        return JSONResponse({
            "timestamp": datetime.now().isoformat(),
            "connection": connection_info,
            "test": test_result,
            "environment": {
                "USE_MONGODB": "true",
                "MONGODB_URI_EXISTS": bool(os.getenv('MONGODB_URI'))
            }
        })
    except Exception as e:
        logger.error(f"❌ Get DB status error: {e}")
        return JSONResponse({
            "status": "error",
            "message": str(e),
            "connection": {
                "connected": False,
                "error": str(e)
            }
        })

@app.post("/admin/kbank/update-credentials")
async def update_kbank_credentials_endpoint(request: Request):
    """อัปเดต KBank credentials"""
    try:
        data = await request.json()
        
        consumer_id = data.get("consumer_id", "").strip()
        consumer_secret = data.get("consumer_secret", "").strip()
        is_sandbox = data.get("is_sandbox", True)
        enabled = data.get("enabled", True)
        
        if not consumer_id or not consumer_secret:
            return JSONResponse({
                "status": "error",
                "message": "กรุณาใส่ Consumer ID และ Secret"
            })
        
        from services.kbank_checker import update_kbank_credentials
        result = update_kbank_credentials(consumer_id, consumer_secret, is_sandbox, enabled)
        
        await notification_manager.send_notification(
            f"🏦 {'อัปเดต' if result['status'] == 'success' else 'ไม่สามารถอัปเดต'} KBank credentials", 
            result['status']
        )
        
        return JSONResponse(result)
        
    except Exception as e:
        logger.error(f"❌ Update KBank credentials error: {e}")
        return JSONResponse({
            "status": "error",
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        })

@app.post("/admin/kbank/test-credentials")
async def test_kbank_credentials_endpoint(request: Request):
    """ทดสอบ KBank credentials แบบไม่บันทึก"""
    try:
        data = await request.json()
        
        consumer_id = data.get("consumer_id", "").strip()
        consumer_secret = data.get("consumer_secret", "").strip()
        is_sandbox = data.get("is_sandbox", True)
        
        if not consumer_id or not consumer_secret:
            return JSONResponse({
                "status": "error",
                "message": "กรุณาใส่ Consumer ID และ Secret"
            })
        
        from services.kbank_checker import test_kbank_with_credentials
        result = test_kbank_with_credentials(consumer_id, consumer_secret, is_sandbox)
        
        return JSONResponse(result)
        
    except Exception as e:
        logger.error(f"❌ Test KBank credentials error: {e}")
        return JSONResponse({
            "status": "error",
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        })
        
@app.get("/admin/system-info")
async def get_system_info():
    """Get system information"""
    try:
        return JSONResponse({
            "status": "success",
            "system_info": {
                "ready": IS_READY,
                "database_type": "MongoDB",
                "config_type": "JSON File",
                "features": {
                    "thunder_api": bool(config_manager.get("thunder_api_token")),
                    "kbank_api": bool(config_manager.get("kbank_consumer_id")),
                    "ai_chat": bool(config_manager.get("openai_api_key"))
                }
            }
        })
    except Exception as e:
        logger.error(f"❌ Get system info error: {e}")
        return JSONResponse({
            "status": "error",
            "message": str(e)
        })
        
        
@app.post("/admin/test-connection")
async def test_database_connection():
    """Test database connection"""
    try:
        if database_functions and 'test_connection' in database_functions:
            result = await database_functions['test_connection']()
        else:
            result = {"status": "error", "message": "Database not initialized"}
        
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"❌ Test connection error: {e}")
        return JSONResponse({
            "status": "error",
            "message": str(e)
        })
        
@app.get("/admin/get-recent-chat-history")
async def get_recent_chat_history_endpoint(limit: int = 5):
    """Get recent chat history"""
    try:
        history = []
        if database_functions and 'get_recent_chat_history' in database_functions:
            history = await database_functions['get_recent_chat_history'](limit)
        
        # Convert to serializable format
        history_data = []
        for chat in history:
            history_data.append({
                "user_id": chat.user_id if hasattr(chat, 'user_id') else None,
                "direction": chat.direction if hasattr(chat, 'direction') else None,
                "message_text": chat.message_text if hasattr(chat, 'message_text') else None,
                "created_at": chat.created_at.isoformat() if hasattr(chat, 'created_at') and chat.created_at else None,
                "sender": chat.sender if hasattr(chat, 'sender') else None
            })
        
        return JSONResponse({
            "status": "success",
            "history": history_data
        })
    except Exception as e:
        logger.error(f"❌ Get recent chat history error: {e}")
        return JSONResponse({
            "status": "error",
            "message": str(e),
            "history": []
        })


@app.get("/admin/stats")
async def get_admin_stats():
    """Get admin statistics"""
    try:
        total_messages = 0
        if database_functions and 'get_chat_history_count' in database_functions:
            total_messages = await database_functions['get_chat_history_count']()
        
        return JSONResponse({
            "status": "success",
            "stats": {
                "total_messages": total_messages,
                "websocket_connections": len(notification_manager.active_connections)
            }
        })
    except Exception as e:
        logger.error(f"❌ Get stats error: {e}")
        return JSONResponse({
            "status": "error",
            "message": str(e),
            "stats": {
                "total_messages": 0,
                "websocket_connections": 0
            }
        })

@app.get("/admin/database-info")
async def get_database_info():
    """Get database information"""
    try:
        db_status = await test_database_connection()
        db_status_json = json.loads(db_status.body)
        
        db_info = {
            "type": db_status_json.get('type', 'MongoDB'),
            "connected": db_status_json.get('status') == 'connected',
            "tables": db_status_json.get('record_counts', {})
        }
        
        return JSONResponse({
            "status": "success",
            "database": db_info
        })
    except Exception as e:
        logger.error(f"❌ Get database info error: {e}")
        return JSONResponse({
            "status": "error",
            "message": str(e),
            "database": {
                "type": "Unknown",
                "connected": False
            }
        })

@app.post("/admin/send-test-notification")
async def send_test_notification():
    """Send test notification"""
    try:
        await notification_manager.send_notification(
            "🔔 This is a test notification from the admin panel", 
            "info"
        )
        return JSONResponse({
            "status": "success",
            "message": "Test notification sent"
        })
    except Exception as e:
        logger.error(f"❌ Send test notification error: {e}")
        return JSONResponse({
            "status": "error",
            "message": str(e)
        })

@app.post("/admin/restart-services")
async def restart_services():
    """Restart services (placeholder)"""
    try:
        # In production, this would trigger actual service restart
        await notification_manager.send_notification(
            "🔄 Services restart requested (simulated)", 
            "warning"
        )
        return JSONResponse({
            "status": "success",
            "message": "Services restart initiated"
        })
    except Exception as e:
        logger.error(f"❌ Restart services error: {e}")
        return JSONResponse({
            "status": "error",
            "message": str(e)
        })

@app.post("/admin/test-thunder-connection")
async def test_thunder_connection():
    """Test Thunder API connection"""
    try:
        token = config_manager.get("thunder_api_token", "") if config_manager else ""
        if not token:
            return JSONResponse({
                "status": "error",
                "message": "Thunder API token not configured"
            })
        
        # Import the correct function
        if slip_functions and 'test_thunder_api_connection' in slip_functions:
            result = slip_functions['test_thunder_api_connection'](token)
        else:
            result = {"status": "error", "message": "Thunder API test function not available"}
            
        return JSONResponse(result)
        
    except Exception as e:
        logger.error(f"❌ Test Thunder connection error: {e}")
        return JSONResponse({
            "status": "error",
            "message": str(e)
        })

@app.get("/admin/config-management")
async def config_management_page(request: Request):
    """Config management page"""
    try:
        configs = {
            k: v for k, v in config_manager.config.items()
        }
        return templates.TemplateResponse(
            "config_management.html",
            {
                "request": request,
                "configs": configs,
                "config_count": len(configs)
            }
        )
    except Exception as e:
        logger.error(f"❌ Config management page error: {e}")
        return templates.TemplateResponse(
            "config_management.html",
            {
                "request": request,
                "configs": {},
                "config_count": 0
            }
        )

@app.post("/admin/config-management/update")
async def update_config_management(request: Request):
    """Update configuration from config management page"""
    try:
        data = await request.json()
        success = config_manager.update_multiple(data)
        
        if success:
            await notification_manager.send_notification(
                f"⚙️ Updated {len(data)} configurations", 
                "success"
            )
            return JSONResponse({
                "status": "success",
                "message": f"Updated {len(data)} configurations",
                "updated_count": len(data)
            })
        else:
            return JSONResponse({
                "status": "error",
                "message": "Failed to update configurations"
            })
            
    except Exception as e:
        logger.error(f"❌ Update config management error: {e}")
        return JSONResponse({
            "status": "error",
            "message": str(e)
        })

@app.get("/admin/users")
async def users_page(request: Request):
    """Users management page"""
    try:
        # Get unique users from chat history
        chat_history = []
        if database_functions and 'get_recent_chat_history' in database_functions:
            chat_history = await database_functions['get_recent_chat_history'](1000)
        
        users_dict = {}
        for chat in chat_history:
            user_id = chat.user_id if hasattr(chat, 'user_id') else None
            if user_id and user_id not in users_dict:
                users_dict[user_id] = {
                    "user_id": user_id,
                    "display_name": f"User {user_id[:8]}",
                    "chat_history": [],
                    "last_active": chat.created_at if hasattr(chat, 'created_at') else None,
                    "is_blocked": False
                }
            if user_id:
                users_dict[user_id]["chat_history"].append(chat)
                if hasattr(chat, 'created_at') and chat.created_at:
                    if not users_dict[user_id]["last_active"] or chat.created_at > users_dict[user_id]["last_active"]:
                        users_dict[user_id]["last_active"] = chat.created_at
        
        users = list(users_dict.values())
        
        # Calculate stats
        from datetime import datetime, timedelta
        now = datetime.now()
        active_24h = sum(1 for u in users if u["last_active"] and (now - u["last_active"]) < timedelta(hours=24))
        new_this_week = sum(1 for u in users if u["last_active"] and (now - u["last_active"]) < timedelta(days=7))
        
        stats = {
            "total_users": len(users),
            "active_24h": active_24h,
            "new_this_week": new_this_week
        }
        
        return templates.TemplateResponse(
            "users.html",
            {
                "request": request,
                "users": users,
                "stats": stats
            }
        )
    except Exception as e:
        logger.error(f"❌ Users page error: {e}")
        return templates.TemplateResponse(
            "users.html",
            {
                "request": request,
                "users": [],
                "stats": {"total_users": 0, "active_24h": 0, "new_this_week": 0}
            }
        )

@app.get("/admin/kbank/status")
async def get_kbank_status():
    """ดึงสถานะ KBank API"""
    try:
        from services.kbank_checker import kbank_checker
        status = kbank_checker.get_status()
        return JSONResponse({
            "status": "success",
            "data": status
        })
    except Exception as e:
        logger.error(f"❌ Get KBank status error: {e}")
        return JSONResponse({
            "status": "error",
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
            
            
            
        })
@app.post("/admin/users/send-message")
async def admin_send_message(request: Request):
    """
    ส่งข้อความจากหน้าแอดมินไปยังผู้ใช้หนึ่งคนหรือหลายคน
    body รองรับทั้ง {\"user_id\": \"U123\", \"message\": \"…\"} และ {\"user_ids\": [\"U123\", \"U456\"], …}
    """
    try:
        data = await request.json()
    except Exception:
        data = dict(await request.form())

    # อ่านข้อความ
    message = (data.get("message") or data.get("text") or "").strip()

    # ดึงรายชื่อผู้รับ
    recipients = []
    # กรณีส่งคนเดียว
    single_id = data.get("user_id") or data.get("userid")
    if single_id:
        recipients.append(single_id.strip())
    # กรณีส่งหลายคน
    user_ids = data.get("user_ids") or data.get("userIds")
    if user_ids:
        if isinstance(user_ids, list):
            recipients.extend([uid.strip() for uid in user_ids if uid])
        else:
            # รองรับการส่งเป็นสตริงคั่นด้วย comma
            recipients.extend([uid.strip() for uid in str(user_ids).split(",") if uid.strip()])

    if not recipients or not message:
        return JSONResponse({"status": "error", "message": "Missing recipients or message"}, status_code=400)

    success_count = 0
    for uid in recipients:
        if await send_message_safe(uid, reply_token="", message=message, message_type="admin"):
            success_count += 1

    if success_count == len(recipients):
        return JSONResponse({"status": "success", "sent": success_count, "message": "ส่งข้อความสำเร็จ"})
    elif success_count > 0:
        # ส่งสำเร็จบางส่วน
        return JSONResponse({"status": "partial", "sent": success_count, "total": len(recipients), "message": "ส่งข้อความบางส่วนสำเร็จ"}, status_code=207)
    else:
        return JSONResponse({"status": "error", "message": "ส่งข้อความไม่สำเร็จ"}, status_code=500)


# =============== Account Management Endpoints ===============

@app.get("/admin/accounts", response_class=HTMLResponse)
async def list_accounts_page(request: Request):
    """แสดงหน้ารายการบัญชี LINE OA"""
    try:
        if not line_account_manager:
            # ถ้า account manager ไม่พร้อม ให้แสดงหน้าว่างพร้อมข้อความ
            return templates.TemplateResponse("accounts_list.html", {
                "request": request,
                "accounts": []  # ส่ง empty list แทน
            })
        
        accounts = await line_account_manager.list_accounts()
        return templates.TemplateResponse("accounts_list.html", {
            "request": request,
            "accounts": accounts
        })
    except Exception as e:
        logger.error(f"Error in list_accounts_page: {e}")
        # ถ้ามี error ให้แสดงหน้า accounts แบบว่าง
        return templates.TemplateResponse("accounts_list.html", {
            "request": request,
            "accounts": []
        })

@app.post("/admin/accounts")
async def create_account_api(request: Request):
    """สร้างบัญชี LINE OA ใหม่"""
    if not line_account_manager:
        return JSONResponse({
            "status": "error",
            "message": "Account manager not initialized"
        })
    
    try:
        data = await request.json()
        account_id = await line_account_manager.create_account(data)
        
        await notification_manager.send_notification(
            f"✅ Created LINE account: {data.get('display_name')}", 
            "success"
        )
        
        # Generate webhook URL
        webhook_url = f"{request.url.scheme}://{request.url.netloc}/line/{account_id}/webhook"
        
        return JSONResponse({
            "status": "success",
            "account_id": account_id,
            "webhook_url": webhook_url
        })
    except Exception as e:
        logger.error(f"Error creating account: {e}")
        return JSONResponse({
            "status": "error",
            "message": str(e)
        })

@app.get("/admin/accounts/{account_id}", response_class=HTMLResponse)
async def edit_account_page(request: Request, account_id: str):
    """แสดงหน้าแก้ไขบัญชี"""
    if not line_account_manager:
        return templates.TemplateResponse("error.html", {
            "request": request,
            "message": "Account manager not initialized"
        })
    
    account = await line_account_manager.get_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    return templates.TemplateResponse("account_edit.html", {
        "request": request,
        "account": account
    })

@app.post("/admin/accounts/{account_id}/update")
async def update_account_api(account_id: str, request: Request):
    """อัปเดตข้อมูลบัญชี"""
    if not line_account_manager:
        return JSONResponse({
            "status": "error",
            "message": "Account manager not initialized"
        })
    
    try:
        updates = await request.json()
        success = await line_account_manager.update_account(account_id, updates)
        
        if success:
            await notification_manager.send_notification(
                f"✅ Updated LINE account configuration", 
                "success"
            )
            return JSONResponse({"status": "success"})
        else:
            return JSONResponse({"status": "error", "message": "Update failed"})
    except Exception as e:
        logger.error(f"Error updating account: {e}")
        return JSONResponse({"status": "error", "message": str(e)})

@app.delete("/admin/accounts/{account_id}")
async def delete_account_api(account_id: str):
    """ลบบัญชี"""
    if not line_account_manager:
        return JSONResponse({
            "status": "error",
            "message": "Account manager not initialized"
        })
    
    try:
        success = await line_account_manager.delete_account(account_id)
        
        if success:
            await notification_manager.send_notification(
                f"✅ Deleted LINE account", 
                "success"
            )
            return JSONResponse({"status": "success"})
        else:
            return JSONResponse({"status": "error", "message": "Delete failed"})
    except Exception as e:
        logger.error(f"Error deleting account: {e}")
        return JSONResponse({"status": "error", "message": str(e)})

@app.get("/admin/chat-history-by-account")
async def chat_history_by_account_page(request: Request):
    """ดูประวัติแชทแยกตามบัญชี"""
    account_id = request.query_params.get("account_id")
    
    if not line_account_manager:
        accounts = []
    else:
        accounts = await line_account_manager.list_accounts()
    
    # Query chat history with account filter
    chats = []
    if database_functions and 'get_recent_chat_history' in database_functions:
        all_chats = await database_functions['get_recent_chat_history'](1000)
        
        # Filter by account if specified
        if account_id:
            chats = [
                chat for chat in all_chats 
                if hasattr(chat, 'raw_message') and 
                chat.raw_message.get('_account_id') == account_id
            ]
        else:
            chats = all_chats
    
    return templates.TemplateResponse("chat_history.html", {
        "request": request,
        "chats": chats,
        "accounts": accounts,
        "selected_account": account_id
    })


@app.post("/admin/users/broadcast")
async def admin_broadcast_message(request: Request):
    """
    ส่งข้อความถึงผู้ใช้ทุกคน
    Request body: { "message": "<ข้อความ>" }
    """
    try:
        data = await request.json()
        message = data.get("message", "")
        if not message:
            return JSONResponse({"status": "error", "message": "Missing message"}, status_code=400)
        # รวบรวม user_id จากประวัติแชท (หรือจาก collection users หากมี)
        user_ids = set()
        if database_functions and 'get_recent_chat_history' in database_functions:
            all_chats = await database_functions['get_recent_chat_history'](10000)
            for chat in all_chats:
                uid = getattr(chat, 'user_id', None)
                if uid:
                    user_ids.add(uid)
        # ส่งข้อความถึงแต่ละ user
        sent_count = 0
        for uid in user_ids:
            if await send_message_safe(uid, reply_token="", message=message, message_type="broadcast"):
                sent_count += 1
        return JSONResponse({
            "status": "success",
            "total_users": len(user_ids),
            "sent": sent_count,
            "message": f"Broadcast message sent to {sent_count} users"
        })
    except Exception as e:
        logger.error(f"❌ Admin broadcast error: {e}")
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)
# ====================== Main Entry Point ======================

if __name__ == "__main__":
    import uvicorn
    
    print("🚀 Starting LINE OA Middleware (Production)...")
    print("🔗 Admin UI: http://localhost:8000/admin")  
    print("🔗 Debug Console: http://localhost:8000/admin/debug")
    print("🔗 Health Check: http://localhost:8000/health")
    
    try:
        uvicorn.run(
            "main_updated:app",
            host="0.0.0.0",
            port=int(os.getenv("PORT", 8000)),
            workers=1,  # Single worker for stability
            reload=False,  # Disable reload in production
            log_level="info",
            access_log=True,
            timeout_keep_alive=5,
            timeout_graceful_shutdown=10
        )
    except Exception as e:
        logger.error(f"❌ Server startup failed: {e}")
        sys.exit(1)
