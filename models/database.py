"""
MongoDB Database Connection and Management
"""
import logging
import os
from typing import Optional
from pymongo import MongoClient
from motor.motor_asyncio import AsyncIOMotorClient
import certifi

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
            mongodb_uri = os.getenv('MONGODB_URI')
            if not mongodb_uri:
                raise ValueError("MONGODB_URI environment variable not set")
            
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
            
            # Get database
            db_name = os.getenv('MONGODB_DATABASE', 'lineoa_system')
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

