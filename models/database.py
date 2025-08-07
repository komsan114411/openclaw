# models/database.py
"""
MongoDB-Only Database Module with Motor AsyncIO
Fixed async/await issues and sync wrappers
"""

import os
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from dataclasses import dataclass
import time
from motor.motor_asyncio import AsyncIOMotorClient
import certifi
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
import asyncio
import threading

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("database")

# ==================== Connection Status ====================
CONNECTION_STATUS = {
    "type": "MongoDB",
    "connected": False,
    "last_check": None,
    "error": None,
    "details": {}
}

@dataclass
class ChatHistory:
    id: Optional[str]
    user_id: str
    direction: str
    message_type: str
    message_text: str
    sender: str
    created_at: datetime

# ==================== MongoDB Database Manager ====================
class MongoDBManager:
    """MongoDB Database Manager using Motor AsyncIO"""
    
    def __init__(self):
        self.client = None
        self.db = None
        self.connected = False
        self.mongodb_uri = os.getenv('MONGODB_URI', '')
        
        if not self.mongodb_uri:
            logger.warning("⚠️ MONGODB_URI environment variable is not set")
            # Use a fallback for development
            self.mongodb_uri = "mongodb://localhost:27017/lineoa"
            
    async def initialize(self):
        """Initialize MongoDB connection"""
        global CONNECTION_STATUS
        
        try:
            logger.info("🚀 Initializing MongoDB...")
            logger.info(f"📍 URI: {self.mongodb_uri[:30]}...")  # Log first 30 chars only
            
            # Create async client
            self.client = AsyncIOMotorClient(
                self.mongodb_uri,
                tlsCAFile=certifi.where() if 'mongodb+srv' in self.mongodb_uri else None,
                serverSelectionTimeoutMS=10000,
                connectTimeoutMS=10000,
                socketTimeoutMS=10000,
                maxPoolSize=50,
                retryWrites=True
            )
            
            # Test connection
            start_time = time.time()
            await self.client.admin.command('ping')
            ping_time = (time.time() - start_time) * 1000
            
            # Get server info
            server_info = await self.client.server_info()
            
            # Extract database name from URI
            db_name = self._extract_database_name(self.mongodb_uri)
            self.db = self.client[db_name]
            
            # Create indexes
            await self._create_indexes()
            
            self.connected = True
            
            CONNECTION_STATUS.update({
                "type": "MongoDB Atlas" if 'mongodb+srv' in self.mongodb_uri else "MongoDB",
                "connected": True,
                "error": None,
                "last_check": datetime.now().isoformat(),
                "details": {
                    "database": db_name,
                    "version": server_info.get('version'),
                    "ping_ms": round(ping_time, 2)
                }
            })
            
            logger.info(f"✅ MongoDB connected - Database: {db_name}, Ping: {ping_time:.2f}ms")
            
        except Exception as e:
            error_msg = f"MongoDB connection failed: {str(e)}"
            logger.error(f"❌ {error_msg}")
            CONNECTION_STATUS.update({
                "type": "MongoDB",
                "connected": False,
                "error": error_msg,
                "last_check": datetime.now().isoformat()
            })
            # Don't raise, just log the error
            self.connected = False
    
    def _extract_database_name(self, mongodb_uri: str) -> str:
        """Extract database name from MongoDB URI"""
        try:
            if '/' in mongodb_uri.split('?')[0]:
                path_part = mongodb_uri.split('/')[-1].split('?')[0]
                if path_part and path_part != '':
                    return path_part
            return 'lineoa'
        except:
            return 'lineoa'
    
    async def _create_indexes(self):
        """Create necessary indexes"""
        try:
            # Chat history indexes
            await self.db.chat_history.create_index([("user_id", 1)])
            await self.db.chat_history.create_index([("created_at", -1)])
            await self.db.chat_history.create_index([("sender", 1)])
            
            # Config store indexes
            await self.db.config_store.create_index([("config_key", 1)], unique=True)
            
            # Users indexes
            await self.db.users.create_index([("user_id", 1)], unique=True)
            await self.db.users.create_index([("last_seen", -1)])
            
            logger.info("✅ MongoDB indexes created")
        except Exception as e:
            logger.warning(f"⚠️ Index creation warning: {e}")
    
    async def save_chat_history(self, user_id: str, direction: str, message: Dict[str, Any], sender: str):
        """Save chat history to MongoDB"""
        if not self.connected or not self.db:
            logger.warning("⚠️ MongoDB not connected, skipping save")
            return
            
        try:
            document = {
                "user_id": user_id,
                "direction": direction,
                "message_type": message.get("type", "text"),
                "message_text": message.get("text", ""),
                "message_data": message,
                "sender": sender,
                "created_at": datetime.utcnow()
            )
            
            result = await self.db.chat_history.insert_one(document)
            
            # Update user stats
            await self.db.users.update_one(
                {"user_id": user_id},
                {
                    "$set": {"last_seen": datetime.utcnow()},
                    "$inc": {"message_count": 1},
                    "$setOnInsert": {
                        "first_seen": datetime.utcnow(),
                        "is_blocked": False,
                        "display_name": f"User {user_id[:8]}"
                    }
                },
                upsert=True
            )
            
            logger.debug(f"✅ Chat saved to MongoDB: {result.inserted_id}")
            
        except Exception as e:
            logger.error(f"❌ Error saving to MongoDB: {e}")
    
    async def get_chat_history_count(self) -> int:
        """Get total message count"""
        if not self.connected or not self.db:
            return 0
            
        try:
            return await self.db.chat_history.count_documents({})
        except Exception as e:
            logger.error(f"❌ Error counting MongoDB messages: {e}")
            return 0
    
    async def get_recent_chat_history(self, limit: int = 50) -> List[ChatHistory]:
        """Get recent chat history"""
        if not self.connected or not self.db:
            return []
            
        try:
            cursor = self.db.chat_history.find().sort("created_at", -1).limit(limit)
            history = []
            
            async for doc in cursor:
                history.append(ChatHistory(
                    id=str(doc.get("_id")),
                    user_id=doc.get("user_id", ""),
                    direction=doc.get("direction", ""),
                    message_type=doc.get("message_type", "text"),
                    message_text=doc.get("message_text", ""),
                    sender=doc.get("sender", "unknown"),
                    created_at=doc.get("created_at")
                ))
            
            return list(reversed(history))
            
        except Exception as e:
            logger.error(f"❌ Error getting recent chat history: {e}")
            return []
    
    async def get_user_chat_history(self, user_id: str, limit: int = 10) -> List[Dict[str, str]]:
        """Get user chat history for AI context"""
        if not self.connected or not self.db:
            return []
            
        try:
            cursor = self.db.chat_history.find({
                "user_id": user_id,
                "message_type": "text",
                "message_text": {"$ne": ""}
            }).sort("created_at", -1).limit(limit)
            
            messages = []
            async for doc in cursor:
                role = "user" if doc.get("direction") == "in" else "assistant"
                content = doc.get("message_text", "")
                if content:
                    messages.append({"role": role, "content": content})
            
            return list(reversed(messages))
            
        except Exception as e:
            logger.error(f"❌ Error getting user chat history: {e}")
            return []
    
    async def get_config(self, key: str, default=None):
        """Get configuration from MongoDB"""
        if not self.connected or not self.db:
            return default
            
        try:
            doc = await self.db.config_store.find_one({"config_key": key})
            if doc:
                value = doc.get("config_value")
                value_type = doc.get("value_type", "string")
                
                # Convert to appropriate type
                if value_type == "boolean":
                    return value in [True, "true", "True", "1", 1]
                elif value_type == "integer":
                    return int(value) if value is not None else default
                elif value_type == "float":
                    return float(value) if value is not None else default
                return value
            return default
        except Exception as e:
            logger.error(f"❌ Error getting config {key}: {e}")
            return default
    
    async def set_config(self, key: str, value: Any, is_sensitive: bool = False) -> bool:
        """Set configuration in MongoDB"""
        if not self.connected or not self.db:
            return False
            
        try:
            # Determine value type
            value_type = "string"
            if isinstance(value, bool):
                value_type = "boolean"
            elif isinstance(value, int):
                value_type = "integer"
            elif isinstance(value, float):
                value_type = "float"
            elif isinstance(value, (dict, list)):
                value_type = "json"
            
            await self.db.config_store.update_one(
                {"config_key": key},
                {
                    "$set": {
                        "config_key": key,
                        "config_value": value,
                        "value_type": value_type,
                        "is_sensitive": is_sensitive,
                        "updated_at": datetime.utcnow()
                    }
                },
                upsert=True
            )
            return True
        except Exception as e:
            logger.error(f"❌ Error setting config {key}: {e}")
            return False
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test MongoDB connection"""
        if not self.client:
            return {
                "status": "error",
                "type": "MongoDB",
                "error": "Client not initialized",
                "message": "❌ MongoDB client not initialized"
            }
            
        try:
            start_time = time.time()
            await self.client.admin.command('ping')
            ping_time = (time.time() - start_time) * 1000
            
            # Get collection counts
            counts = {}
            if self.db:
                for collection in ['chat_history', 'config_store', 'users']:
                    try:
                        counts[collection] = await self.db[collection].count_documents({})
                    except:
                        counts[collection] = 0
            
            return {
                "status": "connected",
                "type": "MongoDB Atlas" if 'mongodb+srv' in self.mongodb_uri else "MongoDB",
                "database": self.db.name if self.db else "Unknown",
                "ping_ms": round(ping_time, 2),
                "record_counts": counts,
                "message": f"✅ MongoDB connected (ping: {ping_time:.2f}ms)"
            }
        except Exception as e:
            return {
                "status": "error",
                "type": "MongoDB",
                "error": str(e),
                "message": f"❌ MongoDB error: {str(e)}"
            }
    
    async def get_database_status(self) -> Dict[str, Any]:
        """Get comprehensive database status"""
        status = await self.test_connection()
        status['connection_info'] = CONNECTION_STATUS
        return status

# ==================== Global Database Instance ====================
logger.info("🚀 Starting MongoDB database module...")
db_manager = MongoDBManager()

# ==================== Global event loop for sync operations ====================
_sync_loop = None
_loop_thread = None

def _get_sync_loop():
    """Get or create a dedicated event loop for sync operations"""
    global _sync_loop, _loop_thread
    
    if _sync_loop is None or (_loop_thread and not _loop_thread.is_alive()):
        _sync_loop = asyncio.new_event_loop()
        _loop_thread = threading.Thread(target=_sync_loop.run_forever, daemon=True)
        _loop_thread.start()
    
    return _sync_loop

# ==================== Export Functions ====================
async def init_database():
    """Initialize database"""
    await db_manager.initialize()
    logger.info(f"✅ MongoDB initialization completed")

def get_connection_info():
    """Get detailed connection information"""
    return CONNECTION_STATUS

async def save_chat_history(user_id: str, direction: str, message: Dict[str, Any], sender: str):
    """Save chat history"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.save_chat_history(user_id, direction, message, sender)

async def get_chat_history_count() -> int:
    """Get total message count"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.get_chat_history_count()

async def get_recent_chat_history(limit: int = 50):
    """Get recent chat history"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.get_recent_chat_history(limit)

async def get_user_chat_history(user_id: str, limit: int = 10):
    """Get user chat history"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.get_user_chat_history(user_id, limit)

async def test_connection() -> Dict[str, Any]:
    """Test database connection"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.test_connection()

async def get_database_status() -> Dict[str, Any]:
    """Get database status"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.get_database_status()

async def get_config(key: str, default=None):
    """Get configuration value"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.get_config(key, default)

async def set_config(key: str, value: Any, is_sensitive: bool = False) -> bool:
    """Set configuration value"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.set_config(key, value, is_sensitive)

# ==================== Sync Wrappers for Backward Compatibility ====================
def get_config_sync(key: str, default=None):
    """Sync wrapper for get_config"""
    try:
        # Check if we're already in an async context
        try:
            loop = asyncio.get_running_loop()
            # We're in async context, can't use sync version
            logger.warning(f"get_config_sync called from async context for key: {key}")
            # Try to return from cache or environment
            env_value = os.getenv(key.upper())
            if env_value:
                return env_value
            return default
        except RuntimeError:
            # Not in async context, safe to proceed
            pass
        
        # Use the dedicated sync loop
        loop = _get_sync_loop()
        future = asyncio.run_coroutine_threadsafe(get_config(key, default), loop)
        return future.result(timeout=5)
    except Exception as e:
        logger.error(f"Error in get_config_sync for {key}: {e}")
        # Try environment variable as fallback
        env_value = os.getenv(key.upper())
        if env_value:
            return env_value
        return default

def set_config_sync(key: str, value: Any, is_sensitive: bool = False) -> bool:
    """Sync wrapper for set_config"""
    try:
        # Check if we're already in an async context
        try:
            loop = asyncio.get_running_loop()
            logger.warning(f"set_config_sync called from async context for key: {key}")
            return False
        except RuntimeError:
            pass
        
        # Use the dedicated sync loop
        loop = _get_sync_loop()
        future = asyncio.run_coroutine_threadsafe(set_config(key, value, is_sensitive), loop)
        return future.result(timeout=5)
    except Exception as e:
        logger.error(f"Error in set_config_sync for {key}: {e}")
        return False

def get_user_chat_history_sync(user_id: str, limit: int = 10):
    """Sync wrapper for get_user_chat_history"""
    try:
        try:
            loop = asyncio.get_running_loop()
            logger.warning("get_user_chat_history_sync called from async context")
            return []
        except RuntimeError:
            pass
        
        loop = _get_sync_loop()
        future = asyncio.run_coroutine_threadsafe(get_user_chat_history(user_id, limit), loop)
        return future.result(timeout=5)
    except Exception as e:
        logger.error(f"Error in get_user_chat_history_sync: {e}")
        return []

def get_chat_history_count_sync() -> int:
    """Sync wrapper for get_chat_history_count"""
    try:
        try:
            loop = asyncio.get_running_loop()
            return 0
        except RuntimeError:
            pass
        
        loop = _get_sync_loop()
        future = asyncio.run_coroutine_threadsafe(get_chat_history_count(), loop)
        return future.result(timeout=5)
    except Exception as e:
        logger.error(f"Error in get_chat_history_count_sync: {e}")
        return 0

def get_recent_chat_history_sync(limit: int = 50):
    """Sync wrapper for get_recent_chat_history"""
    try:
        try:
            loop = asyncio.get_running_loop()
            return []
        except RuntimeError:
            pass
        
        loop = _get_sync_loop()
        future = asyncio.run_coroutine_threadsafe(get_recent_chat_history(limit), loop)
        return future.result(timeout=5)
    except Exception as e:
        logger.error(f"Error in get_recent_chat_history_sync: {e}")
        return []

# ==================== Additional Compatibility Functions ====================
def verify_tables() -> Dict[str, bool]:
    """Verify collections exist (always returns True for MongoDB)"""
    return {"chat_history": True, "config_store": True, "users": True}

def get_all_configs():
    """Get all configurations"""
    try:
        try:
            loop = asyncio.get_running_loop()
            logger.warning("get_all_configs called from async context")
            return {}
        except RuntimeError:
            pass
        
        if not db_manager.connected or not db_manager.db:
            return {}
            
        loop = _get_sync_loop()
        
        async def _get_all():
            configs = {}
            if db_manager.db:
                cursor = db_manager.db.config_store.find()
                async for doc in cursor:
                    configs[doc['config_key']] = doc['config_value']
            return configs
        
        future = asyncio.run_coroutine_threadsafe(_get_all(), loop)
        return future.result(timeout=5)
    except Exception as e:
        logger.error(f"Error in get_all_configs: {e}")
        return {}

def update_multiple_configs(configs):
    """Update multiple configurations"""
    success_count = 0
    for key, value in configs.items():
        if set_config_sync(key, value):
            success_count += 1
    return success_count > 0

# SQLite fallback stubs (for compatibility)
DB_PATH = None  # No SQLite

logger.info("=" * 60)
logger.info("📊 MONGODB DATABASE MODULE LOADED")
logger.info(f"   MongoDB URI: {'Set' if os.getenv('MONGODB_URI') else 'Not Set (using localhost)'}")
logger.info("=" * 60)
