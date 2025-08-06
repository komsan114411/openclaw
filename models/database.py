# models/database.py
import os
import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from dataclasses import dataclass
import time
import sqlite3  # เพิ่ม SQLite เป็น fallback

try:
    import mysql.connector
    from mysql.connector import pooling, Error
    MYSQL_AVAILABLE = True
except ImportError:
    MYSQL_AVAILABLE = False
    Error = Exception
    logging.error("❌ mysql-connector-python not installed!")

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

# ==================== SQLite Fallback Database ====================
class SQLiteDatabase:
    """SQLite fallback when MySQL is not accessible"""
    def __init__(self):
        self.db_path = os.path.join(os.path.dirname(__file__), '..', 'storage.db')
        self.init_tables()
    
    def get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn
    
    def execute_query(self, query: str, params: tuple = None, fetch: bool = False):
        conn = self.get_connection()
        cursor = conn.cursor()
        
        # Convert MySQL syntax to SQLite
        query = self._convert_mysql_to_sqlite(query)
        
        try:
            if params:
                # Convert %s to ? for SQLite
                query = query.replace('%s', '?')
                cursor.execute(query, params)
            else:
                cursor.execute(query)
            
            if fetch:
                rows = cursor.fetchall()
                return [dict(row) for row in rows] if rows else []
            else:
                conn.commit()
                return cursor.lastrowid if cursor.lastrowid else True
        finally:
            conn.close()
    
    def _convert_mysql_to_sqlite(self, query: str) -> str:
        """Convert MySQL syntax to SQLite"""
        conversions = {
            'AUTO_INCREMENT': 'AUTOINCREMENT',
            'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci': '',
            'ON UPDATE CURRENT_TIMESTAMP': '',
            'INDEX ': '-- INDEX ',
            'BOOLEAN': 'INTEGER',
            'ON DUPLICATE KEY UPDATE': 'ON CONFLICT DO UPDATE SET',
            'INSERT IGNORE': 'INSERT OR IGNORE'
        }
        
        for mysql_syntax, sqlite_syntax in conversions.items():
            query = query.replace(mysql_syntax, sqlite_syntax)
        
        return query
    
    def init_tables(self):
        """Initialize SQLite tables"""
        tables = [
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
        
        conn = self.get_connection()
        cursor = conn.cursor()
        for table_sql in tables:
            cursor.execute(table_sql)
        conn.commit()
        conn.close()
        logger.info("✅ SQLite tables initialized")

# ==================== Main Database Manager ====================
class DatabaseManager:
    def __init__(self):
        self.pool = None
        self.sqlite_db = None
        self.use_sqlite = False
        self.connection_error = None
        self.max_retries = 3
        self.retry_delay = 2
        
        # Try MySQL first
        if MYSQL_AVAILABLE:
            try:
                self._init_mysql_pool()
                logger.info("✅ Using MySQL database")
            except Exception as e:
                self.connection_error = str(e)
                logger.error(f"❌ MySQL connection failed: {e}")
                self._use_sqlite_fallback()
        else:
            logger.warning("⚠️ MySQL module not available")
            self._use_sqlite_fallback()
    
    def _use_sqlite_fallback(self):
        """Switch to SQLite fallback"""
        logger.info("🔄 Switching to SQLite fallback database")
        self.use_sqlite = True
        self.sqlite_db = SQLiteDatabase()
        logger.info("📦 Using SQLite database (MySQL unavailable)")
    
    def _get_db_config(self):
        """Get MySQL configuration"""
        return {
            'host': os.getenv('MYSQL_HOST', 'srv411.hstgr.io'),
            'port': int(os.getenv('MYSQL_PORT', 3306)),
            'user': os.getenv('MYSQL_USER', 'u807134893_ai'),
            'password': os.getenv('MYSQL_PASSWORD', '1234Zaza'),
            'database': os.getenv('MYSQL_DATABASE', 'u807134893_ai')
        }
    
    def _init_mysql_pool(self):
        """Initialize MySQL connection pool"""
        db_config = self._get_db_config()
        
        if not db_config.get('password'):
            raise ValueError("MySQL password not configured in environment variables")
        
        logger.info(f"🔄 Connecting to MySQL at {db_config['host']}:{db_config['port']}")
        
        # Try different connection configurations
        connection_configs = [
            {
                **db_config,
                'charset': 'utf8mb4',
                'use_unicode': True,
                'autocommit': True,
                'pool_name': 'line_oa_pool',
                'pool_size': 3,
                'pool_reset_session': True,
                'auth_plugin': 'mysql_native_password',
                'ssl_disabled': True
            },
            {
                **db_config,
                'charset': 'utf8mb4',
                'use_unicode': True,
                'autocommit': True,
                'pool_name': 'line_oa_pool',
                'pool_size': 3,
                'auth_plugin': 'caching_sha2_password',
                'ssl_disabled': True
            }
        ]
        
        last_error = None
        for i, config in enumerate(connection_configs, 1):
            try:
                logger.info(f"🔄 Attempt {i}/{len(connection_configs)} with auth_plugin: {config.get('auth_plugin')}")
                
                self.pool = mysql.connector.pooling.MySQLConnectionPool(**config)
                
                # Test connection
                test_conn = self.pool.get_connection()
                cursor = test_conn.cursor()
                cursor.execute("SELECT 1")
                cursor.fetchone()
                cursor.close()
                test_conn.close()
                
                logger.info(f"✅ MySQL connected successfully")
                return
                
            except Error as e:
                last_error = e
                error_code = getattr(e, 'errno', None)
                
                if error_code == 1045:  # Access denied
                    error_msg = f"""
                    ❌ MySQL Access Denied (Error 1045)
                    - User: {db_config['user']}
                    - Host: {db_config['host']}
                    - Your IP might not be whitelisted
                    - Password might be incorrect
                    - User might not have remote access permission
                    """
                    logger.error(error_msg)
                    self.connection_error = "MySQL access denied - IP not whitelisted or wrong credentials"
                elif error_code == 2003:  # Can't connect
                    self.connection_error = f"Cannot connect to MySQL server at {db_config['host']}"
                elif error_code == 1049:  # Unknown database
                    self.connection_error = f"Database '{db_config['database']}' does not exist"
                else:
                    self.connection_error = str(e)
                
                logger.error(f"❌ Connection attempt {i} failed: {e}")
        
        # All attempts failed
        raise Exception(f"Failed to connect to MySQL: {last_error}")
    
    def get_connection(self):
        """Get database connection"""
        if self.use_sqlite:
            return self.sqlite_db.get_connection()
        
        if not self.pool:
            raise Exception(f"No database connection available: {self.connection_error}")
        
        try:
            conn = self.pool.get_connection()
            conn.ping(reconnect=True, attempts=3, delay=2)
            return conn
        except Exception as e:
            logger.error(f"❌ Failed to get MySQL connection: {e}")
            if not self.use_sqlite:
                logger.info("🔄 Switching to SQLite fallback")
                self._use_sqlite_fallback()
                return self.sqlite_db.get_connection()
            raise
    
    def execute_query(self, query: str, params: tuple = None, fetch: bool = False):
        """Execute database query"""
        if self.use_sqlite:
            return self.sqlite_db.execute_query(query, params, fetch)
        
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
                conn.commit()
                return cursor.lastrowid if cursor.lastrowid else True
                
        except Exception as e:
            logger.error(f"❌ Query error: {e}")
            if conn:
                conn.rollback()
            
            # Try SQLite fallback
            if not self.use_sqlite:
                logger.info("🔄 Query failed, switching to SQLite")
                self._use_sqlite_fallback()
                return self.sqlite_db.execute_query(query, params, fetch)
            raise
        finally:
            if cursor:
                cursor.close()
            if conn and hasattr(conn, 'is_connected') and conn.is_connected():
                conn.close()

# Create singleton instance
db = DatabaseManager()

# ====================== Database Functions ======================

def init_database() -> None:
    """Initialize database tables"""
    try:
        logger.info(f"🔄 Initializing database (using {'SQLite' if db.use_sqlite else 'MySQL'})...")
        
        tables = [
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
        
        for create_sql in tables:
            try:
                db.execute_query(create_sql)
            except Exception as e:
                logger.warning(f"⚠️ Table creation warning: {e}")
        
        _init_default_configs()
        logger.info(f"✅ Database initialized ({'SQLite' if db.use_sqlite else 'MySQL'})")
        
    except Exception as e:
        logger.error(f"❌ Database initialization failed: {e}")
        raise

def _init_default_configs():
    """Insert default configuration values"""
    default_configs = [
        ('ai_enabled', 'true', 'boolean', False, 'Enable AI chat'),
        ('slip_enabled', 'true', 'boolean', False, 'Enable slip verification'),
        ('thunder_enabled', 'true', 'boolean', False, 'Enable Thunder API'),
        ('kbank_enabled', 'false', 'boolean', False, 'Enable KBank API'),
        ('ai_prompt', 'คุณเป็นผู้ช่วยที่เป็นมิตร', 'string', False, 'AI prompt'),
    ]
    
    for key, value, value_type, is_sensitive, description in default_configs:
        try:
            if db.use_sqlite:
                db.execute_query("""
                    INSERT OR IGNORE INTO config_store 
                    (config_key, config_value, value_type, is_sensitive, description)
                    VALUES (?, ?, ?, ?, ?)
                """, (key, value, value_type, is_sensitive, description))
            else:
                db.execute_query("""
                    INSERT IGNORE INTO config_store 
                    (config_key, config_value, value_type, is_sensitive, description)
                    VALUES (%s, %s, %s, %s, %s)
                """, (key, value, value_type, is_sensitive, description))
        except Exception as e:
            logger.warning(f"⚠️ Could not insert config {key}: {e}")

def test_connection() -> Dict[str, Any]:
    """Test database connection and return detailed status"""
    try:
        if db.use_sqlite:
            return {
                "status": "connected",
                "type": "SQLite (Fallback)",
                "database": "storage.db",
                "message": "✅ Using SQLite (MySQL unavailable)",
                "mysql_error": db.connection_error,
                "host": "Local file",
                "record_counts": {
                    "chat_history": get_chat_history_count(),
                }
            }
        
        conn = db.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT DATABASE() as db, VERSION() as ver")
        db_info = cursor.fetchone()
        
        cursor.close()
        conn.close()
        
        return {
            "status": "connected",
            "type": "MySQL",
            "database": db_info[0] if db_info else "Unknown",
            "version": db_info[1] if db_info else "Unknown",
            "host": os.getenv('MYSQL_HOST'),
            "message": "✅ MySQL connection successful"
        }
        
    except Exception as e:
        error_msg = str(e)
        if "1045" in error_msg:
            detailed_error = """
            MySQL Access Denied - Possible causes:
            1. Your Heroku IP is not whitelisted in MySQL server
            2. Wrong password or username
            3. User doesn't have remote access permission
            
            Solution: Use SQLite fallback or whitelist Heroku IPs
            """
        else:
            detailed_error = error_msg
        
        return {
            "status": "error",
            "type": "None",
            "error": detailed_error,
            "mysql_config": {
                "host": os.getenv('MYSQL_HOST'),
                "user": os.getenv('MYSQL_USER'),
                "database": os.getenv('MYSQL_DATABASE')
            },
            "message": f"❌ Database error: {detailed_error}"
        }

def get_database_status() -> Dict[str, Any]:
    """Get comprehensive database status with error details"""
    return test_connection()

# Continue with other functions (save_chat_history, get_chat_history_count, etc.)
# ... [rest of the functions remain the same]

def save_chat_history(user_id: str, direction: str, message: Dict[str, Any], sender: str) -> None:
    """Save chat history"""
    try:
        message_type = message.get("type", "text")
        message_text = message.get("text", "") if message_type == "text" else f"[{message_type}]"
        
        if db.use_sqlite:
            db.execute_query("""
                INSERT INTO chat_history (user_id, direction, message_type, message_text, sender)
                VALUES (?, ?, ?, ?, ?)
            """, (user_id, direction, message_type, message_text, sender))
        else:
            db.execute_query("""
                INSERT INTO chat_history (user_id, direction, message_type, message_text, sender)
                VALUES (%s, %s, %s, %s, %s)
            """, (user_id, direction, message_type, message_text, sender))
            
    except Exception as e:
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
        if db.use_sqlite:
            results = db.execute_query("""
                SELECT id, user_id, direction, message_type, 
                       message_text, sender, created_at
                FROM chat_history 
                ORDER BY created_at DESC 
                LIMIT ?
            """, (limit,), fetch=True)
        else:
            results = db.execute_query("""
                SELECT id, user_id, direction, message_type, 
                       message_text, sender, created_at
                FROM chat_history 
                ORDER BY created_at DESC 
                LIMIT %s
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
        if db.use_sqlite:
            results = db.execute_query("""
                SELECT direction, message_text 
                FROM chat_history 
                WHERE user_id = ? 
                    AND message_type = 'text' 
                    AND message_text IS NOT NULL
                ORDER BY created_at DESC 
                LIMIT ?
            """, (user_id, limit), fetch=True)
        else:
            results = db.execute_query("""
                SELECT direction, message_text 
                FROM chat_history 
                WHERE user_id = %s 
                    AND message_type = 'text' 
                    AND message_text IS NOT NULL
                ORDER BY created_at DESC 
                LIMIT %s
            """, (user_id, limit), fetch=True)
        
        messages = []
        for row in reversed(results or []):
            role = "user" if row['direction'] == "in" else "assistant"
            if row['message_text']:
                messages.append({"role": role, "content": row['message_text']})
        
        return messages
        
    except Exception as e:
        logger.error(f"❌ Error getting user chat history: {e}")
        return []

def verify_tables() -> Dict[str, bool]:
    """Verify all required tables exist"""
    required_tables = ['chat_history', 'config_store', 'api_logs', 'users']
    table_status = {}
    
    try:
        for table in required_tables:
            try:
                db.execute_query(f"SELECT 1 FROM {table} LIMIT 1", fetch=True)
                table_status[table] = True
            except:
                table_status[table] = False
        
        return table_status
        
    except Exception as e:
        logger.error(f"❌ Error verifying tables: {e}")
        return {table: False for table in required_tables}

# Config functions
def get_config(key: str, default=None):
    """Get configuration value"""
    try:
        if db.use_sqlite:
            result = db.execute_query(
                "SELECT config_value, value_type FROM config_store WHERE config_key = ?",
                (key,), fetch=True
            )
        else:
            result = db.execute_query(
                "SELECT config_value, value_type FROM config_store WHERE config_key = %s",
                (key,), fetch=True
            )
        
        if result:
            value = result[0]['config_value']
            value_type = result[0].get('value_type', 'string')
            
            if value_type == 'boolean':
                return value.lower() in ['true', '1', 'yes', 'on']
            else:
                return value
        
        return default
        
    except Exception as e:
        logger.error(f"❌ Error getting config {key}: {e}")
        return default

def set_config(key: str, value: Any, is_sensitive: bool = False) -> bool:
    """Set configuration value"""
    try:
        str_value = 'true' if value is True else 'false' if value is False else str(value)
        value_type = 'boolean' if isinstance(value, bool) else 'string'
        
        if db.use_sqlite:
            db.execute_query("""
                INSERT OR REPLACE INTO config_store 
                (config_key, config_value, value_type, is_sensitive)
                VALUES (?, ?, ?, ?)
            """, (key, str_value, value_type, 1 if is_sensitive else 0))
        else:
            db.execute_query("""
                INSERT INTO config_store (config_key, config_value, value_type, is_sensitive)
                VALUES (%s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE 
                    config_value = VALUES(config_value),
                    value_type = VALUES(value_type)
            """, (key, str_value, value_type, is_sensitive))
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Error setting config {key}: {e}")
        return False
