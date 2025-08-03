# main.py
import json
import hmac
import hashlib
import base64
import threading
import logging
import os
import time
from typing import Dict, Any

import requests
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates

from utils.config_manager import config_manager
from models.database import (
    init_database,
    save_chat_history,
    get_chat_history_count,
    get_recent_chat_history,
    get_user_chat_history,
)
from services.chat_bot import get_chat_response
from services.slip_checker import verify_slip_with_thunder

# ตั้งค่า logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("main_app")

app = FastAPI(title="LINE OA Middleware (Full Version)")
templates = Jinja2Templates(directory="templates")

# เริ่มต้นฐานข้อมูล SQLite
init_database()

# -------------- Helper Functions -----------------

def verify_line_signature(body: bytes, signature: str, channel_secret: str) -> bool:
    """ตรวจสอบลายเซ็นของ Webhook จาก LINE"""
    if not channel_secret:
        logger.warning("⚠️ No LINE channel secret configured")
        return True
    h = hmac.new(channel_secret.encode(), body, hashlib.sha256).digest()
    computed = base64.b64encode(h).decode()
    return hmac.compare_digest(computed, signature)

def build_slip_flex_contents(slip: Dict[str, Any]) -> Dict[str, Any]:
    """สร้าง payload ของ Flex Message สำหรับผลสลิป"""
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
                    "color": "#00B900"
                },
                {
                    "type": "text",
                    "text": f"฿{slip.get('amount', '0')}",
                    "weight": "bold",
                    "size": "xxl",
                    "margin": "md"
                },
                {
                    "type": "text",
                    "text": slip.get("date", ""),
                    "size": "sm",
                    "color": "#999999",
                    "margin": "sm"
                },
                {
                    "type": "separator",
                    "margin": "md"
                },
                {
                    "type": "box",
                    "layout": "vertical",
                    "margin": "md",
                    "contents": [
                        {
                            "type": "text",
                            "text": f"ผู้โอน: {slip.get('sender', slip.get('sender_bank', ''))}",
                            "size": "sm"
                        },
                        {
                            "type": "text",
                            "text": f"ผู้รับ: {slip.get('receiver_name', slip.get('receiver_bank', ''))}",
                            "size": "sm"
                        },
                        {
                            "type": "text",
                            "text": f"เบอร์ผู้รับ: {slip.get('receiver_phone', '')}",
                            "size": "sm",
                            "color": "#666666"
                        },
                    ]
                }
            ]
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
                    "align": "center"
                }
            ]
        }
    }

def send_line_reply(reply_token: str, text: str) -> bool:
    """ส่งข้อความธรรมดากลับไปยัง LINE"""
    access_token = config_manager.get("line_channel_access_token")
    if not access_token:
        logger.error("❌ Missing LINE_CHANNEL_ACCESS_TOKEN")
        return False
    
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
        resp = requests.post(url, headers=headers, data=json.dumps(payload), timeout=10)
        if resp.status_code == 200:
            logger.info(f"✅ Sent reply: {text[:50]}...")
            return True
        else:
            logger.error(f"❌ LINE reply failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        logger.error(f"❌ Failed to send text message: {e}")
        return False

def send_line_flex_reply(reply_token: str, slip_data: Dict[str, Any]) -> bool:
    """ส่ง Flex Message กลับไปยัง LINE"""
    access_token = config_manager.get("line_channel_access_token")
    if not access_token:
        logger.error("❌ Missing LINE_CHANNEL_ACCESS_TOKEN")
        return False
    
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
        resp = requests.post(url, headers=headers, data=json.dumps(payload), timeout=10)
        if resp.status_code == 200:
            logger.info("✅ Sent flex message for slip verification")
            return True
        else:
            logger.error(f"❌ LINE flex reply failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        logger.error(f"❌ Failed to send flex message: {e}")
        return False

# -------------- Event Dispatcher --------------

def dispatch_event(event: Dict[str, Any]) -> None:
    """ประมวลผลเหตุการณ์จาก LINE แล้วดำเนินการตามประเภทข้อความ"""
    try:
        event_type = event.get("type")
        source = event.get("source", {})
        user_id = source.get("userId")
        
        logger.info(f"📨 Processing event: {event_type} from user: {user_id}")
        
        if event_type == "message":
            message = event.get("message", {})
            reply_token = event.get("replyToken")
            message_type = message.get("type")
            
            # บันทึกข้อความขาเข้า
            save_chat_history(user_id, "in", message, sender="user")
            
            if message_type == "image":
                logger.info("🖼️ Processing image message (slip verification)")
                # ตรวจสอบสลิป
                result = verify_slip_with_thunder(message.get("id"))
               if result["status"] == "success":
                   # ส่ง Flex Message ผลลัพธ์
                   save_chat_history(user_id, "out", {"type": "flex", "content": result["data"]}, sender="slip_bot")
                   send_line_flex_reply(reply_token, result["data"])
               else:
                   # หากผิดพลาด ให้ตอบข้อความธรรมดา
                   error_message = result.get("message", "ไม่สามารถตรวจสอบสลิปได้")
                   save_chat_history(user_id, "out", {"type": "text", "text": error_message}, sender="slip_bot")
                   send_line_reply(reply_token, error_message)
                   
           elif message_type == "text":
               user_text = message.get("text", "")
               logger.info(f"💬 Processing text message: {user_text[:50]}...")
               
               # AI ตอบแชท
               ai_response = get_chat_response(user_text, user_id)
               logger.info(f"🤖 AI response: {ai_response[:50]}...")
               
               # บันทึกและส่งคำตอบ
               save_chat_history(user_id, "out", {"type": "text", "text": ai_response}, sender="bot")
               success = send_line_reply(reply_token, ai_response)
               
               if not success:
                   logger.error(f"❌ Failed to send AI response to user: {user_id}")
                   
           else:
               logger.info(f"⚠️ Unhandled message type: {message_type}")
               # ส่งข้อความแจ้งว่าไม่รองรับ
               unsupported_msg = "ขออภัยค่ะ ระบบรองรับเฉพาะข้อความและรูปภาพเท่านั้น"
               save_chat_history(user_id, "out", {"type": "text", "text": unsupported_msg}, sender="system")
               send_line_reply(reply_token, unsupported_msg)
       else:
           logger.info(f"⚠️ Unhandled event type: {event_type}")
           
   except Exception as e:
       logger.exception(f"❌ Error processing event: {e}")
       # ส่งข้อความแจ้งข้อผิดพลาดให้ผู้ใช้
       try:
           if 'reply_token' in locals():
               error_msg = "ขออภัยค่ะ เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง"
               send_line_reply(reply_token, error_msg)
       except:
           pass

# -------------- LINE Webhook --------------

@app.post("/line/webhook")
async def line_webhook(request: Request) -> JSONResponse:
   """รับ Webhook จาก LINE และส่งงานต่อให้ dispatcher"""
   body = await request.body()
   signature = request.headers.get("x-line-signature", "")
   channel_secret = config_manager.get("line_channel_secret", "")
   
   if not verify_line_signature(body, signature, channel_secret):
       logger.error("❌ Invalid LINE signature")
       raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid signature")
   
   try:
       payload = json.loads(body.decode("utf-8"))
   except json.JSONDecodeError:
       logger.error("❌ Invalid JSON payload")
       raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")
   
   events = payload.get("events", [])
   logger.info(f"📨 Received {len(events)} events from LINE")
   
   for ev in events:
       threading.Thread(target=dispatch_event, args=(ev,), daemon=True).start()
   
   return JSONResponse(content={"status": "ok", "events_processed": len(events)})

# -------------- Admin Routes --------------

@app.get("/", response_class=HTMLResponse)
async def root():
   """Redirect to /admin"""
   return RedirectResponse(url="/admin", status_code=status.HTTP_302_FOUND)

@app.get("/admin", response_class=HTMLResponse)
async def admin_home(request: Request):
   """หน้า dashboard แสดงภาพรวม"""
   total_count = get_chat_history_count()
   return templates.TemplateResponse("admin_home.html", {
       "request": request,
       "config": config_manager.config,
       "total_chat_history": total_count,
   })

@app.get("/admin/chat", response_class=HTMLResponse)
async def admin_chat(request: Request):
   """หน้าแสดงประวัติการสนทนาล่าสุด 100 รายการ"""
   history = get_recent_chat_history(limit=100)
   return templates.TemplateResponse("chat_history.html", {
       "request": request,
       "chat_history": history,
   })

@app.get("/admin/settings", response_class=HTMLResponse)
async def admin_settings(request: Request):
   """หน้า Settings สำหรับปรับ config"""
   # โหลด config ใหม่เพื่อให้แน่ใจว่าเป็นค่าล่าสุด
   config_manager.reload_config()
   logger.info(f"📄 Loading settings page, AI prompt length: {len(config_manager.get('ai_prompt', ''))}")
   
   return templates.TemplateResponse("settings.html", {
       "request": request,
       "config": config_manager.config,
   })

@app.post("/admin/settings/update")
async def update_settings(request: Request) -> JSONResponse:
   """อัปเดต config และบันทึกลงไฟล์"""
   try:
       data = await request.json()
       logger.info("📝 Updating settings...")
       
       # เตรียมข้อมูลที่จะอัปเดต
       updates = {}
       
       # รายการ field ที่อนุญาตให้อัปเดต
       allowed_fields = [
           "line_channel_secret",
           "line_channel_access_token", 
           "thunder_api_token",
           "openai_api_key",
           "ai_prompt",
           "wallet_phone_number",
       ]
       
       for key in allowed_fields:
           if key in data:
               value = data[key].strip() if isinstance(data[key], str) else data[key]
               updates[key] = value
       
       # จัดการ boolean fields
       updates["ai_enabled"] = bool(data.get("ai_enabled"))
       updates["slip_enabled"] = bool(data.get("slip_enabled"))
       
       # Debug: แสดงข้อมูลที่จะอัปเดต
       logger.info(f"📝 Updates to apply: {list(updates.keys())}")
       if 'ai_prompt' in updates:
           logger.info(f"📝 New AI Prompt length: {len(updates['ai_prompt'])}")
       
       # ตรวจสอบข้อมูลที่จำเป็น
       validation_errors = []
       if updates.get("ai_enabled") and not updates.get("openai_api_key"):
           validation_errors.append("ต้องใส่ OpenAI API Key เมื่อเปิดใช้งาน AI")
       
       if updates.get("slip_enabled") and not updates.get("thunder_api_token"):
           validation_errors.append("ต้องใส่ Thunder API Token เมื่อเปิดใช้งานตรวจสอบสลิป")
       
       if validation_errors:
           return JSONResponse(content={
               "status": "error", 
               "message": "❌ " + ", ".join(validation_errors)
           })
       
       # บันทึกการเปลี่ยนแปลง
       if config_manager.update_multiple(updates):
           logger.info("✅ Settings updated successfully")
           
           # ตรวจสอบว่าบันทึกจริงหรือไม่
           saved_prompt_length = len(config_manager.get("ai_prompt", ""))
           logger.info(f"✅ Verified saved AI prompt length: {saved_prompt_length}")
           
           return JSONResponse(content={
               "status": "success", 
               "message": f"✅ บันทึกการตั้งค่าเรียบร้อยแล้ว (AI Prompt: {saved_prompt_length} ตัวอักษร)",
               "ai_prompt_length": saved_prompt_length
           })
       else:
           logger.error("❌ Failed to save settings")
           return JSONResponse(content={
               "status": "error", 
               "message": "❌ ไม่สามารถบันทึกการตั้งค่าได้"
           })
           
   except Exception as e:
       logger.error(f"❌ Error updating settings: {e}")
       return JSONResponse(content={
           "status": "error", 
           "message": f"❌ เกิดข้อผิดพลาด: {str(e)}"
       })

@app.post("/admin/settings/reset")
async def reset_settings() -> JSONResponse:
   """รีเซ็ต config กลับเป็น default"""
   try:
       # ลบไฟล์ config ที่บันทึกไว้
       if os.path.exists(config_manager.config_file):
           os.remove(config_manager.config_file)
           logger.info("🗑️ Deleted config file")
       
       # โหลด config ใหม่
       config_manager.config = config_manager.load_config()
       logger.info("🔄 Config reset to defaults")
       
       return JSONResponse(content={
           "status": "success", 
           "message": "✅ รีเซ็ตการตั้งค่ากลับเป็นค่าเริ่มต้นแล้ว"
       })
   except Exception as e:
       logger.error(f"❌ Error resetting settings: {e}")
       return JSONResponse(content={
           "status": "error", 
           "message": f"❌ ไม่สามารถรีเซ็ตการตั้งค่าได้: {str(e)}"
       })

@app.get("/admin/config/current")
async def get_current_config():
   """ดู config ปัจจุบัน (สำหรับ debug)"""
   # โหลด config ใหม่
   config_manager.reload_config()
   
   # ซ่อนข้อมูลที่เป็น sensitive
   safe_config = config_manager.config.copy()
   for key in ["line_channel_secret", "line_channel_access_token", "thunder_api_token", "openai_api_key"]:
       if key in safe_config and safe_config[key]:
           safe_config[key] = safe_config[key][:10] + "..." if len(safe_config[key]) > 10 else safe_config[key]
   
   return JSONResponse(content={
       "config": safe_config,
       "config_file_exists": os.path.exists(config_manager.config_file),
       "ai_prompt_length": len(config_manager.get("ai_prompt", "")),
       "ai_enabled": config_manager.get("ai_enabled"),
       "slip_enabled": config_manager.get("slip_enabled"),
       "file_path": config_manager.config_file
   })

@app.post("/admin/test-ai")
async def test_ai(request: Request) -> JSONResponse:
   """ทดสอบ AI Response"""
   try:
       data = await request.json()
       prompt = data.get('prompt', '')
       test_message = data.get('test_message', '')
       
       if not prompt or not test_message:
           return JSONResponse(content={
               "status": "error",
               "message": "กรุณาใส่ Prompt และข้อความทดสอบ"
           })
       
       # ตรวจสอบว่ามี OpenAI API Key หรือไม่
       api_key = config_manager.get("openai_api_key")
       if not api_key:
           return JSONResponse(content={
               "status": "error",
               "message": "ยังไม่ได้ตั้งค่า OpenAI API Key"
           })
       
       # อัปเดต prompt ชั่วคราว
       old_prompt = config_manager.get("ai_prompt")
       old_enabled = config_manager.get("ai_enabled")
       
       config_manager.config["ai_prompt"] = prompt
       config_manager.config["ai_enabled"] = True
       
       start_time = time.time()
       
       # ทดสอบ AI
       from services.chat_bot import get_chat_response
       response = get_chat_response(test_message, "test_user_admin")
       
       response_time = round(time.time() - start_time, 2)
       
       # คืนค่า prompt เดิม
       config_manager.config["ai_prompt"] = old_prompt
       config_manager.config["ai_enabled"] = old_enabled
       
       logger.info(f"🧪 AI Test completed - Response time: {response_time}s, Response length: {len(response)}")
       
       return JSONResponse(content={
           "status": "success",
           "response": response,
           "response_time": response_time,
           "prompt_length": len(prompt),
           "test_message": test_message
       })
       
   except Exception as e:
       logger.error(f"❌ AI test error: {e}")
       return JSONResponse(content={
           "status": "error",
           "message": f"เกิดข้อผิดพลาด: {str(e)}"
       })

@app.post("/admin/config/reload")
async def reload_config() -> JSONResponse:
   """โหลด config ใหม่จากไฟล์"""
   try:
       old_prompt_length = len(config_manager.get("ai_prompt", ""))
       config_manager.reload_config()
       new_prompt_length = len(config_manager.get("ai_prompt", ""))
       
       logger.info(f"🔄 Config reloaded - AI Prompt: {old_prompt_length} -> {new_prompt_length} chars")
       
       return JSONResponse(content={
           "status": "success",
           "message": "โหลด Config ใหม่เรียบร้อย",
           "ai_prompt_length": new_prompt_length,
           "ai_enabled": config_manager.get("ai_enabled"),
           "slip_enabled": config_manager.get("slip_enabled"),
           "changes": {
               "ai_prompt_length_change": new_prompt_length - old_prompt_length
           }
       })
       
   except Exception as e:
       logger.error(f"❌ Config reload error: {e}")
       return JSONResponse(content={
           "status": "error", 
           "message": f"ไม่สามารถโหลด Config ได้: {str(e)}"
       })

@app.get("/admin/debug/config")
async def debug_config():
   """Debug config สำหรับตรวจสอบปัญหา"""
   try:
       # อ่านไฟล์ config โดยตรง
       config_from_file = {}
       if os.path.exists(config_manager.config_file):
           with open(config_manager.config_file, 'r', encoding='utf-8') as f:
               config_from_file = json.load(f)
       
       # ซ่อนข้อมูล sensitive
       def safe_config(cfg):
           safe = {}
           for k, v in cfg.items():
               if k in ["line_channel_secret", "line_channel_access_token", "thunder_api_token", "openai_api_key"]:
                   if v:
                       safe[k] = v[:10] + "..." if len(v) > 10 else v
                   else:
                       safe[k] = "(empty)"
               elif isinstance(v, str) and len(v) > 100:
                   safe[k] = v[:100] + f"... ({len(v)} chars total)"
               else:
                   safe[k] = v
           return safe
       
       return JSONResponse(content={
           "config_in_memory": safe_config(config_manager.config),
           "config_from_file": safe_config(config_from_file),
           "file_exists": os.path.exists(config_manager.config_file),
           "file_path": os.path.abspath(config_manager.config_file),
           "ai_prompt_memory_length": len(config_manager.config.get("ai_prompt", "")),
           "ai_prompt_file_length": len(config_from_file.get("ai_prompt", "")) if config_from_file else 0,
           "memory_vs_file_match": config_manager.config == config_from_file if config_from_file else False
       })
   except Exception as e:
       logger.error(f"❌ Debug config error: {e}")
       return JSONResponse(content={"error": str(e)})

@app.get("/admin/status")
async def system_status():
   """ตรวจสอบสถานะระบบ"""
   try:
       # ตรวจสอบสถานะ API keys
       has_openai = bool(config_manager.get("openai_api_key"))
       has_thunder = bool(config_manager.get("thunder_api_token"))
       has_line = bool(config_manager.get("line_channel_access_token")) and bool(config_manager.get("line_channel_secret"))
       
       status = {
           "config_file_exists": os.path.exists(config_manager.config_file),
           "ai_enabled": config_manager.get("ai_enabled"),
           "slip_enabled": config_manager.get("slip_enabled"),
           "has_openai_key": has_openai,
           "has_thunder_token": has_thunder,
           "has_line_tokens": has_line,
           "ai_prompt_length": len(config_manager.get("ai_prompt", "")),
           "total_chat_history": get_chat_history_count(),
           "system_ready": has_openai and has_thunder and has_line,
           "config_file_path": os.path.abspath(config_manager.config_file)
       }
       
       return JSONResponse(content={
           "status": "success",
           "system_status": status,
           "timestamp": time.time()
       })
       
   except Exception as e:
       logger.error(f"❌ Status check error: {e}")
       return JSONResponse(content={
           "status": "error",
           "message": str(e)
       })

# -------------- Health Check --------------

@app.get("/health")
async def health_check():
   """Health check endpoint"""
   return JSONResponse(content={
       "status": "healthy",
       "timestamp": time.time(),
       "version": "1.0.0"
   })

# -------------- Error Handlers --------------

@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
   return JSONResponse(
       status_code=404,
       content={"error": "Not Found", "path": str(request.url.path)}
   )

@app.exception_handler(500)
async def internal_error_handler(request: Request, exc):
   logger.error(f"❌ Internal server error: {exc}")
   return JSONResponse(
       status_code=500,
       content={"error": "Internal Server Error"}
   )

# -------------- Startup Event --------------

@app.on_event("startup")
async def startup_event():
   """เหตุการณ์เมื่อ server เริ่มทำงาน"""
   logger.info("🚀 LINE OA Middleware starting up...")
   logger.info(f"📁 Config file: {config_manager.config_file}")
   logger.info(f"🤖 AI enabled: {config_manager.get('ai_enabled')}")
   logger.info(f"🧾 Slip verification enabled: {config_manager.get('slip_enabled')}")
   logger.info(f"📝 AI Prompt length: {len(config_manager.get('ai_prompt', ''))} characters")
   logger.info("✅ Server started successfully!")

if __name__ == "__main__":
   import uvicorn
   uvicorn.run(app, host="0.0.0.0", port=8000)
