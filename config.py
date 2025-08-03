import os
from typing import Dict, Any

def load_config() -> Dict[str, Any]:
    config = {
        # Token สำหรับ LINE
        "line_channel_secret": os.getenv("LINE_CHANNEL_SECRET", ""),
        "line_channel_access_token": os.getenv("LINE_CHANNEL_ACCESS_TOKEN", ""),
        # Token สำหรับ Thunder API
        "thunder_api_token": os.getenv("THUNDER_API_TOKEN", ""),
        # Token สำหรับ OpenAI API
        "openai_api_key": os.getenv("OPENAI_API_KEY", ""),
        # Prompt สำหรับ AI ตอบกลับ (ตั้งค่าได้ตามข้อมูลบริษัท)
        "ai_prompt": os.getenv("AI_PROMPT", "You are a helpful assistant."),
        # เปิด‑ปิดฟีเจอร์ AI (true/false)
        "ai_enabled": os.getenv("AI_ENABLED", "true").lower() == "true",
        # เปิด‑ปิดฟีเจอร์ตรวจสลิป (true/false)
        "slip_enabled": os.getenv("SLIP_ENABLED", "true").lower() == "true",
        # อื่น ๆ เช่นเบอร์วอลเลท
        "wallet_phone_number": os.getenv("WALLET_PHONE_NUMBER", ""),
    }
    return config

# โหลด config ไว้ใช้งานทั่วระบบ
config_store = load_config()
