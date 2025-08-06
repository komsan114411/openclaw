# utils/config_manager.py - MySQL version
import os
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("config_manager")

class MySQLConfigManager:
    def __init__(self):
        self.db = None
        self.config_cache = {}
        self.init_database()
    
    def init_database(self):
        """Initialize MySQL database connection"""
        try:
            from models.mysql_database import mysql_db
            self.db = mysql_db
            self.db.init_tables()
            self.load_initial_config()
            logger.info("✅ MySQL Config Manager initialized")
        except Exception as e:
            logger.error(f"❌ Failed to initialize MySQL Config Manager: {e}")
            # Fallback to memory config
            self.config_cache = self.get_default_config()
    
    def get_default_config(self) -> Dict[str, Any]:
        """Get default configuration from environment variables"""
        return {
            "line_channel_secret": os.getenv("LINE_CHANNEL_SECRET", ""),
            "line_channel_access_token": os.getenv("LINE_CHANNEL_ACCESS_TOKEN", ""),
            "thunder_api_token": os.getenv("THUNDER_API_TOKEN", ""),
            "openai_api_key": os.getenv("OPENAI_API_KEY", ""),
            "kbank_consumer_id": os.getenv("KBANK_CONSUMER_ID", ""),
            "kbank_consumer_secret": os.getenv("KBANK_CONSUMER_SECRET", ""),
            "ai_prompt": "คุณเป็นผู้ช่วยที่เป็นมิตรและให้ความช่วยเหลือ",
            "ai_enabled": True,
            "slip_enabled": True,
            "thunder_enabled": True,
            "kbank_enabled": False,
        }
    
    def load_initial_config(self):
        """Load initial configuration from database or environment"""
        try:
            # First, get all configs from database
            self.config_cache = self.db.get_all_configs()
            
            # For sensitive keys, check environment variables first
            sensitive_keys = {
                "line_channel_secret": os.getenv("LINE_CHANNEL_SECRET"),
                "line_channel_access_token": os.getenv("LINE_CHANNEL_ACCESS_TOKEN"),
                "thunder_api_token": os.getenv("THUNDER_API_TOKEN"),
                "openai_api_key": os.getenv("OPENAI_API_KEY"),
                "kbank_consumer_id": os.getenv("KBANK_CONSUMER_ID"),
                "kbank_consumer_secret": os.getenv("KBANK_CONSUMER_SECRET"),
            }
            
            # Save sensitive keys to database if they exist in env but not in db
            for key, env_value in sensitive_keys.items():
                if env_value and not self.config_cache.get(key):
                    self.db.set_config(key, env_value, 'string', True)
                    self.config_cache[key] = env_value
                    logger.info(f"✅ Imported {key} from environment to database")
            
            logger.info(f"✅ Loaded {len(self.config_cache)} configurations from database")
            
        except Exception as e:
            logger.error(f"❌ Error loading initial config: {e}")
            self.config_cache = self.get_default_config()
    
    def get(self, key: str, default=None):
        """Get configuration value"""
        # Check cache first
        if key in self.config_cache:
            return self.config_cache[key]
        
        # Try to get from database
        if self.db:
            value = self.db.get_config(key, default)
            if value is not None:
                self.config_cache[key] = value
                return value
        
        return default
    
    def update(self, key: str, value: Any) -> bool:
        """Update single configuration"""
        try:
            if self.db:
                # Determine if it's sensitive
                sensitive_keys = [
                    'line_channel_secret', 'line_channel_access_token',
                    'thunder_api_token', 'openai_api_key',
                    'kbank_consumer_id', 'kbank_consumer_secret'
                ]
                is_sensitive = key in sensitive_keys
                
                # Determine value type
                if isinstance(value, bool):
                    value_type = 'boolean'
                elif isinstance(value, int):
                    value_type = 'integer'
                elif isinstance(value, float):
                    value_type = 'float'
                elif isinstance(value, (dict, list)):
                    value_type = 'json'
                else:
                    value_type = 'string'
                
                success = self.db.set_config(key, value, value_type, is_sensitive)
                if success:
                    self.config_cache[key] = value
                    logger.info(f"✅ Updated config: {key}")
                return success
            else:
                self.config_cache[key] = value
                return True
                
        except Exception as e:
            logger.error(f"❌ Error updating config {key}: {e}")
            return False
    
    def update_multiple(self, updates: Dict[str, Any]) -> bool:
        """Update multiple configurations"""
        try:
            if self.db:
                success = self.db.update_multiple_configs(updates)
                if success:
                    self.config_cache.update(updates)
                    logger.info(f"✅ Updated {len(updates)} configurations")
                return success
            else:
                self.config_cache.update(updates)
                return True
                
        except Exception as e:
            logger.error(f"❌ Error updating multiple configs: {e}")
            return False
    
    @property
    def config(self):
        """Get all configuration as dict"""
        if self.db:
            self.config_cache = self.db.get_all_configs()
        return self.config_cache
    
    def reload_config(self):
        """Reload configuration from database"""
        if self.db:
            self.load_initial_config()
            logger.info("🔄 Configuration reloaded from database")

# Create singleton instance
config_manager = MySQLConfigManager()
