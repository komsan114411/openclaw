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

# Import middleware
from middleware.auth import AuthMiddleware, get_current_user_from_request

# Import services
from services.chat_bot import get_chat_response, get_chat_response_async
from services.slip_checker import SlipChecker
from services.slip_formatter import create_beautiful_slip_flex_message, create_error_flex_message

# Import utilities (New)
from utils.rate_limiter import get_rate_limiter
from utils.slip_utils import SlipVerificationManager, QuotaManager
from utils.security import get_secure_storage
from utils.session_manager import SessionManager
from utils.api_monitor import ApiQuotaMonitor

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
    
    async def broadcast(self, message: dict, timeout: float = 5.0):
        """Broadcast message to all connected clients with timeout per connection"""
        disconnected = []
        
        async def send_with_timeout(conn):
            try:
                async with asyncio.timeout(timeout):
                    await conn.send_json(message)
            except asyncio.TimeoutError:
                logger.warning(f"⏱️ Timeout sending to websocket")
                disconnected.append(conn)
            except Exception as e:
                logger.error(f"❌ Error sending to websocket: {e}")
                disconnected.append(conn)
        
        # Send to all connections concurrently
        tasks = [send_with_timeout(conn) for conn in self.active_connections]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        
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
    ai_api_key: Optional[str] = None
    ai_model: Optional[str] = None
    ai_system_prompt: Optional[str] = None
    ai_temperature: Optional[float] = None
    ai_fallback_message: Optional[str] = None
    slip_verification_enabled: Optional[bool] = None
    slip_api_provider: Optional[str] = None
    slip_api_key: Optional[str] = None
    slip_template_id: Optional[str] = None

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
    """Admin dashboard"""
    user = app.state.auth.get_current_user(request)
    if not user or user["role"] != UserRole.ADMIN:
        return RedirectResponse(url="/login")
    
    total_users = app.state.db.users.count_documents({"is_active": True})
    total_line_accounts = app.state.db.line_accounts.count_documents({})
    
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
    
    return templates.TemplateResponse("admin/dashboard.html", {
        "request": request,
        "user": user,
        "total_users": total_users,
        "total_line_accounts": total_line_accounts,
        "total_messages_today": total_messages_today,
        "total_slips_verified": total_slips_verified,
        "recent_users": recent_users,
        "recent_line_accounts": recent_line_accounts
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
    
    banks = app.state.bank_model.get_all_banks()
    return [app.state.bank_model.to_dict(bank) for bank in banks]

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
            update_data['logo_base64'] = data['logo_base64']
        
        # Update bank
        success = app.state.bank_model.update_bank(bank_id, update_data)
        
        if success:
            return {"success": True, "message": "อัปเดตธนาคารสำเร็จ"}
        else:
            raise HTTPException(status_code=500, detail="Failed to update bank")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/admin/api/banks/init-thunder-banks")
async def init_thunder_banks(request: Request):
    """Initialize banks from Thunder API bank codes (Admin only)"""
    user = app.state.auth.get_current_user(request)
    if not user or user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    # Bank data from Thunder API
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
        
        for bank_data in BANKS:
            code = bank_data["code"]
            abbr = bank_data["abbr"]
            name = bank_data["name"]
            
            # Check if bank already exists
            existing_bank = app.state.bank_model.get_bank_by_code(code)
            
            if existing_bank:
                # Update existing bank (keep logo if exists)
                update_data = {
                    "name": name,
                    "abbreviation": abbr,
                    "is_active": True
                }
                app.state.bank_model.update_bank(str(existing_bank["_id"]), update_data)
                updated_count += 1
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
        
        return {
            "success": True,
            "message": f"เพิ่มข้อมูลธนาคารสำเร็จ",
            "added": added_count,
            "updated": updated_count,
            "total": added_count + updated_count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/bank-logo/{bank_code}")
async def get_bank_logo(bank_code: str):
    """Get bank logo by code"""
    bank = app.state.bank_model.get_bank_by_code(bank_code)
    if not bank or not bank.get("logo_base64"):
        raise HTTPException(status_code=404, detail="Bank logo not found")
    
    return {"logo_base64": bank["logo_base64"]}

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
        if data.ai_api_key is not None:
            settings["ai_api_key"] = data.ai_api_key
        if data.ai_model is not None:
            settings["ai_model"] = data.ai_model
        if data.ai_system_prompt is not None:
            settings["ai_system_prompt"] = data.ai_system_prompt
        if data.ai_temperature is not None:
            settings["ai_temperature"] = data.ai_temperature
        if data.ai_fallback_message is not None:
            settings["ai_fallback_message"] = data.ai_fallback_message
        
        # Update slip verification settings
        if data.slip_verification_enabled is not None:
            settings["slip_verification_enabled"] = data.slip_verification_enabled
        if data.slip_api_provider is not None:
            settings["slip_api_provider"] = data.slip_api_provider
        if data.slip_api_key is not None:
            settings["slip_api_key"] = data.slip_api_key
        if data.slip_template_id is not None:
            settings["slip_template_id"] = data.slip_template_id
        
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
            logger.error(f"❌ Invalid signature for account: {account_id}")
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
    """Handle image message (slip verification)"""
    try:
        # 1. Check if slip verification is enabled
        settings = account.get("settings", {})
        if not settings.get("slip_verification_enabled", False):
            await send_line_reply(
                reply_token,
                "ระบบตรวจสอบสลิปยังไม่เปิดใช้งาน",
                account["channel_access_token"]
            )
            return
            
        # 1. Send immediate feedback (UX Improvement)
        await send_line_reply(
            reply_token,
            "📥 กำลังดาวน์โหลดและตรวจสอบรูปภาพ...",
            account["channel_access_token"]
        )

        # 2. Check Quota (Bug #2 & #11 Fix)
        # Use owner_id for quota check (quota belongs to account owner)
        owner_id = account.get("owner_id")
        reservation_id = None
        
        if owner_id:
            reservation_id = app.state.quota_manager.reserve_quota(owner_id)
            if not reservation_id:
                # Quota exceeded
                await send_line_reply(
                    reply_token,
                    "❌ โควต้าการตรวจสอบสลิปของคุณหมดแล้ว กรุณาเติมแพ็กเกจ",
                    account["channel_access_token"]
                )
                logger.warning(f"⚠️ Quota exceeded for owner {owner_id}")
                return

        # 3. Download image from LINE
        image_data = None
        try:
            image_url = f"https://api-data.line.me/v2/bot/message/{message_id}/content"
            headers = {"Authorization": f"Bearer {account['channel_access_token']}"}
            response = requests.get(image_url, headers=headers, timeout=30)
            response.raise_for_status()
            image_data = response.content
            logger.info(f"✅ Downloaded image from LINE: {len(image_data)} bytes")
            
            # Image Validation (Bug #13 Fix)
            # 1. Check size (Max 10MB)
            if len(image_data) > 10 * 1024 * 1024:
                logger.warning(f"⚠️ Image too large: {len(image_data)} bytes")
                if reservation_id and owner_id:
                    app.state.quota_manager.rollback_quota(owner_id, reservation_id)
                await send_line_reply(
                    reply_token,
                    "❌ รูปภาพมีขนาดใหญ่เกินไป (สูงสุด 10MB) กรุณาลองใหม่",
                    account["channel_access_token"]
                )
                return

            # 2. Check type (Magic numbers)
            is_valid_image = False
            if image_data.startswith(b'\xff\xd8'): # JPEG
                is_valid_image = True
            elif image_data.startswith(b'\x89PNG\r\n\x1a\n'): # PNG
                is_valid_image = True
                
            if not is_valid_image:
                logger.warning("⚠️ Invalid image format")
                if reservation_id and owner_id:
                    app.state.quota_manager.rollback_quota(owner_id, reservation_id)
                await send_line_reply(
                    reply_token,
                    "❌ ไฟล์ไม่ถูกต้อง กรุณาส่งรูปภาพ (JPEG/PNG) เท่านั้น",
                    account["channel_access_token"]
                )
                return

        except Exception as e:
            logger.error(f"❌ Error downloading image from LINE: {e}")
            # Rollback quota if download fails
            if reservation_id and owner_id:
                app.state.quota_manager.rollback_quota(owner_id, reservation_id)
                
            await send_line_reply(
                reply_token,
                "❌ ไม่สามารถดาวน์โหลดรูปภาพได้ กรุณาลองส่งใหม่อีกครั้ง",
                account["channel_access_token"]
            )
            return
        
        # 4. Save image message
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
        
        # 5. Get slip API settings
        slip_api_provider = settings.get("slip_api_provider", "thunder")
        slip_api_key = settings.get("slip_api_key")
        
        # Decrypt API key if encrypted (Bug #16 Fix)
        # Note: settings.get might return plain text from env, but if we used account settings override:
        account_settings = account.get("settings", {})
        if account_settings.get("slip_api_key"):
            # Use account specific key
            encrypted_key = account_settings.get("slip_api_key")
            try:
                slip_api_key = app.state.secure_storage.decrypt(encrypted_key)
            except:
                # Fallback to plain text if decryption fails (legacy support)
                slip_api_key = encrypted_key
        
        if not slip_api_key:
            if reservation_id and owner_id:
                app.state.quota_manager.rollback_quota(owner_id, reservation_id)
                
            await send_line_reply(
                reply_token,
                "❌ ระบบตรวจสอบสลิปยังไม่พร้อมใช้งาน\nกรุณาติดต่อแอดมินเพื่อตั้งค่าระบบ",
                account["channel_access_token"]
            )
            return
        
        # 6. Verify slip
        logger.info(f"🔍 Starting slip verification for message_id: {message_id}")
        
        slip_checker = SlipChecker(api_token=slip_api_key, line_token=account["channel_access_token"])
        
        start_time = datetime.now()
        result = slip_checker.verify_slip(
            message_id=message_id,
            test_image_data=image_data,
            provider=slip_api_provider
        )
        end_time = datetime.now()
        duration_ms = int((end_time - start_time).total_seconds() * 1000)
        
        logger.info(f"📊 Slip verification result: {result.get('status')} ({duration_ms}ms)")
        
        # Record API usage (Bug #10 Fix)
        if owner_id:
            is_api_success = result.get("status") in ["success", "duplicate"]
            # Note: duplicate is considered a successful API call (it returned valid data)
            # But if status is "error", it's a failed call
            
            app.state.api_monitor.record_api_call(
                provider=slip_api_provider,
                success=is_api_success,
                account_id=account["_id"], # Use LINE account ID for tracking
                response_time_ms=duration_ms
            )
        
        # 7. Handle Result & Quota Confirmation
        status = result.get("status")
        
        if status == "success":
            # Confirm quota usage
            if reservation_id and owner_id:
                app.state.quota_manager.confirm_quota(owner_id, reservation_id)
                
            # Record slip (Atomic)
            trans_ref = result.get("data", {}).get("transRef", "")
            amount = result.get("data", {}).get("amount", 0)
            
            is_new, msg = app.state.slip_manager.record_slip_atomic(
                account_id=str(account["_id"]),
                user_id=user_id,
                trans_ref=trans_ref,
                amount=float(amount) if amount else 0,
                status=status,
                metadata={"message_id": message_id}
            )
            
            if not is_new:
                # It's a duplicate (race condition caught)
                result["status"] = "duplicate"
                result["message"] = "สลิปนี้ถูกตรวจสอบไปแล้ว (Race Condition)"
                result["duplicate_count"] = 1 # Approximate
                logger.warning(f"⚠️ Duplicate slip caught by atomic check: {trans_ref}")
            
            app.state.line_account_model.increment_slip_count(account["_id"])
            result_text = f"✅ สลิปถูกต้อง"
            
        elif status == "duplicate":
            # Confirm quota usage (duplicates still count? usually yes, but depends on policy)
            # For now, let's say duplicates DON'T count against quota to be nice
            if reservation_id and owner_id:
                app.state.quota_manager.rollback_quota(owner_id, reservation_id)
                
            trans_ref = result.get("data", {}).get("transRef", "")
            duplicate_count = app.state.slip_history_model.get_duplicate_count(trans_ref, account["_id"])
            
            if duplicate_count > 0:
                result["duplicate_count"] = duplicate_count
                result["message"] = f"🔄 สลิปซ้ำ +{duplicate_count}"
                result_text = f"🔄 สลิปซ้ำ +{duplicate_count}"
            else:
                result_text = f"🔄 สลิปนี้เคยถูกตรวจสอบแล้ว"
                
        else:
            # Error / Not Found / QR Not Found
            # Rollback quota
            if reservation_id and owner_id:
                app.state.quota_manager.rollback_quota(owner_id, reservation_id)
                
            if status == "error":
                result_text = f"❌ {result.get('message', 'ไม่สามารถตรวจสอบสลิปได้')}"
            elif status == "not_found":
                result_text = f"🔍 {result.get('message', 'ไม่พบข้อมูลสลิป')}"
            elif status == "qr_not_found":
                result_text = f"📱 {result.get('message', 'ไม่พบ QR Code ในรูปภาพ')}"
            else:
                result_text = f"⚠️ สถานะการตรวจสอบไม่ชัดเจน: {status}"
        
        # 8. Save result message
        app.state.chat_message_model.save_message(
            account_id=account["_id"],
            user_id=user_id,
            message_type="text",
            content=result_text,
            sender="bot",
            metadata={"slip_result": result}
        )
        
        # 9. Send result with template
        slip_template_id = settings.get("slip_template_id")
        await send_slip_result(user_id, result, account["channel_access_token"], account.get("channel_id"), slip_template_id)
        
    except Exception as e:
        logger.error(f"❌ Error handling image message: {e}")
        # Emergency rollback
        try:
            if 'reservation_id' in locals() and reservation_id and 'owner_id' in locals() and owner_id:
                app.state.quota_manager.rollback_quota(owner_id, reservation_id)
        except:
            pass

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

def render_flex_template(flex_template: Dict[str, Any], result: Dict[str, Any]) -> Dict[str, Any]:
    """Render Flex Message template with result data"""
    try:
        import json
        import copy
        from services.slip_formatter import get_bank_logo, mask_account_formatted
        
        # Extract data from result (handle both formats)
        if isinstance(result, dict) and "data" in result:
            data = result["data"] or {}
            status = result.get("status", "success")
        else:
            data = result if isinstance(result, dict) else {}
            status = "success"
        
        # Extract amount
        amount_obj = data.get("amount", {})
        if isinstance(amount_obj, dict):
            amount = amount_obj.get("amount", 0)
        else:
            amount = amount_obj
        amount_display = f"{amount:,.2f}"
        
        # Extract sender/receiver (รองรับทั้ง string และ dict)
        sender = data.get("sender", {})
        receiver = data.get("receiver", {})
        
        if isinstance(sender, str):
            s_name = sender
            s_bank = data.get("sender_bank", "")
            s_acc = ""
        else:
            sender_name = sender.get("account", {}).get("name", {})
            s_name = sender_name.get("th", "") or sender_name.get("en", "") or data.get("sender_name", "ไม่ระบุชื่อ")
            s_bank = sender.get("bank", {}).get("short", "") or sender.get("bank", {}).get("name", "") or data.get("sender_bank", "")
            s_acc = sender.get("account", {}).get("bank", {}).get("account", "")
            s_code = sender.get("bank", {}).get("id", "")
        
        if isinstance(receiver, str):
            r_name = receiver
            r_bank = data.get("receiver_bank", "")
            r_acc = ""
        else:
            receiver_name = receiver.get("account", {}).get("name", {})
            r_name = receiver_name.get("th", "") or receiver_name.get("en", "") or data.get("receiver_name", "ไม่ระบุชื่อ")
            r_bank = receiver.get("bank", {}).get("short", "") or receiver.get("bank", {}).get("name", "") or data.get("receiver_bank", "")
            r_acc = receiver.get("account", {}).get("bank", {}).get("account", "")
            r_code = receiver.get("bank", {}).get("id", "")
        
        # Format account numbers
        s_acc_display = mask_account_formatted(s_acc) if s_acc else ""
        r_acc_display = mask_account_formatted(r_acc) if r_acc else ""
        
        # Get bank logos
        try:
            s_logo = get_bank_logo(s_code if not isinstance(sender, str) else "", s_bank, db=None)
            r_logo = get_bank_logo(r_code if not isinstance(receiver, str) else "", r_bank, db=None)
        except:
            s_logo = "https://via.placeholder.com/48"
            r_logo = "https://via.placeholder.com/48"
        
        # Extract date/time
        date_str = data.get("date", data.get("trans_date", "")) or "-"
        time_str = data.get("time", data.get("trans_time", "")) or "-"
        ref_no = data.get("transRef") or data.get("reference") or "-"
        verified_time = datetime.now().strftime("%d/%m/%Y %H:%M")
        
        # Create replacement map
        replacements = {
            "{{amount}}": amount_display,
            "{{sender_name}}": s_name,
            "{{sender_bank}}": s_bank,
            "{{sender_account}}": s_acc_display,
            "{{sender_bank_logo}}": s_logo,
            "{{receiver_name}}": r_name,
            "{{receiver_bank}}": r_bank,
            "{{receiver_account}}": r_acc_display,
            "{{receiver_bank_logo}}": r_logo,
            "{{date}}": date_str,
            "{{time}}": time_str,
            "{{reference}}": ref_no,
            "{{verified_time}}": verified_time
        }
        
        # Convert template to JSON string, replace variables, then parse back
        template_str = json.dumps(flex_template)
        for key, value in replacements.items():
            template_str = template_str.replace(key, str(value))
        
        rendered_template = json.loads(template_str)
        return rendered_template
        
    except Exception as e:
        logger.error(f"❌ Error rendering flex template: {e}")
        import traceback
        traceback.print_exc()
        # Return original template as fallback
        return flex_template

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
        sender_bank_logo = get_bank_logo(sender_bank_code, sender_bank)
        receiver_bank_logo = get_bank_logo(receiver_bank_code, receiver_bank)
        
        # Get verified time
        import pytz
        thai_tz = pytz.timezone("Asia/Bangkok")
        verified_time = datetime.now(thai_tz).strftime("%d %b %y, %H:%M น.").replace("Jan","ม.ค.").replace("Feb","ก.พ.").replace("Mar","มี.ค.").replace("Apr","เม.ย.").replace("May","พ.ค.").replace("Jun","มิ.ย.").replace("Jul","ก.ค.").replace("Aug","ส.ค.").replace("Sep","ก.ย.").replace("Oct","ต.ค.").replace("Nov","พ.ย.").replace("Dec","ธ.ค.")
        
        # Prepare replacement data
        replacement_data = {
            "{{amount}}": amount_display,
            "{{amount_number}}": amount_number,
            "{{datetime}}": datetime_str,
            "{{reference}}": reference,
            "{{sender_name}}": sender_name,
            "{{sender_account}}": sender_account,
            "{{sender_bank}}": sender_bank,
            "{{sender_bank_logo}}": sender_bank_logo,
            "{{receiver_name}}": receiver_name,
            "{{receiver_account}}": receiver_account,
            "{{receiver_bank}}": receiver_bank,
            "{{receiver_bank_logo}}": receiver_bank_logo,
            "{{verified_time}}": verified_time
        }
        
        # Deep copy template to avoid modifying original
        flex_copy = copy.deepcopy(flex_template)
        
        # Convert to JSON string, replace, and convert back
        flex_json = json.dumps(flex_copy)
        for key, value in replacement_data.items():
            flex_json = flex_json.replace(key, str(value))
        
        rendered_flex = json.loads(flex_json)
        
        logger.info(f"✅ Flex template rendered successfully")
        return rendered_flex
    except Exception as e:
        logger.error(f"❌ Error rendering flex template: {e}", exc_info=True)
        return flex_template

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
        
        messages = []
        
        # Get template (prefer selected template over default)
        template = None
        if slip_template_id:
            try:
                from bson import ObjectId
                template = app.state.slip_template_model.get_template_by_id(slip_template_id)
                if template:
                    logger.info(f"🎯 Using selected template: {template.get('template_name')}")
                    logger.info(f"📋 Template type: {template.get('template_type')}")
                else:
                    logger.warning(f"⚠️ Template not found for ID: {slip_template_id}")
            except Exception as e:
                logger.warning(f"⚠️ Could not get selected template: {e}")
        
        # Fallback to default template
        if not template and channel_id:
            try:
                template = app.state.slip_template_model.get_default_template(channel_id)
                if template:
                    logger.info(f"📋 Using default template: {template.get('template_name')}")
                    logger.info(f"📋 Template type: {template.get('template_type')}")
                else:
                    logger.warning(f"⚠️ No default template found for channel: {channel_id}")
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
                        # Fallback to default flex message with template_id
                        flex_message = create_beautiful_slip_flex_message(result, slip_template_id, app.state.db)
                        messages = [flex_message]
            else:
                # Fallback to default flex message with template_id
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
            error_message = create_error_flex_message(result.get("message", "เกิดข้อผิดพลาด"))
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
        
        logger.info(f"💬 Sending {len(messages)} message(s)")
        
        data = {
            "to": user_id,
            "messages": messages
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, headers=headers, json=data)
            logger.info(f"📡 LINE API response status: {response.status_code}")
            
            if response.status_code != 200:
                logger.error(f"❌ LINE API error: {response.text}")
                logger.error(f"📊 Request data: {data}")
            else:
                logger.info("✅ Slip result sent successfully")
                logger.info(f"📊 Response: {response.text}")
                
    except Exception as e:
        logger.error(f"❌ Error sending slip result: {e}")
        logger.error(f"📊 User ID: {user_id}")
        logger.error(f"📊 Result: {result}")
        logger.error(f"📊 Template ID: {slip_template_id}")
        import traceback
        logger.error(f"📊 Traceback: {traceback.format_exc()}")


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
        
        # สร้างข้อมูลตัวอย่าง
        sample_result = {
            "status": "success",
            "data": {
                "amount": {"amount": 369.00},
                "sender": {
                    "account": {
                        "name": {"th": "นาย วินฉลิม แก้นนี"},
                        "bank": {"account": "xxx-x-x-6021x"}
                    },
                    "bank": {"short": "กรุงเทพ", "id": "002"}
                },
                "receiver": {
                    "account": {
                        "name": {"th": "บจก. ทินเดอร์ โซลูชั่น"},
                        "bank": {"account": "xxx-x-x-8041x"}
                    },
                    "bank": {"short": "กสิกรไทย", "id": "004"}
                },
                "date": "22 ต.ค. 2566",
                "time": "10:30",
                "transRef": "53070260912"
            }
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
                flex_message = create_beautiful_slip_flex_message(sample_result)
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
        
        for user_id in users:
            messages = app.state.chat_message_model.get_conversation(account_id, user_id, limit=1)
            if messages:
                last_msg = messages[0]
                # Get user profile from LINE
                user_name = user_id
                picture_url = None
                try:
                    # ใช้ LINE Bot API ดึงโปรไฟล์ผู้ใช้
                    import requests
                    headers = {"Authorization": f"Bearer {account.get('channel_access_token')}"}
                    response = requests.get(f"https://api.line.me/v2/bot/profile/{user_id}", headers=headers)
                    if response.status_code == 200:
                        profile = response.json()
                        user_name = profile.get("displayName", user_id)
                        picture_url = profile.get("pictureUrl")
                except Exception as e:
                    logger.error(f"Error getting LINE profile: {e}")
                
                user_list.append({
                    "user_id": user_id,
                    "user_name": user_name,
                    "picture_url": picture_url,
                    "last_message": last_msg.get("text", last_msg.get("message_type", "[ไม่มีข้อความ]")),
                    "last_message_time": last_msg.get("timestamp", "")
                })
        
        return {"success": True, "users": user_list}
    except Exception as e:
        logger.error(f"Error getting chat users: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "เกิดข้อผิดพลาดในการดึงรายชื่อผู้ใช้"}
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
        # First, try to get image from database
        from bson import ObjectId
        message = app.state.chat_message_model.collection.find_one({
            "message_id": message_id,
            "account_id": account_id
        })
        
        if message and message.get("metadata", {}).get("image_data"):
            # Decode base64 image from database
            import base64
            image_data = base64.b64decode(message["metadata"]["image_data"])
            from fastapi.responses import Response
            return Response(
                content=image_data,
                media_type="image/jpeg"
            )
        
        # Fallback: Get image from LINE API if not in database
        image_url = f"https://api-data.line.me/v2/bot/message/{message_id}/content"
        headers = {
            "Authorization": f"Bearer {account['channel_access_token']}"
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(image_url, headers=headers)
            
            if response.status_code == 200:
                # Store image in database for future use
                import base64
                image_base64 = base64.b64encode(response.content).decode('utf-8')
                if message:
                    app.state.chat_message_model.collection.update_one(
                        {"_id": message["_id"]},
                        {"$set": {"metadata.image_data": image_base64}}
                    )
                
                from fastapi.responses import Response
                return Response(
                    content=response.content,
                    media_type=response.headers.get("content-type", "image/jpeg")
                )
            else:
                raise HTTPException(status_code=response.status_code, detail="Failed to get image from LINE")
                
    except Exception as e:

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
            # Test Thunder API
            test_url = "https://api.thunder.in.th/v1/me"
            headers = {"Authorization": f"Bearer {api_key}"}
            
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.get(test_url, headers=headers, timeout=10.0)
                    
                    if response.status_code == 200:
                        data = response.json()
                        # ดึงข้อมูลยอดเหลือและวันหมดอายุ
                        balance = data.get("balance", 0)
                        expires_at = data.get("expiresAt", "")
                        
                        # แปลงวันหมดอายุเป็นรูปแบบไทย
                        expires_display = "ไม่ระบุ"
                        if expires_at:
                            try:
                                import pytz
                                from datetime import datetime
                                dt = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
                                thai_tz = pytz.timezone('Asia/Bangkok')
                                thai_dt = dt.astimezone(thai_tz)
                                expires_display = thai_dt.strftime("%d/%m/%Y %H:%M")
                            except Exception as e:
                                logger.warning(f"Error parsing expiry date: {e}")
                                expires_display = expires_at
                        
                        return JSONResponse(content={
                            "success": True,
                            "message": "เชื่อมต่อ Thunder API สำเร็จ",
                            "provider": "thunder",
                            "balance": balance,
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
