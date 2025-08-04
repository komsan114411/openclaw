import logging
import requests
import hashlib
import time
from typing import Dict, Any, Optional
from utils.config_manager import config_manager

logger = logging.getLogger("slip_checker_service")

def verify_slip_with_thunder(
    message_id: str,
    test_image_data: Optional[bytes] = None,
    check_duplicate: Optional[bool] = None,
) -> Dict[str, Any]:
    """
    ตรวจสอบสลิปด้วย Thunder API v1 (แก้ไข duplicate slip issue)
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

    # สร้าง unique identifier สำหรับรูปภาพเพื่อป้องกัน duplicate
    if message_id:
        unique_id = f"{message_id}_{int(time.time())}"
    else:
        # สำหรับ test upload ใช้ hash ของรูปภาพ + timestamp
        image_hash = hashlib.md5(image_data).hexdigest()[:8]
        unique_id = f"test_{image_hash}_{int(time.time())}"

    # ใช้ Base URL ที่ถูกต้องตามเอกสาร Thunder API
    base_url = "https://api.thunder.in.th/v1"
    
    # กำหนด endpoint ตามประเภท
    if wallet_phone:
        endpoint = f"{base_url}/verify/truewallet"
        logger.info(f"🔍 ใช้ TrueWallet verification สำหรับเบอร์: {wallet_phone}")
    else:
        endpoint = f"{base_url}/verify"
        logger.info("🔍 ใช้ Bank slip verification")

    # ตั้งค่า headers ตามเอกสาร API
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Accept": "application/json",
        "User-Agent": "LINE-OA-Middleware/1.0"
    }

    # เตรียมไฟล์สำหรับส่ง
    files = {
        "file": (f"slip_{unique_id}.jpg", image_data, "image/jpeg")
    }

    # เตรียมข้อมูลเพิ่มเติม
    data = {}
    if wallet_phone:
        data["wallet_phone"] = wallet_phone
    
    # จัดการ duplicate checking - default เป็น false เพื่อหลีกเลี่ยง duplicate error
    if check_duplicate is True:
        data["checkDuplicate"] = "true"
    else:
        data["checkDuplicate"] = "false"  # อนุญาตให้ตรวจสอบสลิปซ้ำได้
    
    # เพิ่ม unique reference เพื่อป้องกัน duplicate
    data["reference"] = unique_id

    try:
        logger.info(f"🚀 ส่งคำขอไปยัง Thunder API: {endpoint}")
        logger.info(f"📋 Parameters: checkDuplicate={data.get('checkDuplicate')}, reference={unique_id}")
        
        resp = requests.post(
            endpoint, 
            headers=headers, 
            files=files, 
            data=data, 
            timeout=45
        )
        
        logger.info(f"📈 Thunder API Response: {resp.status_code}")
        
        # พยายาม parse JSON response
        try:
            result = resp.json()
            logger.info(f"📄 Response success: {result.get('success', 'N/A')}")
        except ValueError as e:
            logger.error(f"❌ ไม่สามารถ parse JSON response: {e}")
            logger.error(f"📄 Raw Response: {resp.text[:300]}")
            return {
                "status": "error",
                "message": f"Thunder API ตอบกลับข้อมูลที่ไม่ถูกต้อง (HTTP {resp.status_code})",
            }
        
        # ตรวจสอบ HTTP status code
        if resp.status_code == 400:
            error_msg = result.get("message", "Bad Request")
            if "duplicate" in error_msg.lower():
                logger.warning(f"⚠️ Thunder API duplicate error: {error_msg}")
                # กรณี duplicate ให้ถือว่าสลิปถูกต้อง (เคยตรวจแล้ว)
                return {
                    "status": "error",
                    "message": "สลิปนี้เใช้ตรวจสอบไปแล้ว กรุณาใช้สลิปใหม่",
                    "suggestions": [
                        "ใช้สลิปโอนเงินใหม่ที่ยังไม่เคยตรวจสอบ",
                        "ตรวจสอบว่าส่งสลิปที่ถูกต้องหรือไม่"
                    ]
                }
            else:
                return {"status": "error", "message": f"Thunder API: {error_msg}"}
        elif resp.status_code == 401:
            return {"status": "error", "message": "Thunder API Token ไม่ถูกต้องหรือหมดอายุ"}
        elif resp.status_code == 403:
            return {"status": "error", "message": "ไม่มีสิทธิ์เข้าถึง Thunder API"}
        elif resp.status_code == 429:
            return {"status": "error", "message": "ใช้งาน Thunder API เกินจำนวนที่กำหนด กรุณารอสักครู่"}
        elif resp.status_code != 200:
            error_message = result.get("message", f"HTTP {resp.status_code} Error")
            return {"status": "error", "message": f"Thunder API Error: {error_message}"}

    except requests.exceptions.Timeout:
        logger.error("❌ Thunder API timeout")
        return {"status": "error", "message": "Thunder API ตอบสนองช้าเกินไป กรุณาลองใหม่อีกครั้ง"}
    except requests.exceptions.ConnectionError:
        logger.error("❌ Thunder API connection error")
        return {"status": "error", "message": "ไม่สามารถเชื่อมต่อกับ Thunder API ได้ กรุณาตรวจสอบอินเทอร์เน็ต"}
    except requests.exceptions.RequestException as e:
        logger.exception("❌ Thunder API request error: %s", e)
        return {"status": "error", "message": f"เกิดข้อผิดพลาดในการเชื่อมต่อ Thunder API: {str(e)}"}
    except Exception as e:
        logger.exception("❌ Unexpected error: %s", e)
        return {"status": "error", "message": f"เกิดข้อผิดพลาดไม่คาดคิด: {str(e)}"}

    # ประมวลผลการตอบกลับจาก Thunder API
    try:
        # ตรวจสอบความสำเร็จตาม API response format
        if not result.get("success", False):
            error_msg = result.get("message", "ตรวจสอบสลิปไม่สำเร็จ")
            logger.warning(f"❌ Thunder API returned success=false: {error_msg}")
            
            # ให้คำแนะนำเพิ่มเติม
            suggestions = []
            if "duplicate" in error_msg.lower():
                suggestions.extend([
                    "สลิปนี้เคยถูกตรวจสอบแล้ว",
                    "กรุณาใช้สลิปโอนเงินใหม่"
                ])
            elif "invalid" in error_msg.lower():
                suggestions.extend([
                    "ตรวจสอบว่าเป็นรูปสลิปที่ชัดเจน",
                    "ลองถ่ายรูปสลิปใหม่ให้ชัดขึ้น"
                ])
            elif "format" in error_msg.lower():
                suggestions.extend([
                    "ใช้ไฟล์รูปภาพ JPG หรือ PNG",
                    "ตรวจสอบขนาดไฟล์ไม่เกิน 5MB"
                ])
            else:
                suggestions.extend([
                    "ตรวจสอบ Thunder API Token ในหน้า Settings",
                    "ลองส่งรูปสลิปที่ชัดเจนขึ้น"
                ])
                
            return {
                "status": "error", 
                "message": error_msg,
                "suggestions": suggestions
            }

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
                    "sender": data_response.get("sender", ""),
                    "receiver_name": data_response.get("receiver", {}).get("name", "") if isinstance(data_response.get("receiver"), dict) else str(data_response.get("receiver", "")),
                    "receiver_phone": data_response.get("receiver", {}).get("phone", wallet_phone) if isinstance(data_response.get("receiver"), dict) else wallet_phone,
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
                    "sender_bank": data_response.get("sender", {}).get("bank", {}).get("short", "") if isinstance(data_response.get("sender"), dict) else "",
                    "receiver_bank": data_response.get("receiver", {}).get("bank", {}).get("short", "") if isinstance(data_response.get("receiver"), dict) else "",
                    "sender": data_response.get("sender", {}).get("name", "") if isinstance(data_response.get("sender"), dict) else str(data_response.get("sender", "")),
                    "receiver_name": data_response.get("receiver", {}).get("name", "") if isinstance(data_response.get("receiver"), dict) else str(data_response.get("receiver", "")),
                    "reference": data_response.get("transRef", unique_id),
                    "verified_by": "Thunder API (Bank)",
                },
            }

    except Exception as e:
        logger.exception("❌ Error processing Thunder API response: %s", e)
        return {
            "status": "error",
            "message": f"เกิดข้อผิดพลาดในการประมวลผลข้อมูล: {str(e)}",
        }
