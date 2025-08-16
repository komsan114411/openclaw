# models/database.py
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
import pymongo


# ----------------------------- DB Manager -----------------------------


class DBManager:
    def __init__(self):
        self.client: Optional[AsyncIOMotorClient] = None
        self.db = None
        self.db_name = os.getenv("MONGODB_DBNAME", "line_oa_middleware")

    async def init(self) -> bool:
        """
        เชื่อมต่อ MongoDB และเตรียม index ที่จำเป็น
        """
        uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        self.client = AsyncIOMotorClient(uri, uuidRepresentation="standard", serverSelectionTimeoutMS=8000)
        self.db = self.client[self.db_name]

        # สร้างดัชนีพื้นฐาน
        await self.db.chat_history.create_index([("user_id", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)])
        await self.db.chat_history.create_index([("account_id", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)])
        await self.db.raw_events.create_index([("timestamp", pymongo.DESCENDING)], background=True)
        await self.db.urls.create_index([("user_id", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)], background=True)
        await self.db.media.create_index([("message_id", pymongo.ASCENDING)], background=True)
        await self.db.app_config.create_index([("_k", pymongo.ASCENDING)], unique=True, background=True)

        # ทดสอบการเชื่อมต่อ
        await self.db.command("ping")
        return True

    def info(self) -> Dict[str, Any]:
        return {
            "connected": self.db is not None,
            "db_name": self.db_name,
            "uri_from_env": bool(os.getenv("MONGODB_URI")),
        }


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
    try:
        ok = await db_manager.init()
        return True if ok else False
    except Exception:
        return False


async def test_connection() -> Dict[str, Any]:
    try:
        await db_manager.db.command("ping")
        return {"status": "connected", "message": "MongoDB connected", "type": "MongoDB"}
    except Exception as e:
        return {"status": "error", "message": f"Connection failed: {e}"}


def get_connection_info() -> Dict[str, Any]:
    return db_manager.info()


async def get_database_status() -> Dict[str, Any]:
    try:
        stats = await db_manager.db.command("dbstats")
        return {"status": "connected", "db": db_manager.db_name, "collections": stats.get("collections", 0)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ----------------------------- Helpers -----------------------------


def _extract_type_and_text(message: Dict[str, Any]) -> (str, str):
    """ดึงชนิดและข้อความลัด ๆ จาก payload message"""
    if not isinstance(message, dict):
        return "text", str(message)
    mtype = message.get("type") or ("text" if "text" in message else "unknown")
    mtext = message.get("text")
    if not mtext:
        # เผื่อใส่เป็น object ทั้งก้อน
        mtext = str({k: v for k, v in message.items() if k != "content"})
    return mtype, mtext


def _wrap_docs(docs: List[Dict[str, Any]]) -> List[ChatRecord]:
    return [ChatRecord.from_doc(d) for d in docs]


# ----------------------------- Chat History -----------------------------


async def save_chat_history(user_id: str, direction: str, message: Dict[str, Any], sender: str) -> bool:
    try:
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
        return True
    except Exception:
        return False


async def save_chat_history_with_account(user_id: str, direction: str, message: Dict[str, Any], sender: str, account_id: Optional[str]) -> bool:
    try:
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
        return True
    except Exception:
        return False


async def get_chat_history_count() -> int:
    try:
        return await db_manager.db.chat_history.estimated_document_count()
    except Exception:
        return 0


async def get_recent_chat_history(limit: int = 50) -> List[ChatRecord]:
    try:
        cur = db_manager.db.chat_history.find({}).sort("created_at", -1).limit(int(limit))
        docs = [doc async for doc in cur]
        return _wrap_docs(docs)
    except Exception:
        return []


async def get_user_chat_history(user_id: str, limit: int = 100) -> List[ChatRecord]:
    try:
        cur = (
            db_manager.db.chat_history.find({"user_id": user_id})
            .sort("created_at", -1)
            .limit(int(limit))
        )
        docs = [doc async for doc in cur]
        return _wrap_docs(docs)
    except Exception:
        return []


def get_user_chat_history_sync(user_id: str, limit: int = 100) -> List[ChatRecord]:
    """
    ฟังก์ชัน sync ไว้ให้เรียกจากโค้ดเก่า (จะคืนลิสต์ว่างถ้าไม่มี loop)
    """
    return []


# ----------------------------- Events / Raw -----------------------------


async def save_raw_event(event: Dict[str, Any]) -> None:
    try:
        await db_manager.db.raw_events.insert_one({"event": event, "timestamp": datetime.utcnow()})
    except Exception:
        pass


async def save_event(owner_id: str, event_type: str, event: Dict[str, Any]) -> None:
    try:
        await db_manager.db.events.insert_one(
            {"owner_id": owner_id, "type": event_type, "event": event, "created_at": datetime.utcnow()}
        )
    except Exception:
        pass


# ----------------------------- Extra Saves -----------------------------


async def save_media_reference(user_id: str, message_id: str, media_type: str, message_data: Dict[str, Any]) -> None:
    try:
        await db_manager.db.media.insert_one(
            {
                "user_id": user_id,
                "message_id": message_id,
                "media_type": media_type,
                "data": message_data,
                "created_at": datetime.utcnow(),
            }
        )
    except Exception:
        pass


async def save_media_content(message_id: str, content: bytes, media_type: str) -> None:
    try:
        await db_manager.db.media.update_one(
            {"message_id": message_id},
            {"$set": {"binary": content, "media_type": media_type, "updated_at": datetime.Utcnow()}},
            upsert=True,
        )
    except Exception:
        pass


async def save_location(user_id: str, location_message: Dict[str, Any]) -> None:
    try:
        await db_manager.db.locations.insert_one(
            {"user_id": user_id, "location": location_message, "created_at": datetime.utcnow()}
        )
    except Exception:
        pass


async def save_url(user_id: str, url: str) -> None:
    try:
        await db_manager.db.urls.insert_one({"user_id": user_id, "url": url, "created_at": datetime.utcnow()})
    except Exception:
        pass


# ----------------------------- Config Store -----------------------------


async def get_config(key: str, default: Any = None) -> Any:
    try:
        doc = await db_manager.db.app_config.find_one({"_k": key})
        if not doc:
            return default
        return doc.get("value", default)
    except Exception:
        return default


async def set_config(key: str, value: Any, is_sensitive: bool = False) -> bool:
    try:
        res = await db_manager.db.app_config.update_one(
            {"_k": key},
            {"$set": {"_k": key, "value": value, "is_sensitive": bool(is_sensitive), "updated_at": datetime.utcnow()}},
            upsert=True,
        )
        return res.matched_count > 0 or res.upserted_id is not None
    except Exception:
        return False


# ----------------------------- System Messages -----------------------------


def _clean_msg(v: Any, default: str = "") -> str:
    if v is None:
        return default
    s = str(v).strip()
    return "" if s.lower() in {"undefined", "null", "none"} else s


async def get_system_messages(account_id: Optional[str] = None) -> Dict[str, str]:
    """
    อ่านข้อความระบบจาก MongoDB (มี default เสมอ)
    รองรับ key ทั้งแบบ *_message และคีย์สั้น
    """
    defaults = {
        "ai_disabled": "ขออภัย ระบบ AI ถูกปิดการใช้งานชั่วคราว",
        "slip_disabled": "ขออภัย ระบบตรวจสอบสลิปถูกปิดการใช้งานชั่วคราว",
        "system_disabled": "ขออภัย ระบบกำลังปิดปรับปรุง กรุณาติดต่อใหม่ภายหลัง",
    }
    try:
        if account_id:
            doc = await db_manager.db.line_accounts.find_one({"_id": ObjectId(account_id)})
            if not doc:
                return defaults

            def pick(*keys):
                for k in keys:
                    v = doc.get(k)
                    if isinstance(v, str) and v.strip().lower() in {"undefined", "null", "none"}:
                        v = ""
                    if v:
                        return v
                return None

            return {
                "ai_disabled": pick("ai_disabled", "ai_disabled_message") or defaults["ai_disabled"],
                "slip_disabled": pick("slip_disabled", "slip_disabled_message") or defaults["slip_disabled"],
                "system_disabled": pick("system_disabled", "system_disabled_message") or defaults["system_disabled"],
            }
        # global (optional)
        conf = await db_manager.db.app_config.find_one({"_k": "system_messages"}) or {}
        return {
            "ai_disabled": conf.get("ai_disabled") or conf.get("ai_disabled_message") or defaults["ai_disabled"],
            "slip_disabled": conf.get("slip_disabled") or conf.get("slip_disabled_message") or defaults["slip_disabled"],
            "system_disabled": conf.get("system_disabled") or conf.get("system_disabled_message") or defaults["system_disabled"],
        }
    except Exception:
        return defaults


async def set_system_messages(messages: Dict[str, str], account_id: Optional[str] = None) -> bool:
    """
    บันทึกข้อความระบบ (sanitize 'undefined')
    """
    try:
        docset = {
            "ai_disabled_message": _clean_msg(messages.get("ai_disabled"), "ขออภัย ระบบ AI ถูกปิดการใช้งานชั่วคราว"),
            "slip_disabled_message": _clean_msg(messages.get("slip_disabled"), "ขออภัย ระบบตรวจสอบสลิปถูกปิดการใช้งานชั่วคราว"),
            "system_disabled_message": _clean_msg(messages.get("system_disabled"), "ขออภัย ระบบกำลังปิดปรับปรุง กรุณาติดต่อใหม่ภายหลัง"),
            "updated_at": datetime.utcnow(),
        }

        if account_id:
            res = await db_manager.db.line_accounts.update_one({"_id": ObjectId(account_id)}, {"$set": docset})
            return res.modified_count > 0
        else:
            res = await db_manager.db.app_config.update_one(
                {"_k": "system_messages"},
                {"$set": docset},
                upsert=True,
            )
            return res.matched_count > 0 or res.upserted_id is not None
    except Exception:
        return False


# ----------------------------- Stats / Reports -----------------------------


async def get_account_statistics(account_id: str) -> Dict[str, Any]:
    try:
        pipeline = [
            {"$match": {"account_id": account_id}},
            {
                "$group": {
                    "_id": "$direction",
                    "count": {"$sum": 1},
                    "last": {"$max": "$created_at"},
                }
            },
        ]
        agg = [doc async for doc in db_manager.db.chat_history.aggregate(pipeline)]
        inbound = next((d["count"] for d in agg if d["_id"] == "in"), 0)
        outbound = next((d["count"] for d in agg if d["_id"] == "out"), 0)
        last = max((d.get("last") for d in agg if d.get("last")), default=None)
        total = inbound + outbound
        return {"total_messages": total, "inbound": inbound, "outbound": outbound, "last_activity": last.isoformat() if last else None}
    except Exception:
        return {"total_messages": 0, "inbound": 0, "outbound": 0, "last_activity": None}
