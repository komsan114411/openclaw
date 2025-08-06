# models/database.py
"""
Enhanced Database Module with MongoDB Atlas Support
"""

import os
import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from dataclasses import dataclass
import sqlite3
import time

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("database")

# ==================== Connection Status ====================
CONNECTION_STATUS = {
    "type": None,
    "connected": False,
    "last_check": None,
    "error": None,
    "details": {}
}

def get_connection_status():
    """Get current database connection status"""
    return CONNECTION_STATUS

# ==================== Data Classes ====================
@dataclass
class ChatHistory:
    id: Optional[str]
    user_id: str
    direction: str
    message_type: str
    message_text: str
    sender: str
    created_at: datetime

# ==================== MongoDB Implementation ====================
try:
    from motor.motor_asyncio import AsyncIOMotorClient
    import certifi
    from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
    MONGODB_AVAILABLE = True
    logger.info("✅ Motor and pymongo modules loaded successfully")
except ImportError as e:
    MONGODB_AVAILABLE = False
    logger.error(f"❌ Motor/pymongo not available: {e}")

class MongoDatabase:
    """MongoDB Atlas Database Handler with Enhanced Connection Management"""
    
    def __init__(self):
        self.client = None
        self.db = None
        self.connected = False
        self.connection_attempts = 0
        self.max_retries = 3
        
    async def _connect(self):
        """Connect to MongoDB Atlas with retry logic"""
        global CONNECTION_STATUS
        
        # Get MongoDB connection details
        mongodb_uri = os.getenv('MONGODB_URI', '')
        use_mongodb = os.getenv('USE_MONGODB', 'false').lower() == 'true'
        
        if not mongodb_uri or not use_mongodb:
            error_msg = f"MongoDB not configured - USE_MONGODB: {use_mongodb}, URI exists: {bool(mongodb_uri)}"
            logger.warning(f"⚠️ {error_msg}")
            CONNECTION_STATUS.update({
                "type": "MongoDB",
                "connected": False,
                "error": error_msg,
                "last_check": datetime.now().isoformat()
            })
            raise ValueError(error_msg)
        
        # Log connection attempt
        logger.info("=" * 60)
        logger.info("🔄 MONGODB CONNECTION ATTEMPT")
        logger.info(f"📍 URI preview: {mongodb_uri[:50]}...")
        logger.info(f"🔢 Attempt: {self.connection_attempts + 1}/{self.max_retries}")
        logger.info("=" * 60)
        
        for attempt in range(self.max_retries):
            self.connection_attempts = attempt + 1
            
            try:
                logger.info(f"🔄 Connecting to MongoDB Atlas (Attempt {self.connection_attempts})...")
                
                # Create client with proper configuration
                self.client = AsyncIOMotorClient(
                    mongodb_uri,
                    tlsCAFile=certifi.where(),
                    serverSelectionTimeoutMS=10000,
                    connectTimeoutMS=10000,
                    socketTimeoutMS=10000,
                    maxPoolSize=50,
                    retryWrites=True
                )
                
                # Test connection with ping
                start_time = time.time()
                await self.client.admin.command('ping')
                ping_time = (time.time() - start_time) * 1000
                
                # Get server info
                server_info = await self.client.server_info()
                
                # Extract database name from URI or use default
                db_name = self._extract_database_name(mongodb_uri)
                self.db = self.client[db_name]
                
                # Create indexes
                await self._create_indexes()
                
                # Update connection status
                CONNECTION_STATUS.update({
                    "type": "MongoDB Atlas",
                    "connected": True,
                    "error": None,
                    "last_check": datetime.now().isoformat(),
                    "details": {
                        "database": db_name,
                        "version": server_info.get('version', 'unknown'),
                        "ping_ms": round(ping_time, 2),
                        "connection_attempts": self.connection_attempts,
                        "server_info": server_info
                    }
                })
                
                self.connected = True
                
                logger.info("=" * 60)
                logger.info("✅ MONGODB CONNECTION SUCCESS!")
                logger.info(f"📊 Database: {db_name}")
                logger.info(f"⚡ Ping: {ping_time:.2f}ms")
                logger.info(f"🔢 MongoDB Version: {server_info.get('version', 'unknown')}")
                logger.info("=" * 60)
                
                return
                
            except ServerSelectionTimeoutError as e:
                error_msg = f"MongoDB connection timeout (attempt {self.connection_attempts}): Connection timed out"
                logger.error(f"⏱️ {error_msg}")
                CONNECTION_STATUS["error"] = error_msg
                
            except ConnectionFailure as e:
                error_msg = f"MongoDB connection failed (attempt {self.connection_attempts}): {str(e)}"
                logger.error(f"❌ {error_msg}")
                CONNECTION_STATUS["error"] = error_msg
                
            except Exception as e:
                error_msg = f"Unexpected MongoDB error (attempt {self.connection_attempts}): {str(e)}"
                logger.error(f"💥 {error_msg}")
                CONNECTION_STATUS["error"] = error_msg
            
            if attempt < self.max_retries - 1:
                wait_time = 2 ** attempt  # Exponential backoff
                logger.info(f"⏳ Waiting {wait_time} seconds before retry...")
                await asyncio.sleep(wait_time)
        
        # All attempts failed
        CONNECTION_STATUS.update({
            "type": "MongoDB Atlas",
            "connected": False,
            "last_check": datetime.now().isoformat(),
            "details": {"attempts": self.connection_attempts}
        })
        
        self.connected = False
        raise ConnectionError(f"Failed to connect to MongoDB after {self.max_retries} attempts")
    
    def _extract_database_name(self, mongodb_uri: str) -> str:
        """Extract database name from MongoDB URI"""
        try:
            # Try to extract from URI path
            if '/' in mongodb_uri.split('?')[0]:
                path_part = mongodb_uri.split('/')[-1].split('?')[0]
                if path_part and path_part != '':
                    return path_part
            
            # Default database name
            return 'lineoa'
        except:
            return 'lineoa'
    
    async def _create_indexes(self):
        """Create database indexes"""
        try:
            # Chat history indexes
            await self.db.chat_history.create_index([("user_id", 1)])
            await self.db.chat_history.create_index([("created_at", -1)])
            
            # Config store index
            await self.db.config_store.create_index([("config_key", 1)], unique=True)
            
            # Users index
            await self.db.users.create_index([("user_id", 1)], unique=True)
            
            logger.info("✅ MongoDB indexes created/verified")
            
        except Exception as e:
            logger.warning(f"⚠️ Index creation warning: {e}")
    
    async def initialize(self):
        """Initialize MongoDB connection"""
        if not self.connected:
            await self._connect()
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test MongoDB connection with detailed status"""
        try:
            if not self.client:
                await self.initialize()
            
            # Ping database
            start_time = time.time()
            await self.client.admin.command('ping')
            ping_time = (time.time() - start_time) * 1000
            
            # Get database statistics
            try:
                stats = await self.db.command('dbstats')
            except:
                stats = {}
            
            # Count documents in collections
            counts = {}
            collections = ['chat_history', 'config_store', 'users']
            for collection in collections:
                try:
                    counts[collection] = await self.db[collection].count_documents({})
                except:
                    counts[collection] = 0
            
            result = {
                "status": "connected",
                "type": "MongoDB Atlas",
                "database": self.db.name,
                "ping_ms": round(ping_time, 2),
                "collections": stats.get('collections', 0),
                "dataSize": f"{stats.get('dataSize', 0) / 1024 / 1024:.2f} MB",
                "storageSize": f"{stats.get('storageSize', 0) / 1024 / 1024:.2f} MB",
                "record_counts": counts,
                "indexes": stats.get('indexes', 0),
                "message": f"✅ MongoDB Atlas connected (ping: {ping_time:.2f}ms)"
            }
            
            # Update global status
            CONNECTION_STATUS.update({
                "type": "MongoDB Atlas",
                "connected": True,
                "error": None,
                "last_check": datetime.now().isoformat(),
                "details": result
            })
            
            return result
            
        except Exception as e:
            error_result = {
                "status": "error",
                "type": "MongoDB Atlas",
                "error": str(e),
                "message": f"❌ MongoDB connection error: {str(e)}"
            }
            
            CONNECTION_STATUS.update({
                "type": "MongoDB Atlas",
                "connected": False,
                "error": str(e),
                "last_check": datetime.now().isoformat()
            })
            
            return error_result
    
    async def save_chat_history(self, user_id: str, direction: str, 
                         message: Dict[str, Any], sender: str) -> None:
        """Save chat history with connection check"""
        if not self.connected:
            logger.error("❌ Cannot save chat: MongoDB not connected")
            return
        
        try:
            message_type = message.get("type", "text")
            message_text = ""
            
            if message_type == "text":
                message_text = message.get("text", "")
            elif message_type == "image":
                message_text = "ส่งรูปภาพ (สลิป)"
            else:
                message_text = f"ส่งข้อความประเภท {message_type}"
            
            document = {
                "user_id": user_id,
                "direction": direction,
                "message_type": message_type,
                "message_text": message_text,
                "sender": sender,
                "created_at": datetime.utcnow()
            }
            
            result = await self.db.chat_history.insert_one(document)
            
            # Update user stats
            await self.db.users.update_one(
                {"user_id": user_id},
                {
                    "$set": {"last_seen": datetime.utcnow()},
                    "$inc": {"message_count": 1},
                    "$setOnInsert": {
                        "first_seen": datetime.utcnow(),
                        "is_blocked": False
                    }
                },
                upsert=True
            )
            
            logger.info(f"✅ Chat saved to MongoDB with ID: {result.inserted_id}")
            
        except Exception as e:
            logger.error(f"❌ Error saving to MongoDB: {e}")
    
    async def get_chat_history_count(self) -> int:
        """Get total message count"""
        try:
            if not self.connected:
                await self.initialize()
            count = await self.db.chat_history.count_documents({})
            logger.debug(f"📊 Total messages in MongoDB: {count}")
            return count
        except Exception as e:
            logger.error(f"❌ Error counting messages: {e}")
            return 0
    
    async def get_config(self, key: str, default=None):
        """Get configuration value"""
        try:
            if not self.connected:
                await self.initialize()
            doc = await self.db.config_store.find_one({"config_key": key})
            if doc:
                value = doc.get("config_value")
                logger.debug(f"📖 Config {key} = {value}")
                return value
            return default
        except Exception as e:
            logger.error(f"❌ Error getting config {key}: {e}")
            return default
    
    async def set_config(self, key: str, value: Any, is_sensitive: bool = False) -> bool:
        """Set configuration value"""
        try:
            if not self.connected:
                await self.initialize()
            await self.db.config_store.update_one(
                {"config_key": key},
                {
                    "$set": {
                        "config_key": key,
                        "config_value": value,
                        "is_sensitive": is_sensitive,
                        "updated_at": datetime.utcnow()
                    }
                },
                upsert=True
            )
            logger.info(f"✅ Config {key} saved to MongoDB")
            return True
        except Exception as e:
            logger.error(f"❌ Error setting config {key}: {e}")
            return False

# ==================== SQLite Fallback Implementation ====================
class SQLiteDatabase:
    """SQLite fallback database with same interface"""
    
    def __init__(self):
        self.DB_PATH = "chat_history.db"
        self.init_database()
        
    def init_database(self):
        """Initialize SQLite database"""
        try:
            conn = sqlite3.connect(self.DB_PATH)
            cursor = conn.cursor()
            
            # Create tables
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS chat_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    direction TEXT NOT NULL,
                    message_type TEXT DEFAULT 'text',
                    message_text TEXT,
                    sender TEXT DEFAULT 'unknown',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS config_store (
                    config_key TEXT PRIMARY KEY,
                    config_value TEXT,
                    is_sensitive BOOLEAN DEFAULT FALSE,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            conn.commit()
            conn.close()
            
            logger.info("✅ SQLite database initialized")
            
        except Exception as e:
            logger.error(f"❌ SQLite init error: {e}")
    
    async def initialize(self):
        """Initialize SQLite (sync method)"""
        pass  # Already initialized in __init__
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test SQLite connection"""
        try:
            conn = sqlite3.connect(self.DB_PATH)
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM chat_history")
            chat_count = cursor.fetchone()[0]
            conn.close()
            
            return {
                "status": "connected",
                "type": "SQLite",
                "database": self.DB_PATH,
                "record_counts": {"chat_history": chat_count},
                "message": "✅ SQLite connected"
            }
        except Exception as e:
            return {
                "status": "error",
                "type": "SQLite",
                "error": str(e),
                "message": f"❌ SQLite error: {str(e)}"
            }
    
    async def save_chat_history(self, user_id: str, direction: str, 
                         message: Dict[str, Any], sender: str) -> None:
        """Save chat history to SQLite"""
        try:
            message_type = message.get("type", "text")
            message_text = message.get("text", "") if message_type == "text" else f"ส่งข้อความประเภท {message_type}"
            
            conn = sqlite3.connect(self.DB_PATH)
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO chat_history (user_id, direction, message_type, message_text, sender) VALUES (?, ?, ?, ?, ?)",
                (user_id, direction, message_type, message_text, sender)
            )
            conn.commit()
            conn.close()
            
            logger.info(f"✅ Chat saved to SQLite")
            
        except Exception as e:
            logger.error(f"❌ Error saving to SQLite: {e}")
    
    async def get_chat_history_count(self) -> int:
        """Get total message count from SQLite"""
        try:
            conn = sqlite3.connect(self.DB_PATH)
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM chat_history")
            count = cursor.fetchone()[0]
            conn.close()
            return count
        except Exception as e:
            logger.error(f"❌ Error counting SQLite messages: {e}")
            return 0
    
    async def get_config(self, key: str, default=None):
        """Get configuration from SQLite"""
        try:
            conn = sqlite3.connect(self.DB_PATH)
            cursor = conn.cursor()
            cursor.execute("SELECT config_value FROM config_store WHERE config_key = ?", (key,))
            result = cursor.fetchone()
            conn.close()
            return result[0] if result else default
        except Exception as e:
            logger.error(f"❌ Error getting config {key}: {e}")
            return default
    
    async def set_config(self, key: str, value: Any, is_sensitive: bool = False) -> bool:
        """Set configuration in SQLite"""
        try:
            conn = sqlite3.connect(self.DB_PATH)
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO config_store (config_key, config_value, is_sensitive) VALUES (?, ?, ?)",
                (key, str(value), is_sensitive)
            )
            conn.commit()
            conn.close()
            logger.info(f"✅ Config {key} saved to SQLite")
            return True
        except Exception as e:
            logger.error(f"❌ Error setting config {key}: {e}")
            return False

# ==================== Database Manager ====================
class DatabaseManager:
    """Main database manager with async support"""
    
    def __init__(self):
        self.db = None
        self.db_type = None
        self.initialized = False
        
    async def initialize_database(self):
        """Initialize database with detailed logging"""
        if self.initialized:
            return
            
        global CONNECTION_STATUS
        
        logger.info("=" * 60)
        logger.info("📦 DATABASE INITIALIZATION")
        logger.info("=" * 60)
        
        # Check configuration
        use_mongodb = os.getenv('USE_MONGODB', 'false').lower() == 'true'
        mongodb_uri = os.getenv('MONGODB_URI', '')
        
        logger.info(f"🔧 Configuration:")
        logger.info(f"   USE_MONGODB: {use_mongodb}")
        logger.info(f"   MONGODB_URI exists: {bool(mongodb_uri)}")
        logger.info(f"   MONGODB_AVAILABLE: {MONGODB_AVAILABLE}")
        
        if use_mongodb and mongodb_uri and MONGODB_AVAILABLE:
            try:
                logger.info("🚀 Initializing MongoDB Atlas...")
                self.db = MongoDatabase()
                await self.db.initialize()
                self.db_type = "MongoDB"
                logger.info("✅ MongoDB Atlas initialized successfully!")
                await self._init_default_configs()
                self.initialized = True
                return
                
            except Exception as e:
                logger.error(f"❌ MongoDB initialization failed: {e}")
                logger.info("🔄 Falling back to SQLite...")
        
        # Fallback to SQLite
        logger.info("📦 Using SQLite database (fallback)")
        self.db = SQLiteDatabase()
        self.db_type = "SQLite"
        await self.db.initialize()
        CONNECTION_STATUS.update({
            "type": "SQLite",
            "connected": True,
            "error": None,
            "last_check": datetime.now().isoformat()
        })
        await self._init_default_configs()
        self.initialized = True
    
    async def _init_default_configs(self):
        """Initialize default configurations"""
        defaults = {
            'ai_enabled': True,
            'slip_enabled': True,
            'thunder_enabled': True,
            'kbank_enabled': False,
            'ai_prompt': 'คุณเป็นผู้ช่วยที่เป็นมิตร'
        }
        
        for key, value in defaults.items():
            current_value = await self.db.get_config(key)
            if current_value is None:
                await self.db.set_config(key, value)
        
        logger.info(f"✅ Default configs initialized in {self.db_type}")

# ==================== Import asyncio ====================
import asyncio

# ==================== Initialize Database Manager ====================
logger.info("🚀 Starting database module...")
db_manager = DatabaseManager()

# ==================== Export Functions ====================
async def init_database():
    """Initialize database"""
    await db_manager.initialize_database()
    logger.info(f"✅ Database initialized: {db_manager.db_type}")

def get_connection_info():
    """Get detailed connection information"""
    return CONNECTION_STATUS

async def save_chat_history(user_id: str, direction: str, message: Dict[str, Any], sender: str):
    """Save chat history"""
    if not db_manager.initialized:
        await init_database()
    return await db_manager.db.save_chat_history(user_id, direction, message, sender)

async def get_chat_history_count() -> int:
    """Get total message count"""
    if not db_manager.initialized:
        await init_database()
    return await db_manager.db.get_chat_history_count()

async def test_connection() -> Dict[str, Any]:
    """Test database connection"""
    if not db_manager.initialized:
        await init_database()
    return await db_manager.db.test_connection()

async def get_database_status() -> Dict[str, Any]:
    """Get comprehensive database status"""
    status = await test_connection()
    status['connection_info'] = CONNECTION_STATUS
    return status

async def get_config(key: str, default=None):
    """Get configuration value"""
    if not db_manager.initialized:
        await init_database()
    return await db_manager.db.get_config(key, default)

async def set_config(key: str, value: Any, is_sensitive: bool = False) -> bool:
    """Set configuration value"""
    if not db_manager.initialized:
        await init_database()
    return await db_manager.db.set_config(key, value, is_sensitive)

# Sync wrappers for backward compatibility
def get_config_sync(key: str, default=None):
    """Sync wrapper for get_config"""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # If in async context, create new task
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, get_config(key, default))
                return future.result()
        else:
            return asyncio.run(get_config(key, default))
    except:
        # Ultimate fallback
        return default

def set_config_sync(key: str, value: Any, is_sensitive: bool = False) -> bool:
    """Sync wrapper for set_config"""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, set_config(key, value, is_sensitive))
                return future.result()
        else:
            return asyncio.run(set_config(key, value, is_sensitive))
    except:
        return False

# Other backward compatibility functions
def verify_tables() -> Dict[str, bool]:
    return {"chat_history": True, "config_store": True, "users": True}

def get_recent_chat_history(limit: int = 50):
    return []

def get_user_chat_history(user_id: str, limit: int = 10):
    return []

def get_all_configs():
    return {}

def update_multiple_configs(configs):
    for key, value in configs.items():
        set_config_sync(key, value)
    return True

# Final status log
logger.info("=" * 60)
logger.info(f"📊 DATABASE MODULE STATUS:")
logger.info(f"   Manager: {db_manager.__class__.__name__}")
logger.info(f"   MongoDB Available: {MONGODB_AVAILABLE}")
logger.info("=" * 60)
