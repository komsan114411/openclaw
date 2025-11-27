# services/chat_bot.py - Fixed version with proper async handling
import logging
import httpx
from typing import Dict, Any, List, Optional
import asyncio
import os

logger = logging.getLogger("chat_bot_service")

async def _fetch_chat_history(user_id: str, limit: int = 5) -> List[Dict[str, str]]:
    """Helper to asynchronously fetch chat history."""
    try:
        from models.database import get_user_chat_history
        history = await get_user_chat_history(user_id, limit=limit)
        
        # Convert ChatRecord objects to dict format
        messages = []
        for record in history:
            if hasattr(record, 'direction') and hasattr(record, 'message_text'):
                role = "user" if record.direction == "in" else "assistant"
                if record.message_text:
                    messages.append({"role": role, "content": record.message_text})
        
        return messages
    except Exception as e:
        logger.warning(f"⚠️ Could not get chat history: {e}")
        return []

async def get_chat_response_async(
    text: str,
    user_id: str = "default",
    *,
    personality: Optional[str] = None,
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    temperature: Optional[float] = None,
    ai_enabled_override: Optional[bool] = None,
    api_key_override: Optional[str] = None,
    ai_prompt_override: Optional[str] = None,
) -> str:
    """Asynchronously generate an AI chat response using per-account settings."""
    try:
        # Import config manager lazily to avoid circular imports
        from utils.config_manager import config_manager

        ai_enabled = ai_enabled_override if ai_enabled_override is not None else config_manager.get("ai_enabled", False)
        final_api_key = (api_key or api_key_override or config_manager.get("openai_api_key", "")).strip()
        ai_prompt = personality or ai_prompt_override or config_manager.get(
            "ai_prompt", "คุณเป็นผู้ช่วยที่เป็นมิตรและให้ความช่วยเหลือ"
        )
        ai_model = model or "gpt-3.5-turbo"

        logger.info(f"🤖 AI Chat Request - enabled: {ai_enabled}, api_key: {'Yes' if final_api_key else 'No'}")
        
        if not ai_enabled:
            return "ระบบ AI ถูกปิดการใช้งานค่ะ"
        if not final_api_key or len(final_api_key) < 10:
            return "ยังไม่ได้ตั้งค่า OpenAI API Key ค่ะ"

        # Fetch chat history asynchronously
        chat_history = await _fetch_chat_history(user_id, limit=5)
        
        messages = [{"role": "system", "content": ai_prompt}]
        messages.extend(chat_history)
        messages.append({"role": "user", "content": text})

        # Call OpenAI API asynchronously
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {final_api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": ai_model,
            "messages": messages,
            "max_tokens": 150,
            "temperature": temperature if temperature is not None else 0.7
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, headers=headers, json=payload, timeout=30)
                
                if response.status_code == 200:
                    data = response.json()
                    ai_response = data["choices"][0]["message"]["content"].strip()
                    return ai_response
                elif response.status_code == 401:
                    return "ขออภัย API Key ไม่ถูกต้อง กรุณาตรวจสอบการตั้งค่า"
                elif response.status_code == 429:
                    return "ขออภัย ระบบ AI ไม่สามารถตอบได้ในขณะนี้ กรุณาลองใหม่ในภายหลัง"
                else:
                    logger.error(f"❌ OpenAI API Error: {response.status_code} - {response.text}")
                    return "ขออภัย ระบบ AI ไม่สามารถตอบได้ในขณะนี้"
                    
            except httpx.TimeoutException:
                return "ขออภัย ระบบ AI ตอบสนองช้า กรุณาลองใหม่"
            except Exception as e:
                logger.error(f"❌ Error calling OpenAI: {e}")
                return "ขออภัย เกิดข้อผิดพลาดในระบบ AI"
                
    except Exception as e:
        logger.error(f"❌ Error in get_chat_response_async: {e}")
        return "ขออภัย เกิดข้อผิดพลาดในระบบ"

def get_chat_response(text: str, user_id: str, *, ai_enabled_override=None,
                      api_key_override=None, ai_prompt_override=None) -> str:
    """เรียกฟังก์ชัน get_chat_response_async แบบ synchronous"""
    try:
        # ตรวจสอบว่ามี event loop อยู่แล้วหรือไม่
        try:
            loop = asyncio.get_running_loop()
            # ถ้ามี loop อยู่แล้ว ให้สร้าง task
            future = asyncio.ensure_future(
                get_chat_response_async(
                    text,
                    user_id,
                    ai_enabled_override=ai_enabled_override,
                    api_key_override=api_key_override,
                    ai_prompt_override=ai_prompt_override,
                )
            )
            # รอให้ task เสร็จ
            return asyncio.run_coroutine_threadsafe(future, loop).result()
        except RuntimeError:
            # ถ้าไม่มี loop ให้สร้างใหม่
            return asyncio.run(
                get_chat_response_async(
                    text,
                    user_id,
                    ai_enabled_override=ai_enabled_override,
                    api_key_override=api_key_override,
                    ai_prompt_override=ai_prompt_override,
                )
            )
    except Exception as e:
        logger.error(f"❌ Error in get_chat_response: {e}")
        return "ขออภัย เกิดข้อผิดพลาดในระบบ"


# เพิ่มที่ท้ายไฟล์ services/chat_bot.py

class ChatBot:
    """Wrapper class for backward compatibility"""
    
    def __init__(self, ai_enabled=None, api_key=None, ai_prompt=None):
        self.ai_enabled = ai_enabled
        self.api_key = api_key
        self.ai_prompt = ai_prompt
    
    def get_response(self, text: str, user_id: str) -> str:
        """Get chatbot response"""
        return get_chat_response(
            text=text,
            user_id=user_id,
            ai_enabled_override=self.ai_enabled,
            api_key_override=self.api_key,
            ai_prompt_override=self.ai_prompt
        )
    
    async def get_response_async(self, text: str, user_id: str) -> str:
        """Get chatbot response asynchronously"""
        return await get_chat_response_async(
            text=text,
            user_id=user_id,
            ai_enabled_override=self.ai_enabled,
            api_key_override=self.api_key,
            ai_prompt_override=self.ai_prompt
        )
