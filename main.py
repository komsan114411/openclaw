"""
LINE OA Management System with Role-based Authentication
Main Application File
"""
import json
import hmac
import hashlib
import base64
import asyncio
import logging
import os
import sys
import re
from datetime import datetime
from typing import Dict, Any, Optional, List
from contextlib import asynccontextmanager
from config import settings

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('app.log', encoding='utf-8')
    ]
)
logger = logging.getLogger("main_app")

import httpx
from fastapi import FastAPI, Request, HTTPException, status, Form, Cookie, WebSocket, WebSocketDisconnect
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Import models
from models.database import get_database, init_database
from models.user import User, UserRole
from models.session import Session
from models.line_account import LineAccount
from models.slip_template import SlipTemplate
from models.chat_message import ChatMessage
from models.error_codes import ErrorCode, ResponseMessage
from models.bank_account import BankAccount
from models.slip_history import SlipHistory
from models.bank import BankModel
# SaaS Models
from models.package import PackageModel
from models.subscription import SubscriptionModel
from models.payment import PaymentModel
from models.system_settings import SystemSettingsModel
from models.quota_reservation import QuotaReservationModel

# Import middleware
from middleware.auth import AuthMiddleware, get_current_user_from_request

# Import services
from services.chat_bot import get_chat_response, get_chat_response_async
from services.slip_checker import SlipChecker
from services.slip_formatter import create_beautiful_slip_flex_message, create_error_flex_message
from services.image_validator import validate_slip_image, get_error_template

# Global variables
IS_READY = False
SHUTDOWN_INITIATED = False

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"📱 WebSocket connected. Total: {len(self.active_connections)}")
    
    async def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"📱 WebSocket disconnected. Total: {len(self.active_connections)}")
    
    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients"""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error sending to websocket: {e}")
                disconnected.append(connection)
        
        # Remove disconnected clients
        for conn in disconnected:
            await self.disconnect(conn)

manager = ConnectionManager()

# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    global IS_READY
    
    logger.info("🚀 Starting LINE OA Management System...")
    
    try:
        # Initialize database
        database = init_database()
        logger.info("✅ Database initialized")
        
        # Initialize models
        app.state.database = database
        app.state.db = database.get_db()
        app.state.user_model = User(app.state.db)
        app.state.session_model = Session(app.state.db)
        app.state.line_account_model = LineAccount(app.state.db)
        app.state.slip_template_model = SlipTemplate(app.state.db)
        app.state.chat_message_model = ChatMessage(app.state.db)
        app.state.error_code_model = ErrorCode(app.state.db)
        app.state.response_message_model = ResponseMessage(app.state.db)
        app.state.bank_account_model = BankAccount(app.state.db)
        app.state.slip_history_model = SlipHistory(app.state.db)
        app.state.bank_model = BankModel(app.state.db)
        
        # Auto-initialize banks if database is empty
        try:
            existing_banks = app.state.bank_model.get_all_banks()
            if len(existing_banks) == 0:
                logger.info("📋 No banks found, initializing default banks...")
                # Initialize banks from Thunder API
                BANKS = [
                    {"code": "002", "abbr": "BBL", "name": "ธนาคารกรุงเทพ"},
                    {"code": "004", "abbr": "KBANK", "name": "ธนาคารกสิกรไทย"},
                    {"code": "006", "abbr": "KTB", "name": "ธนาคารกรุงไทย"},
                    {"code": "011", "abbr": "TTB", "name": "ธนาคารทหารไทยธนชาต"},
                    {"code": "014", "abbr": "SCB", "name": "ธนาคารไทยพาณิชย์"},
                    {"code": "022", "abbr": "CIMBT", "name": "ธนาคารซีไอเอ็มบีไทย"},
                    {"code": "024", "abbr": "UOBT", "name": "ธนาคารยูโอบี"},
                    {"code": "025", "abbr": "BAY", "name": "ธนาคารกรุงศรีอยุธยา"},
                    {"code": "030", "abbr": "GSB", "name": "ธนาคารออมสิน"},
                    {"code": "033", "abbr": "GHB", "name": "ธนาคารอาคารสงเคราะห์"},
                    {"code": "034", "abbr": "BAAC", "name": "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร"},
                    {"code": "035", "abbr": "EXIM", "name": "ธนาคารเพื่อการส่งออกและนำเข้าแห่งประเทศไทย"},
                    {"code": "067", "abbr": "TISCO", "name": "ธนาคารทิสโก้"},
                    {"code": "069", "abbr": "KKP", "name": "ธนาคารเกียรตินาคินภัทร"},
                    {"code": "070", "abbr": "ICBCT", "name": "ธนาคารไอซีบีซี (ไทย)"},
                    {"code": "071", "abbr": "TCD", "name": "ธนาคารไทยเครดิตเพื่อรายย่อย"},
                    {"code": "073", "abbr": "LHFG", "name": "ธนาคารแลนด์ แอนด์ เฮ้าส์"},
                    {"code": "098", "abbr": "SME", "name": "ธนาคารพัฒนาวิสาหกิจขนาดกลางและขนาดย่อมแห่งประเทศไทย"},
                ]
                for bank_data in BANKS:
                    try:
                        app.state.bank_model.create_bank(
                            code=bank_data["code"],
                            name=bank_data["name"],
                            abbreviation=bank_data["abbr"],
                            logo_base64=None,
                            is_active=True
                        )
                    except Exception as e:
                        logger.warning(f"⚠️ Could not create bank {bank_data['code']}: {e}")
                logger.info(f"✅ Initialized {len(BANKS)} default banks")
        except Exception as e:
            logger.error(f"❌ Error auto-initializing banks: {e}")
        
        # Initialize SaaS models
        app.state.package_model = PackageModel(app.state.db)
        app.state.subscription_model = SubscriptionModel(app.state.db)
        app.state.payment_model = PaymentModel(app.state.db)
        app.state.system_settings_model = SystemSettingsModel(app.state.db)
        app.state.quota_reservation_model = QuotaReservationModel(app.state.db)
        
        # Initialize auth middleware
        app.state.auth = AuthMiddleware(app.state.session_model)
        
        logger.info("✅ Models initialized")
        
        IS_READY = True
        logger.info("✅ System ready!")
        
        yield
        
    except Exception as e:
        logger.error(f"❌ Startup failed: {e}")
        raise
    finally:
        global SHUTDOWN_INITIATED
        SHUTDOWN_INITIATED = True
        logger.info("🛑 Shutting down...")

# Create FastAPI app
app = FastAPI(
    title="LINE OA Management System",
    description="Multi-account LINE Official Account management with AI chatbot and slip verification",
    version="2.0.0",
    lifespan=lifespan
)

# Register SaaS Routes
from routes.saas_routes import register_saas_routes
register_saas_routes(app)

# Register UI Routes
from routes.ui_routes import register_ui_routes
register_ui_routes(app)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Templates
templates = Jinja2Templates(directory="templates")

# Pydantic models
class LoginRequest(BaseModel):
    username: str
    password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str

class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str
    email: Optional[str] = None
    full_name: Optional[str] = None

class UpdateUserRequest(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None

class CreateLineAccountRequest(BaseModel):
    account_name: str
    channel_id: str
    channel_secret: str
    channel_access_token: str
    description: Optional[str] = None

class UpdateLineAccountSettingsRequest(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    ai_enabled: Optional[bool] = None
    ai_model: Optional[str] = None
    ai_system_prompt: Optional[str] = None
    ai_temperature: Optional[float] = None
    ai_fallback_message: Optional[str] = None
    ai_response_mode: Optional[str] = None  # "immediate" or "processing"
    ai_immediate_message: Optional[str] = None  # Message sent immediately when response_mode is "immediate"
    slip_verification_enabled: Optional[bool] = None
    slip_template_id: Optional[str] = None
    slip_response_mode: Optional[str] = None  # "immediate" or "processing"
    slip_immediate_message: Optional[str] = None  # Message sent immediately when response_mode is "immediate"

class CreateBankAccountRequest(BaseModel):
    account_name: str
    bank_name: str
    account_number: str
    line_account_id: Optional[str] = None
    description: Optional[str] = None

class UpdateBankAccountRequest(BaseModel):
    account_name: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    line_account_id: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

# ==================== Authentication Routes ====================

@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    """Redirect to login or dashboard"""
    user = app.state.auth.get_current_user(request)
    if user:
        if user["role"] == UserRole.ADMIN:
            return RedirectResponse(url="/admin/dashboard")
        else:
            return RedirectResponse(url="/user/dashboard")
    return RedirectResponse(url="/login")

@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    """Login page"""
    user = app.state.auth.get_current_user(request)
    if user:
        if user["role"] == UserRole.ADMIN:
            return RedirectResponse(url="/admin/dashboard")
        else:
            return RedirectResponse(url="/user/dashboard")
    
    return templates.TemplateResponse("login.html", {"request": request})

@app.post("/api/login")
async def login(request: Request, username: str = Form(...), password: str = Form(...)):
    """Login endpoint"""
    try:
        user = app.state.user_model.authenticate(username, password)
        
        if not user:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"success": False, "message": "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"}
            )
        
        session_id = app.state.session_model.create_session(
            user_id=user["_id"],
            username=user["username"],
            role=user["role"]
        )
        
        if not session_id:
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={"success": False, "message": "ไม่สามารถสร้าง session ได้"}
            )
        
        response_data = {
            "success": True,
            "message": "เข้าสู่ระบบสำเร็จ",
            "user": {
                "username": user["username"],
                "role": user["role"],
                "full_name": user.get("full_name")
            },
            "force_password_change": user.get("force_password_change", False)
        }
        
        if user.get("force_password_change"):
            response_data["redirect"] = "/change-password"
        elif user["role"] == UserRole.ADMIN:
            response_data["redirect"] = "/admin/dashboard"
        else:
            response_data["redirect"] = "/user/dashboard"
        
        response = JSONResponse(content=response_data)
        response.set_cookie(
            key="session_id",
            value=session_id,
            httponly=True,
            max_age=86400,
            samesite="lax"
        )
        
        return response
        
    except Exception as e:
        logger.error(f"❌ Login error: {e}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"success": False, "message": "เกิดข้อผิดพลาดในการเข้าสู่ระบบ"}
        )

@app.get("/logout")
async def logout(request: Request, session_id: Optional[str] = Cookie(None)):
    """Logout endpoint"""
    if session_id:
        app.state.session_model.delete_session(session_id)
    
    response = RedirectResponse(url="/login", status_code=status.HTTP_302_FOUND)
    response.delete_cookie("session_id")
    return response

@app.get("/change-password", response_class=HTMLResponse)
async def change_password_page(request: Request):
    """Change password page"""
    user = app.state.auth.get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    
    user_data = app.state.user_model.get_user_by_id(user["user_id"])
    return templates.TemplateResponse("change_password.html", {
        "request": request,
        "user": user_data
    })

@app.post("/api/change-password")
async def change_password(
    request: Request,
    current_password: str = Form(...),
    new_password: str = Form(...),
    confirm_password: str = Form(...)
):
    """Change password endpoint"""
    try:
        user = app.state.auth.get_current_user(request)
        if not user:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"success": False, "message": "กรุณาเข้าสู่ระบบ"}
            )
        
        if new_password != confirm_password:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"success": False, "message": "รหัสผ่านใหม่ไม่ตรงกัน"}
            )
        
        if len(new_password) < 6:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"success": False, "message": "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"}
            )
        
        user_data = app.state.user_model.get_user_by_id(user["user_id"])
        if not user_data:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content={"success": False, "message": "ไม่พบข้อมูลผู้ใช้"}
            )
        
        from bson import ObjectId
        user_with_password = app.state.db.users.find_one({"_id": ObjectId(user["user_id"])})
        if not User.verify_password(current_password, user_with_password["password"]):
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"success": False, "message": "รหัสผ่านปัจจุบันไม่ถูกต้อง"}
            )
        
        success = app.state.user_model.update_password(user["user_id"], new_password)
        
        if success:
            return JSONResponse(content={
                "success": True,
                "message": "เปลี่ยนรหัสผ่านสำเร็จ",
                "redirect": "/admin/dashboard" if user["role"] == UserRole.ADMIN else "/user/dashboard"
            })
        else:
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={"success": False, "message": "ไม่สามารถเปลี่ยนรหัสผ่านได้"}
            )
        
    except Exception as e:
        logger.error(f"❌ Change password error: {e}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"success": False, "message": "เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน"}
        )

# ==================== Admin Routes ====================

@app.get("/admin/dashboard", response_class=HTMLResponse)
async def admin_dashboard(request: Request):
    """Admin dashboard page with error monitoring"""
    user = app.state.auth.get_current_user(request)
    if not user or user["role"] != UserRole.ADMIN:
        return RedirectResponse(url="/login")
    
    total_users = len(app.state.user_model.get_all_users())
    total_line_accounts = len(app.state.line_account_model.get_all_accounts())
    
    # นับจำนวนข้อความวันนี้
    from datetime import datetime, timedelta
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    total_messages_today = 0
    try:
        from models.message import Message
        total_messages_today = Message.objects(timestamp__gte=today).count()
    except:
        pass
    
    # นับจำนวนสลิปที่ตรวจสอบ
    total_slips_verified = 0
    try:
        from models.slip_history import SlipHistory
        total_slips_verified = SlipHistory.objects().count()
    except:
        pass
    
    recent_users = app.state.user_model.get_all_users()[:5]
    recent_line_accounts = app.state.line_account_model.get_all_accounts()[:5]
    
    # ดึง API errors ที่เกิดขึ้นล่าสุด (24 ชั่วโมงที่ผ่านมา)
    api_errors = []
    try:
        from datetime import datetime, timedelta
        import pytz
        thai_tz = pytz.timezone('Asia/Bangkok')
        yesterday = datetime.now(thai_tz) - timedelta(hours=24)
        
        # ดึงจาก slip_history ที่มี error_detail
        errors_collection = app.state.db.api_errors
        recent_errors = list(errors_collection.find({
            "timestamp": {"$gte": yesterday.isoformat()}
        }).sort("timestamp", -1).limit(10))
        
        api_errors = recent_errors
    except Exception as e:
        logger.error(f"Error fetching API errors: {e}")
    
    # ดึง System errors (bank logo errors, database connection errors, etc.)
    system_errors = []
    try:
        from datetime import datetime, timedelta
        import pytz
        thai_tz = pytz.timezone('Asia/Bangkok')
        yesterday = datetime.now(thai_tz) - timedelta(hours=24)
        
        # ดึงจาก system_errors collection
        system_errors_collection = app.state.db.system_errors
        recent_system_errors = list(system_errors_collection.find({
            "timestamp": {"$gte": yesterday}
        }).sort("timestamp", -1).limit(10))
        
        # Format errors for display
        for error in recent_system_errors:
            error_doc = {
                "type": error.get("type", "unknown"),
                "error_message": error.get("error_message", "Unknown error"),
                "timestamp": error.get("timestamp", datetime.utcnow()).isoformat() if isinstance(error.get("timestamp"), datetime) else str(error.get("timestamp", ""))
            }
            system_errors.append(error_doc)
    except Exception as e:
        logger.error(f"Error fetching system errors: {e}")
    
    return templates.TemplateResponse("admin/dashboard.html", {
        "request": request,
        "user": user,
        "total_users": total_users,
        "total_line_accounts": total_line_accounts,
        "total_messages_today": total_messages_today,
        "total_slips_verified": total_slips_verified,
        "recent_users": recent_users,
        "recent_line_accounts": recent_line_accounts,
        "api_errors": api_errors,
        "system_errors": system_errors
    })

@app.get("/admin/users", response_class=HTMLResponse)
async def admin_users(request: Request):
    """Admin user management page"""
    user = app.state.auth.get_current_user(request)
    if not user or user["role"] != UserRole.ADMIN:
        return RedirectResponse(url="/login")
    
    users = app.state.user_model.get_all_users(include_inactive=True)
    
    return templates.TemplateResponse("admin/users.html", {
        "request": request,
        "user": user,
        "users": users
    })

@app.post("/api/admin/users")
async def create_user_api(request: Request, data: CreateUserRequest):
    """Create new user (Admin only)"""
    user = app.state.auth.get_current_user(request)
    if not user or user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        user_id = app.state.user_model.create_user(
            username=data.username,
            password=data.password,
            role=data.role,
            email=data.email,
            full_name=data.full_name,
            force_password_change=True
        )
        
        if user_id:
            await manager.broadcast({
                "type": "success",
                "message": f"สร้างผู้ใช้ {data.username} สำเร็จ"
            })
            return {"success": True, "message": "สร้างผู้ใช้สำเร็จ", "user_id": user_id}
        else:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "ชื่อผู้ใช้นี้มีอยู่แล้ว"}
            )
    except Exception as e:
        logger.error(f"Error creating user: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "เกิดข้อผิดพลาดในการสร้างผู้ใช้"}
        )

@app.delete("/api/admin/users/{user_id}")
async def delete_user_api(request: Request, user_id: str):
    """Delete user (Admin only)"""
    user = app.state.auth.get_current_user(request)
    if not user or user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    if user_id == user["user_id"]:
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": "ไม่สามารถลบบัญชีของตัวเองได้"}
        )
    
    # ลบบัญชี LINE ของผู้ใช้ก่อน
    line_accounts = app.state.line_account_model.get_accounts_by_owner(user_id)
    for account in line_accounts:
        app.state.line_account_model.delete_account(account["_id"])
        logger.info(f"Deleted LINE account {account['account_name']} for user {user_id}")
    
    # ลบผู้ใช้
    success = app.state.user_model.delete_user(user_id)
    if success:
        await manager.broadcast({
            "type": "info",
            "message": f"ลบผู้ใช้และบัญชี LINE {len(line_accounts)} บัญชีสำเร็จ"
        })
        return {"success": True, "message": f"ลบผู้ใช้และบัญชี LINE {len(line_accounts)} บัญชีสำเร็จ"}
    else:
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "ไม่สามารถลบผู้ใช้ได้"}
        )

@app.put("/api/admin/users/{user_id}")
async def update_user_api(request: Request, user_id: str):
    """Update user information (Admin only)"""
    user = app.state.auth.get_current_user(request)
    if not user or user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        data = await request.json()
        update_data = {}
        
        if "email" in data:
            update_data["email"] = data["email"]
        if "full_name" in data:
            update_data["full_name"] = data["full_name"]
        if "role" in data:
            update_data["role"] = data["role"]
        
        if not update_data:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "ไม่มีข้อมูลที่จะอัปเดต"}
            )
        
        success = app.state.user_model.update_user(user_id, update_data)
        if success:
            await manager.broadcast({
                "type": "success",
                "message": "อัปเดตข้อมูลผู้ใช้สำเร็จ"
            })
            return {"success": True, "message": "อัปเดตข้อมูลผู้ใช้สำเร็จ"}
        else:
            return JSONResponse(
                status_code=500,
                content={"success": False, "message": "ไม่สามารถอัปเดตข้อมูลผู้ใช้ได้"}
            )
    except Exception as e:
        logger.error(f"Error updating user: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "เกิดข้อผิดพลาดในการอัปเดตข้อมูลผู้ใช้"}
        )

@app.post("/api/admin/users/{user_id}/password")
async def change_user_password_api(request: Request, user_id: str):
    """Change user password (Admin only)"""
    user = app.state.auth.get_current_user(request)
    if not user or user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        data = await request.json()
        new_password = data.get("new_password")
        confirm_password = data.get("confirm_password")
        
        if not new_password or not confirm_password:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "กรุณากรอกรหัสผ่านใหม่และยืนยันรหัสผ่าน"}
            )
        
        if new_password != confirm_password:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "รหัสผ่านใหม่ไม่ตรงกัน"}
            )
        
        if len(new_password) < 6:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"}
            )
        
        success = app.state.user_model.update_password(user_id, new_password, clear_force_change=True)
        if success:
            await manager.broadcast({
                "type": "success",
                "message": "เปลี่ยนรหัสผ่านผู้ใช้สำเร็จ"
            })
            return {"success": True, "message": "เปลี่ยนรหัสผ่านผู้ใช้สำเร็จ"}
        else:
            return JSONResponse(
                status_code=500,
                content={"success": False, "message": "ไม่สามารถเปลี่ยนรหัสผ่านได้"}
            )
    except Exception as e:
        logger.error(f"Error changing user password: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน"}
        )

@app.put("/api/admin/users/{user_id}/restore")
async def restore_user_api(request: Request, user_id: str):
    """Restore deleted user (Admin only)"""
    user = app.state.auth.get_current_user(request)
    if not user or user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    success = app.state.user_model.restore_user(user_id)
    if success:
        await manager.broadcast({
            "type": "success",
            "message": "กู้คืนผู้ใช้สำเร็จ"
        })
        return {"success": True, "message": "กู้คืนผู้ใช้สำเร็จ"}
    else:
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "ไม่สามารถกู้คืนผู้ใช้ได้"}
        )

@app.get("/admin/line-accounts", response_class=HTMLResponse)
async def admin_line_accounts(request: Request):
    """Admin LINE accounts management page"""
    user = app.state.auth.get_current_user(request)
    if not user or user["role"] != UserRole.ADMIN:
        return RedirectResponse(url="/login")
    
    line_accounts = app.state.line_account_model.get_all_accounts(include_inactive=True)
    
    # Add owner username to each account
    for account in line_accounts:
        owner_id = account.get("owner_id")
        if owner_id:
            owner = app.state.user_model.get_user_by_id(owner_id)
            account["owner_username"] = owner.get("username") if owner else "N/A"
        else:
            account["owner_username"] = "N/A"
    
    return templates.TemplateResponse("admin/line_accounts.html", {
        "request": request,
        "user": user,
        "line_accounts": line_accounts
    })

@app.get("/admin/banks", response_class=HTMLResponse)
async def admin_banks(request: Request):
    """Admin banks management page"""
    user = app.state.auth.get_current_user(request)
    if not user or user["role"] != UserRole.ADMIN:
        return RedirectResponse(url="/login")
    
    return templates.TemplateResponse("admin/banks.html", {
        "request": request,
        "user": user
    })

@app.get("/admin/api/banks")
async def get_banks_api(request: Request):
    """Get all banks (Admin only)"""
    user = app.state.auth.get_current_user(request)
    if not user or user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        banks = app.state.bank_model.get_all_banks()
        bank_dicts = []
        
        for bank in banks:
            bank_dict = app.state.bank_model.to_dict(bank)
            if bank_dict:
                # Log logo status for debugging
                logo_base64 = bank_dict.get("logo_base64")
                has_logo = logo_base64 and isinstance(logo_base64, str) and len(logo_base64) > 0
                logo_length = len(logo_base64) if logo_base64 else 0
                logger.info(f"Bank {bank_dict.get('code')} ({bank_dict.get('name')}): has_logo={has_logo}, logo_length={logo_length}")
                
                # Ensure logo_base64 is included in response (even if None)
                if 'logo_base64' not in bank_dict:
                    bank_dict['logo_base64'] = None
                
                bank_dicts.append(bank_dict)
        
        logger.info(f"✅ Returning {len(bank_dicts)} banks to admin")
        return bank_dicts
    except Exception as e:
        logger.error(f"❌ Error getting banks: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error retrieving banks: {str(e)}")

@app.post("/admin/api/banks")
async def create_bank_api(request: Request):
    """Create new bank (Admin only)"""
    user = app.state.auth.get_current_user(request)
    if not user or user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        data = await request.json()
        
        code = data.get("code", "").strip()
        name = data.get("name", "").strip()
        abbreviation = data.get("abbreviation", code).strip()
        logo_base64 = data.get("logo_base64")
        is_active = data.get("is_active", True)
        
        # Validation
        if not code or not name:
            raise HTTPException(status_code=400, detail="รหัสธนาคารและชื่อธนาคารต้องไม่ว่าง")
        
        if not re.match(r'^[0-9]{3}$', code):
            raise HTTPException(status_code=400, detail="รหัสธนาคารต้องเป็นตัวเลข 3 หลัก")
        
        # Check if bank code already exists
        existing_bank = app.state.bank_model.get_bank_by_code(code)
        if existing_bank:
            raise HTTPException(status_code=400, detail=f"รหัสธนาคาร {code} มีอยู่แล้ว")
        
        # Validate logo_base64 if provided
        if logo_base64:
            # Check if it's valid base64
            try:
                import base64 as b64
                # Try to decode to verify it's valid base64
                b64.b64decode(logo_base64, validate=True)
                logger.info(f"✅ Valid base64 logo provided for bank {code} (length: {len(logo_base64)})")
            except Exception as e:
                logger.warning(f"⚠️ Invalid base64 logo for bank {code}: {e}")
                # Still allow it, but log warning
        
        # Create bank
        bank = app.state.bank_model.create_bank(
            code=code,
            name=name,
            abbreviation=abbreviation,
            logo_base64=logo_base64,
            is_active=is_active
        )
        
        logger.info(f"✅ Created new bank: {code} - {name} (logo: {'yes' if logo_base64 else 'no'})")
        
        return {
            "success": True,
            "message": "สร้างธนาคารสำเร็จ",
            "bank": app.state.bank_model.to_dict(bank)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error creating bank: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/admin/api/banks/{bank_id}")
async def update_bank_api(request: Request, bank_id: str):
    """Update bank (Admin only)"""
    user = app.state.auth.get_current_user(request)
    if not user or user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        bank = app.state.bank_model.get_bank_by_id(bank_id)
        if not bank:
            raise HTTPException(status_code=404, detail="Bank not found")
        
        data = await request.json()
        
        # Prepare update data
        update_data = {}
        if 'name' in data:
            update_data['name'] = data['name']
        if 'abbreviation' in data:
            update_data['abbreviation'] = data['abbreviation']
        if 'is_active' in data:
            update_data['is_active'] = data['is_active']
        if 'logo_base64' in data:
            # Handle logo update or removal
            if data['logo_base64'] is None:
                # Remove logo - set to None so model will use $unset
                update_data['logo_base64'] = None
                logger.info(f"🗑️ Removing logo for bank: {bank_id}")
            elif isinstance(data['logo_base64'], str) and data['logo_base64'].strip():
                # Validate base64
                try:
                    import base64 as b64
                    # Try to decode to verify it's valid base64
                    decoded = b64.b64decode(data['logo_base64'], validate=True)
                    logger.info(f"✅ Valid base64 logo for bank {bank_id} (decoded size: {len(decoded)} bytes)")
                    # Update logo
                    update_data['logo_base64'] = data['logo_base64']
                    logger.info(f"🖼️ Updating logo for bank: {bank_id} (base64 length: {len(data['logo_base64'])})")
                except Exception as e:
                    logger.error(f"❌ Invalid base64 logo for bank {bank_id}: {e}")
                    raise HTTPException(status_code=400, detail=f"โลโก้ไม่ถูกต้อง: {str(e)}")
            else:
                logger.warning(f"⚠️ Invalid logo_base64 value type for bank {bank_id}: {type(data['logo_base64'])}")
        
        # Update bank
        if not update_data:
            raise HTTPException(status_code=400, detail="ไม่มีข้อมูลที่จะอัพเดต")
        
        success = app.state.bank_model.update_bank(bank_id, update_data)
        
        if success:
            logger.info(f"✅ Updated bank: {bank_id} - {update_data.get('name', 'N/A')}")
            return {"success": True, "message": "อัปเดตธนาคารสำเร็จ"}
        else:
            logger.error(f"❌ Failed to update bank: {bank_id}")
            raise HTTPException(status_code=500, detail="ไม่สามารถอัพเดตธนาคารได้")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error updating bank: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/admin/api/banks/init-thunder-banks")
async def init_thunder_banks(request: Request):
    """Initialize banks from Thunder API bank codes (Admin only) - Auto initialize on first call"""
    user = app.state.auth.get_current_user(request)
    if not user or user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    # Bank data from Thunder API - Complete list (18 banks)
    BANKS = [
        {"code": "002", "abbr": "BBL", "name": "ธนาคารกรุงเทพ"},
        {"code": "004", "abbr": "KBANK", "name": "ธนาคารกสิกรไทย"},
        {"code": "006", "abbr": "KTB", "name": "ธนาคารกรุงไทย"},
        {"code": "011", "abbr": "TTB", "name": "ธนาคารทหารไทยธนชาต"},
        {"code": "014", "abbr": "SCB", "name": "ธนาคารไทยพาณิชย์"},
        {"code": "022", "abbr": "CIMBT", "name": "ธนาคารซีไอเอ็มบีไทย"},
        {"code": "024", "abbr": "UOBT", "name": "ธนาคารยูโอบี"},
        {"code": "025", "abbr": "BAY", "name": "ธนาคารกรุงศรีอยุธยา"},
        {"code": "030", "abbr": "GSB", "name": "ธนาคารออมสิน"},
        {"code": "033", "abbr": "GHB", "name": "ธนาคารอาคารสงเคราะห์"},
        {"code": "034", "abbr": "BAAC", "name": "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร"},
        {"code": "035", "abbr": "EXIM", "name": "ธนาคารเพื่อการส่งออกและนำเข้าแห่งประเทศไทย"},
        {"code": "067", "abbr": "TISCO", "name": "ธนาคารทิสโก้"},
        {"code": "069", "abbr": "KKP", "name": "ธนาคารเกียรตินาคินภัทร"},
        {"code": "070", "abbr": "ICBCT", "name": "ธนาคารไอซีบีซี (ไทย)"},
        {"code": "071", "abbr": "TCD", "name": "ธนาคารไทยเครดิตเพื่อรายย่อย"},
        {"code": "073", "abbr": "LHFG", "name": "ธนาคารแลนด์ แอนด์ เฮ้าส์"},
        {"code": "098", "abbr": "SME", "name": "ธนาคารพัฒนาวิสาหกิจขนาดกลางและขนาดย่อมแห่งประเทศไทย"},
    ]
    
    try:
        added_count = 0
        updated_count = 0
        errors = []
        
        for bank_data in BANKS:
            try:
                code = bank_data["code"]
                abbr = bank_data["abbr"]
                name = bank_data["name"]
                
                # Check if bank already exists
                existing_bank = app.state.bank_model.get_bank_by_code(code)
                
                if existing_bank:
                    # Update existing bank (keep logo if exists)
                    existing_logo = existing_bank.get("logo_base64")
                    update_data = {
                        "name": name,
                        "abbreviation": abbr,
                        "is_active": True
                    }
                    # Only update logo if it doesn't exist
                    if not existing_logo:
                        update_data["logo_base64"] = None
                    app.state.bank_model.update_bank(str(existing_bank["_id"]), update_data)
                    updated_count += 1
                    logger.info(f"✅ Updated bank: {code} - {name}")
                else:
                    # Insert new bank
                    app.state.bank_model.create_bank(
                        code=code,
                        name=name,
                        abbreviation=abbr,
                        logo_base64=None,
                        is_active=True
                    )
                    added_count += 1
                    logger.info(f"✅ Added bank: {code} - {name}")
            except Exception as e:
                error_msg = f"Error processing bank {bank_data.get('code', 'unknown')}: {str(e)}"
                errors.append(error_msg)
                logger.error(f"❌ {error_msg}")
        
        result = {
            "success": True,
            "message": f"เพิ่มข้อมูลธนาคารสำเร็จ",
            "added": added_count,
            "updated": updated_count,
            "total": added_count + updated_count
        }
        
        if errors:
            result["errors"] = errors
            result["warning"] = f"มีข้อผิดพลาด {len(errors)} รายการ"
        
        return result
    except Exception as e:
        logger.error(f"❌ Error initializing banks: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/bank-logo/{bank_code}")
async def get_bank_logo_api(bank_code: str):
    """Get bank logo by code - Returns data URI format"""
    try:
        bank = app.state.bank_model.get_bank_by_code(bank_code)
        if not bank:
            logger.warning(f"⚠️ Bank with code {bank_code} not found")
            # Return default logo instead of 404
            from services.slip_formatter import DEFAULT_LOGO
            return {"logo_base64": DEFAULT_LOGO, "has_logo": False}
        
        logo_base64 = bank.get("logo_base64")
        
        # Validate logo_base64
        if not logo_base64 or not isinstance(logo_base64, str) or not logo_base64.strip():
            logger.info(f"ℹ️ No logo for bank {bank_code}, returning default")
            from services.slip_formatter import DEFAULT_LOGO
            return {"logo_base64": DEFAULT_LOGO, "has_logo": False}
        
        # Return as data URI if not already
        if logo_base64.startswith('data:'):
            logger.info(f"✅ Returning logo for bank {bank_code} (data URI format)")
            return {"logo_base64": logo_base64, "has_logo": True}
        else:
            logger.info(f"✅ Returning logo for bank {bank_code} (base64 format, length: {len(logo_base64)})")
            return {"logo_base64": f"data:image/png;base64,{logo_base64}", "has_logo": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error getting bank logo: {e}")
        import traceback
        logger.error(traceback.format_exc())
        # Log to system_errors for admin dashboard
        try:
            app.state.db.system_errors.insert_one({
                "type": "bank_logo_api_error",
                "bank_code": bank_code,
                "error_message": str(e),
                "timestamp": datetime.utcnow()
            })
        except:
            pass
        # Return default logo instead of error
        try:
            from services.slip_formatter import DEFAULT_LOGO
            return {"logo_base64": DEFAULT_LOGO, "has_logo": False, "error": str(e)}
        except:
            raise HTTPException(status_code=500, detail="Error retrieving bank logo")

@app.get("/settings/realtime-chat", response_class=HTMLResponse)
async def realtime_chat_page(request: Request):
    """Real-time chat page"""
    user = app.state.auth.get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    
    # Load LINE accounts for this user or all accounts for admin
    if user["role"] == UserRole.ADMIN:
        line_accounts = app.state.line_account_model.get_all_accounts()
    else:
        line_accounts = app.state.line_account_model.get_accounts_by_owner(user["user_id"])
    
    return templates.TemplateResponse("settings/realtime_chat.html", {
        "request": request,
        "user": user,
        "line_accounts": line_accounts
    })

@app.get("/user/chat-history", response_class=HTMLResponse)
@app.get("/settings/chat-history", response_class=HTMLResponse)
async def user_chat_history(request: Request):
    """User chat history page"""
    user = app.state.auth.get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    
    # Load LINE accounts for this user or all accounts for admin
    if user["role"] == UserRole.ADMIN:
        line_accounts = app.state.line_account_model.get_all_accounts()
    else:
        line_accounts = app.state.line_account_model.get_accounts_by_owner(user["user_id"])
    
    return templates.TemplateResponse("settings/realtime_chat.html", {
        "request": request,
        "user": user,
        "line_accounts": line_accounts
    })

@app.post("/api/admin/line-accounts")
async def create_line_account_by_admin(request: Request, data: CreateLineAccountRequest):
    """Create new LINE account (Admin only)"""
    user = app.state.auth.get_current_user(request)
    if not user or user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        # Admin can create account for any user, default to admin
        account_id = app.state.line_account_model.create_account(
            account_name=data.account_name,
            channel_id=data.channel_id,
            channel_secret=data.channel_secret,
            channel_access_token=data.channel_access_token,
            owner_id=user["user_id"],
            description=data.description
        )
        
        if account_id:
            await manager.broadcast({
                "type": "success",
                "message": f"เพิ่มบัญชี LINE {data.account_name} สำเร็จ"
            })
            # Generate webhook URL
            webhook_url = f"{request.base_url}webhook/line/{account_id}"
            return {"success": True, "message": "เพิ่มบัญชี LINE สำเร็จ", "account_id": account_id, "webhook_url": webhook_url}
        else:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "Channel ID นี้มีอยู่แล้ว"}
            )
    except Exception as e:
        logger.error(f"Error creating LINE account: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "เกิดข้อผิดพลาดในการเพิ่มบัญชี LINE"}
        )

@app.get("/api/admin/line-accounts")
async def get_all_line_accounts(request: Request):
    """Get all LINE accounts (Admin only)"""
    user = app.state.auth.get_current_user(request)
    if not user or user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        accounts = app.state.line_account_model.get_all_accounts()
        # Convert to JSON-serializable format
        result = []
        for acc in accounts:
            acc_dict = {
                "_id": str(acc.get("_id", "")),
                "account_name": acc.get("account_name", ""),
                "channel_id": acc.get("channel_id", ""),
                "is_active": acc.get("is_active", True),
                "owner_id": acc.get("owner_id", ""),
                "created_at": acc.get("created_at").isoformat() if acc.get("created_at") else None
            }
            result.append(acc_dict)
        return {"success": True, "accounts": result}
    except Exception as e:
        logger.error(f"Error fetching LINE accounts: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "เกิดข้อผิดพลาดในการโหลดข้อมูล"}
        )

@app.delete("/api/admin/line-accounts/{account_id}")
async def delete_line_account_by_admin(request: Request, account_id: str):
    """Delete LINE account (Admin only)"""
    user = app.state.auth.get_current_user(request)
    if not user or user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        success = app.state.line_account_model.delete_account(account_id)
        if success:
            await manager.broadcast({
                "type": "info",
                "message": "ลบบัญชี LINE สำเร็จ"
            })
            return {"success": True, "message": "ลบบัญชี LINE สำเร็จ"}
        else:
            return JSONResponse(
                status_code=500,
                content={"success": False, "message": "ไม่สามารถลบบัญชี LINE ได้"}
            )
    except Exception as e:
        logger.error(f"Error deleting LINE account: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "เกิดข้อผิดพลาดในการลบบัญชี LINE"}
        )

@app.post("/api/admin/line-accounts/{account_id}/test")
async def test_line_connection(request: Request, account_id: str):
    """Test LINE OA connection (Admin only)"""
    user = app.state.auth.get_current_user(request)
    if not user or user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        # Get LINE account
        account = app.state.line_account_model.get_account_by_id(account_id)
        if not account:
            return JSONResponse(
                status_code=404,
                content={"success": False, "message": "ไม่พบบัญชี LINE"}
            )
        
        access_token = account.get("channel_access_token", "")
        if not access_token:
            return {"success": False, "message": "ไม่พบ Channel Access Token"}
        
        # Test connection by getting bot info
        headers = {"Authorization": f"Bearer {access_token}"}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get("https://api.line.me/v2/bot/info", headers=headers)
                
                if response.status_code == 200:
                    bot_info = response.json()
                    
                    # Get quota status if owner exists
                    quota_status = None
                    owner_id = account.get("owner_id")
                    if owner_id:
                        try:
                            quota = app.state.subscription_model.check_quota(owner_id)
                            quota_status = {
                                "remaining": quota.get("slips_remaining", 0),
                                "quota_exceeded": not quota.get("has_quota", True),
                                "is_active": quota.get("is_active", False)
                            }
                        except:
                            pass
                    
                    return {
                        "success": True,
                        "message": "เชื่อมต่อสำเร็จ",
                        "bot_info": {
                            "displayName": bot_info.get("displayName", ""),
                            "userId": bot_info.get("userId", ""),
                            "pictureUrl": bot_info.get("pictureUrl", "")
                        },
                        "quota_status": quota_status
                    }
                elif response.status_code == 401:
                    return {"success": False, "message": "Token ไม่ถูกต้องหรือหมดอายุ"}
                else:
                    return {"success": False, "message": f"เกิดข้อผิดพลาด: HTTP {response.status_code}"}
        except httpx.TimeoutException:
            return {"success": False, "message": "หมดเวลาในการเชื่อมต่อ"}
        except httpx.ConnectError:
            return {"success": False, "message": "ไม่สามารถเชื่อมต่อ LINE API ได้"}
        except httpx.HTTPStatusError as e:
            return {"success": False, "message": f"เกิดข้อผิดพลาด: HTTP {e.response.status_code}"}
    except Exception as e:
        logger.error(f"Error testing LINE connection: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"เกิดข้อผิดพลาด: {str(e)}"}
        )

# ==================== User Routes ====================

@app.get("/user/dashboard", response_class=HTMLResponse)
async def user_dashboard(request: Request):
    """User dashboard"""
    user = app.state.auth.get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    
    # Prevent Admin from accessing User Dashboard
    if user["role"] == UserRole.ADMIN:
        return RedirectResponse(url="/admin/dashboard")
    
    line_accounts = app.state.line_account_model.get_accounts_by_owner(user["user_id"])
    
    # คำนวณสถิติสำหรับ dashboard
    total_line_accounts = len(line_accounts)
    total_users = 0
    messages_today = 0
    slips_verified = 0
    
    import pytz
    from datetime import datetime, timedelta
    bangkok_tz = pytz.timezone('Asia/Bangkok')
    today_start = datetime.now(bangkok_tz).replace(hour=0, minute=0, second=0, microsecond=0)
    
    for account in line_accounts:
        account_id = str(account["_id"])
        # นับจำนวนผู้ใช้
        total_users += len(app.state.chat_message_model.get_unique_users(account_id))
        # นับข้อความวันนี้
        messages = app.state.chat_message_model.get_messages(account_id, limit=1000)
        for msg in messages:
            try:
                msg_time = datetime.fromisoformat(msg["timestamp"])
                if msg_time.tzinfo is None:
                    msg_time = bangkok_tz.localize(msg_time)
                if msg_time >= today_start:
                    messages_today += 1
            except:
                pass
        # นับสลิปที่ตรวจสอบ
        slips_verified += account.get("slip_count", 0)
    
    # นับบัญชีธนาคาร
    bank_accounts_count = app.state.bank_account_model.collection.count_documents({
        "owner_id": user["user_id"]
    })
    
    return templates.TemplateResponse("user/dashboard.html", {
        "request": request,
        "user": user,
        "line_accounts": line_accounts,
        "total_line_accounts": total_line_accounts,
        "total_users": total_users,
        "messages_today": messages_today,
        "slips_verified": slips_verified,
        "bank_accounts_count": bank_accounts_count
    })

@app.get("/user/line-accounts", response_class=HTMLResponse)
async def user_line_accounts(request: Request):
    """User LINE accounts page"""
    user = app.state.auth.get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    
    # Get accounts based on role
    if user["role"] == UserRole.ADMIN:
        line_accounts = app.state.line_account_model.get_all_accounts(include_inactive=True)
    else:
        line_accounts = app.state.line_account_model.get_accounts_by_owner(user["user_id"])
    
    return templates.TemplateResponse("user/line_accounts.html", {
        "request": request,
        "user": user,
        "line_accounts": line_accounts
    })

@app.get("/user/line-accounts/add", response_class=HTMLResponse)
@app.get("/user/add-line-account", response_class=HTMLResponse)
async def add_line_account_page(request: Request):
    """Add LINE account page"""
    user = app.state.auth.get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    
    return templates.TemplateResponse("user/add_line_account.html", {
        "request": request,
        "user": user
    })

@app.post("/api/user/line-accounts")
async def create_line_account_api(request: Request, data: CreateLineAccountRequest):
    """Create new LINE account"""
    user = app.state.auth.get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    try:
        account_id = app.state.line_account_model.create_account(
            account_name=data.account_name,
            channel_id=data.channel_id,
            channel_secret=data.channel_secret,
            channel_access_token=data.channel_access_token,
            owner_id=user["user_id"],
            description=data.description
        )
        
        if account_id:
            await manager.broadcast({
                "type": "success",
                "message": f"เพิ่มบัญชี LINE {data.account_name} สำเร็จ"
            })
            # Generate webhook URL
            webhook_url = f"{request.base_url}webhook/line/{account_id}"
            return {"success": True, "message": "เพิ่มบัญชี LINE สำเร็จ", "account_id": account_id, "webhook_url": webhook_url}
        else:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "Channel ID นี้มีอยู่แล้ว"}
            )
    except Exception as e:
        logger.error(f"Error creating LINE account: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "เกิดข้อผิดพลาดในการเพิ่มบัญชี LINE"}
        )

@app.get("/user/line-accounts/{account_id}/settings", response_class=HTMLResponse)
async def line_account_settings_page(request: Request, account_id: str):
    """LINE account settings page"""
    user = app.state.auth.get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    
    account = app.state.line_account_model.get_account_by_id(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Check permission
    if user["role"] != UserRole.ADMIN and account["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    # แสดง API Key เป็น placeholder เพื่อความปลอดภัย
    if account.get("settings", {}).get("slip_api_key"):
        account["slip_api_key"] = "*" * 32  # แสดงเป็น placeholder
    else:
        account["slip_api_key"] = ""
    
    if account.get("settings", {}).get("ai_api_key"):
        account["ai_api_key"] = "*" * 32  # แสดงเป็น placeholder
    else:
        account["ai_api_key"] = ""
    
    return templates.TemplateResponse("user/line_account_settings.html", {
        "request": request,
        "user": user,
        "account": account
    })

@app.put("/api/user/line-accounts/{account_id}/settings")
async def update_line_account_settings_api(
    request: Request,
    account_id: str,
    data: UpdateLineAccountSettingsRequest
):
    """Update LINE account settings"""
    user = app.state.auth.get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    account = app.state.line_account_model.get_account_by_id(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    if user["role"] != UserRole.ADMIN and account["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        update_data = {}
        settings = account.get("settings", {})
        
        # Update account fields
        if data.name is not None:
            update_data["account_name"] = data.name
        if data.is_active is not None:
            update_data["is_active"] = data.is_active
        
        # Update AI settings
        if data.ai_enabled is not None:
            settings["ai_enabled"] = data.ai_enabled
        if data.ai_model is not None:
            settings["ai_model"] = data.ai_model
        if data.ai_system_prompt is not None:
            settings["ai_system_prompt"] = data.ai_system_prompt
        if data.ai_temperature is not None:
            settings["ai_temperature"] = data.ai_temperature
        if data.ai_fallback_message is not None:
            settings["ai_fallback_message"] = data.ai_fallback_message
        if data.ai_response_mode is not None:
            settings["ai_response_mode"] = data.ai_response_mode
        if data.ai_immediate_message is not None:
            settings["ai_immediate_message"] = data.ai_immediate_message
        
        # Update slip verification settings
        if data.slip_verification_enabled is not None:
            settings["slip_verification_enabled"] = data.slip_verification_enabled
        if data.slip_template_id is not None:
            settings["slip_template_id"] = data.slip_template_id
        if data.slip_response_mode is not None:
            settings["slip_response_mode"] = data.slip_response_mode
        if data.slip_immediate_message is not None:
            settings["slip_immediate_message"] = data.slip_immediate_message
        
        update_data["settings"] = settings
        update_data["updated_at"] = datetime.utcnow()
        
        # Update account in database
        from bson import ObjectId
        result = app.state.line_account_model.collection.update_one(
            {"_id": ObjectId(account_id)},
            {"$set": update_data}
        )
        success = result.modified_count > 0 or result.matched_count > 0
        
        # Always return success if matched (even if not modified)
        logger.info(f"✅ Settings updated - matched: {result.matched_count}, modified: {result.modified_count}")
        await manager.broadcast({
            "type": "success",
            "message": "อัปเดตการตั้งค่าสำเร็จ"
        })
        return {"success": True, "message": "บันทึกการตั้งค่าสำเร็จ"}
    except Exception as e:
        logger.error(f"❌ Error updating settings: {e}", exc_info=True)
        return {"success": False, "message": f"เกิดข้อผิดพลาด: {str(e)}"}

# ==================== WebSocket ====================

@app.websocket("/ws/notifications")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time notifications"""
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(websocket)

# ==================== Health Check ====================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "ready": IS_READY,
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/error-code-guide", response_class=HTMLResponse)
async def error_code_guide(request: Request):
    """Error Code Guide page"""
    user = app.state.auth.get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    
    return templates.TemplateResponse("error_code_guide.html", {
        "request": request,
        "user": user
    })

@app.get("/advanced-settings/{channel_id}", response_class=HTMLResponse)
@app.get("/admin/advanced-settings", response_class=HTMLResponse)
async def advanced_settings(request: Request, channel_id: str = None):
    """Advanced settings page"""
    user = app.state.auth.get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    
    # If admin route without channel_id, show system-wide settings
    if channel_id is None:
        if user["role"] != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        # Get all error codes
        error_codes = app.state.error_code_model.get_all_error_codes()
        
        return templates.TemplateResponse("settings/advanced_settings.html", {
            "request": request,
            "user": user,
            "account": None,
            "error_codes": error_codes,
            "custom_error_messages": {},
            "response_messages": {}
        })
    
    # Get specific account settings
    account = app.state.line_account_model.get_account_by_channel_id(channel_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Check permission
    if user["role"] != UserRole.ADMIN and account["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    # Get error codes
    error_codes = app.state.error_code_model.get_all_error_codes()
    
    # Get custom error messages
    custom_error_messages = {}
    for code_info in error_codes:
        custom_msg = app.state.error_code_model.get_custom_message(channel_id, code_info["code"])
        if custom_msg:
            custom_error_messages[code_info["code"]] = custom_msg
    
    # Get response messages
    response_messages = {}
    for msg_type in ["system_closed", "welcome", "fallback"]:
        msg = app.state.response_message_model.get_message(channel_id, msg_type)
        if msg:
            response_messages[msg_type] = msg
    
    return templates.TemplateResponse("settings/advanced_settings.html", {
        "request": request,
        "user": user,
        "account": account,
        "error_codes": error_codes,
        "custom_error_messages": custom_error_messages,
        "response_messages": response_messages
    })

@app.post("/api/response-messages")
async def save_response_messages(request: Request):
    """Save response messages"""
    user = app.state.auth.get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    try:
        data = await request.json()
        account_id = data.get("account_id")
        
        # Check permission
        account = app.state.line_account_model.get_account_by_channel_id(account_id)
        if not account:
            return JSONResponse(
                status_code=404,
                content={"success": False, "message": "ไม่พบบัญชี"}
            )
        
        if user["role"] != UserRole.ADMIN and account["owner_id"] != user["user_id"]:
            return JSONResponse(
                status_code=403,
                content={"success": False, "message": "ไม่มีสิทธิ์"}
            )
        
        # Save messages
        for msg_type in ["system_closed", "welcome", "fallback"]:
            if msg_type in data:
                message = data[msg_type]
                enabled = message != "0" and message != ""
                app.state.response_message_model.set_message(
                    account_id, msg_type, message, enabled
                )
        
        await manager.broadcast({
            "type": "success",
            "message": "บันทึกการตั้งค่าข้อความสำเร็จ"
        })
        
        return {"success": True, "message": "บันทึกสำเร็จ"}
    except Exception as e:
        logger.error(f"Error saving response messages: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": str(e)}
        )

@app.post("/api/error-codes")
async def save_error_codes(request: Request):
    """Save error code messages"""
    user = app.state.auth.get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    try:
        data = await request.json()
        account_id = data.get("account_id")
        
        # Check permission
        account = app.state.line_account_model.get_account_by_channel_id(account_id)
        if not account:
            return JSONResponse(
                status_code=404,
                content={"success": False, "message": "ไม่พบบัญชี"}
            )
        
        if user["role"] != UserRole.ADMIN and account["owner_id"] != user["user_id"]:
            return JSONResponse(
                status_code=403,
                content={"success": False, "message": "ไม่มีสิทธิ์"}
            )
        
        # Save error code messages
        for key, value in data.items():
            if key.startswith("error_"):
                error_code = key.replace("error_", "")
                if value:  # Only save if not empty
                    app.state.error_code_model.set_custom_message(
                        account_id, error_code, value
                    )
        
        await manager.broadcast({
            "type": "success",
            "message": "บันทึกการตั้งค่า Error Codes สำเร็จ"
        })
        
        return {"success": True, "message": "บันทึกสำเร็จ"}
    except Exception as e:
        logger.error(f"Error saving error codes: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": str(e)}
        )

@app.get("/api/status")
async def system_status(request: Request):
    """System status endpoint"""
    user = app.state.auth.get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    db_status = get_database().test_connection()
    
    return {
        "system": {
            "ready": IS_READY,
            "version": "2.0.0"
        },
        "database": db_status,
        "statistics": {
            "total_users": len(app.state.user_model.get_all_users()),
            "total_line_accounts": len(app.state.line_account_model.get_all_accounts()),
            "active_websockets": len(manager.active_connections)
        }
    }

if __name__ == "__main__":
    import uvicorn
    logger.info(f"🚀 Starting server on {settings.HOST}:{settings.PORT}")
    uvicorn.run(
        app, 
        host=settings.HOST, 
        port=settings.PORT,
        log_level=settings.LOG_LEVEL.lower()
    )

# ==================== LINE Webhook ====================

@app.post("/webhook/line/{account_id}")
async def line_webhook(request: Request, account_id: str):
    """LINE Webhook endpoint for receiving messages"""
    try:
        # Get LINE account by ID
        account = app.state.line_account_model.get_account_by_id(account_id)
        if not account:
            logger.error(f"❌ LINE account not found: {account_id}")
            raise HTTPException(status_code=404, detail="Account not found")
        
        # Verify signature
        signature = request.headers.get("X-Line-Signature")
        body = await request.body()
        
        # Validate signature
        channel_secret = account["channel_secret"]
        hash_digest = hmac.new(
            channel_secret.encode('utf-8'),
            body,
            hashlib.sha256
        ).digest()
        expected_signature = base64.b64encode(hash_digest).decode('utf-8')
        
        if signature != expected_signature:
            logger.error(f"❌ Invalid signature for channel: {channel_id}")
            raise HTTPException(status_code=400, detail="Invalid signature")
        
        # Parse webhook data
        webhook_data = json.loads(body.decode('utf-8'))
        events = webhook_data.get("events", [])
        
        # Update webhook timestamp
        app.state.line_account_model.update_webhook_timestamp(account["_id"])
        
        # Process each event
        for event in events:
            await process_line_event(event, account)
        
        return {"status": "ok"}
        
    except Exception as e:
        logger.error(f"❌ Webhook error: {e}")
        return {"status": "error", "message": str(e)}

async def process_line_event(event: Dict[str, Any], account: Dict[str, Any]):
    """Process LINE event"""
    try:
        event_type = event.get("type")
        
        if event_type == "message":
            await handle_message_event(event, account)
        elif event_type == "follow":
            await handle_follow_event(event, account)
        elif event_type == "unfollow":
            await handle_unfollow_event(event, account)
        else:
            logger.info(f"Unhandled event type: {event_type}")
            
    except Exception as e:
        logger.error(f"❌ Error processing event: {e}")

async def handle_message_event(event: Dict[str, Any], account: Dict[str, Any]):
    """Handle message event"""
    try:
        message = event.get("message", {})
        message_type = message.get("type")
        reply_token = event.get("replyToken")
        user_id = event["source"]["userId"]
        
        # Update statistics
        app.state.line_account_model.increment_message_count(account["_id"])
        
        if message_type == "text":
            # Handle text message
            text = message.get("text", "")
            await handle_text_message(text, reply_token, user_id, account)
            
        elif message_type == "image":
            # Handle image message (slip verification)
            message_id = message.get("id")
            await handle_image_message(message_id, reply_token, user_id, account)
            
    except Exception as e:
        logger.error(f"❌ Error handling message event: {e}")

async def handle_text_message(text: str, reply_token: str, user_id: str, account: Dict[str, Any]):
    """Handle text message with AI"""
    try:
        # Save user message
        app.state.chat_message_model.save_message(
            account_id=account["_id"],
            user_id=user_id,
            message_type="text",
            content=text,
            sender="user"
        )
        
        settings = account.get("settings", {})
        
        # Check if AI is enabled
        if settings.get("ai_enabled", False):
            # Get AI response
            ai_api_key = settings.get("ai_api_key")
            ai_model = settings.get("ai_model", "gpt-4.1-mini")
            ai_system_prompt = settings.get("ai_system_prompt", "คุณเป็นผู้ช่วยที่เป็นมิตรและให้ข้อมูลที่เป็นประโยชน์")
            ai_temperature = settings.get("ai_temperature", 0.7)
            ai_fallback_message = settings.get("ai_fallback_message", "ขอบคุณสำหรับข้อความของคุณ")
            
            response_text = None
            try:
                if ai_api_key:
                    # Use account-specific AI settings
                    response_text = await get_chat_response_async(
                        text,
                        personality=ai_system_prompt,
                        model=ai_model,
                        api_key=ai_api_key,
                        temperature=ai_temperature
                    )
                else:
                    # Use default AI settings
                    response_text = await get_chat_response_async(text)
            except Exception as ai_error:
                logger.warning(f"⚠️ AI response failed: {ai_error}")
                # ใช้ fallback message
                if ai_fallback_message and ai_fallback_message != "0":
                    response_text = ai_fallback_message
                else:
                    response_text = None  # ไม่ตอบกลับ
        else:
            # AI ปิด - ใช้ fallback message
            ai_fallback_message = settings.get("ai_fallback_message", "ขอบคุณสำหรับข้อความของคุณ")
            if ai_fallback_message and ai_fallback_message != "0":
                response_text = ai_fallback_message
            else:
                response_text = None  # ไม่ตอบกลับ
        
        # Save and send bot response only if response_text is not None
        if response_text:
            app.state.chat_message_model.save_message(
                account_id=account["_id"],
                user_id=user_id,
                message_type="text",
                content=response_text,
                sender="bot"
            )
            
            # Send reply
            await send_line_reply(reply_token, response_text, account["channel_access_token"])
        else:
            logger.info("🔕 AI fallback set to 0 - no response sent")
        
    except Exception as e:
        logger.error(f"❌ Error handling text message: {e}")

async def handle_image_message(message_id: str, reply_token: str, user_id: str, account: Dict[str, Any]):
    """
    Handle image message (slip verification) with Two-Phase Commit
    
    Flow:
    1. Pre-screening: ตรวจสอบไฟล์ก่อน (ไม่เสียโควต้า)
    2. Quota Reservation: จองโควต้าก่อนยิง API
    3. Bank Verification: ตรวจสอบกับ Thunder API
    4. Finalization: Confirm หรือ Rollback ตามผลลัพธ์
    5. Reply: ส่งผลลัพธ์กลับไปยังลูกค้า
    """
    reservation_id = None  # Track for emergency rollback
    
    try:
        settings = account.get("settings", {})
        owner_id = account.get("owner_id")
        system_settings = app.state.system_settings_model.get_settings()
        
        # ═══════════════════════════════════════════════════════════════════
        # PHASE 0: CHECK SETTINGS
        # ═══════════════════════════════════════════════════════════════════
        
        # Check if slip verification is enabled
        if not settings.get("slip_verification_enabled", False):
            await send_line_reply(
                reply_token,
                "ระบบตรวจสอบสลิปยังไม่เปิดใช้งาน",
                account["channel_access_token"]
            )
            return
        
        # ═══════════════════════════════════════════════════════════════════
        # PHASE 1: DOWNLOAD & PRE-SCREENING
        # ═══════════════════════════════════════════════════════════════════
        
        # Download image from LINE using async httpx
        image_data = None
        image_url = f"https://api-data.line.me/v2/bot/message/{message_id}/content"
        try:
            headers = {"Authorization": f"Bearer {account['channel_access_token']}"}
            logger.info(f"📥 Downloading image from LINE: {image_url}")
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(image_url, headers=headers)
                response.raise_for_status()
                image_data = response.content
                logger.info(f"✅ Downloaded image from LINE: {len(image_data)} bytes, content-type: {response.headers.get('content-type', 'unknown')}")
        except httpx.HTTPStatusError as e:
            logger.error(f"❌ HTTP Error downloading image from LINE: {e.response.status_code} - {e.response.text[:200]}")
            await send_line_reply(
                reply_token,
                f"❌ ไม่สามารถดาวน์โหลดรูปภาพได้ (HTTP {e.response.status_code}) กรุณาลองใหม่อีกครั้ง",
                account["channel_access_token"]
            )
            return
        except httpx.TimeoutException as e:
            logger.error(f"❌ Timeout downloading image from LINE: {e}")
            await send_line_reply(
                reply_token,
                "❌ การดาวน์โหลดรูปภาพใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง",
                account["channel_access_token"]
            )
            return
        except Exception as e:
            logger.error(f"❌ Error downloading image from LINE: {e}", exc_info=True)
            await send_line_reply(
                reply_token,
                "❌ ไม่สามารถดาวน์โหลดรูปภาพได้ กรุณาลองใหม่อีกครั้ง",
                account["channel_access_token"]
            )
            return
        
        # Save image message to database
        import base64
        image_base64 = base64.b64encode(image_data).decode('utf-8') if image_data else None
        
        app.state.chat_message_model.save_message(
            account_id=account["_id"],
            user_id=user_id,
            message_type="image",
            content="[รูปภาพ]",
            message_id=message_id,
            media_url=image_url,
            sender="user",
            metadata={"image_data": image_base64}
        )
        
        # Pre-screening: Validate image before API call
        validation_result = validate_slip_image(image_data, system_settings)
        
        if not validation_result["valid"]:
            # Invalid image - no quota deduction
            error_template = get_error_template(validation_result["error_code"], system_settings)
            error_message = validation_result.get("error_message") or error_template.get("message", "รูปภาพไม่ถูกต้อง")
            
            await send_line_reply(
                reply_token,
                f"📷 {error_message}",
                account["channel_access_token"]
            )
            logger.warning(f"⚠️ Pre-screening failed: {validation_result['error_code']} - No quota deducted")
            return
        
        logger.info(f"✅ Pre-screening passed: {validation_result['image_info']}")
        
        # ═══════════════════════════════════════════════════════════════════
        # PHASE 2: QUOTA RESERVATION (Two-Phase Commit)
        # ═══════════════════════════════════════════════════════════════════
        
        if owner_id:
            # Reserve quota before calling API
            reservation = app.state.quota_reservation_model.reserve_quota(
                user_id=owner_id,
                purpose="slip_verification",
                message_id=message_id,
                metadata={
                    "account_id": account["_id"],
                    "line_user_id": user_id,
                    "image_size": len(image_data)
                }
            )
            
            if not reservation:
                # No quota available - don't call API (save money!)
                logger.warning(f"⚠️ No quota available for user {owner_id} - API not called")
                
                # Get quota info for display
                quota_status = app.state.subscription_model.check_quota(owner_id)
                total_slips = quota_status.get("total_slips", 0)
                total_used = quota_status.get("total_used", 0)
                
                # Get contact info from settings
                contact_line = system_settings.get("contact_admin_line", "")
                contact_url = system_settings.get("contact_admin_url", "")
                flex_button_text = system_settings.get("quota_exceeded_flex_button_text", "ติดต่อแอดมิน")
                flex_button_url = system_settings.get("quota_exceeded_flex_button_url", "") or contact_url
                
                # 🎨 Create Beautiful Quota Exceeded Flex Message
                flex_contents = {
                    "type": "bubble",
                    "size": "mega",
                    "header": {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {
                                "type": "box",
                                "layout": "horizontal",
                                "contents": [
                                    {
                                        "type": "box",
                                        "layout": "vertical",
                                        "contents": [
                                            {
                                                "type": "text",
                                                "text": "⚠️",
                                                "size": "xxl",
                                                "align": "center"
                                            }
                                        ],
                                        "width": "60px",
                                        "height": "60px",
                                        "backgroundColor": "#FEF3CD",
                                        "cornerRadius": "30px",
                                        "justifyContent": "center",
                                        "alignItems": "center"
                                    },
                                    {
                                        "type": "box",
                                        "layout": "vertical",
                                        "contents": [
                                            {
                                                "type": "text",
                                                "text": "โควต้าหมด",
                                                "weight": "bold",
                                                "size": "xl",
                                                "color": "#856404"
                                            },
                                            {
                                                "type": "text",
                                                "text": "Quota Exceeded",
                                                "size": "sm",
                                                "color": "#9A8866"
                                            }
                                        ],
                                        "paddingStart": "15px",
                                        "justifyContent": "center"
                                    }
                                ],
                                "paddingAll": "15px"
                            }
                        ],
                        "backgroundColor": "#FFF8E7",
                        "paddingAll": "0px"
                    },
                    "body": {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {
                                "type": "text",
                                "text": "สิทธิ์การตรวจสอบสลิปของร้านค้าหมดแล้ว",
                                "wrap": True,
                                "weight": "bold",
                                "size": "md",
                                "color": "#333333"
                            },
                            {
                                "type": "text",
                                "text": "กรุณาติดต่อแอดมินเพื่ออัปเกรดแพ็คเกจ",
                                "wrap": True,
                                "size": "sm",
                                "color": "#666666",
                                "margin": "sm"
                            },
                            {
                                "type": "separator",
                                "margin": "lg"
                            },
                            {
                                "type": "box",
                                "layout": "vertical",
                                "contents": [
                                    {
                                        "type": "box",
                                        "layout": "horizontal",
                                        "contents": [
                                            {
                                                "type": "text",
                                                "text": "📊 สถานะโควต้า",
                                                "size": "sm",
                                                "color": "#888888",
                                                "flex": 1
                                            }
                                        ]
                                    },
                                    {
                                        "type": "box",
                                        "layout": "horizontal",
                                        "contents": [
                                            {
                                                "type": "text",
                                                "text": "ใช้ไปแล้ว",
                                                "size": "sm",
                                                "color": "#666666",
                                                "flex": 1
                                            },
                                            {
                                                "type": "text",
                                                "text": f"{total_used:,} สลิป",
                                                "size": "sm",
                                                "color": "#DC3545",
                                                "weight": "bold",
                                                "align": "end"
                                            }
                                        ],
                                        "margin": "sm"
                                    },
                                    {
                                        "type": "box",
                                        "layout": "horizontal",
                                        "contents": [
                                            {
                                                "type": "text",
                                                "text": "โควต้าทั้งหมด",
                                                "size": "sm",
                                                "color": "#666666",
                                                "flex": 1
                                            },
                                            {
                                                "type": "text",
                                                "text": f"{total_slips:,} สลิป",
                                                "size": "sm",
                                                "color": "#333333",
                                                "weight": "bold",
                                                "align": "end"
                                            }
                                        ],
                                        "margin": "sm"
                                    },
                                    {
                                        "type": "box",
                                        "layout": "horizontal",
                                        "contents": [
                                            {
                                                "type": "text",
                                                "text": "คงเหลือ",
                                                "size": "sm",
                                                "color": "#666666",
                                                "flex": 1
                                            },
                                            {
                                                "type": "text",
                                                "text": "0 สลิป",
                                                "size": "sm",
                                                "color": "#DC3545",
                                                "weight": "bold",
                                                "align": "end"
                                            }
                                        ],
                                        "margin": "sm"
                                    }
                                ],
                                "margin": "lg",
                                "backgroundColor": "#F8F9FA",
                                "cornerRadius": "8px",
                                "paddingAll": "12px"
                            }
                        ],
                        "paddingAll": "20px"
                    },
                    "footer": {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {
                                "type": "button",
                                "action": {
                                    "type": "uri",
                                    "label": flex_button_text,
                                    "uri": flex_button_url if flex_button_url else "https://line.me"
                                },
                                "style": "primary",
                                "color": "#F59E0B",
                                "height": "md"
                            }
                        ],
                        "paddingAll": "15px"
                    },
                    "styles": {
                        "header": {
                            "separator": False
                        },
                        "footer": {
                            "separator": True
                        }
                    }
                }
                
                # Remove footer if no button URL
                if not flex_button_url:
                    del flex_contents["footer"]
                    del flex_contents["styles"]
                
                try:
                    url = "https://api.line.me/v2/bot/message/reply"
                    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {account['channel_access_token']}"}
                    data = {"replyToken": reply_token, "messages": [{"type": "flex", "altText": "⚠️ โควต้าหมด - กรุณาติดต่อแอดมิน", "contents": flex_contents}]}
                    async with httpx.AsyncClient() as client:
                        response = await client.post(url, headers=headers, json=data)
                        logger.info(f"📤 Quota exceeded flex sent: {response.status_code}")
                except Exception as e:
                    logger.error(f"Error sending quota exceeded flex: {e}")
                    # Fallback to text message
                    quota_message = system_settings.get("quota_exceeded_message", "⚠️ สิทธิ์การตรวจสอบสลิปของร้านค้าหมดแล้ว กรุณาติดต่อแอดมิน")
                    await send_line_reply(reply_token, quota_message, account["channel_access_token"])
                
                return
            
            reservation_id = reservation["reservation_id"]
            logger.info(f"✅ Quota reserved: {reservation_id} (available after: {reservation.get('available_after', '?')})")
        
        # ═══════════════════════════════════════════════════════════════════
        # PHASE 3: SEND PROCESSING MESSAGE & CALL API
        # ═══════════════════════════════════════════════════════════════════
        
        # Send processing message using push (to preserve reply_token for result)
        # Note: reply_token can only be used once, so we use push for processing message
        processing_msg = settings.get("slip_immediate_message", "⏳ กำลังตรวจสอบสลิป กรุณารอสักครู่...")
        try:
            await send_line_push(user_id, processing_msg, account["channel_access_token"])
            logger.info("✅ Processing message sent via push")
        except Exception as push_error:
            # If push fails (user not added bot), try reply token as fallback
            logger.warning(f"⚠️ Push message failed, using reply token: {push_error}")
            try:
                await send_line_reply(reply_token, processing_msg, account["channel_access_token"])
                logger.info("✅ Processing message sent via reply (reply_token will be consumed)")
                # Mark reply_token as used so we use push for result
                reply_token = None
            except Exception as reply_error:
                logger.error(f"❌ Both push and reply failed for processing message: {reply_error}")
        
        # Get API settings - ใช้ API key จาก system_settings (แอดมินกลาง) เป็นหลัก
        # ถ้าไม่มีใน system_settings จะ fallback ไปใช้จาก account settings
        slip_api_key = system_settings.get("slip_api_key") or settings.get("slip_api_key")
        slip_api_provider = system_settings.get("slip_api_provider") or settings.get("slip_api_provider", "thunder")
        
        logger.info(f"🔑 API Key source: {'system_settings' if system_settings.get('slip_api_key') else 'account_settings'}")
        
        if not slip_api_key:
            # Rollback quota if no API key
            if reservation_id:
                app.state.quota_reservation_model.rollback_reservation(reservation_id, "no_api_key")
            await send_line_push(user_id, "❌ ยังไม่ได้ตั้งค่า API Key สำหรับตรวจสอบสลิป", account["channel_access_token"])
            return
        
        # Call Thunder API
        logger.info(f"🔍 Starting slip verification: message_id={message_id}, image_size={len(image_data) if image_data else 0} bytes")
        logger.info(f"🔑 API Key present: {bool(slip_api_key)}, Provider: {slip_api_provider}")
        logger.info(f"📱 LINE Token present: {bool(account.get('channel_access_token'))}")
        slip_checker = SlipChecker(api_token=slip_api_key, line_token=account["channel_access_token"])
        
        try:
            # Explicitly pass tokens to ensure they're used correctly
            result = slip_checker.verify_slip(
                message_id=message_id,
                test_image_data=image_data,
                line_token=account["channel_access_token"],
                api_token=slip_api_key,
                provider=slip_api_provider
            )
            
            # Log result for debugging
            if result:
                logger.info(f"📊 Verification result received: status={result.get('status')}, message={result.get('message', '')[:100]}")
            else:
                logger.error("❌ Verification returned None or empty result")
                result = {"status": "error", "message": "ไม่ได้รับผลลัพธ์จากการตรวจสอบสลิป"}
        except Exception as api_error:
            # API Error - Rollback quota
            if reservation_id:
                app.state.quota_reservation_model.rollback_reservation(reservation_id, f"api_error: {str(api_error)}")
            logger.error(f"❌ API Error: {api_error}", exc_info=True)
            
            # สร้าง result object เพื่อให้สามารถใช้ template ได้
            error_msg = f"❌ เกิดข้อผิดพลาดในการตรวจสอบสลิป: {str(api_error)[:100]}"
            result = {
                "status": "error",
                "message": error_msg,
                "use_template": _is_token_or_api_expired_error(error_msg)
            }
            
            # ส่งผลลัพธ์ผ่าน send_slip_result เพื่อให้ใช้ template ได้
            slip_template_id = settings.get("slip_template_id")
            try:
                if reply_token:
                    await send_slip_result_reply(reply_token, result, account["channel_access_token"], account.get("channel_id"), slip_template_id)
                else:
                    await send_slip_result(user_id, result, account["channel_access_token"], account.get("channel_id"), slip_template_id)
            except Exception as send_error:
                logger.error(f"❌ Failed to send error message: {send_error}")
                # Fallback to simple push message
                try:
                    await send_line_push(user_id, error_msg, account["channel_access_token"])
                except Exception as push_error:
                    logger.error(f"❌ Failed to send error message via push: {push_error}")
            return
        
        # Try fallback if enabled and primary failed
        fallback_enabled = system_settings.get("slip_api_fallback_enabled", False)
        secondary_api_key = system_settings.get("slip_api_key_secondary", "")
        
        if (result.get("status") == "error" and fallback_enabled and secondary_api_key and
            "quota" not in result.get("message", "").lower() and "expired" not in result.get("message", "").lower()):
            logger.warning(f"⚠️ Primary API failed, trying fallback...")
            try:
                from services.slip_checker import verify_slip_with_thunder
                fallback_result = verify_slip_with_thunder(
                    message_id=message_id,
                    test_image_data=image_data,
                    line_token=account["channel_access_token"],
                    api_token=secondary_api_key
                )
                if fallback_result.get("status") in ["success", "duplicate"]:
                    result = fallback_result
                    result["used_fallback"] = True
                    logger.info("✅ Fallback API succeeded!")
            except Exception as fallback_error:
                logger.error(f"❌ Fallback also failed: {fallback_error}")
        
        logger.info(f"📊 Verification result: status={result.get('status')}")
        
        # Validate result
        if not result:
            logger.error("❌ Verification returned None or empty result")
            if reservation_id:
                app.state.quota_reservation_model.rollback_reservation(reservation_id, "empty_result")
            
            # สร้าง result object เพื่อให้สามารถใช้ template ได้
            error_msg = "❌ ไม่ได้รับผลลัพธ์จากการตรวจสอบสลิป กรุณาลองใหม่"
            result = {
                "status": "error",
                "message": error_msg,
                "use_template": False  # ไม่ใช่ token expired error
            }
            
            # ส่งผลลัพธ์ผ่าน send_slip_result
            slip_template_id = settings.get("slip_template_id")
            try:
                if reply_token:
                    await send_slip_result_reply(reply_token, result, account["channel_access_token"], account.get("channel_id"), slip_template_id)
                else:
                    await send_slip_result(user_id, result, account["channel_access_token"], account.get("channel_id"), slip_template_id)
            except Exception as send_error:
                logger.error(f"❌ Failed to send error message: {send_error}")
                # Fallback to simple push message
                try:
                    await send_line_push(user_id, error_msg, account["channel_access_token"])
                except Exception as push_error:
                    logger.error(f"❌ Failed to send error message via push: {push_error}")
            return
        
        # ═══════════════════════════════════════════════════════════════════
        # PHASE 4: FINALIZATION (Commit or Rollback)
        # ═══════════════════════════════════════════════════════════════════
        
        status = result.get("status")
        result_data = result.get("data", {}) or {}
        trans_ref = result_data.get("transRef", result_data.get("reference", ""))
        
        # Extract amount - handle different formats
        amount_raw = result_data.get("amount", 0)
        if isinstance(amount_raw, dict):
            # If amount is a dict, extract the value
            amount = amount_raw.get("amount", amount_raw.get("raw", 0))
        elif isinstance(amount_raw, str):
            # If amount is a string, try to convert to float
            try:
                amount = float(amount_raw.replace(",", ""))
            except (ValueError, AttributeError):
                amount = 0
        else:
            amount = amount_raw or 0
        
        # Log detailed result for debugging
        logger.info(f"📋 Result details: status={status}, trans_ref={trans_ref}, amount={amount}, amount_type={type(amount)}")
        
        if status == "success":
            # ✅ SUCCESS: Confirm quota
            if reservation_id:
                app.state.quota_reservation_model.confirm_reservation(reservation_id)
                logger.info(f"✅ Quota confirmed for reservation {reservation_id}")
            
            # Record transaction
            app.state.slip_history_model.record_slip(
                account_id=account["_id"],
                user_id=user_id,
                trans_ref=trans_ref,
                amount=float(amount) if amount else 0,
                status="success",
                metadata={"message_id": message_id, "reservation_id": reservation_id}
            )
            
            # Update statistics
            app.state.line_account_model.increment_slip_count(account["_id"])
            result_text = "✅ สลิปถูกต้อง"
            
        elif status == "duplicate":
            # 🔄 DUPLICATE FROM API: แต่เราต้องตรวจสอบว่าซ้ำสำหรับ USER นี้หรือไม่
            # เพราะ API อาจบอกว่าซ้ำแบบ global แต่ user นี้อาจเพิ่งส่งครั้งแรก
            
            # ตรวจสอบซ้ำแบบ per-LINE-user (ไม่ใช่ per-account)
            duplicate_info = app.state.slip_history_model.is_duplicate_for_user(
                trans_ref=trans_ref,
                account_id=account["_id"],
                user_id=user_id
            )
            
            is_duplicate_for_this_user = duplicate_info["is_duplicate"]
            user_duplicate_count = duplicate_info["user_count"]
            total_account_usage = duplicate_info["total_account_count"]
            
            logger.info(f"📊 Duplicate check: user_dup={is_duplicate_for_this_user}, user_count={user_duplicate_count}, total={total_account_usage}")
            
            # Check if duplicate refund is enabled
            duplicate_refund_enabled = system_settings.get("duplicate_refund_enabled", True)
            
            if is_duplicate_for_this_user:
                # ❌ ซ้ำจริงสำหรับ user นี้ - เคยส่งสลิปนี้มาแล้ว
                result["duplicate_count"] = user_duplicate_count + 1
                result["is_user_duplicate"] = True
                
                if duplicate_refund_enabled and reservation_id:
                    # Rollback quota (คืนเครดิต)
                    app.state.quota_reservation_model.rollback_reservation(reservation_id, "duplicate_same_user")
                    result["quota_refunded"] = True
                    logger.info(f"🔄 Quota refunded for duplicate slip from same user (reservation: {reservation_id})")
                elif reservation_id:
                    # Confirm quota (ไม่คืนเครดิต)
                    app.state.quota_reservation_model.confirm_reservation(reservation_id)
                    result["quota_refunded"] = False
                    logger.info(f"⚠️ Quota NOT refunded for duplicate (setting disabled)")
                
                # Record duplicate
                app.state.slip_history_model.record_slip(
                    account_id=account["_id"],
                    user_id=user_id,
                    trans_ref=trans_ref,
                    amount=float(amount) if amount else 0,
                    status="duplicate",
                    metadata={
                        "message_id": message_id, 
                        "user_duplicate_count": user_duplicate_count + 1,
                        "total_account_usage": total_account_usage + 1,
                        "refunded": duplicate_refund_enabled
                    }
                )
                
                result_text = f"🔄 สลิปซ้ำ (คุณใช้สลิปนี้ไปแล้ว {user_duplicate_count + 1} ครั้ง)"
                if duplicate_refund_enabled:
                    result_text += " - ไม่หักเครดิต"
            else:
                # ✅ ไม่ซ้ำสำหรับ user นี้ - แม้ API บอกว่าซ้ำ แต่คนละ LINE user
                # ถือว่า SUCCESS เพราะ user นี้เพิ่งส่งครั้งแรก
                result["status"] = "success"  # Override status
                result["duplicate_count"] = 0
                result["is_user_duplicate"] = False
                result["note"] = "API reported duplicate but this is first submission for this LINE user"
                
                # Confirm quota (ตัดเครดิตปกติ)
                if reservation_id:
                    app.state.quota_reservation_model.confirm_reservation(reservation_id)
                    logger.info(f"✅ Quota confirmed - different LINE user, first submission (reservation: {reservation_id})")
                
                # Record as success for this user
                app.state.slip_history_model.record_slip(
                    account_id=account["_id"],
                    user_id=user_id,
                    trans_ref=trans_ref,
                    amount=float(amount) if amount else 0,
                    status="success",
                    metadata={
                        "message_id": message_id,
                        "reservation_id": reservation_id,
                        "api_reported_duplicate": True,
                        "first_for_user": True,
                        "total_account_usage": total_account_usage + 1
                    }
                )
                
                # Update statistics
                app.state.line_account_model.increment_slip_count(account["_id"])
                result_text = "✅ สลิปถูกต้อง"
                status = "success"  # Update status for reply logic
            
        elif status in ["not_found", "qr_not_found"]:
            # 🔍 QR NOT FOUND: Rollback quota (แจ้งแบบเดิม - ไม่ใช้ template)
            if reservation_id:
                app.state.quota_reservation_model.rollback_reservation(reservation_id, status)
                logger.info(f"🔄 Quota refunded for {status} (reservation: {reservation_id})")
            
            result_text = result.get("message", "ไม่พบ QR Code ในรูปภาพ กรุณาถ่ายรูปใหม่")
            
        else:
            # ❌ ERROR: ตรวจสอบว่าเป็น token/API หมดอายุหรือรูปไม่ชัด
            error_message = result.get("message", "เกิดข้อผิดพลาดในการตรวจสอบ")
            is_token_expired = _is_token_or_api_expired_error(error_message)
            
            if reservation_id:
                app.state.quota_reservation_model.rollback_reservation(reservation_id, f"error: {status}")
                logger.info(f"🔄 Quota refunded for error (reservation: {reservation_id})")
            
            if is_token_expired:
                # Token/API หมดอายุ - ใช้ template จากหลังบ้าน
                # ใช้ข้อความทั่วไป "API หมดอายุ" สำหรับผู้ใช้
                result["message"] = "API หมดอายุ"  # ข้อความที่แสดงใน LINE
                result_text = "API หมดอายุ"
                result["use_template"] = True  # Flag เพื่อบอกให้ใช้ template
                
                # บันทึก error detail ไว้ใน metadata สำหรับแสดงในหน้าแอดมิน
                error_detail = result.get("error_detail", error_message)
                error_type = result.get("error_type", "api_expired")
                api_provider = result.get("api_provider", "unknown")
                
                logger.info(f"🔑 Token/API expired error detected - Detail: {error_detail}, Provider: {api_provider}")
                
                # บันทึก error detail ใน metadata
                result["admin_error_detail"] = {
                    "detail": error_detail,
                    "type": error_type,
                    "provider": api_provider,
                    "original_message": error_message,
                    "timestamp": datetime.now().isoformat()
                }
            else:
                # รูปไม่ชัด/ไม่มี QR - แจ้งแบบเดิม
                result_text = error_message
                result["use_template"] = False
                logger.info("📷 Image quality error detected - will use standard message")
        
        # ═══════════════════════════════════════════════════════════════════
        # PHASE 5: SAVE & REPLY
        # ═══════════════════════════════════════════════════════════════════
        
        # Save result to chat (only if not error or if we want to save it)
        try:
            app.state.chat_message_model.save_message(
                account_id=account["_id"],
                user_id=user_id,
                message_type="text",
                content=result_text if result_text else result.get("message", "ไม่ทราบผลลัพธ์"),
                sender="bot",
                metadata={"slip_result": result, "reservation_id": reservation_id}
            )
        except Exception as save_error:
            logger.error(f"❌ Failed to save message to chat: {save_error}")
        
        # บันทึก API error detail ไว้ใน database สำหรับแสดงในหน้าแอดมิน
        if result.get("admin_error_detail"):
            try:
                error_detail = result.get("admin_error_detail")
                errors_collection = app.state.db.api_errors
                errors_collection.insert_one({
                    "account_id": account["_id"],
                    "account_name": account.get("account_name", "Unknown"),
                    "owner_id": owner_id,
                    "line_user_id": user_id,
                    "error_detail": error_detail.get("detail", ""),
                    "error_type": error_detail.get("type", "api_expired"),
                    "api_provider": error_detail.get("provider", "unknown"),
                    "original_message": error_detail.get("original_message", ""),
                    "timestamp": error_detail.get("timestamp", datetime.now().isoformat()),
                    "message_id": message_id,
                    "reservation_id": reservation_id
                })
                logger.info(f"📝 API error detail saved: {error_detail.get('provider')} - {error_detail.get('detail')}")
            except Exception as error_save_error:
                logger.error(f"❌ Failed to save API error detail: {error_save_error}")
        
        # Send result with template using reply token (if still valid) or push message
        slip_template_id = settings.get("slip_template_id")
        # Try to use reply token first (if not consumed by processing message), fallback to push if needed
        if reply_token:
            try:
                await send_slip_result_reply(reply_token, result, account["channel_access_token"], account.get("channel_id"), slip_template_id)
                logger.info("✅ Sent result using reply token")
            except Exception as reply_error:
                logger.warning(f"⚠️ Failed to send via reply token (may have expired or been consumed): {reply_error}")
                # Fallback to push message
                try:
                    await send_slip_result(user_id, result, account["channel_access_token"], account.get("channel_id"), slip_template_id)
                    logger.info("✅ Sent result using push message (fallback)")
                except Exception as push_error:
                    logger.error(f"❌ Failed to send result via push message: {push_error}")
        else:
            # Reply token was consumed, use push message
            try:
                await send_slip_result(user_id, result, account["channel_access_token"], account.get("channel_id"), slip_template_id)
                logger.info("✅ Sent result using push message (reply_token was consumed)")
            except Exception as push_error:
                logger.error(f"❌ Failed to send result via push message: {push_error}")
        
        # ═══════════════════════════════════════════════════════════════════
        # PHASE 6: BROADCAST QUOTA UPDATE (WebSocket)
        # ═══════════════════════════════════════════════════════════════════
        
        if owner_id:
            # Get updated quota and broadcast
            quota_status = app.state.subscription_model.check_quota(owner_id)
            await manager.broadcast({
                "type": "quota_update",
                "user_id": owner_id,
                "data": {
                    "total_slips": quota_status.get("total_slips", 0),
                    "total_used": quota_status.get("total_used", 0),
                    "remaining_slips": quota_status.get("remaining_slips", 0),
                    "available_slips": quota_status.get("available_slips", 0)
                }
            })
            
            # Send warning if low quota
            warning_threshold = system_settings.get("quota_warning_threshold", 10)
            if quota_status.get("available_slips", 0) <= warning_threshold:
                await manager.broadcast({
                    "type": "quota_warning",
                    "user_id": owner_id,
                    "data": {
                        "remaining": quota_status.get("available_slips", 0),
                        "message": f"⚠️ โควต้าเหลือน้อย: {quota_status.get('available_slips', 0)} สลิป"
                    }
                })
        
    except Exception as e:
        logger.error(f"❌ Error handling image message: {e}")
        import traceback
        traceback.print_exc()
        
        # Emergency rollback
        if reservation_id:
            try:
                app.state.quota_reservation_model.rollback_reservation(reservation_id, f"exception: {str(e)}")
                logger.info(f"🔄 Emergency rollback for reservation {reservation_id}")
            except Exception as rollback_error:
                logger.error(f"❌ Emergency rollback failed: {rollback_error}")

async def handle_follow_event(event: Dict[str, Any], account: Dict[str, Any]):
    """Handle follow event"""
    try:
        user_id = event["source"]["userId"]
        reply_token = event.get("replyToken")
        
        # Update statistics
        app.state.line_account_model.increment_user_count(account["_id"])
        
        # Send welcome message
        welcome_message = "ยินดีต้อนรับ! ขอบคุณที่เพิ่มเราเป็นเพื่อน"
        await send_line_reply(reply_token, welcome_message, account["channel_access_token"])
        
    except Exception as e:
        logger.error(f"❌ Error handling follow event: {e}")

async def handle_unfollow_event(event: Dict[str, Any], account: Dict[str, Any]):
    """Handle unfollow event"""
    try:
        user_id = event["source"]["userId"]
        logger.info(f"User {user_id} unfollowed account {account['channel_id']}")
        
    except Exception as e:
        logger.error(f"❌ Error handling unfollow event: {e}")

async def send_line_reply(reply_token: str, text: str, access_token: str):
    """Send LINE reply message"""
    try:
        url = "https://api.line.me/v2/bot/message/reply"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {access_token}"
        }
        data = {
            "replyToken": reply_token,
            "messages": [
                {
                    "type": "text",
                    "text": text
                }
            ]
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, json=data)
            if response.status_code != 200:
                logger.error(f"❌ LINE API error: {response.text}")
            else:
                logger.info("✅ Reply sent successfully")
                
    except Exception as e:
        logger.error(f"❌ Error sending LINE reply: {e}")

async def send_line_push(user_id: str, text: str, access_token: str) -> bool:
    """Send LINE push message to user"""
    try:
        url = "https://api.line.me/v2/bot/message/push"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {access_token}"
        }
        data = {
            "to": user_id,
            "messages": [
                {
                    "type": "text",
                    "text": text
                }
            ]
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, json=data)
            if response.status_code != 200:
                logger.error(f"❌ LINE Push API error: {response.text}")
                return False
            else:
                logger.info(f"✅ Push message sent successfully to {user_id}")
                return True
                
    except Exception as e:
        logger.error(f"❌ Error sending LINE push message: {e}")
        return False

def render_slip_template(template_text: str, result: Dict[str, Any]) -> str:
    """Render slip template with result data"""
    try:
        # Extract data from result (handle both formats)
        if isinstance(result, dict) and "data" in result:
            data = result["data"] or {}
        else:
            data = result if isinstance(result, dict) else {}
        
        # Extract amount
        amount_obj = data.get("amount", {})
        if isinstance(amount_obj, dict):
            amount = amount_obj.get("amount", 0)
        else:
            amount = amount_obj
        
        # Extract sender info
        sender = data.get("sender", {})
        sender_name = sender.get("account", {}).get("name", {})
        s_name = sender_name.get("th", "") or sender_name.get("en", "") or "ไม่ระบุชื่อ"
        s_bank = sender.get("bank", {}).get("short", "") or sender.get("bank", {}).get("name", "") or "-"
        s_acc = sender.get("account", {}).get("bank", {}).get("account", "")
        
        # Extract receiver info
        receiver = data.get("receiver", {})
        receiver_name = receiver.get("account", {}).get("name", {})
        r_name = receiver_name.get("th", "") or receiver_name.get("en", "") or "ไม่ระบุชื่อ"
        r_bank = receiver.get("bank", {}).get("short", "") or receiver.get("bank", {}).get("name", "") or "-"
        r_acc = receiver.get("account", {}).get("bank", {}).get("account", "")
        
        # Extract date/time
        date_str = data.get("date", data.get("trans_date", "")) or "-"
        time_str = data.get("time", data.get("trans_time", "")) or "-"
        ref_no = data.get("transRef") or data.get("reference") or "-"
        
        # Create template data
        template_data = {
            "amount": f"{amount:,.2f}",
            "sender": s_name,
            "sender_bank": s_bank,
            "sender_account": s_acc,
            "receiver": r_name,
            "receiver_bank": r_bank,
            "receiver_account": r_acc,
            "date": date_str,
            "time": time_str,
            "ref": ref_no,
            "verified_time": datetime.now().strftime("%d/%m/%Y %H:%M")
        }
        
        # Render template
        rendered = template_text
        for key, value in template_data.items():
            rendered = rendered.replace(f"{{{key}}}", str(value))
        
        return rendered
    except Exception as e:
        logger.error(f"❌ Error rendering template: {e}")
        return template_text

def sanitize_flex_message(obj: Any) -> Any:
    """
    Sanitize Flex Message to fix invalid properties before sending to LINE API
    - Fixes invalid 'size' values (e.g., '68px' -> 'md') for 'text' components
    - Validates 'size' property for 'image' and 'bubble' components
    - Removes 'size' property from invalid components (box, etc.)
    - Recursively processes all nested objects and arrays
    """
    # Valid text sizes for LINE Flex Message
    VALID_TEXT_SIZES = {'xxs', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl', '3xl', '4xl', '5xl', 'full'}
    # Valid image sizes
    VALID_IMAGE_SIZES = {'xxs', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl', '3xl', '4xl', '5xl', 'full'}
    # Valid bubble sizes
    VALID_BUBBLE_SIZES = {'nano', 'micro', 'kilo', 'mega', 'giga'}
    
    # Map pixel values to valid sizes
    def convert_pixel_size(pixel_size: str) -> str:
        """Convert pixel size to valid LINE Flex size keyword"""
        if not pixel_size or not isinstance(pixel_size, str):
            return pixel_size
            
        # Already valid size
        if pixel_size.lower() in VALID_TEXT_SIZES:
            return pixel_size
            
        # Extract number from pixel value (e.g., '68px' -> 68)
        import re
        match = re.match(r'^(\d+)(px)?$', pixel_size.strip(), re.IGNORECASE)
        if match:
            px_value = int(match.group(1))
            # Map to approximate size keywords
            if px_value <= 24:
                return 'xxs'
            elif px_value <= 32:
                return 'xs'
            elif px_value <= 48:
                return 'sm'
            elif px_value <= 64:
                return 'md'
            elif px_value <= 80:
                return 'lg'
            elif px_value <= 96:
                return 'xl'
            elif px_value <= 128:
                return 'xxl'
            elif px_value <= 160:
                return '3xl'
            elif px_value <= 200:
                return '4xl'
            elif px_value <= 256:
                return '5xl'
            else:
                return 'full'
        
        return pixel_size
    
    if isinstance(obj, dict):
        result = {}
        component_type = obj.get('type', '')
        
        for key, value in obj.items():
            if key == 'size':
                # 'size' property validation based on component type
                if component_type == 'text' and isinstance(value, str):
                    # Fix invalid size values for text components
                    result[key] = convert_pixel_size(value)
                elif component_type == 'image' and isinstance(value, str):
                    # Validate image size (must be one of valid image sizes)
                    if value.lower() in VALID_IMAGE_SIZES:
                        result[key] = value
                    else:
                        # Convert or use default
                        result[key] = convert_pixel_size(value)
                elif component_type == 'bubble' and isinstance(value, str):
                    # Validate bubble size (must be one of valid bubble sizes)
                    if value.lower() in VALID_BUBBLE_SIZES:
                        result[key] = value
                    else:
                        # Use default if invalid
                        logger.warning(f"⚠️ Invalid bubble size: {value}, using 'mega' as default")
                        result[key] = 'mega'
                elif component_type in ['box', 'separator', 'spacer', 'button', 'filler']:
                    # 'size' is NOT valid for these components - remove it
                    logger.warning(f"⚠️ Removing invalid 'size' property from {component_type} component")
                    continue  # Don't add to result
                else:
                    # For unknown component types or non-string values, keep as-is but log warning
                    if component_type:
                        logger.warning(f"⚠️ Unknown component type '{component_type}' with 'size' property: {value}")
                    result[key] = value
            else:
                # Recursively process nested objects
                result[key] = sanitize_flex_message(value)
        return result
    elif isinstance(obj, list):
        # Process each item in the list
        return [sanitize_flex_message(item) for item in obj]
    else:
        # Return primitive values as-is
        return obj

def render_flex_template(flex_template: Dict[str, Any], result: Dict[str, Any]) -> Dict[str, Any]:
    """Render flex message template with result data"""
    try:
        import json
        import copy
        from services.slip_formatter import format_currency, format_thai_datetime, mask_account_formatted, get_bank_logo
        
        data = result.get("data", {}) or {}
        
        # Extract amount
        amount_obj = data.get("amount", {})
        if isinstance(amount_obj, dict):
            amount = amount_obj.get("amount", 0)
        else:
            amount = amount_obj
        amount_display = format_currency(amount)
        amount_number = f"{amount:,.2f}" if isinstance(amount, (int, float)) else str(amount)
        
        # Format datetime
        datetime_str = format_thai_datetime(
            data.get("date", data.get("trans_date", "")) or "",
            data.get("time", data.get("trans_time", "")) or ""
        )
        
        # Get reference
        reference = data.get("transRef", data.get("reference", "-"))
        
        # Get sender/receiver info
        sender = data.get("sender", {})
        receiver = data.get("receiver", {})
        
        # Extract sender info
        if isinstance(sender, str):
            sender_name = sender
            sender_account = ""
            sender_bank_code = ""
            sender_bank = ""
        else:
            sender_name_dict = sender.get("account", {}).get("name", {})
            sender_name = sender_name_dict.get("th", "") or sender_name_dict.get("en", "") or "ไม่ระบุชื่อ"
            sender_acc = sender.get("account", {}).get("bank", {}).get("account", "")
            sender_account = mask_account_formatted(sender_acc) if sender_acc else ""
            sender_bank_code = sender.get("bank", {}).get("id", "")
            sender_bank = sender.get("bank", {}).get("short", "") or sender.get("bank", {}).get("name", "")
        
        # Extract receiver info
        if isinstance(receiver, str):
            receiver_name = receiver
            receiver_account = ""
            receiver_bank_code = ""
            receiver_bank = ""
        else:
            receiver_name_dict = receiver.get("account", {}).get("name", {})
            receiver_name = receiver_name_dict.get("th", "") or receiver_name_dict.get("en", "") or "ไม่ระบุชื่อ"
            receiver_acc = receiver.get("account", {}).get("bank", {}).get("account", "")
            receiver_account = mask_account_formatted(receiver_acc) if receiver_acc else ""
            receiver_bank_code = receiver.get("bank", {}).get("id", "")
            receiver_bank = receiver.get("bank", {}).get("short", "") or receiver.get("bank", {}).get("name", "")
        
        # Get bank logos
        sender_bank_logo = get_bank_logo(sender_bank_code, sender_bank, db=app.state.db)
        receiver_bank_logo = get_bank_logo(receiver_bank_code, receiver_bank, db=app.state.db)
        
        # Get verified time
        import pytz
        thai_tz = pytz.timezone("Asia/Bangkok")
        verified_time = datetime.now(thai_tz).strftime("%d %b %y, %H:%M น.").replace("Jan","ม.ค.").replace("Feb","ก.พ.").replace("Mar","มี.ค.").replace("Apr","เม.ย.").replace("May","พ.ค.").replace("Jun","มิ.ย.").replace("Jul","ก.ค.").replace("Aug","ส.ค.").replace("Sep","ก.ย.").replace("Oct","ต.ค.").replace("Nov","พ.ย.").replace("Dec","ธ.ค.")
        
        # Prepare replacement data - รองรับทั้ง placeholders แบบเดิมและแบบใหม่
        replacement_data = {
            # Amount
            "{{amount}}": amount_display,
            "{{amount_number}}": amount_number,
            
            # DateTime
            "{{datetime}}": datetime_str,
            "{{date}}": datetime_str,
            "{{time}}": datetime_str,
            
            # Reference
            "{{reference}}": reference,
            "{{ref_no}}": reference,
            "{{transRef}}": reference,
            
            # Sender - รองรับทั้ง 2 แบบ: {{sender_bank}} และ {{sender_bank_name}}
            "{{sender_name}}": sender_name,
            "{{sender_account}}": sender_account,
            "{{sender_bank}}": sender_bank,
            "{{sender_bank_name}}": sender_bank,  # Alias สำหรับ template ที่ใช้ชื่อนี้
            "{{sender_bank_logo}}": sender_bank_logo,
            
            # Receiver - รองรับทั้ง 2 แบบ: {{receiver_bank}} และ {{receiver_bank_name}}
            "{{receiver_name}}": receiver_name,
            "{{receiver_account}}": receiver_account,
            "{{receiver_bank}}": receiver_bank,
            "{{receiver_bank_name}}": receiver_bank,  # Alias สำหรับ template ที่ใช้ชื่อนี้
            "{{receiver_bank_logo}}": receiver_bank_logo,
            
            # Verified time
            "{{verified_time}}": verified_time,
            "{{verified_at}}": verified_time
        }
        
        # Deep copy template to avoid modifying original
        flex_copy = copy.deepcopy(flex_template)
        
        # Convert to JSON string, replace, and convert back
        flex_json = json.dumps(flex_copy)
        for key, value in replacement_data.items():
            flex_json = flex_json.replace(key, str(value))
        
        rendered_flex = json.loads(flex_json)
        
        # Sanitize flex message to fix invalid properties (e.g., '68px' -> 'md')
        rendered_flex = sanitize_flex_message(rendered_flex)
        
        logger.info(f"✅ Flex template rendered successfully")
        return rendered_flex
    except Exception as e:
        logger.error(f"❌ Error rendering flex template: {e}", exc_info=True)
        return flex_template

async def send_slip_result_reply(reply_token: str, result: Dict[str, Any], access_token: str, channel_id: str = None, slip_template_id: str = None):
    """Send slip verification result using reply token (for immediate response)"""
    try:
        logger.info(f"📤 Sending slip result via reply token")
        logger.info(f"✅ Result status: {result.get('status')}")
        
        if not reply_token:
            logger.error("❌ Reply token is empty")
            raise ValueError("Reply token is required")
        
        if not result:
            logger.error("❌ Result is empty")
            raise ValueError("Result is required")
        
        if not result.get("status"):
            logger.error("❌ Result status is missing")
            raise ValueError("Result status is required")
        
        url = "https://api.line.me/v2/bot/message/reply"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {access_token}"
        }
        
        messages = _prepare_slip_messages(result, channel_id, slip_template_id)
        
        data = {
            "replyToken": reply_token,
            "messages": messages
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, headers=headers, json=data)
            logger.info(f"📡 LINE Reply API response status: {response.status_code}")
            
            if response.status_code != 200:
                error_text = response.text[:500] if response.text else "No error message"
                logger.error(f"❌ LINE Reply API error: {error_text}")
                raise Exception(f"LINE API error: {response.status_code} - {error_text}")
            else:
                logger.info("✅ Slip result sent successfully via reply")
                
    except Exception as e:
        logger.error(f"❌ Error sending slip result via reply: {e}", exc_info=True)
        raise

def _is_token_or_api_expired_error(error_message: str) -> bool:
    """ตรวจสอบว่า error เป็น token/API หมดอายุหรือไม่"""
    if not error_message:
        return False
    
    error_lower = error_message.lower()
    
    # Keywords ที่บ่งบอกว่าเป็น token/API หมดอายุ
    token_expired_keywords = [
        "token ไม่ถูกต้อง",
        "token หมดอายุ",
        "api token",
        "unauthorized",
        "expired",
        "application_expired",
        "quota_exceeded",
        "ไม่มีสิทธิ์",
        "access_denied",
        "account_not_verified",
        "application_deactivated",
        "หมดอายุ",
        "ไม่ถูกต้องหรือหมดอายุ",
        "thunder api token",
        "api key",
        "token ไม่ถูกต้องหรือหมดอายุ",
        "การยืนยันตัวตนล้มเหลว"
    ]
    
    # Keywords ที่บ่งบอกว่าเป็นรูปไม่ชัด/ไม่มี QR (ไม่ใช้ template)
    image_quality_keywords = [
        "ไม่สามารถอ่านข้อมูล",
        "รูปภาพไม่ถูกต้อง",
        "ไม่พบ qr code",
        "qr_not_found",
        "invalid_payload",
        "invalid_image",
        "ไม่ชัดเจน",
        "ถ่ายรูป",
        "รูปไม่ชัด",
        "slip_not_found",
        "ไม่พบข้อมูลสลิป"
    ]
    
    # ตรวจสอบว่าเป็น image quality error ก่อน (priority)
    for keyword in image_quality_keywords:
        if keyword in error_lower:
            logger.info(f"📷 Detected image quality error: {keyword}")
            return False
    
    # ตรวจสอบว่าเป็น token/API expired error
    for keyword in token_expired_keywords:
        if keyword in error_lower:
            logger.info(f"🔑 Detected token/API expired error: {keyword}")
            return True
    
    # Default: ถ้าไม่ใช่ทั้งสองประเภท ให้ถือว่าไม่ใช่ token expired (ใช้ default error message)
    return False

def _prepare_slip_messages(result: Dict[str, Any], channel_id: str = None, slip_template_id: str = None) -> List[Dict[str, Any]]:
    """Prepare messages for slip result (shared by reply and push)"""
    messages = []
    
    # Get template (prefer selected template over default)
    template = None
    if slip_template_id:
        try:
            from bson import ObjectId
            template = app.state.slip_template_model.get_template_by_id(slip_template_id)
            if template:
                logger.info(f"🎯 Using selected template: {template.get('template_name')}")
        except Exception as e:
            logger.warning(f"⚠️ Could not get selected template: {e}")
    
    # Fallback to default template
    if not template and channel_id:
        try:
            template = app.state.slip_template_model.get_default_template(channel_id)
            if template:
                logger.info(f"📋 Using default template: {template.get('template_name')}")
        except Exception as e:
            logger.warning(f"⚠️ Could not get default template: {e}")
    
    if result.get("status") in ["success", "duplicate"]:
        # Use template if available
        if template:
            template_type = template.get("template_type", "flex")
            
            if template_type == "text":
                # Use text template
                template_text = template.get("template_text", "")
                rendered_text = render_slip_template(template_text, result)
                messages = [{"type": "text", "text": rendered_text}]
                
                # Add duplicate warning if needed
                if result.get("status") == "duplicate":
                    warning_text = "⚠️ คำเตือน: สลิปนี้เคยถูกใช้งานแล้ว"
                    messages.insert(0, {"type": "text", "text": warning_text})
            else:
                # Use flex message template
                template_flex = template.get("template_flex")
                if template_flex:
                    # Render flex template with data
                    flex_message = render_flex_template(template_flex, result)
                    messages = [{"type": "flex", "altText": "ตรวจสอบสลิป", "contents": flex_message}]
                else:
                    # Fallback to default flex message
                    flex_message = create_beautiful_slip_flex_message(result, slip_template_id, app.state.db)
                    messages = [flex_message]
        else:
            # Fallback to default flex message
            flex_message = create_beautiful_slip_flex_message(result, slip_template_id, app.state.db)
            messages = [flex_message]
            
        # Increment template usage count
        if template:
            try:
                app.state.slip_template_model.increment_usage_count(str(template["_id"]))
            except:
                pass
    else:
        # Create error message
        error_message_text = result.get("message", "เกิดข้อผิดพลาด")
        use_template = result.get("use_template", False)
        
        # ถ้าเป็น token/API หมดอายุ ให้ใช้ template จากหลังบ้าน
        if use_template:
            # ใช้ template error จาก system settings
            try:
                from models.system_settings import SystemSettingsModel
                system_settings = app.state.system_settings_model.get_settings()
                
                # หา error template จาก settings
                error_template_id = system_settings.get("error_template_id")
                if error_template_id:
                    error_template = app.state.slip_template_model.get_template_by_id(error_template_id)
                    if error_template:
                        template_type = error_template.get("template_type", "flex")
                        if template_type == "text":
                            template_text = error_template.get("template_text", "")
                            # Replace {{error_message}} ใน template
                            rendered_text = template_text.replace("{{error_message}}", error_message_text)
                            messages = [{"type": "text", "text": rendered_text}]
                        else:
                            # Use flex template
                            template_flex = error_template.get("template_flex")
                            if template_flex:
                                # Replace {{error_message}} ใน flex template
                                import json
                                import copy
                                flex_copy = copy.deepcopy(template_flex)
                                flex_json = json.dumps(flex_copy)
                                flex_json = flex_json.replace("{{error_message}}", error_message_text)
                                rendered_flex = json.loads(flex_json)
                                # Sanitize flex message to fix invalid properties
                                rendered_flex = sanitize_flex_message(rendered_flex)
                                messages = [{"type": "flex", "altText": "ข้อผิดพลาด", "contents": rendered_flex}]
                            else:
                                # Fallback to default error flex
                                error_message = create_error_flex_message(error_message_text)
                                messages = [error_message]
                    else:
                        # Template not found, use default
                        error_message = create_error_flex_message(error_message_text)
                        messages = [error_message]
                else:
                    # No error template configured, use default
                    error_message = create_error_flex_message(error_message_text)
                    messages = [error_message]
            except Exception as e:
                logger.error(f"❌ Error using error template: {e}", exc_info=True)
                # Fallback to default error flex
                error_message = create_error_flex_message(error_message_text)
                messages = [error_message]
        else:
            # รูปไม่ชัด/ไม่มี QR - ใช้ error flex message แบบเดิม
            error_message = create_error_flex_message(error_message_text)
            messages = [error_message]
    
    # Validate messages
    if not messages:
        logger.warning("⚠️ No messages generated, using fallback")
        # Fallback to simple text message
        amount = "N/A"
        if result.get("data") and isinstance(result["data"], dict):
            amount = result["data"].get("amount", "N/A")
        messages = [{
            "type": "text",
            "text": f"✅ ตรวจสอบสลิปสำเร็จ\n💰 จำนวน: {amount} บาท"
        }]
    
    # Sanitize all flex messages before returning
    sanitized_messages = []
    for msg in messages:
        if msg.get("type") == "flex" and msg.get("contents"):
            msg["contents"] = sanitize_flex_message(msg["contents"])
        sanitized_messages.append(msg)
    messages = sanitized_messages
    
    logger.info(f"💬 Prepared {len(messages)} message(s)")
    return messages

async def send_slip_result(user_id: str, result: Dict[str, Any], access_token: str, channel_id: str = None, slip_template_id: str = None):
    """Send slip verification result using template"""
    try:
        # Log input parameters
        logger.info(f"📤 Sending slip result")
        logger.info(f"👤 User ID: {user_id}")
        logger.info(f"🎯 Template ID: {slip_template_id}")
        logger.info(f"📊 Channel ID: {channel_id}")
        logger.info(f"✅ Result status: {result.get('status')}")
        
        # Validate inputs
        if not user_id:
            logger.error("❌ User ID is empty")
            return
        
        if not result:
            logger.error("❌ Result is empty")
            return
        
        if not result.get("status"):
            logger.error("❌ Result status is missing")
            return
        
        url = "https://api.line.me/v2/bot/message/push"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {access_token}"
        }
        
        messages = _prepare_slip_messages(result, channel_id, slip_template_id)
        
        logger.info(f"💬 Sending {len(messages)} message(s) via push")
        
        data = {
            "to": user_id,
            "messages": messages
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, headers=headers, json=data)
            logger.info(f"📡 LINE API response status: {response.status_code}")
            
            if response.status_code != 200:
                error_text = response.text[:500] if response.text else "No error message"
                logger.error(f"❌ LINE API error: {error_text}")
                logger.error(f"📊 Request data: {data}")
                
                # Try fallback to simple text message if flex message failed
                if messages and messages[0].get("type") == "flex":
                    logger.warning("⚠️ Flex message failed, trying fallback text message")
                    try:
                        # Create simple text fallback
                        status = result.get("status", "unknown")
                        amount = "N/A"
                        if result.get("data") and isinstance(result["data"], dict):
                            amount_obj = result["data"].get("amount", {})
                            if isinstance(amount_obj, dict):
                                amount = amount_obj.get("amount", "N/A")
                            else:
                                amount = amount_obj
                        
                        if status == "success":
                            fallback_text = f"✅ ตรวจสอบสลิปสำเร็จ\n💰 จำนวน: {amount} บาท"
                        elif status == "duplicate":
                            fallback_text = f"⚠️ สลิปนี้เคยถูกตรวจสอบแล้ว\n💰 จำนวน: {amount} บาท"
                        else:
                            fallback_text = result.get("message", "เกิดข้อผิดพลาดในการตรวจสอบสลิป")
                        
                        fallback_data = {
                            "to": user_id,
                            "messages": [{"type": "text", "text": fallback_text}]
                        }
                        
                        fallback_response = await client.post(url, headers=headers, json=fallback_data)
                        if fallback_response.status_code == 200:
                            logger.info("✅ Sent fallback text message successfully")
                            return
                        else:
                            logger.error(f"❌ Fallback text message also failed: {fallback_response.text}")
                    except Exception as fallback_error:
                        logger.error(f"❌ Error sending fallback message: {fallback_error}")
                
                raise Exception(f"LINE API error: {response.status_code} - {error_text}")
            else:
                logger.info("✅ Slip result sent successfully")
                logger.info(f"📊 Response: {response.text}")
                
    except Exception as e:
        logger.error(f"❌ Error sending slip result: {e}", exc_info=True)
        raise


# ==================== Slip Template Routes ====================

@app.get("/user/line-accounts/{account_id}/slip-templates", response_class=HTMLResponse)
@app.get("/admin/slip-templates", response_class=HTMLResponse)
async def slip_template_manager(request: Request, account_id: str = None):
    """Slip template manager page"""
    user = app.state.auth.get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    
    # If admin route, get all templates
    if account_id is None:
        if user["role"] != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        # Get all templates from all accounts
        all_templates = []
        return templates.TemplateResponse("settings/slip_template_manager.html", {
            "request": request,
            "user": user,
            "account": None,
            "templates": all_templates
        })
    
    # Get specific account templates
    account = app.state.line_account_model.get_account_by_id(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Check permission
    if user["role"] != UserRole.ADMIN and account["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    # Initialize default templates if not exists
    # Force refresh if no templates found
    templates_list = app.state.slip_template_model.get_templates_by_channel(account["channel_id"])
    if not templates_list:
        logger.info(f"🔄 No templates found, force initializing for channel {account['channel_id']}")
        app.state.slip_template_model.init_default_templates(account["channel_id"], force=True)
        templates_list = app.state.slip_template_model.get_templates_by_channel(account["channel_id"])
    else:
        logger.info(f"✅ Found {len(templates_list)} existing templates")
    
    # Get current selected template from account settings
    current_template_id = account.get("settings", {}).get("slip_template_id", "")
    
    # Mark templates with selection status and convert datetime
    for template in templates_list:
        template_id = str(template["_id"])
        template["is_selected"] = (template_id == current_template_id)
        template["_id"] = template_id  # Convert ObjectId to string
        
        # Convert datetime to string for JSON serialization
        if "created_at" in template and template["created_at"]:
            template["created_at"] = template["created_at"].isoformat()
        if "updated_at" in template and template["updated_at"]:
            template["updated_at"] = template["updated_at"].isoformat()
    
    logger.info(f"📋 Template selector - Account: {account_id}, Current template: {current_template_id}")
    logger.info(f"📋 Found {len(templates_list)} templates")
    
    # Use premium template selector
    return templates.TemplateResponse("settings/slip_template_selector_premium.html", {
        "request": request,
        "user": user,
        "account": account,
        "account_id": account_id,
        "templates": templates_list,
        "current_template_id": current_template_id
    })

@app.get("/user/line-accounts/{account_id}/slip-templates/create", response_class=HTMLResponse)
async def template_creator_page(request: Request, account_id: str):
    """Template creator page"""
    user = app.state.auth.get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    
    account = app.state.line_account_model.get_account_by_id(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Check permission
    if user["role"] != UserRole.ADMIN and account["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    return templates.TemplateResponse("settings/template_creator.html", {
        "request": request,
        "user": user,
        "account": account,
        "account_id": account_id
    })

@app.post("/api/user/line-accounts/{account_id}/slip-templates")
async def create_slip_template(request: Request, account_id: str):
    """Create new slip template"""
    user = app.state.auth.get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    account = app.state.line_account_model.get_account_by_id(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    if user["role"] != UserRole.ADMIN and account["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        data = await request.json()
        
        # Load premium template if template_type is specified
        template_flex = None
        if data.get("template_type"):
            import json
            import os
            premium_templates_path = os.path.join(os.path.dirname(__file__), "templates_data", "premium_flex_templates.json")
            try:
                with open(premium_templates_path, 'r', encoding='utf-8') as f:
                    premium_templates = json.load(f)
                    template_flex = premium_templates.get(data.get("template_type"))
                    logger.info(f"✅ Loaded premium template: {data.get('template_type')}")
            except Exception as e:
                logger.error(f"❌ Error loading premium template: {e}")
        
        template_id = app.state.slip_template_model.create_template(
            channel_id=account["channel_id"],
            template_name=data.get("template_name"),
            template_text=data.get("template_text", ""),
            template_flex=template_flex,
            template_type=data.get("template_type", "flex") if template_flex else "text",
            description=data.get("description", ""),
            is_default=data.get("is_default", False)
        )
        
        if template_id:
            await manager.broadcast({
                "type": "success",
                "message": "สร้าง Template สำเร็จ"
            })
            return {"success": True, "message": "สร้าง Template สำเร็จ", "template_id": template_id}
        else:
            return JSONResponse(
                status_code=500,
                content={"success": False, "message": "ไม่สามารถสร้าง Template ได้"}
            )
    except Exception as e:
        logger.error(f"Error creating slip template: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "เกิดข้อผิดพลาดในการสร้าง Template"}
        )

@app.delete("/api/user/line-accounts/{account_id}/slip-templates/{template_id}")
async def delete_slip_template(request: Request, account_id: str, template_id: str):
    """Delete slip template"""
    user = app.state.auth.get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    account = app.state.line_account_model.get_account_by_id(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    if user["role"] != UserRole.ADMIN and account["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        success = app.state.slip_template_model.delete_template(template_id)
        
        if success:
            await manager.broadcast({
                "type": "info",
                "message": "ลบ Template สำเร็จ"
            })
            return {"success": True, "message": "ลบ Template สำเร็จ"}
        else:
            return JSONResponse(
                status_code=500,
                content={"success": False, "message": "ไม่สามารถลบ Template ได้"}
            )
    except Exception as e:
        logger.error(f"Error deleting slip template: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "เกิดข้อผิดพลาดในการลบ Template"}
        )

@app.put("/api/user/line-accounts/{account_id}/slip-templates/{template_id}/default")
async def set_default_slip_template(request: Request, account_id: str, template_id: str):
    """Set slip template as default"""
    user = app.state.auth.get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    account = app.state.line_account_model.get_account_by_id(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    if user["role"] != UserRole.ADMIN and account["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        # 1. Set template as default in slip_templates collection
        success = app.state.slip_template_model.set_default_template(account["channel_id"], template_id)
        
        if success:
            # 2. Update account settings to use this template
            current_settings = account.get("settings", {})
            current_settings["slip_template_id"] = template_id
            
            # Update account with new settings
            update_success = app.state.line_account_model.update_settings(
                account_id=account_id,
                settings=current_settings
            )
            
            if update_success:
                logger.info(f"✅ Set default template {template_id} for account {account_id}")
                logger.info(f"✅ Updated account settings with slip_template_id: {template_id}")
                
                await manager.broadcast({
                    "type": "success",
                    "message": "ตั้งเป็น Template เริ่มต้นสำเร็จ"
                })
                return {"success": True, "message": "ตั้งเป็น Template เริ่มต้นสำเร็จ"}
            else:
                logger.error(f"❌ Failed to update account settings for {account_id}")
                return JSONResponse(
                    status_code=500,
                    content={"success": False, "message": "ไม่สามารถอัปเดตการตั้งค่าบัญชีได้"}
                )
        else:
            return JSONResponse(
                status_code=500,
                content={"success": False, "message": "ไม่สามารถตั้งเป็น Template เริ่มต้นได้"}
            )
    except Exception as e:
        logger.error(f"Error setting default slip template: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "เกิดข้อผิดพลาดในการตั้งเป็น Template เริ่มต้น"}
        )

@app.get("/api/user/line-accounts/{account_id}/slip-templates-list")
async def get_slip_templates_list(request: Request, account_id: str):
    """Get slip templates list for dropdown"""
    user = app.state.auth.get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    account = app.state.line_account_model.get_account_by_id(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    if user["role"] != UserRole.ADMIN and account["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        # Initialize default templates if not exists
        app.state.slip_template_model.init_default_templates(account["channel_id"])
        
        # Create new templates (Classic, Elegant, Professional) if they don't exist
        existing_new_templates = list(app.state.slip_template_model.collection.find({
            "channel_id": account["channel_id"],
            "template_name": {"$in": [
                "💎 Classic Elegant - สไตล์คลาสสิกหรูหรา",
                "✨ Elegant Premium - หรูหราโดดเด่น",
                "💼 Professional Business - มืออาชีพ"
            ]}
        }))
        if len(existing_new_templates) == 0:
            logger.info("📝 Creating 3 new templates...")
            app.state.slip_template_model.create_new_templates(account["channel_id"])
        
        templates_list = app.state.slip_template_model.get_templates_by_channel(account["channel_id"])
        
        # Get current selected template from account settings
        current_template_id = account.get("settings", {}).get("slip_template_id", "")
        if current_template_id:
            try:
                current_template_id = str(current_template_id)
            except Exception as convert_error:
                logger.warning(f"⚠️ Unable to convert slip_template_id to string: {convert_error}")
                current_template_id = ""
        
        # Format templates for frontend with correct field names
        formatted_templates = []
        for template in templates_list:
            template_id = str(template["_id"])
            formatted_templates.append({
                "id": template_id,
                "name": template.get("template_name", "ไม่มีชื่อ"),
                "description": template.get("description", ""),
                "template_type": template.get("template_type", "flex"),
                "is_default": template.get("is_default", False),
                "usage_count": template.get("usage_count", 0),
                "is_selected": template_id == current_template_id
            })
        
        logger.info(f"📋 Returning {len(formatted_templates)} templates, current selected: {current_template_id}")
        
        return {
            "success": True,
            "templates": formatted_templates,
            "current_template_id": current_template_id
        }
    except Exception as e:
        logger.error(f"Error getting slip templates: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "เกิดข้อผิดพลาดในการดึงรายการ Template"}
        )

@app.get("/api/user/line-accounts/{account_id}/slip-templates/{template_id}/preview")
async def preview_slip_template(request: Request, account_id: str, template_id: str):
    """ดูตัวอย่าง Flex Message ของ template"""
    user = app.state.auth.get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    account = app.state.line_account_model.get_account_by_id(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    if user["role"] != UserRole.ADMIN and account["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        # ดึง template
        template = app.state.slip_template_model.get_template_by_id(template_id)
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        
        # สร้างข้อมูลตัวอย่างพร้อม bank logos
        from services.slip_formatter import get_bank_logo
        
        sender_bank_code = "002"
        receiver_bank_code = "004"
        sender_logo = get_bank_logo(sender_bank_code, "กรุงเทพ", app.state.db)
        receiver_logo = get_bank_logo(receiver_bank_code, "กสิกรไทย", app.state.db)
        
        sample_result = {
            "status": "success",
            "data": {
                "amount": {"amount": 369.00},
                "sender": {
                    "account": {
                        "name": {"th": "นาย วินฉลิม แก้นนี"},
                        "bank": {"account": "xxx-x-x-6021x"}
                    },
                    "bank": {"short": "กรุงเทพ", "id": sender_bank_code, "name": "กรุงเทพ"}
                },
                "receiver": {
                    "account": {
                        "name": {"th": "บจก. ทินเดอร์ โซลูชั่น"},
                        "bank": {"account": "xxx-x-x-8041x"}
                    },
                    "bank": {"short": "กสิกรไทย", "id": receiver_bank_code, "name": "กสิกรไทย"}
                },
                "date": "22 ต.ค. 2566",
                "time": "10:30",
                "transRef": "53070260912"
            },
            "sender_bank_logo": sender_logo,
            "receiver_bank_logo": receiver_logo
        }
        
        # Render template
        if template.get("template_type") == "text":
            # Text template
            rendered_text = render_slip_template(template.get("template_text", ""), sample_result)
            return {
                "success": True,
                "type": "text",
                "content": rendered_text
            }
        else:
            # Flex template
            template_flex = template.get("template_flex")
            if template_flex:
                rendered_flex = render_flex_template(template_flex, sample_result)
                return {
                    "success": True,
                    "type": "flex",
                    "content": {
                        "type": "flex",
                        "altText": "ตรวจสอบสลิป",
                        "contents": rendered_flex
                    }
                }
            else:
                # ใช้ default flex message
                from services.slip_formatter import create_beautiful_slip_flex_message
                flex_message = create_beautiful_slip_flex_message(sample_result, db=app.state.db)
                return {
                    "success": True,
                    "type": "flex",
                    "content": flex_message
                }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error previewing template: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"เกิดข้อผิดพลาด: {str(e)}"}
        )

# ==================== Chat Message Routes ====================

@app.get("/user/chat-history/{account_id}", response_class=HTMLResponse)
async def chat_history_page(request: Request, account_id: str):
    """Chat history page"""
    user = app.state.auth.get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    
    account = app.state.line_account_model.get_account_by_id(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Check permission
    if user["role"] != UserRole.ADMIN and account["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    line_accounts = app.state.line_account_model.get_accounts_by_owner(user["user_id"])
    
    return templates.TemplateResponse("settings/chat_history.html", {
        "request": request,
        "user": user,
        "line_accounts": line_accounts,
        "current_account_id": account_id
    })

@app.get("/api/chat-messages/{account_id}/users")
async def get_chat_users(request: Request, account_id: str):
    """Get list of users who chatted with this account"""
    user = app.state.auth.get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    account = app.state.line_account_model.get_account_by_id(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Check permission
    if user["role"] != UserRole.ADMIN and account["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        users = app.state.chat_message_model.get_unique_users(account_id)
        user_list = []
        
        for uid in users:
            # Get the LAST message (sorted by timestamp descending)
            messages = app.state.chat_message_model.get_messages(account_id, uid, limit=1, skip=0)
            if messages:
                last_msg = messages[0]
                # Get user profile from LINE
                user_name = uid
                picture_url = None
                try:
                    # ใช้ LINE Bot API ดึงโปรไฟล์ผู้ใช้
                    import requests as req
                    headers = {"Authorization": f"Bearer {account.get('channel_access_token')}"}
                    response = req.get(f"https://api.line.me/v2/bot/profile/{uid}", headers=headers, timeout=5)
                    if response.status_code == 200:
                        profile = response.json()
                        user_name = profile.get("displayName", uid)
                        picture_url = profile.get("pictureUrl")
                except Exception as e:
                    logger.warning(f"Could not get LINE profile for {uid}: {e}")
                
                # Get last message content
                last_message_content = last_msg.get("content", "")
                if last_msg.get("message_type") == "image":
                    last_message_content = "[รูปภาพ]"
                elif last_msg.get("message_type") == "sticker":
                    last_message_content = "[สติกเกอร์]"
                elif last_msg.get("message_type") == "video":
                    last_message_content = "[วิดีโอ]"
                elif last_msg.get("message_type") == "audio":
                    last_message_content = "[ข้อความเสียง]"
                elif last_msg.get("message_type") == "location":
                    last_message_content = "[ตำแหน่ง]"
                elif last_msg.get("message_type") == "file":
                    last_message_content = "[ไฟล์]"
                elif not last_message_content:
                    last_message_content = "[ไม่มีข้อความ]"
                
                user_list.append({
                    "user_id": uid,
                    "user_name": user_name,
                    "picture_url": picture_url,
                    "last_message": last_message_content,
                    "last_message_time": last_msg.get("timestamp", ""),
                    "last_message_timestamp": last_msg.get("timestamp", "")
                })
        
        # Sort by last_message_time (newest first) - like Facebook Messenger
        user_list.sort(key=lambda x: x.get("last_message_timestamp", ""), reverse=True)
        
        return {"success": True, "users": user_list}
    except Exception as e:
        logger.error(f"Error getting chat users: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "เกิดข้อผิดพลาดในการดึงรายชื่อผู้ใช้"}
        )

@app.post("/api/chat-messages/{account_id}/send")
async def send_chat_message_alt(request: Request, account_id: str):
    """Alternative endpoint: Send a message to a LINE user via Push API (user_id in body)"""
    user = app.state.auth.get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    account = app.state.line_account_model.get_account_by_id(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Check permission
    if user["role"] != UserRole.ADMIN and account["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        data = await request.json()
        target_user_id = data.get("user_id", "").strip()
        message_text = data.get("message", "").strip()
        
        if not target_user_id:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "ต้องระบุ user_id"}
            )
        
        if not message_text:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "ข้อความไม่สามารถว่างได้"}
            )
        
        if len(message_text) > 5000:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "ข้อความยาวเกินไป (สูงสุด 5000 ตัวอักษร)"}
            )
        
        # Send message via LINE Push API
        success = await send_line_push(
            user_id=target_user_id,
            text=message_text,
            access_token=account["channel_access_token"]
        )
        
        if success:
            # Save message to database
            app.state.chat_message_model.save_message(
                account_id=account_id,
                user_id=target_user_id,
                message_type="text",
                content=message_text,
                sender="bot"
            )
            return {"success": True, "message": "ส่งข้อความสำเร็จ"}
        else:
            return JSONResponse(
                status_code=500,
                content={"success": False, "message": "ไม่สามารถส่งข้อความได้ กรุณาลองใหม่อีกครั้ง"}
            )
            
    except Exception as e:
        logger.error(f"Error sending chat message: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "เกิดข้อผิดพลาดในการส่งข้อความ"}
        )

@app.get("/api/chat-messages/{account_id}/{user_id}")
async def get_chat_messages(request: Request, account_id: str, user_id: str, limit: int = 50, skip: int = 0):
    """Get chat messages for a specific user with pagination"""
    user = app.state.auth.get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    account = app.state.line_account_model.get_account_by_id(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Check permission
    if user["role"] != UserRole.ADMIN and account["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        # Get messages with pagination
        messages = app.state.chat_message_model.get_messages(
            account_id=account_id,
            user_id=user_id,
            limit=limit,
            skip=skip
        )
        return {"success": True, "messages": messages}
    except Exception as e:
        logger.error(f"Error getting chat messages: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "เกิดข้อผิดพลาดในการดึงข้อความ"}
        )

@app.post("/api/chat-messages/{account_id}/{user_id}/send")
async def send_chat_message(request: Request, account_id: str, user_id: str):
    """Send a message to a LINE user via Push API"""
    user = app.state.auth.get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    account = app.state.line_account_model.get_account_by_id(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Check permission
    if user["role"] != UserRole.ADMIN and account["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        data = await request.json()
        message_text = data.get("message", "").strip()
        
        if not message_text:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "ข้อความไม่สามารถว่างได้"}
            )
        
        if len(message_text) > 5000:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "ข้อความยาวเกินไป (สูงสุด 5000 ตัวอักษร)"}
            )
        
        # Send message via LINE Push API
        success = await send_line_push(
            user_id=user_id,
            text=message_text,
            access_token=account["channel_access_token"]
        )
        
        if success:
            # Save message to database
            app.state.chat_message_model.save_message(
                account_id=account_id,
                user_id=user_id,
                message_type="text",
                content=message_text,
                sender="bot"
            )
            return {"success": True, "message": "ส่งข้อความสำเร็จ"}
        else:
            return JSONResponse(
                status_code=500,
                content={"success": False, "message": "ไม่สามารถส่งข้อความได้ กรุณาลองใหม่อีกครั้ง"}
            )
            
    except Exception as e:
        logger.error(f"Error sending chat message: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "เกิดข้อผิดพลาดในการส่งข้อความ"}
        )

@app.get("/api/line-image/{account_id}/{message_id}")
async def get_line_image(request: Request, account_id: str, message_id: str):
    """Proxy endpoint to get LINE image from database"""
    user = app.state.auth.get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    account = app.state.line_account_model.get_account_by_id(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Check permission
    if user["role"] != UserRole.ADMIN and account["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        import base64
        from fastapi.responses import Response
        
        # Try to find the message with image data - try both string and ObjectId formats
        message = None
        
        # Try with account_id as string first
        message = app.state.chat_message_model.collection.find_one({
            "message_id": message_id,
            "account_id": account_id
        })
        
        # If not found, try with account_id matching the account's _id (string form)
        if not message:
            message = app.state.chat_message_model.collection.find_one({
                "message_id": message_id,
                "account_id": str(account.get("_id", ""))
            })
        
        # If found and has image data, return it
        if message and message.get("metadata", {}).get("image_data"):
            try:
                image_data = base64.b64decode(message["metadata"]["image_data"])
                return Response(
                    content=image_data,
                    media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=86400"}  # Cache for 1 day
                )
            except Exception as decode_error:
                logger.warning(f"Failed to decode image from database: {decode_error}")
        
        # Fallback: Get image from LINE API
        logger.info(f"📥 Fetching image from LINE API: {message_id}")
        image_url = f"https://api-data.line.me/v2/bot/message/{message_id}/content"
        headers = {
            "Authorization": f"Bearer {account['channel_access_token']}"
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(image_url, headers=headers)
            
            if response.status_code == 200:
                # Store image in database for future use
                image_base64 = base64.b64encode(response.content).decode('utf-8')
                
                # Update existing message or create new record
                if message:
                    app.state.chat_message_model.collection.update_one(
                        {"_id": message["_id"]},
                        {"$set": {"metadata.image_data": image_base64}}
                    )
                else:
                    # Try to find by just message_id
                    result = app.state.chat_message_model.collection.update_one(
                        {"message_id": message_id},
                        {"$set": {"metadata.image_data": image_base64}}
                    )
                    if result.modified_count == 0:
                        logger.warning(f"Could not update image for message_id: {message_id}")
                
                return Response(
                    content=response.content,
                    media_type=response.headers.get("content-type", "image/jpeg"),
                    headers={"Cache-Control": "public, max-age=86400"}
                )
            elif response.status_code == 404:
                logger.warning(f"Image not found in LINE API: {message_id}")
                raise HTTPException(status_code=404, detail="Image not found or expired")
            else:
                logger.error(f"LINE API error: {response.status_code}")
                raise HTTPException(status_code=response.status_code, detail="Failed to get image from LINE")
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting LINE image: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")



@app.post("/api/test-thunder-api")
async def test_thunder_api_route(request: Request):
    """API route to test Thunder API connection."""
    user = app.state.auth.get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        data = await request.json()
        api_key = data.get("api_key")
        if not api_key:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "API Key is required"}
            )

        result = test_thunder_api_connection(api_key)
        return JSONResponse(content=result)

    except Exception as e:
        logger.error(f"Error in test_thunder_api_route: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "Internal Server Error"}
        )


# ==================== Bank Account Routes ====================

@app.get("/admin/bank-accounts", response_class=HTMLResponse)
async def admin_bank_accounts_page(request: Request):
    """Admin bank accounts management page"""
    user = app.state.auth.get_current_user(request)
    if not user or user["role"] != UserRole.ADMIN:
        return RedirectResponse(url="/login")
    
    bank_accounts = app.state.bank_account_model.get_all_accounts()
    line_accounts = app.state.line_account_model.get_all_accounts()
    
    return templates.TemplateResponse("admin/bank_accounts.html", {
        "request": request,
        "user": user,
        "bank_accounts": bank_accounts,
        "line_accounts": line_accounts
    })

@app.post("/api/admin/bank-accounts")
async def create_bank_account(request: Request):
    """Create new bank account (Admin only)"""
    user = app.state.auth.get_current_user(request)
    if not user or user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        data = await request.json()
        
        account_id = app.state.bank_account_model.create_account(
            account_name=data.get("account_name"),
            bank_name=data.get("bank_name"),
            account_number=data.get("account_number"),
            owner_id=user["user_id"],
            line_account_id=data.get("line_account_id"),
            description=data.get("description")
        )
        
        if account_id:
            return JSONResponse(content={
                "success": True,
                "message": "สร้างบัญชีธนาคารสำเร็จ",
                "account_id": account_id
            })
        else:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "ไม่สามารถสร้างบัญชีธนาคารได้ อาจมีบัญชีนี้อยู่แล้ว"}
            )
    except Exception as e:
        logger.error(f"Error creating bank account: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "เกิดข้อผิดพลาดในการสร้างบัญชีธนาคาร"}
        )

@app.get("/api/admin/bank-accounts")
async def get_all_bank_accounts(request: Request):
    """Get all bank accounts (Admin only)"""
    user = app.state.auth.get_current_user(request)
    if not user or user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        bank_accounts = app.state.bank_account_model.get_all_accounts()
        return JSONResponse(content={
            "success": True,
            "bank_accounts": bank_accounts
        })
    except Exception as e:
        logger.error(f"Error getting bank accounts: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "เกิดข้อผิดพลาดในการดึงข้อมูลบัญชีธนาคาร"}
        )

@app.put("/api/admin/bank-accounts/{account_id}")
async def update_bank_account(request: Request, account_id: str):
    """Update bank account (Admin only)"""
    user = app.state.auth.get_current_user(request)
    if not user or user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        data = await request.json()
        
        update_data = {}
        if "account_name" in data:
            update_data["account_name"] = data["account_name"]
        if "bank_name" in data:
            update_data["bank_name"] = data["bank_name"]
        if "account_number" in data:
            update_data["account_number"] = data["account_number"]
        if "line_account_id" in data:
            update_data["line_account_id"] = data["line_account_id"]
        if "description" in data:
            update_data["description"] = data["description"]
        if "is_active" in data:
            update_data["is_active"] = data["is_active"]
        
        success = app.state.bank_account_model.update_account(account_id, update_data)
        
        if success:
            return JSONResponse(content={
                "success": True,
                "message": "อัปเดตบัญชีธนาคารสำเร็จ"
            })
        else:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "ไม่สามารถอัปเดตบัญชีธนาคารได้"}
            )
    except Exception as e:
        logger.error(f"Error updating bank account: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "เกิดข้อผิดพลาดในการอัปเดตบัญชีธนาคาร"}
        )

@app.delete("/api/admin/bank-accounts/{account_id}")
async def delete_bank_account(request: Request, account_id: str):
    """Delete bank account (Admin only)"""
    user = app.state.auth.get_current_user(request)
    if not user or user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        success = app.state.bank_account_model.delete_account(account_id)
        
        if success:
            return JSONResponse(content={
                "success": True,
                "message": "ลบบัญชีธนาคารสำเร็จ"
            })
        else:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "ไม่สามารถลบบัญชีธนาคารได้"}
            )
    except Exception as e:
        logger.error(f"Error deleting bank account: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "เกิดข้อผิดพลาดในการลบบัญชีธนาคาร"}
        )

@app.get("/api/user/line-accounts/{line_account_id}/bank-accounts")
async def get_line_account_bank_accounts(request: Request, line_account_id: str):
    """Get bank accounts linked to a LINE account"""
    user = app.state.auth.get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    # Check permission
    line_account = app.state.line_account_model.get_account_by_id(line_account_id)
    if not line_account:
        raise HTTPException(status_code=404, detail="LINE account not found")
    
    if user["role"] != UserRole.ADMIN and line_account["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        bank_accounts = app.state.bank_account_model.get_accounts_by_line_account(line_account_id)
        return JSONResponse(content={
            "success": True,
            "bank_accounts": bank_accounts
        })
    except Exception as e:
        logger.error(f"Error getting bank accounts: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "เกิดข้อผิดพลาดในการดึงข้อมูลบัญชีธนาคาร"}
        )

# ==================== Test API Routes ====================

@app.post("/api/user/line-accounts/{account_id}/test-slip-api")
async def test_slip_api(request: Request, account_id: str):
    """Test slip verification API"""
    user = app.state.auth.get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    # Check permission
    account = app.state.line_account_model.get_account_by_id(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    if user["role"] != UserRole.ADMIN and account["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        data = await request.json()
        api_key = data.get("api_key")
        api_provider = data.get("api_provider", "thunder")
        
        if not api_key:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "กรุณาระบุ API Key"}
            )
        
        # Test API connection
        if api_provider == "thunder":
            # Test Thunder API - ตาม documentation: https://document.thunder.in.th/documents/me
            test_url = "https://api.thunder.in.th/v1/me"
            headers = {"Authorization": f"Bearer {api_key}"}
            
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.get(test_url, headers=headers, timeout=10.0)
                    
                    if response.status_code == 200:
                        response_data = response.json()
                        logger.info(f"📄 Thunder API /v1/me response: {response_data}")
                        
                        # ดึงข้อมูลจาก data object ตาม Thunder API Documentation
                        # Response: { "status": 200, "data": { application, usedQuota, maxQuota, remainingQuota, expiredAt, currentCredit } }
                        data_obj = response_data.get("data", {})
                        
                        # ดึงข้อมูลโควต้าตาม Thunder API structure
                        application = data_obj.get("application", "")
                        used_quota = data_obj.get("usedQuota", 0)
                        max_quota = data_obj.get("maxQuota", 0)
                        remaining_quota = data_obj.get("remainingQuota", 0)
                        expired_at = data_obj.get("expiredAt", "")  # Thunder ใช้ expiredAt
                        current_credit = data_obj.get("currentCredit", 0)
                        
                        # แปลงวันหมดอายุเป็นรูปแบบไทย
                        expires_display = "ไม่ระบุ"
                        if expired_at:
                            try:
                                import pytz
                                from datetime import datetime
                                dt = datetime.fromisoformat(expired_at.replace('Z', '+00:00'))
                                thai_tz = pytz.timezone('Asia/Bangkok')
                                thai_dt = dt.astimezone(thai_tz)
                                expires_display = thai_dt.strftime("%d/%m/%Y %H:%M")
                            except Exception as e:
                                logger.warning(f"Error parsing expiry date: {e}")
                                expires_display = expired_at
                        
                        return JSONResponse(content={
                            "success": True,
                            "message": "เชื่อมต่อ Thunder API สำเร็จ",
                            "provider": "thunder",
                            # ข้อมูลโควต้าตาม Thunder API
                            "application": application,
                            "used_quota": used_quota,
                            "max_quota": max_quota,
                            "remaining_quota": remaining_quota,
                            "current_credit": current_credit,
                            # Legacy fields for backward compatibility
                            "balance": remaining_quota,
                            "expires_at": expires_display
                        })
                    elif response.status_code == 401:
                        return JSONResponse(
                            status_code=400,
                            content={
                                "success": False,
                                "message": "API Key ไม่ถูกต้อง กรุณาตรวจสอบ API Key อีกครั้ง"
                            }
                        )
                    elif response.status_code == 403:
                        # Handle access denied from Thunder API
                        try:
                            error_data = response.json()
                            error_msg = error_data.get("message", "access_denied")
                        except:
                            error_msg = "access_denied"
                        return JSONResponse(
                            status_code=400,
                            content={
                                "success": False,
                                "message": f"การเข้าถึงถูกปฏิเสธ: {error_msg}"
                            }
                        )
                    else:
                        return JSONResponse(
                            status_code=400,
                            content={
                                "success": False,
                                "message": f"ไม่สามารถเชื่อมต่อ Thunder API ได้ (Status: {response.status_code})"
                            }
                        )
            except httpx.ConnectError:
                return JSONResponse(
                    status_code=400,
                    content={
                        "success": False,
                        "message": "ไม่สามารถเชื่อมต่อ Thunder API ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต"
                    }
                )
        elif api_provider == "slipok":
            # Test SlipOK API
            test_url = "https://api.slipok.com/api/line/apikey/check"
            headers = {"x-authorization": api_key}
            
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.get(test_url, headers=headers, timeout=10.0)
                    
                    if response.status_code == 200:
                        return JSONResponse(content={
                            "success": True,
                            "message": "เชื่อมต่อ SlipOK API สำเร็จ",
                            "provider": "slipok"
                        })
                    elif response.status_code == 401:
                        return JSONResponse(
                            status_code=400,
                            content={
                                "success": False,
                                "message": "API Key ไม่ถูกต้อง กรุณาตรวจสอบ API Key อีกครั้ง"
                            }
                        )
                    else:
                        return JSONResponse(
                            status_code=400,
                            content={
                                "success": False,
                                "message": f"ไม่สามารถเชื่อมต่อ SlipOK API ได้ (Status: {response.status_code})"
                            }
                        )
            except httpx.ConnectError:
                return JSONResponse(
                    status_code=400,
                    content={
                        "success": False,
                        "message": "ไม่สามารถเชื่อมต่อ SlipOK API ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต"
                    }
                )
        else:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "ไม่รองรับผู้ให้บริการนี้"}
            )
            
    except httpx.TimeoutException:
        return JSONResponse(
            status_code=408,
            content={"success": False, "message": "การเชื่อมต่อ API หมดเวลา"}
        )
    except Exception as e:
        logger.error(f"Error testing slip API: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"เกิดข้อผิดพลาด: {str(e)}"}
        )
