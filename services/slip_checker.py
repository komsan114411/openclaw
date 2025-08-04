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

def format_thai_datetime(iso_datetime: str) -> Dict[str, str]:
    """แปลง ISO datetime เป็นรูปแบบไทย"""
    try:
        from datetime import datetime
        dt = datetime.fromisoformat(iso_datetime.replace('Z', '+00:00'))
        
        # แปลงเป็นเวลาไทย (UTC+7)
        import pytz
        thai_tz = pytz.timezone('Asia/Bangkok')
        thai_dt = dt.astimezone(thai_tz)
        
        return {
            "date": thai_dt.strftime("%d/%m/%Y"),
            "time": thai_dt.strftime("%H:%M:%S"),
            "full": thai_dt.strftime("%d/%m/%Y %H:%M:%S")
        }
    except Exception as e:
        logger.warning(f"Date parsing error: {e}")
        return {
            "date": iso_datetime.split('T')[0] if 'T' in iso_datetime else iso_datetime,
            "time": iso_datetime.split('T')[1][:8] if 'T' in iso_datetime else "",
            "full": iso_datetime
        }

def extract_account_info(account_data: Dict) -> Dict[str, str]:
    """ดึงข้อมูลบัญชีจาก account object"""
    info = {
        "name_th": "",
        "name_en": "",
        "account_number": "",
        "account_type": "",
        "proxy_type": "",
        "proxy_account": ""
    }
    
    if not isinstance(account_data, dict):
        return info
    
    # ดึงชื่อ
    name_data = account_data.get("name", {})
    if isinstance(name_data, dict):
        info["name_th"] = name_data.get("th", "")
        info["name_en"] = name_data.get("en", "")
    
    # ดึงข้อมูลบัญชี
    bank_data = account_data.get("bank", {})
    if isinstance(bank_data, dict):
        info["account_type"] = bank_data.get("type", "")
        info["account_number"] = bank_data.get("account", "")
    
    # ดึงข้อมูล proxy
    proxy_data = account_data.get("proxy", {})
    if isinstance(proxy_data, dict):
        info["proxy_type"] = proxy_data.get("type", "")
        info["proxy_account"] = proxy_data.get("account", "")
    
    return info

def format_amount(amount_data: Any) -> Dict[str, str]:
    """จัดรูปแบบจำนวนเงิน"""
    try:
        if isinstance(amount_data, dict):
            amount_value = amount_data.get("amount", 0)
        else:
            amount_value = amount_data or 0
        
        amount_float = float(amount_value)
        
        return {
            "raw": str(amount_value),
            "formatted": f"{amount_float:,.0f}",
            "with_currency": f"฿{amount_float:,.0f}"
        }
    except Exception as e:
        logger.warning(f"Amount formatting error: {e}")
        return {
            "raw": str(amount_data),
            "formatted": str(amount_data),
            "with_currency": f"฿{amount_data}"
        }

def verify_slip_with_thunder(
    message_id: str,
    test_image_data: Optional[bytes] = None,
    check_duplicate: Optional[bool] = None,
) -> Dict[str, Any]:
    """
    ตรวจสอบสลิปด้วย Thunder API v1 (ปรับปรุงให้แสดงรายละเอียดครบถ้วน)
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
    endpoint = f"{base_url}/verify"  # ใช้ endpoint ตามเอกสาร
    
    logger.info(f"🔍 ใช้ Thunder API verification endpoint: {endpoint}")

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

                # ประมวลผลข้อมูลตามโครงสร้าง API ใหม่
                datetime_info = format_thai_datetime(data_response.get("date", ""))
                amount_info = format_amount(data_response.get("amount", {}))
                
                # ดึงข้อมูลผู้ส่งและผู้รับ
                sender_info = data_response.get("sender", {})
                receiver_info = data_response.get("receiver", {})
                
                # ดึงข้อมูลธนาคาร
                sender_bank = sender_info.get("bank", {}) if isinstance(sender_info, dict) else {}
                receiver_bank = receiver_info.get("bank", {}) if isinstance(receiver_info, dict) else {}
                
                # ดึงข้อมูลบัญชี
                sender_account = extract_account_info(sender_info.get("account", {})) if isinstance(sender_info, dict) else {}
                receiver_account = extract_account_info(receiver_info.get("account", {})) if isinstance(receiver_info, dict) else {}

                # สร้าง response ที่มีรายละเอียดครบถ้วน
                return {
                    "status": "success",
                    "type": "thunder",
                    "data": {
                        # ข้อมูลพื้นฐาน
                        "amount": amount_info["raw"],
                        "amount_formatted": amount_info["formatted"],
                        "amount_display": amount_info["with_currency"],
                        "date": datetime_info["date"],
                        "time": datetime_info["time"],
                        "datetime_full": datetime_info["full"],
                        "reference": data_response.get("transRef", unique_id),
                        "country_code": data_response.get("countryCode", "TH"),
                        
                        # ข้อมูลธนาคารผู้ส่ง
                        "sender_bank_id": sender_bank.get("id", ""),
                        "sender_bank_name": sender_bank.get("name", ""),
                        "sender_bank_short": sender_bank.get("short", ""),
                        
                        # ข้อมูลผู้ส่ง
                        "sender_name_th": sender_account.get("name_th", ""),
                        "sender_name_en": sender_account.get("name_en", ""),
                        "sender_account_number": sender_account.get("account_number", ""),
                        "sender_account_type": sender_account.get("account_type", ""),
                        
                        # ข้อมูลธนาคารผู้รับ
                        "receiver_bank_id": receiver_bank.get("id", ""),
                        "receiver_bank_name": receiver_bank.get("name", ""),
                        "receiver_bank_short": receiver_bank.get("short", ""),
                        
                        # ข้อมูลผู้รับ
                        "receiver_name_th": receiver_account.get("name_th", ""),
                        "receiver_name_en": receiver_account.get("name_en", ""),
                        "receiver_account_number": receiver_account.get("account_number", ""),
                        "receiver_account_type": receiver_account.get("account_type", ""),
                        "receiver_proxy_type": receiver_account.get("proxy_type", ""),
                        "receiver_proxy_account": receiver_account.get("proxy_account", ""),
                        
                        # ข้อมูลเพิ่มเติม
                        "fee": data_response.get("fee", 0),
                        "ref1": data_response.get("ref1", ""),
                        "ref2": data_response.get("ref2", ""),
                        "ref3": data_response.get("ref3", ""),
                        
                        # ข้อมูลสำหรับแสดงผล (backward compatibility)
                        "sender": sender_account.get("name_th", "") or sender_account.get("name_en", ""),
                        "receiver_name": receiver_account.get("name_th", "") or receiver_account.get("name_en", ""),
                        "sender_bank": sender_bank.get("short", ""),
                        "receiver_bank": receiver_bank.get("short", ""),
                        
                        "verified_by": "Thunder API",
                        "verification_time": datetime.now().isoformat(),
                        
                        # Raw data สำหรับ debug
                        "raw_data": data_response
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
                if duplicate_data:
                    # ประมวลผลข้อมูลสลิปซ้ำเหมือนกับสลิปปกติ
                    datetime_info = format_thai_datetime(duplicate_data.get("date", ""))
                    amount_info = format_amount(duplicate_data.get("amount", {}))
                    
                    sender_info = duplicate_data.get("sender", {})
                    receiver_info = duplicate_data.get("receiver", {})
                    
                    sender_bank = sender_info.get("bank", {}) if isinstance(sender_info, dict) else {}
                    receiver_bank = receiver_info.get("bank", {}) if isinstance(receiver_info, dict) else {}
                    
                    sender_account = extract_account_info(sender_info.get("account", {})) if isinstance(sender_info, dict) else {}
                    receiver_account = extract_account_info(receiver_info.get("account", {})) if isinstance(receiver_info, dict) else {}
                    
                    return {
                        "status": "duplicate",
                        "message": "🔄 สลิปนี้เคยถูกตรวจสอบแล้ว",
                        "data": {
                            "amount": amount_info["raw"],
                            "amount_formatted": amount_info["formatted"],
                            "amount_display": amount_info["with_currency"],
                            "date": datetime_info["date"],
                            "time": datetime_info["time"],
                            "datetime_full": datetime_info["full"],
                            "reference": duplicate_data.get("transRef", ""),
                            
                            "sender_name_th": sender_account.get("name_th", ""),
                            "sender_name_en": sender_account.get("name_en", ""),
                            "receiver_name_th": receiver_account.get("name_th", ""),
                            "receiver_name_en": receiver_account.get("name_en", ""),
                            
                            "sender_bank_name": sender_bank.get("name", ""),
                            "sender_bank_short": sender_bank.get("short", ""),
                            "receiver_bank_name": receiver_bank.get("name", ""),
                            "receiver_bank_short": receiver_bank.get("short", ""),
                            
                            # ข้อมูลสำหรับแสดงผล
                            "sender": sender_account.get("name_th", "") or sender_account.get("name_en", ""),
                            "receiver_name": receiver_account.get("name_th", "") or receiver_account.get("name_en", ""),
                            "sender_bank": sender_bank.get("short", ""),
                            "receiver_bank": receiver_bank.get("short", ""),
                            
                            "verified_by": "Thunder API (Duplicate)"
                        },
                        "original_message": error_msg
                    }
                else:
                    return {
                        "status": "duplicate",
                        "message": "🔄 สลิปนี้เคยถูกตรวจสอบแล้ว",
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
