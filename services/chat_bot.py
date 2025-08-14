import logging
import requests
from typing import Dict, Any, List, Optional
import asyncio

logger = logging.getLogger("chat_bot_service")

async def _fetch_chat_history(user_id: str, limit: int = 5) -> List[Dict[str, str]]:
    """Helper to asynchronously fetch chat history."""
    try:
        from models.database import get_user_chat_history
        return await get_user_chat_history(user_id, limit=limit)
    except Exception as e:
        logger.warning(f"⚠️ Could not get chat history: {e}")
        return []

async def get_chat_response_async(
    text: str,
    user_id: str,
    *,
    ai_enabled_override: Optional[bool] = None,
    api_key_override: Optional[str] = None,
    ai_prompt_override: Optional[str] = None,
) -> str:
    """Asynchronously generate an AI chat response using per-account settings."""
    # Import config manager lazily to avoid circular imports
    from utils.config_manager import config_manager

    ai_enabled = ai_enabled_override if ai_enabled_override is not None else config_manager.get("ai_enabled", False)
    api_key = (api_key_override or config_manager.get("openai_api_key", "")).strip()
    ai_prompt = ai_prompt_override or config_manager.get(
        "ai_prompt", "คุณเป็นผู้ช่วยที่เป็นมิตรและให้ความช่วยเหลือ"
    )

    logger.info(f"🤖 AI Chat Request - enabled: {ai_enabled}, api_key: {'Yes' if api_key else 'No'}")
    if not ai_enabled:
        return "ระบบ AI ถูกปิดการใช้งานค่ะ"
    if not api_key or len(api_key) < 10:
        return "ยังไม่ได้ตั้งค่า OpenAI API Key ค่ะ"

    # Fetch chat history asynchronously
    chat_history: List[Dict[str, Any]] = await _fetch_chat_history(user_id, limit=5)
    messages = [{"role": "system", "content": ai_prompt}]
    for msg in chat_history:
        if isinstance(msg, dict) and 'role' in msg and 'content' in msg:
            messages.append(msg)
    messages.append({"role": "user", "content": text})

    # Define a synchronous function to call the OpenAI API; this will be run in a thread
    def _call_openai(api_key: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = "https://api.openai.com/v1/chat/completions"
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        return {
            "status_code": response.status_code,
            "json": response.json() if response.ok else None,
            "text": response.text,
        }

    payload = {"model": "gpt-3.5-turbo", "messages": messages, "max_tokens": 150, "temperature": 0.7}
    # Execute the API call in a separate thread to avoid blocking the event loop
    result = await asyncio.to_thread(_call_openai, api_key, payload)
    status_code = result.get("status_code")
    data = result.get("json")
    if status_code == 200 and data:
        try:
            ai_response = data["choices"][0]["message"]["content"].strip()
            return ai_response
        except Exception:
            logger.error("❌ Unexpected OpenAI response format")
            return "ขออภัย ระบบ AI ไม่สามารถตอบได้ในขณะนี้"
    elif status_code == 401:
        return "ขออภัย API Key ไม่ถูกต้อง กรุณาตรวจสอบการตั้งค่า"
    elif status_code == 429:
        return "ขออภัย ระบบ AI ไม่สามารถตอบได้ในขณะนี้ กรุณาลองใหม่ในภายหลัง"
    else:
        logger.error(f"❌ OpenAI API Error: {status_code} - {result.get('text')}")
        return "ขออภัย ระบบ AI ไม่สามารถตอบได้ในขณะนี้"
