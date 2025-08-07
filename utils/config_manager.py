# utils/config_manager.py
import os
import logging
import json
from typing import Dict, Any
from pathlib import Path

logger = logging.getLogger("config_manager")

class ConfigManager:
    def __init__(self):
        self.config_cache = {}
        self.config_file = "config_persistent.json"
        self._load_from_file()
        self._load_from_env()
        
    def _load_from_file(self):
        """Load config from JSON file if exists"""
        try:
            if Path(self.config_file).exists():
                with open(self.config_file, 'r') as f:
                    self.config_cache = json.load(f)
                    logger.info(f"✅ Loaded {len(self.config_cache)} configs from file")
        except Exception as e:
            logger.warning(f"⚠️ Could not load config file: {e}")
            self.config_cache = {}
    
    def _load_from_env(self):
        """Load sensitive configs from environment variables"""
        env_mappings = {
            "line_channel_secret": "LINE_CHANNEL_SECRET",
            "line_channel_access_token": "LINE_CHANNEL_ACCESS_TOKEN", 
            "thunder_api_token": "THUNDER_API_TOKEN",
            "openai_api_key": "OPENAI_API_KEY",
            "kbank_consumer_id": "KBANK_CONSUMER_ID",
            "kbank_consumer_secret": "KBANK_CONSUMER_SECRET",
            "mongodb_uri": "MONGODB_URI"
        }
        
        for key, env_key in env_mappings.items():
            env_value = os.getenv(env_key)
            if env_value:
                self.config_cache[key] = env_value
                
    def _save_to_file(self):
        """Save non-sensitive configs to file"""
        try:
            # Don't save sensitive keys
            sensitive_keys = [
                'line_channel_secret', 'line_channel_access_token',
                'thunder_api_token', 'openai_api_key',
                'kbank_consumer_id', 'kbank_consumer_secret',
                'mongodb_uri'
            ]
            
            safe_config = {
                k: v for k, v in self.config_cache.items() 
                if k not in sensitive_keys
            }
            
            with open(self.config_file, 'w') as f:
                json.dump(safe_config, f, indent=2)
                
        except Exception as e:
            logger.error(f"❌ Could not save config file: {e}")
    
    def get(self, key: str, default=None):
        """Get configuration value synchronously"""
        # Check environment first for sensitive keys
        env_mappings = {
            "line_channel_secret": "LINE_CHANNEL_SECRET",
            "line_channel_access_token": "LINE_CHANNEL_ACCESS_TOKEN", 
            "thunder_api_token": "THUNDER_API_TOKEN",
            "openai_api_key": "OPENAI_API_KEY",
            "kbank_consumer_id": "KBANK_CONSUMER_ID",
            "kbank_consumer_secret": "KBANK_CONSUMER_SECRET",
            "mongodb_uri": "MONGODB_URI"
        }
        
        if key in env_mappings:
            env_value = os.getenv(env_mappings[key])
            if env_value:
                return env_value
        
        # Return from cache
        return self.config_cache.get(key, default)
    
    def update(self, key: str, value: Any) -> bool:
        """Update configuration synchronously"""
        try:
            self.config_cache[key] = value
            self._save_to_file()
            logger.info(f"✅ Updated config: {key}")
            return True
        except Exception as e:
            logger.error(f"❌ Error updating config {key}: {e}")
            return False
    
    def update_multiple(self, updates: Dict[str, Any]) -> bool:
        """Update multiple configurations"""
        try:
            self.config_cache.update(updates)
            self._save_to_file()
            logger.info(f"✅ Updated {len(updates)} configurations")
            return True
        except Exception as e:
            logger.error(f"❌ Error updating configs: {e}")
            return False
    
    @property
    def config(self):
        """Get all configuration"""
        return self.config_cache

# Create singleton
config_manager = ConfigManager()
