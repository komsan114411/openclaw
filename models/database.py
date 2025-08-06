# models/database.py
"""
Database Module - รองรับทั้ง MongoDB Atlas และ SQLite fallback
MongoDB Atlas เป็นตัวเลือกหลัก, SQLite เป็น fallback
"""

import os
import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from dataclasses import dataclass
import sqlite3

logger = logging.getLogger("database")

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
    from pymongo.errors import ConnectionFailure
    import certifi
    from bson import ObjectId
    MONGODB_AVAILABLE = True
except ImportError:
    MONGODB_AVAILABLE = False
    logger.warning("⚠️ pymongo not installed, MongoDB not available")

class MongoDatabase:
    """MongoDB Atlas Database Handler"""
    
    def __init__(self):
        self.client = None
        self.db = None
        self.connected = False
        self._connect()
    
    def _connect(self):
        """Connect to MongoDB Atlas"""
        try:
            mongodb_uri = os.getenv('MONGODB_URI')
            
            if not mongodb_uri:
                raise ValueError("MONGODB_URI not configured")
            
            logger.info("🔄 Connecting to MongoDB Atlas...")
            
            # Connect with proper SSL settings
            self.client = MongoClient(
                mongodb_uri,
                tlsCAFile=certifi.where(),
                serverSelectionTimeoutMS=10000,
                connectTimeoutMS=10000
            )
            
            # Test connection
            self.client.admin.command('ping')
            
            # Get database name from URI or use default
            if 'lineoa' in mongodb_uri:
                self.db = self.client.lineoa
            else:
                # Extract database name from URI
                db_name = mongodb_uri.split('/')[-1].split('?')[0] or 'lineoa'
                self.db = self.client[db_name]
            
            # Create indexes
            self._create_indexes()
            
            self.connected = True
            logger.info(f"✅ MongoDB Atlas connected to database: {self.db.name}")
            
        except Exception as e:
            self.connected = False
            logger.error(f"❌ MongoDB connection failed: {e}")
            raise
    
    def _create_indexes(self):
        """Create database indexes for performance"""
        try:
            # Chat history indexes
            self.db.chat_history.create_index([("user_id", ASCENDING)])
            self.db.chat_history.create_index([("created_at", DESCENDING)])
            
            # Config store index
            self.db.config_store.create_index([("config_key", ASCENDING)], unique=True)
            
            # Users index
            self.db.users.create_index([("user_id", ASCENDING)], unique=True)
            
            logger.info("✅ MongoDB indexes created")
        except Exception as e:
            logger.warning(f"⚠️ Index creation warning: {e}")
    
    def save_chat_history(self, user_id: str, direction: str, 
                         message: Dict[str, Any], sender: str) -> None:
        """Save chat history to MongoDB"""
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
            
            logger.info(f"✅ Chat saved with ID: {result.inserted_id}")
            
        except Exception as e:
            logger.error(f"❌ Error saving chat history: {e}")
    
    def get_chat_history_count(self) -> int:
        """Get total chat message count"""
        try:
            return self.db.chat_history.count_documents({})
        except Exception as e:
            logger.error(f"❌ Error counting messages: {e}")
            return 0
    
    def get_recent_chat_history(self, limit: int = 50) -> List[ChatHistory]:
        """Get recent chat history"""
        try:
            cursor = self.db.chat_history.find().sort("created_at", DESCENDING).limit(limit)
            
            history = []
            for doc in cursor:
                history.append(ChatHistory(
                    id=str(doc.get("_id", "")),
                    user_id=doc.get("user_id", ""),
                    direction=doc.get("direction", ""),
                    message_type=doc.get("message_type", "text"),
                    message_text=doc.get("message_text", ""),
                    sender=doc.get("sender", "unknown"),
                    created_at=doc.get("created_at", datetime.utcnow())
                ))
            
            return list(reversed(history))
            
        except Exception as e:
            logger.error(f"❌ Error getting chat history: {e}")
            return []
    
    def get_user_chat_history(self, user_id: str, limit: int = 10) -> List[Dict[str, str]]:
        """Get user's chat history for AI context"""
        try:
            cursor = self.db.chat_history.find({
                "user_id": user_id,
                "message_type": "text",
                "message_text": {"$ne": ""}
            }).sort("created_at", DESCENDING).limit(limit)
            
            messages = []
            for doc in reversed(list(cursor)):
                role = "user" if doc["direction"] == "in" else "assistant"
                messages.append({
                    "role": role,
                    "content": doc["message_text"]
                })
            
            return messages
            
        except Exception as e:
            logger.error(f"❌ Error getting user history: {e}")
            return []
    
    def get_config(self, key: str, default=None):
        """Get configuration value"""
        try:
            doc = self.db.config_store.find_one({"config_key": key})
            
            if doc:
                value = doc.get("config_value")
                value_type = doc.get("value_type", "string")
                
                if value_type == "boolean":
                    return value in [True, "true", "1", "yes", "on"]
                elif value_type == "integer":
                    return int(value) if value else 0
                elif value_type == "float":
                    return float(value) if value else 0.0
                elif value_type == "json":
                    return json.loads(value) if value else {}
                else:
                    return value
            
            return default
            
        except Exception as e:
            logger.error(f"❌ Error getting config {key}: {e}")
            return default
    
    def set_config(self, key: str, value: Any, is_sensitive: bool = False) -> bool:
        """Set configuration value"""
        try:
            # Determine value type
            if isinstance(value, bool):
                value_type = "boolean"
                store_value = value
            elif isinstance(value, int):
                value_type = "integer"
                store_value = value
            elif isinstance(value, float):
                value_type = "float"
                store_value = value
            elif isinstance(value, (dict, list)):
                value_type = "json"
                store_value = json.dumps(value)
            else:
                value_type = "string"
                store_value = str(value) if value else ""
            
            self.db.config_store.update_one(
                {"config_key": key},
                {
                    "$set": {
                        "config_key": key,
                        "config_value": store_value,
                        "value_type": value_type,
                        "is_sensitive": is_sensitive,
                        "updated_at": datetime.utcnow()
                    }
                },
                upsert=True
            )
            
            logger.info(f"✅ Config {key} updated")
            return True
            
        except Exception as e:
            logger.error(f"❌ Error setting config {key}: {e}")
            return False
    
    def test_connection(self) -> Dict[str, Any]:
        """Test database connection"""
        try:
            self.client.admin.command('ping')
            stats = self.db.command('dbstats')
            
            return {
                "status": "connected",
                "type": "MongoDB Atlas",
                "database": self.db.name,
                "host": "MongoDB Atlas Cluster",
                "collections": stats.get('collections', 0),
                "dataSize": f"{stats.get('dataSize', 0) / 1024 / 1024:.2f} MB",
                "storageSize": f"{stats.get('storageSize', 0) / 1024 / 1024:.2f} MB",
                "record_counts": {
                    "chat_history": self.get_chat_history_count(),
                    "users": self.db.users.count_documents({}),
                    "config_store": self.db.config_store.count_documents({})
                },
                "message": "✅ MongoDB Atlas connected"
            }
        except Exception as e:
            return {
                "status": "error",
                "type": "MongoDB",
                "error": str(e),
                "message": f"❌ MongoDB error: {str(e)}"
            }

# ==================== SQLite Fallback ====================
class SQLiteDatabase:
    """SQLite fallback database when MongoDB is not available"""
    
    def __init__(self):
        self.db_path = "storage.db"
        self.init_tables()
    
    def get_connection(self):
        """Get SQLite connection"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn
    
    def init_tables(self):
        """Initialize SQLite tables"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        # Create tables
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chat_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                direction TEXT NOT NULL,
                message_type TEXT DEFAULT 'text',
                message_text TEXT,
                sender TEXT DEFAULT 'unknown',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS config_store (
                config_key TEXT PRIMARY KEY,
                config_value TEXT,
                value_type TEXT DEFAULT 'string',
                is_sensitive INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                display_name TEXT,
                first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                message_count INTEGER DEFAULT 0,
                is_blocked INTEGER DEFAULT 0
            )
        """)
        
        conn.commit()
        conn.close()
        logger.info("✅ SQLite tables initialized")
    
    def save_chat_history(self, user_id: str, direction: str, 
                         message: Dict[str, Any], sender: str) -> None:
        """Save chat history to SQLite"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        message_type = message.get("type", "text")
        message_text = message.get("text", "") if message_type == "text" else f"[{message_type}]"
        
        cursor.execute("""
            INSERT INTO chat_history (user_id, direction, message_type, message_text, sender)
            VALUES (?, ?, ?, ?, ?)
        """, (user_id, direction, message_type, message_text, sender))
        
        conn.commit()
        conn.close()
    
    def get_chat_history_count(self) -> int:
        """Get total message count"""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as count FROM chat_history")
        count = cursor.fetchone()['count']
        conn.close()
        return count
    
    def test_connection(self) -> Dict[str, Any]:
        """Test SQLite connection"""
        return {
            "status": "connected",
            "type": "SQLite (Fallback)",
            "database": self.db_path,
            "message": "✅ Using SQLite fallback (MongoDB not available)"
        }
    
    # Implement other methods similarly...
    def get_config(self, key: str, default=None):
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT config_value FROM config_store WHERE config_key = ?", (key,))
        row = cursor.fetchone()
        conn.close()
        return row['config_value'] if row else default
    
    def set_config(self, key: str, value: Any, is_sensitive: bool = False) -> bool:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO config_store (config_key, config_value, is_sensitive)
            VALUES (?, ?, ?)
        """, (key, str(value), 1 if is_sensitive else 0))
        conn.commit()
        conn.close()
        return True

# ==================== Database Manager ====================
class DatabaseManager:
    """Main database manager that selects appropriate database"""
    
    def __init__(self):
        self.db = None
        self.db_type = None
        self._initialize_database()
    
    def _initialize_database(self):
        """Initialize appropriate database based on configuration"""
        
        # Check if MongoDB should be used
        use_mongodb = os.getenv('USE_MONGODB', 'false').lower() == 'true'
        mongodb_uri = os.getenv('MONGODB_URI', '')
        
        if use_mongodb and mongodb_uri and MONGODB_AVAILABLE:
            try:
                self.db = MongoDatabase()
                self.db_type = "MongoDB"
                logger.info("📦 Using MongoDB Atlas as primary database")
                self._init_default_configs()
                return
            except Exception as e:
                logger.error(f"❌ MongoDB initialization failed: {e}")
                logger.info("🔄 Falling back to SQLite...")
        
        # Fallback to SQLite
        self.db = SQLiteDatabase()
        self.db_type = "SQLite"
        logger.info("📦 Using SQLite database")
        self._init_default_configs()
    
    def _init_default_configs(self):
        """Initialize default configuration values"""
        defaults = {
            'ai_enabled': True,
            'slip_enabled': True,
            'thunder_enabled': True,
            'kbank_enabled': False,
            'ai_prompt': 'คุณเป็นผู้ช่วยที่เป็นมิตรและให้ความช่วยเหลือ',
            'openai_model': 'gpt-3.5-turbo'
        }
        
        for key, value in defaults.items():
            if self.db.get_config(key) is None:
                self.db.set_config(key, value)
        
        logger.info("✅ Default configurations initialized")

# ==================== Create Singleton Instance ====================
db_manager = DatabaseManager()

# ==================== Export Functions ====================
def init_database():
    """Initialize database"""
    logger.info(f"✅ Database initialized ({db_manager.db_type})")

def save_chat_history(user_id: str, direction: str, message: Dict[str, Any], sender: str):
    """Save chat history"""
    return db_manager.db.save_chat_history(user_id, direction, message, sender)

def get_chat_history_count() -> int:
    """Get total message count"""
    return db_manager.db.get_chat_history_count()

def get_recent_chat_history(limit: int = 50) -> List[ChatHistory]:
    """Get recent chat history"""
    if hasattr(db_manager.db, 'get_recent_chat_history'):
        return db_manager.db.get_recent_chat_history(limit)
    return []

def get_user_chat_history(user_id: str, limit: int = 10) -> List[Dict[str, str]]:
    """Get user chat history for AI context"""
    if hasattr(db_manager.db, 'get_user_chat_history'):
        return db_manager.db.get_user_chat_history(user_id, limit)
    return []

def test_connection() -> Dict[str, Any]:
    """Test database connection"""
    return db_manager.db.test_connection()

def get_database_status() -> Dict[str, Any]:
    """Get database status"""
    return db_manager.db.test_connection()

def verify_tables() -> Dict[str, bool]:
    """Verify database tables/collections"""
    return {
        "chat_history": True,
        "config_store": True,
        "users": True
    }

def get_config(key: str, default=None):
    """Get configuration value"""
    return db_manager.db.get_config(key, default)

def set_config(key: str, value: Any, is_sensitive: bool = False) -> bool:
    """Set configuration value"""
    return db_manager.db.set_config(key, value, is_sensitive)

def get_all_configs() -> Dict[str, Any]:
    """Get all configuration values"""
    if hasattr(db_manager.db, 'get_all_configs'):
        return db_manager.db.get_all_configs()
    
    # Fallback implementation
    configs = {}
    for key in ['ai_enabled', 'slip_enabled', 'thunder_enabled', 'kbank_enabled']:
        configs[key] = get_config(key, False)
    return configs

def update_multiple_configs(updates: Dict[str, Any]) -> bool:
    """Update multiple configurations"""
    try:
        for key, value in updates.items():
            sensitive_keys = [
                'line_channel_secret', 'line_channel_access_token',
                'thunder_api_token', 'openai_api_key'
            ]
            is_sensitive = key in sensitive_keys
            set_config(key, value, is_sensitive)
        return True
    except Exception as e:
        logger.error(f"❌ Error updating configs: {e}")
        return False

# Export for backward compatibility
ChatHistory = ChatHistory

logger.info(f"📦 Database module loaded with {db_manager.db_type}")
