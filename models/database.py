# models/database.py
from __future__ import annotations

import os
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
import pymongo

logger = logging.getLogger("database")

# ----------------------------- DB Manager -----------------------------

class DBManager:
    def __init__(self):
        self.client: Optional[AsyncIOMotorClient] = None
        self.db = None
        self.db_name = os.getenv("MONGODB_DBNAME", "lineoa")
        self.is_connected = False  # เพิ่ม flag สำหรับเช็คการเชื่อมต่อ

    async def init(self) -> bool:
        """
        เชื่อมต่อ MongoDB และเตรียม index ที่จำเป็น
        """
        try:
            uri = os.getenv("MONGODB_URI")
            if not uri:
                logger.error("❌ MONGODB_URI not set in environment")
                return False
                
            logger.info(f"🔄 Connecting to MongoDB at {self.db_name}...")
            
            self.client = AsyncIOMotorClient(
                uri, 
                uuidRepresentation="standard", 
                serverSelectionTimeoutMS=8000
            )
            
            # เลือก database
            self.db = self.client[self.db_name]
            
            # ทดสอบการเชื่อมต่อ
            await self.db.command("ping")
            logger.info(f"✅ Connected to MongoDB database: {self.db_name}")
            
            # สร้างดัชนีพื้นฐาน
            try:
                # Chat history indexes
                await self.db.chat_history.create_index([
                    ("user_id", pymongo.ASCENDING), 
                    ("created_at", pymongo.DESCENDING)
                ])
                await self.db.chat_history.create_index([
                    ("account_id", pymongo.ASCENDING), 
                    ("created_at", pymongo.DESCENDING)
                ])
                
                # Line accounts indexes
                await self.db.line_accounts.create_index(
                    "webhook_path", 
                    unique=True, 
                    background=True
                )
                await self.db.line_accounts.create_index(
                    "display_name", 
                    background=True
                )
                
                # Other indexes
                await self.db.raw_events.create_index([
                    ("timestamp", pymongo.DESCENDING)
                ], background=True)
                await self.db.urls.create_index([
                    ("user_id", pymongo.ASCENDING), 
                    ("created_at", pymongo.DESCENDING)
                ], background=True)
                await self.db.media.create_index([
                    ("message_id", pymongo.ASCENDING)
                ], background=True)
                await self.db.app_config.create_index([
                    ("_k", pymongo.ASCENDING)
                ], unique=True, background=True)
                
                logger.info("✅ Database indexes created")
            except Exception as e:
                logger.warning(f"⚠️ Index creation warning: {e}")
            
            self.is_connected = True
            return True
            
        except Exception as e:
            logger.error(f"❌ MongoDB connection failed: {e}")
            self.is_connected = False
            return False

    def info(self) -> Dict[str, Any]:
        return {
            "connected": self.is_connected,
            "db_name": self.db_name,
            "uri_from_env": bool(os.getenv("MONGODB_URI")),
            "client_active": self.client is not None,
            "db_active": self.db is not None
        }

    async def check_connection(self) -> bool:
        """Check if database is still connected"""
        if self.db is None:
            return False
        try:
            await self.db.command("ping")
            self.is_connected = True
            return True
        except Exception:
            self.is_connected = False
            return False

# Create global instance
db_manager = DBManager()

# ----------------------------- Data Models -----------------------------

@dataclass
class ChatRecord:
    id: Optional[ObjectId]
    user_id: Optional[str]
    direction: Optional[str]
    message_type: Optional[str]
    message_text: Optional[str]
    sender: Optional[str]
    created_at: Optional[datetime]
    account_id: Optional[str]

    @staticmethod
    def from_doc(doc: Dict[str, Any]) -> "ChatRecord":
        if not doc:
            return ChatRecord(None, None, None, None, None, None, None, None)
        return ChatRecord(
            id=doc.get("_id"),
            user_id=doc.get("user_id"),
            direction=doc.get("direction"),
            message_type=doc.get("message_type"),
            message_text=doc.get("message_text"),
            sender=doc.get("sender"),
            created_at=doc.get("created_at"),
            account_id=doc.get("account_id"),
        )

# ----------------------------- Init / Status -----------------------------

async def init_database() -> bool:
    """Initialize database connection"""
    try:
        result = await db_manager.init()
        return result
    except Exception as e:
        logger.error(f"❌ Database init failed: {e}")
        return False

async def test_connection() -> Dict[str, Any]:
    """Test database connection"""
    try:
        if db_manager.db is None:
            return {
                "status": "error", 
                "message": "Database not initialized",
                "type": "MongoDB"
            }
            
        await db_manager.db.command("ping")
        return {
            "status": "connected", 
            "message": "MongoDB connected", 
            "type": "MongoDB",
            "database": db_manager.db_name
        }
    except Exception as e:
        return {
            "status": "error", 
            "message": f"Connection failed: {str(e)}",
            "type": "MongoDB"
        }

def get_connection_info() -> Dict[str, Any]:
    """Get connection information"""
    return db_manager.info()

async def get_database_status() -> Dict[str, Any]:
    """Get comprehensive database status"""
    try:
        if db_manager.db is None:
            return {
                "status": "error", 
                "message": "Database not initialized"
            }
            
        stats = await db_manager.db.command("dbstats")
        return {
            "status": "connected", 
            "db": db_manager.db_name, 
            "collections": stats.get("collections", 0),
            "dataSize": stats.get("dataSize", 0),
            "storageSize": stats.get("storageSize", 0)
        }
    except Exception as e:
        return {
            "status": "error", 
            "message": str(e)
        }

# ----------------------------- Helpers -----------------------------

def _extract_type_and_text(message: Dict[str, Any]) -> tuple[str, str]:
    """ดึงชนิดและข้อความจาก message object"""
    if not isinstance(message, dict):
        return "text", str(message)
    
    mtype = message.get("type", "text")
    mtext = message.get("text", "")
    
    if not mtext:
        # Try to get text from other fields
        if mtype == "image":
            mtext = "[Image]"
        elif mtype == "sticker":
            mtext = "[Sticker]"
        elif mtype == "file":
            mtext = f"[File: {message.get('fileName', 'Unknown')}]"
        else:
            mtext = f"[{mtype}]"
    
    return mtype, mtext

def _wrap_docs(docs: List[Dict[str, Any]]) -> List[ChatRecord]:
    """Convert MongoDB documents to ChatRecord objects"""
    return [ChatRecord.from_doc(d) for d in docs]

# ----------------------------- Chat History -----------------------------

async def save_chat_history(user_id: str, direction: str, message: Dict[str, Any], sender: str) -> bool:
    """Save chat history"""
    try:
        if db_manager.db is None:
            logger.error("❌ Database not initialized")
            return False
            
        mtype, mtext = _extract_type_and_text(message)
        doc = {
            "user_id": user_id,
            "direction": direction,  # "in" / "out"
            "message_type": mtype,
            "message_text": mtext,
            "message": message,
            "sender": sender,
            "created_at": datetime.utcnow(),
            "account_id": None,
        }
        await db_manager.db.chat_history.insert_one(doc)
        logger.debug(f"✅ Saved chat from {user_id[:10]}...")
        return True
    except Exception as e:
        logger.error(f"❌ Error saving chat: {e}")
        return False

async def save_chat_history_with_account(
    user_id: str, 
    direction: str, 
    message: Dict[str, Any], 
    sender: str, 
    account_id: Optional[str]
) -> bool:
    """Save chat history with account ID"""
    try:
        if db_manager.db is None:
            logger.error("❌ Database not initialized")
            return False
            
        mtype, mtext = _extract_type_and_text(message)
        doc = {
            "user_id": user_id,
            "direction": direction,
            "message_type": mtype,
            "message_text": mtext,
            "message": message,
            "sender": sender,
            "created_at": datetime.utcnow(),
            "account_id": account_id,
        }
        await db_manager.db.chat_history.insert_one(doc)
        logger.debug(f"✅ Saved chat from {user_id[:10]}... (Account: {account_id})")
        return True
    except Exception as e:
        logger.error(f"❌ Error saving chat with account: {e}")
        return False

async def get_chat_history_count() -> int:
    """Get total chat history count"""
    try:
        if db_manager.db is None:
            return 0
        return await db_manager.db.chat_history.estimated_document_count()
    except Exception as e:
        logger.error(f"❌ Error getting chat count: {e}")
        return 0

async def get_recent_chat_history(limit: int = 50) -> List[ChatRecord]:
    """Get recent chat history"""
    try:
        if db_manager.db is None:
            return []
            
        cursor = db_manager.db.chat_history.find({}).sort("created_at", -1).limit(int(limit))
        docs = []
        async for doc in cursor:
            docs.append(doc)
        return _wrap_docs(docs)
    except Exception as e:
        logger.error(f"❌ Error getting recent chat: {e}")
        return []

async def get_user_chat_history(user_id: str, limit: int = 100) -> List[ChatRecord]:
    """Get user's chat history"""
    try:
        if db_manager.db is None:
            return []
            
        cursor = db_manager.db.chat_history.find(
            {"user_id": user_id}
        ).sort("created_at", -1).limit(int(limit))
        
        docs = []
        async for doc in cursor:
            docs.append(doc)
        return _wrap_docs(docs)
    except Exception as e:
        logger.error(f"❌ Error getting user chat: {e}")
        return []

def get_user_chat_history_sync(user_id: str, limit: int = 100) -> List[ChatRecord]:
    """
    Sync version of get_user_chat_history (for backward compatibility)
    """
    # This won't work properly without an event loop
    logger.warning("⚠️ Sync version called - returning empty list")
    return []

# ----------------------------- Events / Raw -----------------------------

async def save_raw_event(event: Dict[str, Any]) -> None:
    """Save raw LINE event"""
    try:
        if db_manager.db is None:
            return
        await db_manager.db.raw_events.insert_one({
            "event": event, 
            "timestamp": datetime.utcnow()
        })
    except Exception as e:
        logger.error(f"❌ Error saving raw event: {e}")

async def save_event(owner_id: str, event_type: str, event: Dict[str, Any]) -> None:
    """Save typed event"""
    try:
        if db_manager.db is None:
            return
        await db_manager.db.events.insert_one({
            "owner_id": owner_id, 
            "type": event_type, 
            "event": event, 
            "created_at": datetime.utcnow()
        })
    except Exception as e:
        logger.error(f"❌ Error saving event: {e}")

# ----------------------------- Extra Saves -----------------------------

async def save_media_reference(
    user_id: str, 
    message_id: str, 
    media_type: str, 
    message_data: Dict[str, Any]
) -> None:
    """Save media reference"""
    try:
        if db_manager.db is None:
            return
        await db_manager.db.media.insert_one({
            "user_id": user_id,
            "message_id": message_id,
            "media_type": media_type,
            "data": message_data,
            "created_at": datetime.utcnow(),
        })
    except Exception as e:
        logger.error(f"❌ Error saving media reference: {e}")

async def save_media_content(message_id: str, content: bytes, media_type: str) -> None:
    """Save media content"""
    try:
        if db_manager.db is None:
            return
        await db_manager.db.media.update_one(
            {"message_id": message_id},
            {"$set": {
                "binary": content, 
                "media_type": media_type, 
                "updated_at": datetime.utcnow()
            }},
            upsert=True,
        )
    except Exception as e:
        logger.error(f"❌ Error saving media content: {e}")

async def save_location(user_id: str, location_message: Dict[str, Any]) -> None:
    """Save location data"""
    try:
        if db_manager.db is None:
            return
        await db_manager.db.locations.insert_one({
            "user_id": user_id, 
            "location": location_message, 
            "created_at": datetime.utcnow()
        })
    except Exception as e:
        logger.error(f"❌ Error saving location: {e}")

async def save_url(user_id: str, url: str) -> None:
    """Save URL"""
    try:
        if db_manager.db is None:
            return
        await db_manager.db.urls.insert_one({
            "user_id": user_id, 
            "url": url, 
            "created_at": datetime.utcnow()
        })
    except Exception as e:
        logger.error(f"❌ Error saving URL: {e}")

# ----------------------------- Config Store -----------------------------

async def get_config(key: str, default: Any = None) -> Any:
    """Get configuration value"""
    try:
        if db_manager.db is None:
            return default
        doc = await db_manager.db.app_config.find_one({"_k": key})
        if not doc:
            return default
        return doc.get("value", default)
    except Exception as e:
        logger.error(f"❌ Error getting config {key}: {e}")
        return default

async def set_config(key: str, value: Any, is_sensitive: bool = False) -> bool:
    """Set configuration value"""
    try:
        if db_manager.db is None:
            return False
        res = await db_manager.db.app_config.update_one(
            {"_k": key},
            {"$set": {
                "_k": key, 
                "value": value, 
                "is_sensitive": bool(is_sensitive), 
                "updated_at": datetime.utcnow()
            }},
            upsert=True,
        )
        return res.matched_count > 0 or res.upserted_id is not None
    except Exception as e:
        logger.error(f"❌ Error setting config {key}: {e}")
        return False

# ----------------------------- System Messages -----------------------------

def _clean_msg(v: Any, default: str = "") -> str:
    """Clean message value"""
    if v is None:
        return default
    s = str(v).strip()
    return "" if s.lower() in {"undefined", "null", "none"} else s

async def get_system_messages(account_id: Optional[str] = None) -> Dict[str, str]:
    """Get system messages with defaults"""
    defaults = {
        "ai_disabled": "ขออภัย ระบบ AI ถูกปิดการใช้งานชั่วคราว",
        "slip_disabled": "ขออภัย ระบบตรวจสอบสลิปถูกปิดการใช้งานชั่วคราว",
        "system_disabled": "ขออภัย ระบบกำลังปิดปรับปรุง กรุณาติดต่อใหม่ภายหลัง",
    }
    
    try:
        if db_manager.db is None:
            return defaults
            
        if account_id:
            # Get from line_accounts collection
            doc = await db_manager.db.line_accounts.find_one({"_id": ObjectId(account_id)})
            if not doc:
                return defaults

            def pick(*keys):
                for k in keys:
                    v = doc.get(k)
                    if isinstance(v, str) and v.strip():
                        cleaned = v.strip()
                        if cleaned.lower() not in {"undefined", "null", "none"}:
                            return cleaned
                return None

            return {
                "ai_disabled": pick("ai_disabled", "ai_disabled_message") or defaults["ai_disabled"],
                "slip_disabled": pick("slip_disabled", "slip_disabled_message") or defaults["slip_disabled"],
                "system_disabled": pick("system_disabled", "system_disabled_message") or defaults["system_disabled"],
            }
        else:
            # Get from global config
            conf = await db_manager.db.app_config.find_one({"_k": "system_messages"}) or {}
            value = conf.get("value", {}) if conf else {}
            return {
                "ai_disabled": value.get("ai_disabled") or value.get("ai_disabled_message") or defaults["ai_disabled"],
                "slip_disabled": value.get("slip_disabled") or value.get("slip_disabled_message") or defaults["slip_disabled"],
                "system_disabled": value.get("system_disabled") or value.get("system_disabled_message") or defaults["system_disabled"],
            }
    except Exception as e:
        logger.error(f"❌ Error getting system messages: {e}")
        return defaults

async def set_system_messages(messages: Dict[str, str], account_id: Optional[str] = None) -> bool:
    """Set system messages"""
    try:
        if db_manager.db is None:
            return False
            
        docset = {
            "ai_disabled_message": _clean_msg(messages.get("ai_disabled"), "ขออภัย ระบบ AI ถูกปิดการใช้งานชั่วคราว"),
            "slip_disabled_message": _clean_msg(messages.get("slip_disabled"), "ขออภัย ระบบตรวจสอบสลิปถูกปิดการใช้งานชั่วคราว"),
            "system_disabled_message": _clean_msg(messages.get("system_disabled"), "ขออภัย ระบบกำลังปิดปรับปรุง กรุณาติดต่อใหม่ภายหลัง"),
            "updated_at": datetime.utcnow(),
        }

        if account_id:
            res = await db_manager.db.line_accounts.update_one(
                {"_id": ObjectId(account_id)}, 
                {"$set": docset}
            )
            return res.modified_count > 0
        else:
            res = await db_manager.db.app_config.update_one(
                {"_k": "system_messages"},
                {"$set": {"value": docset, "updated_at": datetime.utcnow()}},
                upsert=True,
            )
            return res.matched_count > 0 or res.upserted_id is not None
    except Exception as e:
        logger.error(f"❌ Error setting system messages: {e}")
        return False

# ----------------------------- Stats / Reports -----------------------------

# เพิ่มใน models/database.py

async def get_account_statistics(account_id: str) -> Dict[str, Any]:
    """Get comprehensive statistics for an account"""
    try:
        if db_manager.db is None:
            return {
                "total_messages": 0,
                "inbound_messages": 0,
                "outbound_messages": 0,
                "unique_users": 0,
                "last_activity": None
            }
            
        # นับจำนวนข้อความแยกตาม direction
        pipeline = [
            {"$match": {"account_id": account_id}},
            {
                "$group": {
                    "_id": "$direction",
                    "count": {"$sum": 1},
                    "last": {"$max": "$created_at"}
                }
            }
        ]
        
        agg_results = []
        async for doc in db_manager.db.chat_history.aggregate(pipeline):
            agg_results.append(doc)
        
        inbound = next((d["count"] for d in agg_results if d["_id"] == "in"), 0)
        outbound = next((d["count"] for d in agg_results if d["_id"] == "out"), 0)
        last_activity = max((d.get("last") for d in agg_results if d.get("last")), default=None)
        
        # นับ unique users
        unique_users_pipeline = [
            {"$match": {"account_id": account_id}},
            {"$group": {"_id": "$user_id"}},
            {"$count": "total"}
        ]
        
        unique_result = await db_manager.db.chat_history.aggregate(unique_users_pipeline).to_list(1)
        unique_users_count = unique_result[0]["total"] if unique_result else 0
        
        return {
            "total_messages": inbound + outbound,
            "inbound_messages": inbound,
            "outbound_messages": outbound,
            "unique_users": unique_users_count,
            "last_activity": last_activity.isoformat() if last_activity else None
        }
    except Exception as e:
        logger.error(f"❌ Error getting account statistics: {e}")
        return {
            "total_messages": 0,
            "inbound_messages": 0,
            "outbound_messages": 0,
            "unique_users": 0,
            "last_activity": None
        }

async def get_account_users(account_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    """Get list of users for a specific account"""
    try:
        if db_manager.db is None:
            return []
            
        pipeline = [
            {"$match": {"account_id": account_id}},
            {
                "$group": {
                    "_id": "$user_id",
                    "message_count": {"$sum": 1},
                    "last_message": {"$max": "$created_at"},
                    "first_message": {"$min": "$created_at"}
                }
            },
            {"$sort": {"last_message": -1}},
            {"$limit": limit}
        ]
        
        users = []
        async for doc in db_manager.db.chat_history.aggregate(pipeline):
            users.append({
                "user_id": doc["_id"],
                "message_count": doc["message_count"],
                "last_message": doc["last_message"].isoformat() if doc["last_message"] else None,
                "first_message": doc["first_message"].isoformat() if doc["first_message"] else None
            })
        
        return users
    except Exception as e:
        logger.error(f"❌ Error getting account users: {e}")
        return []
# ----------------------------- User Management -----------------------------

async def get_user_info(user_id: str) -> Dict[str, Any]:
    """Get user information"""
    try:
        if db_manager.db is None:
            return {}
        doc = await db_manager.db.users.find_one({"user_id": user_id})
        if doc:
            doc["_id"] = str(doc["_id"])
            return doc
        return {"user_id": user_id}
    except Exception as e:
        logger.error(f"❌ Error getting user info: {e}")
        return {}

async def get_all_configs() -> Dict[str, Any]:
    """Get all configurations"""
    try:
        if db_manager.db is None:
            return {}
        configs = {}
        async for doc in db_manager.db.app_config.find():
            configs[doc["_k"]] = doc.get("value")
        return configs
    except Exception as e:
        logger.error(f"❌ Error getting all configs: {e}")
        return {}

# Initialize logger
logger.info("=" * 60)
logger.info("📊 DATABASE MODULE LOADED")
logger.info(f"   MongoDB URI: {'Set' if os.getenv('MONGODB_URI') else 'Not Set'}")
logger.info(f"   Database Name: {db_manager.db_name}")
logger.info("=" * 60)
