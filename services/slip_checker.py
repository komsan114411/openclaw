# services/slip_checker.py
import logging
import requests
from typing import Dict, Any
from config import config_store

logger = logging.getLogger("slip_checker_service")

def verify_slip_with_thunder(message_id: str) -> str:
    api_token = config_store.get("thunder_api_token")
    line_access_token = config_store.get("line_channel_access_token")

    if not config_store.get("slip_enabled"):
        return "ระบบตรวจสอบสลิปถูกปิดอยู่"
    if not api_token or not line_access_token:
        return "ขออภัย ระบบตรวจสอบสลิปยังไม่ได้ตั้งค่า API Token"

    # 1. ดาวน์โหลดรูปสลิปจาก LINE
    try:
        url = f"https://api-data.line.me/v2/bot/message/{message_id}/content"
        headers = {"Authorization": f"Bearer {line_access_token}"}
        line_resp = requests.get(url, headers=headers, timeout=10)
        line_resp.raise_for_status()
        image_data = line_resp.content
    except Exception as e:
        logger.error("Failed to fetch image from LINE: %s", e)
        return "ไม่สามารถดาวน์โหลดรูปภาพสลิปได้"

    # 2. ส่งรูปไปยัง Thunder API ด้วย multipart/form-data ตามเอกสาร:contentReference[oaicite:2]{index=2}.
    try:
        verify_url = "https://api.thunder.in.th/v1/verify"
        headers = {"Authorization": f"Bearer {api_token}"}
        files = {"file": ("slip.jpg", image_data, "image/jpeg")}
        # สามารถเพิ่ม 'checkDuplicate': 'false' ใน data ได้หากต้องการตรวจ duplicate
        response = requests.post(verify_url, headers=headers, files=files, timeout=15)
        response.raise_for_status()
        data: Dict[str, Any] = response.json()
        if data.get("status") == 200:
            d = data.get("data", {})
            amount = d.get("amount", {}).get("amount", 0)
            date = d.get("date", "")
            return f"สลิปถูกต้อง ✅\nยอดเงิน: {amount} บาท\nวันที่: {date}"
        else:
            # กรณี error ใน level HTTP 200 แต่ status != 200
            return f"สลิปไม่ถูกต้อง ❌: {data.get('message', '')}"
    except Exception as e:
        logger.error("Thunder API error: %s", e)
        return "ตรวจสอบสลิปไม่ได้ในขณะนี้"
