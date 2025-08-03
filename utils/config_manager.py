import os
import json
from typing import Dict, Any
import logging

logger = logging.getLogger("config_manager")

class ConfigManager:
    def __init__(self, config_file="app_config.json"):
        self.config_file = config_file
        self.config = self.load_config()
    
    def load_config(self) -> Dict[str, Any]:
        """โหลด config จากไฟล์ หากไม่มีให้ใช้ค่า default"""
        default_config = {
            "line_channel_secret": os.getenv("LINE_CHANNEL_SECRET", ""),
            "line_channel_access_token": os.getenv("LINE_CHANNEL_ACCESS_TOKEN", ""),
            "thunder_api_token": os.getenv("THUNDER_API_TOKEN", ""),
            "openai_api_key": os.getenv("OPENAI_API_KEY", ""),
            "ai_prompt": "คุณเป็นผู้ช่วยระบบชำระเงินที่เชี่ยวชาญเรื่องการโอนเงินและตรวจสอบสลิป ตอบเฉพาะเรื่องที่เกี่ยวข้องกับธุรกิจเท่านั้น",
            "ai_enabled": True,
            "slip_enabled": True,
            "wallet_phone_number": os.getenv("WALLET_PHONE_NUMBER", ""),
        }
        
        try:
            if os.path.exists(self.config_file):
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    saved_config = json.load(f)
                    # ผสมค่า default กับค่าที่บันทึกไว้
                    default_config.update(saved_config)
                    logger.info(f"Loaded config from {self.config_file}")
            else:
                logger.info("Config file not found, using default values")
        except Exception as e:
            logger.error(f"Error loading config: {e}")
        
        return default_config
    
    def save_config(self) -> bool:
        """บันทึก config ลงไฟล์"""
        try:
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, ensure_ascii=False, indent=2)
            logger.info(f"Config saved to {self.config_file}")
            return True
        except Exception as e:
            logger.error(f"Error saving config: {e}")
            return False
    
    def update(self, key: str, value: Any) -> bool:
        """อัปเดตค่า config และบันทึก"""
        self.config[key] = value
        return self.save_config()
    
    def update_multiple(self, updates: Dict[str, Any]) -> bool:
        """อัปเดตหลายค่าพร้อมกันและบันทึก"""
        self.config.update(updates)
        return self.save_config()
    
    def get(self, key: str, default=None):
        """ดึงค่า config"""
        return self.config.get(key, default)

# สร้าง instance เดียวใช้ทั่วระบบ
config_manager = ConfigManager()
