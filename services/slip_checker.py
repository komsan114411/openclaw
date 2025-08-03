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

    # 2. ตรวจสอบกับ Thunder API (อัปเดต endpoint ใหม่)
    try:
        # ใช้ endpoint ที่ถูกต้องตาม Thunder documentation
        verify_url = "https://slip-api.thunder.in.th/api/v1/verify-slip"
        
        headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "multipart/form-data"
        }
        
        files = {"slip_image": ("slip.jpg", image_data, "image/jpeg")}
        
        # เพิ่มข้อมูลเพิ่มเติมถ้ามี
        data = {}
        if wallet_phone:
            data["wallet_phone"] = wallet_phone
            
        resp = requests.post(verify_url, headers=headers, files=files, data=data, timeout=15)
        resp.raise_for_status()
        result = resp.json()
        
    except Exception as e:
        logger.error("Thunder API error: %s", e)
        return {"status": "error", "message": "เชื่อมต่อ Thunder API ไม่ได้ กรุณาตรวจสอบ Token"}

    # 3. วิเคราะห์ผลลัพธ์
    if result.get("success") == True:
        slip_data = result.get("data", {})
        return {
            "status": "success",
            "data": {
                "amount": slip_data.get("amount", "0"),
                "date": slip_data.get("transaction_date", ""),
                "sender": slip_data.get("sender_name", ""),
                "receiver_name": slip_data.get("receiver_name", ""),
                "receiver_phone": slip_data.get("receiver_phone", wallet_phone),
                "bank_from": slip_data.get("bank_from", ""),
                "bank_to": slip_data.get("bank_to", ""),
            },
        }
    else:
        error_msg = result.get("message", "สลิปไม่ถูกต้อง")
        return {"status": "error", "message": f"❌ {error_msg}"}
