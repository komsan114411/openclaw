import logging
import requests
from typing import Dict, Any, Optional
from utils.config_manager import config_manager

logger = logging.getLogger("slip_checker_service")


def verify_slip_with_thunder(message_id: str,
                             test_image_data: Optional[bytes] = None) -> Dict[str, Any]:
    """
    ตรวจสอบรูปสลิปจาก LINE หรือ จาก test buffer
    ส่งคืน { status: str, type: str, data/message }
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

    # ดาวน์โหลดรูปจาก LINE หรือใช้ test_image_data
    image_data = None
    if test_image_data:
        image_data = test_image_data
    else:
        try:
            url = f"https://api-data.line.me/v2/bot/message/{message_id}/content"
            headers = {"Authorization": f"Bearer {line_token}"}
            resp = requests.get(url, headers=headers, timeout=10)
            resp.raise_for_status()
            image_data = resp.content
        except Exception as e:
            logger.error("LINE image download error: %s", e, exc_info=e)
            return {"status": "error", "message": "ดาวน์โหลดรูปสลิปไม่สำเร็จ"}

    endpoint = "verify/truewallet" if wallet_phone else "verify"
    post_url = f"https://api.thunder.in.th/v1/{endpoint}"
    try:
        headers = {"Authorization": f"Bearer {api_token}"}
        files = {"file": ("slip.jpg", image_data, "image/jpeg")}
        data = {}
        if wallet_phone:
            data["wallet_phone"] = wallet_phone
        resp = requests.post(post_url, headers=headers, files=files,
                             data=data, timeout=20)
        resp.raise_for_status()
        result = resp.json()
    except Exception as e:
        logger.error("Thunder API error: %s", e, exc_info=e)
        return {"status": "error", "message": "ตรวจสอบสลิปไม่ได้ในขณะนี้"}

    # ตรวจสอบว่า API ตอบกลับสถานะสำเร็จหรือไม่
    # บางครั้ง API อาจจะตอบ 200 แต่ใน body บอกว่าไม่สำเร็จ
    if not result.get("success", False):
        logger.warning("Thunder replied with failure: %s", result)
        # ใช้ข้อความจาก API หากมี หรือใช้ข้อความทั่วไป
        error_message = result.get("message", "สลิปไม่ถูกต้อง ❌")
        return {"status": "error", "message": error_message}
    
    # หากสำเร็จ ให้ดึงข้อมูลอย่างปลอดภัย
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
        amount = data.get("amount", {}).get("amount", 0)
        return {
            "status": "success",
            "type": "bank",
            "data": {
                "amount": amount,
                "date": data.get("date"),
                "sender_bank": data.get("sender", {}).get("bank", {}).get("short"),
                "receiver_bank": data.get("receiver", {}).get("bank", {}).get("short"),
            },
        }
