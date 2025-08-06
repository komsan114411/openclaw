# models/database.py
"""
Enhanced Database Module with Priority Selection
"""

import os
import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from dataclasses import dataclass
import sqlite3
import time
import asyncio

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

@dataclass
class ChatHistory:
    id: Optional[str]
    user_id: str
    direction: str
    message_type: str
    message_text: str
    sender: str
    created_at: datetime

# ==================== Database Priority Detection ====================
def detect_database_priority():
    """Detect which database to use based on environment variables"""
    
    # Priority 1: MongoDB (if explicitly enabled)
    use_mongodb = os.getenv('USE_MONGODB', 'false').lower() == 'true'
    mongodb_uri = os.getenv('MONGODB_URI', '')
    
    # Priority 2: MySQL (if configured)
    mysql_host = os.getenv('MYSQL_HOST', '')
    mysql_user = os.getenv('MYSQL_USER', '')
    mysql_password = os.getenv('MYSQL_PASSWORD', '')
    mysql_database = os.getenv('MYSQL_DATABASE', '')
    
    logger.info("=" * 60)
    logger.info("🔍 DATABASE PRIORITY DETECTION")
    logger.info(f"   USE_MONGODB: {use_mongodb}")
    logger.info(f"   MONGODB_URI: {'Yes' if mongodb_uri else 'No'}")
    logger.info(f"   MySQL configured: {'Yes' if all([mysql_host, mysql_user, mysql_database]) else 'No'}")
    logger.info("=" * 60)
    
    if use_mongodb and mongodb_uri:
        return "mongodb", {"uri": mongodb_uri}
    elif all([mysql_host, mysql_user, mysql_database]):
        return "mysql", {
            "host": mysql_host,
            "user": mysql_user, 
            "password": mysql_password,
            "database": mysql_database,
            "port": int(os.getenv('MYSQL_PORT', 3306))
        }
    else:
        return "sqlite", {"path": "chat_history.db"}

# ==================== MongoDB Implementation ====================
try:
    from motor.motor_asyncio import AsyncIOMotorClient
    import certifi
    from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
    MONGODB_AVAILABLE = True
    logger.info("✅ Motor/pymongo available")
except ImportError as e:
    MONGODB_AVAILABLE = False
    logger.warning(f"⚠️ Motor/pymongo not available: {e}")

class MongoDatabase:
    """MongoDB Atlas Database Handler"""
    
    def __init__(self, config):
        self.client = None
        self.db = None
        self.connected = False
        self.mongodb_uri = config["uri"]
        
    async def initialize(self):
        """Initialize MongoDB connection"""
        global CONNECTION_STATUS
        
        try:
            logger.info("🚀 Initializing MongoDB Atlas...")
            
            # Create client
            self.client = AsyncIOMotorClient(
                self.mongodb_uri,
                tlsCAFile=certifi.where(),
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
            
            # Extract database name
            db_name = self._extract_database_name(self.mongodb_uri)
            self.db = self.client[db_name]
            
            # Create indexes
            await self._create_indexes()
            
            self.connected = True
            
            CONNECTION_STATUS.update({
                "type": "MongoDB Atlas",
                "connected": True,
                "error": None,
                "last_check": datetime.now().isoformat(),
                "details": {
                    "database": db_name,
                    "version": server_info.get('version'),
                    "ping_ms": round(ping_time, 2)
                }
            })
            
            logger.info(f"✅ MongoDB Atlas connected - Database: {db_name}, Ping: {ping_time:.2f}ms")
            
        except Exception as e:
            error_msg = f"MongoDB connection failed: {str(e)}"
            logger.error(f"❌ {error_msg}")
            CONNECTION_STATUS.update({
                "type": "MongoDB Atlas",
                "connected": False,
                "error": error_msg,
                "last_check": datetime.now().isoformat()
            })
            raise
    
    def _extract_database_name(self, mongodb_uri: str) -> str:
        """Extract database name from URI"""
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
            await self.db.chat_history.create_index([("user_id", 1)])
            await self.db.chat_history.create_index([("created_at", -1)])
            await self.db.config_store.create_index([("config_key", 1)], unique=True)
            await self.db.users.create_index([("user_id", 1)], unique=True)
            logger.info("✅ MongoDB indexes created")
        except Exception as e:
            logger.warning(f"⚠️ Index creation warning: {e}")
    
    async def save_chat_history(self, user_id: str, direction: str, message: Dict[str, Any], sender: str):
        """Save chat history to MongoDB"""
        try:
            document = {
                "user_id": user_id,
                "direction": direction,
                "message_type": message.get("type", "text"),
                "message_text": message.get("text", ""),
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
                    "$setOnInsert": {"first_seen": datetime.utcnow(), "is_blocked": False}
                },
                upsert=True
            )
            
            logger.debug(f"✅ Chat saved to MongoDB: {result.inserted_id}")
            
        except Exception as e:
            logger.error(f"❌ Error saving to MongoDB: {e}")
    
    async def get_chat_history_count(self) -> int:
        """Get total message count"""
        try:
            return await self.db.chat_history.count_documents({})
        except Exception as e:
            logger.error(f"❌ Error counting MongoDB messages: {e}")
            return 0
    
    async def get_config(self, key: str, default=None):
        """Get configuration from MongoDB"""
        try:
            doc = await self.db.config_store.find_one({"config_key": key})
            return doc.get("config_value") if doc else default
        except Exception as e:
            logger.error(f"❌ Error getting config {key}: {e}")
            return default
    
    async def set_config(self, key: str, value: Any, is_sensitive: bool = False) -> bool:
        """Set configuration in MongoDB"""
        try:
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
            return True
        except Exception as e:
            logger.error(f"❌ Error setting config {key}: {e}")
            return False

    async def test_connection(self) -> Dict[str, Any]:
        """Test MongoDB connection"""
        try:
            start_time = time.time()
            await self.client.admin.command('ping')
            ping_time = (time.time() - start_time) * 1000
            
            # Get collection counts
            counts = {}
            for collection in ['chat_history', 'config_store', 'users']:
                try:
                    counts[collection] = await self.db[collection].count_documents({})
                except:
                    counts[collection] = 0
            
            return {
                "status": "connected",
                "type": "MongoDB Atlas",
                "database": self.db.name,
                "ping_ms": round(ping_time, 2),
                "record_counts": counts,
                "message": f"✅ MongoDB connected (ping: {ping_time:.2f}ms)"
            }
        except Exception as e:
            return {
                "status": "error",
                "type": "MongoDB Atlas",
                "error": str(e),
                "message": f"❌ MongoDB error: {str(e)}"
            }

# ==================== MySQL Implementation ====================
try:
    import mysql.connector
    from mysql.connector import pooling
    MYSQL_AVAILABLE = True
    logger.info("✅ MySQL connector available")
except ImportError as e:
    MYSQL_AVAILABLE = False
    logger.warning(f"⚠️ MySQL connector not available: {e}")

class MySQLDatabase:
    """MySQL Database Handler"""
    
    def __init__(self, config):
        self.pool = None
        self.connected = False
        self.config = config
        
    async def initialize(self):
        """Initialize MySQL connection"""
        global CONNECTION_STATUS
        
        try:
            logger.info("🚀 Initializing MySQL...")
            
            # Create connection pool
            pool_config = {
                'host': self.config['host'],
                'port': self.config['port'],
                'user': self.config['user'],
                'password': self.config['password'],
                'database': self.config['database'],
                'charset': 'utf8mb4',
                'collation': 'utf8mb4_unicode_ci',
                'use_unicode': True,
                'autocommit': True,
                'pool_name': 'line_oa_pool',
                'pool_size': 5,
                'pool_reset_session': True
            }
            
            self.pool = mysql.connector.pooling.MySQLConnectionPool(**pool_config)
            
            # Test connection
            conn = self.pool.get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT VERSION()")
            version = cursor.fetchone()[0]
            cursor.close()
            conn.close()
            
            # Initialize tables
            self._init_tables()
            
            self.connected = True
            
            CONNECTION_STATUS.update({
                "type": "MySQL",
                "connected": True,
                "error": None,
                "last_check": datetime.now().isoformat(),
                "details": {
                    "host": self.config['host'],
                    "database": self.config['database'],
                    "version": version,
                    "pool_size": 5
                }
            })
            
            logger.info(f"✅ MySQL connected - Host: {self.config['host']}, Database: {self.config['database']}")
            
        except Exception as e:
            error_msg = f"MySQL connection failed: {str(e)}"
            logger.error(f"❌ {error_msg}")
            CONNECTION_STATUS.update({
                "type": "MySQL",
                "connected": False,
                "error": error_msg,
                "last_check": datetime.now().isoformat()
            })
            raise
    
    def _init_tables(self):
        """Initialize MySQL tables"""
        try:
            conn = self.pool.get_connection()
            cursor = conn.cursor()
            
            # Chat history table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS chat_history (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id VARCHAR(255) NOT NULL,
                    direction VARCHAR(10) NOT NULL,
                    message_type VARCHAR(50) DEFAULT 'text',
                    message_text TEXT,
                    sender VARCHAR(50) DEFAULT 'unknown',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_user_id (user_id),
                    INDEX idx_created_at (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """)
            
            # Config store table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS config_store (
                    config_key VARCHAR(255) PRIMARY KEY,
                    config_value TEXT,
                    value_type VARCHAR(20) DEFAULT 'string',
                    is_sensitive BOOLEAN DEFAULT FALSE,
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """)
            
            conn.commit()
            cursor.close()
            conn.close()
            
            logger.info("✅ MySQL tables initialized")
            
        except Exception as e:
            logger.error(f"❌ Error initializing MySQL tables: {e}")
            raise
    
    async def save_chat_history(self, user_id: str, direction: str, message: Dict[str, Any], sender: str):
        """Save chat history to MySQL"""
        try:
            message_type = message.get("type", "text")
            message_text = message.get("text", "") if message_type == "text" else f"ส่งข้อความประเภท {message_type}"
            
            conn = self.pool.get_connection()
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO chat_history (user_id, direction, message_type, message_text, sender) VALUES (%s, %s, %s, %s, %s)",
                (user_id, direction, message_type, message_text, sender)
            )
            conn.commit()
            cursor.close()
            conn.close()
            
            logger.debug(f"✅ Chat saved to MySQL")
            
        except Exception as e:
            logger.error(f"❌ Error saving to MySQL: {e}")
    
    async def get_chat_history_count(self) -> int:
        """Get total message count"""
        try:
            conn = self.pool.get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM chat_history")
            count = cursor.fetchone()[0]
            cursor.close()
            conn.close()
            return count
        except Exception as e:
            logger.error(f"❌ Error counting MySQL messages: {e}")
            return 0
    
    async def get_config(self, key: str, default=None):
        """Get configuration from MySQL"""
        try:
            conn = self.pool.get_connection()
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT config_value, value_type FROM config_store WHERE config_key = %s", (key,))
            result = cursor.fetchone()
            cursor.close()
            conn.close()
            
            if result:
                value = result['config_value']
                value_type = result['value_type']
                
                # Convert to appropriate type
                if value_type == 'boolean':
                    return value.lower() in ['true', '1', 'yes', 'on']
                elif value_type == 'integer':
                    return int(value) if value else 0
                elif value_type == 'float':
                    return float(value) if value else 0.0
                else:
                    return value
            
            return default
        except Exception as e:
            logger.error(f"❌ Error getting MySQL config {key}: {e}")
            return default
    
    async def set_config(self, key: str, value: Any, is_sensitive: bool = False) -> bool:
        """Set configuration in MySQL"""
        try:
            # Determine value type
            if isinstance(value, bool):
                value_type = 'boolean'
                str_value = 'true' if value else 'false'
            elif isinstance(value, int):
                value_type = 'integer'
                str_value = str(value)
            elif isinstance(value, float):
                value_type = 'float'
                str_value = str(value)
            else:
                value_type = 'string'
                str_value = str(value)
            
            conn = self.pool.get_connection()
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO config_store (config_key, config_value, value_type, is_sensitive)
                VALUES (%s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE 
                    config_value = VALUES(config_value),
                    value_type = VALUES(value_type),
                    is_sensitive = VALUES(is_sensitive),
                    updated_at = CURRENT_TIMESTAMP
            """, (key, str_value, value_type, is_sensitive))
            conn.commit()
            cursor.close()
            conn.close()
            
            return True
        except Exception as e:
            logger.error(f"❌ Error setting MySQL config {key}: {e}")
            return False

    async def test_connection(self) -> Dict[str, Any]:
        """Test MySQL connection"""
        try:
            conn = self.pool.get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT VERSION()")
            version = cursor.fetchone()[0]
            cursor.execute("SELECT COUNT(*) FROM chat_history")
            chat_count = cursor.fetchone()[0]
            cursor.close()
            conn.close()
            
            return {
                "status": "connected",
                "type": "MySQL",
                "host": self.config['host'],
                "database": self.config['database'],
                "version": version,
                "record_counts": {"chat_history": chat_count},
                "message": f"✅ MySQL connected - {self.config['host']}"
            }
        except Exception as e:
            return {
                "status": "error",
                "type": "MySQL",
                "error": str(e),
                "message": f"❌ MySQL error: {str(e)}"
            }

# ==================== SQLite Fallback ====================
class SQLiteDatabase:
    """SQLite fallback database"""
    
    def __init__(self, config):
        self.DB_PATH = config["path"]
        self.connected = False
        
    async def initialize(self):
        """Initialize SQLite database"""
        global CONNECTION_STATUS
        
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
            
            self.connected = True
            
            CONNECTION_STATUS.update({
                "type": "SQLite",
                "connected": True,
                "error": None,
                "last_check": datetime.now().isoformat(),
                "details": {"path": self.DB_PATH}
            })
            
            logger.info(f"✅ SQLite initialized - Path: {self.DB_PATH}")
            
        except Exception as e:
            error_msg = f"SQLite initialization failed: {str(e)}"
            logger.error(f"❌ {error_msg}")
            CONNECTION_STATUS.update({
                "type": "SQLite",
                "connected": False,
                "error": error_msg,
                "last_check": datetime.now().isoformat()
            })
            raise
    
    async def save_chat_history(self, user_id: str, direction: str, message: Dict[str, Any], sender: str):
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
            
            logger.debug(f"✅ Chat saved to SQLite")
            
        except Exception as e:
            logger.error(f"❌ Error saving to SQLite: {e}")
    
    async def get_chat_history_count(self) -> int:
        """Get total message count"""
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
            logger.error(f"❌ Error getting SQLite config {key}: {e}")
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
            return True
        except Exception as e:
            logger.error(f"❌ Error setting SQLite config {key}: {e}")
            return False

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

# ==================== Database Manager ====================
class DatabaseManager:
    """Main database manager with priority selection"""
    
    def __init__(self):
        self.db = None
        self.db_type = None
        self.initialized = False
        
    async def initialize_database(self):
        """Initialize database with priority detection"""
        if self.initialized:
            return
            
        logger.info("=" * 60)
        logger.info("📦 DATABASE INITIALIZATION")
        logger.info("=" * 60)
        
        # Detect database priority
        db_type, config = detect_database_priority()
        
        try:
            if db_type == "mongodb" and MONGODB_AVAILABLE:
                logger.info("🚀 Using MongoDB Atlas")
                self.db = MongoDatabase(config)
                self.db_type = "MongoDB"
                
            elif db_type == "mysql" and MYSQL_AVAILABLE:
                logger.info("🚀 Using MySQL")
                self.db = MySQLDatabase(config)
                self.db_type = "MySQL"
                
            else:
                logger.info("🚀 Using SQLite (fallback)")
                self.db = SQLiteDatabase(config)
                self.db_type = "SQLite"
            
            # Initialize the selected database
            await self.db.initialize()
            
            # Initialize default configs
            await self._init_default_configs()
            
            self.initialized = True
            logger.info(f"✅ Database system ready: {self.db_type}")
            
        except Exception as e:
            logger.error(f"❌ Database initialization failed: {e}")
            
            # Ultimate fallback to SQLite
            if self.db_type != "SQLite":
                logger.info("🔄 Falling back to SQLite...")
                try:
                    self.db = SQLiteDatabase({"path": "chat_history.db"})
                    self.db_type = "SQLite"
                    await self.db.initialize()
                    await self._init_default_configs()
                    self.initialized = True
                    logger.info("✅ SQLite fallback successful")
                except Exception as fallback_error:
                    logger.error(f"❌ SQLite fallback failed: {fallback_error}")
                    raise
            else:
                raise
    
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
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(get_config(key, default))
        finally:
            loop.close()
    except:
        return default

def set_config_sync(key: str, value: Any, is_sensitive: bool = False) -> bool:
    """Sync wrapper for set_config"""
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(set_config(key, value, is_sensitive))
        finally:
            loop.close()
    except:
        return False

# Other functions for backward compatibility
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

logger.info("=" * 60)
logger.info(f"📊 DATABASE MODULE LOADED")
logger.info(f"   MongoDB Available: {MONGODB_AVAILABLE}")
logger.info(f"   MySQL Available: {MYSQL_AVAILABLE}")
logger.info("=" * 60)
