# main_updated.py (Fixed Complete Version)
import json
import hmac
import hashlib
import base64
import asyncio
import time
from datetime import datetime
from typing import Dict, Any, Optional, List, Union
import logging
import os
import sys

# เพิ่มใน import section
import requests
from requests.exceptions import RequestException, Timeout, ConnectionError

import httpx
from fastapi import FastAPI, Request, HTTPException, status, WebSocket, WebSocketDisconnect, Header
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse

# เพิ่มพาธปัจจุบันเข้าไปใน sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

# ตั้งค่า logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("main_app")

app = FastAPI(title="LINE OA Middleware (Enhanced with Push)")
templates = Jinja2Templates(directory="templates")

# Global variables for LINE Bot
line_bot_api = None
line_handler = None

class NotificationManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.pending_notifications: List[Dict] = []
        self.slip_processing_status = {}
        self.duplicate_slip_cache: Dict[str, Dict] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"📱 WebSocket connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"📱 WebSocket disconnected. Total connections: {len(self.active_connections)}")

    async def send_notification(self, message: str, notification_type: str = "info", data: Dict = None):
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
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(notification))
            except Exception as e:
                logger.error(f"Error sending notification: {e}")
                disconnected.append(connection)

        for conn in disconnected:
            self.disconnect(conn)

notification_manager = NotificationManager()

# Import modules with error handling
IS_READY = True
config_manager = None
init_database = None
save_chat_history = None
get_chat_history_count = None
get_recent_chat_history = None
get_user_chat_history = None
get_chat_response = None
verify_slip_multiple_providers = None
extract_slip_info_from_text = None
verify_slip_with_thunder = None
kbank_checker = None

try:
    from utils.config_manager import config_manager
    logger.info("✅ Config manager imported")
    
    from models.database import (
        init_database, save_chat_history, get_chat_history_count, 
        get_recent_chat_history, get_user_chat_history
    )
    logger.info("✅ Database modules imported")
    
    from services.chat_bot import get_chat_response
    logger.info("✅ Chat bot imported")
    
    from services.slip_checker import verify_slip_with_thunder
    logger.info("✅ Thunder slip checker imported")
    
    from services.kbank_checker import kbank_checker
    logger.info("✅ KBank checker imported")
    
    from services.enhanced_slip_checker import (
        verify_slip_multiple_providers,
        extract_slip_info_from_text
    )
    logger.info("✅ Enhanced slip checker imported")
    
    logger.info("✅ All core modules imported successfully.")
    
except ImportError as e:
    logger.error(f"❌ Failed to import core modules: {e}")
    IS_READY = False
    
    # Fallback functions
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
    
    def init_database(): pass
    def save_chat_history(user_id, direction, message, sender): pass
    def get_chat_history_count(): return 0
    def get_recent_chat_history(limit=50): return []
    def get_user_chat_history(user_id, limit=10): return []
    def get_chat_response(text, user_id): return "ขออภัย ระบบ AI ไม่พร้อมใช้งานในขณะนี้"
    def verify_slip_multiple_providers(message_id=None, test_image_data=None, bank_code=None, trans_ref=None):
        return {"status": "error", "message": "ไม่สามารถตรวจสอบสลิปได้เนื่องจากระบบไม่พร้อมใช้งาน"}
    def extract_slip_info_from_text(text): return {"bank_code": None, "trans_ref": None}
    def verify_slip_with_thunder(message_id, test_image_data): return {"status": "error", "message": "Thunder API ไม่พร้อมใช้งาน"}
    
    # Dummy KBank checker
    class DummyKBankChecker:
        def verify_slip(self, bank_id, trans_ref):
            return {"status": "error", "message": "KBank API ไม่พร้อมใช้งาน"}
        def _get_access_token(self):
            return None
    
    kbank_checker = DummyKBankChecker()

# API Status functions
def get_api_status_summary():
    """ดึงสรุปสถานะ API (Fallback version)"""
    try:
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
    """รีเซ็ต API failure cache (Fallback version)"""
    logger.info("🔄 API failure cache reset (fallback)")
    return True

# Initialize database
try:
    logger.info("Initializing database...")
    if IS_READY and init_database:
        init_database()
    logger.info("✅ Database initialized successfully")
except Exception as e:
    logger.error(f"❌ Database initialization error: {e}")

# ====================== LINE Bot Functions ======================

def init_line_bot():
    """Initialize LINE Bot API (without SDK for now)"""
    global line_bot_api, line_handler
    
    access_token = config_manager.get("line_channel_access_token")
    channel_secret = config_manager.get("line_channel_secret")
    
    if access_token and channel_secret:
        line_bot_api = {
            "access_token": access_token,
            "channel_secret": channel_secret
        }
        line_handler = True
        logger.info("✅ LINE Bot credentials loaded")
        return True
    else:
        logger.warning("⚠️ LINE credentials not found")
        return False

# ====================== Utility Functions ======================

def verify_line_signature(body: bytes, signature: str, channel_secret: str) -> bool:
    """Verify LINE webhook signature"""
    if not channel_secret:
        logger.warning("⚠️ LINE Channel Secret is empty - skipping signature verification")
        return True
    
    try:
        h = hmac.new(channel_secret.encode(), body, hashlib.sha256).digest()
        computed = base64.b64encode(h).decode()
        is_valid = hmac.compare_digest(computed, signature)
        return is_valid
    except Exception as e:
        logger.error(f"❌ Signature verification error: {e}")
        return False

async def send_line_reply(reply_token: str, text: str, max_retries: int = 3) -> bool:
    """Send LINE reply message asynchronously"""
    access_token = config_manager.get("line_channel_access_token")
    if not access_token:
        logger.error("❌ LINE_CHANNEL_ACCESS_TOKEN is missing")
        return False
    
    if not reply_token or reply_token.strip() == "" or len(reply_token.strip()) < 10:
        logger.error("❌ Reply token is empty, invalid, or too short")
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
    
    async with httpx.AsyncClient() as client:
        for attempt in range(max_retries):
            try:
                logger.info(f"📤 Sending LINE reply (attempt {attempt + 1}/{max_retries}, length: {len(text)} chars)")
                response = await client.post(url, headers=headers, json=payload, timeout=15)
                logger.info(f"📤 LINE Reply API response: {response.status_code}")
                
                if response.status_code == 200:
                    logger.info(f"✅ LINE reply sent successfully")
                    return True
                elif response.status_code == 400:
                    try:
                        error_data = response.json()
                        error_message = error_data.get('message', 'Bad Request')
                        logger.error(f"❌ LINE Reply API 400 Bad Request: {error_message}")
                        if 'invalid' in error_message.lower() and 'token' in error_message.lower():
                            logger.error("❌ Reply token expired - not retrying")
                            return False
                    except:
                        logger.error(f"❌ LINE Reply API 400 Bad Request: {response.text}")
                    return False
                elif response.status_code == 401:
                    logger.error(f"❌ LINE Reply API 401 Unauthorized - Check access token")
                    return False
                elif response.status_code == 403:
                    logger.error(f"❌ LINE Reply API 403 Forbidden - Check permissions")
                    return False
                elif response.status_code >= 500:
                    logger.warning(f"⚠️ LINE Reply API {response.status_code} Server Error - will retry")
                    if attempt < max_retries - 1:
                        await asyncio.sleep(1)
                        continue
                else:
                    logger.error(f"❌ LINE Reply API HTTP {response.status_code}: {response.text}")
                    return False
            except (httpx.TimeoutException, httpx.RequestError) as e:
                logger.warning(f"⚠️ LINE Reply API request error (attempt {attempt + 1}): {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(1)
                    continue
            except Exception as e:
                logger.exception(f"❌ Unexpected error sending LINE reply: {e}")
                return False
    
    logger.error(f"❌ Failed to send LINE reply after {max_retries} attempts")
    return False

async def send_line_push(user_id: str, text: str, max_retries: int = 3) -> bool:
    """Send LINE push message asynchronously (Enhanced with better error handling)"""
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

    async with httpx.AsyncClient() as client:
        for attempt in range(max_retries):
            try:
                logger.info(f"📤 Sending LINE push message (attempt {attempt + 1}/{max_retries}, user: {user_id[:10]}..., length: {len(text)} chars)")
                response = await client.post(url, headers=headers, json=payload, timeout=15)
                logger.info(f"📤 LINE Push API response: {response.status_code}")
                
                if response.status_code == 200:
                    logger.info("✅ Push message sent to LINE successfully")
                    await notification_manager.send_notification(f"✅ ส่งข้อความ Push สำเร็จไปยัง {user_id[:8]}...", "success")
                    return True
                elif response.status_code == 400:
                    try:
                        error_data = response.json()
                        error_message = error_data.get('message', 'Bad Request')
                        logger.error(f"❌ LINE Push API 400 Bad Request: {error_message}")
                        await notification_manager.send_notification(f"❌ Push API 400 Error: {error_message}", "error")
                    except:
                        logger.error(f"❌ LINE Push API 400 Bad Request: {response.text}")
                    return False
                elif response.status_code == 401:
                    logger.error(f"❌ LINE Push API 401 Unauthorized - Check access token")
                    await notification_manager.send_notification("❌ LINE Access Token ไม่ถูกต้องหรือหมดอายุ", "error")
                    return False
                elif response.status_code == 403:
                    try:
                        error_data = response.json()
                        error_message = error_data.get('message', 'Forbidden')
                        logger.error(f"❌ LINE Push API 403 Forbidden: {error_message}")
                        
                        if 'blocked' in error_message.lower():
                            logger.error("❌ User has blocked the bot")
                            await notification_manager.send_notification(f"⚠️ ผู้ใช้ {user_id[:8]}... ได้บล็อกบอท", "warning")
                        elif 'not available' in error_message.lower() or 'api' in error_message.lower():
                            logger.error("❌ Push message API not available for this account type")
                            await notification_manager.send_notification("❌ Push Message API ไม่รองรับสำหรับ Account นี้ (ต้องอัปเกรด)", "error")
                        elif 'permission' in error_message.lower():
                            logger.error("❌ Insufficient permissions for push message")
                            await notification_manager.send_notification("❌ ไม่มีสิทธิ์ส่ง Push Message", "error")
                        else:
                            logger.error("❌ Access denied - check permissions or account type")
                            await notification_manager.send_notification(f"❌ Push API ถูกปฏิเสธ: {error_message}", "error")
                            
                    except:
                        logger.error(f"❌ LINE Push API 403 Forbidden: {response.text}")
                        await notification_manager.send_notification("❌ Push API 403 Forbidden", "error")
                    return False
                elif response.status_code >= 500:
                    logger.warning(f"⚠️ LINE Push API {response.status_code} Server Error - will retry")
                    if attempt < max_retries - 1:
                        await asyncio.sleep(2)
                        continue
                else:
                    logger.error(f"❌ LINE Push API HTTP {response.status_code}: {response.text}")
                    await notification_manager.send_notification(f"❌ Push API Error {response.status_code}", "error")
                    return False
            except (httpx.TimeoutException, httpx.RequestError) as e:
                logger.warning(f"⚠️ LINE Push API request error (attempt {attempt + 1}): {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(2)
                    continue
            except Exception as e:
                logger.exception(f"❌ Unexpected error in send_line_push: {e}")
                return False
    
    logger.error(f"❌ Failed to send LINE push message after {max_retries} attempts")
    await notification_manager.send_notification(f"❌ ส่ง Push Message ล้มเหลวหลัง {max_retries} ครั้ง", "error")
    return False

# ====================== Slip Reply Formatting ======================

def create_slip_reply_message(result: Dict[str, Any]) -> str:
    """สร้างข้อความตอบกลับสำหรับผลการตรวจสอบสลิปให้สวยงามและครบถ้วน"""
    status = result.get("status")
    data = result.get("data", {})

    if not data:
        error_msg = result.get("message", "ไม่ทราบสาเหตุ")
        return f"❌ ไม่สามารถดึงข้อมูลสลิปได้\n\nสาเหตุ: {error_msg}"

    # ดึงข้อมูลต่างๆ พร้อมค่าสำรอง
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
    sender_bank = (
        data.get("sender_bank_short") or 
        data.get("sender_bank", "")
    )
    
    receiver_bank = (
        data.get("receiver_bank_short") or 
        data.get("receiver_bank", "")
    )
    
    verified_by = data.get("verified_by", "ระบบ")

    # กำหนดหัวข้อตามสถานะ
    if status == "success":
        header = "✅ สลิปถูกต้อง ตรวจสอบสำเร็จ"
        emoji = "🎉"
    elif status == "duplicate":
        header = "🔄 สลิปนี้เคยถูกตรวจสอบแล้ว"
        emoji = "⚠️"
    else:
        header = "ℹ️ ผลการตรวจสอบสลิป"
        emoji = "📋"

    # สร้างข้อความตอบกลับ
    message_parts = [
        f"{emoji} {header}",
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
    
    # เพิ่มข้อความเพิ่มเติมตามสถานะ
    if status == "duplicate":
        message_parts.extend([
            "",
            "⚠️ หมายเหตุ: สลิปนี้เคยถูกใช้แล้ว",
            "กรุณาตรวจสอบการทำรายการ"
        ])
    elif status == "success":
        message_parts.extend([
            "",
            "✅ สลิปนี้ถูกต้องและยืนยันแล้ว"
        ])
    
    return "\n".join(message_parts)

# ====================== Event Processing Handlers ======================

async def send_message_safe(user_id: str, reply_token: str, message: str, message_type: str = "general") -> bool:
    """ส่งข้อความอย่างปลอดภัย (Enhanced version)"""
    try:
        success = False
        
        logger.info(f"📤 Attempting to send message to {user_id[:8]}... (type: {message_type})")
        
        # ลอง reply ก่อน (ถ้ามี reply token และยังไม่หมดอายุ)
        if reply_token and len(reply_token.strip()) > 10:
            logger.info(f"📞 Trying LINE reply...")
            success = await send_line_reply(reply_token, message)
            if success:
                logger.info("✅ Reply sent successfully")
            else:
                logger.warning("⚠️ Reply failed, will try push...")
        else:
            logger.info("⚠️ No valid reply token, skipping reply attempt")
        
        # ถ้า reply ไม่ได้ ลอง push
        if not success:
            logger.info(f"📱 Trying LINE push...")
            success = await send_line_push(user_id, message)
            if success:
                logger.info("✅ Push sent successfully")
            else:
                logger.error("❌ Push also failed")
        
        # บันทึกประวัติ (ถ้าส่งสำเร็จ)
        if success:
            try:
                save_chat_history(user_id, "out", {"type": "text", "text": message}, sender=message_type)
                logger.debug("✅ Outgoing message saved to history")
            except Exception as e:
                logger.warning(f"⚠️ Failed to save outgoing chat: {e}")
        else:
            logger.error(f"❌ All message sending methods failed for user {user_id[:8]}...")
            await notification_manager.send_notification(f"❌ Failed to send message to {user_id[:8]}...", "error")
        
        return success
        
    except Exception as e:
        logger.exception(f"💥 send_message_safe critical error: {e}")
        return False

async def handle_ai_chat(user_id: str, reply_token: str, user_text: str):
    """จัดการแชท AI (Enhanced version)"""
    try:
        logger.info(f"🤖 Processing AI chat for user {user_id[:8]}...")
        
        # ตรวจสอบ AI configuration
        ai_enabled = config_manager.get("ai_enabled", False)
        openai_key = config_manager.get("openai_api_key", "")
        
        logger.info(f"🔍 AI config: enabled={ai_enabled}, key_configured={bool(openai_key)}")
        
        if not ai_enabled:
            response = "ระบบ AI ถูกปิดการใช้งานในขณะนี้ค่ะ"
        elif not openai_key:
            response = "ยังไม่ได้ตั้งค่า OpenAI API Key กรุณาติดต่อผู้ดูแลระบบค่ะ"
        else:
            logger.info(f"🔄 Getting AI response for: {user_text[:50]}...")
            response = await asyncio.to_thread(get_chat_response, user_text, user_id)
            logger.info(f"🤖 AI response length: {len(response)} characters")
        
        # ส่งข้อความตอบกลับ
        success = await send_message_safe(user_id, reply_token, response, "ai_bot")
        
        if success:
            logger.info("✅ AI response sent successfully")
        else:
            logger.error("❌ Failed to send AI response")
            await notification_manager.send_notification(f"❌ AI response send failed for {user_id[:8]}...", "error")
        
    except Exception as e:
        logger.exception(f"❌ AI chat error: {e}")
        error_msg = "ขออภัย เกิดข้อผิดพลาดในการประมวลผล AI กรุณาลองใหม่อีกครั้ง"
        await send_message_safe(user_id, reply_token, error_msg, "ai_bot_error")

async def handle_slip_verification(user_id: str, reply_token: str, message_id: str = None, slip_info: dict = None):
    """จัดการตรวจสอบสลิป (Enhanced version with comprehensive error handling)"""
    try:
        logger.info(f"🔍 === SLIP VERIFICATION HANDLER START ===")
        logger.info(f"🔍 User: {user_id[:8]}...")
        logger.info(f"🔍 Reply token: {'SET' if reply_token else 'NOT SET'}")
        logger.info(f"🔍 Message ID: {'SET' if message_id else 'NOT SET'}")
        logger.info(f"🔍 Slip info: {slip_info}")
        
        # ตรวจสอบว่าระบบตรวจสอบสลิปเปิดอยู่
        slip_enabled = config_manager.get("slip_enabled", False)
        if not slip_enabled:
            logger.warning("❌ Slip verification system is disabled")
            await send_message_safe(user_id, reply_token, "ขออภัย ระบบตรวจสอบสลิปถูกปิดใช้งานชั่วคราว", "system_error")
            return
        
        # ตรวจสอบว่ามี API ที่พร้อมใช้งาน
        thunder_enabled = config_manager.get("thunder_enabled", True)
        thunder_token = config_manager.get("thunder_api_token", "").strip()
        kbank_enabled = config_manager.get("kbank_enabled", False)
        kbank_configured = bool(config_manager.get("kbank_consumer_id") and config_manager.get("kbank_consumer_secret"))
        
        logger.info(f"🔧 API Status:")
        logger.info(f"   - Thunder: enabled={thunder_enabled}, token={'SET' if thunder_token else 'NOT SET'}")
        logger.info(f"   - KBank: enabled={kbank_enabled}, configured={kbank_configured}")
        
        if not thunder_enabled and not kbank_enabled:
            await send_message_safe(user_id, reply_token, "ระบบตรวจสอบสลิปถูกปิดใช้งาน กรุณาติดต่อผู้ดูแล", "system_error")
            return
            
        if not thunder_token and not kbank_configured:
            await send_message_safe(user_id, reply_token, "ระบบตรวจสอบสลิปยังไม่ได้ตั้งค่า กรุณาติดต่อผู้ดูแล", "system_error")
            return

        # แจ้งผู้ใช้ว่ากำลังตรวจสอบ
        processing_msg = "🔍 กรุณารอสักครู่... ระบบกำลังตรวจสอบสลิป"
        reply_success = await send_line_reply(reply_token, processing_msg)
        logger.info(f"📤 Processing message sent: {reply_success}")

        # เรียกใช้ระบบตรวจสอบสลิป
        logger.info("🚀 Calling slip verification system...")
        
        try:
            if slip_info and slip_info.get("bank_code") and slip_info.get("trans_ref"):
                logger.info(f"📝 Using slip info: bank={slip_info.get('bank_code')}, ref={slip_info.get('trans_ref')}")
                result = await asyncio.to_thread(
                    verify_slip_multiple_providers, 
                    None, None, 
                    slip_info.get("bank_code"), 
                    slip_info.get("trans_ref")
                )
            elif message_id:
                logger.info(f"📷 Using image message ID: {message_id}")
                result = await asyncio.to_thread(
                    verify_slip_multiple_providers, 
                    message_id=message_id
                )
            else:
                logger.error("❌ No slip info or message ID provided")
                await send_line_push(user_id, "❌ ไม่สามารถตรวจสอบสลิปได้ ข้อมูลไม่ครบถ้วน")
                return
        except Exception as e:
            logger.exception(f"❌ Slip verification function error: {e}")
            await send_line_push(user_id, f"❌ เกิดข้อผิดพลาดในการตรวจสอบสลิป: {str(e)}")
            return
        
        logger.info(f"📊 === SLIP VERIFICATION RESULT ===")
        logger.info(f"📊 Result status: {result.get('status') if result else 'None'}")
        logger.info(f"📊 Result message: {result.get('message') if result else 'None'}")
        logger.info(f"📊 Result data keys: {list(result.get('data', {}).keys()) if result and result.get('data') else 'None'}")
        
        # ประมวลผลผลลัพธ์
        if result and result.get("status") in ["success", "duplicate"]:
            reply_message = create_slip_reply_message(result)
            logger.info("✅ Slip verification successful, sending result...")
            logger.info(f"✅ Reply message length: {len(reply_message)} characters")
            
            # ส่งผลลัพธ์
            push_success = await send_line_push(user_id, reply_message)
            if push_success:
                logger.info(f"✅ Slip verification result sent to user {user_id[:8]}")
                
                # บันทึกประวัติ
                try:
                    save_chat_history(user_id, "out", {"type": "text", "text": reply_message}, sender="slip_bot")
                    logger.info("✅ Slip result saved to history")
                except Exception as e:
                    logger.warning(f"⚠️ Failed to save slip result: {e}")
            else:
                logger.error(f"❌ Failed to send slip result to user {user_id[:8]}")
                # ลองส่งข้อความสั้น ๆ แทน
                short_msg = f"✅ ตรวจสอบสลิปสำเร็จ\n💰 จำนวน: {result.get('data', {}).get('amount_display', 'N/A')}\n🔍 ตรวจสอบโดย: {result.get('data', {}).get('verified_by', 'ระบบ')}"
                await send_line_push(user_id, short_msg)
                
        else:
            # กรณีเกิดข้อผิดพลาด
            error_msg = result.get('message', 'ไม่ทราบสาเหตุ') if result else 'ไม่มีผลลัพธ์'
            suggestions = result.get('suggestions', []) if result else []
            
            full_error_msg = f"❌ ไม่สามารถตรวจสอบสลิปได้\n\nสาเหตุ: {error_msg}"
            
            if suggestions:
                full_error_msg += "\n\n💡 คำแนะนำ:\n" + "\n".join([f"• {s}" for s in suggestions[:3]])
            
            logger.error(f"❌ Slip verification failed: {error_msg}")
            await send_line_push(user_id, full_error_msg)
            
            # บันทึกประวัติ error
            try:
                save_chat_history(user_id, "out", {"type": "text", "text": full_error_msg}, sender="slip_bot_error")
            except Exception as e:
                logger.warning(f"⚠️ Failed to save error history: {e}")
        
        logger.info(f"🔍 === SLIP VERIFICATION HANDLER END ===")
        
    except Exception as e:
        logger.exception(f"💥 Critical slip verification error: {e}")
        error_msg = "เกิดข้อผิดพลาดร้ายแרงในระบบตรวจสอบสลิป กรุณาติดต่อผู้ดูแล"
        await send_line_push(user_id, error_msg)
        await notification_manager.send_notification(f"💥 Slip verification critical error: {str(e)}", "error")

async def dispatch_event_async(event: Dict[str, Any]) -> None:
    """Process LINE event (Enhanced version with comprehensive error handling)"""
    if not IS_READY:
        logger.error("❌ System is not ready due to import errors. Skipping event processing.")
        return
        
    try:
        event_type = event.get("type")
        if event_type != "message":
            logger.info(f"⏭️ Skipping non-message event: {event_type}")
            return
        
        message = event.get("message", {})
        user_id = event.get("source", {}).get("userId")
        reply_token = event.get("replyToken")
        message_type = message.get("type")
        
        if not user_id:
            logger.error("❌ No user ID found in event")
            return
            
        if not reply_token:
            logger.error("❌ No reply token found in event")
            return
        
        logger.info(f"🔄 Processing {message_type} from user {user_id[:10]}...")
        
        # บันทึกข้อความที่รับมา
        try:
            save_chat_history(user_id, "in", message, sender="user")
            logger.info("✅ Chat history saved")
        except Exception as e:
            logger.warning(f"⚠️ Failed to save chat history: {e}")
        
        # ประมวลผลตามประเภทข้อความ
        if message_type == "text":
            user_text = message.get("text", "")
            logger.info(f"💬 Text message: {user_text[:50]}...")
            
            # ตรวจสอบว่าเป็นข้อมูลสลิปหรือไม่
            slip_info = extract_slip_info_from_text(user_text)
            
            if slip_info.get("bank_code") and slip_info.get("trans_ref"):
                logger.info("🔍 Detected slip info in text, processing...")
                await handle_slip_verification(user_id, reply_token, slip_info=slip_info)
            else:
                logger.info("🤖 Processing as AI chat...")
                await handle_ai_chat(user_id, reply_token, user_text)
                
        elif message_type == "image":
            logger.info(f"🖼️ Image message from user {user_id[:8]}...")
            message_id = message.get("id")
            if message_id:
                logger.info(f"📷 Processing image ID: {message_id}")
                await handle_slip_verification(user_id, reply_token, message_id=message_id)
            else:
                logger.error("❌ No message ID found for image")
                await send_message_safe(user_id, reply_token, "ไม่สามารถประมวลผลรูปภาพได้ กรุณาลองส่งใหม่", "system_error")
            
        else:
            logger.info(f"📝 Unsupported message type: {message_type}")
            await send_message_safe(user_id, reply_token, "ขออภัย ระบบรองรับเฉพาะข้อความและรูปภาพเท่านั้น", "system")
        
    except Exception as e:
        logger.exception(f"💥 Critical error in dispatch_event: {e}")
        await notification_manager.send_notification(f"💥 Event processing error: {str(e)}", "error")
        
        # พยายามส่งข้อความ error กลับไป
        try:
            user_id = event.get("source", {}).get("userId")
            reply_token = event.get("replyToken")
            if user_id and reply_token:
                await send_message_safe(user_id, reply_token, "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง", "system_error")
        except:
            pass

# ====================== API Routes ======================

@app.websocket("/ws/notifications")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time notifications"""
    await notification_manager.connect(websocket)
    for notification in notification_manager.pending_notifications:
        try:
            await websocket.send_text(json.dumps(notification))
        except Exception as e:
            logger.error(f"Error sending pending notification: {e}")
    notification_manager.pending_notifications.clear()
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        notification_manager.disconnect(websocket)

@app.post("/line/webhook")
async def line_webhook(request: Request, x_line_signature: str = Header(None)) -> JSONResponse:
    """LINE webhook endpoint (Enhanced version)"""
    logger.info("📨 === LINE WEBHOOK REQUEST RECEIVED ===")
    
    if not IS_READY:
        logger.error("❌ System not ready, cannot process webhook.")
        return JSONResponse(content={"status": "error", "message": "System is not ready"}, status_code=503)

    try:
        body = await request.body()
        logger.info(f"📨 Webhook body size: {len(body)} bytes")
        
        try:
            payload = json.loads(body.decode("utf-8"))
            logger.info(f"📨 Webhook payload parsed successfully")
        except json.JSONDecodeError as e:
            logger.error(f"❌ JSON decode error: {e}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload")
        
        events = payload.get("events", [])
        logger.info(f"📨 Number of events: {len(events)}")
        
        for i, event in enumerate(events):
            logger.info(f"📨 Event {i+1}: type={event.get('type')}, message_type={event.get('message', {}).get('type')}")
            # รันแต่ละ event ใน background task
            asyncio.create_task(dispatch_event_async(event))
            
        logger.info(f"✅ Webhook processed successfully, {len(events)} events queued")
        return JSONResponse(content={"status": "ok", "message": f"{len(events)} events received and are being processed."})
        
    except Exception as e:
        logger.exception(f"💥 Webhook processing error: {e}")
        return JSONResponse(content={"status": "error", "message": "Internal server error"}, status_code=500)

@app.get("/", response_class=HTMLResponse)
async def root():
    """Root redirect to admin"""
    return RedirectResponse(url="/admin", status_code=status.HTTP_302_FOUND)

@app.get("/admin", response_class=HTMLResponse)
async def admin_home(request: Request):
    """Admin home page"""
    try:
        total_count = get_chat_history_count()
        api_statuses = get_api_status_summary()
        system_enabled = config_manager.get("slip_enabled", False)
        any_api_available = any(api.get("enabled", False) and api.get("configured", False) for api in api_statuses.values())

        system_status = {
            "system_enabled": system_enabled,
            "any_api_available": any_api_available
        }
        
        return templates.TemplateResponse(
            "admin.html",
            {
                "request": request,
                "config": config_manager,
                "total_chat_history": total_count,
                "system_status": system_status,
                "api_statuses": api_statuses
            },
        )
    except Exception as e:
        logger.error(f"❌ Admin home error: {e}")
        return templates.TemplateResponse(
            "admin.html",
            {
                "request": request,
                "config": config_manager,
                "total_chat_history": 0,
                "system_status": {"system_enabled": False, "any_api_available": False},
                "api_statuses": {}
            },
        )

@app.get("/admin/debug", response_class=HTMLResponse)
async def admin_debug(request: Request):
    """Admin debug page"""
    return templates.TemplateResponse("debug.html", {"request": request})

@app.get("/admin/config")
async def get_config():
    """Get current configuration"""
    try:
        config_data = {
            "slip_enabled": config_manager.get("slip_enabled", False),
            "ai_enabled": config_manager.get("ai_enabled", False),
            "notification_enabled": config_manager.get("notification_enabled", True),
            "thunder_enabled": config_manager.get("thunder_enabled", True),
            "kbank_enabled": config_manager.get("kbank_enabled", False),
            "line_channel_access_token": config_manager.get("line_channel_access_token", ""),
            "line_channel_secret": config_manager.get("line_channel_secret", ""),
            "thunder_api_token": config_manager.get("thunder_api_token", ""),
            "kbank_consumer_id": config_manager.get("kbank_consumer_id", ""),
            "kbank_consumer_secret": config_manager.get("kbank_consumer_secret", ""),
            "openai_api_key": config_manager.get("openai_api_key", ""),
            "openai_model": config_manager.get("openai_model", "gpt-3.5-turbo")
        }
        return JSONResponse(config_data)
    except Exception as e:
        logger.error(f"❌ Get config error: {e}")
        return JSONResponse({"status": "error", "message": str(e)})

@app.post("/admin/config")
async def update_config(request: Request):
    """Update configuration"""
    try:
        data = await request.json()
        
        # Update each field
        updates = {}
        
        # Boolean fields
        for key in ["slip_enabled", "ai_enabled", "notification_enabled", "thunder_enabled", "kbank_enabled"]:
            if key in data:
                value = data[key]
                if isinstance(value, bool):
                    updates[key] = value
                elif isinstance(value, str):
                    updates[key] = value.lower().strip() in ["true", "1", "yes", "on", "enabled"]
                else:
                    updates[key] = bool(value)
        
        # String fields
        for key in [
            "line_channel_access_token", "line_channel_secret", "thunder_api_token",
            "kbank_consumer_id", "kbank_consumer_secret", "openai_api_key", "openai_model"
        ]:
            if key in data:
                updates[key] = str(data[key]).strip()
        
        success = config_manager.update_multiple(updates)
        
        if success:
            # Re-initialize LINE Bot if credentials changed
            if any(key in updates for key in ["line_channel_access_token", "line_channel_secret"]):
                init_line_bot()
            
            await notification_manager.send_notification("⚙️ อัปเดตการตั้งค่าระบบแล้ว", "success")
            return JSONResponse({"status": "success", "message": "บันทึกการตั้งค่าแล้ว"})
        else:
            return JSONResponse({"status": "error", "message": "ไม่สามารถบันทึกการตั้งค่าได้"})
            
    except Exception as e:
        logger.error(f"❌ Update config error: {e}")
        return JSONResponse({"status": "error", "message": str(e)})

@app.get("/admin/api-status")
async def get_api_status():
    """Get status of all configured APIs for the dashboard"""
    if not IS_READY:
        return JSONResponse({
            "status": "error", 
            "message": "ระบบไม่พร้อมใช้งาน", 
            "thunder": {"configured": False, "enabled": False, "connected": False, "recent_failures": 0}, 
            "kbank": {"configured": False, "enabled": False, "connected": False, "recent_failures": 0}, 
            "line": {"configured": False, "enabled": False, "connected": False, "bot_name": "N/A"}
        })
    
    try:
        # ดึงสถานะ Thunder และ KBank
        api_summary = get_api_status_summary()
        
        # ดึงสถานะ LINE จาก config
        line_token = config_manager.get("line_channel_access_token", "").strip()
        line_secret = config_manager.get("line_channel_secret", "").strip()
        line_configured = bool(line_token and line_secret)
        line_connected = False
        bot_name = "N/A"
        can_push = False
        
        if line_configured:
            # ทดสอบการเชื่อมต่อกับ LINE API
            try:
                url = "https://api.line.me/v2/bot/info"
                headers = {
                    "Authorization": f"Bearer {line_token}",
                    "User-Agent": "LINE-OA-Middleware/2.0"
                }
                response = requests.get(url, headers=headers, timeout=10)
                
                logger.info(f"🔍 LINE API test: {response.status_code}")
                
                if response.status_code == 200:
                    line_connected = True
                    bot_info = response.json()
                    bot_name = bot_info.get("displayName", "Unknown Bot")
                    can_push = True
                    logger.info(f"✅ LINE API connected: {bot_name}")
                elif response.status_code == 401:
                    logger.warning("⚠️ LINE API 401: Invalid access token")
                    bot_name = "Invalid Token"
                else:
                    logger.warning(f"⚠️ LINE API {response.status_code}: {response.text[:100]}")
                    bot_name = f"Error {response.status_code}"
                    
            except requests.exceptions.Timeout:
                logger.warning("⚠️ LINE API timeout")
                bot_name = "Timeout"
            except requests.exceptions.ConnectionError:
                logger.warning("⚠️ LINE API connection error")
                bot_name = "Connection Error"
            except Exception as e:
                logger.warning(f"⚠️ LINE API test failed: {e}")
                bot_name = "Test Failed"
        
        # เพิ่มข้อมูล LINE API เข้าไปใน summary
        api_summary["line"] = {
            "name": "LINE Messaging API",
            "configured": line_configured,
            "connected": line_connected,
            "enabled": line_configured,
            "bot_name": bot_name,
            "can_push": can_push,
            "recent_failures": 0,
            "last_failure": 0,
            "recently_failed": False
        }
        
        # เพิ่มข้อมูลสรุประบบ
        any_api_working = any([
            api_summary.get("thunder", {}).get("connected", False),
            api_summary.get("kbank", {}).get("connected", False),
            api_summary.get("line", {}).get("connected", False)
        ])
        
        slip_system_ready = any([
            api_summary.get("thunder", {}).get("connected", False),
            api_summary.get("kbank", {}).get("connected", False)
        ])
        
        api_summary["system_status"] = {
            "system_enabled": config_manager.get("slip_enabled", False),
            "any_api_available": any_api_working,
            "slip_system_ready": slip_system_ready,
            "line_ready": api_summary["line"]["connected"]
        }
        
        return JSONResponse(api_summary)
        
    except Exception as e:
        logger.exception(f"❌ Error getting API status: {e}")
        return JSONResponse({
            "status": "error",
            "message": f"เกิดข้อผิดพลาด: {str(e)}",
            "thunder": {"configured": False, "enabled": False, "connected": False, "recent_failures": 0},
            "kbank": {"configured": False, "enabled": False, "connected": False, "recent_failures": 0},
            "line": {"configured": False, "enabled": False, "connected": False, "bot_name": "Error"}
        })

@app.get("/admin/debug-config")
async def get_debug_config():
    """ดึงข้อมูล config สำหรับ debug"""
    try:
        api_status = get_api_status_summary()
        
        detailed_status = {
            "api_status": api_status,
            "config_status": {
                "slip_system_enabled": config_manager.get("slip_enabled", False),
                "thunder_enabled": config_manager.get("thunder_enabled", True),
                "thunder_token_configured": bool(config_manager.get("thunder_api_token")),
                "kbank_enabled": config_manager.get("kbank_enabled", False),
                "kbank_credentials_configured": bool(
                    config_manager.get("kbank_consumer_id") and 
                    config_manager.get("kbank_consumer_secret")
                )
            },
            "config_values": {
                "thunder_token": config_manager.get("thunder_api_token", "")[:20] + "..." if config_manager.get("thunder_api_token") else "",
                "kbank_consumer_id": config_manager.get("kbank_consumer_id", "")[:20] + "..." if config_manager.get("kbank_consumer_id") else "",
                "kbank_consumer_secret": config_manager.get("kbank_consumer_secret", "")[:20] + "..." if config_manager.get("kbank_consumer_secret") else "",
                "line_token": config_manager.get("line_channel_access_token", "")[:20] + "..." if config_manager.get("line_channel_access_token") else "",
                "line_secret": config_manager.get("line_channel_secret", "")[:20] + "..." if config_manager.get("line_channel_secret") else "",
            }
        }
        
        return JSONResponse(detailed_status)
    except Exception as e:
        logger.error(f"❌ Error getting debug config: {e}")
        return JSONResponse({"status": "error", "message": str(e)})

@app.get("/admin/get-config-value")
async def get_config_value(request: Request):
    """ดึงค่า config เฉพาะ key"""
    try:
        key = request.query_params.get("key")
        if not key:
            return JSONResponse({"status": "error", "message": "Key is required"})
        
        value = config_manager.get(key, "")
        return JSONResponse({"status": "success", "key": key, "value": value})
    except Exception as e:
        logger.error(f"❌ Error getting config value: {e}")
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
        
        # ตั้งค่า token ชั่วคราว
        original_token = config_manager.get("thunder_api_token")
        config_manager.config["thunder_api_token"] = token
        
        try:
            # เรียกใช้ Thunder API จริง
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
                    "message": result.get("message", "Thunder API test failed") if result else "No response",
                    "data": result
                })
        finally:
            # คืนค่าเดิม
            config_manager.config["thunder_api_token"] = original_token
        
    except Exception as e:
        logger.exception(f"❌ Thunder API test error: {e}")
        return JSONResponse({"status": "error", "message": str(e)})

@app.post("/admin/test-kbank-oauth")
async def test_kbank_oauth(request: Request):
    """ทดสอบ KBank OAuth โดยเฉพาะ"""
    try:
        data = await request.json()
        consumer_id = data.get("consumer_id")
        consumer_secret = data.get("consumer_secret")
        
        if not consumer_id or not consumer_secret:
            return JSONResponse({"status": "error", "message": "Missing Consumer ID or Secret"})
        
        logger.info(f"🧪 Testing KBank OAuth...")
        
        # Set temporary credentials
        original_id = config_manager.get("kbank_consumer_id")
        original_secret = config_manager.get("kbank_consumer_secret")
        original_enabled = config_manager.get("kbank_enabled")
        
        config_manager.config["kbank_consumer_id"] = consumer_id
        config_manager.config["kbank_consumer_secret"] = consumer_secret
        config_manager.config["kbank_enabled"] = True
        
        try:
            # Clear any cached token first
            if hasattr(kbank_checker, '_access_token'):
                kbank_checker._access_token = None
                kbank_checker._token_expires_at = 0
            
            # Try to get token
            token = kbank_checker._get_access_token() if hasattr(kbank_checker, '_get_access_token') else None
            
            if token:
                await notification_manager.send_notification("🧪 KBank OAuth ทดสอบสำเร็จ", "info")
                return JSONResponse({
                    "status": "success",
                    "message": "KBank OAuth successful",
                    "data": {
                        "token_received": True,
                        "token_preview": token[:30] + "...",
                        "token_length": len(token)
                    }
                })
            else:
                await notification_manager.send_notification("🧪 KBank OAuth ทดสอบล้มเหลว", "error")
                return JSONResponse({
                    "status": "error",
                    "message": "Failed to get OAuth token - ตรวจสอบ Consumer ID และ Secret",
                    "data": {"token_received": False}
                })
        finally:
            # Restore original values
            config_manager.config["kbank_consumer_id"] = original_id
            config_manager.config["kbank_consumer_secret"] = original_secret
            config_manager.config["kbank_enabled"] = original_enabled
        
    except Exception as e:
        logger.exception(f"❌ KBank OAuth test error: {e}")
        await notification_manager.send_notification(f"🧪 KBank OAuth error: {str(e)}", "error")
        return JSONResponse({"status": "error", "message": str(e)})

@app.post("/admin/test-kbank-api") 
async def test_kbank_api_direct(request: Request):
    """ทดสอบ KBank API โดยตรง"""
    try:
        # ต่อจากที่ค้างไว้ใน @app.post("/admin/test-kbank-api")
       data = await request.json()
       consumer_id = data.get("consumer_id")
       consumer_secret = data.get("consumer_secret")
       bank_id = data.get("bank_id")
       trans_ref = data.get("trans_ref")
       
       if not all([consumer_id, consumer_secret, bank_id, trans_ref]):
           return JSONResponse({"status": "error", "message": "Missing required fields"})
       
       logger.info(f"🧪 Testing KBank API...")
       logger.info(f"🧪 Consumer ID: {consumer_id[:10]}...")
       logger.info(f"🧪 Bank ID: {bank_id}, Trans Ref: {trans_ref}")
       
       # ตั้งค่า credentials ชั่วคราว
       original_id = config_manager.get("kbank_consumer_id")
       original_secret = config_manager.get("kbank_consumer_secret")
       original_enabled = config_manager.get("kbank_enabled")
       
       config_manager.config["kbank_consumer_id"] = consumer_id
       config_manager.config["kbank_consumer_secret"] = consumer_secret
       config_manager.config["kbank_enabled"] = True
       
       try:
           # ทดสอบ KBank API จริง
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
                   "message": result.get("message", "KBank API test failed") if result else "No response",
                   "data": result
               })
       finally:
           # คืนค่าเดิม
           config_manager.config["kbank_consumer_id"] = original_id
           config_manager.config["kbank_consumer_secret"] = original_secret
           config_manager.config["kbank_enabled"] = original_enabled
       
   except Exception as e:
       logger.exception(f"❌ KBank API test error: {e}")
       return JSONResponse({"status": "error", "message": str(e)})

@app.post("/admin/test-slip-upload")
async def test_slip_upload(request: Request):
   """Test slip upload"""
   if not IS_READY:
       return JSONResponse(content={"status": "error", "message": "ระบบไม่พร้อมใช้งาน"}, status_code=503)

   try:
       form = await request.form()
       file = form.get("file")
       if not file:
           return JSONResponse(content={"status": "error", "message": "ไม่พบไฟล์สลิป"})
       
       image_data = await file.read()
       
       await notification_manager.send_notification("🧪 Admin กำลังทดสอบการอัปโหลดสลิป", "info")
       
       result = await asyncio.to_thread(verify_slip_multiple_providers, test_image_data=image_data)
       
       if result["status"] in ["success", "duplicate"]:
           reply_message = create_slip_reply_message(result)
           await notification_manager.send_notification(f"✅ ผลการทดสอบ:\n{reply_message}", "success")
           return JSONResponse(content={
               "status": result["status"],
               "message": "ทดสอบสลิปสำเร็จ",
               "response": result,
               "formatted_reply": reply_message
           })
       else:
           error_message = result.get("message", "ทดสอบสลิปล้มเหลว")
           await notification_manager.send_notification(f"❌ ทดสอบสลิปล้มเหลว: {error_message}", "error")
           return JSONResponse(content={
               "status": "error",
               "message": error_message,
               "response": result
           })
   except Exception as e:
       logger.exception(f"❌ Test slip upload error: {e}")
       await notification_manager.send_notification(f"💥 เกิดข้อผิดพลาดในการทดสอบสลิป: {str(e)}", "error")
       return JSONResponse(content={"status": "error", "message": f"เกิดข้อผิดพลาด: {str(e)}"})

@app.post("/admin/test-push-message")
async def test_push_message(request: Request):
   """Test push message"""
   if not IS_READY:
       return JSONResponse(content={"status": "error", "message": "ระบบไม่พร้อมใช้งาน"}, status_code=503)
   try:
       data = await request.json()
       user_id = data.get("user_id")
       message_text = data.get("message")

       if not user_id or not message_text:
           return JSONResponse({"status": "error", "message": "ต้องระบุ user_id และ message"})

       success = await send_line_push(user_id, message_text)
       if success:
           return JSONResponse({"status": "success", "message": "ส่งข้อความทดสอบสำเร็จ"})
       else:
           return JSONResponse({"status": "error", "message": "ส่งข้อความทดสอบไม่สำเร็จ"})
   except Exception as e:
       logger.exception("❌ Error in test_push_message endpoint")
       return JSONResponse({"status": "error", "message": f"เกิดข้อผิดพลาด: {str(e)}"})

@app.post("/admin/toggle-slip-system")
async def toggle_slip_system():
   """Toggle slip checking system on/off"""
   try:
       current_status = config_manager.get("slip_enabled", False)
       new_status = not current_status
       config_manager.update("slip_enabled", new_status)
       message = f"✅ ระบบตรวจสอบสลิปถูก{'เปิด' if new_status else 'ปิด'}ใช้งานแล้ว"
       await notification_manager.send_notification(message, "success")
       return JSONResponse({"status": "success", "message": message, "slip_enabled": new_status})
   except Exception as e:
       logger.error(f"❌ Error toggling slip system: {e}")
       return JSONResponse({"status": "error", "message": "ไม่สามารถเปลี่ยนสถานะระบบได้"})

@app.post("/admin/reset-failures")
async def reset_failures():
   """Reset API failures"""
   try:
       reset_api_failure_cache()
       await notification_manager.send_notification("🔄 รีเซ็ต API failure cache แล้ว", "success")
       return JSONResponse({"status": "success", "message": "รีเซ็ต API failure cache สำเร็จ"})
   except Exception as e:
       logger.error(f"❌ Error resetting API failures: {e}")
       return JSONResponse({"status": "error", "message": "เกิดข้อผิดพลาดในการรีเซ็ต"})

@app.get("/admin/system-status")
async def get_system_status():
   """Get system status for the dashboard"""
   if not IS_READY:
       return JSONResponse({
           "status": "error", 
           "message": "ระบบไม่พร้อมใช้งาน", 
           "system_enabled": False, 
           "any_api_available": False, 
           "active_connections": 0, 
           "duplicate_cache_size": 0
       })
   
   try:
       api_statuses = get_api_status_summary()
       system_enabled = config_manager.get("slip_enabled", False)
       any_api_available = any(api.get("configured", False) and api.get("enabled", False) for api in api_statuses.values())
       
       return JSONResponse({
           "status": "success",
           "system_status": {
               "system_enabled": system_enabled,
               "any_api_available": any_api_available,
           },
           "active_connections": len(notification_manager.active_connections),
           "duplicate_cache_size": len(notification_manager.duplicate_slip_cache)
       })
   except Exception as e:
       logger.error(f"❌ Error getting system status: {e}")
       return JSONResponse({
           "status": "error", 
           "message": str(e), 
           "system_enabled": False, 
           "any_api_available": False, 
           "active_connections": 0, 
           "duplicate_cache_size": 0
       })

@app.post("/admin/toggle-api")
async def toggle_api(request: Request):
   """Toggle API แต่ละตัวแยกกัน"""
   try:
       data = await request.json()
       api_name = data.get("api_name")  # "thunder" หรือ "kbank"
       
       if api_name == "thunder":
           current_status = config_manager.get("thunder_enabled", True)
           new_status = not current_status
           config_manager.update("thunder_enabled", new_status)
           message = f"Thunder API ถูก{'เปิด' if new_status else 'ปิด'}ใช้งานแล้ว"
           
       elif api_name == "kbank":
           current_status = config_manager.get("kbank_enabled", False)
           new_status = not current_status
           config_manager.update("kbank_enabled", new_status)
           message = f"KBank API ถูก{'เปิด' if new_status else 'ปิด'}ใช้งานแล้ว"
           
       else:
           return JSONResponse({"status": "error", "message": "ไม่รู้จัก API name"})
       
       await notification_manager.send_notification(message, "success")
       return JSONResponse({"status": "success", "message": message, "enabled": new_status})
       
   except Exception as e:
       logger.error(f"❌ Error toggling API: {e}")
       return JSONResponse({"status": "error", "message": "ไม่สามารถเปลี่ยนสถานะ API ได้"})

@app.get("/admin/clear-duplicate-cache")
async def clear_duplicate_cache():
   """Clear the duplicate slip cache"""
   try:
       count = len(notification_manager.duplicate_slip_cache)
       notification_manager.duplicate_slip_cache.clear()
       message = f"✅ ล้างแคชสลิปซ้ำจำนวน {count} รายการแล้ว"
       await notification_manager.send_notification(message, "success")
       return JSONResponse({"status": "success", "message": message, "cleared_count": count})
   except Exception as e:
       logger.error(f"❌ Error clearing duplicate cache: {e}")
       return JSONResponse({"status": "error", "message": "เกิดข้อผิดพลาดในการล้างแคช"})

@app.get("/admin/settings", response_class=HTMLResponse)
async def admin_settings(request: Request):
   """Admin settings page"""
   return templates.TemplateResponse(
       "settings.html",
       {
           "request": request,
           "config": config_manager,
       },
   )

@app.get("/admin/chat", response_class=HTMLResponse)
async def admin_chat(request: Request):
   """Admin chat history page"""
   try:
       history = get_recent_chat_history(limit=100)
       return templates.TemplateResponse(
           "chat_history.html",
           {
               "request": request,
               "chat_history": history,
           },
       )
   except Exception as e:
       logger.error(f"❌ Chat history error: {e}")
       return templates.TemplateResponse(
           "chat_history.html",
           {
               "request": request,
               "chat_history": [],
           },
       )

@app.get("/admin/logs", response_class=HTMLResponse)
async def admin_logs(request: Request):
   """Admin logs page"""
   return templates.TemplateResponse("logs.html", {"request": request})

@app.post("/admin/force-reset-apis")
async def force_reset_apis():
   """Force reset API failure cache"""
   try:
       reset_api_failure_cache()
       await notification_manager.send_notification("🔄 API failure cache ถูกรีเซ็ตแล้ว", "success")
       return JSONResponse({"status": "success", "message": "รีเซ็ต API failure cache สำเร็จ"})
   except Exception as e:
       logger.error(f"❌ Error resetting API cache: {e}")
       return JSONResponse({"status": "error", "message": "เกิดข้อผิดพลาดในการรีเซ็ต API cache"})

@app.post("/admin/settings/update")
async def update_settings(request: Request) -> JSONResponse:
   """Update settings (Enhanced boolean handling)"""
   try:
       data = await request.json()
       updates = {}
       
       # Text fields
       for key in [
           "line_channel_secret", "line_channel_access_token", "thunder_api_token",
           "openai_api_key", "ai_prompt", "wallet_phone_number",
           "kbank_consumer_id", "kbank_consumer_secret",
       ]:
           if key in data:
               updates[key] = data[key].strip()
       
       # Boolean fields
       for key in ["ai_enabled", "slip_enabled", "kbank_enabled", "thunder_enabled"]:
           if key in data:
               value = data[key]
               if isinstance(value, bool):
                   updates[key] = value
               elif isinstance(value, str):
                   updates[key] = value.lower().strip() in ["true", "1", "yes", "on", "enabled"]
               else:
                   updates[key] = bool(value)
       
       success = config_manager.update_multiple(updates)
       
       if success:
           if any(key in updates for key in ["line_channel_access_token", "line_channel_secret"]):
               init_line_bot()
           
           await notification_manager.send_notification("⚙️ อัปเดตการตั้งค่าระบบแล้ว", "success")
           return JSONResponse(content={"status": "success", "message": "บันทึกการตั้งค่าแล้ว"})
       else:
           return JSONResponse(content={"status": "error", "message": "ไม่สามารถบันทึกการตั้งค่าได้"})
           
   except Exception as e:
       logger.error(f"❌ Settings update error: {e}")
       return JSONResponse(content={"status": "error", "message": str(e)})

# Additional utility routes
@app.get("/admin/forwarding")
async def admin_forwarding(request: Request):
   """Admin forwarding page"""
   endpoints = []  # Dummy data
   return templates.TemplateResponse("forwarding.html", {"request": request, "endpoints": endpoints})

@app.get("/admin/virtual-channels")
async def admin_virtual_channels(request: Request):
   """Admin virtual channels page"""
   channels = []  # Dummy data
   return templates.TemplateResponse("virtual_channels.html", {"request": request, "channels": channels, "base_url": "https://example.com"})

# Health check endpoint
@app.get("/health")
async def health_check():
   """Health check endpoint"""
   return JSONResponse({
       "status": "ok" if IS_READY else "degraded",
       "system_ready": IS_READY,
       "timestamp": datetime.now().isoformat(),
       "active_connections": len(notification_manager.active_connections) if notification_manager else 0
   })

# ====================== Startup/Shutdown Events ======================

@app.on_event("startup")
async def startup_event():
   """Startup event handler"""
   logger.info("🚀 LINE OA Middleware เริ่มทำงาน...")
   logger.info(f"🔧 System ready: {IS_READY}")
   
   if IS_READY:
       try:
           init_line_bot()
           logger.info("✅ LINE Bot initialized")
       except Exception as e:
           logger.error(f"❌ LINE Bot init error: {e}")
   
   try:
       await notification_manager.send_notification("🚀 ระบบ LINE OA Middleware เริ่มทำงานแล้ว", "success")
   except Exception as e:
       logger.error(f"❌ Startup notification error: {e}")

@app.on_event("shutdown")
async def shutdown_event():
   """Shutdown event handler"""
   logger.info("🛑 LINE OA Middleware กำลังหยุดทำงาน...")
   try:
       await notification_manager.send_notification("🛑 ระบบกำลังหยุดทำงาน", "info")
   except Exception as e:
       logger.error(f"❌ Shutdown notification error: {e}")

# ====================== Main Entry Point ======================

if __name__ == "__main__":
   import uvicorn
   print("🚀 Starting LINE OA Middleware...")
   print("🔗 Admin UI: http://localhost:8000/admin")
   print("🔗 Debug Console: http://localhost:8000/admin/debug")
   print(f"🔧 System Ready: {IS_READY}")
   
   try:
       uvicorn.run(
           "main_updated:app", 
           host="0.0.0.0", 
           port=int(os.getenv("PORT", 8000)), 
           reload=True,
           log_level="info"
       )
   except Exception as e:
       logger.error(f"❌ Failed to start server: {e}")
       print(f"❌ Failed to start server: {e}")
