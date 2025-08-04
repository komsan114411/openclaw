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
            # ตรวจสอบสลิป
            logger.info(f"📷 ได้รับรูปภาพจากผู้ใช้ {user_id}")
            result = verify_slip_multiple_providers(message.get("id"))
            
            if result["status"] == "success":
                # ส่ง Flex message และบันทึกประวัติขาออก
                logger.info(f"✅ ตรวจสอบสลิปสำเร็จด้วย {result.get('type', 'unknown')} API")
                save_chat_history(user_id, "out", {"type": "flex", "content": result["data"]}, sender="slip_bot")
                send_line_flex_reply(reply_token, result["data"])
            else:
                # ส่งข้อความ error พร้อมคำแนะนำ
                error_message = result["message"]
                if result.get("suggestions"):
                    error_message += "\n\n💡 คำแนะนำ:\n• " + "\n• ".join(result["suggestions"][:3])  # แสดงแค่ 3 คำแนะนำแรก
                
                logger.warning(f"❌ ตรวจสอบสลิปล้มเหลว: {result['message']}")
                save_chat_history(user_id, "out", {"type": "text", "text": error_message}, sender="slip_bot")
                send_line_reply(reply_token, error_message)
                
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
                    # ส่งข้อความ error พร้อมคำแนะนำ
                    error_message = result["message"]
                    if result.get("suggestions"):
                        error_message += "\n\n💡 ลองทำตามนี้:\n• " + "\n• ".join(result["suggestions"][:2])
                    
                    logger.warning(f"❌ ตรวจสอบสลิปจากข้อความล้มเหลว: {result['message']}")
                    save_chat_history(user_id, "out", {"type": "text", "text": error_message}, sender="slip_bot")
                    send_line_reply(reply_token, error_message)
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
            # ใช้ base URL ที่ถูกต้องตามเอกสาร
            headers = {"Authorization": f"Bearer {thunder_token}"}
            resp = requests.get("https://api.thunder.in.th/v1",
                                headers=headers, timeout=10)
            
            # Thunder API จะตอบ status code ต่างๆ ตามสถานะ
            if resp.status_code in (200, 401, 404, 405):  # 405 = Method Not Allowed แต่ server ตอบสนอง
                status_result["thunder"]["connected"] = True
                logger.info(f"Thunder API test - Status: {resp.status_code}")
                
            # พยายามดึงข้อมูลเพิ่มเติมจาก response
            try:
                data = resp.json()
                if isinstance(data, dict):
                    if "balance" in data:
                        status_result["thunder"]["balance"] = data.get("balance", 0)
                    if data.get("message"):
                        status_result["thunder"]["message"] = data.get("message")
            except Exception:
                # ไม่สามารถ decode JSON ได้ หรือไม่มี JSON response
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

@app.get("/admin/api-health")
async def get_api_health():
    """ตรวจสอบสุขภาพ API และสถานะ Fallback"""
    try:
        status_summary = get_api_status_summary()
        
        # คำนวณคะแนนสุขภาพโดยรวม
        total_apis = 0
        healthy_apis = 0
        
        for api_name, api_info in status_summary.items():
            if api_info.get("enabled") and api_info.get("configured"):
                total_apis += 1
                if api_info.get("recent_failures", 0) < 3:  # น้อยกว่า 3 ครั้งล้มเหลวถือว่าดี
                    healthy_apis += 1
        
        health_score = (healthy_apis / total_apis * 100) if total_apis > 0 else 0
        
        return JSONResponse(content={
            "status": "healthy" if health_score >= 50 else "degraded" if health_score > 0 else "critical",
            "health_score": health_score,
            "apis": status_summary,
            "recommendations": _get_health_recommendations(status_summary)
        })
        
    except Exception as e:
        logger.error(f"Error getting API health: {e}")
        return JSONResponse(content={
            "status": "error",
            "message": str(e)
        })

def _get_health_recommendations(status_summary: Dict[str, Any]) -> list:
    """ให้คำแนะนำการปรับปรุงระบบ"""
    recommendations = []
    
    for api_name, api_info in status_summary.items():
        if not api_info.get("enabled"):
            recommendations.append(f"เปิดใช้งาน {api_name.upper()} API เพื่อเพิ่มความน่าเชื่อถือ")
        elif not api_info.get("configured"):
            recommendations.append(f"ตั้งค่า credentials สำหรับ {api_name.upper()} API")
        elif api_info.get("recent_failures", 0) >= 3:
            recommendations.append(f"ตรวจสอบการตั้งค่า {api_name.upper()} API - มีการล้มเหลวหลายครั้ง")
    
    if not recommendations:
        recommendations.append("ระบบทำงานปกติ - ไม่มีคำแนะนำเพิ่มเติม")
    
    return recommendations

@app.post("/admin/test-thunder")
async def test_thunder_api():
    """ทดสอบการเชื่อมต่อ Thunder API แบบละเอียด"""
    api_token = config_manager.get("thunder_api_token")
    if not api_token:
        return JSONResponse(content={"status": "error",
                                     "message": "ยังไม่ได้ตั้งค่า Thunder API Token"})

    try:
        # ทดสอบ endpoint หลัก
        headers = {"Authorization": f"Bearer {api_token}"}
        
        # ลองเรียก API เพื่อทดสอบการเชื่อมต่อ
        test_url = "https://api.thunder.in.th/v1"
        resp = requests.get(test_url, headers=headers, timeout=10)
        
        logger.info(f"Thunder API Test - Status: {resp.status_code}")
        logger.info(f"Thunder API Test - Response: {resp.text[:200]}")
        
        # ประเมินผลการทดสอบ
        if resp.status_code in [200, 401, 404, 405]:
            # API ตอบสนอง แม้จะเป็น error code แต่แสดงว่าเชื่อมต่อได้
            success_message = f"เชื่อมต่อ Thunder API สำเร็จ (HTTP {resp.status_code})"
            if resp.status_code == 401:
                success_message += " - Token อาจไม่ถูกต้องหรือหมดอายุ"
            elif resp.status_code == 404:
                success_message += " - Endpoint พร้อมใช้งาน"
            elif resp.status_code == 405:
                success_message += " - Server ตอบสนอง (Method Not Allowed)"
                
            return JSONResponse(content={
                "status": "success",
                "message": success_message,
                "details": {
                    "status_code": resp.status_code,
                    "headers": dict(resp.headers),
                    "response_preview": resp.text[:500] if resp.text else "No response body",
                    "endpoint_tested": test_url
                }
            })
        else:
            return JSONResponse(content={
                "status": "error",
                "message": f"Thunder API Error: HTTP {resp.status_code}",
                "details": {
                    "status_code": resp.status_code,
                    "response_preview": resp.text[:500] if resp.text else "No response body",
                    "endpoint_tested": test_url
                }
            })
        
    except Exception as e:
        logger.error(f"Thunder API Test Error: {e}")
        return JSONResponse(content={
            "status": "error",
            "message": f"Thunder API Test Error: {str(e)}"
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

@app.post("/admin/test-slip-text")
async def test_slip_text(request: Request):
    """ทดสอบการตรวจสอบสลิปจากข้อความ"""
    try:
        data = await request.json()
        text = data.get("text", "").strip()
        
        if not text:
            return JSONResponse(content={"status": "error", "message": "ไม่พบข้อความ"})
        
        # ดึงข้อมูลจากข้อความ
        slip_info = extract_slip_info_from_text(text)
        
        if slip_info["bank_code"] and slip_info["trans_ref"]:
            # ทดสอบการตรวจสอบ
            result = verify_slip_multiple_providers(
                None, None,
                slip_info["bank_code"],
                slip_info["trans_ref"]
            )
            
            return JSONResponse(content={
                "status": result["status"],
                "message": result["message"] if result["status"] == "error" else f"ตรวจสอบสำเร็จด้วย {result.get('type', 'unknown')} API",
                "extracted": slip_info,
                "response": result
            })
        else:
            return JSONResponse(content={
                "status": "error",
                "message": "ไม่พบข้อมูลธนาคารหรือหมายเลขอ้างอิงในข้อความ",
                "extracted": slip_info
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
