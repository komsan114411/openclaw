import logging
import requests
from typing import Dict, Any, Optional
from utils.config_manager import config_manager

logger = logging.getLogger("slip_checker_service")

def verify_slip_with_thunder(
    message_id: str,
    test_image_data: Optional[bytes] = None,
    check_duplicate: Optional[bool] = None,
) -> Dict[str, Any]:
    """
    ตรวจสอบสลิปด้วย Thunder API v1
    รองรับทั้งธนาคารและ TrueWallet ตามเอกสาร https://document.thunder.in.th/documents/start
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
            url = f"https://api-data.line.me/v2/bot/message/{message_id}/content"
            headers = {"Authorization": f"Bearer {line_token}"}
            resp = requests.get(url, headers=headers, timeout=10)
            resp.raise_for_status()
            image_data = resp.content
            logger.info(f"✅ ดาวน์โหลดรูปจาก LINE สำเร็จ: {len(image_data)} bytes")
        except Exception as e:
            logger.exception("❌ ดาวน์โหลดรูปภาพจาก LINE ไม่สำเร็จ: %s", e)
            return {"status": "error", "message": "ไม่สามารถดาวน์โหลดรูปจาก LINE ได้"}

    if not image_data:
        return {"status": "error", "message": "ไม่พบข้อมูลรูปภาพ"}

    # กำหนด endpoint ตามประเภท (ใช้ Base URL ที่ถูกต้องตามเอกสาร)
    base_url = "https://api.thunder.in.th/v1"
    
    if wallet_phone:
        endpoint = f"{base_url}/verify/truewallet"
        logger.info(f"🔍 ใช้ TrueWallet verification สำหรับเบอร์: {wallet_phone}")
    else:
        endpoint = f"{base_url}/verify"
        logger.info("🔍 ใช้ Bank transfer verification")

    # ตั้งค่า headers ตามเอกสาร API
    headers = {
        "Authorization": f"Bearer {api_token}",
        # ไม่ต้องใส่ Content-Type สำหรับ multipart/form-data ให้ requests จัดการเอง
    }

    # เตรียมไฟล์สำหรับส่ง
    files = {
        "file": ("slip.jpg", image_data, "image/jpeg")
    }

    # เตรียมข้อมูลเพิ่มเติม
    data = {}
    if wallet_phone:
        data["wallet_phone"] = wallet_phone
    
    # เพิ่มพารามิเตอร์ checkDuplicate ถ้าระบุ
    if check_duplicate is not None:
        data["checkDuplicate"] = "true" if check_duplicate else "false"

    try:
        logger.info(f"🚀 ส่งคำขอไปยัง Thunder API: {endpoint}")
        logger.info(f"📋 Headers: Authorization Bearer [HIDDEN]")
        logger.info(f"📋 Data: {data}")
        
        resp = requests.post(
            endpoint, 
            headers=headers, 
            files=files, 
            data=data, 
            timeout=30  # เพิ่ม timeout เป็น 30 วินาที
        )
        
        logger.info(f"📈 Response Status: {resp.status_code}")
        logger.info(f"📈 Response Headers: {dict(resp.headers)}")
        
        # พยายาม parse JSON response
        try:
            result = resp.json()
            logger.info(f"📄 Response Body: {result}")
        except ValueError as e:
            logger.error(f"❌ ไม่สามารถ parse JSON response: {e}")
            logger.error(f"📄 Raw Response: {resp.text}")
            return {
                "status": "error",
                "message": f"Response ไม่ใช่ JSON: {resp.text[:200]}",
            }
        
        # ตรวจสอบ HTTP status code
        if resp.status_code != 200:
            logger.error(f"❌ HTTP Error {resp.status_code}: {result}")
            error_message = result.get("message", f"HTTP {resp.status_code} Error")
            return {
                "status": "error",
                "message": f"Thunder API Error: {error_message}",
            }

    except requests.exceptions.RequestException as e:
        logger.exception("❌ Thunder API connection error: %s", e)
        return {
            "status": "error",
            "message": "เชื่อมต่อกับ Thunder API ไม่สำเร็จ กรุณาตรวจสอบเครือข่ายและลองใหม่",
        }
    except Exception as e:
        logger.exception("❌ Unexpected error: %s", e)
        return {
            "status": "error",
            "message": f"เกิดข้อผิดพลาดไม่คาดคิด: {str(e)}",
        }

    # ประมวลผลการตอบกลับจาก Thunder API
    try:
        # ตรวจสอบความสำเร็จตาม API response format
        if not result.get("success", False):
            error_msg = result.get("message", "ตรวจสอบสลิปไม่สำเร็จ")
            logger.warning(f"❌ Thunder API returned success=false: {error_msg}")
            return {"status": "error", "message": error_msg}

        # ดึงข้อมูลที่เกี่ยวข้อง
        data = result.get("data", {})
        
        if not data:
            logger.warning("⚠️ Thunder API response ไม่มีข้อมูลใน data field")
            return {"status": "error", "message": "ไม่พบข้อมูลสลิปในการตอบกลับ"}

        # จัดรูปแบบข้อมูลตามประเภท
        if wallet_phone:
            # TrueWallet response format
            return {
                "status": "success",
                "type": "thunder",  # เปลี่ยนจาก "wallet" เป็น "thunder"
                "data": {
                    "amount": str(data.get("amount", "0")),
                    "date": data.get("date", ""),
                    "sender": data.get("sender", ""),
                    "receiver_name": data.get("receiver", {}).get("name", "") if isinstance(data.get("receiver"), dict) else str(data.get("receiver", "")),
                    "receiver_phone": data.get("receiver", {}).get("phone", wallet_phone) if isinstance(data.get("receiver"), dict) else wallet_phone,
                    "verified_by": "Thunder API",
                },
            }
        else:
            # Bank transfer response format
            return {
                "status": "success",
                "type": "thunder",  # เปลี่ยนจาก "bank" เป็น "thunder"
                "data": {
                    "amount": str(data.get("amount", {}).get("amount", 0) if isinstance(data.get("amount"), dict) else data.get("amount", 0)),
                    "date": data.get("date", ""),
                    "sender_bank": data.get("sender", {}).get("bank", {}).get("short", "") if isinstance(data.get("sender"), dict) else "",
                    "receiver_bank": data.get("receiver", {}).get("bank", {}).get("short", "") if isinstance(data.get("receiver"), dict) else "",
                    "sender": data.get("sender", {}).get("name", "") if isinstance(data.get("sender"), dict) else str(data.get("sender", "")),
                    "receiver_name": data.get("receiver", {}).get("name", "") if isinstance(data.get("receiver"), dict) else str(data.get("receiver", "")),
                    "verified_by": "Thunder API",
                },
            }

    except Exception as e:
        logger.exception("❌ Error processing Thunder API response: %s", e)
        return {
            "status": "error",
            "message": f"เกิดข้อผิดพลาดในการประมวลผลข้อมูล: {str(e)}",
        }
