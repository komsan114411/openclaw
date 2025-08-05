# main_updated.py (Fixed Version with Backward Compatibility)
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

# เพิ่มใน import section
import requests
from requests.exceptions import RequestException, Timeout, ConnectionError

import httpx
from fastapi import FastAPI, Request, HTTPException, status, WebSocket, WebSocketDisconnect, Header, BackgroundTasks
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

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

# Import modules with comprehensive error handling and fallback support
config_manager = None
database_functions = {}
ai_functions = {}
slip_functions = {}

def safe_import_modules():
    """Safely import all required modules with fallbacks - supports both old and new systems"""
    global IS_READY, config_manager, database_functions, ai_functions, slip_functions
    
    logger.info("🔄 Starting module imports...")
    
    try:
        # Config Manager - Try PostgreSQL first, fallback to original
        try:
            logger.info("🔄 Attempting PostgreSQL config manager...")
            from utils.postgres_config_manager import config_manager as postgres_cm
            config_manager = postgres_cm
            logger.info("✅ PostgreSQL config manager imported")
        except ImportError as e:
            logger.warning(f"⚠️ PostgreSQL config manager import failed: {e}")
            logger.info("🔄 Falling back to original config manager...")
            try:
                from utils.config_manager import config_manager as original_cm
                config_manager = original_cm
                logger.info("✅ Original config manager imported")
            except ImportError as e2:
                logger.error(f"❌ Original config manager also failed: {e2}")
                raise e2
        
        # Database functions - Try PostgreSQL first, fallback to SQLite
        try:
            logger.info("🔄 Attempting PostgreSQL database...")
            from models.postgres_database import (
                init_database, save_chat_history, get_chat_history_count, 
                get_recent_chat_history, get_user_chat_history, log_api_call, 
                get_api_statistics, cleanup_old_data
            )
            database_functions = {
                'init_database': init_database,
                'save_chat_history': save_chat_history,
                'get_chat_history_count': get_chat_history_count,
                'get_recent_chat_history': get_recent_chat_history,
                'get_user_chat_history': get_user_chat_history,
                'log_api_call': log_api_call,
                'get_api_statistics': get_api_statistics,
                'cleanup_old_data': cleanup_old_data
            }
            logger.info("✅ PostgreSQL database modules imported")
        except ImportError as e:
            logger.warning(f"⚠️ PostgreSQL database import failed: {e}")
            logger.info("🔄 Falling back to SQLite database...")
            try:
                from models.database import (
                    init_database, save_chat_history, get_chat_history_count, 
                    get_recent_chat_history, get_user_chat_history
                )
                database_functions = {
                    'init_database': init_database,
                    'save_chat_history': save_chat_history,
                    'get_chat_history_count': get_chat_history_count,
                    'get_recent_chat_history': get_recent_chat_history,
                    'get_user_chat_history': get_user_chat_history,
                    'log_api_call': lambda *args, **kwargs: None,  # Dummy function
                    'get_api_statistics': lambda *args, **kwargs: {},
                    'cleanup_old_data': lambda *args, **kwargs: {}
                }
                logger.info("✅ SQLite database modules imported")
            except ImportError as e2:
                logger.warning(f"⚠️ SQLite database import also failed: {e2}")
                database_functions = {
                    'init_database': lambda: None,
                    'save_chat_history': lambda u, d, m, s: None,
                    'get_chat_history_count': lambda: 0,
                    'get_recent_chat_history': lambda l=50: [],
                    'get_user_chat_history': lambda u, l=10: [],
                    'log_api_call': lambda *args, **kwargs: None,
                    'get_api_statistics': lambda *args, **kwargs: {},
                    'cleanup_old_data': lambda *args, **kwargs: {}
                }
        
        # AI Chat functions
        try:
            from services.chat_bot import get_chat_response
            ai_functions = {'get_chat_response': get_chat_response}
            logger.info("✅ AI chat imported")
        except ImportError as e:
            logger.warning(f"⚠️ AI chat import failed: {e}")
            ai_functions = {'get_chat_response': lambda t, u: "ขออภัย ระบบ AI ไม่พร้อมใช้งาน"}
        
        # Slip verification functions
        try:
            from services.slip_checker import verify_slip_with_thunder, test_thunder_api_connection
            from services.kbank_checker import KBankSlipChecker
            kbank_checker = KBankSlipChecker()
            from services.enhanced_slip_checker import (
                verify_slip_multiple_providers,
                extract_slip_info_from_text
            )
            slip_functions = {
                'verify_slip_with_thunder': verify_slip_with_thunder,
                'test_thunder_api_connection': test_thunder_api_connection,
                'kbank_checker': kbank_checker,
                'verify_slip_multiple_providers': verify_slip_multiple_providers,
                'extract_slip_info_from_text': extract_slip_info_from_text
            }
            logger.info("✅ Slip verification imported")
        except ImportError as e:
            logger.warning(f"⚠️ Slip verification import failed: {e}")
            
            class DummyKBankChecker:
                def verify_slip(self, bank_id, trans_ref):
                    return {"status": "error", "message": "KBank API ไม่พร้อมใช้งาน"}
                def _get_access_token(self):
                    return {"status": "error", "message": "KBank OAuth ไม่พร้อมใช้งาน"}

            slip_functions = {
                'verify_slip_with_thunder': lambda m, d: {"status": "error", "message": "Thunder API ไม่พร้อมใช้งาน"},
                'test_thunder_api_connection': lambda token: {"status": "error", "message": "Thunder API Test ไม่พร้อมใช้งาน"},
                'kbank_checker': DummyKBankChecker(),
                'verify_slip_multiple_providers': lambda **k: {"status": "error", "message": "ระบบตรวจสอบสลิปไม่พร้อมใช้งาน"},
                'extract_slip_info_from_text': lambda t: {"bank_code": None, "trans_ref": None}
            }
        
        # Initialize database
        try:
            database_functions['init_database']()
            logger.info("✅ Database initialized")
        except Exception as e:
            logger.error(f"❌ Database init error: {e}")
        
        IS_READY = True
        logger.info("✅ All modules loaded successfully - System READY")
        
        # Log which systems are active
        db_type = "PostgreSQL" if 'postgres_database' in str(database_functions.get('init_database', '')) else "SQLite"
        config_type = "PostgreSQL" if hasattr(config_manager, '_cache') else "JSON File"
        logger.info(f"📊 Active Systems: Database={db_type}, Config={config_type}")
        
    except Exception as e:
        logger.error(f"❌ Critical import error: {e}")
        IS_READY = False
        
        # Fallback config manager
        class DummyConfigManager:
            def __init__(self):
                self.config = {}
            def get(self, key, default=None):
                return self.config.get(key, default)
            def update(self, key, value):
                self.config[key] = value
                return True
            def update_multiple(self, updates):
                self.config.update(updates)
                return True
        
        config_manager = DummyConfigManager()

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
        if not config_manager:
            return {
                "thunder": {"enabled": False, "configured": False, "connected": False, "recent_failures": 0},
                "kbank": {"enabled": False, "configured": False, "connected": False, "recent_failures": 0}
            }
            
        thunder_token = config_manager.get("thunder_api_token", "").strip()
        thunder_enabled = config_manager.get("thunder_enabled", True)
        
        kbank_id = config_manager.get("kbank_consumer_id", "").strip()
        kbank_secret = config_manager.get("kbank_consumer_secret", "").strip()
        kbank_enabled = config_manager.get("kbank_enabled", False)
        
        return {
            "thunder": {
                "name": "Thunder API",
                "enabled": thunder_enabled,
                "configured": bool(thunder_token),
                "connected": bool(thunder_token and thunder_enabled),
                "recent_failures": 0,
                "last_failure": 0,
                "recently_failed": False
            },
            "kbank": {
                "name": "KBank API",
                "enabled": kbank_enabled,
                "configured": bool(kbank_id and kbank_secret),
                "connected": bool(kbank_id and kbank_secret and kbank_enabled),
                "recent_failures": 0,
                "last_failure": 0,
                "recently_failed": False
            }
        }
    except Exception as e:
        logger.error(f"❌ Error in get_api_status_summary: {e}")
        return {
            "thunder": {"enabled": False, "configured": False, "connected": False, "recent_failures": 0},
            "kbank": {"enabled": False, "configured": False, "connected": False, "recent_failures": 0}
        }

def reset_api_failure_cache():
    """รีเซ็ต API failure cache"""
    logger.info("🔄 API failure cache reset")
    return True

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

# ... (คงฟังก์ชันเดิมทั้งหมด) ...

# เพิ่มฟังก์ชันใหม่สำหรับ PostgreSQL support

@app.get("/admin/database-info")
async def get_database_info():
    """ดึงข้อมูลเกี่ยวกับฐานข้อมูล"""
    try:
        # ตรวจสอบว่าใช้ database แบบไหน
        is_postgres = 'postgres_database' in str(database_functions.get('init_database', ''))
        
        if is_postgres:
            try:
                from models.postgres_models import db_manager
                
                # Check connection
                db = db_manager.get_session()
                
                # Get basic statistics
                from sqlalchemy import text
                
                # Database type
                db_type = "PostgreSQL" if "postgresql" in str(db_manager.engine.url) else "SQLite"
                
                # Table counts
                chat_count = db.execute(text("SELECT COUNT(*) FROM chat_history")).scalar()
                config_count = db.execute(text("SELECT COUNT(*) FROM system_config")).scalar()
                
                try:
                    api_logs_count = db.execute(text("SELECT COUNT(*) FROM api_logs")).scalar()
                except:
                    api_logs_count = 0
                
                db.close()
                
                return JSONResponse({
                    "status": "success",
                    "database": {
                        "type": db_type,
                        "url": str(db_manager.engine.url).replace(db_manager.engine.url.password or '', '***') if db_manager.engine.url.password else str(db_manager.engine.url),
                        "connected": True,
                        "tables": {
                            "chat_history": chat_count,
                            "system_config": config_count,
                            "api_logs": api_logs_count
                        }
                    }
                })
            except Exception as e:
                logger.error(f"❌ PostgreSQL database info error: {e}")
                return JSONResponse({
                    "status": "error",
                    "message": str(e),
                    "database": {
                        "type": "PostgreSQL (Error)",
                        "connected": False
                    }
                })
        else:
            # SQLite fallback
            return JSONResponse({
                "status": "success",
                "database": {
                    "type": "SQLite",
                    "url": "sqlite:///storage.db",
                    "connected": True,
                    "tables": {
                        "chat_history": database_functions['get_chat_history_count'](),
                        "system_config": "N/A (JSON File)",
                        "api_logs": "N/A"
                    }
                }
            })
            
    except Exception as e:
        return JSONResponse({
            "status": "error",
            "message": str(e),
            "database": {
                "type": "Unknown",
                "connected": False
            }
        })

@app.post("/admin/migrate-config-vars")
async def migrate_config_vars():
    """Migrate จาก Heroku Config Vars ไปยัง PostgreSQL (หรือระบบปัจจุบัน)"""
    try:
        import os
        migrated = 0
        
        # Environment variables ที่ต้อง migrate
        env_vars = [
            'LINE_CHANNEL_SECRET',
            'LINE_CHANNEL_ACCESS_TOKEN', 
            'THUNDER_API_TOKEN',
            'OPENAI_API_KEY',
            'KBANK_CONSUMER_ID',
            'KBANK_CONSUMER_SECRET',
            'AI_ENABLED',
            'SLIP_ENABLED',
            'THUNDER_ENABLED',
            'KBANK_ENABLED',
            'WALLET_PHONE_NUMBER'
        ]
        
        updates = {}
        for env_var in env_vars:
            value = os.environ.get(env_var)
            if value:
                # แปลงชื่อให้เป็น lowercase และใช้ underscore
                config_key = env_var.lower()
                updates[config_key] = value
                migrated += 1
        
        if updates:
            success = config_manager.update_multiple(updates)
            if success:
                await notification_manager.send_notification(
                    f"✅ Migrated {migrated} config vars successfully", "success"
                )
                return JSONResponse({
                    "status": "success",
                    "message": f"Migrated {migrated} config vars successfully",
                    "migrated_keys": list(updates.keys())
                })
            else:
                return JSONResponse({
                    "status": "error",
                    "message": "Failed to update configuration"
                })
        else:
            return JSONResponse({
                "status": "info",
                "message": "No config vars found to migrate"
            })
            
    except Exception as e:
        logger.error(f"❌ Migration error: {e}")
        return JSONResponse({
            "status": "error",
            "message": f"Migration failed: {str(e)}"
        })

@app.get("/admin/config-management", response_class=HTMLResponse)
async def config_management_page(request: Request):
    """หน้าจัดการ Configuration แบบใหม่"""
    try:
        # ตรวจสอบว่า config_manager มี method get_all หรือไม่ (PostgreSQL version)
        if hasattr(config_manager, 'get_all'):
            all_configs = config_manager.get_all()
        else:
            # Fallback สำหรับ config manager เดิม
            all_configs = {
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
        
        return templates.TemplateResponse("config_management.html", {
            "request": request,
            "configs": all_configs,
            "config_count": len(all_configs)
        })
    except Exception as e:
        logger.error(f"❌ Config management page error: {e}")
        return templates.TemplateResponse("config_management.html", {
            "request": request,
            "configs": {},
            "config_count": 0,
            "error": str(e)
        })

@app.post("/admin/config-management/update")
async def update_config_via_web(request: Request):
    """อัปเดต Configuration ผ่านหน้าเว็บ"""
    try:
        data = await request.json()
        
        # แยกประเภทของ config
        sensitive_fields = ['line_channel_access_token', 'line_channel_secret', 
                          'thunder_api_token', 'openai_api_key', 
                          'kbank_consumer_id', 'kbank_consumer_secret']
        
        updates = {}
        for key, value in data.items():
            if key.startswith('_'):  # Skip system fields
                continue
                
            # Handle boolean fields
            if key in ['ai_enabled', 'slip_enabled', 'thunder_enabled', 'kbank_enabled', 'kbank_sandbox_mode']:
                updates[key] = bool(value)
            else:
                updates[key] = value
        
        success = config_manager.update_multiple(updates)
        
        if success:
            # Log sensitive updates without showing values
            for key in updates:
                if key in sensitive_fields:
                    logger.info(f"🔐 Updated sensitive config: {key}")
                else:
                    logger.info(f"⚙️ Updated config: {key} = {updates[key]}")
            
            await notification_manager.send_notification(
                f"✅ Updated {len(updates)} configurations", "success"
            )
            
            return JSONResponse({
                "status": "success",
                "message": f"อัปเดต {len(updates)} การตั้งค่าเรียบร้อย",
                "updated_count": len(updates)
            })
        else:
            return JSONResponse({
                "status": "error",
                "message": "ไม่สามารถบันทึกการตั้งค่าได้"
            })
            
    except Exception as e:
        logger.error(f"❌ Config update error: {e}")
        return JSONResponse({
            "status": "error",
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        })

@app.post("/admin/cleanup-old-data")
async def cleanup_old_data_endpoint():
    """ทำความสะอาดข้อมูลเก่า"""
    try:
        result = database_functions['cleanup_old_data'](days=30)
        
        if result:
            await notification_manager.send_notification(
                f"🧹 ทำความสะอาดข้อมูลเสร็จสิ้น: ลบ {result.get('deleted_chats', 0)} chat, {result.get('deleted_logs', 0)} logs", 
                "success"
            )
            
            return JSONResponse({
                "status": "success",
                "message": "ทำความสะอาดข้อมูลเสร็จสิ้น",
                "result": result
            })
        else:
            return JSONResponse({
                "status": "info",
                "message": "ไม่มีข้อมูลเก่าที่ต้องลบ"
            })
        
    except Exception as e:
        logger.error(f"❌ Cleanup error: {e}")
        return JSONResponse({
            "status": "error",
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        })

# ... เก็บ routes เดิมทั้งหมดไว้ ...

# เพิ่ม route สำหรับตรวจสอบว่าใช้ระบบไหน
@app.get("/admin/system-info")
async def get_system_info():
    """ดึงข้อมูลระบบที่ใช้งานอยู่"""
    try:
        is_postgres_db = 'postgres_database' in str(database_functions.get('init_database', ''))
        is_postgres_config = hasattr(config_manager, '_cache')
        
        return JSONResponse({
            "status": "success",
            "system_info": {
                "database_type": "PostgreSQL" if is_postgres_db else "SQLite",
                "config_type": "PostgreSQL" if is_postgres_config else "JSON File",
                "ready": IS_READY,
                "features": {
                    "postgresql_support": is_postgres_db,
                    "api_logging": is_postgres_db,
                    "advanced_config": is_postgres_config,
                    "data_cleanup": is_postgres_db
                }
            }
        })
    except Exception as e:
        return JSONResponse({
            "status": "error",
            "message": str(e)
        })

# ===== คงฟังก์ชันเดิมทั้งหมดไว้ =====

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
                database_functions['save_chat_history'](user_id, "out", {"type": "text", "text": message}, sender=message_type)
            except Exception as e:
                logger.warning(f"⚠️ Failed to save chat history: {e}")
        
        return success
        
    except Exception as e:
        logger.error(f"❌ send_message_safe error: {e}")
        return False

async def handle_ai_chat(user_id: str, reply_token: str, user_text: str):
    """จัดการแชท AI"""
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

async def handle_slip_verification(user_id: str, reply_token: str, message_id: str = None, slip_info: dict = None):
    """จัดการตรวจสอบสลิป"""
    try:
        # ตรวจสอบระบบ
        slip_enabled = config_manager.get("slip_enabled", False)
        if not slip_enabled:
            await send_message_safe(user_id, reply_token, "ขออภัย ระบบตรวจสอบสลิปถูกปิดใช้งาน", "system_error")
            return
        
        # ตรวจสอบ API
        thunder_enabled = config_manager.get("thunder_enabled", True)
        thunder_token = config_manager.get("thunder_api_token", "").strip()
        kbank_enabled = config_manager.get("kbank_enabled", False)
        kbank_configured = bool(config_manager.get("kbank_consumer_id") and config_manager.get("kbank_consumer_secret"))
        
        if not thunder_enabled and not kbank_enabled:
            await send_message_safe(user_id, reply_token, "ระบบตรวจสอบสลิปถูกปิดใช้งาน", "system_error")
            return
            
        if not thunder_token and not kbank_configured:
            await send_message_safe(user_id, reply_token, "ระบบยังไม่ได้ตั้งค่า กรุณาติดต่อผู้ดูแล", "system_error")
            return

        # แจ้งผู้ใช้
        processing_msg = "🔍 กรุณารอสักครู่... ระบบกำลังตรวจสอบสลิป"
        await send_line_reply(reply_token, processing_msg)

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
            elif message_id:
                result = await asyncio.wait_for(
                    asyncio.to_thread(
                        slip_functions['verify_slip_multiple_providers'], 
                        message_id=message_id
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
        
        # ประมวลผลผลลัพธ์
        if result and result.get("status") in ["success", "duplicate"]:
            reply_message = create_slip_reply_message(result)
            push_success = await send_line_push(user_id, reply_message)
            
            if push_success:
                try:
                    database_functions['save_chat_history'](user_id, "out", {"type": "text", "text": reply_message}, sender="slip_bot")
                except Exception as e:
                    logger.warning(f"⚠️ Failed to save slip result: {e}")
            else:
                # ลองส่งข้อความสั้น
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
    """Process LINE event (Production version)"""
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
        
        logger.info(f"🔄 Processing {message_type} from user {user_id[:10]}...")
        
        # บันทึกประวัติ
        try:
            database_functions['save_chat_history'](user_id, "in", message, sender="user")
        except Exception as e:
            logger.warning(f"⚠️ Failed to save chat history: {e}")
        
        # ประมวลผล
        if message_type == "text":
            user_text = message.get("text", "")
            slip_info = slip_functions['extract_slip_info_from_text'](user_text)
            
            if slip_info.get("bank_code") and slip_info.get("trans_ref"):
                await handle_slip_verification(user_id, reply_token, slip_info=slip_info)
            else:
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

# คงไว้ทุก routes เดิม และเพิ่มเติม...

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
        system_enabled = config_manager.get("slip_enabled", False)
        any_api_available = any(api.get("enabled", False) and api.get("configured", False) for api in api_statuses.values())

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
                "config": config_manager,
                "total_chat_history": 0,
                "system_status": {"system_enabled": False, "any_api_available": False},
                "api_statuses": {}
            },
        )

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
        
        # อัปเดต config
        config_manager.update_multiple(data)
        
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
            "status": "success",
            "message": "บันทึกการตั้งค่าสำเร็จ"
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

# เพิ่ม routes อื่นๆ ทั้งหมดตามเดิม...

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
