# utils/mongodb_config.py
import os
import logging
from typing import Dict, Any
from motor.motor_asyncio import AsyncIOMotorClient
import certifi
import asyncio

logger = logging.getLogger("mongodb_config")

class MongoDBConfigManager:
    def __init__(self):
        self.client = None
        self.db = None
        self.config_cache = {}
        self.mongodb_uri = os.getenv('MONGODB_URI')
        
        if not self.mongodb_uri:
            logger.error("❌ MONGODB_URI not set!")
            raise ValueError("MONGODB_URI required")
    
    async def initialize(self):
        """Initialize MongoDB connection"""
        try:
            self.client = AsyncIOMotorClient(
                self.mongodb_uri,
                tlsCAFile=certifi.where() if 'mongodb+srv' in self.mongodb_uri else None,
                serverSelectionTimeoutMS=10000
            )
            
            # Test connection
            await self.client.admin.command('ping')
            
            # Get database name from URI
            db_name = self._extract_database_name(self.mongodb_uri)
            self.db = self.client[db_name]
            
            # Load all configs to cache
            await self._load_all_configs()
            
            logger.info(f"✅ MongoDB Config Manager connected to {db_name}")
            
        except Exception as e:
            logger.error(f"❌ MongoDB connection failed: {e}")
            raise
    
    def _extract_database_name(self, mongodb_uri: str) -> str:
        """Extract database name from MongoDB URI"""
        try:
            # Format: mongodb+srv://.../<database>?...
            if '/' in mongodb_uri.split('?')[0]:
                path_part = mongodb_uri.split('/')[-1].split('?')[0]
                if path_part:
                    return path_part
            return 'lineoa'
        except:
            return 'lineoa'
    
    async def _load_all_configs(self):
        """Load all configs from MongoDB to cache"""
        try:
            cursor = self.db.config_store.find()
            async for doc in cursor:
                key = doc.get('config_key')
                value = doc.get('config_value')
                if key:
                    self.config_cache[key] = value
            logger.info(f"✅ Loaded {len(self.config_cache)} configs from MongoDB")
        except Exception as e:
            logger.error(f"❌ Error loading configs: {e}")
    
    def get(self, key: str, default=None):
        """Get config value (sync wrapper for compatibility)"""
        # Check environment variables first for sensitive keys
        env_mappings = {
            "line_channel_secret": "LINE_CHANNEL_SECRET",
            "line_channel_access_token": "LINE_CHANNEL_ACCESS_TOKEN",
            "thunder_api_token": "THUNDER_API_TOKEN",
            "openai_api_key": "OPENAI_API_KEY",
            "kbank_consumer_id": "KBANK_CONSUMER_ID",
            "kbank_consumer_secret": "KBANK_CONSUMER_SECRET"
        }
        
        if key in env_mappings:
            env_value = os.getenv(env_mappings[key])
            if env_value:
                return env_value
        
        # Return from cache
        return self.config_cache.get(key, default)
    
    async def set_async(self, key: str, value: Any) -> bool:
        """Set config value in MongoDB"""
        try:
            await self.db.config_store.update_one(
                {"config_key": key},
                {"$set": {
                    "config_key": key,
                    "config_value": value,
                    "updated_at": datetime.utcnow()
                }},
                upsert=True
            )
            self.config_cache[key] = value
            logger.info(f"✅ Updated config: {key}")
            return True
        except Exception as e:
            logger.error(f"❌ Error setting config {key}: {e}")
            return False
    
    def update(self, key: str, value: Any) -> bool:
        """Update config (sync wrapper)"""
        try:
            # Run async operation in sync context
            loop = asyncio.new_event_loop()
            result = loop.run_until_complete(self.set_async(key, value))
            loop.close()
            return result
        except Exception as e:
            logger.error(f"❌ Error in sync update: {e}")
            return False
    
    def update_multiple(self, updates: Dict[str, Any]) -> bool:
        """Update multiple configs"""
        try:
            success_count = 0
            for key, value in updates.items():
                if self.update(key, value):
                    success_count += 1
            return success_count > 0
        except Exception as e:
            logger.error(f"❌ Error updating multiple configs: {e}")
            return False
    
    @property
    def config(self):
        """Get all configuration"""
        return self.config_cache

# Create singleton instance
mongodb_config_manager = None

async def get_config_manager():
    """Get or create config manager instance"""
    global mongodb_config_manager
    if mongodb_config_manager is None:
        mongodb_config_manager = MongoDBConfigManager()
        await mongodb_config_manager.initialize()
    return mongodb_config_manager
