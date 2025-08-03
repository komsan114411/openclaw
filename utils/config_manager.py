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
        # อ่านจาก environment variables (ทั้งตัวใหญ่และตัวเล็ก)
        default_config = {
            "line_channel_secret": os.getenv("LINE_CHANNEL_SECRET", os.getenv("line_channel_secret", "")),
            "line_channel_access_token": os.getenv("LINE_CHANNEL_ACCESS_TOKEN", os.getenv("line_channel_access_token", "")),
            "thunder_api_token": os.getenv("THUNDER_API_TOKEN", os.getenv("thunder_api_token", "")),
            "openai_api_key": os.getenv("OPENAI_API_KEY", os.getenv("openai_api_key", "")),
            "ai_prompt": os.getenv("AI_PROMPT", os.getenv("ai_prompt",
                "คุณเป็นผู้ช่วยระบบชำระเงินที่เชี่ยวชาญเรื่องการโอนเงินและตรวจสอบสลิป ตอบเฉพาะเรื่องที่เกี่ยวข้องกับธุรกิจเท่านั้น กรุณาตอบด้วยภาษาไทยที่สุภาพและเป็นกันเอง")),
            "ai_enabled": self._parse_bool(os.getenv("AI_ENABLED", os.getenv("ai_enabled", "true"))),
            "slip_enabled": self._parse_bool(os.getenv("SLIP_ENABLED", os.getenv("slip_enabled", "true"))),
            "wallet_phone_number": os.getenv("WALLET_PHONE_NUMBER", os.getenv("wallet_phone_number", "")),
        }
        
        # Log ว่าพบ token หรือไม่ (ไม่แสดงค่าจริง)
        logger.info(f"🔍 Environment check:")
        logger.info(f"  - LINE_CHANNEL_ACCESS_TOKEN: {'✅ Found' if default_config['line_channel_access_token'] else '❌ Not found'}")
        logger.info(f"  - LINE_CHANNEL_SECRET: {'✅ Found' if default_config['line_channel_secret'] else '❌ Not found'}")
        logger.info(f"  - THUNDER_API_TOKEN: {'✅ Found' if default_config['thunder_api_token'] else '❌ Not found'}")
        logger.info(f"  - OPENAI_API_KEY: {'✅ Found' if default_config['openai_api_key'] else '❌ Not found'}")
        
        try:
            if os.path.exists(self.config_file):
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    saved_config = json.load(f)
                    # ผสมค่า default กับค่าที่บันทึกไว้
                    # ให้ค่าที่บันทึกไว้มีความสำคัญกว่า env vars
                    for key, value in saved_config.items():
                        if value:  # ถ้ามีค่าที่บันทึกไว้ ให้ใช้ค่านั้น
                            default_config[key] = value
                    
                    logger.info(f"✅ Loaded config from {self.config_file}")
                    logger.info(f"  - AI Prompt length: {len(default_config.get('ai_prompt', ''))} chars")
            else:
                logger.info("📁 Config file not found, using environment values")
                # สร้างไฟล์ config ใหม่
                self.save_config_to_file(default_config)
        except Exception as e:
            logger.error(f"❌ Error loading config: {e}")
        
        return default_config
    
    def _parse_bool(self, value: str) -> bool:
        """แปลง string เป็น boolean"""
        if isinstance(value, bool):
            return value
        return str(value).lower() in ["true", "1", "yes", "on", "enabled"]
    
    def save_config_to_file(self, config_data: Dict[str, Any]) -> bool:
        """บันทึก config ลงไฟล์"""
        try:
            # ไม่บันทึก token ที่ว่างเปล่า
            save_data = {k: v for k, v in config_data.items() if v or k in ['ai_enabled', 'slip_enabled']}
            
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(save_data, f, ensure_ascii=False, indent=2)
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
            if key in ['thunder_api_token', 'line_channel_access_token', 'openai_api_key']:
                logger.info(f"🔄 Updated {key}: {'[SET]' if value else '[REMOVED]'}")
            else:
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
                    logger.info(f"✅ Updated AI Prompt: {len(str(old_val or ''))} chars -> {len(str(new_value))} chars")
                elif key in ['thunder_api_token', 'line_channel_access_token', 'openai_api_key']:
                    logger.info(f"✅ Updated {key}: {'[SET]' if new_value else '[REMOVED]'}")
                else:
                    logger.info(f"✅ Updated {key}: {old_val} -> {new_value}")
        
        return success
    
    def get(self, key: str, default=None):
        """ดึงค่า config - ตรวจสอบทั้งตัวเล็กและตัวใหญ่"""
        # ลองหาแบบตรงๆ ก่อน
        value = self.config.get(key)
        
        # ถ้าไม่เจอ ลองแปลงเป็นตัวเล็ก/ใหญ่
        if value is None:
            # ลองตัวเล็กทั้งหมด
            lower_key = key.lower()
            value = self.config.get(lower_key)
            
            # ลองตัวใหญ่ทั้งหมด
            if value is None:
                upper_key = key.upper()
                value = self.config.get(upper_key)
        
        # ถ้ายังไม่เจอ ใช้ default
        if value is None:
            value = default
            
        return value
    
    def reload_config(self):
        """โหลด config ใหม่จากไฟล์และ environment"""
        self.config = self.load_config()
        logger.info("🔄 Config reloaded")
        
        # แสดงสถานะ token หลังโหลดใหม่
        logger.info(f"📊 Config status after reload:")
        logger.info(f"  - Thunder API: {'✅ Set' if self.get('thunder_api_token') else '❌ Not set'}")
        logger.info(f"  - LINE Access: {'✅ Set' if self.get('line_channel_access_token') else '❌ Not set'}")
        logger.info(f"  - OpenAI: {'✅ Set' if self.get('openai_api_key') else '❌ Not set'}")

# สร้าง instance เดียวใช้ทั่วระบบ
config_manager = ConfigManager()
