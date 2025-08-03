import logging
import requests
import json
from typing import Dict, Any, List
from utils.config_manager import config_manager
from models.database import get_user_chat_history

logger = logging.getLogger("chat_bot_service")

def get_chat_response(text: str, user_id: str) -> str:
    # ใช้ config_manager แทน config_store
    api_key = config_manager.get("openai_api_key")
    ai_prompt = config_manager.get("ai_prompt")
    ai_enabled = config_manager.get("ai_enabled")

    # ถ้าไม่เปิดใช้งาน AI หรือไม่มีคีย์ ให้ตอบแบบ echo
    if not ai_enabled or not api_key:
        return f"คุณพิมพ์ว่า: {text}"

    try:
        # ปรับปรุง system prompt ให้เข้มงวดมากขึ้น
        enhanced_prompt = f"""{ai_prompt}

คำสั่งสำคัญ:
- ตอบเฉพาะเรื่องที่เกี่ยวข้องกับธุรกิจ การโอนเงิน และการตรวจสอบสลิปเท่านั้น
- หากลูกค้าถามเรื่องอื่นให้ตอบว่า "ขออภัยค่ะ ผมช่วยเหลือเฉพาะเรื่องการชำระเงินและตรวจสอบสลิปเท่านั้นค่ะ"
- หากลูกค้าส่งรูปสลิป ให้บอกว่า "กำลังตรวจสอบสลิปให้ค่ะ กรุณารอสักครู่"
- ห้ามคุยนอกเรื่องเด็ดขาด
- ตอบด้วยภาษาไทยที่สุภาพและเป็นกันเอง"""

        # ดึงประวัติแชทล่าสุด
        chat_history = get_user_chat_history(user_id, limit=3)
        
        messages: List[Dict[str, str]] = [
            {"role": "system", "content": enhanced_prompt}
        ] + chat_history + [
            {"role": "user", "content": text}
        ]

        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload: Dict[str, Any] = {
            "model": "gpt-3.5-turbo",
            "messages": messages,
            "max_tokens": 100,
            "temperature": 0.3,
        }
        
        r = requests.post(url, headers=headers, data=json.dumps(payload), timeout=15)
        r.raise_for_status()
        data = r.json()
        
        response = data["choices"][0]["message"]["content"].strip()
        
        # กรองคำตอบเพิ่มเติม
        irrelevant_topics = [
            "เกม", "ดนตรี", "หนัง", "กีฬา", "อาหาร", "ท่องเที่ยว", "ความรัก", "การเมือง",
            "สัตว์เลี้ยง", "แฟชั่น", "เซเลบ", "ข่าวสาร"
        ]
        
        if any(topic in text.lower() for topic in irrelevant_topics):
            return "ขออภัยค่ะ ผมช่วยเหลือเฉพาะเรื่องการชำระเงินและตรวจสอบสลิปเท่านั้นค่ะ มีอะไรเกี่ยวกับการโอนเงินให้ช่วยไหมคะ?"
        
        return response
        
    except Exception as e:
        logger.error("ChatGPT API call failed: %s", e)
        return "ขออภัย ระบบไม่สามารถตอบกลับได้ขณะนี้ กรุณาลองใหม่อีกครั้งค่ะ"
