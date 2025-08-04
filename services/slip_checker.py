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
    ตรวจสอบสลิปจาก LINE (message_id) หรือ buffer ของรูปสลิป (test_image_data)

    ฟังก์ชันนี้จะส่งรูปภาพไปยัง Thunder API และคืนผลลัพธ์การตรวจสอบสลิปในรูปแบบ dict

    พารามิเตอร์:
        message_id (str): รหัสข้อความจาก LINE ที่มีรูปสลิป (ใช้เมื่อทดสอบผ่าน LINE)
        test_image_data (Optional[bytes]): ข้อมูลภาพสลิปในรูปแบบไบต์ (ใช้กรณีทดสอบผ่านหน้าเว็บ)
        check_duplicate (Optional[bool]): ต้องการให้ API ตรวจสอบสลิปซ้ำหรือไม่ (ถ้า None จะไม่ส่งพารามิเตอร์นี้)
    """
    # ตรวจสอบว่าระบบเปิดใช้งานฟังก์ชันตรวจสอบสลิปหรือไม่
    if not config_manager.get("slip_enabled"):
        return {"status": "error", "message": "ระบบตรวจสอบสลิปถูกปิดอยู่"}

    # โหลดค่า configuration ที่จำเป็นจาก config_manager
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

    # ในกรณีที่ไม่ได้ทดสอบผ่านหน้าเว็บ ต้องมี LINE channel access token เพื่อดึงรูปจาก LINE
    if not line_token and not test_image_data:
        logger.error("LINE_CHANNEL_ACCESS_TOKEN is missing.")
        return {
            "status": "error",
            "message": "ยังไม่ได้ตั้งค่า LINE Channel Access Token",
        }

    # ดาวน์โหลดภาพจาก LINE (ถ้าไม่ได้ส่ง test_image_data มา)
    image_data = test_image_data
    if not test_image_data:
        try:
            url = f"https://api-data.line.me/v2/bot/message/{message_id}/content"
            headers = {"Authorization": f"Bearer {line_token}"}
            resp = requests.get(url, headers=headers, timeout=10)
            resp.raise_for_status()
            image_data = resp.content
        except Exception as e:
            logger.exception("❌ ดาวน์โหลดรูปภาพจาก LINE ไม่สำเร็จ: %s", e)
            return {"status": "error", "message": "ไม่สามารถดาวน์โหลดรูปจาก LINE ได้"}

    # เตรียมส่งรูปไปยัง Thunder
    # หากมีการระบุ wallet_phone ให้เรียก endpoint สำหรับ TrueWallet
    endpoint = "verify/truewallet" if wallet_phone else "verify"
    post_url = f"https://api.thunder.in.th/v1/{endpoint}"
    headers = {"Authorization": f"Bearer {api_token}"}

    # ใส่ไฟล์ภาพเป็น multipart/form-data
    files = {"file": ("slip.jpg", image_data, "image/jpeg")}

    # ข้อมูลเพิ่มเติม (ถ้ามี)
    data = {}
    if wallet_phone:
        data["wallet_phone"] = wallet_phone
    if check_duplicate is not None:
        # ส่งค่า checkDuplicate ในรูปแบบ true/false (string) ตามที่ API รองรับ
        data["checkDuplicate"] = "true" if check_duplicate else "false"

    try:
        resp = requests.post(post_url, headers=headers, files=files, data=data, timeout=20)
        resp.raise_for_status()
        result = resp.json()
    except Exception as e:
        logger.exception("❌ Thunder API error: %s", e)
        return {
            "status": "error",
            "message": "เชื่อมต่อกับ Thunder ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
        }

    # Thunder API จะส่ง success = false เมื่อมีข้อผิดพลาด (เช่น invalid_image)
    if not result.get("success", False):
        error_msg = result.get("message", "ตรวจสอบสลิปไม่สำเร็จ ❌")
        return {"status": "error", "message": error_msg}

    # ✅ ดึงข้อมูลที่เกี่ยวข้องตามประเภทบัญชี
    data = result.get("data", {})
    if wallet_phone:
        return {
            "status": "success",
            "type": "wallet",
            "data": {
                "amount": data.get("amount"),
                "date": data.get("date"),
                "sender": data.get("sender"),
                "receiver_name": data.get("receiver", {}).get("name"),
                "receiver_phone": data.get("receiver", {}).get("phone"),
            },
        }
    else:
        return {
            "status": "success",
            "type": "bank",
            "data": {
                "amount": data.get("amount", {}).get("amount", 0),
                "date": data.get("date"),
                "sender_bank": data.get("sender", {}).get("bank", {}).get("short"),
                "receiver_bank": data.get("receiver", {}).get("bank", {}).get("short"),
            },
        }
