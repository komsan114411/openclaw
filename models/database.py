# models/database.py
import os
import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from dataclasses import dataclass
import time

# Import MySQL connector
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

class DatabaseManager:
    def __init__(self):
        self.pool = None
        self.max_retries = 3
        self.retry_delay = 2
        self._init_connection_pool()
    
    def _get_db_config(self):
        """Get database configuration from environment variables"""
        # Check for DATABASE_URL first (Heroku style)
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
        
        # Use individual environment variables
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
            logger.error("❌ mysql-connector-python not available")
            raise ImportError("mysql-connector-python not installed")
        
        for attempt in range(self.max_retries):
            try:
                db_config = self._get_db_config()
                
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
                    'connect_timeout': 30,
                    'auth_plugin': 'mysql_native_password',
                    'ssl_disabled': True  # Disable SSL for compatibility
                }
                
                logger.info(f"🔄 Attempting MySQL connection to {db_config['host']}:{db_config['port']}/{db_config['database']}")
                
                # Create connection pool
                self.pool = mysql.connector.pooling.MySQLConnectionPool(**pool_config)
                
                # Test connection
                test_conn = self.pool.get_connection()
                cursor = test_conn.cursor()
                cursor.execute("SELECT 1")
                cursor.fetchone()
                cursor.close()
                test_conn.close()
                
                logger.info(f"✅ MySQL pool created successfully - {db_config['host']}/{db_config['database']}")
                break
                
            except Error as e:
                logger.error(f"❌ MySQL connection attempt {attempt + 1}/{self.max_retries} failed: {e}")
                if attempt == self.max_retries - 1:
                    logger.error(f"❌ Failed to connect to MySQL after {self.max_retries} attempts")
                    raise
                time.sleep(self.retry_delay)
    
    def get_connection(self):
        """Get connection from pool with retry logic"""
        for attempt in range(self.max_retries):
            try:
                if not self.pool:
                    self._init_connection_pool()
                
                conn = self.pool.get_connection()
                # Test if connection is alive
                conn.ping(reconnect=True, attempts=3, delay=2)
                return conn
                
            except Error as e:
                logger.warning(f"⚠️ Get connection attempt {attempt + 1} failed: {e}")
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay)
                    if 'pool exhausted' not in str(e).lower():
                        try:
                            self._init_connection_pool()
                        except:
                            pass
                else:
                    raise
    
    def execute_query(self, query: str, params: tuple = None, fetch: bool = False):
        """Execute query with connection management"""
        conn = None
        cursor = None
        
        for attempt in range(self.max_retries):
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
                    
            except Error as e:
                logger.error(f"❌ Query execution attempt {attempt + 1} failed: {e}")
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay)
                else:
                    if conn:
                        conn.rollback()
                    raise
            finally:
                if cursor:
                    cursor.close()
                if conn and conn.is_connected():
                    conn.close()

# Create singleton instance
db = DatabaseManager()

# ====================== Database Initialization ======================

def init_database() -> None:
    """Initialize all database tables"""
    try:
        logger.info("🔄 Initializing database tables...")
        
        # Create tables
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
        
        for i, create_sql in enumerate(tables, 1):
            try:
                db.execute_query(create_sql)
                logger.info(f"✅ Table {i}/{len(tables)} created/verified")
            except Exception as e:
                logger.warning(f"⚠️ Table {i} warning: {e}")
        
        # Initialize default configurations
        _init_default_configs()
        
        logger.info("✅ Database initialization completed")
        
    except Exception as e:
        logger.error(f"❌ Database initialization failed: {e}")
        raise

def _init_default_configs():
    """Insert default configuration values"""
    default_configs = [
        ('ai_enabled', 'true', 'boolean', False, 'Enable AI chat system'),
        ('slip_enabled', 'true', 'boolean', False, 'Enable slip verification'),
        ('thunder_enabled', 'true', 'boolean', False, 'Enable Thunder API'),
        ('kbank_enabled', 'false', 'boolean', False, 'Enable KBank API'),
        ('kbank_sandbox_mode', 'true', 'boolean', False, 'Use KBank sandbox'),
        ('ai_prompt', 'คุณเป็นผู้ช่วยที่เป็นมิตรและให้ความช่วยเหลือ', 'string', False, 'AI system prompt'),
        ('openai_model', 'gpt-3.5-turbo', 'string', False, 'OpenAI model')
    ]
    
    for key, value, value_type, is_sensitive, description in default_configs:
        try:
            db.execute_query("""
                INSERT IGNORE INTO config_store 
                (config_key, config_value, value_type, is_sensitive, description)
                VALUES (%s, %s, %s, %s, %s)
            """, (key, value, value_type, is_sensitive, description))
        except Exception as e:
            logger.warning(f"⚠️ Could not insert default config {key}: {e}")

# ====================== Chat History Functions ======================

def save_chat_history(user_id: str, direction: str, message: Dict[str, Any], sender: str) -> None:
    """Save chat history to database"""
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
        
        # Update user stats
        _update_user_stats(user_id)
        
        logger.info(f"✅ Chat history saved for user {user_id[:10]}...")
        
    except Exception as e:
        logger.error(f"❌ Error saving chat history: {e}")

def _update_user_stats(user_id: str):
    """Update user statistics"""
    try:
        db.execute_query("""
            INSERT INTO users (user_id, message_count)
            VALUES (%s, 1)
            ON DUPLICATE KEY UPDATE
                message_count = message_count + 1,
                last_seen = CURRENT_TIMESTAMP
        """, (user_id,))
    except Exception as e:
        logger.warning(f"⚠️ Could not update user stats: {e}")

def get_user_chat_history(user_id: str, limit: int = 10) -> List[Dict[str, str]]:
    """Get user chat history for AI context"""
    try:
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
        
        messages = []
        for row in reversed(results or []):
            role = "user" if row['direction'] == "in" else "assistant"
            if row['message_text'] and row['message_text'].strip():
                messages.append({"role": role, "content": row['message_text'].strip()})
        
        return messages
        
    except Exception as e:
        logger.error(f"❌ Error getting user chat history: {e}")
        return []

def get_chat_history_count() -> int:
    """Get total message count"""
    try:
        result = db.execute_query(
            "SELECT COUNT(*) as count FROM chat_history",
            fetch=True
        )
        return result[0]['count'] if result else 0
    except Exception as e:
        logger.error(f"❌ Error getting chat count: {e}")
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
        
        history = []
        for row in (results or []):
            history.append(ChatHistory(
                id=row['id'],
                user_id=row['user_id'],
                direction=row['direction'],
                message_type=row['message_type'],
                message_text=row['message_text'] or "",
                sender=row['sender'],
                created_at=row['created_at']
            ))
        
        return list(reversed(history))
        
    except Exception as e:
        logger.error(f"❌ Error getting recent chat history: {e}")
        return []

# ====================== Configuration Functions ======================

def get_config(key: str, default=None):
    """Get configuration value from database"""
    try:
        result = db.execute_query(
            "SELECT config_value, value_type FROM config_store WHERE config_key = %s",
            (key,),
            fetch=True
        )
        
        if result:
            value = result[0]['config_value']
            value_type = result[0].get('value_type', 'string')
            
            if value_type == 'boolean':
                return value.lower() in ['true', '1', 'yes', 'on']
            elif value_type == 'integer':
                return int(value) if value else 0
            elif value_type == 'float':
                return float(value) if value else 0.0
            elif value_type == 'json':
                return json.loads(value) if value else {}
            else:
                return value
        
        return default
        
    except Exception as e:
        logger.error(f"❌ Error getting config {key}: {e}")
        return default

def set_config(key: str, value: Any, is_sensitive: bool = False) -> bool:
    """Set configuration value in database"""
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
        elif isinstance(value, (dict, list)):
            value_type = 'json'
            str_value = json.dumps(value)
        else:
            value_type = 'string'
            str_value = str(value) if value else ''
        
        db.execute_query("""
            INSERT INTO config_store (config_key, config_value, value_type, is_sensitive)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE 
                config_value = VALUES(config_value),
                value_type = VALUES(value_type),
                is_sensitive = VALUES(is_sensitive)
        """, (key, str_value, value_type, is_sensitive))
        
        logger.info(f"✅ Config {key} updated")
        return True
        
    except Exception as e:
        logger.error(f"❌ Error setting config {key}: {e}")
        return False

def get_all_configs() -> Dict[str, Any]:
    """Get all configuration values"""
    try:
        results = db.execute_query(
            "SELECT config_key, config_value, value_type FROM config_store",
            fetch=True
        )
        
        configs = {}
        for row in (results or []):
            key = row['config_key']
            value = row['config_value']
            value_type = row.get('value_type', 'string')
            
            if value_type == 'boolean':
                configs[key] = value.lower() in ['true', '1', 'yes', 'on']
            elif value_type == 'integer':
                configs[key] = int(value) if value else 0
            elif value_type == 'float':
                configs[key] = float(value) if value else 0.0
            elif value_type == 'json':
                configs[key] = json.loads(value) if value else {}
            else:
                configs[key] = value
        
        return configs
        
    except Exception as e:
        logger.error(f"❌ Error getting all configs: {e}")
        return {}

def update_multiple_configs(updates: Dict[str, Any]) -> bool:
    """Update multiple configurations at once"""
    try:
        for key, value in updates.items():
            sensitive_keys = [
                'line_channel_secret', 'line_channel_access_token',
                'thunder_api_token', 'openai_api_key',
                'kbank_consumer_id', 'kbank_consumer_secret'
            ]
            is_sensitive = key in sensitive_keys
            set_config(key, value, is_sensitive)
        
        logger.info(f"✅ Updated {len(updates)} configurations")
        return True
        
    except Exception as e:
        logger.error(f"❌ Error updating multiple configs: {e}")
        return False

# ====================== Status & Testing Functions ======================

def test_connection() -> Dict[str, Any]:
    """Test MySQL connection and return status"""
    try:
        conn = db.get_connection()
        cursor = conn.cursor()
        
        # Test basic query
        cursor.execute("SELECT 1")
        cursor.fetchone()
        
        # Get database info
        cursor.execute("SELECT DATABASE() as db, VERSION() as ver, USER() as usr")
        db_info = cursor.fetchone()
        
        # Get table count
        cursor.execute("""
            SELECT COUNT(*) as cnt FROM information_schema.tables 
            WHERE table_schema = DATABASE()
        """)
        table_count = cursor.fetchone()[0]
        
        # Get record counts
        counts = {}
        tables = ['chat_history', 'config_store', 'api_logs', 'users']
        for table in tables:
            try:
                cursor.execute(f"SELECT COUNT(*) as cnt FROM {table}")
                counts[table] = cursor.fetchone()[0]
            except:
                counts[table] = 0
        
        cursor.close()
        conn.close()
        
        return {
            "status": "connected",
            "database": db_info[0] if db_info else "Unknown",
            "version": db_info[1] if db_info else "Unknown",
            "user": db_info[2] if db_info else "Unknown",
            "host": os.getenv('MYSQL_HOST', 'Unknown'),
            "table_count": table_count,
            "record_counts": counts,
            "message": "✅ MySQL connection successful"
        }
        
    except Exception as e:
        logger.error(f"❌ MySQL connection test failed: {e}")
        return {
            "status": "disconnected",
            "error": str(e),
            "host": os.getenv('MYSQL_HOST', 'Not configured'),
            "database": os.getenv('MYSQL_DATABASE', 'Not configured'),
            "message": f"❌ MySQL connection failed: {str(e)}"
        }

def get_database_status() -> Dict[str, Any]:
    """Get comprehensive database status"""
    try:
        # Test connection first
        conn_status = test_connection()
        
        if conn_status["status"] == "connected":
            try:
                conn = db.get_connection()
                cursor = conn.cursor(dictionary=True)
                
                # Get table sizes
                cursor.execute("""
                    SELECT 
                        table_name,
                        table_rows,
                        ROUND(data_length/1024/1024, 2) as data_size_mb,
                        ROUND(index_length/1024/1024, 2) as index_size_mb
                    FROM information_schema.tables
                    WHERE table_schema = DATABASE()
                    ORDER BY table_rows DESC
                """)
                table_stats = cursor.fetchall()
                
                # Get recent activity
                cursor.execute("""
                    SELECT COUNT(*) as count_24h
                    FROM chat_history
                    WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
                """)
                recent_activity = cursor.fetchone()
                
                cursor.close()
                conn.close()
                
                return {
                    **conn_status,
                    "table_stats": table_stats,
                    "activity_24h": recent_activity['count_24h'] if recent_activity else 0
                }
            except Exception as e:
                logger.error(f"❌ Error getting extended status: {e}")
                return conn_status
        else:
            return conn_status
            
    except Exception as e:
        logger.error(f"❌ Error getting database status: {e}")
        return {
            "status": "error",
            "message": str(e)
        }

def verify_tables() -> Dict[str, bool]:
    """Verify all required tables exist"""
    required_tables = ['chat_history', 'config_store', 'api_logs', 'users']
    table_status = {}
    
    try:
        conn = db.get_connection()
        cursor = conn.cursor()
        
        for table in required_tables:
            cursor.execute(f"""
                SELECT COUNT(*) FROM information_schema.tables 
                WHERE table_schema = DATABASE() 
                AND table_name = %s
            """, (table,))
            exists = cursor.fetchone()[0] > 0
            table_status[table] = exists
            
            if not exists:
                logger.warning(f"⚠️ Table {table} does not exist")
        
        cursor.close()
        conn.close()
        
        return table_status
        
    except Exception as e:
        logger.error(f"❌ Error verifying tables: {e}")
        return {table: False for table in required_tables}

# Export all functions
__all__ = [
    'init_database', 'save_chat_history', 'get_chat_history_count',
    'get_recent_chat_history', 'get_user_chat_history', 'ChatHistory',
    'get_config', 'set_config', 'get_all_configs', 'update_multiple_configs',
    'test_connection', 'get_database_status', 'verify_tables'
]
