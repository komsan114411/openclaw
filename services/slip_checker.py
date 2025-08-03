import logging
import requests
from typing import Dict, Any
from config import config_store

logger = logging.getLogger("slip_checker_service")

def verify_slip_with_thunder(message_id: str) -> str:
    api_token = config_store.get("thunder_api_token")      # ใช้คีย์ตรงกับ config.py
    line_access_token = config_store.get("line_channel_access_token")

    if not config_store.get("slip_enabled"):
        return "ระบบตรวจสอบสลิปถูกปิดอยู่"

    if not api_token or not line_access_token:
        return "ขออภัย ระบบตรวจสอบสลิปยังไม่ได้ตั้งค่า API Token"

    # 1. ดาวน์โหลดรูปสลิปจาก LINE
    try:
        line_content_url = f"https://api-data.line.me/v2/bot/message/{message_id}/content"
        headers = {"Authorization": f"Bearer {line_access_token}"}
        resp = requests.get(line_content_url, headers=headers, timeout=10)
        resp.raise_for_status()
        image_data = resp.content
    except Exception as e:
        logger.error(f"Failed to get image content from LINE: {e}")
        return "ขออภัย เกิดข้อผิดพลาดในการดาวน์โหลดรูปภาพสลิป"

    # 2. ส่งไปยัง Thunder API
    try:
        thunder_api_url = "https://api.thunder.in.th/v1/verify-slip"
        headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "image/jpeg"
        }
        api_resp = requests.post(thunder_api_url, headers=headers, data=image_data, timeout=15)
        api_resp.raise_for_status()
        result = api_resp.json()

        if result.get("status") == "success":
            return f"สลิปถูกต้อง ✅\nยอดเงิน: {result.get('amount')} บาท\nวันที่: {result.get('date')}"
        else:
            return f"สลิปไม่ถูกต้อง ❌\nข้อผิดพลาด: {result.get('message')}"
    except Exception as e:
        logger.error(f"Failed to call Thunder API: {e}")
        return "ขออภัย ไม่สามารถตรวจสอบสลิปได้ในขณะนี้"
