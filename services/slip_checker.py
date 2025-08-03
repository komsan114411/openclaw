import logging
import requests
from typing import Dict, Any
from config import config_store

logger = logging.getLogger("slip_checker_service")

def verify_slip_with_thunder(message_id: str) -> Dict[str, Any]:
    """ตรวจสอบสลิปกับ Thunder API แล้วคืนผลลัพธ์เป็นโครงสร้างข้อมูล"""
    api_token = config_store.get("thunder_api_token")
    line_token = config_store.get("line_channel_access_token")
    wallet_phone = config_store.get("wallet_phone_number", "")
    if not config_store.get("slip_enabled"):
        return {"status": "error", "message": "ระบบตรวจสอบสลิปถูกปิดอยู่"}
    if not api_token or not line_token:
        return {"status": "error", "message": "ยังไม่ได้ตั้งค่า API Token"}

    # 1. ดาวน์โหลดรูปสลิปจาก LINE
    try:
        url = f"https://api-data.line.me/v2/bot/message/{message_id}/content"
        headers = {"Authorization": f"Bearer {line_token}"}
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        image_data = resp.content
    except Exception as e:
        logger.error("LINE image download error: %s", e)
        return {"status": "error", "message": "ดาวน์โหลดรูปสลิปไม่สำเร็จ"}

    # 2. เลือก endpoint Thunder
    if wallet_phone:
        verify_url = "https://api.thunder.in.th/v1/verify/truewallet"
    else:
        verify_url = "https://api.thunder.in.th/v1/verify"
    headers = {"Authorization": f"Bearer {api_token}"}
    files = {"file": ("slip.jpg", image_data, "image/jpeg")}
    try:
        resp = requests.post(verify_url, headers=headers, files=files, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error("Thunder API error: %s", e)
        return {"status": "error", "message": "ตรวจสอบสลิปไม่ได้ในขณะนี้"}

    # 3. วิเคราะห์ผลลัพธ์
    if data.get("status") != 200:
        # ตัวอย่าง error: invalid_image, invalid_qr_code ฯลฯ
        return {"status": "error", "message": "สลิปไม่ถูกต้อง ❌"}
    # สำเร็จ
    result = data.get("data", {})
    if wallet_phone:
        return {
            "status": "success",
            "type": "wallet",
            "data": {
                "amount": result.get("amount"),
                "date": result.get("date"),
                "sender": result.get("sender", {}).get("name", ""),
                "receiver_name": result.get("receiver", {}).get("name", ""),
                "receiver_phone": result.get("receiver", {}).get("phone", ""),
            },
        }
    else:
        amount = result.get("amount", {}).get("amount", 0)
        return {
            "status": "success",
            "type": "bank",
            "data": {
                "amount": amount,
                "date": result.get("date", ""),
                "sender_bank": result.get("sender", {}).get("bank", {}).get("short", ""),
                "receiver_bank": result.get("receiver", {}).get("bank", {}).get("short", ""),
            },
        }
