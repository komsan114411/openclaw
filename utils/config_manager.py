# utils/config_manager.py
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
        # อ่านจาก environment variables
        default_config = {
            "line_channel_secret": os.getenv("LINE_CHANNEL_SECRET", ""),
            "line_channel_access_token": os.getenv("LINE_CHANNEL_ACCESS_TOKEN", ""),
            "thunder_api_token": os.getenv("THUNDER_API_TOKEN", ""),
            "openai_api_key": os.getenv("OPENAI_API_KEY", ""),
            "kbank_consumer_id": os.getenv("KBANK_CONSUMER_ID", ""),
            "kbank_consumer_secret": os.getenv("KBANK_CONSUMER_SECRET", ""),
            "ai_prompt": os.getenv("AI_PROMPT", 
                "คุณเป็นผู้ช่วยระบบชำระเงินที่เชี่ยวชาญเรื่องการโอนเงินและตรวจสอบสลิป ตอบเฉพาะเรื่องที่เกี่ยวข้องกับธุรกิจเท่านั้น กรุณาตอบด้วยภาษาไทยที่สุภาพและเป็นกันเอง"),
            "ai_enabled": self._parse_bool(os.getenv("AI_ENABLED", "true")),
            "slip_enabled": self._parse_bool(os.getenv("SLIP_ENABLED", "true")),
            "thunder_enabled": self._parse_bool(os.getenv("THUNDER_ENABLED", "true")),  # เพิ่มใหม่
            "kbank_enabled": self._parse_bool(os.getenv("KBANK_ENABLED", "false")),
            "wallet_phone_number": os.getenv("WALLET_PHONE_NUMBER", ""),
        }
        
        # Log ว่าพบ token หรือไม่
        logger.info(f"🔍 Configuration loaded:")
        logger.info(f"  - LINE Access Token: {'✅' if default_config['line_channel_access_token'] else '❌'}")
        logger.info(f"  - Thunder API Token: {'✅' if default_config['thunder_api_token'] else '❌'}")
        logger.info(f"  - OpenAI API Key: {'✅' if default_config['openai_api_key'] else '❌'}")
        logger.info(f"  - KBank Credentials: {'✅' if (default_config['kbank_consumer_id'] and default_config['kbank_consumer_secret']) else '❌'}")
        logger.info(f"  - System Status: AI={'ON' if default_config['ai_enabled'] else 'OFF'}, Slip={'ON' if default_config['slip_enabled'] else 'OFF'}, Thunder={'ON' if default_config['thunder_enabled'] else 'OFF'}, KBank={'ON' if default_config['kbank_enabled'] else 'OFF'}")
        
        try:
            if os.path.exists(self.config_file):
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    saved_config = json.load(f)
                    # ผสมค่า default กับค่าที่บันทึกไว้
                    for key, value in saved_config.items():
                        if value or key in ['ai_enabled', 'slip_enabled', 'thunder_enabled', 'kbank_enabled']:
                            if key in ['ai_enabled', 'slip_enabled', 'thunder_enabled', 'kbank_enabled']:
                                default_config[key] = self._parse_bool(value)
                            else:
                                default_config[key] = value
                    
                    logger.info(f"✅ Config file loaded and merged")
            else:
                logger.info("📁 No config file found, using environment/default values")
                self.save_config_to_file(default_config)
        except Exception as e:
            logger.error(f"❌ Error loading config: {e}")
        
        return default_config
    
    def _parse_bool(self, value: Any) -> bool:
        """แปลง string เป็น boolean อย่างถูกต้อง"""
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            value_lower = value.lower().strip()
            if value_lower in ["true", "1", "yes", "on", "enabled"]:
                return True
            elif value_lower in ["false", "0", "no", "off", "disabled", ""]:
                return False
            else:
                return bool(value)
        return bool(value)
    
    def save_config_to_file(self, config_data: Dict[str, Any]) -> bool:
        """บันทึก config ลงไฟล์"""
        try:
            # บันทึกทุกค่า รวมถึง boolean fields
            save_data = {k: v for k, v in config_data.items() if v or k in ['ai_enabled', 'slip_enabled', 'thunder_enabled', 'kbank_enabled']}
            
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
        
        # แปลง boolean อย่างถูกต้องสำหรับ boolean fields
        if key in ['ai_enabled', 'slip_enabled', 'thunder_enabled', 'kbank_enabled']:
            value = self._parse_bool(value)
        
        self.config[key] = value
        success = self.save_config()
        
        if success:
            if key in ['thunder_api_token', 'line_channel_access_token', 'openai_api_key', 'kbank_consumer_id', 'kbank_consumer_secret']:
                logger.info(f"🔄 Updated {key}: {'[CONFIGURED]' if value else '[REMOVED]'}")
            else:
                logger.info(f"🔄 Updated {key}: {old_value} -> {value}")
        
        return success
    
    def update_multiple(self, updates: Dict[str, Any]) -> bool:
        """อัปเดตหลายค่าพร้อมกันและบันทึก"""
        logger.info(f"🔄 Updating multiple configs: {list(updates.keys())}")
        
        # แปลง boolean fields อย่างถูกต้อง
        processed_updates = {}
        for key, value in updates.items():
            if key in ['ai_enabled', 'slip_enabled', 'thunder_enabled', 'kbank_enabled']:
                processed_updates[key] = self._parse_bool(value)
            else:
                processed_updates[key] = value
        
        # อัปเดตค่าใหม่
        self.config.update(processed_updates)
        
        # บันทึกลงไฟล์
        success = self.save_config()
        
        if success:
            # Log การเปลี่ยนแปลง
            for key, new_value in processed_updates.items():
                if key == 'ai_prompt':
                    logger.info(f"✅ Updated AI Prompt length: {len(str(new_value))} chars")
                elif key in ['thunder_api_token', 'line_channel_access_token', 'openai_api_key', 'kbank_consumer_id', 'kbank_consumer_secret']:
                    logger.info(f"✅ Updated {key}: {'[CONFIGURED]' if new_value else '[REMOVED]'}")
                else:
                    logger.info(f"✅ Updated {key}: {new_value}")
        
        return success
    
    def get(self, key: str, default=None):
        """ดึงค่า config"""
        value = self.config.get(key)
        if value is None:
            # ลองหาด้วย case insensitive
            lower_key = key.lower()
            for k, v in self.config.items():
                if k.lower() == lower_key:
                    value = v
                    break
        
        return value if value is not None else default
    
    def reload_config(self):
        """โหลด config ใหม่จากไฟล์และ environment"""
        self.config = self.load_config()
        logger.info("🔄 Config reloaded")

# สร้าง instance เดียวใช้ทั่วระบบ
config_manager = ConfigManager()
