import logging
import requests
from typing import Dict, Any
from utils.config_manager import config_manager

logger = logging.getLogger("slip_checker_service")

def verify_slip_with_thunder(message_id: str) -> Dict[str, Any]:
    """ตรวจสอบสลิปกับ Thunder API"""
    api_token = config_manager.get("thunder_api_token")
    line_token = config_manager.get("line_channel_access_token") 
    wallet_phone = config_manager.get("wallet_phone_number", "")
    
    if not config_manager.get("slip_enabled"):
        return {"status": "error", "message": "ระบบตรวจสอบสลิปถูกปิดอยู่"}
    
    if not api_token or not line_token:
        return {"status": "error", "message": "ยังไม่ได้ตั้งค่า API Token หรือ LINE Token"}

    # 1. ดาวน์โหลดรูปสลิปจาก LINE
    try:
        url = f"https://api-data.line.me/v2/bot/message/{message_id}/content"
        headers = {"Authorization": f"Bearer {line_token}"}
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        image_data = resp.content
        logger.info(f"Downloaded image from LINE, size: {len(image_data)} bytes")
    except Exception as e:
        logger.error("LINE image download error: %s", e)
        return {"status": "error", "message": "ดาวน์โหลดรูปสลิปไม่สำเร็จ"}

    # 2. ส่งไปยัง Thunder API (ลองหลาย endpoint)
    endpoints_to_try = [
        "https://slip-api.thunder.in.th/api/v1/verify-slip",
        "https://api.thunder.in.th/api/v1/slip/verify", 
        "https://api.thunder.in.th/v1/verify",
        "https://thunder-api.com/api/v1/slip/verify"
    ]
    
    for verify_url in endpoints_to_try:
        try:
            headers = {"Authorization": f"Bearer {api_token}"}
            files = {"slip_image": ("slip.jpg", image_data, "image/jpeg")}
            data = {}
            
            if wallet_phone:
                data["wallet_phone"] = wallet_phone
                
            logger.info(f"Trying Thunder API endpoint: {verify_url}")
            resp = requests.post(verify_url, headers=headers, files=files, data=data, timeout=20)
            
            if resp.status_code == 200:
                result = resp.json()
                logger.info(f"Thunder API success response: {result}")
                
                # วิเคราะห์ผลลัพธ์
                if result.get("success") == True or result.get("status") == "success" or result.get("status") == 200:
                    slip_data = result.get("data", result)
                    return {
                        "status": "success",
                        "data": {
                            "amount": slip_data.get("amount", "0"),
                            "date": slip_data.get("transaction_date", slip_data.get("date", "")),
                            "sender": slip_data.get("sender_name", slip_data.get("sender", "")),
                            "receiver_name": slip_data.get("receiver_name", slip_data.get("receiver", "")),
                            "receiver_phone": slip_data.get("receiver_phone", wallet_phone),
                            "bank_from": slip_data.get("bank_from", ""),
                            "bank_to": slip_data.get("bank_to", ""),
                        },
                    }
                else:
                    error_msg = result.get("message", result.get("error", "สลิปไม่ถูกต้อง"))
                    return {"status": "error", "message": f"❌ {error_msg}"}
            else:
                logger.warning(f"Endpoint {verify_url} failed with status {resp.status_code}: {resp.text}")
                
        except requests.exceptions.RequestException as e:
            logger.warning(f"Endpoint {verify_url} request error: {e}")
            continue
        except Exception as e:
            logger.warning(f"Endpoint {verify_url} error: {e}")
            continue
    
    # หากทุก endpoint ล้มเหลว
    return {"status": "error", "message": "ไม่สามารถเชื่อมต่อ Thunder API ได้ กรุณาตรวจสอบ Token หรือลองใหม่อีกครั้ง"}
