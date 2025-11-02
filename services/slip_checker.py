# services/slip_checker.py
import logging
import requests
import hashlib
import time
from datetime import datetime
from typing import Dict, Any, Optional
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry
from utils.config_manager import config_manager

logger = logging.getLogger("slip_checker_service")

def create_requests_session():
    """สร้าง requests session พร้อม retry strategy"""
    session = requests.Session()
    retry_strategy = Retry(
        total=3,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["POST"]
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session

def format_thai_datetime(iso_datetime: str) -> Dict[str, str]:
    """แปลง ISO datetime เป็นรูปแบบไทย"""
    try:
        from datetime import datetime
        import pytz
        dt = datetime.fromisoformat(iso_datetime.replace('Z', '+00:00'))
        thai_tz = pytz.timezone('Asia/Bangkok')
        thai_dt = dt.astimezone(thai_tz)
        return {
            "date": thai_dt.strftime("%d/%m/%Y"),
            "time": thai_dt.strftime("%H:%M:%S"),
            "full": thai_dt.strftime("%d/%m/%Y %H:%M:%S")
        }
    except Exception as e:
        logger.warning(f"Date parsing error: {e}")
        # Fallback parsing
        if 'T' in iso_datetime:
            date_part = iso_datetime.split('T')[0]
            time_part = iso_datetime.split('T')[1][:8]
            return {
                "date": date_part.replace('-', '/'),
                "time": time_part,
                "full": f"{date_part.replace('-', '/')} {time_part}"
            }
        return {
            "date": iso_datetime,
            "time": "",
            "full": iso_datetime
        }

def extract_account_info(account_data: Dict) -> Dict[str, str]:
    """ดึงข้อมูลบัญชีจาก account object ตาม Thunder API response structure"""
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
    # ดึงชื่อจาก name object
    name_data = account_data.get("name", {})
    if isinstance(name_data, dict):
        info["name_th"] = name_data.get("th", "")
        info["name_en"] = name_data.get("en", "")
    # ดึงข้อมูลบัญชีจาก bank object
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
    """จัดรูปแบบจำนวนเงินตาม Thunder API response structure"""
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
    *,
    line_token: Optional[str] = None,
    api_token: Optional[str] = None,
) -> Dict[str, Any]:
    """
    ตรวจสอบสลิปด้วย Thunder API v1 (อัปเดตตาม Thunder API Documentation)
    URL: https://api.thunder.in.th/v1/verify

    เพิ่มพารามิเตอร์ line_token และ api_token เพื่อรองรับการส่ง token แบบรายบัญชี
    ถ้าไม่ระบุจะ fallback ไปใช้ค่าใน config_manager เหมือนเดิม
    """
    # ตรวจสอบการตั้งค่า Thunder API แยกจากระบบสลิป
    thunder_enabled = config_manager.get("thunder_enabled", True)
    if not thunder_enabled:
        return {"status": "error", "message": "Thunder API ถูกปิดใช้งาน"}
    # ตรวจสอบว่าระบบสลิปโดยรวมเปิดอยู่หรือไม่
    slip_enabled = config_manager.get("slip_enabled", False)
    if not slip_enabled:
        return {"status": "error", "message": "ระบบตรวจสอบสลิปถูกปิดใช้งาน"}
    # โหลดค่า configuration ที่จำเป็น (ใช้ค่าที่ส่งมา override ถ้ามี)
    api_token = (api_token or config_manager.get("thunder_api_token", "")).strip()
    line_token = (line_token or config_manager.get("line_channel_access_token", "")).strip()
    # ตรวจสอบว่าได้ตั้งค่า Thunder API Token แล้วหรือไม่
    if not api_token:
        logger.error("Thunder API Token is missing or empty.")
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
    # ใช้ Thunder API endpoint ที่ถูกต้องตาม documentation
    endpoint = "https://api.thunder.in.th/v1/verify"
    logger.info(f"🔍 ใช้ Thunder API verification endpoint: {endpoint}")
    # ตั้งค่า headers ตาม Thunder API documentation
    headers = {
        "Authorization": f"Bearer {api_token}",
        "User-Agent": "LINE-OA-Middleware/2.0"
    }
    # เตรียมไฟล์สำหรับส่ง (ตาม Thunder API documentation)
    files = {
        "file": (f"slip_{unique_id}.jpg", image_data, "image/jpeg")
    }
    # เตรียม form data (ตาม Thunder API documentation)
    data = {}
    # เพิ่ม checkDuplicate parameter (optional)
    if check_duplicate is not False:
        data["checkDuplicate"] = "true"
    else:
        data["checkDuplicate"] = "false"
    # สร้าง session สำหรับ Thunder API
    session = create_requests_session()
    try:
        logger.info(f"🚀 ส่งคำขอไปยัง Thunder API: {endpoint}")
        logger.info(f"📋 Form Data: {data}")
        # ส่งคำขอตาม Thunder API documentation
        resp = session.post(
            endpoint,
            headers=headers,
            files=files,
            data=data,
            timeout=60
        )
        logger.info(f"📈 Thunder API Response: {resp.status_code}")
        logger.info(f"📈 Content-Length: {resp.headers.get('Content-Length', 'Unknown')}")
        # Parse JSON response
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
        # ตรวจสอบ HTTP status code ตาม Thunder API documentation
        if resp.status_code == 200:
            # HTTP 200 = Success
            if result.get("status") == 200:
                logger.info("✅ Thunder API verification successful!")
                # ดึงข้อมูลจาก response ตาม Thunder API structure
                data_response = result.get("data", {})
                if not data_response:
                    logger.warning("⚠️ Thunder API response ไม่มีข้อมูลใน data field")
                    return {"status": "error", "message": "ไม่พบข้อมูลสลิปในการตอบกลับจาก Thunder API"}
                # ประมวลผลข้อมูลตาม Thunder API response structure
                datetime_info = format_thai_datetime(data_response.get("date", ""))
                amount_info = format_amount(data_response.get("amount", {}))
                # ดึงข้อมูลผู้ส่งและผู้รับตาม Thunder API structure
                sender_info = data_response.get("sender", {})
                receiver_info = data_response.get("receiver", {})
                # ดึงข้อมูลธนาคาร
                sender_bank = sender_info.get("bank", {}) if isinstance(sender_info, dict) else {}
                receiver_bank = receiver_info.get("bank", {}) if isinstance(receiver_info, dict) else {}
                # ดึงข้อมูลบัญชี
                sender_account = extract_account_info(sender_info.get("account", {})) if isinstance(sender_info, dict) else {}
                receiver_account = extract_account_info(receiver_info.get("account", {})) if isinstance(receiver_info, dict) else {}
                # สร้าง response ที่มีรายละเอียดครบถ้วนตาม Thunder API structure
                return {
                    "status": "success",
                    "type": "thunder",
                    "data": {
                        # ข้อมูลพื้นฐานจาก Thunder API
                        "payload": data_response.get("payload", ""),
                        "transRef": data_response.get("transRef", ""),
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
                        "receiver_merchant_id": receiver_info.get("merchantId", ""),
                        # ข้อมูลเพิ่มเติมจาก Thunder API
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
            # HTTP 400 = Bad Request - จัดการตาม Thunder API documentation
            error_msg = result.get("message", "Bad Request")
            if error_msg == "duplicate_slip":
                logger.info(f"🔄 Thunder API duplicate slip detected")
                # ดึงข้อมูลสลิปซ้ำตาม Thunder API documentation
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
                            "transRef": duplicate_data.get("transRef", ""),
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
                return {"status": "error", "message": "📷 ไม่สามารถอ่านข้อมูลจากสลิปได้ กรุณาถ่ายรูปสลิปให้ชัดเจนแล้วลองใหม่"}
            elif error_msg == "invalid_image":
                return {"status": "error", "message": "🖼️ รูปภาพไม่ถูกต้อง กรุณาส่งรูปสลิปที่ชัดเจนและเป็นไฟล์ภาพที่รองรับ"}
            elif error_msg == "image_size_too_large":
                return {"status": "error", "message": "📏 ขนาดรูปภาพใหญ่เกินไป กรุณาลดขนาดรูปแล้วลองใหม่"}
            elif error_msg == "invalid_check_duplicate":
                return {"status": "error", "message": "⚙️ พารามิเตอร์ checkDuplicate ไม่ถูกต้อง"}
            else:
                return {"status": "error", "message": f"❌ Thunder API: {error_msg}"}
        elif resp.status_code == 401:
            # HTTP 401 = Unauthorized
            error_msg = result.get("message", "unauthorized")
            if error_msg == "unauthorized":
                return {"status": "error", "message": "🔑 Thunder API Token ไม่ถูกต้องหรือหมดอายุ กรุณาตรวจสอบการตั้งค่า"}
            else:
                return {"status": "error", "message": f"🔑 การยืนยันตัวตนล้มเหลว: {error_msg}"}
        elif resp.status_code == 403:
            # HTTP 403 = Forbidden - จัดการตาม Thunder API documentation
            error_msg = result.get("message", "access_denied")
            if error_msg == "access_denied":
                return {"status": "error", "message": "🚫 ไม่มีสิทธิ์เข้าถึง Thunder API กรุณาติดต่อทีมสนับสนุน"}
            elif error_msg == "account_not_verified":
                return {"status": "error", "message": "⚠️ บัญชียังไม่ได้รับการยืนยัน KYC กรุณาติดต่อทีมสนับสนุน"}
            elif error_msg == "application_expired":
                return {"status": "error", "message": "⏰ แอปพลิเคชันหมดอายุ กรุณาติดต่อทีมสนับสนุนหรืออัปเกรดแพ็กเกจ"}
            elif error_msg == "application_deactivated":
                return {"status": "error", "message": "🔒 แอปพลิเคชันถูกปิดใช้งาน กรุณาติดต่อทีมสนับสนุน Thunder"}
            elif error_msg == "quota_exceeded":
                return {"status": "error", "message": "📊 ใช้งาน API เกินโควต้าที่กำหนด กรุณาอัปเกรดแพ็กเกจหรือรอ"}
            else:
                return {"status": "error", "message": f"🚫 Thunder API Forbidden: {error_msg}"}
        elif resp.status_code == 404:
            # HTTP 404 = Not Found - จัดการตาม Thunder API documentation
            error_msg = result.get("message", "not_found")
            if error_msg == "slip_not_found":
                return {
                    "status": "not_found",
                    "message": "🔍 ไม่พบข้อมูลสลิปในระบบธนาคาร\n\n💡 สาเหตุที่เป็นไปได้:\n• สลิปไม่มีข้อมูลที่จำเป็นหรือรูปไม่ชัด\n• สลิปจากธนาคารที่ระบบยังไม่รองรับ\n\nโปรดถ่ายรูปใหม่หรือกรอกข้อมูลเพิ่มเติม"
                }
            elif error_msg == "qrcode_not_found":
                return {
                    "status": "qr_not_found",
                    "message": "📱 ไม่พบ QR Code ในรูปภาพ\n\n💡 คำแนะนำ:\n• ถ่ายรูปสลิปให้เห็น QR Code ชัดเจน\n• หลีกเลี่ยงเงาสะท้อนหรือการเบลอของภาพ"
                }
            else:
                return {"status": "error", "message": f"🔍 Thunder API Not Found: {error_msg}"}
        elif resp.status_code == 429:
            return {"status": "error", "message": "⏳ ใช้งาน Thunder API เกินจำนวนที่กำหนด กรุณารอสักครู่แล้วลองใหม่"}
        elif resp.status_code >= 500:
            # HTTP 500+ = Server Error - จัดการตาม Thunder API documentation
            error_msg = result.get("message", "server_error")
            if error_msg == "server_error":
                return {"status": "error", "message": "🔧 เซิร์ฟเวอร์ Thunder API มีปัญหา กรุณาลองใหม่อีกสักครู่"}
            elif error_msg == "api_server_error":
                return {"status": "error", "message": "⚙️ ระบบ Thunder API ขัดข้อง กรุณาลองใหม่หรือติดต่อทีมสนับสนุน"}
            else:
                return {"status": "error", "message": f"🔧 Thunder API Server Error: {error_msg}"}
        else:
            # HTTP status code อื่น ๆ
            error_message = result.get("message", f"HTTP {resp.status_code} Error")
            return {"status": "error", "message": f"❌ Thunder API Error: {error_message}"}
    except requests.exceptions.ChunkedEncodingError as e:
        logger.error("❌ Thunder API chunked encoding error: %s", e)
        return {"status": "error", "message": "🔄 การตอบกลับจาก Thunder API ไม่สมบูรณ์ กรุณาลองใหม่"}
    except requests.exceptions.ConnectionError as e:
        logger.error("❌ Thunder API connection error: %s", e)
        return {"status": "error", "message": "🌐 ไม่สามารถเชื่อมต่อกับ Thunder API ได้ กรุณาตรวจสอบอินเทอร์เน็ตหรือการตั้งค่าเครือข่าย"}
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

def test_thunder_api_connection(api_token: str) -> Dict[str, Any]:
    """ทดสอบการเชื่อมต่อ Thunder API"""
    if not api_token:
        return {"status": "error", "message": "API Token is required"}
    logger.info("🧪 Testing Thunder API connection...")
    # สร้าง test image data (minimal JPEG markers)
    # Keep this a valid bytes literal to avoid syntax/escape issues.
    test_image = b'\xff\xd8\xff\xd9'
    endpoint = "https://api.thunder.in.th/v1/verify"
    headers = {
        "Authorization": f"Bearer {api_token}",
        "User-Agent": "LINE-OA-Middleware-Test/2.0"
    }
    files = {
        "file": ("test.jpg", test_image, "image/jpeg")
    }
    data = {
        "checkDuplicate": "false"
    }
    try:
        session = create_requests_session()
        resp = session.post(endpoint, headers=headers, files=files, data=data, timeout=30)
        session.close()
        logger.info(f"🧪 Thunder API test response: {resp.status_code}")
        if resp.status_code in [200, 400, 404]:  # Expected responses
            try:
                result = resp.json()
                return {
                    "status": "success",
                    "message": "Thunder API connection successful",
                    "response_code": resp.status_code,
                    "api_message": result.get("message", "OK")
                }
            except:
                return {
                    "status": "success",
                    "message": "Thunder API connection successful (non-JSON response)",
                    "response_code": resp.status_code
                }
        elif resp.status_code == 401:
            return {"status": "error", "message": "Invalid API Token"}
        elif resp.status_code == 403:
            return {"status": "error", "message": "Access denied or quota exceeded"}
        else:
            return {"status": "error", "message": f"HTTP {resp.status_code}: {resp.text[:100]}"}
    except Exception as e:
        return {"status": "error", "message": f"Connection failed: {str(e)}"}

# ==================== SlipChecker Class ====================
class SlipChecker:
    """
    SlipChecker - Wrapper class for slip verification
    ใช้สำหรับตรวจสอบสลิปโอนเงิน
    """
    
    def __init__(self, api_token: str = None, line_token: str = None):
        """Initialize SlipChecker"""
        self.api_token = api_token
        self.line_token = line_token
        logger.info("✅ SlipChecker initialized")
    
    def verify(self, message_id: str = None, test_image_data: bytes = None) -> Dict[str, Any]:
        """Verify slip"""
        return verify_slip_with_thunder(
            message_id=message_id,
            test_image_data=test_image_data,
            line_token=self.line_token,
            api_token=self.api_token
        )
    
    def test_connection(self) -> Dict[str, Any]:
        """Test Thunder API connection"""
        if not self.api_token:
            return {"status": "error", "message": "API Token is required"}
        return test_thunder_api_connection(self.api_token)
