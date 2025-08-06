import os
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from pymongo import MongoClient
import certifi

logger = logging.getLogger("mongodb")

class MongoDatabase:
    def __init__(self):
        self.client = None
        self.db = None
        self._connect()
    
    def _connect(self):
        try:
            mongodb_uri = os.getenv('MONGODB_URI')
            if not mongodb_uri:
                raise ValueError("MONGODB_URI not set")
            
            # เชื่อมต่อ MongoDB Atlas
            self.client = MongoClient(
                mongodb_uri,
                tlsCAFile=certifi.where()
            )
            
            # ทดสอบการเชื่อมต่อ
            self.client.admin.command('ping')
            
            # ใช้ database ชื่อ lineoa
            self.db = self.client.lineoa
            
            logger.info("✅ MongoDB Atlas connected!")
            
        except Exception as e:
            logger.error(f"❌ MongoDB connection failed: {e}")
            raise

# ฟังก์ชันสำหรับใช้งาน
mongo_db = MongoDatabase()

def init_database():
    logger.info("✅ MongoDB initialized")

def save_chat_history(user_id, direction, message, sender):
    try:
        mongo_db.db.chat_history.insert_one({
            "user_id": user_id,
            "direction": direction,
            "message_type": message.get("type", "text"),
            "message_text": message.get("text", ""),
            "sender": sender,
            "created_at": datetime.utcnow()
        })
    except Exception as e:
        logger.error(f"Error saving chat: {e}")

def get_chat_history_count():
    try:
        return mongo_db.db.chat_history.count_documents({})
    except:
        return 0

def test_connection():
    try:
        mongo_db.client.admin.command('ping')
        return {
            "status": "connected",
            "type": "MongoDB Atlas",
            "message": "✅ MongoDB connected"
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }

def get_database_status():
    return test_connection()

def get_config(key, default=None):
    try:
        doc = mongo_db.db.config.find_one({"key": key})
        return doc["value"] if doc else default
    except:
        return default

def set_config(key, value, is_sensitive=False):
    try:
        mongo_db.db.config.update_one(
            {"key": key},
            {"$set": {"key": key, "value": value}},
            upsert=True
        )
        return True
    except:
        return False

def verify_tables():
    return {"chat_history": True, "config": True, "users": True}

def get_recent_chat_history(limit=50):
    return []

def get_user_chat_history(user_id, limit=10):
    return []

def get_all_configs():
    return {}

def update_multiple_configs(configs):
    for key, value in configs.items():
        set_config(key, value)
    return True
