import os
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from pymongo import MongoClient
import certifi

logger = logging.getLogger("mongodb")

class MongoDatabase:
    """
    Class to handle MongoDB connection and operations.
    Handles connection to MongoDB Atlas with TLS.
    """
    def __init__(self):
        self.client = None
        self.db = None
        self._connect()
    
    def _connect(self):
        """
        Establishes a connection to the MongoDB database.
        """
        try:
            mongodb_uri = os.getenv('MONGODB_URI')
            if not mongodb_uri:
                raise ValueError("MONGODB_URI not set")
            
            # Connect to MongoDB Atlas with SSL/TLS
            self.client = MongoClient(
                mongodb_uri,
                tlsCAFile=certifi.where()
            )
            
            # Test the connection by running a command
            self.client.admin.command('ping')
            
            # Use the database named 'lineoa'
            self.db = self.client.lineoa
            
            logger.info("✅ MongoDB Atlas connected successfully!")
            
        except Exception as e:
            logger.error(f"❌ MongoDB connection failed: {e}")
            raise

# A global instance of the database handler
mongo_db = MongoDatabase()

def init_database():
    """Placeholder for database initialization."""
    logger.info("✅ MongoDB initialized")

# NOTE: The following functions were placeholders and are now implemented.
async def get_recent_chat_history(limit: int = 100) -> List[Dict[str, Any]]:
    """
    Fetches the most recent chat history from the database.
    This function is now asynchronous to be compatible with FastAPI.
    
    Args:
        limit (int): The maximum number of chat messages to return.
        
    Returns:
        List[Dict[str, Any]]: A list of chat history documents.
    """
    try:
        # Find all chat history, sort by creation date descending, and limit the results
        history = list(mongo_db.db.chat_history.find({}).sort("created_at", -1).limit(limit))
        
        # Log the number of messages fetched
        logger.info(f"✅ Fetched {len(history)} recent chat messages from DB.")
        
        return history
    except Exception as e:
        logger.error(f"❌ Error fetching recent chat history: {e}")
        return []

async def get_user_chat_history(user_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    """
    Fetches the chat history for a specific user.
    This function is now asynchronous.
    
    Args:
        user_id (str): The ID of the user.
        limit (int): The maximum number of chat messages to return.
        
    Returns:
        List[Dict[str, Any]]: A list of chat history documents for the specified user.
    """
    try:
        # Find chat history for a specific user, sort by creation date descending
        history = list(mongo_db.db.chat_history.find({"user_id": user_id}).sort("created_at", 1).limit(limit))
        
        # Log the number of messages fetched
        logger.info(f"✅ Fetched {len(history)} chat messages for user {user_id[:8]} from DB.")
        
        return history
    except Exception as e:
        logger.error(f"❌ Error fetching user chat history for {user_id[:8]}: {e}")
        return []

async def get_user_profile(user_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetches a user's profile from a 'users' collection or derives one.
    
    Args:
        user_id (str): The ID of the user.
    
    Returns:
        Optional[Dict[str, Any]]: A user profile dictionary, or None if not found.
    """
    try:
        # Try to find a user profile from a 'users' collection.
        # If no user collection exists, this will still work by returning None.
        user_profile = mongo_db.db.users.find_one({"user_id": user_id})
        if user_profile:
            return user_profile
            
        # If no dedicated user collection exists, try to get a display name from the latest message
        latest_message = mongo_db.db.chat_history.find_one(
            {"user_id": user_id, "direction": "in"},
            sort=[("created_at", -1)]
        )
        if latest_message and "message_data" in latest_message:
            display_name = latest_message["message_data"].get("source", {}).get("displayName")
            if display_name:
                return {"user_id": user_id, "display_name": display_name, "profile_picture_url": None}

        # Fallback to a generic user profile
        return {"user_id": user_id, "display_name": f"User {user_id[:8]}", "profile_picture_url": None}

    except Exception as e:
        logger.error(f"❌ Error fetching user profile for {user_id[:8]}: {e}")
        return {"user_id": user_id, "display_name": f"User {user_id[:8]}", "profile_picture_url": None}

# The following functions are kept as they were, with minor fixes if needed.
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

async def get_chat_history_count():
    try:
        return await mongo_db.db.chat_history.count_documents({})
    except:
        return 0

async def test_connection():
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

def get_all_configs():
    return {}

def update_multiple_configs(configs):
    for key, value in configs.items():
        set_config(key, value)
    return True
