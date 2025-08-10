# models/database.py
"""
MongoDB Database Module - Multi-Account Support Version
รองรับการจัดการหลายบัญชี LINE OA แยกจากกัน
"""

import os
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from dataclasses import dataclass
import time
import re
from motor.motor_asyncio import AsyncIOMotorClient
import certifi
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError, OperationFailure
import asyncio
import threading
import urllib.parse

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("database")

# Connection Status
CONNECTION_STATUS = {
    "type": "MongoDB",
    "connected": False,
    "last_check": None,
    "error": None,
    "details": {}
}

@dataclass
class ChatHistory:
    id: Optional[str]
    user_id: str
    direction: str
    message_type: str
    message_text: str
    sender: str
    created_at: datetime
    account_id: Optional[str] = None  # เพิ่ม account_id

class MongoDBManager:
    def __init__(self):
        self.client = None
        self.db = None
        self.connected = False
        self.mongodb_uri = os.getenv('MONGODB_URI')
        
        if not self.mongodb_uri:
            logger.warning("⚠️ MONGODB_URI not set - using local cache mode")
    
    def _extract_database_name(self, mongodb_uri: str) -> str:
        """Extract database name from MongoDB URI"""
        try:
            if '/' in mongodb_uri.split('?')[0]:
                path_part = mongodb_uri.split('/')[-1].split('?')[0]
                if path_part and path_part != '':
                    return path_part
            return 'lineoa'
        except:
            return 'lineoa'
    
    def _extract_urls(self, text: str) -> List[str]:
        """Extract URLs from text"""
        url_pattern = r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+'
        urls = re.findall(url_pattern, text)
        return urls
    
    def _extract_message_text(self, message: Dict[str, Any]) -> str:
        """Extract message text based on message type"""
        message_type = message.get("type", "text")
        
        if message_type == "text":
            return message.get("text", "")
        elif message_type == "image":
            return "[รูปภาพ]"
        elif message_type == "video":
            return "[วิดีโอ]"
        elif message_type == "audio":
            return "[ไฟล์เสียง]"
        elif message_type == "file":
            return f"[ไฟล์: {message.get('fileName', 'unknown')}]"
        elif message_type == "location":
            return f"[ตำแหน่ง: {message.get('title', 'Unknown')}]"
        elif message_type == "sticker":
            return "[สติกเกอร์]"
        else:
            return f"[{message_type}]"
    
    async def initialize(self):
        """Initialize MongoDB connection"""
        global CONNECTION_STATUS
        
        if not self.mongodb_uri:
            logger.warning("⚠️ No MongoDB URI - running in cache mode")
            self.connected = False
            return False
        
        try:
            logger.info("🚀 Initializing MongoDB...")
            
            # Create async client
            self.client = AsyncIOMotorClient(
                self.mongodb_uri,
                serverSelectionTimeoutMS=10000,
                connectTimeoutMS=10000,
                socketTimeoutMS=10000,
                maxPoolSize=50,
                minPoolSize=1,
                retryWrites=True,
                tlsCAFile=certifi.where() if 'mongodb+srv' in self.mongodb_uri else None
            )
            
            # Test connection
            start_time = time.time()
            await self.client.admin.command('ping')
            ping_time = (time.time() - start_time) * 1000
            
            # Get server info
            try:
                server_info = await self.client.server_info()
                version = server_info.get('version', 'Unknown')
            except:
                version = 'Unknown'
            
            # Extract database name
            db_name = self._extract_database_name(self.mongodb_uri)
            self.db = self.client[db_name]
            
            # Create indexes
            await self._create_indexes()
            
            self.connected = True
            
            CONNECTION_STATUS.update({
                "type": "MongoDB Atlas" if 'mongodb+srv' in self.mongodb_uri else "MongoDB",
                "connected": True,
                "error": None,
                "last_check": datetime.now().isoformat(),
                "details": {
                    "database": db_name,
                    "version": version,
                    "ping_ms": round(ping_time, 2)
                }
            })
            
            logger.info(f"✅ MongoDB connected - Database: {db_name}, Ping: {ping_time:.2f}ms")
            return True
            
        except Exception as e:
            error_msg = f"MongoDB connection failed: {str(e)}"
            logger.error(f"❌ {error_msg}")
            CONNECTION_STATUS.update({
                "type": "MongoDB",
                "connected": False,
                "error": error_msg,
                "last_check": datetime.now().isoformat()
            })
            self.connected = False
            return False
    
    async def _create_indexes(self):
        """Create necessary indexes"""
        try:
            # Chat history indexes
            await self.db.chat_history.create_index([("user_id", 1)])
            await self.db.chat_history.create_index([("created_at", -1)])
            await self.db.chat_history.create_index([("message_type", 1)])
            await self.db.chat_history.create_index([("sender", 1)])
            await self.db.chat_history.create_index([("account_id", 1)])  # เพิ่ม index สำหรับ account_id
            await self.db.chat_history.create_index([("account_id", 1), ("user_id", 1)])  # Compound index
            await self.db.chat_history.create_index([("account_id", 1), ("created_at", -1)])  # Compound index
            
            # Users indexes
            await self.db.users.create_index([("user_id", 1)], unique=True)
            await self.db.users.create_index([("last_seen", -1)])
            await self.db.users.create_index([("account_ids", 1)])  # Index สำหรับ array ของ account_ids
            
            # Config indexes
            await self.db.config_store.create_index([("config_key", 1)], unique=True)
            
            # LINE Accounts indexes
            await self.db.line_accounts.create_index([("webhook_path", 1)], unique=True)
            await self.db.line_accounts.create_index([("display_name", 1)])
            await self.db.line_accounts.create_index([("created_at", -1)])
            await self.db.line_accounts.create_index([("status", 1)])
            
            logger.info("✅ MongoDB indexes created")
        except Exception as e:
            logger.warning(f"⚠️ Index creation warning: {e}")
    
    async def save_chat_history(self, user_id: str, direction: str, message: Dict[str, Any], sender: str) -> bool:
        """Save chat history to MongoDB - Legacy version (without account_id)"""
        return await self.save_chat_history_with_account(user_id, direction, message, sender, None)
    
    async def save_chat_history_with_account(self, user_id: str, direction: str, message: Dict[str, Any], sender: str, account_id: Optional[str] = None) -> bool:
        """Save chat history to MongoDB with account support"""
        if not self.connected or self.db is None:
            logger.debug("⚠️ MongoDB not connected, skipping save")
            return False
            
        try:
            # Prepare document
            document = {
                "user_id": user_id,
                "direction": direction,  # "in" or "out"
                "message_type": message.get("type", "text"),
                "sender": sender,  # "user", "ai_bot", "slip_bot", "system"
                "created_at": datetime.utcnow(),
                "raw_message": message
            }
            
            # เพิ่ม account_id ถ้ามี
            if account_id:
                document["account_id"] = account_id
            
            # Extract message text based on type
            message_type = message.get("type", "text")
            
            if message_type == "text":
                document["message_text"] = message.get("text", "")
                # Extract URLs if present
                text = message.get("text", "")
                urls = self._extract_urls(text)
                if urls:
                    document["urls"] = urls
            elif message_type == "image":
                document["message_text"] = "[รูปภาพ]"
                document["image_data"] = {
                    "id": message.get("id"),
                    "contentProvider": message.get("contentProvider", {})
                }
            elif message_type == "video":
                document["message_text"] = "[วิดีโอ]"
                document["video_data"] = {
                    "id": message.get("id"),
                    "duration": message.get("duration")
                }
            elif message_type == "audio":
                document["message_text"] = "[ไฟล์เสียง]"
                document["audio_data"] = {
                    "id": message.get("id"),
                    "duration": message.get("duration")
                }
            elif message_type == "file":
                document["message_text"] = f"[ไฟล์: {message.get('fileName', 'unknown')}]"
                document["file_data"] = {
                    "id": message.get("id"),
                    "fileName": message.get("fileName"),
                    "fileSize": message.get("fileSize")
                }
            elif message_type == "location":
                document["message_text"] = f"[ตำแหน่ง: {message.get('title', 'Unknown')}]"
                document["location_data"] = {
                    "title": message.get("title"),
                    "address": message.get("address"),
                    "latitude": message.get("latitude"),
                    "longitude": message.get("longitude")
                }
            elif message_type == "sticker":
                document["message_text"] = "[สติกเกอร์]"
                document["sticker_data"] = {
                    "packageId": message.get("packageId"),
                    "stickerId": message.get("stickerId")
                }
            else:
                document["message_text"] = f"[{message_type}]"
            
            # Save to MongoDB
            result = await self.db.chat_history.insert_one(document)
            
            # Update user info
            user_update = {
                "$set": {
                    "last_seen": datetime.utcnow(),
                    "last_message_type": message_type
                },
                "$inc": {"message_count": 1},
                "$setOnInsert": {
                    "first_seen": datetime.utcnow(),
                    "is_blocked": False,
                    "display_name": f"User {user_id[:8]}"
                }
            }
            
            # เพิ่มการติดตาม account_id
            if account_id:
                user_update["$set"]["last_account_id"] = account_id
                user_update["$addToSet"] = {"account_ids": account_id}
            
            await self.db.users.update_one(
                {"user_id": user_id},
                user_update,
                upsert=True
            )
            
            account_info = f" (Account: {account_id[:8]})" if account_id else ""
            logger.info(f"✅ Chat saved: {result.inserted_id} - {user_id[:10]} - {direction} - {sender}{account_info}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Error saving to MongoDB: {e}")
            return False
    
    async def get_chat_history_count(self, account_id: Optional[str] = None) -> int:
        """Get total message count"""
        if not self.connected or self.db is None:
            return 0
            
        try:
            filter_query = {}
            if account_id:
                filter_query["account_id"] = account_id
            
            count = await self.db.chat_history.count_documents(filter_query)
            return count
        except Exception as e:
            logger.error(f"❌ Error counting messages: {e}")
            return 0
    
    async def get_recent_chat_history(self, limit: int = 50) -> List[ChatHistory]:
        """Get recent chat history"""
        if not self.connected or self.db is None:
            return []
            
        try:
            cursor = self.db.chat_history.find().sort("created_at", -1).limit(limit)
            history = []
            
            async for doc in cursor:
                history.append(ChatHistory(
                    id=str(doc.get("_id")),
                    user_id=doc.get("user_id", ""),
                    direction=doc.get("direction", ""),
                    message_type=doc.get("message_type", "text"),
                    message_text=doc.get("message_text", ""),
                    sender=doc.get("sender", "unknown"),
                    created_at=doc.get("created_at"),
                    account_id=doc.get("account_id")
                ))
            
            # Reverse to get chronological order
            return list(reversed(history))
            
        except Exception as e:
            logger.error(f"❌ Error getting recent chat history: {e}")
            return []
    
    async def get_chat_history_by_account(self, account_id: str, limit: int = 50) -> List[ChatHistory]:
        """Get chat history by account_id"""
        if not self.connected or self.db is None:
            return []
            
        try:
            cursor = self.db.chat_history.find({
                "account_id": account_id
            }).sort("created_at", -1).limit(limit)
            
            history = []
            async for doc in cursor:
                history.append(ChatHistory(
                    id=str(doc.get("_id")),
                    user_id=doc.get("user_id", ""),
                    direction=doc.get("direction", ""),
                    message_type=doc.get("message_type", "text"),
                    message_text=doc.get("message_text", ""),
                    sender=doc.get("sender", "unknown"),
                    created_at=doc.get("created_at"),
                    account_id=doc.get("account_id")
                ))
            
            return list(reversed(history))
            
        except Exception as e:
            logger.error(f"❌ Error getting chat history by account: {e}")
            return []
    
    async def get_user_chat_history(self, user_id: str, limit: int = 10) -> List[Dict[str, str]]:
        """Get user chat history for AI context (legacy version)"""
        if not self.connected or self.db is None:
            return []
            
        try:
            cursor = self.db.chat_history.find({
                "user_id": user_id,
                "message_type": "text",
                "message_text": {"$ne": ""}
            }).sort("created_at", -1).limit(limit)
            
            messages = []
            async for doc in cursor:
                role = "user" if doc.get("direction") == "in" else "assistant"
                content = doc.get("message_text", "")
                if content:
                    messages.append({"role": role, "content": content})
            
            return list(reversed(messages))
            
        except Exception as e:
            logger.error(f"❌ Error getting user chat history: {e}")
            return []
    
    async def get_user_chat_history_by_account(self, user_id: str, account_id: str, limit: int = 10) -> List[Dict[str, str]]:
        """Get user chat history for specific account"""
        if not self.connected or self.db is None:
            return []
            
        try:
            cursor = self.db.chat_history.find({
                "user_id": user_id,
                "account_id": account_id,
                "message_type": "text",
                "message_text": {"$ne": ""}
            }).sort("created_at", -1).limit(limit)
            
            messages = []
            async for doc in cursor:
                role = "user" if doc.get("direction") == "in" else "assistant"
                content = doc.get("message_text", "")
                if content:
                    messages.append({"role": role, "content": content})
            
            return list(reversed(messages))
            
        except Exception as e:
            logger.error(f"❌ Error getting user chat history by account: {e}")
            return []
    
    async def get_users_by_account(self, account_id: str) -> List[Dict]:
        """Get users who interacted with specific account"""
        if not self.connected or self.db is None:
            return []
            
        try:
            cursor = self.db.users.find({
                "account_ids": account_id
            }).sort("last_seen", -1)
            
            users = []
            async for doc in cursor:
                user_data = dict(doc)
                user_data["id"] = str(doc["_id"])
                user_data.pop("_id", None)
                users.append(user_data)
            
            return users
            
        except Exception as e:
            logger.error(f"❌ Error getting users by account: {e}")
            return []
    
    async def get_account_statistics(self, account_id: str) -> Dict[str, Any]:
        """Get statistics for specific account"""
        if not self.connected or self.db is None:
            return {}
            
        try:
            # Total messages
            total_messages = await self.db.chat_history.count_documents({"account_id": account_id})
            
            # Unique users
            pipeline = [
                {"$match": {"account_id": account_id}},
                {"$group": {"_id": "$user_id"}},
                {"$count": "unique_users"}
            ]
            
            result = await self.db.chat_history.aggregate(pipeline).to_list(1)
            unique_users = result[0]["unique_users"] if result else 0
            
            # Messages by type
            type_pipeline = [
                {"$match": {"account_id": account_id}},
                {"$group": {"_id": "$sender", "count": {"$sum": 1}}}
            ]
            
            type_results = await self.db.chat_history.aggregate(type_pipeline).to_list(None)
            message_types = {item["_id"]: item["count"] for item in type_results}
            
            # Recent activity (last 24 hours)
            from datetime import timedelta
            yesterday = datetime.utcnow() - timedelta(days=1)
            recent_messages = await self.db.chat_history.count_documents({
                "account_id": account_id,
                "created_at": {"$gte": yesterday}
            })
            
            return {
                "total_messages": total_messages,
                "unique_users": unique_users,
                "message_types": message_types,
                "recent_messages_24h": recent_messages
            }
            
        except Exception as e:
            logger.error(f"❌ Error getting account statistics: {e}")
            return {}
    
    async def get_config(self, key: str, default=None):
        """Get configuration from MongoDB"""
        # Check environment variable first
        env_value = os.getenv(key.upper())
        if env_value:
            if env_value.lower() in ['true', '1', 'yes']:
                return True
            elif env_value.lower() in ['false', '0', 'no']:
                return False
            return env_value
            
        if not self.connected or self.db is None:
            return default
            
        try:
            doc = await self.db.config_store.find_one({"config_key": key})
            if doc:
                value = doc.get("config_value")
                value_type = doc.get("value_type", "string")
                
                if value_type == "boolean":
                    return value in [True, "true", "True", "1", 1]
                elif value_type == "integer":
                    return int(value) if value is not None else default
                elif value_type == "float":
                    return float(value) if value is not None else default
                return value
            return default
        except Exception as e:
            logger.error(f"❌ Error getting config {key}: {e}")
            return default
    
    async def set_config(self, key: str, value: Any, is_sensitive: bool = False) -> bool:
        """Set configuration in MongoDB"""
        if not self.connected or self.db is None:
            return False
            
        try:
            value_type = "string"
            if isinstance(value, bool):
                value_type = "boolean"
            elif isinstance(value, int):
                value_type = "integer"
            elif isinstance(value, float):
                value_type = "float"
            
            await self.db.config_store.update_one(
                {"config_key": key},
                {
                    "$set": {
                        "config_key": key,
                        "config_value": value,
                        "value_type": value_type,
                        "is_sensitive": is_sensitive,
                        "updated_at": datetime.utcnow()
                    }
                },
                upsert=True
            )
            return True
        except Exception as e:
            logger.error(f"❌ Error setting config {key}: {e}")
            return False
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test MongoDB connection"""
        if not self.client:
            await self.initialize()
            
        if not self.client:
            return {
                "status": "error",
                "type": "MongoDB",
                "error": "Client not initialized",
                "message": "❌ MongoDB client not initialized"
            }
            
        try:
            start_time = time.time()
            await self.client.admin.command('ping')
            ping_time = (time.time() - start_time) * 1000
            
            counts = {}
            if self.db:
                collections = ['chat_history', 'config_store', 'users', 'line_accounts']
                for collection in collections:
                    try:
                        counts[collection] = await self.db[collection].count_documents({})
                    except:
                        counts[collection] = 0
            
            return {
                "status": "connected",
                "type": "MongoDB Atlas" if self.mongodb_uri and 'mongodb+srv' in self.mongodb_uri else "MongoDB",
                "database": self.db.name if self.db else "Unknown",
                "ping_ms": round(ping_time, 2),
                "record_counts": counts,
                "message": f"✅ MongoDB connected (ping: {ping_time:.2f}ms)"
            }
        except Exception as e:
            return {
                "status": "error",
                "type": "MongoDB",
                "error": str(e),
                "message": f"❌ MongoDB error: {str(e)}"
            }
    
    async def get_database_status(self) -> Dict[str, Any]:
        """Get comprehensive database status"""
        status = await self.test_connection()
        status['connection_info'] = CONNECTION_STATUS
        return status

    async def save_raw_event(self, event: Dict[str, Any]):
        """Save raw LINE event for debugging"""
        if not self.connected or self.db is None:
            return False
            
        try:
            event_doc = {
                "event": event,
                "created_at": datetime.utcnow(),
                "account_id": event.get("_account_id")
            }
            
            await self.db.raw_events.insert_one(event_doc)
            return True
        except Exception as e:
            logger.error(f"❌ Error saving raw event: {e}")
            return False

    async def save_media_reference(self, user_id: str, message_id: str, media_type: str, message_data: Dict, account_id: Optional[str] = None):
        """Save media reference for later processing"""
        if not self.connected or self.db is None:
            return False
            
        try:
            media_doc = {
                "user_id": user_id,
                "message_id": message_id,
                "media_type": media_type,
                "message_data": message_data,
                "account_id": account_id,
                "downloaded": False,
                "created_at": datetime.utcnow()
            }
            
            await self.db.media_references.insert_one(media_doc)
            return True
        except Exception as e:
            logger.error(f"❌ Error saving media reference: {e}")
            return False

    async def save_slip_data(self, user_id: str, slip_result: Dict, account_id: Optional[str] = None):
        """Save slip verification result"""
        if not self.connected or self.db is None:
            return False
            
        try:
            slip_doc = {
                "user_id": user_id,
                "account_id": account_id,
                "slip_result": slip_result,
                "verified_at": datetime.utcnow(),
                "status": slip_result.get("status"),
                "amount": slip_result.get("data", {}).get("amount"),
                "reference": slip_result.get("data", {}).get("reference")
            }
            
            await self.db.slip_verifications.insert_one(slip_doc)
            return True
        except Exception as e:
            logger.error(f"❌ Error saving slip data: {e}")
            return False

    async def get_all_configs(self) -> Dict[str, Any]:
        """Get all configurations from MongoDB"""
        if not self.connected or self.db is None:
            return {}
            
        try:
            configs = {}
            cursor = self.db.config_store.find()
            async for doc in cursor:
                configs[doc['config_key']] = doc['config_value']
            return configs
        except Exception as e:
            logger.error(f"Error getting all configs: {e}")
            return {}

# Global Database Instance
logger.info("🚀 Starting MongoDB database module...")
db_manager = MongoDBManager()

# Global event loop for sync operations
_sync_loop = None
_loop_thread = None

def _get_sync_loop():
    """Get or create a dedicated event loop for sync operations"""
    global _sync_loop, _loop_thread
    
    if _sync_loop is None or (_loop_thread and not _loop_thread.is_alive()):
        _sync_loop = asyncio.new_event_loop()
        _loop_thread = threading.Thread(target=_sync_loop.run_forever, daemon=True)
        _loop_thread.start()
    
    return _sync_loop

# Export Functions - Multi-Account Support
async def init_database():
    """Initialize database"""
    success = await db_manager.initialize()
    if success:
        logger.info("✅ MongoDB initialization completed")
    else:
        logger.error("❌ MongoDB initialization failed")
    return success

def get_connection_info():
    """Get detailed connection information"""
    return CONNECTION_STATUS

async def save_chat_history(user_id: str, direction: str, message: Dict[str, Any], sender: str) -> bool:
    """Save chat history - Legacy version (backward compatibility)"""
    if not db_manager.connected:
        init_result = await init_database()
        if not init_result:
            logger.error("❌ Cannot save chat - database not connected")
            return False
    
    result = await db_manager.save_chat_history(user_id, direction, message, sender)
    return result

async def save_chat_history_with_account(user_id: str, direction: str, message: Dict[str, Any], sender: str, account_id: str) -> bool:
    """Save chat history with account context"""
    if not db_manager.connected:
        init_result = await init_database()
        if not init_result:
            logger.error("❌ Cannot save chat - database not connected")
            return False
    
    result = await db_manager.save_chat_history_with_account(user_id, direction, message, sender, account_id)
    return result

async def get_chat_history_count(account_id: Optional[str] = None) -> int:
    """Get total message count"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.get_chat_history_count(account_id)

async def get_recent_chat_history(limit: int = 50):
    """Get recent chat history"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.get_recent_chat_history(limit)

async def get_chat_history_by_account(account_id: str, limit: int = 50):
    """Get chat history by account"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.get_chat_history_by_account(account_id, limit)

async def get_user_chat_history(user_id: str, limit: int = 10):
    """Get user chat history - Legacy version"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.get_user_chat_history(user_id, limit)

async def get_user_chat_history_by_account(user_id: str, account_id: str, limit: int = 10):
    """Get user chat history for specific account"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.get_user_chat_history_by_account(user_id, account_id, limit)

async def get_users_by_account(account_id: str):
    """Get users who interacted with specific account"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.get_users_by_account(account_id)

async def get_account_statistics(account_id: str):
    """Get statistics for specific account"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.get_account_statistics(account_id)

async def test_connection() -> Dict[str, Any]:
    """Test database connection"""
    return await db_manager.test_connection()

async def get_database_status() -> Dict[str, Any]:
    """Get database status"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.get_database_status()

async def get_config(key: str, default=None):
    """Get configuration value"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.get_config(key, default)

async def set_config(key: str, value: Any, is_sensitive: bool = False) -> bool:
    """Set configuration value"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.set_config(key, value, is_sensitive)

async def get_all_configs() -> Dict[str, Any]:
    """Get all configurations"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.get_all_configs()

async def save_raw_event(event: Dict[str, Any]):
    """Save raw event for debugging"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.save_raw_event(event)

async def save_media_reference(user_id: str, message_id: str, media_type: str, message_data: Dict, account_id: Optional[str] = None):
    """Save media reference"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.save_media_reference(user_id, message_id, media_type, message_data, account_id)

async def save_slip_data(user_id: str, slip_result: Dict, account_id: Optional[str] = None):
    """Save slip verification result"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.save_slip_data(user_id, slip_result, account_id)

# Sync Wrappers for backward compatibility
def get_config_sync(key: str, default=None):
    """Sync wrapper for get_config"""
    try:
        env_value = os.getenv(key.upper())
        if env_value:
            if env_value.lower() in ['true', '1', 'yes']:
                return True
            elif env_value.lower() in ['false', '0', 'no']:
                return False
            return env_value
            
        try:
            loop = asyncio.get_running_loop()
            logger.warning(f"get_config_sync called from async context for key: {key}")
            return default
        except RuntimeError:
            pass
        
        loop = _get_sync_loop()
        future = asyncio.run_coroutine_threadsafe(get_config(key, default), loop)
        return future.result(timeout=5)
    except Exception as e:
        logger.error(f"Error in get_config_sync for {key}: {e}")
        return default

def set_config_sync(key: str, value: Any, is_sensitive: bool = False) -> bool:
    """Sync wrapper for set_config"""
    try:
        try:
            loop = asyncio.get_running_loop()
            logger.warning(f"set_config_sync called from async context for key: {key}")
            return False
        except RuntimeError:
            pass
        
        loop = _get_sync_loop()
        future = asyncio.run_coroutine_threadsafe(set_config(key, value, is_sensitive), loop)
        return future.result(timeout=5)
    except Exception as e:
        logger.error(f"Error in set_config_sync for {key}: {e}")
        return False

def get_user_chat_history_sync(user_id: str, limit: int = 10):
    """Sync wrapper for get_user_chat_history"""
    try:
        try:
            loop = asyncio.get_running_loop()
            logger.warning("get_user_chat_history_sync called from async context")
            return []
        except RuntimeError:
            pass
        
        loop = _get_sync_loop()
        future = asyncio.run_coroutine_threadsafe(get_user_chat_history(user_id, limit), loop)
        return future.result(timeout=5)
    except Exception as e:
        logger.error(f"Error in get_user_chat_history_sync: {e}")
        return []

def get_user_chat_history_by_account_sync(user_id: str, account_id: str, limit: int = 10):
    """Sync wrapper for get_user_chat_history_by_account"""
    try:
        try:
            loop = asyncio.get_running_loop()
            logger.warning("get_user_chat_history_by_account_sync called from async context")
            return []
        except RuntimeError:
            pass
        
        loop = _get_sync_loop()
        future = asyncio.run_coroutine_threadsafe(get_user_chat_history_by_account(user_id, account_id, limit), loop)
        return future.result(timeout=5)
    except Exception as e:
        logger.error(f"Error in get_user_chat_history_by_account_sync: {e}")
        return []

logger.info("=" * 60)
logger.info("📊 MONGODB DATABASE MODULE LOADED - MULTI-ACCOUNT SUPPORT")
logger.info(f"   MongoDB URI: {'Set' if os.getenv('MONGODB_URI') else 'Not Set'}")
logger.info("   Features: Multi-Account, Chat History, Media References, Slip Verification")
logger.info("=" * 60)
