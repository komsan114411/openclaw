# services/chat_bot.py
import logging
import requests
import json
from typing import Dict, Any, List
from utils.config_manager import config_manager

logger = logging.getLogger("chat_bot_service")

def get_chat_response(text: str, user_id: str) -> str:
    """Get AI chat response"""
    try:
        # ตรวจสอบการตั้งค่า AI
        ai_enabled = config_manager.get("ai_enabled")
        api_key = config_manager.get("openai_api_key")
        ai_prompt = config_manager.get("ai_prompt", "คุณเป็นผู้ช่วยที่เป็นมิตรและให้ความช่วยเหลือ")
        
        logger.info(f"🤖 AI Chat Request - enabled: {ai_enabled}, api_key: {'Yes' if api_key else 'No'}")
        
        if not ai_enabled:
            logger.info("🚫 AI disabled by configuration")
            return "ระบบ AI ถูกปิดการใช้งานค่ะ"
            
        if not api_key or len(str(api_key).strip()) < 10:
            logger.info("🚫 OpenAI API key not configured")
            return "ยังไม่ได้ตั้งค่า OpenAI API Key ค่ะ"

        # ดึงประวัติแชท - ใช้ sync version
        from models.database import get_user_chat_history_sync
        chat_history = get_user_chat_history_sync(user_id, limit=10)
        
        messages: List[Dict[str, str]] = [
            {"role": "system", "content": ai_prompt}
        ]
        
        # Add chat history if available
        if chat_history:
            messages.extend(chat_history)
            
        messages.append({"role": "user", "content": text})

        # เรียก OpenAI API
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
        
        logger.info(f"🔄 Calling OpenAI API...")
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        
        logger.info(f"📊 OpenAI API Response: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            ai_response = data["choices"][0]["message"]["content"].strip()
            logger.info(f"✅ AI response generated successfully ({len(ai_response)} chars)")
            return ai_response
        elif response.status_code == 401:
            logger.error("❌ OpenAI API 401 Unauthorized - Invalid API key")
            return "ขออภัย API Key ไม่ถูกต้อง กรุณาตรวจสอบการตั้งค่า"
        elif response.status_code == 429:
            logger.error("❌ OpenAI API 429 Too Many Requests")
            return "ขออภัย ระบบ AI ไม่สามารถตอบได้ในขณะนี้ กรุณาลองใหม่ในภายหลัง"
        else:
            logger.error(f"❌ OpenAI API Error: {response.status_code} - {response.text}")
            return "ขออภัย ระบบ AI ไม่สามารถตอบได้ในขณะนี้"
            
    except requests.exceptions.Timeout:
        logger.error("❌ OpenAI API timeout")
        return "ขออภัย ระบบ AI ตอบสนองช้า กรุณาลองใหม่อีกครั้ง"
    except requests.exceptions.RequestException as e:
        logger.error(f"❌ OpenAI API request error: {e}")
        return "ขออภัย ระบบ AI ไม่สามารถตอบได้ในขณะนี้"
    except Exception as e:
        logger.error(f"❌ Chat bot unexpected error: {e}")
        return "ขออภัย เกิดข้อผิดพลาดในระบบ AI"
