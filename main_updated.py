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
try:
    from utils.config_manager import config_manager
    logger.info("✅ Config manager imported successfully")
except ImportError as e:
    logger.error(f"❌ Failed to import config_manager: {e}")
    # Create a simple config manager fallback
    class SimpleConfigManager:
        def __init__(self):
            self.config = {}
        def get(self, key, default=None):
            return os.getenv(key.upper(), os.getenv(key, default))
        def update(self, key, value):
            return True
        def update_multiple(self, updates):
            return True
    config_manager = SimpleConfigManager()

try:
    from models.database import (
        init_database, save_chat_history, get_chat_history_count, get_recent_chat_history,
    )
    logger.info("✅ Database models imported successfully")
except ImportError as e:
    logger.error(f"❌ Failed to import database models: {e}")
    def init_database(): pass
    def save_chat_history(user_id, direction, message, sender): pass
    def get_chat_history_count(): return 0
    def get_recent_chat_history(limit=50): return []

try:
    from services.chat_bot import get_chat_response
    logger.info("✅ Chat bot service imported successfully")
except ImportError as e:
    logger.error(f"❌ Failed to import chat_bot: {e}")
    def get_chat_response(text, user_id):
        return "ขออภัย ระบบ AI ไม่พร้อมใช้งานในขณะนี้"

try:
    from services.slip_checker import verify_slip_with_thunder
    logger.info("✅ Thunder slip checker imported successfully")
except ImportError as e:
    logger.error(f"❌ Failed to import slip_checker: {e}")
    def verify_slip_with_thunder(message_id, test_image_data=None):
        return {"status": "error", "message": "ระบบตรวจสอบสลิป Thunder ไม่พร้อมใช้งาน"}

try:
    from services.enhanced_slip_checker import (
        verify_slip_multiple_providers,
        extract_slip_info_from_text,
        get_api_status_summary
    )
    logger.info("✅ Enhanced slip checker imported successfully")
except ImportError as e:
    logger.warning(f"⚠️ Enhanced slip checker not available: {e}")
    def verify_slip_multiple_providers(message_id=None, test_image_data=None, bank_code=None, trans_ref=None):
        if message_id or test_image_data:
            return verify_slip_with_thunder(message_id, test_image_data)
        return {"status": "error", "message": "ไม่สามารถตรวจสอบสลิปได้"}
    def extract_slip_info_from_text(text):
        return {"bank_code": None, "trans_ref": None}
    def get_api_status_summary():
        return {"thunder": {"enabled": False}, "kbank": {"enabled": False}}

# Initialize database
try:
    logger.info("Initializing database...")
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
                        
                        # ตรวจสอบสาเหตุ 403 เฉพาะ
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

async def check_line_account_type():
    """Check LINE account type and available APIs"""
    access_token = config_manager.get("line_channel_access_token")
    if not access_token:
        return {"error": "No access token", "status": "error"}
    
    try:
        async with httpx.AsyncClient() as client:
            # ตรวจสอบข้อมูล bot
            response = await client.get(
                "https://api.line.me/v2/bot/info",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=10
            )
            
            if response.status_code == 200:
                bot_info = response.json()
                
                # ทดสอบ push message capability โดยส่งไปยัง user id ทดสอบ
                test_push_response = await client.post(
                    "https://api.line.me/v2/bot/message/push",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "to": "test_user_id_that_will_fail",  # จงใจใส่ user id ผิดเพื่อดู error
                        "messages": [{"type": "text", "text": "test"}]
                    },
                    timeout=5
                )
                
                can_push = test_push_response.status_code != 403
                push_error = None
                
                if test_push_response.status_code == 403:
                    try:
                        error_data = test_push_response.json()
                        push_error = error_data.get('message', 'Unknown 403 error')
                    except:
                        push_error = test_push_response.text
                
                return {
                    "status": "success",
                    "bot_info": bot_info,
                    "can_push": can_push,
                    "push_test_status": test_push_response.status_code,
                    "push_error": push_error,
                    "account_features": {
                        "display_name": bot_info.get("displayName", "Unknown"),
                        "user_id": bot_info.get("userId", "Unknown"),
                        "basic_id": bot_info.get("basicId", "Unknown"),
                        "premium_id": bot_info.get("premiumId", "Not set"),
                    }
                }
            else:
                return {"error": f"HTTP {response.status_code}: {response.text}", "status": "error"}
                
    except Exception as e:
        return {"error": str(e), "status": "error"}

async def send_slip_result_safe(user_id: str, reply_token: str, message: str, message_type: str = "slip_result"):
    """ส่งผลลัพธ์สลิปอย่างปลอดภัย - ลอง reply ก่อน แล้วค่อย push"""
    reply_sent = False
    push_sent = False
    
    # ลอง reply message ก่อน (ถ้ามี reply token)
    if reply_token:
        logger.info(f"🔄 Attempting to send reply message first...")
        reply_sent = await send_line_reply(reply_token, message)
        if reply_sent:
            logger.info("✅ Reply message sent successfully")
            try:
                save_chat_history(user_id, "out", {"type": "text", "text": message}, sender=message_type)
            except:
                pass
            return True
    
    # ถ้า reply ไม่ได้หรือไม่มี reply token ให้ลอง push
    if not reply_sent:
        logger.info(f"🔄 Reply failed or no reply token, attempting push message...")
        push_sent = await send_line_push(user_id, message)
        if push_sent:
            logger.info("✅ Push message sent successfully")
            try:
                save_chat_history(user_id, "out", {"type": "text", "text": message}, sender=message_type)
            except:
                pass
            return True
    
    # ถ้าทั้งสองวิธีล้มเหลว
    logger.error("❌ Both reply and push message failed")
    await notification_manager.send_notification(f"❌ ไม่สามารถส่งข้อความถึง {user_id[:8]}... ได้ (ทั้ง reply และ push)", "error")
    
    # บันทึกข้อมูลแม้จะส่งไม่ได้
    try:
        save_chat_history(user_id, "out", {"type": "text", "text": f"[FAILED TO SEND] {message[:100]}..."}, sender=f"{message_type}_error")
    except:
        pass
    
    return False

def create_slip_hash(image_data: bytes) -> str:
    """Create hash for image data"""
    return hashlib.md5(image_data).hexdigest()

def save_duplicate_slip_data(slip_hash: str, slip_data: Dict) -> None:
    """Save duplicate slip data to cache"""
    notification_manager.duplicate_slip_cache[slip_hash] = {
        "data": slip_data,
        "timestamp": datetime.now().isoformat(),
        "count": notification_manager.duplicate_slip_cache.get(slip_hash, {}).get("count", 0) + 1
    }

def get_duplicate_slip_data(slip_hash: str) -> Optional[Dict]:
    """Get duplicate slip data from cache"""
    return notification_manager.duplicate_slip_cache.get(slip_hash)

def check_slip_system_status() -> Dict[str, Any]:
    """Check slip system status"""
    slip_enabled = config_manager.get("slip_enabled", False)
    thunder_token = config_manager.get("thunder_api_token", "").strip()
    kbank_enabled = config_manager.get("kbank_enabled", False)
    kbank_consumer_id = config_manager.get("kbank_consumer_id", "").strip()
    kbank_consumer_secret = config_manager.get("kbank_consumer_secret", "").strip()
    
    status = {
        "system_enabled": bool(slip_enabled),
        "thunder_configured": bool(thunder_token),
        "kbank_configured": bool(kbank_consumer_id and kbank_consumer_secret and kbank_enabled),
        "any_api_available": False
    }
    
    if status["system_enabled"] and (status["thunder_configured"] or status["kbank_configured"]):
        status["any_api_available"] = True
    
    return status

def create_detailed_slip_message(data: Dict, duplicate_count: int = 0, is_duplicate: bool = False) -> str:
    """Create detailed slip message"""
    amount_display = data.get('amount_display', f"฿{data.get('amount_formatted', data.get('amount', '0'))}")
    date = data.get('date', 'N/A')
    time_str = data.get('time', '')
    reference = data.get('reference', '')
    
    sender_name = data.get('sender_name_th') or data.get('sender_name_en') or data.get('sender', '')
    sender_bank_name = data.get('sender_bank_name', '') or data.get('sender_bank_short', '') or data.get('sender_bank', '')
    sender_account = data.get('sender_account_number', '')
    
    receiver_name = data.get('receiver_name_th') or data.get('receiver_name_en') or data.get('receiver_name', '')
    receiver_bank_name = data.get('receiver_bank_name', '') or data.get('receiver_bank_short', '') or data.get('receiver_bank', '')
    receiver_account = data.get('receiver_account_number', '')
    
    fee = data.get('fee', 0)
    verified_by = data.get('verified_by', 'ระบบตรวจสอบสลิป')  # แก้ไขตรงนี้
    
    if is_duplicate:
        if duplicate_count > 0:
            header = f"🔄 สลิปนี้เคยตรวจสอบแล้ว (ครั้งที่ {duplicate_count})"
        else:
            header = "🔄 สลิปนี้เคยถูกตรวจสอบแล้ว"
    else:
        header = "✅ สลิปถูกต้อง - ตรวจสอบสำเร็จ"
    
    message = f"{header}\n\n"
    message += "═══ 📋 รายละเอียดการโอนเงิน ═══\n"
    message += f"💰 จำนวนเงิน: {amount_display}\n"
    message += f"📅 วันที่ทำรายการ: {date}\n"
    
    if time_str:
        message += f"🕐 เวลาทำรายการ: {time_str}\n"
    
    if reference:
        message += f"📋 เลขอ้างอิง: {reference}\n"
    
    if fee and float(fee) > 0:
        message += f"💸 ค่าธรรมเนียม: ฿{fee}\n"
    
    if sender_name or sender_bank_name or sender_account:
        message += "\n═══ 👤 ข้อมูลผู้ส่ง ═══\n"
        if sender_name:
            message += f"👤 ชื่อผู้โอน: {sender_name}\n"
        if sender_bank_name:
            message += f"🏦 ธนาคารผู้โอน: {sender_bank_name}\n"
        if sender_account:
            masked_account = sender_account[:4] + "xxxx" + sender_account[-4:] if len(sender_account) > 8 else sender_account
            message += f"💳 เลขบัญชีผู้โอน: {masked_account}\n"
    
    if receiver_name or receiver_bank_name or receiver_account:
        message += "\n═══ 🏪 ข้อมูลผู้รับ ═══\n"
        if receiver_name:
            message += f"🏪 ชื่อผู้รับ: {receiver_name}\n"
        if receiver_bank_name:
            message += f"🏦 ธนาคารผู้รับ: {receiver_bank_name}\n"
        if receiver_account:
            masked_account = receiver_account[:4] + "xxxx" + receiver_account[-4:] if len(receiver_account) > 8 else receiver_account
            message += f"💳 เลขบัญชีผู้รับ: {masked_account}\n"
    
    message += f"\n🔍 ตรวจสอบโดย: {verified_by}\n"
    
    if is_duplicate:
        message += "\n💡 หมายเหตุ: สลิปนี้ได้รับการตรวจสอบความถูกต้องแล้ว"
        if duplicate_count > 1:
            message += f" และได้ถูกส่งมาตรวจสอบซ้ำไปแล้ว {duplicate_count-1} ครั้ง"
    else:
        message += "\n🎉 การโอนเงินได้รับการยืนยันแล้ว"
    
    return message

# ====================== Event Processing ======================

async def dispatch_event_async(event: Dict[str, Any]) -> None:
    """Process LINE event asynchronously (Enhanced version)"""
    try:
        if event.get("type") != "message":
            return
        
        message = event.get("message", {})
        user_id = event.get("source", {}).get("userId", "unknown_user")
        reply_token = event.get("replyToken")
        message_type = message.get("type")
        
        logger.info(f"🔄 Processing {message_type} from user {user_id[:10]}...")
        
        try:
            save_chat_history(user_id, "in", message, sender="user")
        except Exception as e:
            logger.warning(f"⚠️ Failed to save chat history: {e}")

        # ตรวจสอบสถานะระบบสลิปตั้งแต่ต้น
        system_status = check_slip_system_status()
        if not system_status["system_enabled"] or not system_status["any_api_available"]:
            error_msg_user = "ขออภัยค่ะ ระบบตรวจสอบสลิปอัตโนมัติปิดใช้งานชั่วคราว หรือมีปัญหา กรุณาติดต่อแอดมิน"
            await notification_manager.send_notification("❌ ระบบตรวจสอบสลิปไม่พร้อมใช้งาน", "error")
            if reply_token:
                await send_slip_result_safe(user_id, reply_token, error_msg_user, "system_error")
            else:
                # กรณีไม่มี reply_token หรือใช้ไปแล้ว ให้แจ้งเตือนแอดมินแทน
                logger.warning(f"⚠️ Cannot reply to user {user_id[:8]}... as reply token is missing or used.")
            return

        if message_type == "image":
            await notification_manager.send_notification(f"🖼️ ได้รับรูปสลิปจากผู้ใช้ {user_id[:8]}...", "info")
            
            # ส่งข้อความแจ้งให้รอก่อน (ใช้ reply ถ้ามี)
            processing_msg = "⏳ กำลังตรวจสอบสลิปของคุณ...\n🔍 รอซักครู่ ระบบกำลังวิเคราะห์ข้อมูล"
            if reply_token:
                await send_line_reply(reply_token, processing_msg)

            line_token = config_manager.get("line_channel_access_token")
            image_data = None
            if line_token:
                try:
                    url = f"https://api-data.line.me/v2/bot/message/{message.get('id')}/content"
                    headers = {"Authorization": f"Bearer {line_token}"}
                    async with httpx.AsyncClient() as client:
                        resp = await client.get(url, headers=headers, timeout=15)
                        resp.raise_for_status()
                    image_data = resp.content
                    logger.info(f"✅ ดาวน์โหลดรูปภาพสำเร็จ: {len(image_data)} bytes")
                except Exception as e:
                    logger.error(f"❌ ไม่สามารถดาวน์โหลดรูปภาพได้: {e}")
                    error_msg_user = f"💥 ไม่สามารถดาวน์โหลดรูปภาพได้ค่ะ\n\n🔧 กรุณาลองส่งรูปภาพใหม่อีกครั้งนะคะ"
                    await send_slip_result_safe(user_id, None, error_msg_user, "slip_bot_error")  # ไม่ใช้ reply_token เพราะใช้ไปแล้ว
                    return
            
            slip_hash = None
            duplicate_data = None
            if image_data:
                slip_hash = create_slip_hash(image_data)
                duplicate_data = get_duplicate_slip_data(slip_hash)
            
            try:
                if duplicate_data:
                    logger.info(f"🔄 Found duplicate slip in cache (hash: {slip_hash[:8]}...)")
                    duplicate_count = duplicate_data.get('count', 1)
                    amount_display = duplicate_data['data'].get('amount_display') or f"฿{duplicate_data['data'].get('amount', '0')}"
                    await notification_manager.send_notification(f"🔄 พบสลิปซ้ำ! แสดงผลตรวจสอบเดิม จำนวน {amount_display} (ครั้งที่ {duplicate_count})", "warning")
                    
                    success_msg = create_detailed_slip_message(duplicate_data['data'], duplicate_count=duplicate_count, is_duplicate=True)
                    await send_slip_result_safe(user_id, None, success_msg, "slip_bot_duplicate")  # ไม่ใช้ reply_token เพราะใช้ไปแล้ว
                    
                    if slip_hash:
                        save_duplicate_slip_data(slip_hash, duplicate_data['data'])
                else:
                    logger.info("🔍 Processing new slip with multiple providers...")
                    result = await asyncio.to_thread(verify_slip_multiple_providers, message_id=message.get("id"), test_image_data=image_data)
                    
                    if result["status"] == "success":
                        amount_display = result['data'].get('amount_display') or f"฿{result['data'].get('amount', '0')}"
                        await notification_manager.send_notification(f"✅ ตรวจสอบสลิปสำเร็จ! จำนวน {amount_display}", "success")
                        success_msg = create_detailed_slip_message(result['data'], is_duplicate=False)
                        await send_slip_result_safe(user_id, None, success_msg, "slip_bot")  # ไม่ใช้ reply_token เพราะใช้ไปแล้ว
                        
                        if slip_hash and image_data:
                            save_duplicate_slip_data(slip_hash, result['data'])
                    elif result.get("status") == "duplicate":
                        logger.info(f"🔄 API reported duplicate slip.")
                        await notification_manager.send_notification(f"🔄 API แจ้งสลิปซ้ำ", "warning")

                        if result.get('data'):
                            success_msg = create_detailed_slip_message(result['data'], is_duplicate=True)
                            await send_slip_result_safe(user_id, None, success_msg, "slip_bot_duplicate")
                            if slip_hash and image_data:
                                save_duplicate_slip_data(slip_hash, result['data'])
                        else:
                            error_msg_user = "🔄 สลิปนี้เคยถูกตรวจสอบแล้วค่ะ"
                            await send_slip_result_safe(user_id, None, error_msg_user, "slip_bot_duplicate")
                    else:
                        error_message_tech = result.get("message", "ตรวจสอบสลิปไม่สำเร็จ")
                        error_message_user = "❌ ไม่พบข้อมูลสลิปที่ถูกต้องในระบบธนาคารค่ะ"
                        
                        if error_message_tech == "qrcode_not_found":
                            error_message_user = "❌ ไม่พบ QR Code ในรูปภาพที่ส่งมาค่ะ"
                        elif "unauthorized" in error_message_tech.lower():
                            error_message_user = "❌ ระบบตรวจสอบมีปัญหาชั่วคราว กรุณาแจ้งแอดมินหรือลองใหม่อีกครั้งค่ะ"

                        await notification_manager.send_notification(f"❌ ตรวจสอบสลิปล้มเหลว: {error_message_tech}", "error")
                        
                        await send_slip_result_safe(user_id, None, error_message_user, "slip_bot_error")
            except Exception as e:
                error_msg_user = f"💥 เกิดข้อผิดพลาดในการตรวจสอบสลิป\n\n🔧 กรุณาลองใหม่อีกครั้ง หรือติดต่อแอดมิน"
                logger.error(f"❌ Slip verification exception: {e}", exc_info=True)
                await notification_manager.send_notification(f"💥 เกิดข้อผิดพลาดร้ายแรง: {str(e)}", "error")
                await send_slip_result_safe(user_id, None, error_msg_user, "slip_bot_error")
            
        elif message_type == "text":
            user_text = message.get("text", "")
            slip_info = extract_slip_info_from_text(user_text)
            
            if slip_info["bank_code"] and slip_info["trans_ref"]:
                system_status = check_slip_system_status()
                if not system_status["system_enabled"] or not system_status["any_api_available"]:
                    system_off_msg = "🔒 ระบบตรวจสอบสลิปออโตปิดใช้งานชั่วคราว หรือมีปัญหา กรุณาติดต่อแอดมิน"
                    await send_slip_result_safe(user_id, reply_token, system_off_msg, "system_error")
                    return
                
                await notification_manager.send_notification(f"📝 ได้รับข้อมูลสลิปจากข้อความ: ธนาคาร {slip_info['bank_code']}, อ้างอิง {slip_info['trans_ref']}", "info")
                text_hash = hashlib.md5(f"{slip_info['bank_code']}:{slip_info['trans_ref']}".encode()).hexdigest()
                duplicate_data = get_duplicate_slip_data(text_hash)
                
                if duplicate_data:
                    duplicate_count = duplicate_data.get('count', 1)
                    amount_display = duplicate_data['data'].get('amount_display') or f"฿{duplicate_data['data'].get('amount', '0')}"
                    await notification_manager.send_notification(f"🔄 พบข้อมูลสลิปซ้ำจากข้อความ! จำนวน {amount_display} (ครั้งที่ {duplicate_count})", "warning")
                    
                    success_msg = f"🔄 ข้อมูลสลิปนี้เคยตรวจสอบแล้ว (ครั้งที่ {duplicate_count})\n\n✅ รายละเอียดการโอน:\n💰 จำนวนเงิน: {amount_display}\n🏦 รหัสธนาคาร: {slip_info['bank_code']}\n📋 เลขอ้างอิง: {slip_info['trans_ref']}\n🔍 ตรวจสอบโดย: {duplicate_data['data'].get('verified_by', 'ระบบตรวจสอบ')}"
                    await send_slip_result_safe(user_id, reply_token, success_msg, "slip_bot_duplicate")
                    save_duplicate_slip_data(text_hash, duplicate_data['data'])
                else:
                    try:
                        result = await asyncio.to_thread(verify_slip_multiple_providers, None, None, slip_info["bank_code"], slip_info["trans_ref"])
                        if result["status"] == "success":
                            amount_display = result['data'].get('amount_display') or f"฿{result['data'].get('amount', '0')}"
                            await notification_manager.send_notification(f"✅ ตรวจสอบสลิปจากข้อความสำเร็จ! จำนวน {amount_display}", "success")
                            success_msg = f"✅ ตรวจสอบสลิปสำเร็จ\n\n📋 รายละเอียดการโอน:\n💰 จำนวนเงิน: {amount_display}\n🏦 รหัสธนาคาร: {slip_info['bank_code']}\n📋 เลขอ้างอิง: {slip_info['trans_ref']}\n🔍 ตรวจสอบโดย: {result['data'].get('verified_by', 'ระบบตรวจสอบ')}\n\n🎉 การโอนเงินได้รับการยืนยันแล้ว"
                            await send_slip_result_safe(user_id, reply_token, success_msg, "slip_bot")
                            save_duplicate_slip_data(text_hash, result['data'])
                        else:
                            error_message_tech = result.get("message", "ตรวจสอบสลิปไม่สำเร็จ")
                            error_message_user = "❌ ไม่พบข้อมูลสลิปที่ถูกต้องในระบบธนาคารค่ะ"
                            
                            if "unauthorized" in error_message_tech.lower() or "access_denied" in error_message_tech.lower() or "quota_exceeded" in error_message_tech.lower():
                                error_message_user = "❌ ระบบตรวจสอบมีปัญหาชั่วคราว กรุณาแจ้งแอดมินหรือลองใหม่อีกครั้งค่ะ"
                            
                            await notification_manager.send_notification(f"❌ ตรวจสอบสลิปจากข้อความล้มเหลว: {error_message_tech}", "error")
                            
                            await send_slip_result_safe(user_id, reply_token, error_message_user, "slip_bot_error")
                    except Exception as e:
                        error_msg_user = f"เกิดข้อผิดพลาดในการตรวจสอบสลิปจากข้อความ"
                        logger.error(f"❌ Text slip verification error: {e}")
                        await notification_manager.send_notification(f"💥 เกิดข้อผิดพลาดในการตรวจสอบสลิปจากข้อความ: {str(e)}", "error")
                        await send_slip_result_safe(user_id, reply_token, error_msg_user, "slip_bot_error")
            else:
                await notification_manager.send_notification(f"💬 ได้รับข้อความจากผู้ใช้ {user_id[:8]}...: {user_text[:30]}...", "info")
                try:
                    # Use asyncio.to_thread for synchronous calls
                    response = await asyncio.to_thread(get_chat_response, user_text, user_id)
                    await send_slip_result_safe(user_id, reply_token, response, "bot")
                except Exception as e:
                    error_msg = "ขออภัย เกิดข้อผิดพลาดในการประมวลผล AI"
                    logger.error(f"❌ AI processing error: {e}")
                    await send_slip_result_safe(user_id, reply_token, error_msg, "bot_error")
        else:
            await notification_manager.send_notification(f"📝 ได้รับข้อความประเภท {message_type} จากผู้ใช้ {user_id[:8]}...", "info")
            await send_slip_result_safe(user_id, reply_token, "ขออภัย ระบบรองรับเฉพาะข้อความและรูปภาพเท่านั้น", "system")
            
    except Exception as e:
        logger.exception(f"❌ Critical error in dispatch_event: {e}")
        await notification_manager.send_notification(f"💥 เกิดข้อผิดพลาดร้ายแรง: {str(e)}", "error")

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
    """LINE webhook endpoint"""
    logger.info("📨 Received LINE webhook request")
    try:
        body = await request.body()
        signature = x_line_signature or ""
        channel_secret = config_manager.get("line_channel_secret", "")
        
        if not verify_line_signature(body, signature, channel_secret):
            logger.error("❌ Invalid LINE signature")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid signature")
        
        try:
            payload = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError as e:
            logger.error(f"❌ Invalid JSON payload: {e}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")
        
        events = payload.get("events", [])
        logger.info(f"🎭 Processing {len(events)} events")
        
        if not events:
            return JSONResponse(content={"status": "ok", "message": "No events to process"})
        
        # Dispatch events to be processed asynchronously
        tasks = [dispatch_event_async(ev) for ev in events]
        await asyncio.gather(*tasks)
        
        return JSONResponse(content={"status": "ok", "events_processed": len(events)})
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"❌ Webhook processing error: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error")

@app.get("/", response_class=HTMLResponse)
async def root():
    """Root redirect to admin"""
    return RedirectResponse(url="/admin", status_code=status.HTTP_302_FOUND)

@app.get("/admin", response_class=HTMLResponse)
async def admin_home(request: Request):
    """Admin home page"""
    total_count = get_chat_history_count()
    system_status = check_slip_system_status()
    return templates.TemplateResponse(
        "admin_home.html",
        {
            "request": request,
            "config": config_manager,
            "total_chat_history": total_count,
            "system_status": system_status,
        },
    )

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
    history = get_recent_chat_history(limit=100)
    return templates.TemplateResponse(
        "chat_history.html",{
            "request": request,
            "chat_history": history,
        },
    )

@app.get("/admin/debug-config")
async def debug_config():
    """Debug configuration status"""
    return JSONResponse(content={
        "slip_enabled": config_manager.get("slip_enabled"),
        "thunder_token_exists": bool(config_manager.get("thunder_api_token")),
        "thunder_token_length": len(config_manager.get("thunder_api_token", "")),
        "line_token_exists": bool(config_manager.get("line_channel_access_token")),
        "line_token_length": len(config_manager.get("line_channel_access_token", "")),
        "line_secret_exists": bool(config_manager.get("line_channel_secret")),
        "kbank_enabled": config_manager.get("kbank_enabled"),
        "kbank_configured": bool(config_manager.get("kbank_consumer_id") and config_manager.get("kbank_consumer_secret")),
        "ai_enabled": config_manager.get("ai_enabled"),
        "openai_configured": bool(config_manager.get("openai_api_key")),
        "system_status": check_slip_system_status()
    })

@app.get("/admin/check-line-account")
async def check_line_account():
    """Check LINE account capabilities"""
    result = await check_line_account_type()
    return JSONResponse(content=result)

@app.get("/admin/api-status")
async def api_status_check():
    """Check API status (Enhanced version)"""
    status_result = {
        "thunder": {"configured": False, "connected": False, "enabled": False},
        "line": {"configured": False, "connected": False},
        "openai": {"configured": False, "connected": False},
        "kbank": {"configured": False, "connected": False, "enabled": False},
        "system": check_slip_system_status()
    }
    
    async with httpx.AsyncClient() as client:
        # Check Thunder API
        thunder_token = config_manager.get("thunder_api_token")
        thunder_enabled = config_manager.get("slip_enabled", False)
        status_result["thunder"]["enabled"] = thunder_enabled
        if thunder_token:
            status_result["thunder"]["configured"] = True
            try:
                headers = {"Authorization": f"Bearer {thunder_token}"}
                resp = await client.get("https://api.thunder.in.th/v1", headers=headers, timeout=10)
                if resp.status_code in (200, 401, 404, 405):
                    status_result["thunder"]["connected"] = True
            except httpx.RequestError as e:
                status_result["thunder"]["error"] = str(e)
        
        # Check LINE API (Enhanced)
        line_token = config_manager.get("line_channel_access_token")
        if line_token:
            status_result["line"]["configured"] = True
            try:
                headers = {"Authorization": f"Bearer {line_token}"}
                response = await client.get("https://api.line.me/v2/bot/info", headers=headers, timeout=10)
                if response.status_code == 200:
                    bot_data = response.json()
                    status_result["line"]["connected"] = True
                    status_result["line"]["bot_name"] = bot_data.get("displayName")
                    status_result["line"]["user_id"] = bot_data.get("userId")
                    
                    # Test push capability
                    push_test = await client.post(
                        "https://api.line.me/v2/bot/message/push",
                        headers=headers,
                        json={"to": "test_invalid_user", "messages": [{"type": "text", "text": "test"}]},
                        timeout=5
                    )
                    status_result["line"]["can_push"] = push_test.status_code != 403
                    if push_test.status_code == 403:
                        try:
                            error_data = push_test.json()
                            status_result["line"]["push_error"] = error_data.get('message', 'Unknown 403 error')
                        except:
                            status_result["line"]["push_error"] = push_test.text
                else:
                    status_result["line"]["error"] = f"{response.status_code}: {response.text}"
            except httpx.RequestError as e:
                status_result["line"]["error"] = str(e)
        
        # Check KBank API
        kbank_consumer_id = config_manager.get("kbank_consumer_id")
        kbank_consumer_secret = config_manager.get("kbank_consumer_secret")
        kbank_enabled = config_manager.get("kbank_enabled", False)
        status_result["kbank"]["enabled"] = kbank_enabled
        if kbank_consumer_id and kbank_consumer_secret:
            status_result["kbank"]["configured"] = True
            try:
                from services.kbank_checker import kbank_checker
                token = await asyncio.to_thread(kbank_checker._get_access_token)
                if token:
                    status_result["kbank"]["connected"] = True
                    status_result["kbank"]["token_length"] = len(token)
                else:
                    status_result["kbank"]["error"] = "ไม่สามารถขอ access token ได้"
            except Exception as e:
                status_result["kbank"]["error"] = str(e)
    
    return JSONResponse(content=status_result)

@app.get("/admin/system-status")
async def get_system_status():
    """Get system status"""
    system_status = check_slip_system_status()
    return JSONResponse(content={
        "system_status": system_status,
        "active_connections": len(notification_manager.active_connections),
        "pending_notifications": len(notification_manager.pending_notifications),
        "duplicate_cache_size": len(notification_manager.duplicate_slip_cache),
        "timestamp": datetime.now().isoformat()
    })

@app.get("/admin/slip-status")
async def get_slip_processing_status():
    """Get slip processing status"""
    return JSONResponse(content={
        "processing_status": notification_manager.slip_processing_status,
        "active_connections": len(notification_manager.active_connections),
        "pending_notifications": len(notification_manager.pending_notifications),
        "duplicate_cache_size": len(notification_manager.duplicate_slip_cache)
    })

@app.post("/admin/settings/update")
async def update_settings(request: Request) -> JSONResponse:
    """Update settings"""
    try:
        data = await request.json()
        updates = {}
        for key in [
            "line_channel_secret", "line_channel_access_token", "thunder_api_token",
            "openai_api_key", "ai_prompt", "wallet_phone_number",
            "kbank_consumer_id", "kbank_consumer_secret",
        ]:
            if key in data:
                updates[key] = data[key].strip()
        updates["ai_enabled"] = bool(data.get("ai_enabled"))
        updates["slip_enabled"] = bool(data.get("slip_enabled"))
        updates["kbank_enabled"] = bool(data.get("kbank_enabled"))
        
        config_manager.update_multiple(updates)
        
        # Reinitialize LINE Bot if credentials changed
        if any(key in updates for key in ["line_channel_access_token", "line_channel_secret"]):
            init_line_bot()
        
        await notification_manager.send_notification("⚙️ อัปเดตการตั้งค่าระบบแล้ว", "success")
        return JSONResponse(content={"status": "success", "message": "บันทึกการตั้งค่าแล้ว"})
    except Exception as e:
        return JSONResponse(content={"status": "error", "message": str(e)})

@app.post("/admin/test-slip-upload")
async def test_slip_upload(request: Request):
    """Test slip upload"""
    try:
        form = await request.form()
        file = form.get("file")
        if not file:
            return JSONResponse(content={"status": "error", "message": "ไม่พบไฟล์สลิป"})
        
        image_data = await file.read()
        message_id = "admin_test_" + datetime.now().strftime("%Y%m%d%H%M%S")
        
        await notification_manager.send_notification("🧪 Admin กำลังทดสอบการอัปโหลดสลิป", "info")
        
        slip_hash = create_slip_hash(image_data)
        duplicate_data = get_duplicate_slip_data(slip_hash)
        
        if duplicate_data:
            amount_display = duplicate_data['data'].get('amount_display') or f"฿{duplicate_data['data'].get('amount', '0')}"
            await notification_manager.send_notification(f"🔄 พบสลิปซ้ำในการทดสอบ! จำนวน {amount_display}", "warning")
            return JSONResponse(content={
                "status": "duplicate",
                "message": f"สลิปนี้เคยทดสอบแล้ว (ครั้งที่ {duplicate_data.get('count', 1)})",
                "response": duplicate_data['data']
            })
        
        result = await asyncio.to_thread(verify_slip_multiple_providers, test_image_data=image_data)
        
        if result["status"] == "success":
            amount_display = result['data'].get('amount_display') or f"฿{result['data'].get('amount', '0')}"
            await notification_manager.send_notification(f"✅ ทดสอบสลิปสำเร็จ! จำนวน {amount_display}", "success")
            save_duplicate_slip_data(slip_hash, result['data'])
            return JSONResponse(content={
                "status": "success",
                "message": "ทดสอบสลิปสำเร็จ",
                "response": result
            })
        elif result.get("status") == "duplicate":
            await notification_manager.send_notification("🔄 Thunder API แจ้งสลิปซ้ำในการทดสอบ", "warning")
            return JSONResponse(content={
                "status": "duplicate",
                "message": "Thunder API แจ้งสลิปซ้ำ",
                "response": result
            })
        else:
            error_message = result.get("message", "ทดสอบสลิปไม่สำเร็จ")
            await notification_manager.send_notification(f"❌ ทดสอบสลิปล้มเหลว: {error_message}", "error")
            return JSONResponse(content={
                "status": "error",
                "message": error_message,
                "response": result
            })
    except Exception as e:
        logger.exception(f"❌ Test slip upload error: {e}")
        await notification_manager.send_notification(f"💥 เกิดข้อผิดพลาดในการทดสอบสลิป: {str(e)}", "error")
        return JSONResponse(content={
            "status": "error",
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        })

@app.get("/admin/clear-duplicate-cache")
async def clear_duplicate_cache():
    """Clear duplicate cache"""
    try:
        cache_size = len(notification_manager.duplicate_slip_cache)
        notification_manager.duplicate_slip_cache.clear()
        await notification_manager.send_notification(f"🗑️ ล้าง cache สลิปซ้ำแล้ว ({cache_size} รายการ)", "success")
        return JSONResponse(content={
            "status": "success",
            "message": f"ล้าง cache สลิปซ้ำแล้ว ({cache_size} รายการ)"
        })
    except Exception as e:
        return JSONResponse(content={
            "status": "error",
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        })

@app.post("/admin/force-reset-apis")
async def force_reset_apis():
    """Force reset API caches"""
    try:
        try:
            from services.slip_checker import create_requests_session
            session = create_requests_session()
            session.close()
        except:
            pass
        try:
            from services.kbank_checker import kbank_checker
            kbank_checker._clear_token_cache()
        except:
            pass
        await notification_manager.send_notification("🔄 รีเซ็ต API Cache แล้ว", "success")
        return JSONResponse(content={
            "status": "success",
            "message": "รีเซ็ต API Cache แล้ว"
        })
    except Exception as e:
        return JSONResponse(content={
            "status": "error",
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        })

@app.post("/admin/toggle-slip-system")
async def toggle_slip_system():
    """Toggle slip system on/off"""
    try:
        current_status = config_manager.get("slip_enabled", False)
        new_status = not current_status
        config_manager.update("slip_enabled", new_status)
        action = "เปิด" if new_status else "ปิด"
        await notification_manager.send_notification(f"🔄 {action}ระบบตรวจสอบสลิปแล้ว", "success" if new_status else "warning")
        return JSONResponse(content={
            "status": "success",
            "message": f"{action}ระบบตรวจสอบสลิปแล้ว",
            "slip_enabled": new_status
        })
    except Exception as e:
        return JSONResponse(content={
            "status": "error",
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        })

@app.get("/admin/statistics")
async def get_admin_statistics():
    """Get admin statistics"""
    try:
        total_messages = get_chat_history_count()
        recent_history = get_recent_chat_history(limit=1000)
        stats = {
            "total_messages": total_messages,
            "slip_checks": len([h for h in recent_history if h.sender in ['slip_bot', 'slip_bot_duplicate']]),
            "duplicate_cache_size": len(notification_manager.duplicate_slip_cache),
            "active_connections": len(notification_manager.active_connections),
            "pending_notifications": len(notification_manager.pending_notifications),
            "unique_users": len(set([h.user_id for h in recent_history if h.direction == 'in']))
        }
        return JSONResponse(content=stats)
    except Exception as e:
        return JSONResponse(content={
            "status": "error",
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        })

@app.get("/admin/export-chat-history")
async def export_chat_history():
    """Export chat history"""
    try:
        history = get_recent_chat_history(limit=10000)
        export_data = []
        for chat in history:
            export_data.append({
                "timestamp": chat.created_at.isoformat() if hasattr(chat, 'created_at') else datetime.now().isoformat(),
                "user_id": chat.user_id if hasattr(chat, 'user_id') else "unknown",
                "direction": chat.direction if hasattr(chat, 'direction') else "unknown",
                "message_type": chat.message_type if hasattr(chat, 'message_type') else "text",
                "message_text": chat.message_text if hasattr(chat, 'message_text') else "",
                "sender": chat.sender if hasattr(chat, 'sender') else "unknown"
            })
        return JSONResponse(content={
            "status": "success",
            "data": export_data,
            "total_records": len(export_data),
            "export_time": datetime.now().isoformat()
        })
    except Exception as e:
        return JSONResponse(content={
            "status": "error",
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        })

@app.post("/admin/test-push-message")
async def test_push_message(request: Request):
    """Test push message (Enhanced version)"""
    try:
        data = await request.json()
        user_id = data.get("user_id")
        message = data.get("message", "🧪 นี่คือข้อความทดสอบจากระบบ\n\n✅ หากคุณเห็นข้อความนี้ แสดงว่า Push Message API ทำงานปกติ")
        
        if not user_id:
            return JSONResponse(content={
                "status": "error",
                "message": "กรุณาใส่ User ID"
            })
        
        await notification_manager.send_notification(f"🧪 กำลังทดสอบ Push Message ไปยัง {user_id[:8]}...", "info")
        
        success = await send_line_push(user_id, message)
        if success:
            await notification_manager.send_notification(f"✅ ส่ง Push Message ทดสอบสำเร็จไปยัง {user_id[:8]}...", "success")
            return JSONResponse(content={
                "status": "success",
                "message": "ส่ง Push Message สำเร็จ",
                "user_id": user_id,
                "message_length": len(message)
            })
        else:
            return JSONResponse(content={
                "status": "error",
                "message": "ไม่สามารถส่ง Push Message ได้ - ตรวจสอบ log สำหรับข้อมูลเพิ่มเติม"
            })
    except Exception as e:
        return JSONResponse(content={
            "status": "error",
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        })

@app.post("/admin/test-line-capabilities")
async def test_line_capabilities():
    """Test LINE account capabilities comprehensively"""
    try:
        await notification_manager.send_notification("🔬 กำลังทดสอบความสามารถ LINE Account แบบครบถ้วน", "info")
        
        result = await check_line_account_type()
        
        if result.get("status") == "success":
            bot_info = result.get("bot_info", {})
            capabilities = {
                "account_info": {
                    "display_name": bot_info.get("displayName", "Unknown"),
                    "user_id": bot_info.get("userId", "Unknown"),
                    "basic_id": bot_info.get("basicId", "Unknown"),
                    "premium_id": bot_info.get("premiumId", "Not set"),
                },
                "api_capabilities": {
                    "bot_info": True,  # ได้ข้อมูล bot แล้ว
                    "push_message": result.get("can_push", False),
                    "reply_message": True,  # สมมติว่าใช้ได้ถ้า bot info ใช้ได้
                },
                "test_results": {
                    "push_test_status": result.get("push_test_status"),
                    "push_error": result.get("push_error"),
                },
                "recommendations": []
            }
            
            # ให้คำแนะนำตามผลการทดสอบ
            if not result.get("can_push"):
                if "not available" in (result.get("push_error", "")).lower():
                    capabilities["recommendations"].append("❌ Push Message API ไม่รองรับ - ต้องอัปเกรด LINE Official Account เป็น Developer Trial หรือ Pro Plan")
                elif "blocked" in (result.get("push_error", "")).lower():
                    capabilities["recommendations"].append("⚠️ มีผู้ใช้บางคนบล็อกบอท - Push Message จะส่งไม่ถึงผู้ใช้เหล่านั้น")
                else:
                    capabilities["recommendations"].append("⚠️ Push Message อาจมีข้อจำกัด - ควรตรวจสอบ Account Plan")
            else:
                capabilities["recommendations"].append("✅ Push Message API พร้อมใช้งาน")
            
            capabilities["recommendations"].append("💡 ใช้ Reply Message เป็นหลักเพื่อประหยัดโควต้า Push Message")
            
            await notification_manager.send_notification(f"✅ ทดสอบ LINE Account สำเร็จ - {bot_info.get('displayName', 'Unknown')}", "success")
            
            return JSONResponse(content={
                "status": "success",
                "capabilities": capabilities,
                "summary": f"Account: {bot_info.get('displayName', 'Unknown')}, Push: {'✅' if result.get('can_push') else '❌'}"
            })
        else:
            await notification_manager.send_notification(f"❌ ทดสอบ LINE Account ล้มเหลว: {result.get('error')}", "error")
            return JSONResponse(content={
                "status": "error",
                "message": result.get("error", "Unknown error"),
                "recommendations": [
                    "🔑 ตรวจสอบ LINE Channel Access Token",
                    "🔒 ตรวจสอบ LINE Channel Secret",
                    "🌐 ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต",
                    "📋 ตรวจสอบการตั้งค่าใน LINE Developers Console"
                ]
            })
    except Exception as e:
        await notification_manager.send_notification(f"💥 เกิดข้อผิดพลาดในการทดสอบ LINE: {str(e)}", "error")
        return JSONResponse(content={
            "status": "error",
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        })

@app.get("/health")
async def health_check():
    """Health check endpoint (Enhanced)"""
    system_status = check_slip_system_status()
    line_configured = bool(config_manager.get("line_channel_access_token"))
    
    return JSONResponse(content={
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "2.2.0",
        "features": ["push_message_enhanced", "fallback_apis", "detailed_slip_info", "line_account_detection"],
        "components": {
            "database": True,
            "websocket": len(notification_manager.active_connections) >= 0,
            "config": bool(config_manager),
            "cache": len(notification_manager.duplicate_slip_cache) >= 0,
            "push_message": True,
            "slip_system": system_status["system_enabled"],
            "line_configured": line_configured
        },
        "statistics": {
            "active_websocket_connections": len(notification_manager.active_connections),
            "duplicate_slip_cache_size": len(notification_manager.duplicate_slip_cache),
            "total_chat_history": get_chat_history_count()
        }
    })

@app.get("/admin/logs")
async def get_recent_logs(limit: int = 50):
    """Get recent logs (Enhanced)"""
    try:
        system_status = check_slip_system_status()
        line_status = "configured" if config_manager.get("line_channel_access_token") else "not_configured"
        
        sample_logs = [
            {
                "timestamp": datetime.now().isoformat(),
                "level": "INFO",
                "message": f"System running normally - Slip system: {'enabled' if system_status['system_enabled'] else 'disabled'}",
                "component": "main_app"
            },
            {
                "timestamp": datetime.now().isoformat(),
                "level": "INFO",
                "message": f"LINE API status: {line_status}",
                "component": "line_api"
            },
            {
                "timestamp": datetime.now().isoformat(),
                "level": "INFO",
                "message": f"Active WebSocket connections: {len(notification_manager.active_connections)}",
                "component": "websocket"
            },
            {
                "timestamp": datetime.now().isoformat(),
                "level": "INFO", 
                "message": f"Duplicate slip cache size: {len(notification_manager.duplicate_slip_cache)}",
                "component": "slip_cache"
            }
        ]
        
        return JSONResponse(content={
            "status": "success",
            "logs": sample_logs,
            "total": len(sample_logs),
            "system_info": {
                "version": "2.2.0",
                "uptime": "Running",
                "features_enabled": {
                    "slip_checking": system_status["system_enabled"],
                    "push_message": True,
                    "websocket_notifications": True,
                    "duplicate_detection": True
                }
            }
        })
    except Exception as e:
        return JSONResponse(content={
            "status": "error",
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        })

# ====================== Exception Handlers ======================

@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    """404 handler"""
    if request.url.path.startswith("/admin"):
        return RedirectResponse(url="/admin", status_code=status.HTTP_302_FOUND)
    return JSONResponse(
        status_code=404,
        content={"detail": "Not Found", "path": request.url.path}
    )

@app.exception_handler(500)
async def internal_error_handler(request: Request, exc):
    """500 handler"""
    logger.error(f"Internal server error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error"}
    )

# ====================== Startup/Shutdown Events ======================

@app.on_event("startup")
async def startup_event():
    """Startup event handler (Enhanced)"""
    logger.info("🚀 LINE OA Middleware เริ่มทำงาน... (Enhanced Push Message v2.2)")
    
    # Initialize LINE Bot
    if init_line_bot():
        logger.info("✅ LINE Bot credentials loaded")
        
        # ทดสอบ LINE Account capabilities
        try:
            account_info = await check_line_account_type()
            if account_info.get("status") == "success":
                bot_info = account_info.get("bot_info", {})
                logger.info(f"✅ LINE Account: {bot_info.get('displayName', 'Unknown')}")
                logger.info(f"📱 Push Message: {'✅ Available' if account_info.get('can_push') else '❌ Not Available'}")
                if not account_info.get('can_push'):
                    logger.warning(f"⚠️ Push Message limitation: {account_info.get('push_error', 'Unknown')}")
            else:
                logger.warning(f"⚠️ LINE Account check failed: {account_info.get('error')}")
        except Exception as e:
            logger.warning(f"⚠️ Could not check LINE Account capabilities: {e}")
    else:
        logger.warning("⚠️ LINE Bot credentials not found")
    
    # Check required configs
    required_configs = ["line_channel_secret", "line_channel_access_token"]
    missing_configs = []
    for config_key in required_configs:
        if not config_manager.get(config_key):
            missing_configs.append(config_key)
    
    if missing_configs:
        logger.warning(f"⚠️ การตั้งค่าที่ขาดหายไป: {', '.join(missing_configs)}")
        logger.warning("⚠️ กรุณาตั้งค่าในหน้า /admin/settings")
    else:
        logger.info("✅ การตั้งค่าพื้นฐานครบถ้วน")
    
    try:
        api_status = get_api_status_summary()
        thunder_status = "✅" if api_status.get("thunder", {}).get("enabled") else "❌"
        kbank_status = "✅" if api_status.get("kbank", {}).get("enabled") else "❌"
        logger.info(f"📊 สถานะ API: Thunder {thunder_status}, KBank {kbank_status}")
    except Exception as e:
        logger.warning(f"⚠️ ไม่สามารถตรวจสอบสถานะ API ได้: {e}")
    
    await notification_manager.send_notification(
        "🚀 ระบบ LINE OA Middleware เริ่มทำงานแล้ว (Enhanced Push Message v2.2)",
        "success",
        {
            "timestamp": datetime.now().isoformat(),
            "version": "2.2.0",
            "features": ["push_message_enhanced", "fallback_apis", "detailed_slip_info", "line_account_detection"],
            "websocket_connections": 0,
            "system_ready": True
        }
    )
    logger.info("✅ ระบบพร้อมทำงาน - http://localhost:8000/admin")
    logger.info("📱 Enhanced Push Message API พร้อมใช้งาน")
    logger.info("🔍 LINE Account Detection เปิดใช้งาน")

@app.on_event("shutdown")
async def shutdown_event():
    """Shutdown event handler"""
    logger.info("🛑 LINE OA Middleware กำลังหยุดทำงาน...")
    await notification_manager.send_notification("🛑 ระบบกำลังหยุดทำงาน", "info")
    
    for connection in notification_manager.active_connections.copy():
        try:
            await connection.close()
        except:
            pass
    notification_manager.active_connections.clear()
    notification_manager.duplicate_slip_cache.clear()
    notification_manager.pending_notifications.clear()
    logger.info("✅ หยุดระบบเรียบร้อยแล้ว")

if __name__ == "__main__":
    import uvicorn
    uvicorn_log_config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            },
        },
        "handlers": {
            "default": {
                "formatter": "default",
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",
            },
        },
        "root": {
            "level": "INFO",
            "handlers": ["default"],
        },
        "loggers": {
            "uvicorn": {"level": "INFO"},
            "uvicorn.error": {"level": "INFO"},
            "uvicorn.access": {"level": "INFO"},
        },
    }
    print("🚀 เริ่มต้น LINE OA Middleware (Enhanced Push Message v2.2)...")
    print("📱 เว็บ Admin: http://localhost:8000/admin")
    print("🔗 LINE Webhook URL: http://localhost:8000/line/webhook")
    print("📊 API Status: http://localhost:8000/admin/api-status")
    print("🏥 Health Check: http://localhost:8000/health")
    print("📤 Enhanced Push Message API พร้อมใช้งาน")
    print("🔍 LINE Account Detection เปิดใช้งาน")
    print()
    try:
        uvicorn.run(
            "main_updated:app",
            host="0.0.0.0",
            port=8000,
            reload=False,
            log_config=uvicorn_log_config,
            access_log=True,
            server_header=False,
            date_header=False
        )
    except KeyboardInterrupt:
        print("\n🛑 หยุดระบบโดยผู้ใช้")
    except Exception as e:
        print(f"\n❌ เกิดข้อผิดพลาดในการเริ่มต้นระบบ: {e}")
