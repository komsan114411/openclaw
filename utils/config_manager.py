# utils/config_manager.py
import os
import logging
from typing import Dict, Any
from models.database import get_config, set_config

logger = logging.getLogger("config_manager")

class ConfigManager:
    def __init__(self):
        self.config_cache = {}
        self.load_config()
    
    def load_config(self):
        """Load configuration from database and environment"""
        # Load from environment first (for sensitive keys)
        env_configs = {
            "line_channel_secret": os.getenv("LINE_CHANNEL_SECRET", ""),
            "line_channel_access_token": os.getenv("LINE_CHANNEL_ACCESS_TOKEN", ""),
            "thunder_api_token": os.getenv("THUNDER_API_TOKEN", ""),
            "openai_api_key": os.getenv("OPENAI_API_KEY", ""),
            "kbank_consumer_id": os.getenv("KBANK_CONSUMER_ID", ""),
            "kbank_consumer_secret": os.getenv("KBANK_CONSUMER_SECRET", ""),
        }
        
        # Save to database if not exists
        for key, value in env_configs.items():
            if value:
                db_value = get_config(key)
                if not db_value:
                    set_config(key, value, is_sensitive=True)
                    logger.info(f"✅ Imported {key} from environment")
        
        # Load all configs from database
        self.reload_config()
    
    def get(self, key: str, default=None):
        """Get configuration value"""
        # Check cache first
        if key in self.config_cache:
            return self.config_cache[key]
        
        # Get from database
        value = get_config(key, default)
        if value is not None:
            self.config_cache[key] = value
        return value
    
    def update(self, key: str, value: Any) -> bool:
        """Update configuration"""
        sensitive_keys = [
            'line_channel_secret', 'line_channel_access_token',
            'thunder_api_token', 'openai_api_key',
            'kbank_consumer_id', 'kbank_consumer_secret'
        ]
        is_sensitive = key in sensitive_keys
        
        success = set_config(key, value, is_sensitive)
        if success:
            self.config_cache[key] = value
            logger.info(f"✅ Updated config: {key}")
        return success
    
    def update_multiple(self, updates: Dict[str, Any]) -> bool:
        """Update multiple configurations"""
        for key, value in updates.items():
            self.update(key, value)
        return True
    
    def reload_config(self):
        """Reload configuration from database"""
        # This would need a get_all_configs function
        logger.info("🔄 Configuration reloaded")
    
    @property
    def config(self):
        """Get all configuration"""
        return self.config_cache

# Create singleton
config_manager = ConfigManager()
