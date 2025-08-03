import logging
import requests
from typing import Dict, Any
from config import config_store

logger = logging.getLogger("slip_checker_service")

def verify_slip_with_thunder(message_id: str) -> str:
    """
    Handle slip image messages by sending the image to the Thunder API
    for verification and replying with the result.
    """
    api_token = config_store.get("THUNDER_API_TOKEN")
    line_access_token = config_store.get("line_channel_access_token")

    if not config_store.get("slip_enabled"):
        return "ระบบตรวจสอบสลิปถูกปิดอยู่"

    if not api_token or not line_access_token:
        return "ขออภัย ระบบตรวจสอบสลิปยังไม่ได้ตั้งค่า API Token"
    
    # 1. Get image content from LINE API
    try:
        line_content_url = f"https://api-data.line.me/v2/bot/message/{message_id}/content"
        headers = {"Authorization": f"Bearer {line_access_token}"}
        resp = requests.get(line_content_url, headers=headers, timeout=10)
        resp.raise_for_status()
        image_data = resp.content
    except Exception as e:
        logger.error(f"Failed to get image content from LINE: {e}")
        return "ขออภัย เกิดข้อผิดพลาดในการดาวน์โหลดรูปภาพสลิป"

    # 2. Call Thunder API to verify
    try:
        thunder_api_url = "https://api.thunder.in.th/v1/verify"
        headers = {
            "Authorization": f"Bearer {api_token}",
        }
        
        files = {
            'file': ('slip.jpg', image_data, 'image/jpeg')
        }
        
        api_resp = requests.post(thunder_api_url, headers=headers, files=files, timeout=15)
        api_resp.raise_for_status()
        verification_result = api_resp.json()

        if verification_result.get("status") == 200:
            data = verification_result.get("data", {})
            message_text = "สลิปถูกต้อง ✅\n"
            message_text += f"ยอดเงิน: {data.get('amount', {}).get('amount')} บาท\n"
            message_text += f"วันที่: {data.get('date')[:10]}"
        else:
            message_text = "สลิปไม่ถูกต้อง ❌\n"
            message_text += f"ข้อผิดพลาด: {verification_result.get('message')}"
        
        return message_text
    except Exception as e:
        logger.error(f"Failed to call Thunder API: {e}")
        return "ขออภัย ไม่สามารถตรวจสอบสลิปได้ในขณะนี้"
