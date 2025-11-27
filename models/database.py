"""
MongoDB Database Connection and Management
"""
import logging
import os
from typing import Optional
from pymongo import MongoClient
from motor.motor_asyncio import AsyncIOMotorClient
import certifi
from pathlib import Path

# Load environment variables - ลองหลายที่
from dotenv import load_dotenv, find_dotenv

# หา .env file อัตโนมัติ
env_file = find_dotenv()
if env_file:
    load_dotenv(env_file)
    print(f"[OK] Loaded .env from: {env_file}")
else:
    # ลองหาเองในหลายๆ ที่
    possible_paths = [
        Path.cwd() / '.env',
        Path(__file__).parent.parent / '.env',
        Path('/app/.env'),
        Path('/home/claude/.env'),
    ]
    
    for path in possible_paths:
        if path.exists():
            load_dotenv(path)
            print(f"[OK] Loaded .env from: {path}")
            break
    else:
        print("[WARN] No .env file found")

logger = logging.getLogger("database")

class Database:
    """MongoDB Database Manager"""
    
    def __init__(self):
        self.client: Optional[MongoClient] = None
        self.async_client: Optional[AsyncIOMotorClient] = None
        self.db = None
        self.async_db = None
        self._connect()
    
    def _connect(self):
        """Connect to MongoDB"""
        try:
            # อ่าน MONGODB_URI โดยตรงจาก environment variables
            mongodb_uri = os.getenv('MONGODB_URI', '').strip()
            
            # Debug: แสดงว่ามี URI หรือไม่
            print(f"[DEBUG] MongoDB URI check: {'Found' if mongodb_uri else 'NOT FOUND'}")
            print(f"[DEBUG] URI length: {len(mongodb_uri) if mongodb_uri else 0}")
            
            # ถ้ายังไม่มี ลองใช้จาก settings (สำหรับ local)
            if not mongodb_uri:
                try:
                    from config import settings
                    mongodb_uri = settings.MONGODB_URI
                    print(f"[DEBUG] Loaded URI from settings module")
                except Exception as e:
                    print(f"[WARN] Cannot import settings: {e}")
            
            # ตรวจสอบว่ามี URI หรือไม่
            if not mongodb_uri:
                raise ValueError("MONGODB_URI is not configured. Please set it in environment variables or .env file")
            
            logger.info(f"Connecting to MongoDB... (URI length: {len(mongodb_uri)})")
            
            # Synchronous client for blocking operations
            self.client = MongoClient(
                mongodb_uri,
                tlsCAFile=certifi.where(),
                serverSelectionTimeoutMS=5000,
                maxPoolSize=50,              # Limit connection pool size
                minPoolSize=10,              # Maintain minimum connections
                retryWrites=True,            # Auto-retry failed writes
                retryReads=True,             # Auto-retry failed reads
                connectTimeoutMS=10000,      # Connection timeout
                socketTimeoutMS=30000        # Socket operation timeout
            )
            
            # Async client for async operations
            self.async_client = AsyncIOMotorClient(
                mongodb_uri,
                tlsCAFile=certifi.where(),
                serverSelectionTimeoutMS=5000,
                maxPoolSize=50,
                minPoolSize=10,
                retryWrites=True,
                retryReads=True,
                connectTimeoutMS=10000,
                socketTimeoutMS=30000
            )
            
            # Test connection
            self.client.admin.command('ping')
            
            # Get database name
            db_name = os.getenv('MONGODB_DATABASE', 'lineoa_system')
            if not db_name:
                try:
                    from config import settings
                    db_name = settings.MONGODB_DATABASE
                except:
                    db_name = 'lineoa_system'
            
            # Get database instances
            self.db = self.client[db_name]
            self.async_db = self.async_client[db_name]
            
            logger.info(f"[OK] MongoDB connected successfully (database: {db_name})")
            print(f"[OK] MongoDB connected successfully (database: {db_name})")
            
        except Exception as e:
            logger.error(f"[ERROR] MongoDB connection failed: {e}")
            print(f"[ERROR] MongoDB connection failed: {e}")
            raise
    
    def get_db(self):
        """Get synchronous database instance"""
        return self.db
    
    def get_async_db(self):
        """Get asynchronous database instance"""
        return self.async_db
    
    def close(self):
        """Close database connections"""
        try:
            if self.client:
                self.client.close()
            if self.async_client:
                self.async_client.close()

        except Exception as e:
            logger.error(f"[ERROR] Error closing database connections: {e}")
    
    def test_connection(self) -> dict:
        """Test database connection"""
        try:
            self.client.admin.command('ping')
            return {
                "status": "connected",
                "type": "MongoDB",
                "message": "[OK] Database connection is healthy"
            }
        except Exception as e:
            return {
                "status": "error",
                "type": "MongoDB",
                "message": f"[ERROR] Database connection failed: {str(e)}"
            }

# Global database instance
_database_instance: Optional[Database] = None

def get_database() -> Database:
    """Get or create database instance"""
    global _database_instance
    if _database_instance is None:
        _database_instance = Database()
    return _database_instance

def init_database():
    """Initialize database connection"""
    return get_database()
