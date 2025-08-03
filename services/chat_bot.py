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
    
    if not api_key or not config_store.get("ai_enabled"):
        return f"คุณพิมพ์ว่า: {text}"
        
    try:
        # ดึงประวัติแชทของ user_id นี้
        chat_history = get_user_chat_history(user_id, limit=5)
        
        # เพิ่มข้อความปัจจุบันเข้าไปในประวัติ
        messages = chat_history + [{"role": "user", "content": text}]
        
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": "gpt-3.5-turbo",
            "messages": [{"role": "system", "content": ai_prompt}] + messages,
            "max_tokens": 150,
            "temperature": 0.7,
        }
        r = requests.post(url, headers=headers, data=json.dumps(payload), timeout=15)
        r.raise_for_status()
        data = r.json()
        response_text = data["choices"][0]["message"]["content"].strip()
        return response_text
    except Exception as e:
        logger.error("ChatGPT API call failed: %s", e)
        return "ขออภัย ระบบไม่สามารถตอบกลับได้ขณะนี้."
