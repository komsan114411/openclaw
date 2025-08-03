import logging
import requests
import json
from typing import Dict, Any, List
from config import config_store
from models.database import get_user_chat_history

logger = logging.getLogger("chat_bot_service")

def get_chat_response(text: str, user_id: str) -> str:
    api_key = config_store.get("openai_api_key")
    ai_prompt = config_store.get("ai_prompt")
    ai_enabled = config_store.get("ai_enabled")

    # ถ้าไม่เปิดใช้งาน AI หรือไม่มีคีย์ ให้ตอบแบบ echo
    if not ai_enabled or not api_key:
        return f"คุณพิมพ์ว่า: {text}"

    try:
        # ดึงประวัติแชทล่าสุด (เพื่อใช้เป็น context)
        chat_history = get_user_chat_history(user_id, limit=5)
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
        r = requests.post(url, headers=headers, data=json.dumps(payload), timeout=15)
        r.raise_for_status()
        data = r.json()
        return data["choices"][0]["message"]["content"].strip()
    except Exception as e:
        logger.error("ChatGPT API call failed: %s", e)
        return "ขออภัย ระบบไม่สามารถตอบกลับได้ขณะนี้."
