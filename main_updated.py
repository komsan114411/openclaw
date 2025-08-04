import json
import hmac
import hashlib
import base64
import threading
import logging
import os
import sys
import asyncio
from datetime import datetime
from typing import Dict, Any, Optional, List
from collections import defaultdict

import requests
from fastapi import FastAPI, Request, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles

# เพิ่ม path ปัจจุบันใน sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

# ตั้งค่า logger
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("main_app")

# สร้าง FastAPI instance
app = FastAPI(title="LINE OA Middleware (Enhanced)")
templates = Jinja2Templates(directory="templates")

# WebSocket Manager สำหรับการแจ้งเตือนแบบ Real-time
class NotificationManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.pending_notifications: List[Dict] = []
        self.slip_processing_status = {}

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
            # เก็บการแจ้งเตือนไว้สำหรับการเชื่อมต่อครั้งต่อไป
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

        # ส่งให้ทุก connection ที่เชื่อมต่ออยู่
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(notification))
            except Exception as e:
                logger.error(f"Error sending notification: {e}")
                disconnected.append(connection)

        # ลบ connection ที่ disconnected
        for conn in disconnected:
            self.disconnect(conn)

    def set_slip_status(self, user_id: str, status: str, details: Dict = None):
        self.slip_processing_status[user_id] = {
            "status": status,
            "timestamp": datetime.now().isoformat(),
            "details": details or {}
        }

notification_manager = NotificationManager()

# การจัดการการเริ่มต้นฐานข้อมูลอย่างปลอดภัย
try:
    from utils.config_manager import config_manager
    logger.info("✅ Config manager imported successfully")
except ImportError as e:
    logger.error(f"❌ Failed to import config_manager: {e}")
    raise SystemExit("Cannot import config_manager")

try:
    from models.database import (
        init_database,
        save_chat_history,
        get_chat_history_count,
        get_recent_chat_history,
    )
    logger.info("✅ Database models imported successfully")
except ImportError as e:
    logger.error(f"❌ Failed to import database models: {e}")
    def init_database():
        pass
    def save_chat_history(user_id, direction, message, sender):
        pass
    def get_chat_history_count():
        return 0
    def get_recent_chat_history(limit=50):
        return []

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
    from services.enhanced_slip_checker import verify_slip_multiple_providers, extract_slip_info_from_text, get_api_status_summary
    logger.info("✅ Enhanced slip checker imported successfully")
except ImportError as e:
    logger.warning(f"⚠️ Enhanced slip checker not available: {e}")
    def verify_slip_multiple_providers(message_id=None, test_image_data=None, bank_code=None, trans_ref=None):
        logger.info(f"🔄 Fallback slip verification")
        if message_id or test_image_data:
            return verify_slip_with_thunder(message_id, test_image_data)
        return {"status": "error", "message": "ไม่สามารถตรวจสอบสลิปได้"}
    
    def extract_slip_info_from_text(text):
        return {"bank_code": None, "trans_ref": None}
    
    def get_api_status_summary():
        return {"thunder": {"enabled": False}, "kbank": {"enabled": False}}

# เริ่มต้นฐานข้อมูล
try:
    logger.info("Initializing database...")
    init_database()
    logger.info("✅ Database initialized successfully")
except Exception as e:
    logger.error(f"❌ Database initialization error: {e}")

# ====================== Utility Functions ======================

def verify_line_signature(body: bytes, signature: str, channel_secret: str) -> bool:
    """ตรวจสอบลายเซ็นของ webhook จาก LINE"""
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

def build_slip_flex_contents(slip: Dict[str, Any]) -> Dict[str, Any]:
    """สร้าง payload ของ Flex Message สำหรับผลตรวจสอบสลิป"""
    verified_by = slip.get("verified_by", "Thunder API")
    slip_type = slip.get("type", "thunder")
    
    if slip_type == "kbank":
        title_text = "✅ สลิปถูกต้อง (KBank API)"
        amount = slip.get("amount", "0")
        date_time = f"{slip.get('trans_date', '')} {slip.get('trans_time', '')}"
        sender_info = slip.get("sender_account", "")
        receiver_info = slip.get("receiver_account", "")
        reference_info = slip.get("reference", "")
    else:
        title_text = "✅ สลิปถูกต้อง (Thunder API)"
        amount = slip.get("amount", "0")
        date_time = slip.get("date", "")
        sender_info = slip.get("sender", slip.get("sender_bank", ""))
        receiver_info = slip.get("receiver_name", slip.get("receiver_bank", ""))
        reference_info = ""
        
        if slip.get("receiver_phone"):
            receiver_info = f"{receiver_info} ({slip.get('receiver_phone', '')})"
    
    contents = [
        {"type": "text", "text": title_text, "weight": "bold", "size": "lg", "color": "#00B900"},
        {"type": "text", "text": f"฿{amount}", "weight": "bold", "size": "xxl", "margin": "md"},
    ]
    
    if date_time.strip():
        contents.append({"type": "text", "text": date_time, "size": "sm", "color": "#999999", "margin": "sm"})
    
    contents.append({"type": "separator", "margin": "md"})
    
    detail_contents = []
    if sender_info:
        detail_contents.append({"type": "text", "text": f"ผู้โอน: {sender_info}", "size": "sm"})
    if receiver_info:
        detail_contents.append({"type": "text", "text": f"ผู้รับ: {receiver_info}", "size": "sm"})
    if reference_info:
        detail_contents.append({"type": "text", "text": f"อ้างอิง: {reference_info}", "size": "sm", "color": "#666666"})
    
    if detail_contents:
        contents.append({"type": "box", "layout": "vertical", "margin": "md", "contents": detail_contents})
    
    return {
        "type": "bubble",
        "size": "mega",
        "body": {
            "type": "box",
            "layout": "vertical",
            "spacing": "md",
            "contents": contents,
        },
        "footer": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {"type": "text", "text": f"ตรวจสอบโดย {verified_by}", "size": "xs", "color": "#AAAAAA", "align": "center"}
            ],
        },
    }

def send_line_reply(reply_token: str, text: str) -> bool:
    """ส่งข้อความธรรมดากลับไปยังผู้ใช้ใน LINE"""
    access_token = config_manager.get("line_channel_access_token")
    if not access_token:
        logger.error("❌ LINE_CHANNEL_ACCESS_TOKEN is missing")
        return False
    
    url = "https://api.line.me/v2/bot/message/reply"
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    payload = {"replyToken": reply_token, "messages": [{"type": "text", "text": text}]}
    
    try:
        response = requests.post(url, headers=headers, data=json.dumps(payload), timeout=15)
        response.raise_for_status()
        logger.info(f"✅ LINE reply sent successfully")
        return True
    except requests.exceptions.RequestException as e:
        logger.error(f"❌ Failed to send LINE reply: {e}")
        return False

def send_line_flex_reply(reply_token: str, slip_data: Dict[str, Any]) -> bool:
    """ส่ง Flex Message สำหรับผลตรวจสอบสลิป"""
    access_token = config_manager.get("line_channel_access_token")
    if not access_token:
        logger.error("❌ LINE_CHANNEL_ACCESS_TOKEN is missing")
        return False
    
    url = "https://api.line.me/v2/bot/message/reply"
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    contents = build_slip_flex_contents(slip_data)
    payload = {"replyToken": reply_token, "messages": [{"type": "flex", "altText": "ผลการตรวจสอบสลิป", "contents": contents}]}
    
    try:
        response = requests.post(url, headers=headers, data=json.dumps(payload), timeout=15)
        response.raise_for_status()
        logger.info(f"✅ LINE Flex reply sent successfully")
        return True
    except requests.exceptions.RequestException as e:
        logger.error(f"❌ Failed to send LINE Flex reply: {e}")
        return False

# ====================== Enhanced Event Dispatcher ======================

async def dispatch_event_async(event: Dict[str, Any]) -> None:
    """ประมวลผล event แบบ async พร้อมการแจ้งเตือนในเว็บ"""
    try:
        if event.get("type") != "message":
            return
            
        message = event.get("message", {})
        user_id = event.get("source", {}).get("userId", "unknown_user")
        reply_token = event.get("replyToken")
        message_type = message.get("type")
        
        logger.info(f"🔄 Processing {message_type} from user {user_id}")
        
        if not reply_token:
            logger.error("❌ No reply token - cannot respond")
            return
        
        # บันทึกข้อความขาเข้า
        try:
            save_chat_history(user_id, "in", message, sender="user")
        except Exception as e:
            logger.warning(f"⚠️ Failed to save chat history: {e}")

        if message_type == "image":
            await handle_image_message(user_id, message, reply_token)
        elif message_type == "text":
            await handle_text_message(user_id, message, reply_token)
        else:
            await notification_manager.send_notification(
                f"ได้รับข้อความประเภท {message_type} จากผู้ใช้ {user_id}",
                "info"
            )
            send_line_reply(reply_token, "ขออภัย ระบบรองรับเฉพาะข้อความและรูปภาพเท่านั้น")
                
    except Exception as e:
        logger.exception(f"❌ Critical error in dispatch_event: {e}")
        await notification_manager.send_notification(
            f"เกิดข้อผิดพลาดในการประมวลผล: {str(e)}",
            "error"
        )

async def handle_image_message(user_id: str, message: Dict, reply_token: str):
    """จัดการข้อความรูปภาพ"""
    message_id = message.get("id")
    
    # แจ้งเตือนว่าได้รับสลิป
    await notification_manager.send_notification(
        f"🖼️ ได้รับรูปสลิปจากผู้ใช้ {user_id}",
        "info",
        {"user_id": user_id, "message_id": message_id}
    )
    
    # ตั้งสถานะเป็นกำลังประมวลผล
    notification_manager.set_slip_status(user_id, "processing", {"message_id": message_id})
    
    # แจ้งผู้ใช้ว่ากำลังประมวลผล
    await notification_manager.send_notification(
        f"⏳ กำลังตรวจสอบสลิปของผู้ใช้ {user_id}...",
        "processing"
    )
    
    # ตรวจสอบว่ามี API ที่พร้อมใช้งานหรือไม่
    thunder_enabled = config_manager.get("slip_enabled", False)
    thunder_token = config_manager.get("thunder_api_token")
    kbank_enabled = config_manager.get("kbank_enabled", False)
    kbank_credentials = config_manager.get("kbank_consumer_id") and config_manager.get("kbank_consumer_secret")
    
    if not thunder_enabled and not (kbank_enabled and kbank_credentials):
        error_msg = "❌ ระบบตรวจสอบสลิปทั้งหมดถูกปิดใช้งาน"
        await notification_manager.send_notification(error_msg, "error")
        send_line_reply(reply_token, "ขออภัย ระบบตรวจสอบสลิปไม่พร้อมใช้งานในขณะนี้ กรุณาติดต่อเจ้าหน้าที่")
        notification_manager.set_slip_status(user_id, "failed", {"reason": "All APIs disabled"})
        return
    
    if not thunder_token and not kbank_credentials:
        error_msg = "❌ ไม่พบ API Token สำหรับการตรวจสอบสลิป"
        await notification_manager.send_notification(error_msg, "error")
        send_line_reply(reply_token, "ขออภัย ระบบตรวจสอบสลิปไม่พร้อมใช้งานในขณะนี้ กรุณาติดต่อเจ้าหน้าที่")
        notification_manager.set_slip_status(user_id, "failed", {"reason": "No API credentials"})
        return
    
    try:
        # ส่งข้อความแจ้งผู้ใช้ก่อน
        send_line_reply(reply_token, "⏳ รอสักครู่ แอดมินกำลังตรวจสอบสลิปของคุณ...")
        
        # ประมวลผลสลิป
        result = verify_slip_multiple_providers(message_id)
        
        if result["status"] == "success":
            await notification_manager.send_notification(
                f"✅ ตรวจสอบสลิปสำเร็จ! จำนวน ฿{result['data'].get('amount', '0')} ด้วย {result.get('type', 'unknown')} API",
                "success",
                {"user_id": user_id, "slip_data": result["data"]}
            )
            
            # ส่ง Flex Message
            success = send_line_flex_reply(reply_token, result["data"])
            if not success:
                # Fallback เป็น text
                fallback_msg = f"✅ สลิปถูกต้อง\n💰 จำนวน: ฿{result['data'].get('amount', '0')}\n📅 วันที่: {result['data'].get('date', 'N/A')}"
                send_line_reply(reply_token, fallback_msg)
            
            notification_manager.set_slip_status(user_id, "success", result["data"])
            
            try:
                save_chat_history(user_id, "out", {"type": "flex", "content": result["data"]}, sender="slip_bot")
            except Exception as e:
                logger.warning(f"⚠️ Failed to save chat history: {e}")
        else:
            error_message = result.get("message", "ตรวจสอบสลิปไม่สำเร็จ")
            
            await notification_manager.send_notification(
                f"❌ ตรวจสอบสลิปล้มเหลว: {error_message}",
                "error",
                {"user_id": user_id, "error": error_message, "attempted_apis": result.get("attempted_apis", [])}
            )
            
            # ส่งข้อความแจ้งผู้ใช้
            if result.get("suggestions"):
                error_message += "\n\n💡 คำแนะนำ:\n• " + "\n• ".join(result["suggestions"][:3])
            
            send_line_reply(reply_token, error_message)
            notification_manager.set_slip_status(user_id, "failed", {"error": error_message})
            
            try:
                save_chat_history(user_id, "out", {"type": "text", "text": error_message}, sender="slip_bot")
            except Exception as e:
                logger.warning(f"⚠️ Failed to save chat history: {e}")
                
    except Exception as e:
        error_msg = f"เกิดข้อผิดพลาดในการตรวจสอบสลิป: {str(e)}"
        logger.error(f"❌ Slip verification exception: {e}", exc_info=True)
        
        await notification_manager.send_notification(
            f"💥 เกิดข้อผิดพลาดร้ายแรง: {str(e)}",
            "error",
            {"user_id": user_id, "exception": str(e)}
        )
        
        send_line_reply(reply_token, error_msg)
        notification_manager.set_slip_status(user_id, "error", {"exception": str(e)})

async def handle_text_message(user_id: str, message: Dict, reply_token: str):
    """จัดการข้อความตัวอักษร"""
    user_text = message.get("text", "")
    
    # ตรวจสอบว่าเป็นข้อมูลสลิปหรือไม่
    slip_info = extract_slip_info_from_text(user_text)
    
    if slip_info["bank_code"] and slip_info["trans_ref"]:
        await notification_manager.send_notification(
            f"📝 ได้รับข้อมูลสลิปจากข้อความ: ธนาคาร {slip_info['bank_code']}, อ้างอิง {slip_info['trans_ref']}",
            "info",
            {"user_id": user_id, "slip_info": slip_info}
        )
        
        # ประมวลผลเหมือนรูปสลิป
        await handle_slip_from_text(user_id, slip_info, reply_token)
    else:
        # การสนทนาธรรมดา
        await notification_manager.send_notification(
            f"💬 ได้รับข้อความจากผู้ใช้ {user_id}: {user_text[:50]}...",
            "info"
        )
        
        try:
            response = get_chat_response(user_text, user_id)
            send_line_reply(reply_token, response)
            
            try:
                save_chat_history(user_id, "out", {"type": "text", "text": response}, sender="bot")
            except Exception as e:
                logger.warning(f"⚠️ Failed to save chat history: {e}")
        except Exception as e:
            error_msg = "ขออภัย เกิดข้อผิดพลาดในการประมวลผล AI"
            logger.error(f"❌ AI processing error: {e}")
            send_line_reply(reply_token, error_msg)

async def handle_slip_from_text(user_id: str, slip_info: Dict, reply_token: str):
    """จัดการสลิปจากข้อความ"""
    notification_manager.set_slip_status(user_id, "processing", slip_info)
    
    try:
        result = verify_slip_multiple_providers(
            None, None, 
            slip_info["bank_code"], 
            slip_info["trans_ref"]
        )
        
        if result["status"] == "success":
            await notification_manager.send_notification(
                f"✅ ตรวจสอบสลิปจากข้อความสำเร็จ! จำนวน ฿{result['data'].get('amount', '0')}",
                "success",
                {"user_id": user_id, "slip_data": result["data"]}
            )
            
            success = send_line_flex_reply(reply_token, result["data"])
            if not success:
                fallback_msg = f"✅ สลิปถูกต้อง\n💰 จำนวน: ฿{result['data'].get('amount', '0')}"
                send_line_reply(reply_token, fallback_msg)
            
            notification_manager.set_slip_status(user_id, "success", result["data"])
        else:
            error_message = result.get("message", "ตรวจสอบสลิปไม่สำเร็จ")
            
            await notification_manager.send_notification(
                f"❌ ตรวจสอบสลิปจากข้อความล้มเหลว: {error_message}",
                "error"
            )
            
            if result.get("suggestions"):
                error_message += "\n\n💡 ลองทำตามนี้:\n• " + "\n• ".join(result["suggestions"][:2])
            
            send_line_reply(reply_token, error_message)
            notification_manager.set_slip_status(user_id, "failed", {"error": error_message})
            
    except Exception as e:
        error_msg = f"เกิดข้อผิดพลาดในการตรวจสอบสลิปจากข้อความ"
        logger.error(f"❌ Text slip verification error: {e}")
        
        await notification_manager.send_notification(
            f"💥 เกิดข้อผิดพลาดในการตรวจสอบสลิปจากข้อความ: {str(e)}",
            "error"
        )
        
        send_line_reply(reply_token, error_msg)
        notification_manager.set_slip_status(user_id, "error", {"exception": str(e)})

def dispatch_event(event: Dict[str, Any]) -> None:
    """Wrapper สำหรับเรียก async function"""
    try:
        # สร้าง event loop ใหม่สำหรับ thread นี้
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(dispatch_event_async(event))
        loop.close()
    except Exception as e:
        logger.exception(f"❌ Error in dispatch_event wrapper: {e}")

# ====================== WebSocket Endpoint ======================

@app.websocket("/ws/notifications")
async def websocket_endpoint(websocket: WebSocket):
    await notification_manager.connect(websocket)
    
    # ส่งการแจ้งเตือนที่ค้างอยู่
    for notification in notification_manager.pending_notifications:
        try:
            await websocket.send_text(json.dumps(notification))
        except Exception as e:
            logger.error(f"Error sending pending notification: {e}")
    
    # ล้างการแจ้งเตือนที่ส่งแล้ว
    notification_manager.pending_notifications.clear()
    
    try:
        while True:
            # รอรับข้อความจาก client (ถ้ามี)
            data = await websocket.receive_text()
            # ไม่ต้องทำอะไรกับข้อความที่รับมา
    except WebSocketDisconnect:
        notification_manager.disconnect(websocket)

# ====================== LINE Webhook Route ======================

@app.post("/line/webhook")
async def line_webhook(request: Request) -> JSONResponse:
    """รับ Webhook จาก LINE"""
    logger.info("📨 Received LINE webhook request")
    
    try:
        body = await request.body()
        signature = request.headers.get("x-line-signature", "")
        channel_secret = config_manager.get("line_channel_secret", "")
        
        if not verify_line_signature(body, signature, channel_secret):
            logger.error("❌ Invalid LINE signature")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid signature")
        
        try:
            payload = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError as e:
            logger.error(f"❌ Invalid JSON payload: {e}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")
        
        # ประมวลผล events
        events = payload.get("events", [])
        logger.info(f"🎭 Processing {len(events)} events")
        
        if not events:
            return JSONResponse(content={"status": "ok", "message": "No events to process"})
        
        for i, ev in enumerate(events):
            logger.info(f"🎯 Dispatching event {i+1}/{len(events)}: {ev.get('type')}")
            thread = threading.Thread(
                target=dispatch_event, 
                args=(ev,), 
                daemon=True,
                name=f"event-processor-{i+1}"
            )
            thread.start()
            
        return JSONResponse(content={"status": "ok", "events_processed": len(events)})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"❌ Webhook processing error: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error")

# ====================== Admin Pages ======================

@app.get("/", response_class=HTMLResponse)
async def root():
    return RedirectResponse(url="/admin", status_code=status.HTTP_302_FOUND)

@app.get("/admin", response_class=HTMLResponse)  
async def admin_home(request: Request):
    total_count = get_chat_history_count()
    return templates.TemplateResponse(
        "admin_home.html",  # ใช้ template เดิม
        {
            "request": request,
            "config": config_manager.config,
            "total_chat_history": total_count,
        },
    )

@app.get("/admin/settings", response_class=HTMLResponse)
async def admin_settings(request: Request):
    return templates.TemplateResponse(
        "settings.html",  # ใช้ template เดิม
        {
            "request": request,
            "config": config_manager.config,
        },
    )

# ====================== API Endpoints ======================

@app.get("/admin/api-status")
async def api_status_check():
    """ตรวจสอบสถานะการเชื่อมต่อ API ต่างๆ"""
    status_result = {
        "thunder": {"configured": False, "connected": False},
        "line": {"configured": False, "connected": False},
        "openai": {"configured": False, "connected": False},
        "kbank": {"configured": False, "connected": False},
    }

    # ตรวจสอบ Thunder API
    thunder_token = config_manager.get("thunder_api_token")
    if thunder_token:
        status_result["thunder"]["configured"] = True
        try:
            headers = {"Authorization": f"Bearer {thunder_token}"}
            resp = requests.get("https://api.thunder.in.th/v1", headers=headers, timeout=10)
            
            if resp.status_code in (200, 401, 404, 405):
                status_result["thunder"]["connected"] = True
                
            try:
                data = resp.json()
                if isinstance(data, dict):
                    if "balance" in data:
                        status_result["thunder"]["balance"] = data.get("balance", 0)
                    if data.get("message"):
                        status_result["thunder"]["message"] = data.get("message")
            except Exception:
                status_result["thunder"]["raw_response"] = resp.text[:100]
                
        except requests.exceptions.RequestException as e:
            status_result["thunder"]["error"] = str(e)

    # ตรวจสอบ LINE API
    line_token = config_manager.get("line_channel_access_token")
    if line_token:
        status_result["line"]["configured"] = True
        try:
            headers = {"Authorization": f"Bearer {line_token}"}
            response = requests.get("https://api.line.me/v2/bot/info", headers=headers, timeout=5)
            if response.status_code == 200:
                bot_data = response.json()
                status_result["line"]["connected"] = True
                status_result["line"]["bot_name"] = bot_data.get("displayName")
            else:
                status_result["line"]["error"] = f"{response.status_code}: {response.text}"
        except requests.exceptions.RequestException as e:
            status_result["line"]["error"] = str(e)

    # ตรวจสอบ KBank API
    kbank_consumer_id = config_manager.get("kbank_consumer_id")
    kbank_consumer_secret = config_manager.get("kbank_consumer_secret")
    if kbank_consumer_id and kbank_consumer_secret:
        status_result["kbank"]["configured"] = True
        try:
            from services.kbank_checker import kbank_checker
            token = kbank_checker._get_access_token()
            if token:
                status_result["kbank"]["connected"] = True
                status_result["kbank"]["token_length"] = len(token)
            else:
                status_result["kbank"]["error"] = "ไม่สามารถขอ access token ได้"
        except Exception as e:
            status_result["kbank"]["error"] = str(e)

    return JSONResponse(content=status_result)

@app.get("/admin/slip-status")
async def get_slip_processing_status():
    """ดึงสถานะการประมวลผลสลิป"""
    return JSONResponse(content={
        "processing_status": notification_manager.slip_processing_status,
        "active_connections": len(notification_manager.active_connections),
        "pending_notifications": len(notification_manager.pending_notifications)
    })

@app.post("/admin/settings/update")
async def update_settings(request: Request) -> JSONResponse:
    """บันทึกการตั้งค่าจากหน้า Admin"""
    try:
        data = await request.json()
        updates = {}
        
        for key in [
            "line_channel_secret",
            "line_channel_access_token", 
            "thunder_api_token",
            "openai_api_key",
            "ai_prompt",
            "wallet_phone_number",
            "kbank_consumer_id",
            "kbank_consumer_secret",
        ]:
            if key in data:
                updates[key] = data[key].strip()
        
        updates["ai_enabled"] = bool(data.get("ai_enabled"))
        updates["slip_enabled"] = bool(data.get("slip_enabled"))
        updates["kbank_enabled"] = bool(data.get("kbank_enabled"))

        config_manager.update_multiple(updates)
        
        # แจ้งเตือนการอัปเดตการตั้งค่า
        await notification_manager.send_notification(
            "⚙️ อัปเดตการตั้งค่าระบบแล้ว",
            "success",
            {"updated_keys": list(updates.keys())}
        )
        
        return JSONResponse(content={"status": "success", "message": "บันทึกการตั้งค่าแล้ว"})
    except Exception as e:
        return JSONResponse(content={"status": "error", "message": str(e)})

@app.post("/admin/test-slip-upload")
async def test_slip_upload(request: Request):
    """ทดสอบอัปโหลดสลิปจากหน้า Admin"""
    try:
        form = await request.form()
        file = form.get("file")
        if not file:
            return JSONResponse(content={"status": "error", "message": "ไม่พบไฟล์สลิป"})

        image_data = await file.read()
        message_id = "admin_test_" + datetime.now().strftime("%Y%m%d%H%M%S")

        await notification_manager.send_notification(
            "🧪 Admin กำลังทดสอบการอัปโหลดสลิป",
            "info"
        )

        result = verify_slip_multiple_providers(message_id, test_image_data=image_data)
        
        if result["status"] == "success":
            await notification_manager.send_notification(
                f"✅ ทดสอบสลิปสำเร็จ! จำนวน ฿{result['data'].get('amount', '0')}",
                "success"
            )
        else:
            await notification_manager.send_notification(
                f"❌ ทดสอบสลิปล้มเหลว: {result.get('message', 'Unknown error')}",
                "error"
            )
        
        return JSONResponse(content={
            "status": "success" if result["status"] == "success" else "error",
            "message": result["message"] if result["status"] == "error" else f"ตรวจสอบสำเร็จด้วย {result.get('type', 'unknown')} API",
            "response": result
        })

    except Exception as e:
        await notification_manager.send_notification(
            f"💥 เกิดข้อผิดพลาดในการทดสอบสลิป: {str(e)}",
            "error"
        )
        return JSONResponse(content={"status": "error", "message": str(e)})

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return JSONResponse(content={
        "status": "ok", 
        "timestamp": datetime.utcnow().isoformat(),
        "config_loaded": bool(config_manager.config),
        "line_configured": bool(config_manager.get("line_channel_access_token")),
        "thunder_configured": bool(config_manager.get("thunder_api_token")),
        "thunder_enabled": config_manager.get("slip_enabled", False),
        "kbank_enabled": config_manager.get("kbank_enabled", False),
        "websocket_connections": len(notification_manager.active_connections)
    })

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
