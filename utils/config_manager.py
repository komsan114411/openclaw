# utils/config_manager.py - แก้ไขให้ใช้ MongoDB
import os
import logging
import asyncio
from typing import Dict, Any

logger = logging.getLogger("config_manager")

class ConfigManager:
    def __init__(self):
        self.mongodb_config = None
        self.fallback_cache = {}
        self._initialized = False
        
    def _ensure_initialized(self):
        """Ensure MongoDB config is initialized"""
        if not self._initialized:
            try:
                from utils.mongodb_config import get_config_manager
                loop = asyncio.new_event_loop()
                self.mongodb_config = loop.run_until_complete(get_config_manager())
                loop.close()
                self._initialized = True
                logger.info("✅ Config Manager using MongoDB")
            except Exception as e:
                logger.error(f"❌ Failed to initialize MongoDB config: {e}")
                self._initialized = False
    
    def get(self, key: str, default=None):
        """Get configuration value"""
        self._ensure_initialized()
        
        if self.mongodb_config:
            return self.mongodb_config.get(key, default)
        else:
            # Fallback to environment variables
            env_value = os.getenv(key.upper())
            if env_value:
                return env_value
            return self.fallback_cache.get(key, default)
    
    def update(self, key: str, value: Any) -> bool:
        """Update configuration"""
        self._ensure_initialized()
        
        if self.mongodb_config:
            return self.mongodb_config.update(key, value)
        else:
            self.fallback_cache[key] = value
            return True
    
    def update_multiple(self, updates: Dict[str, Any]) -> bool:
        """Update multiple configurations"""
        self._ensure_initialized()
        
        if self.mongodb_config:
            return self.mongodb_config.update_multiple(updates)
        else:
            self.fallback_cache.update(updates)
            return True
    
    @property
    def config(self):
        """Get all configuration"""
        self._ensure_initialized()
        
        if self.mongodb_config:
            return self.mongodb_config.config_cache
        else:
            return self.fallback_cache

# Create singleton
config_manager = ConfigManager()
