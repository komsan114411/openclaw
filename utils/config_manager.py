# utils/config_manager.py
import os
import logging
import asyncio
from typing import Dict, Any

logger = logging.getLogger("config_manager")

class ConfigManager:
    def __init__(self):
        self.config_cache = {}
        
    def get(self, key: str, default=None):
        """Get configuration value"""
        # Check cache first
        if key in self.config_cache:
            return self.config_cache[key]
        
        # Check environment variables first for sensitive keys
        env_keys = {
            "line_channel_secret": "LINE_CHANNEL_SECRET",
            "line_channel_access_token": "LINE_CHANNEL_ACCESS_TOKEN", 
            "thunder_api_token": "THUNDER_API_TOKEN",
            "openai_api_key": "OPENAI_API_KEY",
            "kbank_consumer_id": "KBANK_CONSUMER_ID",
            "kbank_consumer_secret": "KBANK_CONSUMER_SECRET",
            "mongodb_uri": "MONGODB_URI"
        }
        
        if key in env_keys:
            env_value = os.getenv(env_keys[key])
            if env_value:
                self.config_cache[key] = env_value
                return env_value
        
        # Try to get from database asynchronously
        try:
            from models.database import get_config_sync
            value = get_config_sync(key, default)
            if value is not None:
                self.config_cache[key] = value
            return value
        except Exception as e:
            logger.error(f"❌ Error getting config {key}: {e}")
            return default
    
    def update(self, key: str, value: Any) -> bool:
        """Update configuration"""
        try:
            from models.database import set_config_sync
            
            sensitive_keys = [
                'line_channel_secret', 'line_channel_access_token',
                'thunder_api_token', 'openai_api_key',
                'kbank_consumer_id', 'kbank_consumer_secret'
            ]
            is_sensitive = key in sensitive_keys
            
            success = set_config_sync(key, value, is_sensitive)
            if success:
                self.config_cache[key] = value
                logger.info(f"✅ Updated config: {key}")
            return success
        except Exception as e:
            logger.error(f"❌ Error updating config {key}: {e}")
            return False
    
    def update_multiple(self, updates: Dict[str, Any]) -> bool:
        """Update multiple configurations"""
        success_count = 0
        for key, value in updates.items():
            if self.update(key, value):
                success_count += 1
        
        logger.info(f"✅ Updated {success_count}/{len(updates)} configurations")
        return success_count > 0
    
    @property
    def config(self):
        """Get all configuration"""
        return self.config_cache

# Create singleton
config_manager = ConfigManager()
