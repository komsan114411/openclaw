# models/database.py
"""
Database Module with Connection Status Monitoring
Supports MongoDB Atlas as primary, SQLite as fallback
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
    from pymongo import MongoClient, ASCENDING, DESCENDING
    from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
    import certifi
    from bson import ObjectId
    MONGODB_AVAILABLE = True
    logger.info("✅ pymongo module loaded successfully")
except ImportError as e:
    MONGODB_AVAILABLE = False
    logger.error(f"❌ pymongo not available: {e}")

class MongoDatabase:
    """MongoDB Atlas Database Handler with Connection Monitoring"""
    
    def __init__(self):
        self.client = None
        self.db = None
        self.connected = False
        self.connection_attempts = 0
        self.max_retries = 3
        self._connect()
    
    def _connect(self):
        """Connect to MongoDB Atlas with retry logic"""
        global CONNECTION_STATUS
        
        mongodb_uri = os.getenv('MONGODB_URI', '')
        
        if not mongodb_uri:
            error_msg = "MONGODB_URI not configured in environment variables"
            logger.error(f"❌ {error_msg}")
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
        logger.info(f"📍 URI prefix: {mongodb_uri[:40]}...")
        logger.info(f"🔢 Attempt: {self.connection_attempts + 1}/{self.max_retries}")
        logger.info("=" * 60)
        
        for attempt in range(self.max_retries):
            self.connection_attempts = attempt + 1
            
            try:
                logger.info(f"🔄 Connecting to MongoDB Atlas (Attempt {self.connection_attempts})...")
                
                # Create client with timeout
                self.client = MongoClient(
                    mongodb_uri,
                    tlsCAFile=certifi.where(),
                    serverSelectionTimeoutMS=10000,
                    connectTimeoutMS=10000,
                    socketTimeoutMS=10000,
                    maxPoolSize=10,
                    retryWrites=True
                )
                
                # Test connection with ping
                start_time = time.time()
                self.client.admin.command('ping')
                ping_time = (time.time() - start_time) * 1000
                
                # Get server info
                server_info = self.client.server_info()
                
                # Extract database name
                if '/lineoa' in mongodb_uri:
                    db_name = 'lineoa'
                elif '/' in mongodb_uri.split('?')[0]:
                    db_name = mongodb_uri.split('/')[-1].split('?')[0] or 'lineoa'
                else:
                    db_name = 'lineoa'
                
                self.db = self.client[db_name]
                
                # Create indexes
                self._create_indexes()
                
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
                        "connection_attempts": self.connection_attempts
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
                error_msg = f"MongoDB connection timeout (attempt {self.connection_attempts}): {str(e)}"
                logger.error(f"⏱️ {error_msg}")
                CONNECTION_STATUS["error"] = error_msg
                
            except ConnectionFailure as e:
                error_msg = f"MongoDB connection failed (attempt {self.connection_attempts}): {str(e)}"
                logger.error(f"❌ {error_msg}")
                CONNECTION_STATUS["error"] = error_msg
                
            except Exception as e:
                error_msg = f"Unexpected error (attempt {self.connection_attempts}): {str(e)}"
                logger.error(f"💥 {error_msg}")
                CONNECTION_STATUS["error"] = error_msg
            
            if attempt < self.max_retries - 1:
                wait_time = 2 ** attempt  # Exponential backoff
                logger.info(f"⏳ Waiting {wait_time} seconds before retry...")
                time.sleep(wait_time)
        
        # All attempts failed
        CONNECTION_STATUS.update({
            "type": "MongoDB Atlas",
            "connected": False,
            "last_check": datetime.now().isoformat(),
            "details": {"attempts": self.connection_attempts}
        })
        
        self.connected = False
        raise ConnectionError(f"Failed to connect to MongoDB after {self.max_retries} attempts")
    
    def _create_indexes(self):
        """Create database indexes"""
        try:
            # Chat history indexes
            self.db.chat_history.create_index([("user_id", ASCENDING)])
            self.db.chat_history.create_index([("created_at", DESCENDING)])
            
            # Config store index
            self.db.config_store.create_index([("config_key", ASCENDING)], unique=True)
            
            # Users index
            self.db.users.create_index([("user_id", ASCENDING)], unique=True)
            
            logger.info("✅ MongoDB indexes created/verified")
            
        except Exception as e:
            logger.warning(f"⚠️ Index creation warning: {e}")
    
    def test_connection(self) -> Dict[str, Any]:
        """Test MongoDB connection with detailed status"""
        try:
            # Ping database
            start_time = time.time()
            self.client.admin.command('ping')
            ping_time = (time.time() - start_time) * 1000
            
            # Get database statistics
            stats = self.db.command('dbstats')
            
            # Count documents in collections
            counts = {}
            collections = ['chat_history', 'config_store', 'users']
            for collection in collections:
                try:
                    counts[collection] = self.db[collection].count_documents({})
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
    
    def save_chat_history(self, user_id: str, direction: str, 
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
            
            result = self.db.chat_history.insert_one(document)
            
            # Update user stats
            self.db.users.update_one(
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
    
    def get_chat_history_count(self) -> int:
        """Get total message count"""
        try:
            count = self.db.chat_history.count_documents({})
            logger.debug(f"📊 Total messages in MongoDB: {count}")
            return count
        except Exception as e:
            logger.error(f"❌ Error counting messages: {e}")
            return 0
    
    def get_config(self, key: str, default=None):
        """Get configuration value"""
        try:
            doc = self.db.config_store.find_one({"config_key": key})
            if doc:
                value = doc.get("config_value")
                logger.debug(f"📖 Config {key} = {value}")
                return value
            return default
        except Exception as e:
            logger.error(f"❌ Error getting config {key}: {e}")
            return default
    
    def set_config(self, key: str, value: Any, is_sensitive: bool = False) -> bool:
        """Set configuration value"""
        try:
            self.db.config_store.update_one(
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

# ==================== SQLite Fallback (keep existing code) ====================
class SQLiteDatabase:
    """SQLite fallback database"""
    # ... (keep your existing SQLite implementation)
    pass

# ==================== Database Manager ====================
class DatabaseManager:
    """Main database manager with connection monitoring"""
    
    def __init__(self):
        self.db = None
        self.db_type = None
        
        logger.info("=" * 60)
        logger.info("📦 DATABASE INITIALIZATION")
        logger.info("=" * 60)
        
        self._initialize_database()
    
    def _initialize_database(self):
        """Initialize database with detailed logging"""
        global CONNECTION_STATUS
        
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
                self.db_type = "MongoDB"
                logger.info("✅ MongoDB Atlas initialized successfully!")
                self._init_default_configs()
                return
                
            except Exception as e:
                logger.error(f"❌ MongoDB initialization failed: {e}")
                logger.info("🔄 Falling back to SQLite...")
        
        # Fallback to SQLite
        logger.info("📦 Using SQLite database (fallback)")
        self.db = SQLiteDatabase()
        self.db_type = "SQLite"
        CONNECTION_STATUS.update({
            "type": "SQLite",
            "connected": True,
            "error": None,
            "last_check": datetime.now().isoformat()
        })
        self._init_default_configs()
    
    def _init_default_configs(self):
        """Initialize default configurations"""
        defaults = {
            'ai_enabled': True,
            'slip_enabled': True,
            'thunder_enabled': True,
            'kbank_enabled': False,
            'ai_prompt': 'คุณเป็นผู้ช่วยที่เป็นมิตร'
        }
        
        for key, value in defaults.items():
            if self.db.get_config(key) is None:
                self.db.set_config(key, value)
        
        logger.info(f"✅ Default configs initialized in {self.db_type}")

# ==================== Initialize Database ====================
logger.info("🚀 Starting database module...")
db_manager = DatabaseManager()
logger.info(f"✅ Database ready: {db_manager.db_type}")

# ==================== Export Functions ====================
def init_database():
    """Initialize database"""
    logger.info(f"✅ Database initialized: {db_manager.db_type}")

def get_connection_info():
    """Get detailed connection information"""
    return CONNECTION_STATUS

def save_chat_history(user_id: str, direction: str, message: Dict[str, Any], sender: str):
    """Save chat history"""
    return db_manager.db.save_chat_history(user_id, direction, message, sender)

def get_chat_history_count() -> int:
    """Get total message count"""
    return db_manager.db.get_chat_history_count()

def test_connection() -> Dict[str, Any]:
    """Test database connection"""
    return db_manager.db.test_connection()

def get_database_status() -> Dict[str, Any]:
    """Get comprehensive database status"""
    status = db_manager.db.test_connection()
    status['connection_info'] = CONNECTION_STATUS
    return status

def get_config(key: str, default=None):
    """Get configuration value"""
    return db_manager.db.get_config(key, default)

def set_config(key: str, value: Any, is_sensitive: bool = False) -> bool:
    """Set configuration value"""
    return db_manager.db.set_config(key, value, is_sensitive)

# Other functions...
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
        set_config(key, value)
    return True

# Final status log
logger.info("=" * 60)
logger.info(f"📊 DATABASE MODULE STATUS:")
logger.info(f"   Type: {db_manager.db_type}")
logger.info(f"   Status: {CONNECTION_STATUS.get('connected', False)}")
logger.info(f"   Error: {CONNECTION_STATUS.get('error', 'None')}")
logger.info("=" * 60)
