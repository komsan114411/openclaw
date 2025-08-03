import os
from typing import Dict, Any

# Initial configuration from environment variables
def load_config() -> Dict[str, Any]:
    config = {
        "line_channel_secret": os.getenv("LINE_CHANNEL_SECRET", ""),
        "line_channel_access_token": os.getenv("LINE_CHANNEL_ACCESS_TOKEN", ""),
        "openai_api_key": os.getenv("OPENAI_API_KEY", ""),
        "wallet_phone_number": os.getenv("WALLET_PHONE_NUMBER", ""),
        "thunder_api_token": os.getenv("THUNDER_API_TOKEN", ""), # เพิ่มสำหรับ Thunder Solution
        "ai_prompt": os.getenv("AI_PROMPT", "You are a helpful assistant."), # เพิ่มสำหรับ AI Prompt
        "ai_enabled": os.getenv("AI_ENABLED", "true").lower() == "true", # เพิ่มสวิตช์ปิด-เปิด
        "slip_enabled": os.getenv("SLIP_ENABLED", "true").lower() == "true", # เพิ่มสวิตช์ปิด-เปิด
    }
    return config

# Load initial config
config_store = load_config()
