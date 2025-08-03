import os
import json
from typing import Dict, Any

# กำหนดพาธไฟล์สำหรับเก็บ config
CONFIG_FILE = "config_persistent.json"

def load_default_config() -> Dict[str, Any]:
    """โหลด config เริ่มต้นจาก environment variables"""
    return {
        # Token สำหรับ LINE
        "line_channel_secret": os.getenv("LINE_CHANNEL_SECRET", ""),
        "line_channel_access_token": os.getenv("LINE_CHANNEL_ACCESS_TOKEN", ""),
        # Token สำหรับ Thunder API
        "thunder_api_token": os.getenv("THUNDER_API_TOKEN", ""),
        # Token สำหรับ OpenAI API
        "openai_api_key": os.getenv("OPENAI_API_KEY", ""),
        # Prompt สำหรับ AI ตอบกลับ (ตั้งค่าได้จากหน้าเว็บ)
        "ai_prompt": os.getenv("AI_PROMPT", 
            "คุณเป็นผู้ช่วยระบบชำระเงินที่เชี่ยวชาญเรื่องการโอนเงินและตรวจสอบสลิป ตอบเฉพาะเรื่องที่เกี่ยวข้องกับธุรกิจเท่านั้น"),
        # เปิด-ปิดฟีเจอร์ AI (true/false)
        "ai_enabled": os.getenv("AI_ENABLED", "true").lower() == "true",
        # เปิด-ปิดฟีเจอร์ตรวจสลิป (true/false)
        "slip_enabled": os.getenv("SLIP_ENABLED", "true").lower() == "true",
        # อื่น ๆ เช่นเบอร์วอลเลท
        "wallet_phone_number": os.getenv("WALLET_PHONE_NUMBER", ""),
    }

def load_saved_config() -> Dict[str, Any]:
    """โหลด config ที่บันทึกไว้จากไฟล์"""
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        print(f"Error loading saved config: {e}")
    return {}

def save_config(config: Dict[str, Any]) -> bool:
    """บันทึก config ลงไฟล์"""
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"Error saving config: {e}")
        return False

def load_config() -> Dict[str, Any]:
    """โหลด config รวม (environment + saved)"""
    # เริ่มจาก default config
    config = load_default_config()
    
    # อัปเดตด้วยค่าที่บันทึกไว้ (จะ override default)
    saved_config = load_saved_config()
    config.update(saved_config)
    
    return config

def update_config(new_config: Dict[str, Any]) -> bool:
    """อัปเดต config และบันทึกลงไฟล์"""
    global config_store
    
    # อัปเดต config_store
    config_store.update(new_config)
    
    # บันทึกลงไฟล์
    return save_config(config_store)

# โหลด config ไว้ใช้งานทั่วระบบ
config_store = load_config()
