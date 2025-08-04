import json
import hmac
import hashlib
import base64
import threading
import logging
import os
from datetime import datetime
from typing import Dict, Any, Optional

import requests
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates

# เพิ่มการ import OpenAI เพื่อให้สามารถตรวจสอบสถานะได้
try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

# ตั้งค่า logger
logger = logging.getLogger("main_app")
logger.setLevel(logging.INFO)

# สร้าง FastAPI instance และกำหนดตำแหน่งเทมเพลต
app = FastAPI(title="LINE OA Middleware (Improved)")
templates = Jinja2Templates(directory="templates")

# การจัดการการเริ่มต้นฐานข้อมูลอย่างปลอดภัย
try:
    from utils.config_manager import config_manager
    from models.database import (
        init_database,
        save_chat_history,
        get_chat_history_count,
        get_recent_chat_history,
    )
    from services.chat_bot import get_chat_response
    from services.slip_checker import verify_slip_with_thunder
    
    # เริ่มต้นฐานข้อมูลเมื่อแอปถูกเริ่ม
    logger.info("Initializing database...")
    init_database()
    logger.info("Database initialized successfully.")
    
except ImportError as e:
    logger.error(f"Failed to import a module: {e}")
    raise SystemExit("Application startup failed due to missing dependencies.")
except Exception as e:
    logger.error(f"An error occurred during application startup: {e}")
    raise SystemExit("Application startup failed.")

# Import KBank services หลังจาก config_manager
try:
    from services.enhanced_slip_checker import verify_slip_multiple_providers, extract_slip_info_from_text
    logger.info("✅ KBank services imported successfully")
except ImportError as e:
    logger.warning(f"⚠️ KBank services not available: {e}")
    # ถ้าไม่มี KBank services ให้ใช้ Thunder เท่านั้น
    def verify_slip_multiple_providers(message_id, test_image_data=None, bank_code=None, trans_ref=None):
        return verify_slip_with_thunder(message_id, test_image_data)
    
    def extract_slip_info_from_text(text):
        return {"bank_code": None, "trans_ref": None}

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
        logger.error("LINE_CHANNEL_ACCESS_TOKEN is missing.")
        return
    url = "https://api.line.me/v2/bot/message/reply"
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    payload = {"replyToken": reply_token, "messages": [{"type": "text", "text": text}]}
    try:
        requests.post(url, headers=headers, data=json.dumps(payload), timeout=10)
    except Exception as e:
        logger.error("Failed to send text reply: %s", e)

def send_line_flex_reply(reply_token: str, slip_data: Dict[str, Any]) -> None:
    """ส่ง Flex Message สำหรับผลตรวจสอบสลิป"""
    access_token = config_manager.get("line_channel_access_token")
    if not access_token:
        logger.error("LINE_CHANNEL_ACCESS_TOKEN is missing.")
        return
    url = "https://api.line.me/v2/bot/message/reply"
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    contents = build_slip_flex_contents(slip_data)
    payload = {"replyToken": reply_token, "messages": [{"type": "flex", "altText": "ผลการตรวจสอบสลิป", "contents": contents}]}
    try:
        requests.post(url, headers=headers, data=json.dumps(payload), timeout=10)
    except Exception as e:
        logger.error("Failed to send flex reply: %s", e)

# ====================== Event Dispatcher ======================

def dispatch_event(event: Dict[str, Any]) -> None:
    """ประมวลผล event ที่รับมาจาก LINE แล้วดำเนินการตามประเภทข้อความ"""
    try:
        if event.get("type") != "message":
            return
        message = event.get("message", {})
        user_id = event.get("source", {}).get("userId")
        reply_token = event.get("replyToken")
        
        # บันทึกข้อความขาเข้า
        save_chat_history(user_id, "in", message, sender="user")

        if message.get("type") == "image":
            # ตรวจสอบสลิปด้วยระบบใหม่ที่รองรับทั้ง KBank และ Thunder
            logger.info(f"📷 ได้รับรูปภาพจากผู้ใช้ {user_id}")
            result = verify_slip_multiple_providers(message.get("id"))
            
            if result["status"] == "success":
                # ส่ง Flex message และบันทึกประวัติขาออก
                logger.info(f"✅ ตรวจสอบสลิปสำเร็จด้วย {result.get('type', 'unknown')} API")
                save_chat_history(user_id, "out", {"type": "flex", "content": result["data"]}, sender="slip_bot")
                send_line_flex_reply(reply_token, result["data"])
            else:
                # ส่งข้อความ error
                logger.warning(f"❌ ตรวจสอบสลิปล้มเหลว: {result['message']}")
                save_chat_history(user_id, "out", {"type": "text", "text": result["message"]}, sender="slip_bot")
                send_line_reply(reply_token, result["message"])
                
        elif message.get("type") == "text":
            user_text = message.get("text", "")
            logger.info(f"💬 ได้รับข้อความจากผู้ใช้ {user_id}: {user_text[:50]}...")
            
            # ตรวจสอบว่าผู้ใช้ส่งข้อมูลสลิปมาผ่านข้อความหรือไม่
            slip_info = extract_slip_info_from_text(user_text)
            
            if slip_info["bank_code"] and slip_info["trans_ref"]:
                # ผู้ใช้ส่งข้อมูลสลิปมาผ่านข้อความ ลองตรวจสอบ
                logger.info(f"🏦 ตรวจพบข้อมูลสลิป: ธนาคาร {slip_info['bank_code']}, อ้างอิง {slip_info['trans_ref']}")
                result = verify_slip_multiple_providers(
                    None, None, 
                    slip_info["bank_code"], 
                    slip_info["trans_ref"]
                )
                
                if result["status"] == "success":
                    logger.info("✅ ตรวจสอบสลิปจากข้อความสำเร็จ")
                    save_chat_history(user_id, "out", {"type": "flex", "content": result["data"]}, sender="slip_bot")
                    send_line_flex_reply(reply_token, result["data"])
                else:
                    logger.warning(f"❌ ตรวจสอบสลิปจากข้อความล้มเหลว: {result['message']}")
                    save_chat_history(user_id, "out", {"type": "text", "text": result["message"]}, sender="slip_bot")
                    send_line_reply(reply_token, result["message"])
            else:
                # การสนทนาธรรมดาด้วย AI
                logger.info("🤖 กำลังประมวลผลด้วย AI")
                response = get_chat_response(user_text, user_id)
                save_chat_history(user_id, "out", {"type": "text", "text": response}, sender="bot")
                send_line_reply(reply_token, response)
                
    except Exception as e:
        logger.exception("Error processing event: %s", e)

# ====================== LINE Webhook Route ======================

@app.post("/line/webhook")
async def line_webhook(request: Request) -> JSONResponse:
    """รับ Webhook จาก LINE"""
    body = await request.body()
    signature = request.headers.get("x-line-signature", "")
    channel_secret = config_manager.get("line_channel_secret", "")
    if not verify_line_signature(body, signature, channel_secret):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid signature")
    try:
        payload = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")
    # Dispatch ทุก event ใน thread แยก
    for ev in payload.get("events", []):
        threading.Thread(target=dispatch_event, args=(ev,), daemon=True).start()
    return JSONResponse(content={"status": "ok"})

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
    """หน้าแสดงประวัติการสนทนาล่าสุด (เช่น 100 รายการ)"""
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
    status = {
        "thunder": {"configured": False, "connected": False},
        "line": {"configured": False, "connected": False},
        "openai": {"configured": False, "connected": False},
        "kbank": {"configured": False, "connected": False},
    }

    # ตรวจสอบ Thunder API
    thunder_token = config_manager.get("thunder_api_token")
    if thunder_token:
        status["thunder"]["configured"] = True
        try:
            headers = {"Authorization": f"Bearer {thunder_token}"}
            response = requests.get("https://api.thunder.in.th/v1/user", headers=headers, timeout=5)
            response.raise_for_status()
            user_data = response.json()
            status["thunder"]["connected"] = True
            status["thunder"]["balance"] = user_data.get("balance", 0)
        except requests.exceptions.RequestException as e:
            status["thunder"]["error"] = str(e)

    # ตรวจสอบ LINE API
    line_token = config_manager.get("line_channel_access_token")
    if line_token:
        status["line"]["configured"] = True
        try:
            headers = {"Authorization": f"Bearer {line_token}"}
            response = requests.get("https://api.line.me/v2/bot/profile/me", headers=headers, timeout=5)
            response.raise_for_status()
            bot_data = response.json()
            status["line"]["connected"] = True
            status["line"]["bot_name"] = bot_data.get("displayName")
        except requests.exceptions.RequestException as e:
            status["line"]["error"] = str(e)

    # ตรวจสอบ OpenAI API
    openai_key = config_manager.get("openai_api_key")
    if openai_key:
        status["openai"]["configured"] = True
        try:
            if OpenAI:
                client = OpenAI(api_key=openai_key)
                client.models.list()
                status["openai"]["connected"] = True
            else:
                status["openai"]["error"] = "OpenAI library not installed"
        except Exception as e:
            status["openai"]["error"] = str(e)
    
    # ตรวจสอบ KBank API
    kbank_consumer_id = config_manager.get("kbank_consumer_id")
    kbank_consumer_secret = config_manager.get("kbank_consumer_secret")
    
    if kbank_consumer_id and kbank_consumer_secret:
        status["kbank"]["configured"] = True
        try:
            from services.kbank_checker import kbank_checker
            token = kbank_checker._get_access_token()
            if token:
                status["kbank"]["connected"] = True
                status["kbank"]["token_length"] = len(token)
            else:
                status["kbank"]["error"] = "ไม่สามารถขอ access token ได้"
        except Exception as e:
            status["kbank"]["error"] = str(e)
            
    return JSONResponse(content=status)

@app.post("/admin/test-thunder")
async def test_thunder_api(request: Request):
    """ทดสอบการเชื่อมต่อ Thunder API"""
    try:
        api_token = config_manager.get("thunder_api_token")
        if not api_token:
            return JSONResponse(content={"status": "error", "message": "ยังไม่ได้ตั้งค่า Thunder API Token"})
        
        headers = {"Authorization": f"Bearer {api_token}"}
        response = requests.get("https://api.thunder.in.th/v1/user", headers=headers, timeout=10)
        response.raise_for_status()
        user_data = response.json()
        return JSONResponse(content={"status": "success", "message": "เชื่อมต่อ Thunder API สำเร็จ", "user": user_data.get("name", "Unknown"), "balance": user_data.get("balance", 0)})
    except requests.exceptions.RequestException as e:
        return JSONResponse(content={"status": "error", "message": f"Thunder API Error: {e}", "details": str(e)})
    except Exception as e:
        return JSONResponse(content={"status": "error", "message": f"Connection error: {str(e)}"})

@app.post("/admin/test-kbank")
async def test_kbank_api(request: Request):
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

@app.post("/admin/test-slip-text")
async def test_slip_text(request: Request):
    """ทดสอบตรวจสอบสลิปจากข้อความ"""
    try:
        data = await request.json()
        text_input = data.get("text", "")
        
        if not text_input:
            return JSONResponse(content={"status": "error", "message": "กรุณาใส่ข้อความ"})
        
        # ดึงข้อมูลจากข้อความ
        slip_info = extract_slip_info_from_text(text_input)
        
       if not slip_info["bank_code"] or not slip_info["trans_ref"]:
            return JSONResponse(content={
                "status": "error", 
                "message": "ไม่พบข้อมูลธนาคารหรือหมายเลขอ้างอิงในข้อความ",
                "extracted": slip_info
            })
        
        # ตรวจสอบสลิป
        result = verify_slip_multiple_providers(
            None, None,
            slip_info["bank_code"],
            slip_info["trans_ref"]
        )
        
        return JSONResponse(content={
            "status": result["status"],
            "message": result.get("message", "ตรวจสอบเสร็จสิ้น"),
            "extracted": slip_info,
            "response": result
        })
        
    except Exception as e:
        return JSONResponse(content={"status": "error", "message": str(e)})

@app.get("/admin/status")
async def admin_status():
    """API endpoint สำหรับ refresh สถานะ"""
    return JSONResponse(content={"status": "success"})

@app.get("/admin/config/current")
async def show_current_config():
    """แสดง config ปัจจุบันในรูปแบบ JSON"""
    return JSONResponse(content={"config": config_manager.config, "timestamp": datetime.utcnow().isoformat()})

@app.post("/admin/settings/reset")
async def reset_settings():
    """รีเซ็ตการตั้งค่ากลับเป็นค่าเริ่มต้น"""
    try:
        if os.path.exists("app_config.json"):
            os.remove("app_config.json")
        config_manager.reload_config()
        return JSONResponse(content={"status": "success", "message": "รีเซ็ตการตั้งค่าเรียบร้อยแล้ว"})
    except Exception as e:
        return JSONResponse(content={"status": "error", "message": str(e)})

@app.post("/admin/test-ai")
async def test_ai_prompt(request: Request):
    """ทดสอบ AI Prompt"""
    data = await request.json()
    prompt = data.get("prompt", "")
    test_message = data.get("test_message", "สวัสดี")
    
    try:
        import time
        start_time = time.time()
        
        response = get_chat_response(test_message, "test_user")
        
        response_time = round(time.time() - start_time, 2)
        
        return JSONResponse(content={
            "status": "success", 
            "response": response,
            "response_time": response_time,
            "prompt_length": len(prompt)
        })
    except Exception as e:
        return JSONResponse(content={"status": "error", "message": str(e)})

@app.get("/admin/debug/config")
async def debug_config():
    """Debug configuration"""
    try:
        config_from_file = {}
        file_exists = os.path.exists("app_config.json")
        
        if file_exists:
            with open("app_config.json", 'r', encoding='utf-8') as f:
                config_from_file = json.load(f)
        
        return JSONResponse(content={
            "file_exists": file_exists,
            "config_in_memory": config_manager.config,
            "config_from_file": config_from_file,
            "ai_prompt_memory_length": len(config_manager.config.get("ai_prompt", "")),
            "ai_prompt_file_length": len(config_from_file.get("ai_prompt", "")),
            "kbank_configured": bool(config_manager.get("kbank_consumer_id") and config_manager.get("kbank_consumer_secret")),
            "kbank_enabled": config_manager.get("kbank_enabled", False)
        })
    except Exception as e:
        return JSONResponse(content={"error": str(e)})

@app.post("/admin/config/reload")
async def reload_config():
    """โหลด config ใหม่จากไฟล์"""
    try:
        config_manager.reload_config()
        return JSONResponse(content={
            "status": "success",
            "message": "โหลด Config ใหม่เรียบร้อย",
            "ai_prompt_length": len(config_manager.config.get("ai_prompt", "")),
            "kbank_enabled": config_manager.get("kbank_enabled", False)
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
            "kbank_consumer_id",      # เพิ่ม KBank Consumer ID
            "kbank_consumer_secret",  # เพิ่ม KBank Consumer Secret
        ]:
            if key in data:
                updates[key] = data[key].strip()
        
        updates["ai_enabled"] = bool(data.get("ai_enabled"))
        updates["slip_enabled"] = bool(data.get("slip_enabled"))
        updates["kbank_enabled"] = bool(data.get("kbank_enabled"))  # เพิ่ม KBank enabled

        config_manager.update_multiple(updates)
        return JSONResponse(content={"status": "success", "message": "บันทึกการตั้งค่าแล้ว"})
    except Exception as e:
        return JSONResponse(content={"status": "error", "message": str(e)})

# Add health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return JSONResponse(content={"status": "ok", "timestamp": datetime.utcnow().isoformat()})
