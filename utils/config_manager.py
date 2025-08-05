# utils/config_manager.py - ปรับปรุงเวอร์ชัน
import os
import json
from typing import Dict, Any, Optional, Union
import logging
import re

logger = logging.getLogger("config_manager")

class ConfigManager:
    def __init__(self, config_file="app_config.json"):
        self.config_file = config_file
        self.config = self.load_config()
        self.validators = self._setup_validators()
    
    def _setup_validators(self) -> Dict[str, callable]:
        """Setup field validators"""
        return {
            'line_channel_secret': lambda x: len(x) >= 32 if x else True,
            'line_channel_access_token': lambda x: x.startswith('Bearer ') or len(x) > 100 if x else True,
            'thunder_api_token': lambda x: len(x) >= 20 if x else True,
            'openai_api_key': lambda x: x.startswith('sk-') if x else True,
            'kbank_consumer_id': lambda x: len(x) >= 10 if x else True,
            'kbank_consumer_secret': lambda x: len(x) >= 10 if x else True,
        }
    
    def validate_field(self, key: str, value: Any) -> tuple[bool, str]:
        """Validate a single field"""
        if key in self.validators:
            try:
                is_valid = self.validators[key](value)
                if not is_valid:
                    return False, f"Invalid format for {key}"
                return True, ""
            except Exception as e:
                return False, f"Validation error for {key}: {str(e)}"
        return True, ""
    
    def load_config(self) -> Dict[str, Any]:
        """โหลด config จากไฟล์ และ environment variables"""
        # Default values from environment
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
            "thunder_enabled": self._parse_bool(os.getenv("THUNDER_ENABLED", "true")),
            "kbank_enabled": self._parse_bool(os.getenv("KBANK_ENABLED", "false")),
            "wallet_phone_number": os.getenv("WALLET_PHONE_NUMBER", ""),
        }
        
        # Validate environment values
        validation_errors = []
        for key, value in default_config.items():
            if value:  # Only validate non-empty values
                is_valid, error_msg = self.validate_field(key, value)
                if not is_valid:
                    validation_errors.append(f"Environment {key}: {error_msg}")
        
        if validation_errors:
            logger.warning("⚠️ Configuration validation warnings:")
            for error in validation_errors:
                logger.warning(f"  - {error}")
        
        # Log configuration status
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
                    
                    # Merge with validation
                    for key, value in saved_config.items():
                        if value or key in ['ai_enabled', 'slip_enabled', 'thunder_enabled', 'kbank_enabled']:
                            # Validate saved value
                            is_valid, error_msg = self.validate_field(key, value)
                            if is_valid:
                                if key in ['ai_enabled', 'slip_enabled', 'thunder_enabled', 'kbank_enabled']:
                                    default_config[key] = self._parse_bool(value)
                                else:
                                    default_config[key] = value
                            else:
                                logger.warning(f"⚠️ Ignoring invalid saved value for {key}: {error_msg}")
                    
                    logger.info(f"✅ Config file loaded and merged with validation")
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
        """บันทึก config ลงไฟล์ พร้อม validation"""
        try:
            # Validate all values before saving
            validation_errors = []
            for key, value in config_data.items():
                if value:  # Only validate non-empty values
                    is_valid, error_msg = self.validate_field(key, value)
                    if not is_valid:
                        validation_errors.append(f"{key}: {error_msg}")
            
            if validation_errors:
                logger.error("❌ Validation errors prevent saving:")
                for error in validation_errors:
                    logger.error(f"  - {error}")
                return False
            
            # Save data including boolean fields
            save_data = {k: v for k, v in config_data.items() 
                        if v or k in ['ai_enabled', 'slip_enabled', 'thunder_enabled', 'kbank_enabled']}
            
            # Create backup if file exists
            if os.path.exists(self.config_file):
                backup_file = f"{self.config_file}.backup"
                with open(self.config_file, 'r') as src, open(backup_file, 'w') as dst:
                    dst.write(src.read())
                logger.info(f"📁 Created backup: {backup_file}")
            
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
    
    def update(self, key: str, value: Any) -> tuple[bool, str]:
        """อัปเดตค่า config และบันทึก พร้อม validation"""
        old_value = self.config.get(key)
        
        # Validate new value
        is_valid, error_msg = self.validate_field(key, value)
        if not is_valid:
            logger.error(f"❌ Validation failed for {key}: {error_msg}")
            return False, error_msg
        
        # Convert boolean values
        if key in ['ai_enabled', 'slip_enabled', 'thunder_enabled', 'kbank_enabled']:
            value = self._parse_bool(value)
        
        self.config[key] = value
        success = self.save_config()
        
        if success:
            if key in ['thunder_api_token', 'line_channel_access_token', 'openai_api_key', 'kbank_consumer_id', 'kbank_consumer_secret']:
                logger.info(f"🔄 Updated {key}: {'[CONFIGURED]' if value else '[REMOVED]'}")
            else:
                logger.info(f"🔄 Updated {key}: {old_value} -> {value}")
            return True, "อัปเดตสำเร็จ"
        else:
            return False, "ไม่สามารถบันทึกได้"
    
    def update_multiple(self, updates: Dict[str, Any]) -> tuple[bool, str]:
        """อัปเดตหลายค่าพร้อมกันและบันทึก พร้อม validation"""
        logger.info(f"🔄 Updating multiple configs: {list(updates.keys())}")
        
        # Validate all updates first
        validation_errors = []
        processed_updates = {}
        
        for key, value in updates.items():
            # Validate
            is_valid, error_msg = self.validate_field(key, value)
            if not is_valid and value:  # Only fail validation for non-empty invalid values
                validation_errors.append(f"{key}: {error_msg}")
                continue
            
            # Process value
            if key in ['ai_enabled', 'slip_enabled', 'thunder_enabled', 'kbank_enabled']:
                processed_updates[key] = self._parse_bool(value)
            else:
                processed_updates[key] = value
        
        if validation_errors:
            error_message = "Validation errors: " + "; ".join(validation_errors)
            logger.error(f"❌ {error_message}")
            return False, error_message
        
        # Update values
        self.config.update(processed_updates)
        
        # Save to file
        success = self.save_config()
        
        if success:
            # Log changes
            for key, new_value in processed_updates.items():
                if key == 'ai_prompt':
                    logger.info(f"✅ Updated AI Prompt length: {len(str(new_value))} chars")
                elif key in ['thunder_api_token', 'line_channel_access_token', 'openai_api_key', 'kbank_consumer_id', 'kbank_consumer_secret']:
                    logger.info(f"✅ Updated {key}: {'[CONFIGURED]' if new_value else '[REMOVED]'}")
                else:
                    logger.info(f"✅ Updated {key}: {new_value}")
            return True, "อัปเดตการตั้งค่าทั้งหมดสำเร็จ"
        else:
            return False, "ไม่สามารถบันทึกการตั้งค่าได้"
    
    def get(self, key: str, default=None):
        """ดึงค่า config"""
        value = self.config.get(key)
        if value is None:
            # Try case insensitive search
            lower_key = key.lower()
            for k, v in self.config.items():
                if k.lower() == lower_key:
                    value = v
                    break
        
        return value if value is not None else default
    
    def get_config_summary(self) -> Dict[str, Any]:
        """ดึงสรุปการตั้งค่า (ไม่รวม sensitive data)"""
        return {
            "ai_enabled": self.config.get("ai_enabled", False),
            "slip_enabled": self.config.get("slip_enabled", False),
            "thunder_enabled": self.config.get("thunder_enabled", True),
            "kbank_enabled": self.config.get("kbank_enabled", False),
            "line_configured": bool(self.config.get("line_channel_access_token")),
            "thunder_configured": bool(self.config.get("thunder_api_token")),
            "kbank_configured": bool(self.config.get("kbank_consumer_id") and self.config.get("kbank_consumer_secret")),
            "openai_configured": bool(self.config.get("openai_api_key")),
            "ai_prompt_length": len(self.config.get("ai_prompt", "")),
        }
    
    def reload_config(self):
        """โหลด config ใหม่จากไฟล์และ environment"""
        old_summary = self.get_config_summary()
        self.config = self.load_config()
        new_summary = self.get_config_summary()
        
        # Log significant changes
        for key, new_val in new_summary.items():
            old_val = old_summary.get(key)
            if old_val != new_val:
                logger.info(f"🔄 Config change detected - {key}: {old_val} -> {new_val}")
        
        logger.info("🔄 Config reloaded")

# สร้าง instance เดียวใช้ทั่วระบบ
config_manager = ConfigManager()
