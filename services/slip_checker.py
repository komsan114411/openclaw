# services/slip_checker.py
import logging
import requests
from typing import Dict, Any
from utils.config_manager import config_manager

logger = logging.getLogger("slip_checker_service")

def verify_slip_with_thunder(message_id: str) -> Dict[str, Any]:
    api_token = config_manager.get("thunder_api_token")
    line_token = config_manager.get("line_channel_access_token")
    wallet_phone = config_manager.get("wallet_phone_number", "")

    # ตรวจสอบการเปิดใช้งาน
    if not config_manager.get("slip_enabled"):
        return {"status": "error", "message": "ระบบตรวจสอบสลิปถูกปิดอยู่"}

    # ปรับปรุงการตรวจสอบ Token ให้ละเอียดขึ้น
    if not api_token:
        logger.error("THUNDER_API_TOKEN is missing or not configured.")
        return {"status": "error", "message": "ยังไม่ได้ตั้งค่า Thunder API Token"}
    if not line_token:
        logger.error("LINE_CHANNEL_ACCESS_TOKEN is missing or not configured.")
        return {"status": "error", "message": "ยังไม่ได้ตั้งค่า LINE Channel Access Token"}

    # 1. ดาวน์โหลดรูปสลิปจาก LINE
    try:
        line_url = f"https://api-data.line.me/v2/bot/message/{message_id}/content"
        headers = {"Authorization": f"Bearer {line_token}"}
        resp = requests.get(line_url, headers=headers, timeout=10)
        resp.raise_for_status()
        image_data = resp.content
    except Exception as e:
        logger.error("LINE image download error: %s", e)
        return {"status": "error", "message": "ดาวน์โหลดรูปสลิปไม่สำเร็จ"}

    # 2. เลือก endpoint ธนาคารหรือ TrueWallet
    endpoint = "verify/truewallet" if wallet_phone else "verify"
    url = f"https://api.thunder.in.th/v1/{endpoint}"
    try:
        headers = {"Authorization": f"Bearer {api_token}"}
        files = {"file": ("slip.jpg", image_data, "image/jpeg")}
        data = {}
        # หากเป็น TrueWallet ส่งเบอร์ผู้รับ
        if wallet_phone:
            data["wallet_phone"] = wallet_phone
        response = requests.post(url, headers=headers, files=files, data=data, timeout=20)
        response.raise_for_status()
        result = response.json()
    except Exception as e:
        logger.error("Thunder API error: %s", e)
        return {"status": "error", "message": "ตรวจสอบสลิปไม่ได้ในขณะนี้"}

    # ตรวจสอบ status
    if result.get("status") != 200 and not result.get("success"):
        return {"status": "error", "message": "สลิปไม่ถูกต้อง ❌"}

    # ถ้าสำเร็จ คืนข้อมูล slip ตามประเภท
    data = result.get("data", result)
    if wallet_phone:
        # TrueMoney
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
        # Bank
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
