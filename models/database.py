"""
MongoDB Database Connection and Management
"""
import logging
import os
from typing import Optional
from pymongo import MongoClient
from motor.motor_asyncio import AsyncIOMotorClient
import certifi

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

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
            # อ่าน MONGODB_URI โดยตรงจาก environment variables (สำหรับ Railway)
            mongodb_uri = os.getenv('MONGODB_URI', '').strip()
            
            # ถ้ายังไม่มี ลองใช้จาก settings (สำหรับ local)
            if not mongodb_uri:
                try:
                    from config import settings
                    mongodb_uri = settings.MONGODB_URI
                except Exception as e:
                    logger.warning(f"Cannot import settings: {e}")
            
            # ตรวจสอบว่ามี URI หรือไม่
            if not mongodb_uri:
                raise ValueError("MONGODB_URI is not configured. Please set it in environment variables or .env file")
            
            logger.info(f"Connecting to MongoDB... (URI length: {len(mongodb_uri)})")
            
            # Synchronous client for blocking operations
            self.client = MongoClient(
                mongodb_uri,
                tlsCAFile=certifi.where(),
                serverSelectionTimeoutMS=5000
            )
            
            # Async client for async operations
            self.async_client = AsyncIOMotorClient(
                mongodb_uri,
                tlsCAFile=certifi.where(),
                serverSelectionTimeoutMS=5000
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
            
            logger.info(f"✅ MongoDB connected successfully (database: {db_name})")
            
        except Exception as e:
            logger.error(f"❌ MongoDB connection failed: {e}")
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
            logger.info("✅ Database connections closed")
        except Exception as e:
            logger.error(f"❌ Error closing database connections: {e}")
    
    def test_connection(self) -> dict:
        """Test database connection"""
        try:
            self.client.admin.command('ping')
            return {
                "status": "connected",
                "type": "MongoDB",
                "message": "✅ Database connection is healthy"
            }
        except Exception as e:
            return {
                "status": "error",
                "type": "MongoDB",
                "message": f"❌ Database connection failed: {str(e)}"
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
