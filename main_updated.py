import json
import hmac
import hashlib
import base64
import threading
import logging
import os
import sys
from datetime import datetime
from typing import Dict, Any, Optional

import requests
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates

# เพิ่ม path ปัจจุบันใน sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

# ตั้งค่า logger ให้แสดงผลมากขึ้น
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("main_app")

# สร้าง FastAPI instance และกำหนดตำแหน่งเทมเพลต
app = FastAPI(title="LINE OA Middleware (Improved)")
templates = Jinja2Templates(directory="templates")

# เพิ่มการ import OpenAI เพื่อให้สามารถตรวจสอบสถานะได้
try:
    from openai import OpenAI
except ImportError:
    OpenAI = None
    logger.warning("OpenAI library not available")

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
    # สร้าง fallback functions
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
    # สร้าง fallback function
    def get_chat_response(text, user_id):
        return "ขออภัย ระบบ AI ไม่พร้อมใช้งานในขณะนี้"

try:
    from services.slip_checker import verify_slip_with_thunder
    logger.info("✅ Thunder slip checker imported successfully")
except ImportError as e:
    logger.error(f"❌ Failed to import slip_checker: {e}")
    # สร้าง fallback function
    def verify_slip_with_thunder(message_id, test_image_data=None):
        return {"status": "error", "message": "ระบบตรวจสอบสลิป Thunder ไม่พร้อมใช้งาน"}

# Import enhanced slip checker (อาจจะไม่มี)
try:
    from services.enhanced_slip_checker import verify_slip_multiple_providers, extract_slip_info_from_text, get_api_status_summary
    logger.info("✅ Enhanced slip checker imported successfully")
except ImportError as e:
    logger.warning(f"⚠️ Enhanced slip checker not available: {e}")
    # สร้าง fallback functions
    def verify_slip_multiple_providers(message_id=None, test_image_data=None, bank_code=None, trans_ref=None):
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
    logger.info("Database initialized successfully.")
except Exception as e:
    logger.error(f"An error occurred during database initialization: {e}")
    # ไม่ยกเลิกการทำงาน แค่แสดง warning
    logger.warning("Database initialization failed, continuing without database...")

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
        logger.info(f"🔐 Signature verification: {'✅ Valid' if is_valid else '❌ Invalid'}")
        return is_valid
    except Exception as e:
        logger.error(f"❌ Signature verification error: {e}")
        return False

def build_slip_flex_contents(slip: Dict[str, Any]) -> Dict[str, Any]:
    """สร้าง payload ของ Flex Message สำหรับผลตรวจสอบสลิป"""
    # ตรวจสอบประเภทของข้อมูลสลิป
    verified_by = slip.get("verified_by", "Thunder API")
    slip_type = slip.get("type", "thunder")
    
    # ปรับแต่งข้อความตามประเภท
    if slip_type == "kbank":
        title_text = "สลิปถูกต้อง ✅ (KBank API)"
        amount = slip.get("amount", "0")
        date_time = f"{slip.get('trans_date', '')} {slip.get('trans_time', '')}"
        sender_info = slip.get("sender_account", "")
        receiver_info = slip.get("receiver_account", "")
        reference_info = slip.get("reference", "")
    else:
        # Thunder API format (รวมทั้ง wallet และ bank)
        title_text = "สลิปถูกต้อง ✅ (Thunder API)"
        amount = slip.get("amount", "0")
        date_time = slip.get("date", "")
        
        # จัดการข้อมูลผู้ส่งและผู้รับ
        sender_info = slip.get("sender", slip.get("sender_bank", ""))
        receiver_info = slip.get("receiver_name", slip.get("receiver_bank", ""))
        reference_info = ""
        
        # สำหรับ TrueWallet
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

def send_line_reply(reply_token: str, text: str) -> None:
    """ส่งข้อความธรรมดากลับไปยังผู้ใช้ใน LINE"""
    access_token = config_manager.get("line_channel_access_token")
    if not access_token:
        logger.error("❌ LINE_CHANNEL_ACCESS_TOKEN is missing.")
        return
    
    url = "https://api.line.me/v2/bot/message/reply"
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    payload = {"replyToken": reply_token, "messages": [{"type": "text", "text": text}]}
    
    logger.info(f"📤 Sending LINE reply: {text[:50]}...")
    
    try:
        response = requests.post(url, headers=headers, data=json.dumps(payload), timeout=10)
        response.raise_for_status()
        logger.info(f"✅ LINE reply sent successfully - Status: {response.status_code}")
    except requests.exceptions.RequestException as e:
        logger.error(f"❌ Failed to send text reply: {e}")
        if hasattr(e, 'response') and e.response is not None:
            logger.error(f"❌ Response: {e.response.text}")

def send_line_flex_reply(reply_token: str, slip_data: Dict[str, Any]) -> None:
    """ส่ง Flex Message สำหรับผลตรวจสอบสลิป"""
    access_token = config_manager.get("line_channel_access_token")
    if not access_token:
        logger.error("❌ LINE_CHANNEL_ACCESS_TOKEN is missing.")
        return
    
    url = "https://api.line.me/v2/bot/message/reply"
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    contents = build_slip_flex_contents(slip_data)
    payload = {"replyToken": reply_token, "messages": [{"type": "flex", "altText": "ผลการตรวจสอบสลิป", "contents": contents}]}
    
    logger.info(f"📤 Sending LINE Flex reply for slip: ฿{slip_data.get('amount', '0')}")
    
    try:
        response = requests.post(url, headers=headers, data=json.dumps(payload), timeout=10)
        response.raise_for_status()
        logger.info(f"✅ LINE Flex reply sent successfully - Status: {response.status_code}")
    except requests.exceptions.RequestException as e:
        logger.error(f"❌ Failed to send flex reply: {e}")
        if hasattr(e, 'response') and e.response is not None:
            logger.error(f"❌ Response: {e.response.text}")

# ====================== Event Dispatcher ======================

def dispatch_event(event: Dict[str, Any]) -> None:
    """ประมวลผล event ที่รับมาจาก LINE แล้วดำเนินการตามประเภทข้อความ"""
    try:
        logger.info(f"🔄 Processing event: {event.get('type')}")
        
        if event.get("type") != "message":
            logger.info(f"⏭️ Skipping non-message event: {event.get('type')}")
            return
            
        message = event.get("message", {})
        user_id = event.get("source", {}).get("userId")
        reply_token = event.get("replyToken")
        
        logger.info(f"👤 User ID: {user_id}")
        logger.info(f"🎫 Reply Token: {reply_token}")
        logger.info(f"💬 Message Type: {message.get('type')}")
        
        if not reply_token:
            logger.error("❌ No reply token - cannot respond")
            return
        
        # บันทึกข้อความขาเข้า
        try:
            save_chat_history(user_id, "in", message, sender="user")
        except Exception as e:
            logger.warning(f"⚠️ Failed to save chat history: {e}")

        if message.get("type") == "image":
            # ตรวจสอบสลิป
            logger.info(f"📷 Received image from user {user_id}")
            
            try:
                result = verify_slip_multiple_providers(message.get("id"))
                
                if result["status"] == "success":
                    # ส่ง Flex message และบันทึกประวัติขาออก
                    logger.info(f"✅ Slip verification successful with {result.get('type', 'unknown')} API")
                    try:
                        save_chat_history(user_id, "out", {"type": "flex", "content": result["data"]}, sender="slip_bot")
                    except Exception as e:
                        logger.warning(f"⚠️ Failed to save chat history: {e}")
                    send_line_flex_reply(reply_token, result["data"])
                else:
                    # ส่งข้อความ error พร้อมคำแนะนำ
                    error_message = result["message"]
                    if result.get("suggestions"):
                        error_message += "\n\n💡 คำแนะนำ:\n• " + "\n• ".join(result["suggestions"][:3])
                    
                    logger.warning(f"❌ Slip verification failed: {result['message']}")
                    try:
                        save_chat_history(user_id, "out", {"type": "text", "text": error_message}, sender="slip_bot")
                    except Exception as e:
                        logger.warning(f"⚠️ Failed to save chat history: {e}")
                    send_line_reply(reply_token, error_message)
                    
            except Exception as e:
                error_msg = f"เกิดข้อผิดพลาดในการตรวจสอบสลิป: {str(e)}"
                logger.error(f"❌ Slip verification error: {e}")
                send_line_reply(reply_token, error_msg)
                
        elif message.get("type") == "text":
            user_text = message.get("text", "")
            logger.info(f"💬 Received text from user {user_id}: {user_text[:50]}...")
            
            try:
                # ตรวจสอบว่าผู้ใช้ส่งข้อมูลสลิปมาผ่านข้อความหรือไม่
                slip_info = extract_slip_info_from_text(user_text)
                
                if slip_info["bank_code"] and slip_info["trans_ref"]:
                    # ผู้ใช้ส่งข้อมูลสลิปมาผ่านข้อความ ลองตรวจสอบ
                    logger.info(f"🏦 Detected slip info: Bank {slip_info['bank_code']}, Ref {slip_info['trans_ref']}")
                    result = verify_slip_multiple_providers(
                        None, None, 
                        slip_info["bank_code"], 
                        slip_info["trans_ref"]
                    )
                    
                    if result["status"] == "success":
                        logger.info("✅ Text slip verification successful")
                        try:
                            save_chat_history(user_id, "out", {"type": "flex", "content": result["data"]}, sender="slip_bot")
                        except Exception as e:
                            logger.warning(f"⚠️ Failed to save chat history: {e}")
                        send_line_flex_reply(reply_token, result["data"])
                    else:
                        # ส่งข้อความ error พร้อมคำแนะนำ
                        error_message = result["message"]
                        if result.get("suggestions"):
                            error_message += "\n\n💡 ลองทำตามนี้:\n• " + "\n• ".join(result["suggestions"][:2])
                        
                        logger.warning(f"❌ Text slip verification failed: {result['message']}")
                        try:
                            save_chat_history(user_id, "out", {"type": "text", "text": error_message}, sender="slip_bot")
                        except Exception as e:
                            logger.warning(f"⚠️ Failed to save chat history: {e}")
                        send_line_reply(reply_token, error_message)
                else:
                    # การสนทนาธรรมดาด้วย AI
                    logger.info("🤖 Processing with AI")
                    try:
                        response = get_chat_response(user_text, user_id)
                        try:
                            save_chat_history(user_id, "out", {"type": "text", "text": response}, sender="bot")
                        except Exception as e:
                            logger.warning(f"⚠️ Failed to save chat history: {e}")
                        send_line_reply(reply_token, response)
                    except Exception as e:
                        error_msg = "ขออภัย เกิดข้อผิดพลาดในการประมวลผล"
                        logger.error(f"❌ AI processing error: {e}")
                        send_line_reply(reply_token, error_msg)
                        
            except Exception as e:
                error_msg = f"เกิดข้อผิดพลาดในการประมวลผลข้อความ: {str(e)}"
                logger.error(f"❌ Text processing error: {e}")
                send_line_reply(reply_token, error_msg)
        else:
            # ประเภทข้อความอื่นๆ
            logger.info(f"📝 Received unsupported message type: {message.get('type')}")
            send_line_reply(reply_token, "ขออภัย ระบบรองรับเฉพาะข้อความและรูปภาพเท่านั้น")
                
    except Exception as e:
        logger.exception(f"❌ Critical error in dispatch_event: {e}")
        # พยายามส่งข้อความแจ้งข้อผิดพลาด
        try:
            reply_token = event.get("replyToken")
            if reply_token:
                send_line_reply(reply_token, "ขออภัย เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง")
        except:
            pass

# ====================== LINE Webhook Route ======================

@app.post("/line/webhook")
async def line_webhook(request: Request) -> JSONResponse:
    """รับ Webhook จาก LINE"""
    logger.info("📨 Received LINE webhook")
    
    try:
        body = await request.body()
        signature = request.headers.get("x-line-signature", "")
        channel_secret = config_manager.get("line_channel_secret", "")
        
        logger.info(f"📋 Request headers: {dict(request.headers)}")
        logger.info(f"📦 Body length: {len(body)} bytes")
        
        # ตรวจสอบลายเซ็น
        if not verify_line_signature(body, signature, channel_secret):
            logger.error("❌ Invalid LINE signature")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid signature")
        
        # แปลง JSON
        try:
            payload = json.loads(body.decode("utf-8"))
            logger.info(f"📄 Webhook payload: {json.dumps(payload, indent=2, ensure_ascii=False)}")
        except json.JSONDecodeError as e:
            logger.error(f"❌ Invalid JSON: {e}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")
        
        # ประมวลผล events
        events = payload.get("events", [])
        logger.info(f"🎭 Processing {len(events)} events")
        
        for i, ev in enumerate(events):
            logger.info(f"🎯 Processing event {i+1}/{len(events)}: {ev.get('type')}")
            # ประมวลผลใน thread แยกพร้อม error handling
            thread = threading.Thread(
                target=dispatch_event, 
                args=(ev,), 
                daemon=True,
                name=f"event-{i+1}"
            )
            thread.start()
            
        logger.info("✅ All events dispatched successfully")
        return JSONResponse(content={"status": "ok"})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"❌ Webhook processing error: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error")

# ====================== ส่วนที่เหลือเหมือนเดิม ======================
# (เนื่องจากไฟล์ยาวมาก ผมจะข้ามส่วนที่ไม่เปลี่ยนแปลง)

# ====================== Admin Pages ======================

@app.get("/", response_class=HTMLResponse)
async def root():
    """Redirect หน้าแรกไปหน้า Admin"""
    return RedirectResponse(url="/admin", status_code=status.HTTP_302_FOUND)

@app.get("/admin", response_class=HTMLResponse)  
async def admin_home(request: Request):
    """หน้าแสดงภาพรวมระบบ"""
    total_count = get_chat_history_count()
    return templates.TemplateResponse(
        "admin_home.html",
        {
            "request": request,
            "config": config_manager.config,
            "total_chat_history": total_count,
        },
    )

@app.get("/admin/chat", response_class=HTMLResponse)
async def admin_chat(request: Request):
    """หน้าแสดงประวัติการสนทนาล่าสุด"""
    history = get_recent_chat_history(limit=100)
    return templates.TemplateResponse(
        "chat_history.html",
        {
            "request": request,
            "chat_history": history,
        },
    )

@app.get("/admin/settings", response_class=HTMLResponse)
async def admin_settings(request: Request):
    """หน้า Settings สำหรับตั้งค่าระบบ"""
    return templates.TemplateResponse(
        "settings.html",
        {
            "request": request,
            "config": config_manager.config,
        },
    )

# ====================== Admin API Endpoints ======================

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
                logger.info(f"Thunder API test - Status: {resp.status_code}")
                
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
            logger.error(f"Thunder API connection error: {e}")

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
            elif response.status_code == 401:
                status_result["line"]["error"] = "Unauthorized: Channel access token invalid"
            else:
                status_result["line"]["error"] = f"{response.status_code}: {response.text}"
        except requests.exceptions.RequestException as e:
            status_result["line"]["error"] = str(e)

    # ตรวจสอบ OpenAI API
    openai_key = config_manager.get("openai_api_key")
    if openai_key:
        status_result["openai"]["configured"] = True
        try:
            headers = {"Authorization": f"Bearer {openai_key}"}
            r = requests.get("https://api.openai.com/v1/models", headers=headers, timeout=5)
            if r.status_code == 200:
                status_result["openai"]["connected"] = True
            else:
                status_result["openai"]["error"] = f"{r.status_code}: {r.text}"
        except Exception as e:
            status_result["openai"]["error"] = str(e)

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

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    logger.info("Health check requested")
    return JSONResponse(content={
        "status": "ok", 
        "timestamp": datetime.utcnow().isoformat(),
        "config_loaded": bool(config_manager.config),
        "line_configured": bool(config_manager.get("line_channel_access_token")),
        "thunder_configured": bool(config_manager.get("thunder_api_token"))
    })

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
