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
    ตรวจสอบสลิปด้วย Thunder API v1 (แก้ไขแล้ว)
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
            resp = requests.get(url, headers=headers, timeout=15)
            resp.raise_for_status()
            image_data = resp.content
            logger.info(f"✅ ดาวน์โหลดรูปจาก LINE สำเร็จ: {len(image_data)} bytes")
        except Exception as e:
            logger.exception("❌ ดาวน์โหลดรูปภาพจาก LINE ไม่สำเร็จ: %s", e)
            return {"status": "error", "message": f"ไม่สามารถดาวน์โหลดรูปจาก LINE ได้: {str(e)}"}

    if not image_data:
        return {"status": "error", "message": "ไม่พบข้อมูลรูปภาพ"}

    # ใช้ Base URL ที่ถูกต้องตามเอกสาร Thunder API
    base_url = "https://api.thunder.in.th/v1"
    
    # กำหนด endpoint ตามประเภท
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
        "Accept": "application/json"
    }

    # เตรียมไฟล์สำหรับส่ง (แก้ไขให้ถูกต้อง)
    files = {
        "file": ("slip.jpg", image_data, "image/jpeg")
    }

    # เตรียมข้อมูลเพิ่มเติม
    data = {}
    if wallet_phone:
        data["wallet_phone"] = wallet_phone
    
    # เพิ่มพารามิเตอร์ checkDuplicate ถ้าระบุ (default เป็น true)
    data["checkDuplicate"] = "true" if check_duplicate is not False else "false"

    try:
        logger.info(f"🚀 ส่งคำขอไปยัง Thunder API: {endpoint}")
        logger.info(f"📋 Data parameters: {data}")
        
        resp = requests.post(
            endpoint, 
            headers=headers, 
            files=files, 
            data=data, 
            timeout=45  # เพิ่ม timeout เป็น 45 วินาที
        )
        
        logger.info(f"📈 Response Status: {resp.status_code}")
        logger.info(f"📈 Response Headers: Content-Type: {resp.headers.get('Content-Type', 'N/A')}")
        
        # Log response แต่ไม่แสดงข้อมูลละเอียด
        response_preview = resp.text[:300] + "..." if len(resp.text) > 300 else resp.text
        logger.info(f"📄 Response Preview: {response_preview}")
        
        # พยายาม parse JSON response
        try:
            result = resp.json()
        except ValueError as e:
            logger.error(f"❌ ไม่สามารถ parse JSON response: {e}")
            logger.error(f"📄 Raw Response: {resp.text}")
            return {
                "status": "error",
                "message": f"Thunder API ตอบกลับข้อมูลที่ไม่ใช่ JSON (HTTP {resp.status_code})",
            }
        
        # ตรวจสอบ HTTP status code
        if resp.status_code != 200:
            logger.error(f"❌ HTTP Error {resp.status_code}: {result}")
            
            # จัดการข้อผิดพลาดตาม HTTP status
            if resp.status_code == 401:
                error_message = "Thunder API Token ไม่ถูกต้องหรือหมดอายุ"
            elif resp.status_code == 403:
                error_message = "ไม่มีสิทธิ์เข้าถึง Thunder API"
            elif resp.status_code == 404:
                error_message = "ไม่พบ Thunder API endpoint"
            elif resp.status_code == 429:
                error_message = "ใช้งาน Thunder API เกินจำนวนที่กำหนด กรุณารอสักครู่"
            elif resp.status_code >= 500:
                error_message = "Thunder API เกิดข้อผิดพลาดภายใน กรุณาลองใหม่อีกครั้ง"
            else:
                error_message = result.get("message", f"HTTP {resp.status_code} Error")
            
            return {
                "status": "error",
                "message": f"Thunder API Error: {error_message}",
            }

    except requests.exceptions.Timeout:
        logger.error("❌ Thunder API timeout")
        return {
            "status": "error",
            "message": "Thunder API ตอบสนองช้าเกินไป กรุณาลองใหม่อีกครั้ง",
        }
    except requests.exceptions.ConnectionError:
        logger.error("❌ Thunder API connection error")
        return {
            "status": "error",
            "message": "ไม่สามารถเชื่อมต่อกับ Thunder API ได้ กรุณาตรวจสอบอินเทอร์เน็ต",
        }
    except requests.exceptions.RequestException as e:
        logger.exception("❌ Thunder API request error: %s", e)
        return {
            "status": "error",
            "message": f"เกิดข้อผิดพลาดในการเชื่อมต่อ Thunder API: {str(e)}",
        }
    except Exception as e:
        logger.exception("❌ Unexpected error: %s", e)
        return {
            "status": "error",
            "message": f"เกิดข้อผิดพลาดไม่คาดคิด: {str(e)}",
        }

    # ประมวลผลการตอบกลับจาก Thunder API
    try:
        logger.info(f"🔍 Processing Thunder API response: {result.get('success', 'N/A')}")
        
        # ตรวจสอบความสำเร็จตาม API response format
        if not result.get("success", False):
            error_msg = result.get("message", "ตรวจสอบสลิปไม่สำเร็จ")
            logger.warning(f"❌ Thunder API returned success=false: {error_msg}")
            
            # ให้คำแนะนำเพิ่มเติม
            suggestions = []
            if "invalid" in error_msg.lower() or "token" in error_msg.lower():
                suggestions.append("ตรวจสอบ Thunder API Token ในหน้า Settings")
            if "slip" in error_msg.lower() or "image" in error_msg.lower():
                suggestions.append("ลองส่งรูปสลิปที่ชัดเจนขึ้น")
            if "format" in error_msg.lower():
                suggestions.append("ตรวจสอบว่าเป็นไฟล์รูปภาพ JPG หรือ PNG")
                
            return {
                "status": "error", 
                "message": error_msg,
                "suggestions": suggestions
            }

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
                "type": "thunder",
                "data": {
                    "amount": str(data.get("amount", "0")),
                    "date": data.get("date", ""),
                    "time": data.get("time", ""),
                    "sender": data.get("sender", ""),
                    "receiver_name": data.get("receiver", {}).get("name", "") if isinstance(data.get("receiver"), dict) else str(data.get("receiver", "")),
                    "receiver_phone": data.get("receiver", {}).get("phone", wallet_phone) if isinstance(data.get("receiver"), dict) else wallet_phone,
                    "reference": data.get("transRef", ""),
                    "verified_by": "Thunder API",
                },
            }
        else:
            # Bank transfer response format
            amount_value = data.get("amount", {})
            if isinstance(amount_value, dict):
                amount_str = str(amount_value.get("amount", "0"))
            else:
                amount_str = str(amount_value)
                
            return {
                "status": "success",
                "type": "thunder",
                "data": {
                    "amount": amount_str,
                    "date": data.get("date", ""),
                    "time": data.get("time", ""),
                    "sender_bank": data.get("sender", {}).get("bank", {}).get("short", "") if isinstance(data.get("sender"), dict) else "",
                    "receiver_bank": data.get("receiver", {}).get("bank", {}).get("short", "") if isinstance(data.get("receiver"), dict) else "",
                    "sender": data.get("sender", {}).get("name", "") if isinstance(data.get("sender"), dict) else str(data.get("sender", "")),
                    "receiver_name": data.get("receiver", {}).get("name", "") if isinstance(data.get("receiver"), dict) else str(data.get("receiver", "")),
                    "reference": data.get("transRef", ""),
                    "verified_by": "Thunder API",
                },
            }

    except Exception as e:
        logger.exception("❌ Error processing Thunder API response: %s", e)
        return {
            "status": "error",
            "message": f"เกิดข้อผิดพลาดในการประมวลผลข้อมูล: {str(e)}",
        }
