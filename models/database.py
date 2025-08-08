# models/database.py
"""
MongoDB-Only Database Module with Motor AsyncIO
Enhanced version with complete data storage capabilities
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

# ==================== Connection Status ====================
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

# ==================== MongoDB Database Manager ====================
class MongoDBManager:
    def __init__(self):
        self.client = None
        self.db = None
        self.connected = False
        # ดึง MONGODB_URI จาก environment variable
        self.mongodb_uri = os.getenv('MONGODB_URI')
        
        if not self.mongodb_uri:
            logger.warning("⚠️ MONGODB_URI environment variable is not set - using local cache mode")
        else:
            # Log URI สำหรับ debug (ซ่อน password)
            uri_parts = self.mongodb_uri.split('@')
            if len(uri_parts) > 1:
                safe_uri = uri_parts[0].split('://')[0] + '://***:***@' + uri_parts[1]
                logger.info(f"📍 MongoDB URI configured: {safe_uri[:50]}...")
            
    async def initialize(self):
        """Initialize MongoDB connection"""
        global CONNECTION_STATUS
        
        if not self.mongodb_uri:
            logger.warning("⚠️ No MongoDB URI - running in cache mode")
            self.connected = False
            return False
        
        try:
            logger.info("🚀 Initializing MongoDB...")
            
            # สร้าง async client พร้อม authentication
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
            
            # Extract database name from URI
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
            
        except OperationFailure as e:
            error_msg = f"MongoDB authentication failed: {str(e)}"
            logger.error(f"❌ {error_msg}")
            logger.error("Please check your MongoDB credentials:")
            logger.error("1. Verify username and password are correct")
            logger.error("2. Make sure user has proper permissions")
            logger.error("3. Check if the database name in URI is correct")
            
            CONNECTION_STATUS.update({
                "type": "MongoDB",
                "connected": False,
                "error": error_msg,
                "last_check": datetime.now().isoformat()
            })
            self.connected = False
            
            # Close client if auth failed
            if self.client:
                self.client.close()
                self.client = None
            
            return False
            
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
            
            # Close client on error
            if self.client:
                self.client.close()
                self.client = None
                
            return False
    
    def _extract_database_name(self, mongodb_uri: str) -> str:
        """Extract database name from MongoDB URI"""
        try:
            # Parse the URI to get database name
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
    
    async def _create_indexes(self):
        """Create necessary indexes"""
        try:
            # Chat history indexes
            await self.db.chat_history.create_index([("user_id", 1)])
            await self.db.chat_history.create_index([("created_at", -1)])
            await self.db.chat_history.create_index([("message_type", 1)])
            await self.db.chat_history.create_index([("sender", 1)])
            
            # Media references indexes
            await self.db.media_references.create_index([("user_id", 1)])
            await self.db.media_references.create_index([("message_id", 1)], unique=True, sparse=True)
            await self.db.media_references.create_index([("media_type", 1)])
            await self.db.media_references.create_index([("created_at", -1)])
            
            # Events indexes
            await self.db.line_events.create_index([("identifier", 1)])
            await self.db.line_events.create_index([("event_type", 1)])
            await self.db.line_events.create_index([("created_at", -1)])
            
            # Raw events indexes
            await self.db.raw_events.create_index([("event_type", 1)])
            await self.db.raw_events.create_index([("timestamp", -1)])
            await self.db.raw_events.create_index([("created_at", -1)])
            
            # URLs indexes
            await self.db.urls.create_index([("user_id", 1)])
            await self.db.urls.create_index([("url", 1)])
            await self.db.urls.create_index([("created_at", -1)])
            
            # Locations indexes
            await self.db.locations.create_index([("user_id", 1)])
            await self.db.locations.create_index([("created_at", -1)])
            await self.db.locations.create_index([("latitude", 1), ("longitude", 1)])
            
            # Slip verifications indexes
            await self.db.slip_verifications.create_index([("user_id", 1)])
            await self.db.slip_verifications.create_index([("status", 1)])
            await self.db.slip_verifications.create_index([("created_at", -1)])
            
            # Config store indexes
            await self.db.config_store.create_index([("config_key", 1)], unique=True)
            
            # Users indexes
            await self.db.users.create_index([("user_id", 1)], unique=True)
            await self.db.users.create_index([("last_seen", -1)])
            await self.db.users.create_index([("message_count", -1)])
            
            logger.info("✅ MongoDB indexes created")
        except Exception as e:
            logger.warning(f"⚠️ Index creation warning: {e}")

    # เพิ่มฟังก์ชันสำหรับดึงข้อมูล user
async def get_user_info(user_id: str) -> Dict[str, Any]:
    """Get user information"""
    if not db_manager.connected:
        await init_database()
    
    try:
        user_doc = await db_manager.db.users.find_one({"user_id": user_id})
        if user_doc:
            user_doc['_id'] = str(user_doc['_id'])
            return user_doc
        return {"user_id": user_id, "display_name": f"User {user_id[:8]}"}
    except Exception as e:
        logger.error(f"Error getting user info: {e}")
        return {"user_id": user_id}
    
    async def save_chat_history(self, user_id: str, direction: str, message: Dict[str, Any], sender: str):
        """Save chat history to MongoDB with complete message data"""
        if not self.connected or not self.db:
            logger.debug("⚠️ MongoDB not connected, skipping save")
            return
            
        try:
            # เตรียมข้อมูลพื้นฐาน
            document = {
                "user_id": user_id,
                "direction": direction,
                "message_type": message.get("type", "unknown"),
                "sender": sender,
                "created_at": datetime.utcnow(),
                "raw_message": message  # เก็บข้อมูลดิบทั้งหมด
            }
            
            # แยกประเภทข้อมูลและจัดเก็บ
            message_type = message.get("type", "unknown")
            
            if message_type == "text":
                document["message_text"] = message.get("text", "")
                # ตรวจหา URLs ในข้อความ
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
                    "duration": message.get("duration"),
                    "contentProvider": message.get("contentProvider", {})
                }
                
            elif message_type == "audio":
                document["message_text"] = "[ไฟล์เสียง]"
                document["audio_data"] = {
                    "id": message.get("id"),
                    "duration": message.get("duration"),
                    "contentProvider": message.get("contentProvider", {})
                }
                
            elif message_type == "file":
                document["message_text"] = f"[ไฟล์: {message.get('fileName', 'unknown')}]"
                document["file_data"] = {
                    "id": message.get("id"),
                    "fileName": message.get("fileName"),
                    "fileSize": message.get("fileSize")
                }
                
            elif message_type == "location":
                document["message_text"] = f"[ตำแหน่ง: {message.get('title', 'Unknown location')}]"
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
                    "stickerId": message.get("stickerId"),
                    "stickerResourceType": message.get("stickerResourceType"),
                    "keywords": message.get("keywords", [])
                }
                
            else:
                document["message_text"] = f"[{message_type}]"
                document["unknown_data"] = message
            
            # เพิ่ม metadata ถ้ามี
            if message.get("timestamp"):
                document["timestamp"] = message.get("timestamp")
            if message.get("source"):
                document["source"] = message.get("source")
            if message.get("webhookEventId"):
                document["webhookEventId"] = message.get("webhookEventId")
            
            # บันทึกลง MongoDB
            result = await self.db.chat_history.insert_one(document)
            
            # อัปเดตข้อมูล user
            await self.db.users.update_one(
                {"user_id": user_id},
                {
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
                },
                upsert=True
            )
            
            # บันทึก media references แยก (สำหรับดึงข้อมูลภายหลัง)
            if message_type in ["image", "video", "audio", "file"] and message.get("id"):
                await self.db.media_references.insert_one({
                    "user_id": user_id,
                    "message_id": message.get("id"),
                    "message_type": message_type,
                    "chat_history_id": result.inserted_id,
                    "created_at": datetime.utcnow(),
                    "downloaded": False,
                    "file_info": {
                        "fileName": message.get("fileName"),
                        "fileSize": message.get("fileSize"),
                        "duration": message.get("duration")
                    }
                })
            
            logger.debug(f"✅ Chat saved to MongoDB: {result.inserted_id} (type: {message_type})")
            
        except Exception as e:
            logger.error(f"❌ Error saving to MongoDB: {e}")
    
    async def save_raw_event(self, event: Dict[str, Any]) -> bool:
        """บันทึก raw event ทั้งหมด"""
        if not self.connected or not self.db:
            return False
            
        try:
            await self.db.raw_events.insert_one({
                "event": event,
                "event_type": event.get("type"),
                "source": event.get("source", {}),
                "timestamp": event.get("timestamp"),
                "webhookEventId": event.get("webhookEventId"),
                "created_at": datetime.utcnow()
            })
            return True
        except Exception as e:
            logger.error(f"Error saving raw event: {e}")
            return False
    
    async def save_event(self, identifier: str, event_type: str, event_data: Dict[str, Any]) -> bool:
        """บันทึก LINE events"""
        if not self.connected or not self.db:
            return False
            
        try:
            await self.db.line_events.insert_one({
                "identifier": identifier,  # user_id หรือ group_id
                "event_type": event_type,
                "event_data": event_data,
                "source": event_data.get("source", {}),
                "timestamp": event_data.get("timestamp"),
                "created_at": datetime.utcnow()
            })
            return True
        except Exception as e:
            logger.error(f"Error saving event: {e}")
            return False
    
    async def save_url(self, user_id: str, url: str) -> bool:
        """บันทึก URL จากข้อความ"""
        if not self.connected or not self.db:
            return False
            
        try:
            # ตรวจสอบว่ามี URL นี้แล้วหรือไม่
            existing = await self.db.urls.find_one({
                "user_id": user_id,
                "url": url
            })
            
            if not existing:
                await self.db.urls.insert_one({
                    "user_id": user_id,
                    "url": url,
                    "domain": urllib.parse.urlparse(url).netloc,
                    "created_at": datetime.utcnow()
                })
            return True
        except Exception as e:
            logger.error(f"Error saving URL: {e}")
            return False
    
    async def save_media_reference(self, user_id: str, message_id: str, media_type: str, message_data: Dict) -> bool:
        """บันทึก media reference"""
        if not self.connected or not self.db:
            return False
            
        try:
            await self.db.media_references.update_one(
                {"message_id": message_id},
                {
                    "$set": {
                        "user_id": user_id,
                        "message_id": message_id,
                        "media_type": media_type,
                        "message_data": message_data,
                        "downloaded": False,
                        "file_info": {
                            "fileName": message_data.get("fileName"),
                            "fileSize": message_data.get("fileSize"),
                            "duration": message_data.get("duration"),
                            "contentProvider": message_data.get("contentProvider", {})
                        },
                        "created_at": datetime.utcnow()
                    }
                },
                upsert=True
            )
            return True
        except Exception as e:
            logger.error(f"Error saving media reference: {e}")
            return False
    
    async def save_location(self, user_id: str, location_data: Dict) -> bool:
        """บันทึกข้อมูลตำแหน่ง"""
        if not self.connected or not self.db:
            return False
            
        try:
            await self.db.locations.insert_one({
                "user_id": user_id,
                "title": location_data.get("title"),
                "address": location_data.get("address"),
                "latitude": location_data.get("latitude"),
                "longitude": location_data.get("longitude"),
                "raw_data": location_data,
                "created_at": datetime.utcnow()
            })
            return True
        except Exception as e:
            logger.error(f"Error saving location: {e}")
            return False
    
    async def save_slip_data(self, user_id: str, slip_result: Dict) -> bool:
        """บันทึกข้อมูลสลิป"""
        if not self.connected or not self.db:
            return False
            
        try:
            await self.db.slip_verifications.insert_one({
                "user_id": user_id,
                "status": slip_result.get("status"),
                "type": slip_result.get("type"),
                "data": slip_result.get("data", {}),
                "message": slip_result.get("message"),
                "verified_by": slip_result.get("data", {}).get("verified_by"),
                "amount": slip_result.get("data", {}).get("amount"),
                "trans_ref": slip_result.get("data", {}).get("transRef"),
                "created_at": datetime.utcnow()
            })
            return True
        except Exception as e:
            logger.error(f"Error saving slip data: {e}")
            return False
    
    async def save_media_content(self, message_id: str, content: bytes, content_type: str) -> bool:
        """บันทึก media content (สำหรับไฟล์เล็ก)"""
        if not self.connected or not self.db:
            return False
            
        try:
            # จำกัดขนาด 16MB (MongoDB limit)
            if len(content) < 16 * 1024 * 1024:
                await self.db.media_content.insert_one({
                    "message_id": message_id,
                    "content_type": content_type,
                    "content_size": len(content),
                    "content": content,  # Binary data
                    "downloaded_at": datetime.utcnow(),
                    "created_at": datetime.utcnow()
                })
                
                # อัปเดตสถานะ downloaded
                await self.db.media_references.update_one(
                    {"message_id": message_id},
                    {"$set": {"downloaded": True, "downloaded_at": datetime.utcnow()}}
                )
                
                return True
            else:
                logger.warning(f"Media too large ({len(content)} bytes), consider using GridFS or S3")
                return False
        except Exception as e:
            logger.error(f"Error saving media content: {e}")
            return False
    
    async def get_chat_history_count(self) -> int:
        """Get total message count"""
        if not self.connected or not self.db:
            return 0
            
        try:
            return await self.db.chat_history.count_documents({})
        except Exception as e:
            logger.error(f"❌ Error counting MongoDB messages: {e}")
            return 0
    
    async def get_user_message_count(self, user_id: str) -> int:
        """Get message count for specific user"""
        if not self.connected or not self.db:
            return 0
            
        try:
            return await self.db.chat_history.count_documents({"user_id": user_id})
        except Exception as e:
            logger.error(f"Error counting user messages: {e}")
            return 0
    
    async def get_recent_chat_history(self, limit: int = 50) -> List[ChatHistory]:
        """Get recent chat history"""
        if not self.connected or not self.db:
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
                    created_at=doc.get("created_at")
                ))
            
            return list(reversed(history))
            
        except Exception as e:
            logger.error(f"❌ Error getting recent chat history: {e}")
            return []
    
    async def get_user_chat_history(self, user_id: str, limit: int = 10) -> List[Dict[str, str]]:
        """Get user chat history for AI context"""
        if not self.connected or not self.db:
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
    
    async def get_config(self, key: str, default=None):
        """Get configuration from MongoDB"""
        # Check environment variable first
        env_value = os.getenv(key.upper())
        if env_value:
            # Convert boolean strings
            if env_value.lower() in ['true', '1', 'yes']:
                return True
            elif env_value.lower() in ['false', '0', 'no']:
                return False
            return env_value
            
        if not self.connected or not self.db:
            return default
            
        try:
            doc = await self.db.config_store.find_one({"config_key": key})
            if doc:
                value = doc.get("config_value")
                value_type = doc.get("value_type", "string")
                
                # Convert to appropriate type
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
        if not self.connected or not self.db:
            return False
            
        try:
            # Determine value type
            value_type = "string"
            if isinstance(value, bool):
                value_type = "boolean"
            elif isinstance(value, int):
                value_type = "integer"
            elif isinstance(value, float):
                value_type = "float"
            elif isinstance(value, (dict, list)):
                value_type = "json"
            
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
            # Try to initialize if not connected
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
            
            # Get collection counts
            counts = {}
            if self.db:
                collections = [
                    'chat_history', 'config_store', 'users', 
                    'media_references', 'line_events', 'raw_events',
                    'urls', 'locations', 'slip_verifications'
                ]
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

    async def get_all_configs(self) -> Dict[str, Any]:
        """Get all configurations from MongoDB"""
        if not self.connected or not self.db:
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

# ==================== Global Database Instance ====================
logger.info("🚀 Starting MongoDB database module...")
db_manager = MongoDBManager()

# ==================== Global event loop for sync operations ====================
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

# ==================== Export Functions ====================
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

async def save_chat_history(user_id: str, direction: str, message: Dict[str, Any], sender: str):
    """Save chat history"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.save_chat_history(user_id, direction, message, sender)

async def get_chat_history_count() -> int:
    """Get total message count"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.get_chat_history_count()

async def get_user_message_count(user_id: str) -> int:
    """Get user message count"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.get_user_message_count(user_id)

async def get_recent_chat_history(limit: int = 50):
    """Get recent chat history"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.get_recent_chat_history(limit)

async def get_user_chat_history(user_id: str, limit: int = 10):
    """Get user chat history"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.get_user_chat_history(user_id, limit)

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

# ==================== New Export Functions ====================
async def save_raw_event(event: Dict[str, Any]) -> bool:
    """Save raw event"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.save_raw_event(event)

async def save_event(identifier: str, event_type: str, event_data: Dict[str, Any]) -> bool:
    """Save LINE event"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.save_event(identifier, event_type, event_data)

async def save_url(user_id: str, url: str) -> bool:
    """Save URL"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.save_url(user_id, url)

async def save_media_reference(user_id: str, message_id: str, media_type: str, message_data: Dict) -> bool:
    """Save media reference"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.save_media_reference(user_id, message_id, media_type, message_data)

async def save_location(user_id: str, location_data: Dict) -> bool:
    """Save location"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.save_location(user_id, location_data)

async def save_slip_data(user_id: str, slip_result: Dict) -> bool:
    """Save slip verification data"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.save_slip_data(user_id, slip_result)

async def save_media_content(message_id: str, content: bytes, content_type: str) -> bool:
    """Save media content"""
    if not db_manager.connected:
        await init_database()
    return await db_manager.save_media_content(message_id, content, content_type)

# ==================== Sync Wrappers for Backward Compatibility ====================
def get_config_sync(key: str, default=None):
    """Sync wrapper for get_config"""
    try:
        # Check environment variable first
        env_value = os.getenv(key.upper())
        if env_value:
            if env_value.lower() in ['true', '1', 'yes']:
                return True
            elif env_value.lower() in ['false', '0', 'no']:
                return False
            return env_value
            
        # Check if we're already in an async context
        try:
            loop = asyncio.get_running_loop()
            # We're in async context, can't use sync version
            logger.warning(f"get_config_sync called from async context for key: {key}")
            return default
        except RuntimeError:
            # Not in async context, safe to proceed
            pass
        
        # Use the dedicated sync loop
        loop = _get_sync_loop()
        future = asyncio.run_coroutine_threadsafe(get_config(key, default), loop)
        return future.result(timeout=5)
    except Exception as e:
        logger.error(f"Error in get_config_sync for {key}: {e}")
        # Try environment variable as fallback
        env_value = os.getenv(key.upper())
        if env_value:
            return env_value
        return default

def set_config_sync(key: str, value: Any, is_sensitive: bool = False) -> bool:
    """Sync wrapper for set_config"""
    try:
        # Check if we're already in an async context
        try:
            loop = asyncio.get_running_loop()
            logger.warning(f"set_config_sync called from async context for key: {key}")
            return False
        except RuntimeError:
            pass
        
        # Use the dedicated sync loop
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

# ==================== Additional Compatibility Functions ====================
def verify_tables() -> Dict[str, bool]:
    """Verify collections exist (always returns True for MongoDB)"""
    return {
        "chat_history": True, 
        "config_store": True, 
        "users": True,
        "media_references": True,
        "line_events": True,
        "raw_events": True,
        "urls": True,
        "locations": True,
        "slip_verifications": True
    }

def get_all_configs():
    """Get all configurations (sync)"""
    try:
        try:
            loop = asyncio.get_running_loop()
            logger.warning("get_all_configs called from async context")
            return {}
        except RuntimeError:
            pass
        
        if not db_manager.connected:
            return {}
            
        loop = _get_sync_loop()
        future = asyncio.run_coroutine_threadsafe(db_manager.get_all_configs(), loop)
        return future.result(timeout=5)
    except Exception as e:
        logger.error(f"Error in get_all_configs: {e}")
        return {}

def update_multiple_configs(configs):
    """Update multiple configurations (sync)"""
    success_count = 0
    for key, value in configs.items():
        if set_config_sync(key, value):
            success_count += 1
    return success_count > 0

# SQLite fallback stubs (for compatibility)
DB_PATH = None  # No SQLite

logger.info("=" * 60)
logger.info("📊 MONGODB DATABASE MODULE LOADED")
logger.info(f"   MongoDB URI: {'Set' if os.getenv('MONGODB_URI') else 'Not Set (Cache Mode)'}")
logger.info("   Collections: chat_history, users, media_references,")
logger.info("                line_events, raw_events, urls, locations,")
logger.info("                slip_verifications, config_store")
logger.info("=" * 60)
