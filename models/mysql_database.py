# models/mysql_database.py
import os
import mysql.connector
from mysql.connector import pooling
import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from dataclasses import dataclass

logger = logging.getLogger("mysql_database")

@dataclass
class ChatHistory:
    id: int
    user_id: str
    direction: str
    message_type: str
    message_text: str
    sender: str
    created_at: datetime

class MySQLDatabase:
    def __init__(self):
        self.pool = None
        self.init_connection_pool()
    
    def init_connection_pool(self):
        """Initialize MySQL connection pool"""
        try:
            # ดึงค่าการเชื่อมต่อจาก environment variables
            db_config = {
                'host': os.getenv('MYSQL_HOST', 'localhost'),
                'port': int(os.getenv('MYSQL_PORT', 3306)),
                'user': os.getenv('MYSQL_USER', 'root'),
                'password': os.getenv('MYSQL_PASSWORD', ''),
                'database': os.getenv('MYSQL_DATABASE', 'line_oa_middleware'),
                'charset': 'utf8mb4',
                'collation': 'utf8mb4_unicode_ci',
                'use_unicode': True,
                'autocommit': True,
                'pool_name': 'line_oa_pool',
                'pool_size': 5,
                'pool_reset_session': True
            }
            
            # สร้าง connection pool
            self.pool = mysql.connector.pooling.MySQLConnectionPool(**db_config)
            logger.info(f"✅ MySQL connection pool created - Host: {db_config['host']}, Database: {db_config['database']}")
            
        except Exception as e:
            logger.error(f"❌ Failed to create MySQL connection pool: {e}")
            raise
    
    def get_connection(self):
        """Get connection from pool"""
        try:
            return self.pool.get_connection()
        except Exception as e:
            logger.error(f"❌ Failed to get connection from pool: {e}")
            # Try to reinitialize pool
            self.init_connection_pool()
            return self.pool.get_connection()
    
    def execute_query(self, query: str, params: tuple = None, fetch: bool = False):
        """Execute a query with automatic connection management"""
        conn = None
        cursor = None
        try:
            conn = self.get_connection()
            cursor = conn.cursor(dictionary=True if fetch else False)
            cursor.execute(query, params)
            
            if fetch:
                return cursor.fetchall()
            else:
                conn.commit()
                return cursor.lastrowid if cursor.lastrowid else True
                
        except Exception as e:
            logger.error(f"❌ Query execution error: {e}")
            if conn:
                conn.rollback()
            raise
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()
    
    def init_tables(self):
        """Initialize database tables"""
        try:
            # สร้างตาราง chat_history
            self.execute_query("""
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
            
            # สร้างตาราง config_store
            self.execute_query("""
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
            
            # สร้างตาราง api_logs (optional)
            self.execute_query("""
                CREATE TABLE IF NOT EXISTS api_logs (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    api_name VARCHAR(50),
                    status VARCHAR(20),
                    error_message TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_api_name (api_name),
                    INDEX idx_created_at (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """)
            
            logger.info("✅ MySQL tables initialized successfully")
            
            # Insert default config values if not exists
            self._init_default_configs()
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize tables: {e}")
            raise
    
    def _init_default_configs(self):
        """Initialize default configuration values"""
        default_configs = [
            ('ai_enabled', 'true', 'boolean', False, 'Enable AI chat system'),
            ('slip_enabled', 'true', 'boolean', False, 'Enable slip verification system'),
            ('thunder_enabled', 'true', 'boolean', False, 'Enable Thunder API'),
            ('kbank_enabled', 'false', 'boolean', False, 'Enable KBank API'),
            ('kbank_sandbox_mode', 'true', 'boolean', False, 'Use KBank sandbox mode'),
            ('ai_prompt', 'คุณเป็นผู้ช่วยที่เป็นมิตรและให้ความช่วยเหลือ', 'string', False, 'AI system prompt'),
        ]
        
        for key, value, value_type, is_sensitive, description in default_configs:
            self.execute_query("""
                INSERT IGNORE INTO config_store 
                (config_key, config_value, value_type, is_sensitive, description)
                VALUES (%s, %s, %s, %s, %s)
            """, (key, value, value_type, is_sensitive, description))
    
    # Config management methods
    def get_config(self, key: str, default=None):
        """Get configuration value from database"""
        try:
            result = self.execute_query(
                "SELECT config_value, value_type FROM config_store WHERE config_key = %s",
                (key,),
                fetch=True
            )
            
            if result:
                value = result[0]['config_value']
                value_type = result[0]['value_type']
                
                # Convert to appropriate type
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
    
    def set_config(self, key: str, value: Any, value_type: str = 'string', is_sensitive: bool = False):
        """Set configuration value in database"""
        try:
            # Convert value to string for storage
            if value_type == 'boolean':
                str_value = 'true' if value else 'false'
            elif value_type == 'json':
                str_value = json.dumps(value)
            else:
                str_value = str(value)
            
            # Upsert config
            self.execute_query("""
                INSERT INTO config_store (config_key, config_value, value_type, is_sensitive)
                VALUES (%s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE 
                    config_value = VALUES(config_value),
                    value_type = VALUES(value_type),
                    is_sensitive = VALUES(is_sensitive),
                    updated_at = CURRENT_TIMESTAMP
            """, (key, str_value, value_type, is_sensitive))
            
            logger.info(f"✅ Config {key} updated")
            return True
            
        except Exception as e:
            logger.error(f"❌ Error setting config {key}: {e}")
            return False
    
    def get_all_configs(self) -> Dict[str, Any]:
        """Get all configurations from database"""
        try:
            results = self.execute_query(
                "SELECT config_key, config_value, value_type FROM config_store",
                fetch=True
            )
            
            configs = {}
            for row in results:
                key = row['config_key']
                value = row['config_value']
                value_type = row['value_type']
                
                # Convert to appropriate type
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
    
    def update_multiple_configs(self, updates: Dict[str, Any]) -> bool:
        """Update multiple configurations at once"""
        try:
            for key, value in updates.items():
                # Determine value type
                if isinstance(value, bool):
                    value_type = 'boolean'
                elif isinstance(value, int):
                    value_type = 'integer'
                elif isinstance(value, float):
                    value_type = 'float'
                elif isinstance(value, (dict, list)):
                    value_type = 'json'
                else:
                    value_type = 'string'
                
                # Check if it's a sensitive key
                sensitive_keys = [
                    'line_channel_secret', 'line_channel_access_token',
                    'thunder_api_token', 'openai_api_key',
                    'kbank_consumer_id', 'kbank_consumer_secret'
                ]
                is_sensitive = key in sensitive_keys
                
                self.set_config(key, value, value_type, is_sensitive)
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Error updating multiple configs: {e}")
            return False
    
    # Chat history methods
    def save_chat_history(self, user_id: str, direction: str, message: Dict[str, Any], sender: str):
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
            
            self.execute_query("""
                INSERT INTO chat_history (user_id, direction, message_type, message_text, sender)
                VALUES (%s, %s, %s, %s, %s)
            """, (user_id, direction, message_type, message_text, sender))
            
            logger.info(f"✅ Chat history saved for user {user_id[:10]}...")
            
        except Exception as e:
            logger.error(f"❌ Error saving chat history: {e}")
    
    def get_chat_history_count(self) -> int:
        """Get total message count"""
        try:
            result = self.execute_query(
                "SELECT COUNT(*) as count FROM chat_history",
                fetch=True
            )
            return result[0]['count'] if result else 0
        except Exception as e:
            logger.error(f"❌ Error getting chat count: {e}")
            return 0
    
    def get_recent_chat_history(self, limit: int = 50) -> List[ChatHistory]:
        """Get recent chat history"""
        try:
            results = self.execute_query("""
                SELECT id, user_id, direction, message_type, message_text, sender, created_at
                FROM chat_history 
                ORDER BY created_at DESC 
                LIMIT %s
            """, (limit,), fetch=True)
            
            history = []
            for row in results:
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
    
    def get_user_chat_history(self, user_id: str, limit: int = 10) -> List[Dict[str, str]]:
        """Get user chat history for AI context"""
        try:
            results = self.execute_query("""
                SELECT direction, message_text 
                FROM chat_history 
                WHERE user_id = %s AND message_type = 'text' AND message_text IS NOT NULL
                ORDER BY created_at DESC 
                LIMIT %s
            """, (user_id, limit), fetch=True)
            
            messages = []
            for row in reversed(results):
                role = "user" if row['direction'] == "in" else "assistant"
                if row['message_text'] and row['message_text'].strip():
                    messages.append({"role": role, "content": row['message_text'].strip()})
            
            return messages
            
        except Exception as e:
            logger.error(f"❌ Error getting user chat history: {e}")
            return []

# Create singleton instance
mysql_db = MySQLDatabase()
