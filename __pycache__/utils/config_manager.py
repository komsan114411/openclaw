"""
Configuration Manager
จัดการการตั้งค่าของระบบผ่าน MongoDB
"""
import logging
import os
from typing import Any, Optional, Dict
from datetime import datetime

logger = logging.getLogger("config_manager")

class ConfigManager:
    """
    Configuration Manager - จัดการ configuration ของระบบ
    
    ใช้ในรูปแบบ Singleton เพื่อให้มี instance เดียวในทั้งระบบ
    """
    
    _instance = None
    _initialized = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ConfigManager, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        """Initialize configuration manager"""
        if not self._initialized:
            self.db = None
            self.collection_name = "system_config"
            self._cache = {}
            self._default_config = self._get_default_config()
            ConfigManager._initialized = True
            logger.info("✅ ConfigManager initialized")
    
    def _get_default_config(self) -> Dict[str, Any]:
        """ค่า configuration เริ่มต้น"""
        return {
            # System Settings
            "system_name": "LINE OA Management System",
            "system_version": "2.1.0",
            
            # Slip Verification Settings
            "slip_enabled": False,
            "thunder_enabled": True,
            "thunder_api_token": os.getenv("THUNDER_API_TOKEN", ""),
            "kbank_enabled": False,
            "kbank_consumer_id": os.getenv("KBANK_CONSUMER_ID", ""),
            "kbank_consumer_secret": os.getenv("KBANK_CONSUMER_SECRET", ""),
            "kbank_sandbox_mode": True,
            
            # AI Settings (Global - สำหรับ fallback)
            "ai_enabled": False,
            "openai_api_key": os.getenv("OPENAI_API_KEY", ""),
            "ai_prompt": "คุณเป็นผู้ช่วยที่เป็นมิตรและให้ความช่วยเหลือ",
            
            # LINE Settings (Global)
            "line_channel_access_token": os.getenv("LINE_CHANNEL_ACCESS_TOKEN", ""),
            
            # Performance Settings
            "max_chat_history": 10,
            "cache_timeout": 300,
            
            # Feature Flags
            "enable_chat_history": True,
            "enable_analytics": True,
            "enable_notifications": True,
        }
    
    def initialize_db(self, db):
        """
        เชื่อมต่อกับ database
        
        Args:
            db: MongoDB database instance
        """
        try:
            self.db = db
            self.collection = db[self.collection_name]
            
            # สร้าง index
            self.collection.create_index("key", unique=True)
            
            # Initialize default config ถ้ายังไม่มี
            self._initialize_default_config()
            
            # Load config to cache
            self._load_cache()
            
            logger.info("✅ ConfigManager database initialized")
            return True
            
        except Exception as e:
            logger.error(f"❌ Error initializing database: {e}")
            return False
    
    def _initialize_default_config(self):
        """สร้าง default configuration ในฐานข้อมูล"""
        try:
            if self.db is None:
                return
            
            # ตรวจสอบว่ามี config อยู่แล้วหรือไม่
            existing_count = self.collection.count_documents({})
            
            if existing_count == 0:
                # ใส่ default config
                for key, value in self._default_config.items():
                    self.collection.update_one(
                        {"key": key},
                        {
                            "$set": {
                                "value": value,
                                "updated_at": datetime.utcnow(),
                                "created_at": datetime.utcnow()
                            }
                        },
                        upsert=True
                    )
                logger.info("✅ Default configuration created")
        except Exception as e:
            logger.error(f"❌ Error creating default config: {e}")
    
    def _load_cache(self):
        """โหลด configuration ทั้งหมดเข้า cache"""
        try:
            if self.db is None:
                return
            
            configs = self.collection.find({})
            for config in configs:
                self._cache[config["key"]] = config["value"]
            
            logger.info(f"✅ Loaded {len(self._cache)} configurations to cache")
        except Exception as e:
            logger.error(f"❌ Error loading cache: {e}")
    
    def get(self, key: str, default: Any = None) -> Any:
        """
        ดึงค่า configuration
        
        Args:
            key: Configuration key
            default: ค่า default ถ้าไม่เจอ
            
        Returns:
            Configuration value
        """
        try:
            # ลองดูใน cache ก่อน
            if key in self._cache:
                return self._cache[key]
            
            # ถ้าไม่มีใน cache และมี database
            if self.db is not None:
                doc = self.collection.find_one({"key": key})
                if doc:
                    value = doc["value"]
                    self._cache[key] = value
                    return value
            
            # ถ้าไม่เจอ ใช้ default จาก parameter หรือ _default_config
            if default is not None:
                return default
            
            return self._default_config.get(key)
            
        except Exception as e:
            logger.error(f"❌ Error getting config {key}: {e}")
            return default if default is not None else self._default_config.get(key)
    
    def set(self, key: str, value: Any) -> bool:
        """
        ตั้งค่า configuration
        
        Args:
            key: Configuration key
            value: Configuration value
            
        Returns:
            True ถ้าสำเร็จ
        """
        try:
            # อัปเดต cache
            self._cache[key] = value
            
            # อัปเดต database
            if self.db is not None:
                self.collection.update_one(
                    {"key": key},
                    {
                        "$set": {
                            "value": value,
                            "updated_at": datetime.utcnow()
                        },
                        "$setOnInsert": {
                            "created_at": datetime.utcnow()
                        }
                    },
                    upsert=True
                )
            
            logger.info(f"✅ Config updated: {key}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Error setting config {key}: {e}")
            return False
    
    def update_multiple(self, config_dict: Dict[str, Any]) -> bool:
        """
        อัปเดตหลาย configuration พร้อมกัน
        
        Args:
            config_dict: Dictionary ของ key-value pairs
            
        Returns:
            True ถ้าสำเร็จ
        """
        try:
            success_count = 0
            for key, value in config_dict.items():
                if self.set(key, value):
                    success_count += 1
            
            logger.info(f"✅ Updated {success_count}/{len(config_dict)} configurations")
            return success_count == len(config_dict)
            
        except Exception as e:
            logger.error(f"❌ Error updating multiple configs: {e}")
            return False
    
    def delete(self, key: str) -> bool:
        """
        ลบ configuration
        
        Args:
            key: Configuration key
            
        Returns:
            True ถ้าสำเร็จ
        """
        try:
            # ลบจาก cache
            if key in self._cache:
                del self._cache[key]
            
            # ลบจาก database
            if self.db is not None:
                self.collection.delete_one({"key": key})
            
            logger.info(f"✅ Config deleted: {key}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Error deleting config {key}: {e}")
            return False
    
    def get_all(self) -> Dict[str, Any]:
        """
        ดึง configuration ทั้งหมด
        
        Returns:
            Dictionary ของ configuration ทั้งหมด
        """
        try:
            if self.db is not None:
                # Reload cache from database
                self._load_cache()
            
            return self._cache.copy()
            
        except Exception as e:
            logger.error(f"❌ Error getting all configs: {e}")
            return {}
    
    def reset_to_default(self) -> bool:
        """
        รีเซ็ต configuration กลับเป็นค่า default
        
        Returns:
            True ถ้าสำเร็จ
        """
        try:
            if self.db is not None:
                # ลบ configuration ทั้งหมด
                self.collection.delete_many({})
                
                # สร้างใหม่ด้วย default
                self._initialize_default_config()
                
                # Reload cache
                self._load_cache()
            else:
                # ถ้าไม่มี database ก็ reset cache
                self._cache = self._default_config.copy()
            
            logger.info("✅ Configuration reset to default")
            return True
            
        except Exception as e:
            logger.error(f"❌ Error resetting config: {e}")
            return False
    
    def refresh_cache(self) -> bool:
        """
        Refresh cache จาก database
        
        Returns:
            True ถ้าสำเร็จ
        """
        try:
            if self.db is not None:
                self._load_cache()
                logger.info("✅ Cache refreshed")
                return True
            return False
            
        except Exception as e:
            logger.error(f"❌ Error refreshing cache: {e}")
            return False
    
    def __repr__(self):
        return f"<ConfigManager: {len(self._cache)} configs loaded>"


# Global instance
config_manager = ConfigManager()

# Helper functions
def get_config(key: str, default: Any = None) -> Any:
    """Helper function to get config"""
    return config_manager.get(key, default)

def set_config(key: str, value: Any) -> bool:
    """Helper function to set config"""
    return config_manager.set(key, value)

def init_config(db) -> bool:
    """Helper function to initialize config manager with database"""
    return config_manager.initialize_db(db)
