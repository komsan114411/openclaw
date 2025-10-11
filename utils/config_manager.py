# utils/config_manager.py
import os
import logging
import json
from typing import Dict, Any
import asyncio
import threading

logger = logging.getLogger("config_manager")

class ConfigManager:
    def __init__(self):
        self.config_cache = {}
        self.db_functions = None
        self._loop = None
        self._thread = None
        self._load_initial_config()
        
    def _load_initial_config(self):
        """Load initial configuration from environment variables"""
        # Essential configs from environment
        env_mappings = {
            "line_channel_secret": "LINE_CHANNEL_SECRET",
            "line_channel_access_token": "LINE_CHANNEL_ACCESS_TOKEN", 
            "thunder_api_token": "THUNDER_API_TOKEN",
            "openai_api_key": "OPENAI_API_KEY",
            "mongodb_uri": "MONGODB_URI",
            "kbank_consumer_id": "KBANK_CONSUMER_ID",
            "kbank_consumer_secret": "KBANK_CONSUMER_SECRET"
        }
        
        for key, env_key in env_mappings.items():
            value = os.getenv(env_key)
            if value:
                self.config_cache[key] = value
                
        # Default values
        defaults = {
            "slip_enabled": True,
            "ai_enabled": True,
            "thunder_enabled": True,
            "kbank_enabled": False,
            "kbank_sandbox_mode": True,
            "ai_prompt": "คุณเป็นผู้ช่วยที่เป็นมิตรและให้ความช่วยเหลือ"
        }
        
        for key, value in defaults.items():
            if key not in self.config_cache:
                self.config_cache[key] = value
                
        logger.info(f"✅ Loaded {len(self.config_cache)} initial configs")
    
    def _get_event_loop(self):
        """Get or create event loop for sync operations"""
        if self._loop is None or not self._thread or not self._thread.is_alive():
            self._loop = asyncio.new_event_loop()
            self._thread = threading.Thread(target=self._loop.run_forever, daemon=True)
            self._thread.start()
        return self._loop
    
    def get(self, key: str, default=None):
        """Get configuration value (sync)"""
        # Check cache first
        if key in self.config_cache:
            return self.config_cache[key]
            
        # Check environment variables
        env_value = os.getenv(key.upper())
        if env_value:
            # Convert boolean strings
            if env_value.lower() in ['true', '1', 'yes']:
                return True
            elif env_value.lower() in ['false', '0', 'no']:
                return False
            return env_value
            
        # Try to get from database if available
        if self.db_functions and 'get_config' in self.db_functions:
            try:
                loop = self._get_event_loop()
                future = asyncio.run_coroutine_threadsafe(
                    self.db_functions['get_config'](key, default),
                    loop
                )
                value = future.result(timeout=5)
                if value is not None:
                    self.config_cache[key] = value
                    return value
            except Exception as e:
                logger.warning(f"Could not get config {key} from DB: {e}")
                
        return default
    
    def update(self, key: str, value: Any) -> bool:
        """Update single configuration"""
        try:
            # Update cache immediately
            self.config_cache[key] = value
            
            # Try to update database
            if self.db_functions and 'set_config' in self.db_functions:
                try:
                    loop = self._get_event_loop()
                    future = asyncio.run_coroutine_threadsafe(
                        self.db_functions['set_config'](key, value),
                        loop
                    )
                    return future.result(timeout=5)
                except Exception as e:
                    logger.error(f"Could not update config {key} in DB: {e}")
                    
            return True
        except Exception as e:
            logger.error(f"Error updating config {key}: {e}")
            return False
    
    def update_multiple(self, updates: Dict[str, Any]) -> bool:
        """Update multiple configurations"""
        try:
            # Update cache
            self.config_cache.update(updates)
            
            # Update database
            success_count = 0
            for key, value in updates.items():
                if self.update(key, value):
                    success_count += 1
                    
            return success_count > 0
        except Exception as e:
            logger.error(f"Error updating multiple configs: {e}")
            return False
    
    async def get_config_async(self, key: str, default=None):
        """Get configuration value (async)"""
        # Check cache first
        if key in self.config_cache:
            return self.config_cache[key]
            
        # Try database
        if self.db_functions and 'get_config' in self.db_functions:
            try:
                value = await self.db_functions['get_config'](key, default)
                if value is not None:
                    self.config_cache[key] = value
                    return value
            except Exception as e:
                logger.warning(f"Could not get async config {key}: {e}")
                
        return default
    
    async def set_config_async(self, key: str, value: Any) -> bool:
        """Set configuration value (async)"""
        try:
            self.config_cache[key] = value
            
            if self.db_functions and 'set_config' in self.db_functions:
                return await self.db_functions['set_config'](key, value)
                
            return True
        except Exception as e:
            logger.error(f"Error setting async config {key}: {e}")
            return False
    
    async def update_multiple_async(self, updates: Dict[str, Any]) -> bool:
        """Update multiple configurations (async)"""
        try:
            self.config_cache.update(updates)
            
            tasks = []
            for key, value in updates.items():
                if self.db_functions and 'set_config' in self.db_functions:
                    tasks.append(self.db_functions['set_config'](key, value))
                    
            if tasks:
                results = await asyncio.gather(*tasks, return_exceptions=True)
                success_count = sum(1 for r in results if r is True)
                return success_count > 0
                
            return True
        except Exception as e:
            logger.error(f"Error updating multiple async configs: {e}")
            return False
    
    async def get_all_configs_async(self) -> Dict[str, Any]:
        """Get all configurations (async)"""
        if self.db_functions and 'get_all_configs' in self.db_functions:
            try:
                db_configs = await self.db_functions['get_all_configs']()
                self.config_cache.update(db_configs)
            except Exception as e:
                logger.warning(f"Could not get all configs from DB: {e}")
                
        return self.config_cache.copy()
    
    @property
    def config(self):
        """Get all configuration"""
        return self.config_cache

# Create singleton instance
config_manager = ConfigManager()

logger.info("=" * 60)
logger.info("📊 CONFIG MANAGER INITIALIZED")
logger.info(f"   MongoDB URI: {'Set' if os.getenv('MONGODB_URI') else 'Not Set'}")
logger.info("=" * 60)
