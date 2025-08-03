# services/chat_bot.py
import logging
import requests
import json
from typing import Dict, Any, List
from utils.config_manager import config_manager
from models.database import get_user_chat_history

logger = logging.getLogger("chat_bot_service")

def get_chat_response(text: str, user_id: str) -> str:
    api_key = config_manager.get("openai_api_key")
    ai_prompt = config_manager.get("ai_prompt")  # โหลด Prompt ล่าสุด
    ai_enabled = config_manager.get("ai_enabled")

    # ถ้าไม่เปิด AI ให้ตอบตามข้อความแจ้ง
    if not ai_enabled:
        return "ระบบ AI ถูกปิดการใช้งานค่ะ"
    if not api_key:
        return "ยังไม่ได้ตั้งค่า OpenAI API Key ค่ะ"

    try:
        # ดึงประวัติแชทมากขึ้นเพื่อจำบริบท (เช่น 15 รายการ)
        chat_history = get_user_chat_history(user_id, limit=15)
        messages: List[Dict[str, str]] = [{"role": "system", "content": ai_prompt}] + chat_history + [{"role": "user", "content": text}]

        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload: Dict[str, Any] = {
            "model": "gpt-3.5-turbo",
            "messages": messages,
            "max_tokens": 150,
            "temperature": 0.7,
        }
        r = requests.post(url, headers=headers, data=json.dumps(payload), timeout=20)
        r.raise_for_status()
        data = r.json()
        response = data["choices"][0]["message"]["content"].strip()
        return response
    except requests.exceptions.RequestException as e:
        logger.error("OpenAI API error: %s", e)
        return "ขออภัย ระบบ AI ไม่สามารถตอบได้ในขณะนี้"
    except Exception as e:
        logger.error("Chat bot error: %s", e)
        return "ขออภัย เกิดข้อผิดพลาดในระบบ AI"
