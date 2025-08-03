# services/slip_checker.py
import logging
import requests
from typing import Dict, Any
from config import config_store

logger = logging.getLogger("slip_checker_service")

def verify_slip_with_thunder(message_id: str) -> str:
    """ตรวจสอบสลิปผ่าน Thunder API (รองรับทั้งธนาคารและ TrueWallet)"""
    api_token = config_store.get("thunder_api_token")
    line_access_token = config_store.get("line_channel_access_token")
    slip_enabled = config_store.get("slip_enabled")
    wallet_phone = config_store.get("wallet_phone_number", "")

    if not slip_enabled:
        return "ระบบตรวจสอบสลิปถูกปิดอยู่"
    if not api_token or not line_access_token:
        return "ขออภัย ระบบตรวจสอบสลิปยังไม่ได้ตั้งค่า API Token"

    # ดาวน์โหลดรูปภาพจาก LINE
    try:
        line_url = f"https://api-data.line.me/v2/bot/message/{message_id}/content"
        headers = {"Authorization": f"Bearer {line_access_token}"}
        resp = requests.get(line_url, headers=headers, timeout=10)
        resp.raise_for_status()
        image_data = resp.content
    except Exception as e:
        logger.error("ไม่สามารถดึงรูปจาก LINE: %s", e)
        return "ไม่สามารถดาวน์โหลดรูปภาพสลิปได้"

    # เลือก endpoint ตามประเภทสลิป: ถ้าใส่ wallet_phone_number จะใช้ endpoint TrueWallet
    if wallet_phone:
        verify_url = "https://api.thunder.in.th/v1/verify/truewallet"
    else:
        verify_url = "https://api.thunder.in.th/v1/verify"

    try:
        headers = {"Authorization": f"Bearer {api_token}"}
        files = {"file": ("slip.jpg", image_data, "image/jpeg")}
        # ส่ง multipart/form-data ตามเอกสาร:contentReference[oaicite:2]{index=2}:contentReference[oaicite:3]{index=3}
        resp = requests.post(verify_url, headers=headers, files=files, timeout=15)
        resp.raise_for_status()
        data: Dict[str, Any] = resp.json()
        if data.get("status") != 200:
            return f"สลิปไม่ถูกต้อง ❌: {data.get('message', '')}"

        # แยกกรณี bank slip กับ TrueWallet slip
        if wallet_phone:
            slip = data.get("data", {})
            amount = slip.get("amount", 0)
            date = slip.get("date", "")
            sender = slip.get("sender", {}).get("name", "")
            receiver = slip.get("receiver", {})
            recv_name = receiver.get("name", "")
            recv_phone = receiver.get("phone", "")
            return (
                f"สลิปทรูวอลเล็ทถูกต้อง ✅\n"
                f"ยอดเงิน: {amount} บาท\n"
                f"วันที่: {date}\n"
                f"ผู้โอน: {sender}\n"
                f"ผู้รับ: {recv_name} ({recv_phone})"
            )
        else:
            slip = data.get("data", {})
            amount = slip.get("amount", {}).get("amount", 0)
            date = slip.get("date", "")
            sender_bank = slip.get("sender", {}).get("bank", {}).get("short", "")
            receiver_bank = slip.get("receiver", {}).get("bank", {}).get("short", "")
            return (
                f"สลิปธนาคารถูกต้อง ✅\n"
                f"ยอดเงิน: {amount} บาท\n"
                f"วันที่: {date}\n"
                f"จาก: {sender_bank}\n"
                f"ถึง: {receiver_bank}"
            )
    except Exception as e:
        logger.error("Thunder API error: %s", e)
        return "ตรวจสอบสลิปไม่ได้ในขณะนี้"
