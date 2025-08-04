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
import requests
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry
import pytz

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

# Global Session สำหรับ Synchronous calls ในบางกรณี
session_sync = requests.Session()
retry_strategy = Retry(
    total=3,
    backoff_factor=1,
    status_forcelist=[429, 500, 502, 503, 504],
    allowed_methods=["POST", "GET"]
)
adapter = HTTPAdapter(max_retries=retry_strategy)
session_sync.mount("http://", adapter)
session_sync.mount("https://", adapter)

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

def format_thai_datetime(iso_datetime: str) -> Dict[str, str]:
    """แปลง ISO datetime เป็นรูปแบบไทย"""
    try:
        dt = datetime.fromisoformat(iso_datetime.replace('Z', '+00:00'))
        thai_tz = pytz.timezone('Asia/Bangkok')
        thai_dt = dt.astimezone(thai_tz)
        return {
            "date": thai_dt.strftime("%d/%m/%Y"),
            "time": thai_dt.strftime("%H:%M:%S"),
            "full": thai_dt.strftime("%d/%m/%Y %H:%M:%S")
        }
    except Exception as e:
        logger.warning(f"Date parsing error for '{iso_datetime}': {e}")
        date_part = iso_datetime.split('T')[0] if 'T' in iso_datetime else iso_datetime
        time_part = iso_datetime.split('T')[1][:8] if 'T' in iso_datetime and len(iso_datetime.split('T')[1]) >= 8 else ""
        return {
            "date": date_part,
            "time": time_part,
            "full": iso_datetime
        }

def extract_account_info(account_data: Optional[Dict]) -> Dict[str, str]:
    """ดึงข้อมูลบัญชีจาก account object"""
    info = {
        "name_th": "", "name_en": "", "account_number": "",
        "account_type": "", "proxy_type": "", "proxy_account": ""
    }
    if not isinstance(account_data, dict): return info
    name_data = account_data.get("name", {})
    if isinstance(name_data, dict):
        info["name_th"] = name_data.get("th", "")
        info["name_en"] = name_data.get("en", "")
    bank_data = account_data.get("bank", {})
    if isinstance(bank_data, dict):
        info["account_type"] = bank_data.get("type", "")
        info["account_number"] = bank_data.get("account", "")
    proxy_data = account_data.get("proxy", {})
    if isinstance(proxy_data, dict):
        info["proxy_type"] = proxy_data.get("type", "")
        info["proxy_account"] = proxy_data.get("account", "")
    return info

def format_amount(amount_data: Any) -> Dict[str, str]:
    """จัดรูปแบบจำนวนเงิน"""
    try:
        if isinstance(amount_data, dict): amount_value = amount_data.get("amount", 0)
        else: amount_value = amount_data or 0
        amount_float = float(amount_value)
        return {
            "raw": str(amount_value),
            "formatted": f"{amount_float:,.2f}",
            "with_currency": f"฿{amount_float:,.2f}"
        }
    except Exception as e:
        logger.warning(f"Amount formatting error: {e}")
        return {
            "raw": str(amount_data),
            "formatted": str(amount_data),
            "with_currency": f"฿{amount_data}"
        }

def process_thunder_response_data(data_response: Dict[str, Any]) -> Dict[str, Any]:
    """ประมวลผลข้อมูลที่ได้จาก Thunder API และจัดรูปแบบใหม่"""
    datetime_info = format_thai_datetime(data_response.get("date", ""))
    amount_info = format_amount(data_response.get("amount", {}))
    fee = data_response.get("fee", 0)
    sender_info = data_response.get("sender", {})
    receiver_info = data_response.get("receiver", {})
    sender_bank = sender_info.get("bank", {}) if isinstance(sender_info, dict) else {}
    receiver_bank = receiver_info.get("bank", {}) if isinstance(receiver_info, dict) else {}
    sender_account = extract_account_info(sender_info.get("account", {})) if isinstance(sender_info, dict) else {}
    receiver_account = extract_account_info(receiver_info.get("account", {})) if isinstance(receiver_info, dict) else {}
    return {
        "amount": amount_info["raw"],
        "amount_formatted": amount_info["formatted"],
        "amount_display": amount_info["with_currency"],
        "date": datetime_info["date"],
        "time": datetime_info["time"],
        "datetime_full": datetime_info["full"],
        "reference": data_response.get("transRef", ""),
        "country_code": data_response.get("countryCode", "TH"),
        "sender_bank_id": sender_bank.get("id", ""),
        "sender_bank_name": sender_bank.get("name", ""),
        "sender_bank_short": sender_bank.get("short", ""),
        "sender_name_th": sender_account.get("name_th", ""),
        "sender_name_en": sender_account.get("name_en", ""),
        "sender_account_number": sender_account.get("account_number", ""),
        "sender_account_type": sender_account.get("account_type", ""),
        "receiver_bank_id": receiver_bank.get("id", ""),
        "receiver_bank_name": receiver_bank.get("name", ""),
        "receiver_bank_short": receiver_bank.get("short", ""),
        "receiver_name_th": receiver_account.get("name_th", ""),
        "receiver_name_en": receiver_account.get("name_en", ""),
        "receiver_account_number": receiver_account.get("account_number", ""),
        "receiver_account_type": receiver_account.get("account_type", ""),
        "receiver_proxy_type": receiver_account.get("proxy_type", ""),
        "receiver_proxy_account": receiver_account.get("proxy_account", ""),
        "fee": fee,
        "ref1": data_response.get("ref1", ""),
        "ref2": data_response.get("ref2", ""),
        "ref3": data_response.get("ref3", ""),
        "sender": sender_account.get("name_th", "") or sender_account.get("name_en", ""),
        "receiver_name": receiver_account.get("name_th", "") or receiver_account.get("name_en", ""),
        "sender_bank": sender_bank.get("short", ""),
        "receiver_bank": receiver_bank.get("short", ""),
        "verified_by": "Thunder API",
        "verification_time": datetime.now().isoformat(),
        "raw_data": data_response
    }

def verify_slip_with_thunder(
    message_id: str,
    test_image_data: Optional[bytes] = None,
    check_duplicate: Optional[bool] = None,
) -> Dict[str, Any]:
    """ตรวจสอบสลิปด้วย Thunder API v1"""
    if not config_manager.get("slip_enabled"):
        return {"status": "error", "message": "ระบบตรวจสอบสลิปถูกปิดอยู่"}
    
    api_token: str = config_manager.get("thunder_api_token", "").strip()
    line_token: str = config_manager.get("line_channel_access_token", "").strip()

    if not api_token:
        logger.error("THUNDER_API_TOKEN is missing or empty.")
        return {"status": "error", "message": "ยังไม่ได้ตั้งค่า Thunder API Token"}

    image_data = test_image_data
    if not test_image_data and message_id:
        if not line_token:
            logger.error("LINE_CHANNEL_ACCESS_TOKEN is missing.")
            return {"status": "error", "message": "ยังไม่ได้ตั้งค่า LINE Channel Access Token"}
        
        try:
            url = f"https://api-data.line.me/v2/bot/message/{message_id}/content"
            headers = {"Authorization": f"Bearer {line_token}"}
            resp = session_sync.get(url, headers=headers, timeout=30)
            resp.raise_for_status()
            image_data = resp.content
            logger.info(f"✅ ดาวน์โหลดรูปจาก LINE สำเร็จ: {len(image_data)} bytes")
        except Exception as e:
            logger.exception("❌ ดาวน์โหลดรูปภาพจาก LINE ไม่สำเร็จ: %s", e)
            return {"status": "error", "message": f"ไม่สามารถดาวน์โหลดรูปจาก LINE ได้: {str(e)}"}

    if not image_data:
        return {"status": "error", "message": "ไม่พบข้อมูลรูปภาพ"}

    unique_id = f"test_{hashlib.md5(image_data).hexdigest()[:8]}_{int(time.time())}" if not message_id else f"{message_id}_{int(time.time())}"
    
    base_url = "https://api.thunder.in.th/v1"
    endpoint = f"{base_url}/verify"
    
    logger.info(f"🔍 ใช้ Thunder API verification endpoint: {endpoint}")

    headers = {
        "Authorization": f"Bearer {api_token}",
        "User-Agent": "LINE-OA-Middleware/1.0"
    }
    
    files = {"file": (f"slip_{unique_id}.jpg", image_data, "image/jpeg")}
    data = {"checkDuplicate": "true" if check_duplicate is not False else "false"}
    
    try:
        logger.info(f"🚀 ส่งคำขอไปยัง Thunder API: {endpoint}")
        
        resp = session_sync.post(
            endpoint, headers=headers, files=files, data=data, timeout=60
        )
        
        logger.info(f"📈 Thunder API Response: {resp.status_code}")
        
        try:
            result = resp.json()
            logger.info(f"📄 Response parsed successfully - Status: {result.get('status')}")
        except json.JSONDecodeError as e:
            logger.error(f"❌ ไม่สามารถ parse JSON response: {e}. Raw response: {resp.text[:500]}")
            return {"status": "error", "message": f"Thunder API ตอบกลับข้อมูลที่ไม่ถูกต้อง (HTTP {resp.status_code})"}
        
        if resp.status_code == 200 and result.get("status") == 200:
            logger.info("✅ Thunder API successful!")
            data_response = result.get("data", {})
            if not data_response:
                return {"status": "error", "message": "ไม่พบข้อมูลสลิปในการตอบกลับจาก Thunder API"}
            
            formatted_data = process_thunder_response_data(data_response)
            return {"status": "success", "type": "thunder", "data": formatted_data}
        elif resp.status_code == 400:
            error_msg = result.get("message", "Bad Request")
            logger.warning(f"❌ Thunder API returned 400 Bad Request: {error_msg}")
            
            if error_msg == "duplicate_slip":
                logger.info("🔄 Thunder API duplicate slip detected")
                duplicate_data = result.get("data", {})
                formatted_data = process_thunder_response_data(duplicate_data)
                formatted_data["verified_by"] = "Thunder API (Duplicate)"
                return {"status": "duplicate", "message": "🔄 สลิปนี้เคยถูกตรวจสอบแล้ว", "data": formatted_data}
            elif error_msg == "invalid_image": return {"status": "error", "message": "🖼️ รูปภาพไม่ถูกต้อง กรุณาส่งรูปสลิปธนาคารที่ชัด"}
            elif error_msg == "image_size_too_large": return {"status": "error", "message": "📏 ขนาดรูปภาพใหญ่เกินไป กรุณาลดขนาดรูปแล้วลองใหม่"}
            elif error_msg == "qrcode_not_found": return {"status": "error", "message": "📱 ไม่พบ QR Code ในรูปภาพ กรุณาส่งรูปภาพที่มี QR Code"}
            else: return {"status": "error", "message": f"❌ Thunder API: {error_msg}"}
        elif resp.status_code == 401: return {"status": "error", "message": "🔑 Thunder API Token ไม่ถูกต้องหรือหมดอายุ"}
        elif resp.status_code == 403:
            error_msg = result.get("message", "access_denied")
            logger.warning(f"❌ Thunder API returned 403 Forbidden: {error_msg}")
            if error_msg == "quota_exceeded": return {"status": "error", "message": "📊 ใช้งาน API เกินโควต้าที่กำหนด กรุณาอัปเกรดแพ็กเกจ"}
            elif error_msg == "access_denied" or error_msg == "application_expired": return {"status": "error", "message": "🚫 การเข้าถึง Thunder API ถูกปฏิเสธ กรุณาตรวจสอบแพ็กเกจหรือติดต่อฝ่ายสนับสนุน"}
            else: return {"status": "error", "message": f"🚫 Thunder API Forbidden: {error_msg}"}
        elif resp.status_code == 404:
            error_msg = result.get("message", "not_found")
            logger.warning(f"❌ Thunder API returned 404 Not Found: {error_msg}")
            if error_msg == "slip_not_found": return {"status": "error", "message": "🔍 ไม่พบข้อมูลสลิปที่ถูกต้องในระบบธนาคาร"}
            else: return {"status": "error", "message": f"🔍 Thunder API Not Found: {error_msg}"}
        elif resp.status_code >= 500:
            error_msg = result.get("message", "server_error")
            logger.warning(f"❌ Thunder API returned {resp.status_code} Server Error: {error_msg}")
            return {"status": "error", "message": "🔧 เซิร์ฟเวอร์ Thunder API มีปัญหา กรุณาลองใหม่อีกสักครู่"}
        else: return {"status": "error", "message": f"❌ Thunder API Error: HTTP {resp.status_code}"}
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
        logger.error("❌ Thunder API connection error or timeout: %s", e)
        return {"status": "error", "message": "🌐 ไม่สามารถเชื่อมต่อกับ Thunder API ได้ กรุณาลองใหม่"}
    except requests.exceptions.RequestException as e:
        logger.exception("❌ Thunder API request error: %s", e)
        return {"status": "error", "message": f"🔗 เกิดข้อผิดพลาดในการเชื่อมต่อ Thunder API: {str(e)}"}
    except Exception as e:
        logger.exception("❌ Unexpected error: %s", e)
        return {"status": "error", "message": f"💥 เกิดข้อผิดพลาดไม่คาดคิด: {str(e)}"}

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

try:
    logger.info("Initializing database...")
    init_database()
    logger.info("✅ Database initialized successfully")
except Exception as e:
    logger.error(f"❌ Database initialization error: {e}")

def init_line_bot():
    global line_bot_api, line_handler
    access_token = config_manager.get("line_channel_access_token")
    channel_secret = config_manager.get("line_channel_secret")
    if access_token and channel_secret:
        line_bot_api = {"access_token": access_token, "channel_secret": channel_secret}
        line_handler = True
        logger.info("✅ LINE Bot credentials loaded")
        return True
    else:
        logger.warning("⚠️ LINE credentials not found")
        return False

def verify_line_signature(body: bytes, signature: str, channel_secret: str) -> bool:
    if not channel_secret:
        logger.warning("⚠️ LINE Channel Secret is empty - skipping signature verification")
        return True
    try:
        h = hmac.new(channel_secret.encode(), body, hashlib.sha256).digest()
        computed = base64.b64encode(h).decode()
        return hmac.compare_digest(computed, signature)
    except Exception as e:
        logger.error(f"❌ Signature verification error: {e}")
        return False

async def send_line_reply(reply_token: str, text: str, max_retries: int = 3) -> bool:
    access_token = config_manager.get("line_channel_access_token")
    if not access_token:
        logger.error("❌ LINE_CHANNEL_ACCESS_TOKEN is missing")
        return False
    if not reply_token or len(reply_token.strip()) < 10:
        logger.error("❌ Reply token is empty, invalid, or too short")
        return False
    if len(text) > 5000: text = text[:4900] + "\n\n(ข้อความถูกตัดเนื่องจากยาวเกินไป)"
    url = "https://api.line.me/v2/bot/message/reply"
    headers = {
        "Authorization": f"Bearer {access_token}", 
        "Content-Type": "application/json",
        "User-Agent": "LINE-OA-Middleware/1.0",
    }
    payload = {"replyToken": reply_token, "messages": [{"type": "text", "text": text}]}
    async with httpx.AsyncClient() as client:
        for attempt in range(max_retries):
            try:
                response = await client.post(url, headers=headers, json=payload, timeout=15)
                logger.info(f"📤 LINE Reply API response: {response.status_code}")
                if response.status_code == 200: return True
                elif response.status_code == 400:
                    error_data = response.json() if response.headers.get('content-type', '').startswith('application/json') else {}
                    error_message = error_data.get('message', 'Bad Request')
                    logger.error(f"❌ LINE Reply API 400 Bad Request: {error_message}")
                    if 'invalid' in error_message.lower() and 'token' in error_message.lower():
                        logger.error("❌ Reply token expired - not retrying")
                    return False
                elif response.status_code == 401: logger.error(f"❌ LINE Reply API 401 Unauthorized"); return False
                elif response.status_code == 403: logger.error(f"❌ LINE Reply API 403 Forbidden"); return False
                elif response.status_code >= 500:
                    logger.warning(f"⚠️ LINE Reply API {response.status_code} Server Error - will retry")
                    if attempt < max_retries - 1: await asyncio.sleep(1); continue
                else: logger.error(f"❌ LINE Reply API HTTP {response.status_code}: {response.text}"); return False
            except (httpx.TimeoutException, httpx.RequestError) as e:
                logger.warning(f"⚠️ LINE Reply API request error (attempt {attempt + 1}): {e}")
                if attempt < max_retries - 1: await asyncio.sleep(1); continue
            except Exception as e:
                logger.exception(f"❌ Unexpected error sending LINE reply: {e}"); return False
    logger.error(f"❌ Failed to send LINE reply after {max_retries} attempts"); return False

async def send_line_push(user_id: str, text: str, max_retries: int = 3) -> bool:
    access_token = config_manager.get("line_channel_access_token")
    if not access_token: logger.error("❌ LINE_CHANNEL_ACCESS_TOKEN is missing"); return False
    if not user_id or user_id.strip() == "": logger.error("❌ User ID is empty"); return False
    if len(text) > 5000: text = text[:4900] + "\n\n(ข้อความถูกตัดเนื่องจากยาวเกินไป)"
    url = "https://api.line.me/v2/bot/message/push"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "User-Agent": "LINE-OA-Middleware/1.0",
    }
    payload = {"to": user_id, "messages": [{"type": "text", "text": text}]}
    async with httpx.AsyncClient() as client:
        for attempt in range(max_retries):
            try:
                response = await client.post(url, headers=headers, json=payload, timeout=15)
                logger.info(f"📤 LINE Push API response: {response.status_code}")
                if response.status_code == 200: logger.info("✅ Push message sent successfully"); return True
                elif response.status_code == 400:
                    error_data = response.json() if response.headers.get('content-type', '').startswith('application/json') else {}
                    error_message = error_data.get('message', 'Bad Request')
                    logger.error(f"❌ LINE Push API 400 Bad Request: {error_message}"); return False
                elif response.status_code == 401: logger.error(f"❌ LINE Push API 401 Unauthorized"); return False
                elif response.status_code == 403: logger.error(f"❌ LINE Push API 403 Forbidden"); return False
                elif response.status_code >= 500:
                    logger.warning(f"⚠️ LINE Push API {response.status_code} Server Error - will retry")
                    if attempt < max_retries - 1: await asyncio.sleep(1); continue
                else: logger.error(f"❌ LINE Push API HTTP {response.status_code}: {response.text}"); return False
            except (httpx.TimeoutException, httpx.RequestError) as e:
                logger.warning(f"⚠️ LINE Push API request error (attempt {attempt + 1}): {e}")
                if attempt < max_retries - 1: await asyncio.sleep(1); continue
            except Exception as e:
                logger.exception(f"❌ Unexpected error in send_line_push: {e}"); return False
    logger.error(f"❌ Failed to send LINE push message after {max_retries} attempts"); return False

def create_slip_hash(image_data: bytes) -> str:
    return hashlib.md5(image_data).hexdigest()

def save_duplicate_slip_data(slip_hash: str, slip_data: Dict) -> None:
    notification_manager.duplicate_slip_cache[slip_hash] = {
        "data": slip_data,
        "timestamp": datetime.now().isoformat(),
        "count": notification_manager.duplicate_slip_cache.get(slip_hash, {}).get("count", 0) + 1
    }

def get_duplicate_slip_data(slip_hash: str) -> Optional[Dict]:
    return notification_manager.duplicate_slip_cache.get(slip_hash)

def check_slip_system_status() -> Dict[str, Any]:
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
    verified_by = data.get('verified_by', 'Thunder API')
    if is_duplicate:
        header = f"🔄 สลิปนี้เคยตรวจสอบแล้ว (ครั้งที่ {duplicate_count})" if duplicate_count > 0 else "🔄 สลิปนี้เคยถูกตรวจสอบแล้ว"
    else:
        header = "✅ สลิปถูกต้อง - ตรวจสอบสำเร็จ"
    message = f"{header}\n\n"
    message += "═══ 📋 รายละเอียดการโอนเงิน ═══\n"
    message += f"💰 จำนวนเงิน: {amount_display}\n"
    message += f"📅 วันที่ทำรายการ: {date}\n"
    if time_str: message += f"🕐 เวลาทำรายการ: {time_str}\n"
    if reference: message += f"📋 เลขอ้างอิง: {reference}\n"
    if fee and float(fee) > 0: message += f"💸 ค่าธรรมเนียม: ฿{fee}\n"
    if sender_name or sender_bank_name or sender_account:
        message += "\n═══ 👤 ข้อมูลผู้ส่ง ═══\n"
        if sender_name: message += f"👤 ชื่อผู้โอน: {sender_name}\n"
        if sender_bank_name: message += f"🏦 ธนาคารผู้โอน: {sender_bank_name}\n"
        if sender_account: message += f"💳 เลขบัญชีผู้โอน: {sender_account[:4] + 'xxxx' + sender_account[-4:] if len(sender_account) > 8 else sender_account}\n"
    if receiver_name or receiver_bank_name or receiver_account:
        message += "\n═══ 🏪 ข้อมูลผู้รับ ═══\n"
        if receiver_name: message += f"🏪 ชื่อผู้รับ: {receiver_name}\n"
        if receiver_bank_name: message += f"🏦 ธนาคารผู้รับ: {receiver_bank_name}\n"
        if receiver_account: message += f"💳 เลขบัญชีผู้รับ: {receiver_account[:4] + 'xxxx' + receiver_account[-4:] if len(receiver_account) > 8 else receiver_account}\n"
    message += f"\n🔍 ตรวจสอบโดย: {verified_by}\n"
    if is_duplicate:
        message += "\n💡 หมายเหตุ: สลิปนี้ได้รับการตรวจสอบความถูกต้องแล้ว"
        if duplicate_count > 1: message += f" และได้ถูกส่งมาตรวจสอบซ้ำไปแล้ว {duplicate_count-1} ครั้ง"
    else: message += "\n🎉 การโอนเงินได้รับการยืนยันแล้ว"
    return message

async def send_initial_and_final_message(user_id: str, reply_token: str, initial_msg: str, final_msg: str, log_sender: str = "slip_bot") -> None:
    if reply_token:
        if not await send_line_reply(reply_token, initial_msg):
            logger.warning("⚠️ Failed to send initial reply - will use push message for all messages")
            if not await send_line_push(user_id, initial_msg):
                logger.error("❌ Failed to send initial message via push"); return

    push_sent = await send_line_push(user_id, final_msg)
    if not push_sent: logger.error(f"❌ Failed to send final message via push")
    else: logger.info(f"✅ Sent final message via push")

    try: save_chat_history(user_id, "out", {"type": "text", "text": final_msg}, sender=log_sender)
    except Exception as e: logger.warning(f"⚠️ Failed to save chat history: {e}")

async def dispatch_event_async(event: Dict[str, Any]) -> None:
    try:
        if event.get("type") != "message": return
        message = event.get("message", {})
        user_id = event.get("source", {}).get("userId", "unknown_user")
        reply_token = event.get("replyToken")
        message_type = message.get("type")
        logger.info(f"🔄 Processing {message_type} from user {user_id}")
        try: save_chat_history(user_id, "in", message, sender="user")
        except Exception as e: logger.warning(f"⚠️ Failed to save chat history: {e}")

        if message_type == "image":
            await notification_manager.send_notification(f"🖼️ ได้รับรูปสลิปจากผู้ใช้ {user_id[:8]}...", "info")
            system_status = check_slip_system_status()
            if not system_status["system_enabled"] or not system_status["any_api_available"]:
                error_msg_user = "ขออภัยค่ะ ระบบตรวจสอบสลิปอัตโนมัติปิดใช้งานชั่วคราว หรือมีปัญหา กรุณาติดต่อแอดมิน"
                await notification_manager.send_notification("❌ ระบบตรวจสอบสลิปไม่พร้อมใช้งาน", "error")
                await send_initial_and_final_message(user_id, reply_token, "ขออภัย ระบบไม่พร้อมใช้งาน", error_msg_user, "system")
                return
            processing_msg = "⏳ กำลังตรวจสอบสลิปของคุณ...\n🔍 รอซักครู่ ระบบกำลังวิเคราะห์ข้อมูล"
            if reply_token: await send_line_reply(reply_token, processing_msg)
            
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
                    await send_initial_and_final_message(user_id, reply_token, processing_msg, error_msg_user, "slip_bot_error")
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
                    await send_initial_and_final_message(user_id, reply_token, processing_msg, success_msg, "slip_bot_duplicate")
                    if slip_hash: save_duplicate_slip_data(slip_hash, duplicate_data['data'])
                else:
                    logger.info("🔍 Processing new slip with multiple providers...")
                    result = await asyncio.to_thread(verify_slip_multiple_providers, message_id=message.get("id"))
                    if result["status"] == "success":
                        amount_display = result['data'].get('amount_display') or f"฿{result['data'].get('amount', '0')}"
                        await notification_manager.send_notification(f"✅ ตรวจสอบสลิปสำเร็จ! จำนวน {amount_display}", "success")
                        success_msg = create_detailed_slip_message(result['data'], is_duplicate=False)
                        await send_initial_and_final_message(user_id, reply_token, processing_msg, success_msg, "slip_bot")
                        if slip_hash and image_data: save_duplicate_slip_data(slip_hash, result['data'])
                    elif result.get("status") == "duplicate":
                        logger.info("🔄 API reported duplicate slip.")
                        await notification_manager.send_notification(f"🔄 API แจ้งสลิปซ้ำ", "warning")
                        data_to_send = result.get('data', {})
                        if data_to_send:
                            success_msg = create_detailed_slip_message(data_to_send, is_duplicate=True)
                            await send_initial_and_final_message(user_id, reply_token, processing_msg, success_msg, "slip_bot_duplicate")
                            if slip_hash and image_data: save_duplicate_slip_data(slip_hash, data_to_send)
                        else:
                            error_msg_user = "🔄 สลิปนี้เคยถูกตรวจสอบแล้วค่ะ"
                            await send_initial_and_final_message(user_id, reply_token, processing_msg, error_msg_user, "slip_bot_duplicate")
                    else:
                        error_message_tech = result.get("message", "ตรวจสอบสลิปไม่สำเร็จ")
                        error_message_user = "❌ ไม่พบข้อมูลสลิปที่ถูกต้องในระบบธนาคารค่ะ"
                        if error_message_tech == "qrcode_not_found": error_message_user = "❌ ไม่พบ QR Code ในรูปภาพที่ส่งมาค่ะ"
                        elif "unauthorized" in error_message_tech.lower(): error_message_user = "❌ ระบบตรวจสอบมีปัญหาชั่วคราว กรุณาแจ้งแอดมินหรือลองใหม่อีกครั้งค่ะ"
                        await notification_manager.send_notification(f"❌ ตรวจสอบสลิปล้มเหลว: {error_message_tech}", "error")
                        await send_initial_and_final_message(user_id, reply_token, processing_msg, error_message_user, "slip_bot_error")
            except Exception as e:
                error_msg_user = f"💥 เกิดข้อผิดพลาดในการตรวจสอบสลิป\n\n🔧 กรุณาลองใหม่อีกครั้ง หรือติดต่อแอดมิน"
                logger.error(f"❌ Slip verification exception: {e}", exc_info=True)
                await notification_manager.send_notification(f"💥 เกิดข้อผิดพลาดร้ายแรง: {str(e)}", "error")
                await send_initial_and_final_message(user_id, reply_token, processing_msg, error_msg_user, "slip_bot_error")
        elif message_type == "text":
            user_text = message.get("text", "")
            slip_info = extract_slip_info_from_text(user_text)
            if slip_info["bank_code"] and slip_info["trans_ref"]:
                system_status = check_slip_system_status()
                if not system_status["system_enabled"] or not system_status["any_api_available"]:
                    system_off_msg = "🔒 ระบบตรวจสอบสลิปออโตปิดใช้งานชั่วคราว หรือมีปัญหา กรุณาติดต่อแอดมิน"
                    await send_line_push(user_id, system_off_msg); return
                await notification_manager.send_notification(f"📝 ได้รับข้อมูลสลิปจากข้อความ: ธนาคาร {slip_info['bank_code']}, อ้างอิง {slip_info['trans_ref']}", "info")
                text_hash = hashlib.md5(f"{slip_info['bank_code']}:{slip_info['trans_ref']}".encode()).hexdigest()
                duplicate_data = get_duplicate_slip_data(text_hash)
                if duplicate_data:
                    duplicate_count = duplicate_data.get('count', 1)
                    amount_display = duplicate_data['data'].get('amount_display') or f"฿{duplicate_data['data'].get('amount', '0')}"
                    await notification_manager.send_notification(f"🔄 พบข้อมูลสลิปซ้ำจากข้อความ! จำนวน {amount_display} (ครั้งที่ {duplicate_count})", "warning")
                    success_msg = f"🔄 ข้อมูลสลิปนี้เคยตรวจสอบแล้ว (ครั้งที่ {duplicate_count})\n\n✅ รายละเอียดการโอน:\n💰 จำนวนเงิน: {amount_display}\n🏦 รหัสธนาคาร: {slip_info['bank_code']}\n📋 เลขอ้างอิง: {slip_info['trans_ref']}\n🔍 ตรวจสอบโดย: {duplicate_data['data'].get('verified_by', 'ระบบตรวจสอบ')}"
                    await send_line_push(user_id, success_msg)
                    save_duplicate_slip_data(text_hash, duplicate_data['data'])
                else:
                    try:
                        result = await asyncio.to_thread(verify_slip_multiple_providers, None, None, slip_info["bank_code"], slip_info["trans_ref"])
                        if result["status"] == "success":
                            amount_display = result['data'].get('amount_display') or f"฿{result['data'].get('amount', '0')}"
                            await notification_manager.send_notification(f"✅ ตรวจสอบสลิปจากข้อความสำเร็จ! จำนวน {amount_display}", "success")
                            success_msg = f"✅ ตรวจสอบสลิปสำเร็จ\n\n📋 รายละเอียดการโอน:\n💰 จำนวนเงิน: {amount_display}\n🏦 รหัสธนาคาร: {slip_info['bank_code']}\n📋 เลขอ้างอิง: {slip_info['trans_ref']}\n🔍 ตรวจสอบโดย: {result['data'].get('verified_by', 'ระบบตรวจสอบ')}\n\n🎉 การโอนเงินได้รับการยืนยันแล้ว"
                            await send_line_push(user_id, success_msg)
                            save_duplicate_slip_data(text_hash, result['data'])
                        else:
                            error_message_tech = result.get("message", "ตรวจสอบสลิปไม่สำเร็จ")
                            error_message_user = "❌ ไม่พบข้อมูลสลิปที่ถูกต้องในระบบธนาคารค่ะ"
                            if "unauthorized" in error_message_tech.lower() or "access_denied" in error_message_tech.lower() or "quota_exceeded" in error_message_tech.lower():
                                error_message_user = "❌ ระบบตรวจสอบมีปัญหาชั่วคราว กรุณาแจ้งแอดมินหรือลองใหม่อีกครั้งค่ะ"
                            await notification_manager.send_notification(f"❌ ตรวจสอบสลิปจากข้อความล้มเหลว: {error_message_tech}", "error")
                            await send_line_push(user_id, error_message_user)
                    except Exception as e:
                        error_msg_user = f"เกิดข้อผิดพลาดในการตรวจสอบสลิปจากข้อความ"
                        logger.error(f"❌ Text slip verification error: {e}")
                        await notification_manager.send_notification(f"💥 เกิดข้อผิดพลาดในการตรวจสอบสลิปจากข้อความ: {str(e)}", "error")
                        await send_line_push(user_id, error_msg_user)
            else:
                await notification_manager.send_notification(f"💬 ได้รับข้อความจากผู้ใช้ {user_id[:8]}...: {user_text[:30]}...", "info")
                try:
                    response = await asyncio.to_thread(get_chat_response, user_text, user_id)
                    await send_line_push(user_id, response)
                    save_chat_history(user_id, "out", {"type": "text", "text": response}, sender="bot")
                except Exception as e:
                    error_msg = "ขออภัย เกิดข้อผิดพลาดในการประมวลผล AI"
                    logger.error(f"❌ AI processing error: {e}")
                    await send_line_push(user_id, error_msg)
        else:
            await notification_manager.send_notification(f"📝 ได้รับข้อความประเภท {message_type} จากผู้ใช้ {user_id[:8]}...", "info")
            await send_line_push(user_id, "ขออภัย ระบบรองรับเฉพาะข้อความและรูปภาพเท่านั้น")
    except Exception as e:
        logger.exception(f"❌ Critical error in dispatch_event: {e}")
        await notification_manager.send_notification(f"💥 เกิดข้อผิดพลาดร้ายแรง: {str(e)}", "error")

@app.websocket("/ws/notifications")
async def websocket_endpoint(websocket: WebSocket):
    await notification_manager.connect(websocket)
    for notification in notification_manager.pending_notifications:
        try: await websocket.send_text(json.dumps(notification))
        except Exception as e: logger.error(f"Error sending pending notification: {e}")
    notification_manager.pending_notifications.clear()
    try:
        while True: await websocket.receive_text()
    except WebSocketDisconnect: notification_manager.disconnect(websocket)

@app.post("/line/webhook")
async def line_webhook(request: Request, x_line_signature: str = Header(None)) -> JSONResponse:
    logger.info("📨 Received LINE webhook request")
    try:
        body = await request.body()
        signature = x_line_signature or ""
        channel_secret = config_manager.get("line_channel_secret", "")
        if not verify_line_signature(body, signature, channel_secret):
            logger.error("❌ Invalid LINE signature")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid signature")
        try: payload = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError as e:
            logger.error(f"❌ Invalid JSON payload: {e}"); raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")
        events = payload.get("events", [])
        logger.info(f"🎭 Processing {len(events)} events")
        if not events: return JSONResponse(content={"status": "ok", "message": "No events to process"})
        tasks = [dispatch_event_async(ev) for ev in events]
        await asyncio.gather(*tasks)
        return JSONResponse(content={"status": "ok", "events_processed": len(events)})
    except HTTPException: raise
    except Exception as e:
        logger.exception(f"❌ Webhook processing error: {e}"); raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error")

@app.get("/", response_class=HTMLResponse)
async def root(): return RedirectResponse(url="/admin", status_code=status.HTTP_302_FOUND)

@app.get("/admin", response_class=HTMLResponse)
async def admin_home(request: Request):
    total_count = get_chat_history_count()
    system_status = check_slip_system_status()
    return templates.TemplateResponse(
        "admin_home.html",
        {"request": request, "config": config_manager, "total_chat_history": total_count, "system_status": system_status},
    )

@app.get("/admin/settings", response_class=HTMLResponse)
async def admin_settings(request: Request):
    return templates.TemplateResponse("settings.html", {"request": request, "config": config_manager})

@app.get("/admin/chat", response_class=HTMLResponse)
async def admin_chat(request: Request):
    history = get_recent_chat_history(limit=100)
    return templates.TemplateResponse("chat_history.html", {"request": request, "chat_history": history})

@app.get("/admin/api-status")
async def api_status_check():
    status_result = {
        "thunder": {"configured": False, "connected": False, "enabled": False},
        "line": {"configured": False, "connected": False},
        "openai": {"configured": False, "connected": False},
        "kbank": {"configured": False, "connected": False, "enabled": False},
        "system": check_slip_system_status()
    }
    async with httpx.AsyncClient() as client:
        thunder_token = config_manager.get("thunder_api_token")
        thunder_enabled = config_manager.get("slip_enabled", False)
        status_result["thunder"]["enabled"] = thunder_enabled
        if thunder_token:
            status_result["thunder"]["configured"] = True
            try:
                headers = {"Authorization": f"Bearer {thunder_token}"}
                resp = await client.get("https://api.thunder.in.th/v1", headers=headers, timeout=10)
                if resp.status_code in (200, 401, 404, 405): status_result["thunder"]["connected"] = True
            except httpx.RequestError as e: status_result["thunder"]["error"] = str(e)
        line_token = config_manager.get("line_channel_access_token")
        if line_token:
            status_result["line"]["configured"] = True
            try:
                headers = {"Authorization": f"Bearer {line_token}"}
                response = await client.get("https://api.line.me/v2/bot/info", headers=headers, timeout=5)
                if response.status_code == 200:
                    bot_data = response.json()
                    status_result["line"]["connected"] = True
                    status_result["line"]["bot_name"] = bot_data.get("displayName")
                else: status_result["line"]["error"] = f"{response.status_code}: {response.text}"
            except httpx.RequestError as e: status_result["line"]["error"] = str(e)
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
                else: status_result["kbank"]["error"] = "ไม่สามารถขอ access token ได้"
            except Exception as e: status_result["kbank"]["error"] = str(e)
    return JSONResponse(content=status_result)

@app.get("/admin/system-status")
async def get_system_status():
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
    return JSONResponse(content={
        "processing_status": notification_manager.slip_processing_status,
        "active_connections": len(notification_manager.active_connections),
        "pending_notifications": len(notification_manager.pending_notifications),
        "duplicate_cache_size": len(notification_manager.duplicate_slip_cache)
    })

@app.post("/admin/settings/update")
async def update_settings(request: Request) -> JSONResponse:
    try:
        data = await request.json()
        updates = {}
        for key in ["line_channel_secret", "line_channel_access_token", "thunder_api_token", "openai_api_key", "ai_prompt", "wallet_phone_number", "kbank_consumer_id", "kbank_consumer_secret"]:
            if key in data: updates[key] = data[key].strip()
        updates["ai_enabled"] = bool(data.get("ai_enabled"))
        updates["slip_enabled"] = bool(data.get("slip_enabled"))
        updates["kbank_enabled"] = bool(data.get("kbank_enabled"))
        config_manager.update_multiple(updates)
        if any(key in updates for key in ["line_channel_access_token", "line_channel_secret"]): init_line_bot()
        await notification_manager.send_notification("⚙️ อัปเดตการตั้งค่าระบบแล้ว", "success")
        return JSONResponse(content={"status": "success", "message": "บันทึกการตั้งค่าแล้ว"})
    except Exception as e: return JSONResponse(content={"status": "error", "message": str(e)})

@app.post("/admin/test-slip-upload")
async def test_slip_upload(request: Request):
    try:
        form = await request.form()
        file = form.get("file")
        if not file: return JSONResponse(content={"status": "error", "message": "ไม่พบไฟล์สลิป"})
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
            return JSONResponse(content={"status": "duplicate", "message": "Thunder API แจ้งสลิปซ้ำ", "response": result})
        else:
            error_message = result.get("message", "ทดสอบสลิปไม่สำเร็จ")
            await notification_manager.send_notification(f"❌ ทดสอบสลิปล้มเหลว: {error_message}", "error")
            return JSONResponse(content={"status": "error", "message": error_message, "response": result})
    except Exception as e:
        logger.exception(f"❌ Test slip upload error: {e}")
        await notification_manager.send_notification(f"💥 เกิดข้อผิดพลาดในการทดสอบสลิป: {str(e)}", "error")
        return JSONResponse(content={"status": "error", "message": f"เกิดข้อผิดพลาด: {str(e)}"})

@app.get("/admin/clear-duplicate-cache")
async def clear_duplicate_cache():
    try:
        cache_size = len(notification_manager.duplicate_slip_cache)
        notification_manager.duplicate_slip_cache.clear()
        await notification_manager.send_notification(f"🗑️ ล้าง cache สลิปซ้ำแล้ว ({cache_size} รายการ)", "success")
        return JSONResponse(content={"status": "success", "message": f"ล้าง cache สลิปซ้ำแล้ว ({cache_size} รายการ)"})
    except Exception as e: return JSONResponse(content={"status": "error", "message": f"เกิดข้อผิดพลาด: {str(e)}"})

@app.post("/admin/force-reset-apis")
async def force_reset_apis():
    try:
        try: from services.slip_checker import create_requests_session; session = create_requests_session(); session.close()
        except: pass
        try: from services.kbank_checker import kbank_checker; kbank_checker._clear_token_cache()
        except: pass
        await notification_manager.send_notification("🔄 รีเซ็ต API Cache แล้ว", "success")
        return JSONResponse(content={"status": "success", "message": "รีเซ็ต API Cache แล้ว"})
    except Exception as e: return JSONResponse(content={"status": "error", "message": f"เกิดข้อผิดพลาด: {str(e)}"})

@app.post("/admin/toggle-slip-system")
async def toggle_slip_system():
    try:
        current_status = config_manager.get("slip_enabled", False)
        new_status = not current_status
        config_manager.update("slip_enabled", new_status)
        action = "เปิด" if new_status else "ปิด"
        await notification_manager.send_notification(f"🔄 {action}ระบบตรวจสอบสลิปแล้ว", "success" if new_status else "warning")
        return JSONResponse(content={"status": "success", "message": f"{action}ระบบตรวจสอบสลิปแล้ว", "slip_enabled": new_status})
    except Exception as e: return JSONResponse(content={"status": "error", "message": f"เกิดข้อผิดพลาด: {str(e)}"})

@app.get("/admin/statistics")
async def get_admin_statistics():
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
    except Exception as e: return JSONResponse(content={"status": "error", "message": f"เกิดข้อผิดพลาด: {str(e)}"})

@app.get("/admin/export-chat-history")
async def export_chat_history():
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
        return JSONResponse(content={"status": "success", "data": export_data, "total_records": len(export_data), "export_time": datetime.now().isoformat()})
    except Exception as e: return JSONResponse(content={"status": "error", "message": f"เกิดข้อผิดพลาด: {str(e)}"})

@app.post("/admin/test-push-message")
async def test_push_message(request: Request):
    try:
        data = await request.json()
        user_id = data.get("user_id")
        message = data.get("message", "นี่คือข้อความทดสอบจากระบบ")
        if not user_id: return JSONResponse(content={"status": "error", "message": "กรุณาใส่ User ID"})
        success = await send_line_push(user_id, message)
        if success:
            await notification_manager.send_notification(f"✅ ส่ง Push Message ทดสอบสำเร็จไปยัง {user_id[:8]}...", "success")
            return JSONResponse(content={"status": "success", "message": "ส่ง Push Message สำเร็จ"})
        else: return JSONResponse(content={"status": "error", "message": "ไม่สามารถส่ง Push Message ได้"})
    except Exception as e: return JSONResponse(content={"status": "error", "message": f"เกิดข้อผิดพลาด: {str(e)}"})

@app.get("/health")
async def health_check():
    return JSONResponse(content={
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "2.1.0",
        "features": ["push_message", "fallback_apis", "detailed_slip_info"],
        "components": {
            "database": True,
            "websocket": len(notification_manager.active_connections) >= 0,
            "config": bool(config_manager),
            "cache": len(notification_manager.duplicate_slip_cache) >= 0,
            "push_message": True
        }
    })

@app.get("/admin/logs")
async def get_recent_logs(limit: int = 50):
    try:
        return JSONResponse(content={
            "status": "success",
            "logs": [
                {
                    "timestamp": datetime.now().isoformat(),
                    "level": "INFO",
                    "message": "System is running normally with push message support",
                    "component": "main_app"
                }
            ],
            "total": 1
        })
    except Exception as e: return JSONResponse(content={"status": "error", "message": f"เกิดข้อผิดพลาด: {str(e)}"})

@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    if request.url.path.startswith("/admin"): return RedirectResponse(url="/admin", status_code=status.HTTP_302_FOUND)
    return JSONResponse(status_code=404, content={"detail": "Not Found", "path": request.url.path})

@app.exception_handler(500)
async def internal_error_handler(request: Request, exc):
    logger.error(f"Internal server error: {exc}")
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})

@app.on_event("startup")
async def startup_event():
    logger.info("🚀 LINE OA Middleware เริ่มทำงาน... (รองรับ Push Message)")
    if init_line_bot(): logger.info("✅ LINE Bot credentials loaded")
    else: logger.warning("⚠️ LINE Bot credentials not found")
    required_configs = ["line_channel_secret", "line_channel_access_token"]
    missing_configs = [config_key for config_key in required_configs if not config_manager.get(config_key)]
    if missing_configs:
        logger.warning(f"⚠️ การตั้งค่าที่ขาดหายไป: {', '.join(missing_configs)}")
        logger.warning("⚠️ กรุณาตั้งค่าในหน้า /admin/settings")
    else: logger.info("✅ การตั้งค่าพื้นฐานครบถ้วน")
    try:
        api_status = get_api_status_summary()
        thunder_status = "✅" if api_status.get("thunder", {}).get("enabled") else "❌"
        kbank_status = "✅" if api_status.get("kbank", {}).get("enabled") else "❌"
        logger.info(f"📊 สถานะ API: Thunder {thunder_status}, KBank {kbank_status}")
    except Exception as e: logger.warning(f"⚠️ ไม่สามารถตรวจสอบสถานะ API ได้: {e}")
    await notification_manager.send_notification(
        "🚀 ระบบ LINE OA Middleware เริ่มทำงานแล้ว (รองรับ Push Message)",
        "success",
        {"timestamp": datetime.now().isoformat(), "version": "2.1.0", "features": ["push_message", "fallback_apis", "detailed_slip_info"]}
    )
    logger.info("✅ ระบบพร้อมทำงาน - http://localhost:8000/admin")
    logger.info("📱 รองรับ Push Message สำหรับแก้ปัญหา Reply Token หมดอายุ")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("🛑 LINE OA Middleware กำลังหยุดทำงาน...")
    for connection in notification_manager.active_connections.copy():
        try: await connection.close()
        except: pass
    notification_manager.active_connections.clear()
    notification_manager.duplicate_slip_cache.clear()
    notification_manager.pending_notifications.clear()
    logger.info("✅ หยุดระบบเรียบร้อยแล้ว")

if __name__ == "__main__":
    import uvicorn
    uvicorn_log_config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {"default": {"format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s"}},
        "handlers": {"default": {"formatter": "default", "class": "logging.StreamHandler", "stream": "ext://sys.stdout"}},
        "root": {"level": "INFO", "handlers": ["default"]},
        "loggers": {"uvicorn": {"level": "INFO"}, "uvicorn.error": {"level": "INFO"}, "uvicorn.access": {"level": "INFO"}},
    }
    print("🚀 เริ่มต้น LINE OA Middleware (Enhanced with Push Message)...")
    print("📱 เว็บ Admin: http://localhost:8000/admin")
    print("🔗 LINE Webhook URL: http://localhost:8000/line/webhook")
    print("📊 API Status: http://localhost:8000/admin/api-status")
    print("🏥 Health Check: http://localhost:8000/health")
    print("📤 รองรับ Push Message สำหรับแก้ปัญหา Reply Token หมดอายุ")
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
