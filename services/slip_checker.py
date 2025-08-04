import logging
import requests
import hashlib
import time
from typing import Dict, Any, Optional
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry
from utils.config_manager import config_manager

logger = logging.getLogger("slip_checker_service")

def create_requests_session():
    """สร้าง requests session พร้อม retry strategy"""
    session = requests.Session()
    
    # ตั้งค่า retry strategy
    retry_strategy = Retry(
        total=3,  # จำนวนครั้งที่จะลองใหม่
        backoff_factor=1,  # เวลารอระหว่างการลองใหม่
        status_forcelist=[429, 500, 502, 503, 504],  # HTTP status ที่จะลองใหม่
        allowed_methods=["POST"]  # วิธีการที่อนุญาตให้ retry
    )
    
    # ตั้งค่า adapter พร้อม retry
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    
    return session

def verify_slip_with_thunder(
    message_id: str,
    test_image_data: Optional[bytes] = None,
    check_duplicate: Optional[bool] = None,
) -> Dict[str, Any]:
    """
    ตรวจสอบสลิปด้วย Thunder API v1 (ปรับปรุงตามเอกสาร API)
    """
    # ตรวจสอบว่าระบบเปิดใช้งานฟังก์ชันตรวจสอบสลิปหรือไม่
    if not config_manager.get("slip_enabled"):
        return {"status": "error", "message": "ระบบตรวจสอบสลิปถูกปิดอยู่"}

    # โหลดค่า configuration ที่จำเป็น
    api_token: str = config_manager.get("thunder_api_token", "").strip()
    line_token: str = config_manager.get("line_channel_access_token", "").strip()
    wallet_phone: str = config_manager.get("wallet_phone_number", "").strip()

    # ตรวจสอบว่าได้ตั้งค่า Thunder API Token แล้วหรือไม่
    if not api_token:
        logger.error("THUNDER_API_TOKEN is missing or empty.")
        return {
            "status": "error",
            "message": "ยังไม่ได้ตั้งค่า Thunder API Token หรือ Token ไม่ถูกต้อง",
        }

    # ดาวน์โหลดภาพจาก LINE (ถ้าไม่ได้ส่ง test_image_data มา)
    image_data = test_image_data
    if not test_image_data and message_id:
        if not line_token:
            logger.error("LINE_CHANNEL_ACCESS_TOKEN is missing.")
            return {
                "status": "error",
                "message": "ยังไม่ได้ตั้งค่า LINE Channel Access Token",
            }
        
        try:
            # ใช้ session พร้อม retry สำหรับดาวน์โหลดรูป
            session = create_requests_session()
            url = f"https://api-data.line.me/v2/bot/message/{message_id}/content"
            headers = {"Authorization": f"Bearer {line_token}"}
            resp = session.get(url, headers=headers, timeout=30)
            resp.raise_for_status()
            image_data = resp.content
            logger.info(f"✅ ดาวน์โหลดรูปจาก LINE สำเร็จ: {len(image_data)} bytes")
            session.close()
        except Exception as e:
            logger.exception("❌ ดาวน์โหลดรูปภาพจาก LINE ไม่สำเร็จ: %s", e)
            return {"status": "error", "message": f"ไม่สามารถดาวน์โหลดรูปจาก LINE ได้: {str(e)}"}

    if not image_data:
        return {"status": "error", "message": "ไม่พบข้อมูลรูปภาพ"}

    # สร้าง unique identifier สำหรับรูปภาพ
    if message_id:
        unique_id = f"{message_id}_{int(time.time())}"
    else:
        image_hash = hashlib.md5(image_data).hexdigest()[:8]
        unique_id = f"test_{image_hash}_{int(time.time())}"

    # ใช้ Base URL และ endpoint ที่ถูกต้องตามเอกสาร Thunder API
    base_url = "https://api.thunder.in.th/v1"
    
    # ใช้ endpoint ตามเอกสาร API
    if wallet_phone:
        endpoint = f"{base_url}/verify/truewallet"  # สำหรับ TrueWallet
        logger.info(f"🔍 ใช้ TrueWallet verification สำหรับเบอร์: {wallet_phone}")
    else:
        endpoint = f"{base_url}/verify"  # สำหรับธนาคาร
        logger.info("🔍 ใช้ Bank slip verification")

    # ตั้งค่า headers ตามเอกสาร API
    headers = {
        "Authorization": f"Bearer {api_token}",
        "User-Agent": "LINE-OA-Middleware/1.0"
        # Content-Type จะถูกตั้งค่าอัตโนมัติสำหรับ multipart/form-data
    }

    # เตรียมไฟล์สำหรับส่ง
    files = {
        "file": (f"slip_{unique_id}.jpg", image_data, "image/jpeg")
    }

    # เตรียม form data
    data = {}
    
    # เพิ่ม checkDuplicate parameter ตามเอกสาร API
    if check_duplicate is not False:
        data["checkDuplicate"] = "true"
    else:
        data["checkDuplicate"] = "false"
    
    # เพิ่มข้อมูล wallet_phone สำหรับ TrueWallet (ถ้ามี)
    if wallet_phone:
        data["wallet_phone"] = wallet_phone

    # สร้าง session ใหม่สำหรับ Thunder API
    session = create_requests_session()
    
    try:
        logger.info(f"🚀 ส่งคำขอไปยัง Thunder API: {endpoint}")
        logger.info(f"📋 Form Data: {data}")
        
        # ส่งคำขอพร้อม improved error handling
        resp = session.post(
            endpoint, 
            headers=headers, 
            files=files, 
            data=data, 
            timeout=60  # เพิ่ม timeout เป็น 60 วินาที
        )
        
        logger.info(f"📈 Thunder API Response: {resp.status_code}")
        logger.info(f"📈 Content-Length: {resp.headers.get('Content-Length', 'Unknown')}")
        
        # พยายาม parse JSON response
        try:
            result = resp.json()
            logger.info(f"📄 Response parsed successfully - Status: {result.get('status')}")
        except ValueError as e:
            logger.error(f"❌ ไม่สามารถ parse JSON response: {e}")
            logger.error(f"📄 Raw Response (first 500 chars): {resp.text[:500]}")
            return {
                "status": "error",
                "message": f"Thunder API ตอบกลับข้อมูลที่ไม่ถูกต้อง (HTTP {resp.status_code})",
            }
        
        # ตรวจสอบ HTTP status code และจัดการตามเอกสาร API
        if resp.status_code == 200:
            # สำเร็จ - ตรวจสอบ status field
            if result.get("status") == 200:
                logger.info("✅ Thunder API successful!")
                
                # ดึงข้อมูลที่เกี่ยวข้อง
                data_response = result.get("data", {})
                
                if not data_response:
                    logger.warning("⚠️ Thunder API response ไม่มีข้อมูลใน data field")
                    return {"status": "error", "message": "ไม่พบข้อมูลสลิปในการตอบกลับจาก Thunder API"}

                # จัดรูปแบบข้อมูลตามโครงสร้าง API ใหม่
                amount_data = data_response.get("amount", {})
                amount_value = amount_data.get("amount", 0) if isinstance(amount_data, dict) else 0
                
                sender_info = data_response.get("sender", {})
                receiver_info = data_response.get("receiver", {})
                
                # ดึงชื่อผู้ส่งและผู้รับ
                sender_name = ""
                if isinstance(sender_info, dict) and "account" in sender_info:
                    sender_account = sender_info.get("account", {})
                    sender_name_data = sender_account.get("name", {})
                    if isinstance(sender_name_data, dict):
                        sender_name = sender_name_data.get("th", "") or sender_name_data.get("en", "")
                
                receiver_name = ""
                if isinstance(receiver_info, dict) and "account" in receiver_info:
                    receiver_account = receiver_info.get("account", {})
                    receiver_name_data = receiver_account.get("name", {})
                    if isinstance(receiver_name_data, dict):
                        receiver_name = receiver_name_data.get("th", "") or receiver_name_data.get("en", "")
                
                # ดึงข้อมูลธนาคาร
                sender_bank = ""
                receiver_bank = ""
                if isinstance(sender_info, dict) and "bank" in sender_info:
                    sender_bank = sender_info.get("bank", {}).get("short", "")
                if isinstance(receiver_info, dict) and "bank" in receiver_info:
                    receiver_bank = receiver_info.get("bank", {}).get("short", "")

                return {
                    "status": "success",
                    "type": "thunder",
                    "data": {
                        "amount": str(amount_value),
                        "date": data_response.get("date", ""),
                        "time": data_response.get("date", "")[:19] if data_response.get("date") else "",  # แยกเวลาจาก ISO datetime
                        "sender_bank": sender_bank,
                        "receiver_bank": receiver_bank,
                        "sender": sender_name,
                        "receiver_name": receiver_name,
                        "reference": data_response.get("transRef", unique_id),
                        "verified_by": "Thunder API (Bank)" if not wallet_phone else "Thunder API (TrueWallet)",
                        "raw_data": data_response  # เก็บข้อมูลเต็มไว้สำหรับ debug
                    },
                }
            else:
                # API ตอบกลับแล้วแต่ status ไม่ใช่ 200
                error_msg = result.get("message", "ตรวจสอบสลิปไม่สำเร็จ")
                logger.warning(f"❌ Thunder API returned non-200 status: {error_msg}")
                return {"status": "error", "message": f"Thunder API: {error_msg}"}
        
        elif resp.status_code == 400:
            # Bad Request - จัดการตามเอกสาร API
            error_msg = result.get("message", "Bad Request")
            
            if error_msg == "duplicate_slip":
                logger.info(f"🔄 Thunder API duplicate slip detected")
                
                # ดึงข้อมูลสลิปซ้ำถ้ามี
                duplicate_data = result.get("data", {})
                amount_data = duplicate_data.get("amount", {}) if duplicate_data else {}
                amount_value = amount_data.get("amount", 0) if isinstance(amount_data, dict) else 0
                
                return {
                    "status": "duplicate",
                    "message": "🔄 สลิปนี้เคยถูกตรวจสอบแล้ว",
                    "data": {
                        "amount": str(amount_value),
                        "date": duplicate_data.get("date", "") if duplicate_data else "",
                        "reference": duplicate_data.get("transRef", "") if duplicate_data else "",
                        "verified_by": "Thunder API (Duplicate)"
                    },
                    "original_message": error_msg
                }
            elif error_msg == "invalid_payload":
                return {"status": "error", "message": "📷 ไม่สามารถอ่านข้อมูลจากสลิปได้ กรุณาถ่ายรูปสลิปให้ชัดเจนขึ้น"}
            elif error_msg == "invalid_image":
                return {"status": "error", "message": "🖼️ รูปภาพไม่ถูกต้อง กรุณาส่งรูปสลิปธนาคารที่ชัด"}
            elif error_msg == "image_size_too_large":
                return {"status": "error", "message": "📏 ขนาดรูปภาพใหญ่เกินไป กรุณาลดขนาดรูปแล้วลองใหม่"}
            elif error_msg == "invalid_check_duplicate":
                return {"status": "error", "message": "⚙️ พารามิเตอร์ checkDuplicate ไม่ถูกต้อง"}
            else:
                return {"status": "error", "message": f"❌ Thunder API: {error_msg}"}
        
        elif resp.status_code == 401:
            return {"status": "error", "message": "🔑 Thunder API Token ไม่ถูกต้องหรือหมดอายุ กรุณาตรวจสอบการตั้งค่า"}
        
        elif resp.status_code == 403:
            error_msg = result.get("message", "access_denied")
            
            if error_msg == "access_denied":
                return {"status": "error", "message": "🚫 ไม่มีสิทธิ์เข้าถึง Thunder API กรุณาติดต่อทีมสนับสนุน"}
            elif error_msg == "account_not_verified":
                return {"status": "error", "message": "⚠️ บัญชียังไม่ได้รับการยืนยัน กรุณาทำ KYC หรือติดต่อทีมสนับสนุน"}
            elif error_msg == "application_expired":
                return {"status": "error", "message": "⏰ แอปพลิเคชันหมดอายุ กรุณาต่ออายุแพ็กเกจหรือติดต่อทีมสนับสนุน"}
            elif error_msg == "application_deactivated":
                return {"status": "error", "message": "🔒 แอปพลิเคชันถูกปิดใช้งาน กรุณาติดต่อทีมสนับสนุน Thunder Solution"}
            elif error_msg == "quota_exceeded":
                return {"status": "error", "message": "📊 ใช้งาน API เกินโควต้าที่กำหนด กรุณาอัปเกรดแพ็กเกจหรือรอโควต้ารีเซ็ต"}
            else:
                return {"status": "error", "message": f"🚫 Thunder API Forbidden: {error_msg}"}
        
        elif resp.status_code == 404:
            error_msg = result.get("message", "not_found")
            
            if error_msg == "slip_not_found":
                return {
                    "status": "not_found", 
                    "message": "🔍 ไม่พบข้อมูลสลิปในระบบธนาคาร\n\n💡 สาเหตุที่เป็นไปได้:\n• สลิปอาจเป็นสลิปปลอม\n• ข้อมูลในสลิปไม่ครบถ้วน\n• สลิปยังไม่อัปเดตในระบบธนาคาร"
                }
            elif error_msg == "qrcode_not_found":
                return {
                    "status": "qr_not_found", 
                    "message": "📱 ไม่พบ QR Code ในรูปภาพ\n\n💡 คำแนะนำ:\n• ถ่ายรูปสลิปให้เห็น QR Code ชัดเจน\n• ตรวจสอบว่า QR Code ไม่ถูกบดบัง\n• ลองถ่ายรูปใหม่ในที่ที่มีแสงเพียงพอ"
                }
            else:
                return {"status": "error", "message": f"🔍 Thunder API Not Found: {error_msg}"}
        
        elif resp.status_code == 429:
            return {"status": "error", "message": "⏳ ใช้งาน Thunder API เกินจำนวนที่กำหนด กรุณารอสักครู่แล้วลองใหม่"}
        
        elif resp.status_code >= 500:
            error_msg = result.get("message", "server_error")
            
            if error_msg == "server_error":
                return {"status": "error", "message": "🔧 เซิร์ฟเวอร์ Thunder API มีปัญหา กรุณาลองใหม่อีกสักครู่"}
            elif error_msg == "api_server_error":
                return {"status": "error", "message": "⚙️ ระบบ Thunder API ขัดข้อง กรุณาลองใหม่หรือติดต่อทีมสนับสนุน"}
            else:
                return {"status": "error", "message": f"🔧 Thunder API Server Error: {error_msg}"}
        
        else:
            error_message = result.get("message", f"HTTP {resp.status_code} Error")
            return {"status": "error", "message": f"❌ Thunder API Error: {error_message}"}

    except requests.exceptions.ChunkedEncodingError as e:
        logger.error("❌ Thunder API chunked encoding error: %s", e)
        return {"status": "error", "message": "🔄 การตอบกลับจาก Thunder API ไม่สมบูรณ์ กรุณาลองใหม่"}
    
    except requests.exceptions.ConnectionError as e:
        logger.error("❌ Thunder API connection error: %s", e)
        return {"status": "error", "message": "🌐 ไม่สามารถเชื่อมต่อกับ Thunder API ได้ กรุณาตรวจสอบอินเทอร์เน็ต"}
    
    except requests.exceptions.Timeout as e:
        logger.error("❌ Thunder API timeout: %s", e)
        return {"status": "error", "message": "⏰ Thunder API ตอบสนองช้าเกินไป กรุณาลองใหม่อีกครั้ง"}
    
    except requests.exceptions.RequestException as e:
        logger.exception("❌ Thunder API request error: %s", e)
        return {"status": "error", "message": f"🔗 เกิดข้อผิดพลาดในการเชื่อมต่อ Thunder API: {str(e)}"}
    
    except Exception as e:
        logger.exception("❌ Unexpected error: %s", e)
        return {"status": "error", "message": f"💥 เกิดข้อผิดพลาดไม่คาดคิด: {str(e)}"}
    
    finally:
        # ปิด session เสมอ
        try:
            session.close()
        except:
            pass
