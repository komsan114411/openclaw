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

# ตั้งค่า logger
logging.basicConfig(level=logging.INFO)
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
    raise SystemExit("Cannot import database models")

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
    from services.enhanced_slip_checker import verify_slip_multiple_providers, extract_slip_info_from_text
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

# เริ่มต้นฐานข้อมูล
try:
    logger.info("Initializing database...")
    init_database()
    logger.info("Database initialized successfully.")
except Exception as e:
    logger.error(f"An error occurred during database initialization: {e}")
    raise SystemExit("Database initialization failed.")

# ====================== Utility Functions ======================

def verify_line_signature(body: bytes, signature: str, channel_secret: str) -> bool:
    """ตรวจสอบลายเซ็นของ webhook จาก LINE"""
    if not channel_secret:
        return True
    h = hmac.new(channel_secret.encode(), body, hashlib.sha256).digest()
    computed = base64.b64encode(h).decode()
    return hmac.compare_digest(computed, signature)

def build_slip_flex_contents(slip: Dict[str, Any]) -> Dict[str, Any]:
    """สร้าง payload ของ Flex Message สำหรับผลตรวจสอบสลิป"""
    # ตรวจสอบประเภทของข้อมูลสลิป (KBank หรือ Thunder)
    verified_by = slip.get("verified_by", "Thunder")
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
        # Thunder API format
        title_text = "สลิปถูกต้อง ✅ (Thunder API)"
        amount = slip.get("amount", "0")
        date_time = slip.get("date", "")
        sender_info = slip.get("sender", slip.get("sender_bank", ""))
        receiver_info = slip.get("receiver_name", slip.get("receiver_bank", ""))
        reference_info = ""
    
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
    
    # เพิ่มเบอร์โทรผู้รับถ้ามี (Thunder wallet)
    if slip.get("receiver_phone"):
        detail_contents.append({"type": "text", "text": f"เบอร์ผู้รับ: {slip.get('receiver_phone', '')}", "size": "sm", "color": "#666666"})
    
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
    }

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
            # ไม่เรียก /v1/verify เพื่อหลีกเลี่ยง invalid_payload; เรียก root domain แทน
            ping = requests.get("https://api.thunder.in.th", timeout=5)
            if 200 <= ping.status_code < 500:
                status_result["thunder"]["connected"] = True
            # ไม่ได้ตรวจสอบ balance เพราะ endpoint นี้ไม่ต้องใช้ token
        except requests.exceptions.RequestException as e:
            status_result["thunder"]["error"] = str(e)

    # ตรวจสอบ LINE API
    line_token = config_manager.get("line_channel_access_token")
    if line_token:
        status_result["line"]["configured"] = True
        try:
            headers = {"Authorization": f"Bearer {line_token}"}
            response = requests.get("https://api.line.me/v2/bot/info",
                                    headers=headers, timeout=5)
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
            r = requests.get("https://api.openai.com/v1/models",
                             headers=headers, timeout=5)
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

@app.post("/admin/test-thunder")
async def test_thunder_api():
    """ทดสอบการเชื่อมต่อ Thunder API"""
    api_token = config_manager.get("thunder_api_token")
    if not api_token:
        return JSONResponse(content={"status": "error",
                                     "message": "ยังไม่ได้ตั้งค่า Thunder API Token"})

    try:
        headers = {"Authorization": f"Bearer {api_token}"}
        # เรียก /v1/verify เพื่อดูว่าตอบสนอง; 400 invalid_payload หมายถึงเชื่อมต่อได้แต่ต้องส่งไฟล์
        resp = requests.get("https://api.thunder.in.th/v1/verify",
                            headers=headers, timeout=10)
        # หาก invalid_payload ให้ตีความว่าเชื่อมต่อได้
        if resp.status_code == 400 and "invalid_payload" in resp.text:
            return JSONResponse(content={
                "status": "success",
                "message": "เชื่อมต่อ Thunder API ได้ แต่ต้องส่งไฟล์ในการตรวจสอบสลิป",
                "raw_status_code": resp.status_code,
                "response_message": resp.json().get("message", "")
            })
        elif resp.status_code in (200, 401):
            msg = "เชื่อมต่อ Thunder API สำเร็จ" if resp.status_code == 200 else "เชื่อมต่อได้ แต่ Token ไม่ถูกต้อง"
            return JSONResponse(content={
                "status": "success",
                "message": msg,
                "raw_status_code": resp.status_code,
                "response_message": resp.json().get("message", "")
            })
        return JSONResponse(content={
            "status": "error",
            "message": f"{resp.status_code}: {resp.text}"
        })
    except Exception as e:
        return JSONResponse(content={
            "status": "error",
            "message": f"Thunder API Error: {str(e)}"
        })

@app.post("/admin/test-kbank")
async def test_kbank_api():
    """ทดสอบการเชื่อมต่อ KBank API"""
    try:
        consumer_id = config_manager.get("kbank_consumer_id")
        consumer_secret = config_manager.get("kbank_consumer_secret")
        
        if not consumer_id or not consumer_secret:
            return JSONResponse(content={"status": "error", "message": "ยังไม่ได้ตั้งค่า KBank Consumer ID หรือ Secret"})
        
        try:
            from services.kbank_checker import kbank_checker
            token = kbank_checker._get_access_token()
            
            if token:
                return JSONResponse(content={
                    "status": "success", 
                    "message": "เชื่อมต่อ KBank API สำเร็จ",
                    "token_preview": token[:20] + "...",
                    "token_length": len(token)
                })
            else:
                return JSONResponse(content={"status": "error", "message": "ไม่สามารถขอ KBank access token ได้"})
        except ImportError:
            return JSONResponse(content={"status": "error", "message": "KBank services ไม่พร้อมใช้งาน"})
            
    except Exception as e:
        return JSONResponse(content={"status": "error", "message": f"KBank API Error: {str(e)}"})

@app.post("/admin/test-slip-upload")
async def test_slip_upload(request: Request):
    """ทดสอบอัปโหลดสลิปจากหน้า Admin"""
    try:
        form = await request.form()
        file = form.get("file")
        if not file:
            return JSONResponse(content={"status": "error", "message": "ไม่พบไฟล์สลิป"})

        image_data = await file.read()
        message_id = "test_slip_" + datetime.now().strftime("%Y%m%d%H%M%S")

        # ใช้ระบบตรวจสอบแบบใหม่
        result = verify_slip_multiple_providers(message_id, test_image_data=image_data)
        
        return JSONResponse(content={
            "status": "success" if result["status"] == "success" else "error",
            "message": result["message"] if result["status"] == "error" else f"ตรวจสอบสำเร็จด้วย {result.get('type', 'unknown')} API",
            "response": result
        })

    except Exception as e:
        return JSONResponse(content={"status": "error", "message": str(e)})

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
        return JSONResponse(content={"status": "success", "message": "บันทึกการตั้งค่าแล้ว"})
    except Exception as e:
        return JSONResponse(content={"status": "error", "message": str(e)})

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return JSONResponse(content={"status": "ok", "timestamp": datetime.utcnow().isoformat()})
