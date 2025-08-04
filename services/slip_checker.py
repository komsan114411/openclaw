import logging
import requests
import hashlib
import time
from typing import Dict, Any, Optional
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry
from utils.config_manager import config_manager

# ตั้งค่าตัว logger สำหรับบริการตรวจสอบสลิปของ Thunder
logger = logging.getLogger("slip_checker_service")


def create_requests_session():
    """สร้าง requests session พร้อม retry strategy"""
    session = requests.Session()

    # ตั้งค่า retry strategy สำหรับการเชื่อมต่อ HTTP
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
    ตรวจสอบสลิปด้วย Thunder API v1

    ฟังก์ชันนี้ดาวน์โหลดรูปสลิปจาก LINE (ถ้ากำหนด message_id) หรือนำข้อมูลรูปจาก test_image_data
    จากนั้นเรียก Thunder API เพื่อตรวจสอบข้อมูลสลิป โดยเลือก endpoint ให้ถูกต้องตามเอกสาร
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

    # สร้าง unique identifier สำหรับรูปภาพ เพื่อใช้กับการตรวจสอบ duplicate
    if message_id:
        unique_id = f"{message_id}_{int(time.time())}"
    else:
        image_hash = hashlib.md5(image_data).hexdigest()[:8]
        unique_id = f"test_{image_hash}_{int(time.time())}"

    # ใช้ Base URL ที่ถูกต้องตามเอกสาร Thunder API
    base_url = "https://api.thunder.in.th/v1"

    # กำหนด endpoint ตามประเภท: TrueWallet ใช้ verify/truewallet, ธนาคารทั่วไปใช้ verify
    if wallet_phone:
        endpoint = f"{base_url}/verify/truewallet"
        logger.info(f"🔍 ใช้ TrueWallet verification สำหรับเบอร์: {wallet_phone}")
    else:
        endpoint = f"{base_url}/verify"
        logger.info("🔍 ใช้ Bank slip verification")

    # ตั้งค่า headers ที่ปรับปรุงแล้ว
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Accept": "application/json",
        "User-Agent": "LINE-OA-Middleware/1.0",
        # กำหนดการปิดการเชื่อมต่อหลังใช้งานเพื่อหลีกเลี่ยง connection reset
        "Connection": "close",
        "Accept-Encoding": "gzip, deflate"
    }

    # เตรียมไฟล์สำหรับส่ง
    files = {
        "file": (f"slip_{unique_id}.jpg", image_data, "image/jpeg")
    }

    # เตรียมข้อมูลเพิ่มเติมสำหรับ body แบบ multipart/form-data
    data = {}
    if wallet_phone:
        # สำหรับ TrueWallet จะต้องส่งหมายเลขโทรศัพท์
        data["phone"] = wallet_phone
    # ปิดการตรวจสอบ duplicate เพื่อหลีกเลี่ยง false positive
    data["checkDuplicate"] = "false"
    # สำหรับการตรวจสอบสลิปธนาคาร ไม่ต้องส่ง reference ตามเอกสาร Thunder API

    # สร้าง session ใหม่สำหรับ Thunder API
    session = create_requests_session()

    try:
        logger.info(f"🚀 ส่งคำขอไปยัง Thunder API: {endpoint}")
        logger.info(f"📋 Parameters: {data}")

        # ส่งคำขอพร้อม improved error handling
        resp = session.post(
            endpoint,
            headers=headers,
            files=files,
            data=data,
            timeout=(30, 90),  # (connect timeout, read timeout)
            stream=False  # ไม่ใช้ streaming เพื่อหลีกเลี่ยงการตัดการเชื่อมต่อก่อนเวลาอันควร
        )

        logger.info(f"📈 Thunder API Response: {resp.status_code}")
        logger.info(f"📈 Content-Length: {resp.headers.get('Content-Length', 'Unknown')}")

        # ตรวจสอบว่า response มีขนาดตรงตาม Content-Length หรือไม่
        content_length = resp.headers.get('Content-Length')
        if content_length and len(resp.content) < int(content_length):
            logger.warning("⚠️ Response content shorter than expected")

        # พยายาม parse JSON response
        try:
            result = resp.json()
            logger.info(f"📄 Response parsed successfully")
        except ValueError as e:
            logger.error(f"❌ ไม่สามารถ parse JSON response: {e}")
            logger.error(f"📄 Raw Response: {resp.text[:500]}")
            return {
                "status": "error",
                "message": f"Thunder API ตอบกลับข้อมูลที่ไม่ถูกต้อง (HTTP {resp.status_code})",
            }

        # ตรวจสอบ HTTP status code
        if resp.status_code == 200:
            # ตรวจสอบ success field ตามรูปแบบการตอบกลับ
            if result.get("success", False):
                logger.info("✅ Thunder API successful!")

                # ดึงข้อมูลที่เกี่ยวข้อง
                data_response = result.get("data", {})

                if not data_response:
                    logger.warning("⚠️ Thunder API response ไม่มีข้อมูลใน data field")
                    return {"status": "error", "message": "ไม่พบข้อมูลสลิปในการตอบกลับจาก Thunder API"}

                # จัดรูปแบบข้อมูลตามประเภท
                if wallet_phone:
                    # TrueWallet response format
                    return {
                        "status": "success",
                        "type": "thunder",
                        "data": {
                            "amount": str(data_response.get("amount", "0")),
                            "date": data_response.get("date", ""),
                            "time": data_response.get("time", ""),
                            "sender": data_response.get("sender", {}).get("name", "")
                            if isinstance(data_response.get("sender"), dict)
                            else str(data_response.get("sender", "")),
                            "receiver_name": data_response.get("receiver", {}).get("name", "")
                            if isinstance(data_response.get("receiver"), dict)
                            else str(data_response.get("receiver", "")),
                            "receiver_phone": wallet_phone,
                            "reference": data_response.get("transRef", unique_id),
                            "verified_by": "Thunder API (TrueWallet)",
                        },
                    }
                else:
                    # Bank transfer response format
                    amount_value = data_response.get("amount", {})
                    if isinstance(amount_value, dict):
                        amount_str = str(amount_value.get("amount", "0"))
                    else:
                        amount_str = str(amount_value)

                    return {
                        "status": "success",
                        "type": "thunder",
                        "data": {
                            "amount": amount_str,
                            "date": data_response.get("date", ""),
                            "time": data_response.get("time", ""),
                            "sender_bank": data_response.get("sender", {}).get("bank", {}).get("short", "")
                            if isinstance(data_response.get("sender"), dict)
                            else "",
                            "receiver_bank": data_response.get("receiver", {}).get("bank", {}).get("short", "")
                            if isinstance(data_response.get("receiver"), dict)
                            else "",
                            "sender": data_response.get("sender", {}).get("name", "")
                            if isinstance(data_response.get("sender"), dict)
                            else str(data_response.get("sender", "")),
                            "receiver_name": data_response.get("receiver", {}).get("name", "")
                            if isinstance(data_response.get("receiver"), dict)
                            else str(data_response.get("receiver", "")),
                            "reference": data_response.get("transRef", unique_id),
                            "verified_by": "Thunder API (Bank)",
                        },
                    }
            else:
                # success = false
                error_msg = result.get("message", "ตรวจสอบสลิปไม่สำเร็จ")
                logger.warning(f"❌ Thunder API returned success=false: {error_msg}")
                return {"status": "error", "message": error_msg}

        elif resp.status_code == 400:
            error_msg = result.get("message", "Bad Request")
            if "duplicate" in error_msg.lower():
                logger.info(f"ℹ️ Thunder API duplicate detected: {error_msg}")
                return {
                    "status": "duplicate",
                    "message": "สลิปนี้เคยถูกตรวจสอบแล้ว",
                    "original_message": error_msg
                }
            else:
                return {"status": "error", "message": f"Thunder API: {error_msg}"}

        elif resp.status_code == 401:
            return {"status": "error", "message": "Thunder API Token ไม่ถูกต้องหรือหมดอายุ"}
        elif resp.status_code == 403:
            return {"status": "error", "message": "ไม่มีสิทธิ์เข้าถึง Thunder API"}
        elif resp.status_code == 404:
            return {"status": "error", "message": "ไม่พบ Thunder API endpoint - ตรวจสอบ URL"}
        elif resp.status_code == 429:
            return {"status": "error", "message": "ใช้งาน Thunder API เกินจำนวนที่กำหนด กรุณารอสักครู่"}
        elif resp.status_code >= 500:
            return {"status": "error", "message": f"Thunder API เกิดข้อผิดพลาดภายใน (HTTP {resp.status_code})"}
        else:
            error_message = result.get("message", f"HTTP {resp.status_code} Error")
            return {"status": "error", "message": f"Thunder API Error: {error_message}"}

    except requests.exceptions.ChunkedEncodingError as e:
        logger.error("❌ Thunder API chunked encoding error: %s", e)
        return {"status": "error", "message": "Thunder API: การตอบกลับไม่สมบูรณ์ กรุณาลองใหม่"}

    except requests.exceptions.ConnectionError as e:
        logger.error("❌ Thunder API connection error: %s", e)
        return {"status": "error", "message": "ไม่สามารถเชื่อมต่อกับ Thunder API ได้ กรุณาตรวจสอบอินเทอร์เน็ต"}

    except requests.exceptions.Timeout as e:
        logger.error("❌ Thunder API timeout: %s", e)
        return {"status": "error", "message": "Thunder API ตอบสนองช้าเกินไป กรุณาลองใหม่อีกครั้ง"}

    except requests.exceptions.RequestException as e:
        logger.exception("❌ Thunder API request error: %s", e)
        return {"status": "error", "message": f"เกิดข้อผิดพลาดในการเชื่อมต่อ Thunder API: {str(e)}"}

    except Exception as e:
        logger.exception("❌ Unexpected error: %s", e)
        return {"status": "error", "message": f"เกิดข้อผิดพลาดไม่คาดคิด: {str(e)}"}

    finally:
        # ปิด session เสมอ
        try:
            session.close()
        except Exception:
            pass
