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

# Import middleware
from middleware.auth import AuthMiddleware, get_current_user_from_request

# Import services
from services.chat_bot import get_chat_response, get_chat_response_async
from services.slip_checker import SlipChecker
from services.slip_formatter import create_beautiful_slip_flex_message, create_error_flex_message

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
        db = init_database()
        logger.info("✅ Database initialized")
        
        # Initialize models
        app.state.db = db.get_db()
        app.state.user_model = User(app.state.db)
        app.state.session_model = Session(app.state.db)
        app.state.line_account_model = LineAccount(app.state.db)
        app.state.slip_template_model = SlipTemplate(app.state.db)
        app.state.chat_message_model = ChatMessage(app.state.db)
        app.state.error_code_model = ErrorCode(app.state.db)
        app.state.response_message_model = ResponseMessage(app.state.db)
        
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
    ai_enabled: Optional[bool] = None
    ai_api_key: Optional[str] = None
    ai_model: Optional[str] = None
    ai_personality: Optional[str] = None
    slip_verification_enabled: Optional[bool] = None
    slip_api_provider: Optional[str] = None
    slip_api_key: Optional[str] = None

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
    
    total_users = len(app.state.user_model.get_all_users())
    total_line_accounts = len(app.state.line_account_model.get_all_accounts())
    
    recent_users = app.state.user_model.get_all_users()[:5]
    recent_line_accounts = app.state.line_account_model.get_all_accounts()[:5]
    
    return templates.TemplateResponse("admin_dashboard.html", {
        "request": request,
        "user": user,
        "total_users": total_users,
        "total_line_accounts": total_line_accounts,
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
    
    return templates.TemplateResponse("admin_users.html", {
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
    
    success = app.state.user_model.delete_user(user_id)
    if success:
        await manager.broadcast({
            "type": "info",
            "message": "ลบผู้ใช้สำเร็จ"
        })
        return {"success": True, "message": "ลบผู้ใช้สำเร็จ"}
    else:
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "ไม่สามารถลบผู้ใช้ได้"}
        )

@app.get("/admin/line-accounts", response_class=HTMLResponse)
async def admin_line_accounts(request: Request):
    """Admin LINE accounts management page"""
    user = app.state.auth.get_current_user(request)
    if not user or user["role"] != UserRole.ADMIN:
        return RedirectResponse(url="/login")
    
    line_accounts = app.state.line_account_model.get_all_accounts(include_inactive=True)
    
    return templates.TemplateResponse("admin_line_accounts.html", {
        "request": request,
        "user": user,
        "line_accounts": line_accounts
    })

@app.get("/user/chat-history", response_class=HTMLResponse)
async def user_chat_history(request: Request):
    """User chat history page"""
    user = app.state.auth.get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    
    # Placeholder for chat history data
    chat_history = [] 
    
    return templates.TemplateResponse("chat_history.html", {
        "request": request,
        "user": user,
        "chat_history": chat_history
    })

@app.get("/admin/chat-history", response_class=HTMLResponse)
async def admin_chat_history(request: Request):
    """Admin chat history page"""
    user = app.state.auth.get_current_user(request)
    if not user or user["role"] != UserRole.ADMIN:
        return RedirectResponse(url="/login")
    
    # Placeholder for chat history data
    chat_history = [] 
    
    return templates.TemplateResponse("chat_history.html", {
        "request": request,
        "user": user,
        "chat_history": chat_history
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
            return {"success": True, "message": "เพิ่มบัญชี LINE สำเร็จ", "account_id": account_id}
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
    
    return templates.TemplateResponse("user_dashboard.html", {
        "request": request,
        "user": user,
        "line_accounts": line_accounts
    })

@app.get("/user/line-accounts", response_class=HTMLResponse)
async def user_line_accounts(request: Request):
    """User LINE accounts page"""
    user = app.state.auth.get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    
    # Prevent Admin from accessing User LINE Accounts
    if user["role"] == UserRole.ADMIN:
        return RedirectResponse(url="/admin/line-accounts")
    
    line_accounts = app.state.line_account_model.get_accounts_by_owner(user["user_id"])
    
    return templates.TemplateResponse("user_line_accounts.html", {
        "request": request,
        "user": user,
        "line_accounts": line_accounts
    })

@app.get("/user/line-accounts/add", response_class=HTMLResponse)
async def add_line_account_page(request: Request):
    """Add LINE account page"""
    user = app.state.auth.get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    
    return templates.TemplateResponse("add_line_account.html", {
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
            return {"success": True, "message": "เพิ่มบัญชี LINE สำเร็จ", "account_id": account_id}
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
    
    return templates.TemplateResponse("line_account_settings.html", {
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
        settings = account.get("settings", {})
        
        if data.ai_enabled is not None:
            settings["ai_enabled"] = data.ai_enabled
        if data.ai_api_key is not None:
            settings["ai_api_key"] = data.ai_api_key
        if data.ai_model is not None:
            settings["ai_model"] = data.ai_model
        if data.ai_personality is not None:
            settings["ai_personality"] = data.ai_personality
        if data.slip_verification_enabled is not None:
            settings["slip_verification_enabled"] = data.slip_verification_enabled
        if data.slip_api_provider is not None:
            settings["slip_api_provider"] = data.slip_api_provider
        if data.slip_api_key is not None:
            # Test API Key before saving
            if data.slip_api_key:
                from services.slip_checker import test_thunder_api_connection
                test_result = test_thunder_api_connection(data.slip_api_key)
                if test_result.get("status") == "error" and test_result.get("response_code") not in [400, 404]:
                    # Only fail if it's a real connection/auth error, not just a bad test image
                    return JSONResponse(
                        status_code=400,
                        content={"success": False, "message": f"❌ Thunder API Key ไม่ถูกต้อง: {test_result.get('message')}"}
                    )
            settings["slip_api_key"] = data.slip_api_key
        
        if success:
            await manager.broadcast({
                "type": "success",
                "message": "อัปเดตการตั้งค่าสำเร็จ"
            })
            return {"success": True, "message": "อัปเดตการตั้งค่าสำเร็จ"}
        else:
            return JSONResponse(
                status_code=500,
                content={"success": False, "message": "ไม่สามารถอัปเดตการตั้งค่าได้"}
            )
    except Exception as e:
        logger.error(f"Error updating settings: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "เกิดข้อผิดพลาดในการอัปเดตการตั้งค่า"}
        )

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
async def advanced_settings(request: Request, channel_id: str):
    """Advanced settings page"""
    user = app.state.auth.get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    
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
    
    return templates.TemplateResponse("advanced_settings.html", {
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

@app.post("/webhook/{channel_id}")
async def line_webhook(request: Request, channel_id: str):
    """LINE Webhook endpoint for receiving messages"""
    try:
        # Get LINE account
        account = app.state.line_account_model.get_account_by_channel_id(channel_id)
        if not account:
            logger.error(f"❌ LINE account not found: {channel_id}")
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
            ai_personality = settings.get("ai_personality", "เป็นผู้ช่วยที่เป็นมิตรและช่วยเหลือดี")
            
            if ai_api_key:
                # Use account-specific AI settings
                response_text = await get_chat_response_async(
                    text,
                    personality=ai_personality,
                    model=ai_model,
                    api_key=ai_api_key
                )
            else:
                # Use default AI settings
                response_text = await get_chat_response_async(text)
        else:
            # Default response
            response_text = "ขอบคุณสำหรับข้อความของคุณ"
        
        # Save bot response
        app.state.chat_message_model.save_message(
            account_id=account["_id"],
            user_id=user_id,
            message_type="text",
            content=response_text,
            sender="bot"
        )
        
        # Send reply
        await send_line_reply(reply_token, response_text, account["channel_access_token"])
        
    except Exception as e:
        logger.error(f"❌ Error handling text message: {e}")

async def handle_image_message(message_id: str, reply_token: str, user_id: str, account: Dict[str, Any]):
    """Handle image message (slip verification)"""
    try:
        # Save image message
        app.state.chat_message_model.save_message(
            account_id=account["_id"],
            user_id=user_id,
            message_type="image",
            content="[รูปภาพ]",
            message_id=message_id,
            sender="user"
        )
        
        settings = account.get("settings", {})
        
        # Check if slip verification is enabled
        if not settings.get("slip_verification_enabled", False):
            await send_line_reply(
                reply_token,
                "ระบบตรวจสอบสลิปยังไม่เปิดใช้งาน",
                account["channel_access_token"]
            )
            return
        
        # Get slip API settings
        slip_api_provider = settings.get("slip_api_provider", "thunder")
        slip_api_key = settings.get("slip_api_key")
        
        if not slip_api_key:
            await send_line_reply(
                reply_token,
                "ยังไม่ได้ตั้งค่า API Key สำหรับตรวจสอบสลิป",
                account["channel_access_token"]
            )
            return
        
        # Send processing message
        await send_line_reply(
            reply_token,
            "กำลังตรวจสอบสลิป กรุณารอสักครู่...",
            account["channel_access_token"]
        )
        
        # Verify slip
        slip_checker = SlipChecker(api_token=slip_api_key, line_token=account["channel_access_token"])
        result = slip_checker.verify_slip(
            message_id=message_id,
            # line_token=account["channel_access_token"], # Already passed in SlipChecker init
            # api_token=slip_api_key, # Already passed in SlipChecker init
            provider=slip_api_provider
        )
        
        # Update statistics
        if result.get("status") == "success":
            app.state.line_account_model.increment_slip_count(account["_id"])
            result_text = f"✅ สลิปถูกต้อง"
        else:
            result_text = f"❌ {result.get('message', 'ไม่สามารถตรวจสอบสลิปได้')}"
        
        # Save slip verification result
        app.state.chat_message_model.save_message(
            account_id=account["_id"],
            user_id=user_id,
            message_type="text",
            content=result_text,
            sender="bot",
            metadata={"slip_result": result}
        )
        
        # Send result
        await send_slip_result(user_id, result, account["channel_access_token"])
        
    except Exception as e:
        logger.error(f"❌ Error handling image message: {e}")

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

async def send_slip_result(user_id: str, result: Dict[str, Any], access_token: str):
    """Send slip verification result"""
    try:
        url = "https://api.line.me/v2/bot/message/push"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {access_token}"
        }
        
        if result.get("status") == "success":
            # Create beautiful flex message
            flex_message = create_beautiful_slip_flex_message(result.get("data", {}))
            messages = [flex_message]
        else:
            # Create error message
            error_message = create_error_flex_message(result.get("message", "เกิดข้อผิดพลาด"))
            messages = [error_message]
        
        data = {
            "to": user_id,
            "messages": messages
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, json=data)
            if response.status_code != 200:
                logger.error(f"❌ LINE API error: {response.text}")
            else:
                logger.info("✅ Slip result sent successfully")
                
    except Exception as e:
        logger.error(f"❌ Error sending slip result: {e}")


# ==================== Slip Template Routes ====================

@app.get("/user/line-accounts/{account_id}/slip-templates", response_class=HTMLResponse)
async def slip_template_manager(request: Request, account_id: str):
    """Slip template manager page"""
    user = app.state.auth.get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    
    account = app.state.line_account_model.get_account_by_id(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Check permission
    if user["role"] != UserRole.ADMIN and account["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    # Initialize default templates if not exists
    app.state.slip_template_model.init_default_templates(account["channel_id"])
    
    templates_list = app.state.slip_template_model.get_templates_by_channel(account["channel_id"])
    
    return templates.TemplateResponse("slip_template_manager.html", {
        "request": request,
        "user": user,
        "account": account,
        "templates": templates_list
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
        
        template_id = app.state.slip_template_model.create_template(
            channel_id=account["channel_id"],
            template_name=data.get("template_name"),
            template_text=data.get("template_text"),
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
        success = app.state.slip_template_model.set_default_template(account["channel_id"], template_id)
        
        if success:
            await manager.broadcast({
                "type": "success",
                "message": "ตั้งเป็น Template เริ่มต้นสำเร็จ"
            })
            return {"success": True, "message": "ตั้งเป็น Template เริ่มต้นสำเร็จ"}
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
    
    return templates.TemplateResponse("chat_history.html", {
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
        
        for user_id in users:
            messages = app.state.chat_message_model.get_messages(account_id, user_id, limit=1)
            if messages:
                last_msg = messages[0]
                user_list.append({
                    "user_id": user_id,
                    "user_name": user_id,
                    "last_message_time": last_msg["timestamp"][:10] if "timestamp" in last_msg else "ไม่มีข้อความ"
                })
        
        return {"success": True, "users": user_list}
    except Exception as e:
        logger.error(f"Error getting chat users: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "เกิดข้อผิดพลาดในการดึงรายชื่อผู้ใช้"}
        )

@app.get("/api/chat-messages/{account_id}/{user_id}")
async def get_chat_messages(request: Request, account_id: str, user_id: str):
    """Get chat messages for a specific user"""
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
        messages = app.state.chat_message_model.get_conversation(account_id, user_id, limit=100)
        return {"success": True, "messages": messages}
    except Exception as e:
        logger.error(f"Error getting chat messages: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "เกิดข้อผิดพลาดในการดึงข้อความ"}
        )


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
