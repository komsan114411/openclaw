# -*- coding: utf-8 -*-
import logging
from typing import Dict, List, Optional
from bson import ObjectId
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorCollection
import secrets
import string

logger = logging.getLogger("line_account_manager")

class LineAccountManager:
    def __init__(self, db):
        self.db = db
        self.accounts_collection: AsyncIOMotorCollection = db.line_accounts

    async def create_account(self, data: Dict) -> str:
    """สร้างบัญชี LINE OA ใหม่"""
    try:
        account_data = {
            "display_name": data.get("display_name", ""),
            "description": data.get("description", ""),
            "channel_secret": data.get("channel_secret", ""),
            "channel_access_token": data.get("channel_access_token", ""),

            # API Keys
            "thunder_api_token": data.get("thunder_api_token", ""),
            "openai_api_key": data.get("openai_api_key", ""),
            "kbank_consumer_id": data.get("kbank_consumer_id", ""),
            "kbank_consumer_secret": data.get("kbank_consumer_secret", ""),

            # Feature Toggles (แปลงเป็น bool ให้ชัดเจน)
            "thunder_enabled": bool(data.get("thunder_enabled", True)),
            "ai_enabled": bool(data.get("ai_enabled", False)),
            "slip_enabled": bool(data.get("slip_enabled", False)),
            "kbank_enabled": bool(data.get("kbank_enabled", False)),

            # AI settings
            "ai_prompt": (data.get("ai_prompt") or "คุณเป็นผู้ช่วยที่เป็นมิตรและให้ความช่วยเหลือ"),

            # System Messages (fallback) — บันทึกลง DB เสมอ
            "ai_disabled_message": (data.get("ai_disabled_message") or "ขออภัย ระบบ AI ถูกปิดการใช้งานชั่วคราว"),
            "slip_disabled_message": (data.get("slip_disabled_message") or "ขออภัย ระบบตรวจสอบสลิปถูกปิดการใช้งานชั่วคราว"),
            "system_disabled_message": (data.get("system_disabled_message") or "ขออภัย ระบบกำลังปิดปรับปรุง กรุณาติดต่อใหม่ภายหลัง"),

            # Webhook
            "webhook_path": (data.get("webhook_path") or self._generate_webhook_path()),

            # Meta
            "status": "active",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }

        result = await self.accounts_collection.insert_one(account_data)
        await self._ensure_indexes()
        account_id = str(result.inserted_id)
        logger.info(f"✅ Created LINE account: {account_id}")
        return account_id

    except Exception as e:
        logger.error(f"❌ Error creating account: {e}")
        raise


    async def get_system_messages(self, account_id: str) -> Dict[str, str]:
    """ดึงข้อความแจ้งเตือนของบัญชี พร้อม default เสมอ (แม้ DB ว่าง/ผิดพลาด)"""
    defaults = {
        "ai_disabled": "ขออภัย ระบบ AI ถูกปิดการใช้งานชั่วคราว",
        "slip_disabled": "ขออภัย ระบบตรวจสอบสลิปถูกปิดการใช้งานชั่วคราว",
        "system_disabled": "ขออภัย ระบบกำลังปิดปรับปรุง กรุณาติดต่อใหม่ภายหลัง",
    }
    try:
        account = await self.get_account(account_id)
        if not account:
            return defaults

        return {
            "ai_disabled": (account.get("ai_disabled_message") or defaults["ai_disabled"]),
            "slip_disabled": (account.get("slip_disabled_message") or defaults["slip_disabled"]),
            "system_disabled": (account.get("system_disabled_message") or defaults["system_disabled"]),
        }
    except Exception as e:
        logger.error(f"Error getting system messages: {e}")
        return defaults


    async def list_accounts(self) -> List[Dict]:
        """แสดงรายการบัญชีทั้งหมด"""
        try:
            accounts = []
            cursor = self.accounts_collection.find({}).sort("created_at", -1)
            async for doc in cursor:
                account = dict(doc)
                account["id"] = str(doc["_id"])
                account.pop("_id", None)
                accounts.append(account)
            return accounts
        except Exception as e:
            logger.error(f"❌ Error listing accounts: {e}")
            return []

    async def get_account(self, account_id: str) -> Optional[Dict]:
        """ดึงข้อมูลบัญชีตาม ID"""
        try:
            doc = await self.accounts_collection.find_one({"_id": ObjectId(account_id)})
            if not doc:
                return None
            account = dict(doc)
            account["id"] = str(doc["_id"])
            account.pop("_id", None)
            return account
        except Exception as e:
            logger.error(f"❌ Error getting account {account_id}: {e}")
            return None

    async def get_account_by_webhook_path(self, webhook_path: str) -> Optional[Dict]:
        """ดึงข้อมูลบัญชีจาก webhook path"""
        try:
            doc = await self.accounts_collection.find_one({"webhook_path": webhook_path})
            if not doc:
                return None
            account = dict(doc)
            account["id"] = str(doc["_id"])
            account.pop("_id", None)
            return account
        except Exception as e:
            logger.error(f"❌ Error getting account by webhook path: {e}")
            return None

   async def update_account(self, account_id: str, updates: Dict) -> bool:
    """อัปเดตข้อมูลบัญชี"""
    try:
        # กัน "undefined"/None จากฟรอนต์
        def _clean_str(v: object, default: str = "") -> str:
            if v is None:
                return default
            if isinstance(v, str) and v.strip().lower() == "undefined":
                return default
            return str(v)

        cleaned = {
            "display_name": _clean_str(updates.get("display_name")),
            "description": _clean_str(updates.get("description")),
            "channel_secret": _clean_str(updates.get("channel_secret")),
            "channel_access_token": _clean_str(updates.get("channel_access_token")),
            "thunder_api_token": _clean_str(updates.get("thunder_api_token")),
            "openai_api_key": _clean_str(updates.get("openai_api_key")),
            "kbank_consumer_id": _clean_str(updates.get("kbank_consumer_id")),
            "kbank_consumer_secret": _clean_str(updates.get("kbank_consumer_secret")),
            "ai_prompt": _clean_str(updates.get("ai_prompt"), "คุณเป็นผู้ช่วยที่เป็นมิตรและให้ความช่วยเหลือ"),

            # Fallback messages — ถ้าไม่ส่งมาหรือส่ง "undefined" ให้ใช้ default
            "ai_disabled_message": _clean_str(
                updates.get("ai_disabled_message"),
                "ขออภัย ระบบ AI ถูกปิดการใช้งานชั่วคราว"
            ),
            "slip_disabled_message": _clean_str(
                updates.get("slip_disabled_message"),
                "ขออภัย ระบบตรวจสอบสลิปถูกปิดการใช้งานชั่วคราว"
            ),
            "system_disabled_message": _clean_str(
                updates.get("system_disabled_message"),
                "ขออภัย ระบบกำลังปิดปรับปรุง กรุณาติดต่อใหม่ภายหลัง"
            ),
        }

        # toggles -> bool
        for key in ("thunder_enabled", "ai_enabled", "slip_enabled", "kbank_enabled"):
            if key in updates:
                cleaned[key] = bool(updates.get(key))

        cleaned["updated_at"] = datetime.utcnow()
        cleaned.pop("_id", None)
        cleaned.pop("id", None)

        result = await self.accounts_collection.update_one(
            {"_id": ObjectId(account_id)},
            {"$set": cleaned},
        )
        ok = result.modified_count > 0
        if ok:
            logger.info(f"✅ Updated account: {account_id}")
        return ok
    except Exception as e:
        logger.error(f"❌ Error updating account {account_id}: {e}")
        return False


    async def delete_account(self, account_id: str) -> bool:
        """ลบบัญชี"""
        try:
            await self.db.chat_history.delete_many({"account_id": account_id})
            result = await self.accounts_collection.delete_one({"_id": ObjectId(account_id)})
            success = result.deleted_count > 0
            if success:
                logger.info(f"✅ Deleted account: {account_id}")
            return success
        except Exception as e:
            logger.error(f"❌ Error deleting account {account_id}: {e}")
            return False

    def _generate_webhook_path(self) -> str:
        """สร้าง webhook path ที่ไม่ซ้ำ"""
        return ''.join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(12))

    async def _ensure_indexes(self):
        """สร้าง indexes สำหรับ performance"""
        try:
            await self.accounts_collection.create_index([("webhook_path", 1)], unique=True)
            await self.accounts_collection.create_index([("display_name", 1)])
            await self.accounts_collection.create_index([("created_at", -1)])
        except Exception as e:
            logger.warning(f"⚠️ Index creation warning: {e}")

    async def get_account_stats(self, account_id: str) -> Dict:
        """ดึงสถิติของบัญชี"""
        try:
            message_count = await self.db.chat_history.count_documents({"account_id": account_id})
            pipeline = [
                {"$match": {"account_id": account_id}},
                {"$group": {"_id": "$user_id"}},
                {"$count": "unique_users"},
            ]
            result = await self.db.chat_history.aggregate(pipeline).to_list(1)
            unique_users = result[0]["unique_users"] if result else 0
            return {"total_messages": message_count, "unique_users": unique_users}
        except Exception as e:
            logger.error(f"❌ Error getting account stats: {e}")
            return {"total_messages": 0, "unique_users": 0}
