# models/database.py
import os
import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from dataclasses import dataclass
import time

# ใช้ mysql.connector แทน mysql
try:
    import mysql.connector
    from mysql.connector import pooling, Error
    MYSQL_AVAILABLE = True
except ImportError:
    MYSQL_AVAILABLE = False
    Error = Exception
    logging.warning("⚠️ mysql-connector-python not installed, using SQLite fallback")

logger = logging.getLogger("database")

@dataclass
class ChatHistory:
    id: int
    user_id: str
    direction: str
    message_type: str
    message_text: str
    sender: str
    created_at: datetime

# ==================== SQLite Fallback ====================
import sqlite3

class SQLiteFallback:
    """SQLite fallback when MySQL is not available"""
    def __init__(self):
        self.db_path = "storage.db"
        self.init_tables()
    
    def get_connection(self):
        return sqlite3.connect(self.db_path)
    
    def execute_query(self, query: str, params: tuple = None, fetch: bool = False):
        conn = self.get_connection()
        conn.row_factory = sqlite3.Row if fetch else None
        cursor = conn.cursor()
        
        # Convert MySQL syntax to SQLite
        query = query.replace("AUTO_INCREMENT", "AUTOINCREMENT")
        query = query.replace("ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", "")
        query = query.replace("ON UPDATE CURRENT_TIMESTAMP", "")
        query = query.replace("INDEX ", "-- INDEX ")
        
        try:
            if params:
                cursor.execute(query, params)
            else:
                cursor.execute(query)
            
            if fetch:
                rows = cursor.fetchall()
                # Convert to dict for compatibility
                return [dict(row) for row in rows] if rows else []
            else:
                conn.commit()
                return cursor.lastrowid if cursor.lastrowid else True
        finally:
            conn.close()
    
    def init_tables(self):
        queries = [
            """
            CREATE TABLE IF NOT EXISTS chat_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                direction TEXT NOT NULL,
                message_type TEXT DEFAULT 'text',
                message_text TEXT,
                sender TEXT DEFAULT 'unknown',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS config_store (
                config_key TEXT PRIMARY KEY,
                config_value TEXT,
                value_type TEXT DEFAULT 'string',
                is_sensitive INTEGER DEFAULT 0,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS api_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                api_name TEXT,
                endpoint TEXT,
                status TEXT,
                response_time INTEGER,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                display_name TEXT,
                profile_picture TEXT,
                status_message TEXT,
                first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                message_count INTEGER DEFAULT 0,
                is_blocked INTEGER DEFAULT 0
            )
            """
        ]
        
        for query in queries:
            try:
                self.execute_query(query)
            except Exception as e:
                logger.warning(f"Table might already exist: {e}")

# ==================== MySQL Manager ====================
class DatabaseManager:
    def __init__(self):
        self.pool = None
        self.fallback = None
        self.use_fallback = False
        self.max_retries = 3
        self.retry_delay = 2
        
        if MYSQL_AVAILABLE:
            try:
                self._init_connection_pool()
            except Exception as e:
                logger.error(f"❌ MySQL init failed, using SQLite: {e}")
                self._use_sqlite_fallback()
        else:
            logger.warning("⚠️ MySQL module not available, using SQLite")
            self._use_sqlite_fallback()
    
    def _use_sqlite_fallback(self):
        """Switch to SQLite fallback"""
        self.use_fallback = True
        self.fallback = SQLiteFallback()
        logger.info("📦 Using SQLite database as fallback")
    
    def _get_db_config(self):
        """Get database configuration"""
        # Try DATABASE_URL first (common in Heroku)
        database_url = os.getenv('DATABASE_URL', '')
        
        if database_url and 'mysql://' in database_url:
            import re
            # Parse mysql://user:pass@host:port/database
            pattern = r'mysql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)'
            match = re.match(pattern, database_url)
            if match:
                return {
                    'user': match.group(1),
                    'password': match.group(2),
                    'host': match.group(3),
                    'port': int(match.group(4)),
                    'database': match.group(5)
                }
        
        # Use individual env vars
        return {
            'host': os.getenv('MYSQL_HOST', 'srv411.hstgr.io'),
            'port': int(os.getenv('MYSQL_PORT', 3306)),
            'user': os.getenv('MYSQL_USER', 'u807134893_ai'),
            'password': os.getenv('MYSQL_PASSWORD', '1234Zaza'),
            'database': os.getenv('MYSQL_DATABASE', 'u807134893_ai')
        }
    
    def _init_connection_pool(self):
        """Initialize MySQL connection pool"""
        if not MYSQL_AVAILABLE:
            raise ImportError("mysql-connector-python not installed")
        
        for attempt in range(self.max_retries):
            try:
                db_config = self._get_db_config()
                
                # Verify password is set
                if not db_config.get('password'):
                    raise ValueError("MySQL password not configured")
                
                pool_config = {
                    **db_config,
                    'charset': 'utf8mb4',
                    'use_unicode': True,
                    'autocommit': True,
                    'pool_name': 'line_oa_pool',
                    'pool_size': 3,
                    'pool_reset_session': True,
                    'raise_on_warnings': False,
                    'connect_timeout': 20,
                    'auth_plugin': 'mysql_native_password'
                }
                
                logger.info(f"🔄 Connecting to MySQL at {db_config['host']}:{db_config['port']}")
                self.pool = mysql.connector.pooling.MySQLConnectionPool(**pool_config)
                
                # Test connection
                test_conn = self.pool.get_connection()
                test_conn.close()
                
                logger.info(f"✅ MySQL connected - {db_config['host']}/{db_config['database']}")
                self.use_fallback = False
                break
                
            except Exception as e:
                logger.error(f"❌ MySQL attempt {attempt + 1}/{self.max_retries} failed: {e}")
                if attempt == self.max_retries - 1:
                    raise
                time.sleep(self.retry_delay)
    
    def get_connection(self):
        """Get database connection"""
        if self.use_fallback:
            return self.fallback.get_connection()
        
        if not self.pool:
            self._init_connection_pool()
        
        try:
            return self.pool.get_connection()
        except Exception as e:
            logger.error(f"❌ Failed to get MySQL connection: {e}")
            if not self.use_fallback:
                logger.info("🔄 Switching to SQLite fallback")
                self._use_sqlite_fallback()
                return self.fallback.get_connection()
            raise
    
    def execute_query(self, query: str, params: tuple = None, fetch: bool = False):
        """Execute database query"""
        if self.use_fallback:
            return self.fallback.execute_query(query, params, fetch)
        
        conn = None
        cursor = None
        try:
            conn = self.get_connection()
            cursor = conn.cursor(dictionary=True if fetch else False)
            
            if params:
                cursor.execute(query, params)
            else:
                cursor.execute(query)
            
            if fetch:
                return cursor.fetchall()
            else:
                if hasattr(conn, 'commit'):
                    conn.commit()
                return cursor.lastrowid if hasattr(cursor, 'lastrowid') and cursor.lastrowid else True
                
        except Exception as e:
            logger.error(f"❌ Query error: {e}")
            if conn and hasattr(conn, 'rollback'):
                conn.rollback()
            
            # Try fallback
            if not self.use_fallback:
                logger.info("🔄 Query failed, trying SQLite fallback")
                self._use_sqlite_fallback()
                return self.fallback.execute_query(query, params, fetch)
            raise
        finally:
            if cursor:
                cursor.close()
            if conn and hasattr(conn, 'close'):
                conn.close()

# Create singleton instance
db = DatabaseManager()

# ====================== Database Functions ======================

def init_database() -> None:
    """Initialize database tables"""
    try:
        # Table creation queries
        queries = [
            """
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
            """,
            """
            CREATE TABLE IF NOT EXISTS config_store (
                config_key VARCHAR(255) PRIMARY KEY,
                config_value TEXT,
                value_type VARCHAR(20) DEFAULT 'string',
                is_sensitive BOOLEAN DEFAULT FALSE,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_updated (updated_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """,
            """
            CREATE TABLE IF NOT EXISTS api_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                api_name VARCHAR(50),
                endpoint VARCHAR(255),
                status VARCHAR(20),
                response_time INT,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_api_name (api_name),
                INDEX idx_status (status),
                INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """,
            """
            CREATE TABLE IF NOT EXISTS users (
                user_id VARCHAR(255) PRIMARY KEY,
                display_name VARCHAR(255),
                profile_picture VARCHAR(500),
                status_message TEXT,
                first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                message_count INT DEFAULT 0,
                is_blocked BOOLEAN DEFAULT FALSE,
                INDEX idx_last_seen (last_seen)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        ]
        
        for query in queries:
            try:
                db.execute_query(query)
            except Exception as e:
                logger.warning(f"⚠️ Table creation warning (might already exist): {e}")
        
        logger.info("✅ Database tables initialized")
        
        # Insert default configs
        _init_default_configs()
        
    except Exception as e:
        logger.error(f"❌ Database initialization failed: {e}")
        raise

def _init_default_configs():
    """Initialize default configuration values"""
    default_configs = [
        ('ai_enabled', 'true', 'boolean', False, 'Enable AI chat system'),
        ('slip_enabled', 'true', 'boolean', False, 'Enable slip verification'),
        ('thunder_enabled', 'true', 'boolean', False, 'Enable Thunder API'),
        ('kbank_enabled', 'false', 'boolean', False, 'Enable KBank API'),
        ('kbank_sandbox_mode', 'true', 'boolean', False, 'Use KBank sandbox'),
        ('ai_prompt', 'คุณเป็นผู้ช่วยที่เป็นมิตรและให้ความช่วยเหลือ', 'string', False, 'AI system prompt'),
    ]
    
    for key, value, value_type, is_sensitive, description in default_configs:
        try:
            db.execute_query("""
                INSERT IGNORE INTO config_store 
                (config_key, config_value, value_type, is_sensitive, description)
                VALUES (%s, %s, %s, %s, %s)
            """, (key, value, value_type, is_sensitive, description))
        except Exception as e:
            # Try SQLite syntax
            try:
                db.execute_query("""
                    INSERT OR IGNORE INTO config_store 
                    (config_key, config_value, value_type, is_sensitive, description)
                    VALUES (?, ?, ?, ?, ?)
                """, (key, value, value_type, is_sensitive, description))
            except:
                logger.warning(f"⚠️ Could not insert default config {key}")

def test_connection() -> Dict[str, Any]:
    """Test database connection"""
    try:
        if db.use_fallback:
            return {
                "status": "connected",
                "type": "SQLite",
                "database": "storage.db",
                "message": "✅ Using SQLite (MySQL not available)"
            }
        
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT DATABASE(), VERSION()")
        result = cursor.fetchone()
        cursor.close()
        conn.close()
        
        return {
            "status": "connected",
            "type": "MySQL",
            "database": result[0] if result else "Unknown",
            "version": result[1] if result else "Unknown",
            "host": os.getenv('MYSQL_HOST'),
            "message": "✅ MySQL connection successful"
        }
    except Exception as e:
        return {
            "status": "error",
            "type": "SQLite" if db.use_fallback else "MySQL",
            "error": str(e),
            "message": f"❌ Database error: {str(e)}"
        }

# Continue with other functions...
def save_chat_history(user_id: str, direction: str, message: Dict[str, Any], sender: str) -> None:
    """Save chat history"""
    try:
        message_type = message.get("type", "text")
        message_text = ""
        
        if message_type == "text":
            message_text = message.get("text", "")
        elif message_type == "image":
            message_text = "ส่งรูปภาพ (สลิป)"
        else:
            message_text = f"ส่งข้อความประเภท {message_type}"
        
        db.execute_query("""
            INSERT INTO chat_history (user_id, direction, message_type, message_text, sender)
            VALUES (%s, %s, %s, %s, %s)
        """, (user_id, direction, message_type, message_text, sender))
        
    except Exception as e:
        # Try SQLite syntax
        try:
            db.execute_query("""
                INSERT INTO chat_history (user_id, direction, message_type, message_text, sender)
                VALUES (?, ?, ?, ?, ?)
            """, (user_id, direction, message_type, message_text, sender))
        except:
            logger.error(f"❌ Error saving chat history: {e}")

def get_chat_history_count() -> int:
    """Get total message count"""
    try:
        result = db.execute_query(
            "SELECT COUNT(*) as count FROM chat_history",
            fetch=True
        )
        return result[0]['count'] if result else 0
    except:
        return 0

def get_recent_chat_history(limit: int = 50) -> List[ChatHistory]:
    """Get recent chat history"""
    try:
        results = db.execute_query("""
            SELECT id, user_id, direction, message_type, 
                   message_text, sender, created_at
            FROM chat_history 
            ORDER BY created_at DESC 
            LIMIT %s
        """, (limit,), fetch=True)
        
        if not results:
            # Try SQLite syntax
            results = db.execute_query("""
                SELECT id, user_id, direction, message_type, 
                       message_text, sender, created_at
                FROM chat_history 
                ORDER BY created_at DESC 
                LIMIT ?
            """, (limit,), fetch=True)
        
        history = []
        for row in (results or []):
            history.append(ChatHistory(
                id=row['id'],
                user_id=row['user_id'],
                direction=row['direction'],
                message_type=row['message_type'],
                message_text=row['message_text'] or "",
                sender=row['sender'],
                created_at=row['created_at'] if isinstance(row['created_at'], datetime) else datetime.now()
            ))
        
        return list(reversed(history))
        
    except Exception as e:
        logger.error(f"❌ Error getting chat history: {e}")
        return []

def get_user_chat_history(user_id: str, limit: int = 10) -> List[Dict[str, str]]:
    """Get user chat history for AI context"""
    try:
        # Try MySQL syntax first
        results = db.execute_query("""
            SELECT direction, message_text 
            FROM chat_history 
            WHERE user_id = %s 
                AND message_type = 'text' 
                AND message_text IS NOT NULL
                AND message_text != ''
            ORDER BY created_at DESC 
            LIMIT %s
        """, (user_id, limit), fetch=True)
        
        if not results:
            # Try SQLite syntax
            results = db.execute_query("""
                SELECT direction, message_text 
                FROM chat_history 
                WHERE user_id = ? 
                    AND message_type = 'text' 
                    AND message_text IS NOT NULL
                    AND message_text != ''
                ORDER BY created_at DESC 
                LIMIT ?
            """, (user_id, limit), fetch=True)
        
        messages = []
        for row in reversed(results or []):
            role = "user" if row['direction'] == "in" else "assistant"
            if row['message_text'] and row['message_text'].strip():
                messages.append({"role": role, "content": row['message_text'].strip()})
        
        return messages
        
    except Exception as e:
        logger.error(f"❌ Error getting user chat history: {e}")
        return []
