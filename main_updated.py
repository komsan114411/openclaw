# main.py
import json
import hmac
import hashlib
import base64
import threading
import logging
import os
from datetime import datetime
from typing import Dict, Any

import requests
from fastapi import FastAPI, Request, HTTPException, status, Form, File, UploadFile
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates

from utils.config_manager import config_manager
from models.database import (
    init_database,
    save_chat_history,
    get_chat_history_count,
    get_recent_chat_history,
)
from services.chat_bot import get_chat_response
from services.slip_checker import verify_slip_with_thunder

# ตั้งค่า logger
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("main_app")

# สร้าง FastAPI instance และกำหนดตำแหน่งเทมเพลต
app = FastAPI(title="LINE OA Middleware (Improved)")
templates = Jinja2Templates(directory="templates")

# เริ่มต้นฐานข้อมูลเมื่อแอปถูกเริ่ม
init_database()

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
    return {
        "type": "bubble",
        "size": "mega",
        "body": {
            "type": "box",
            "layout": "vertical",
            "spacing": "md",
            "contents": [
                {
                    "type": "text",
                    "text": "สลิปถูกต้อง ✅",
                    "weight": "bold",
                    "size": "lg",
                    "color": "#00B900",
                },
                {
                    "type": "text",
                    "text": f"฿{slip.get('amount')}",
                    "weight": "bold",
                    "size": "xxl",
                    "margin": "md",
                },
                {
                    "type": "text",
                    "text": slip.get("date", ""),
                    "size": "sm",
                    "color": "#999999",
                    "margin": "sm",
                },
                {
                    "type": "separator",
                    "margin": "md",
                },
                {
                    "type": "box",
                    "layout": "vertical",
                    "margin": "md",
                    "contents": [
                        {
                            "type": "text",
                            "text": f"ผู้โอน: {slip.get('sender', slip.get('sender_bank', ''))}",
                            "size": "sm",
                        },
                        {
                            "type": "text",
                            "text": f"ผู้รับ: {slip.get('receiver_name', slip.get('receiver_bank', ''))}",
                            "size": "sm",
                        },
                        {
                            "type": "text",
                            "text": f"เบอร์ผู้รับ: {slip.get('receiver_phone', '')}",
                            "size": "sm",
                            "color": "#666666",
                        },
                    ],
                },
            ],
        },
        "footer": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {
                    "type": "text",
                    "text": "ตรวจสอบโดย Thunder",
                    "size": "xs",
                    "color": "#AAAAAA",
                    "align": "center",
                }
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
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "replyToken": reply_token,
        "messages": [{"type": "text", "text": text}],
    }
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
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    contents = build_slip_flex_contents(slip_data)
    payload = {
        "replyToken": reply_token,
        "messages": [
            {
                "type": "flex",
                "altText": "ผลการตรวจสอบสลิป",
                "contents": contents,
            }
        ],
    }
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
            # ตรวจสอบสลิป
            result = verify_slip_with_thunder(message.get("id"))
            if result["status"] == "success":
                # ส่ง Flex message และบันทึกประวัติขาออก
                save_chat_history(
                    user_id,
                    "out",
                    {"type": "flex", "content": result["data"]},
                    sender="slip_bot",
                )
                send_line_flex_reply(reply_token, result["data"])
            else:
                # ส่งข้อความ error
                save_chat_history(
                    user_id,
                    "out",
                    {"type": "text", "text": result["message"]},
                    sender="slip_bot",
                )
                send_line_reply(reply_token, result["message"])
        elif message.get("type") == "text":
            # ใช้ AI ตอบข้อความ พร้อมส่งประวัติแชทย้อนหลังให้จำบริบท
            user_text = message.get("text", "")
            response = get_chat_response(user_text, user_id)
            save_chat_history(
                user_id, "out", {"type": "text", "text": response}, sender="bot"
            )
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
    # ====================== LINE Webhook Route ====================== (ต่อ)
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

@app.get("/admin/status")
async def admin_status():
   """API endpoint สำหรับ refresh สถานะ"""
   return JSONResponse(content={"status": "success"})

@app.get("/admin/config/current")
async def show_current_config():
   """แสดง config ปัจจุบันในรูปแบบ JSON"""
   return JSONResponse(content={
       "config": config_manager.config,
       "timestamp": datetime.utcnow().isoformat()
   })

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
           "ai_prompt_file_length": len(config_from_file.get("ai_prompt", ""))
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
           "ai_prompt_length": len(config_manager.config.get("ai_prompt", ""))
       })
   except Exception as e:
       return JSONResponse(content={"status": "error", "message": str(e)})

@app.post("/admin/settings/update")
async def update_settings(request: Request) -> JSONResponse:
   """บันทึกการตั้งค่าจากหน้า Admin"""
   data = await request.json()
   updates = {}
   for key in [
       "line_channel_secret",
       "line_channel_access_token",
       "thunder_api_token",
       "openai_api_key",
       "ai_prompt",
       "wallet_phone_number",
   ]:
       if key in data:
           updates[key] = data[key].strip()
   updates["ai_enabled"] = bool(data.get("ai_enabled"))
   updates["slip_enabled"] = bool(data.get("slip_enabled"))

   config_manager.update_multiple(updates)
   return JSONResponse(content={"status": "success", "message": "บันทึกการตั้งค่าแล้ว"})

# ====================== เพิ่ม API Endpoints ใหม่ ======================

@app.get("/admin/api-status")
async def check_api_status():
   """ตรวจสอบสถานะการเชื่อมต่อ APIs ทั้งหมด"""
   status = {
       "thunder": {"configured": False, "connected": False, "error": None},
       "line": {"configured": False, "connected": False, "error": None},
       "openai": {"configured": False, "connected": False, "error": None}
   }
   
   # ตรวจสอบ Thunder API
   thunder_token = config_manager.get("thunder_api_token")
   if thunder_token:
       status["thunder"]["configured"] = True
       try:
           headers = {"Authorization": f"Bearer {thunder_token}"}
           resp = requests.get("https://api.thunder.in.th/v1/user", headers=headers, timeout=5)
           if resp.status_code == 200:
               status["thunder"]["connected"] = True
               user_data = resp.json()
               status["thunder"]["balance"] = user_data.get("balance", 0)
           else:
               status["thunder"]["error"] = f"API returned {resp.status_code}"
       except Exception as e:
           status["thunder"]["error"] = str(e)
   
   # ตรวจสอบ LINE API
   line_token = config_manager.get("line_channel_access_token")
   if line_token:
       status["line"]["configured"] = True
       try:
           headers = {"Authorization": f"Bearer {line_token}"}
           resp = requests.get("https://api.line.me/v2/bot/info", headers=headers, timeout=5)
           if resp.status_code == 200:
               status["line"]["connected"] = True
               bot_info = resp.json()
               status["line"]["bot_name"] = bot_info.get("displayName", "Unknown")
           else:
               status["line"]["error"] = f"API returned {resp.status_code}"
       except Exception as e:
           status["line"]["error"] = str(e)
   
   # ตรวจสอบ OpenAI API
   openai_key = config_manager.get("openai_api_key")
   if openai_key:
       status["openai"]["configured"] = True
       try:
           headers = {"Authorization": f"Bearer {openai_key}"}
           resp = requests.get("https://api.openai.com/v1/models", headers=headers, timeout=5)
           if resp.status_code == 200:
               status["openai"]["connected"] = True
           else:
               status["openai"]["error"] = f"API returned {resp.status_code}"
       except Exception as e:
           status["openai"]["error"] = str(e)
   
   return JSONResponse(content=status)

@app.post("/admin/test-thunder")
async def test_thunder_api(request: Request):
   """ทดสอบการเชื่อมต่อ Thunder API"""
   try:
       api_token = config_manager.get("thunder_api_token")
       if not api_token:
           return JSONResponse(content={
               "status": "error", 
               "message": "ยังไม่ได้ตั้งค่า Thunder API Token"
           })
       
       # ทดสอบเรียก API endpoint พื้นฐาน
       headers = {"Authorization": f"Bearer {api_token}"}
       response = requests.get(
           "https://api.thunder.in.th/v1/user", 
           headers=headers, 
           timeout=10
       )
       
       if response.status_code == 200:
           user_data = response.json()
           return JSONResponse(content={
               "status": "success",
               "message": "เชื่อมต่อ Thunder API สำเร็จ",
               "user": user_data.get("name", "Unknown"),
               "balance": user_data.get("balance", 0)
           })
       else:
           return JSONResponse(content={
               "status": "error",
               "message": f"Thunder API Error: {response.status_code}",
               "details": response.text
           })
           
   except Exception as e:
       return JSONResponse(content={
           "status": "error",
           "message": f"Connection error: {str(e)}"
       })

@app.post("/admin/test-slip-upload")
async def test_slip_upload(file: UploadFile = File(...)):
   """ทดสอบอัปโหลดรูปสลิปโดยตรง"""
   try:
       if not file:
           return JSONResponse(content={"status": "error", "message": "ไม่พบไฟล์"})
       
       # อ่านไฟล์
       contents = await file.read()
       
       # ส่งไปตรวจสอบ
       api_token = config_manager.get("thunder_api_token")
       if not api_token:
           return JSONResponse(content={"status": "error", "message": "ไม่พบ Thunder API Token"})
       
       wallet_phone = config_manager.get("wallet_phone_number", "")
       endpoint = "verify/truewallet" if wallet_phone else "verify"
       url = f"https://api.thunder.in.th/v1/{endpoint}"
       
       headers = {"Authorization": f"Bearer {api_token}"}
       files = {"file": (file.filename, contents, file.content_type)}
       data = {"wallet_phone": wallet_phone} if wallet_phone else {}
       
       logger.info(f"Testing slip upload to {url}")
       response = requests.post(url, headers=headers, files=files, data=data, timeout=30)
       
       logger.info(f"Thunder API response: {response.status_code}")
       
       return JSONResponse(content={
           "status": "success" if response.status_code == 200 else "error",
           "status_code": response.status_code,
           "response": response.json() if response.status_code == 200 else response.text
       })
       
   except Exception as e:
       logger.error(f"Test slip upload error: {e}")
       return JSONResponse(content={"status": "error", "message": str(e)})

# ====================== Health Check ======================

@app.get("/health")
async def health_check():
   """Health check endpoint"""
   return JSONResponse(content={
       "status": "healthy",
       "timestamp": datetime.utcnow().isoformat(),
       "version": "1.0.0"
   })

# ====================== Error Handlers ======================

@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
   """Handle 404 errors"""
   if request.url.path.startswith("/api/"):
       return JSONResponse(
           status_code=404,
           content={"error": "Not found"}
       )
   return RedirectResponse(url="/admin")

@app.exception_handler(500)
async def internal_error_handler(request: Request, exc):
   """Handle 500 errors"""
   logger.error(f"Internal error: {exc}")
   return JSONResponse(
       status_code=500,
       content={"error": "Internal server error"}
   )

# ====================== Startup Event ======================

@app.on_event("startup")
async def startup_event():
   """Run on application startup"""
   logger.info("🚀 Application starting up...")
   logger.info(f"📁 Config loaded with {len(config_manager.config)} settings")
   logger.info(f"💾 Database initialized")
   
   # แสดงสถานะ configuration
   logger.info("📊 Configuration status:")
   logger.info(f"  - LINE Secret: {'✅' if config_manager.get('line_channel_secret') else '❌'}")
   logger.info(f"  - LINE Token: {'✅' if config_manager.get('line_channel_access_token') else '❌'}")
   logger.info(f"  - Thunder API: {'✅' if config_manager.get('thunder_api_token') else '❌'}")
   logger.info(f"  - OpenAI API: {'✅' if config_manager.get('openai_api_key') else '❌'}")
   logger.info(f"  - AI Enabled: {config_manager.get('ai_enabled', False)}")
   logger.info(f"  - Slip Check Enabled: {config_manager.get('slip_enabled', False)}")

if __name__ == "__main__":
   import uvicorn
   port = int(os.environ.get("PORT", 8000))
   uvicorn.run(app, host="0.0.0.0", port=port)
