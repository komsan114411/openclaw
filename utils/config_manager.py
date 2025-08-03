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
            "ai_prompt": os.getenv("AI_PROMPT", 
                "คุณเป็นผู้ช่วยระบบชำระเงินที่เชี่ยวชาญเรื่องการโอนเงินและตรวจสอบสลิป ตอบเฉพาะเรื่องที่เกี่ยวข้องกับธุรกิจเท่านั้น กรุณาตอบด้วยภาษาไทยที่สุภาพและเป็นกันเอง"),
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
                    logger.info(f"✅ Loaded config from {self.config_file}")
                    # Debug: แสดงค่าที่โหลดมา
                    logger.info(f"AI Prompt length: {len(default_config.get('ai_prompt', ''))}")
            else:
                logger.info("📁 Config file not found, using default values")
                # สร้างไฟล์ config ใหม่
                self.save_config_to_file(default_config)
        except Exception as e:
            logger.error(f"❌ Error loading config: {e}")
        
        return default_config
    
    def save_config_to_file(self, config_data: Dict[str, Any]) -> bool:
        """บันทึก config ลงไฟล์"""
        try:
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(config_data, f, ensure_ascii=False, indent=2)
            logger.info(f"✅ Config saved to {self.config_file}")
            return True
        except Exception as e:
            logger.error(f"❌ Error saving config: {e}")
            return False
    
    def save_config(self) -> bool:
        """บันทึก config ปัจจุบันลงไฟล์"""
        return self.save_config_to_file(self.config)
    
    def update(self, key: str, value: Any) -> bool:
        """อัปเดตค่า config และบันทึก"""
        old_value = self.config.get(key)
        self.config[key] = value
        success = self.save_config()
        if success:
            logger.info(f"🔄 Updated {key}: {old_value} -> {value}")
        return success
    
    def update_multiple(self, updates: Dict[str, Any]) -> bool:
        """อัปเดตหลายค่าพร้อมกันและบันทึก"""
        logger.info(f"🔄 Updating multiple configs: {list(updates.keys())}")
        
        # เก็บค่าเดิมไว้ log
        old_values = {k: self.config.get(k) for k in updates.keys()}
        
        # อัปเดตค่าใหม่
        self.config.update(updates)
        
        # บันทึกลงไฟล์
        success = self.save_config()
        
        if success:
            # Log การเปลี่ยนแปลง
            for key, new_value in updates.items():
                old_val = old_values.get(key)
                if key == 'ai_prompt':
                    logger.info(f"✅ Updated AI Prompt: {len(str(old_val))} chars -> {len(str(new_value))} chars")
                else:
                    logger.info(f"✅ Updated {key}: {old_val} -> {new_value}")
        
        return success
    
    def get(self, key: str, default=None):
        """ดึงค่า config"""
        value = self.config.get(key, default)
        if key == 'ai_prompt':
            logger.debug(f"📖 Getting AI Prompt: {len(str(value))} characters")
        return value
    
    def reload_config(self):
        """โหลด config ใหม่จากไฟล์"""
        self.config = self.load_config()
        logger.info("🔄 Config reloaded from file")

# สร้าง instance เดียวใช้ทั่วระบบ
config_manager = ConfigManager()
