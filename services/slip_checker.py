import logging
import requests
from typing import Dict, Any, Optional
from utils.config_manager import config_manager

logger = logging.getLogger("slip_checker_service")

def verify_slip_with_thunder(message_id: str,
                             test_image_data: Optional[bytes] = None) -> Dict[str, Any]:
    """
    ตรวจสอบสลิปจาก LINE (message_id) หรือ test image buffer (เช่นจากอัปโหลดหน้าเว็บ)
    คืนค่า dict ที่มี status และข้อมูล slip ที่ตรวจได้
    """
    if not config_manager.get("slip_enabled"):
        return {"status": "error", "message": "ระบบตรวจสอบสลิปถูกปิดอยู่"}

    api_token = config_manager.get("thunder_api_token", "").strip()
    line_token = config_manager.get("line_channel_access_token", "").strip()
    wallet_phone = config_manager.get("wallet_phone_number", "").strip()

    if not api_token:
        logger.error("THUNDER_API_TOKEN is missing.")
        return {"status": "error", "message": "ยังไม่ได้ตั้งค่า Thunder API Token"}
    if not line_token and not test_image_data:
        logger.error("LINE_CHANNEL_ACCESS_TOKEN is missing.")
        return {"status": "error", "message": "ยังไม่ได้ตั้งค่า LINE Channel Access Token"}

    # ดาวน์โหลดภาพจาก LINE (หากไม่ใช่ test mode)
    image_data = test_image_data
    if not test_image_data:
        try:
            url = f"https://api-data.line.me/v2/bot/message/{message_id}/content"
            headers = {"Authorization": f"Bearer {line_token}"}
            resp = requests.get(url, headers=headers, timeout=10)
            resp.raise_for_status()
            image_data = resp.content
        except Exception as e:
            logger.exception("\u274c ดาวน์โหลดรูปภาพจาก LINE ไม่สำเร็จ: %s", e)
            return {"status": "error", "message": "ไม่สามารถดาวน์โหลดรูปจาก LINE ได้"}

    # เตรียมส่งรูปไปยัง Thunder
    endpoint = "verify/truewallet" if wallet_phone else "verify"
    post_url = f"https://api.thunder.in.th/v1/{endpoint}"
    headers = {"Authorization": f"Bearer {api_token}"}
    files = {"file": ("slip.jpg", image_data, "image/jpeg")}
    data = {"wallet_phone": wallet_phone} if wallet_phone else {}

    try:
        resp = requests.post(post_url, headers=headers, files=files, data=data, timeout=20)
        resp.raise_for_status()
        result = resp.json()
    except Exception as e:
        logger.exception("\u274c Thunder API error: %s", e)
        return {"status": "error", "message": "เชื่อมต่อกับ Thunder ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"}

    if not result.get("success", False):
        error_msg = result.get("message", "ตรวจสอบสลิปไม่สำเร็จ \u274c")
        return {"status": "error", "message": error_msg}

    # \u2705 ดึงข้อมูลที่เกี่ยวข้องตามประเภทบัญชี
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
            }
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
            }
        }
