# models/line_account_manager.py
from __future__ import annotations

import secrets
import string
from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId
from pymongo.errors import DuplicateKeyError


class LineAccountManager:
    """
    จัดการข้อมูล LINE OA แบบหลายบัญชี
    - รองรับข้อความ fallback (ai/slip/system) ที่ป้องกันค่า "undefined"/None
    - มี webhook_path แบบสุ่ม (unique) สำหรับ route เฉพาะบัญชี
    - ทุกเมธอดเป็น async เพื่อใช้กับ Motor/MongoDB แบบ non-blocking
    """

    def __init__(self, db):
        self.db = db
        self.accounts_collection = db.get_collection("line_accounts")
        self._indexes_ensured = False

    # ----------------------------- Utilities -----------------------------

    def _rand_slug(self, n: int = 18) -> str:
        alphabet = string.ascii_lowercase + string.digits
        return "".join(secrets.choice(alphabet) for _ in range(n))

    def _generate_webhook_path(self) -> str:
        return f"acc_{self._rand_slug(16)}"

    async def _ensure_indexes(self):
        if self._indexes_ensured:
            return
        await self.accounts_collection.create_index("webhook_path", unique=True, background=True)
        await self.accounts_collection.create_index("display_name", background=True)
        await self.accounts_collection.create_index("updated_at", background=True)
        self._indexes_ensured = True

    @staticmethod
    def _clean_str(v: Any, default: str = "") -> str:
        if v is None:
            return default
        s = str(v).strip()
        if s.lower() in {"undefined", "null", "none"}:
            return default
        return s

    # ----------------------------- CRUD -----------------------------

    async def list_accounts(self) -> List[Dict[str, Any]]:
        await self._ensure_indexes()
        cur = self.accounts_collection.find({}).sort("updated_at", -1)
        return [self._serialize(doc) async for doc in cur]

    async def get_account(self, account_id: str) -> Optional[Dict[str, Any]]:
        if not account_id:
            return None
        await self._ensure_indexes()
        doc = await self.accounts_collection.find_one({"_id": ObjectId(account_id)})
        return self._serialize(doc) if doc else None

    async def get_account_by_webhook_path(self, webhook_path: str) -> Optional[Dict[str, Any]]:
        if not webhook_path:
            return None
        await self._ensure_indexes()
        doc = await self.accounts_collection.find_one({"webhook_path": webhook_path})
        return self._serialize(doc) if doc else None

    async def create_account(self, data: Dict[str, Any]) -> str:
        """สร้างบัญชีใหม่ พร้อมค่าเริ่มต้น/กันค่า 'undefined'"""
        await self._ensure_indexes()

        account_data = {
            # Display / meta
            "display_name": self._clean_str(data.get("display_name"), ""),
            "description": self._clean_str(data.get("description"), ""),
            "status": "active",

            # LINE credentials
            "channel_secret": self._clean_str(data.get("channel_secret"), ""),
            "channel_access_token": self._clean_str(data.get("channel_access_token"), ""),

            # External APIs
            "thunder_api_token": self._clean_str(data.get("thunder_api_token"), ""),
            "openai_api_key": self._clean_str(data.get("openai_api_key"), ""),
            "kbank_consumer_id": self._clean_str(data.get("kbank_consumer_id"), ""),
            "kbank_consumer_secret": self._clean_str(data.get("kbank_consumer_secret"), ""),

            # Feature toggles
            "thunder_enabled": bool(data.get("thunder_enabled", True)),
            "ai_enabled": bool(data.get("ai_enabled", False)),
            "slip_enabled": bool(data.get("slip_enabled", False)),
            "kbank_enabled": bool(data.get("kbank_enabled", False)),

            # AI prompt
            "ai_prompt": self._clean_str(
                data.get("ai_prompt"),
                "คุณเป็นผู้ช่วยที่เป็นมิตรและให้ความช่วยเหลือ",
            ),

            # System messages (fallbacks)
            "ai_disabled_message": self._clean_str(
                data.get("ai_disabled_message"),
                "ขออภัย ระบบ AI ถูกปิดการใช้งานชั่วคราว",
            ),
            "slip_disabled_message": self._clean_str(
                data.get("slip_disabled_message"),
                "ขออภัย ระบบตรวจสอบสลิปถูกปิดการใช้งานชั่วคราว",
            ),
            "system_disabled_message": self._clean_str(
                data.get("system_disabled_message"),
                "ขออภัย ระบบกำลังปิดปรับปรุง กรุณาติดต่อใหม่ภายหลัง",
            ),

            # Webhook
            "webhook_path": self._clean_str(data.get("webhook_path")) or self._generate_webhook_path(),

            # Timestamps
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }

        try:
            res = await self.accounts_collection.insert_one(account_data)
            await self._ensure_indexes()
            return str(res.inserted_id)
        except DuplicateKeyError:
            # webhook_path ชนกัน → สุ่มใหม่แล้วลองอีกครั้ง
            account_data["webhook_path"] = self._generate_webhook_path()
            res = await self.accounts_collection.insert_one(account_data)
            return str(res.inserted_id)

    async def update_account(self, account_id: str, updates: Dict[str, Any]) -> bool:
        """อัปเดตข้อมูลบัญชี (sanitize 'undefined'/None)"""
        if not account_id:
            return False

        def c(v: Any, default: str = "") -> str:
            return self._clean_str(v, default)

        cleaned = {
            "display_name": c(updates.get("display_name")),
            "description": c(updates.get("description")),
            "channel_secret": c(updates.get("channel_secret")),
            "channel_access_token": c(updates.get("channel_access_token")),
            "thunder_api_token": c(updates.get("thunder_api_token")),
            "openai_api_key": c(updates.get("openai_api_key")),
            "kbank_consumer_id": c(updates.get("kbank_consumer_id")),
            "kbank_consumer_secret": c(updates.get("kbank_consumer_secret")),
            "ai_prompt": c(updates.get("ai_prompt"), "คุณเป็นผู้ช่วยที่เป็นมิตรและให้ความช่วยเหลือ"),
            "ai_disabled_message": c(updates.get("ai_disabled_message"), "ขออภัย ระบบ AI ถูกปิดการใช้งานชั่วคราว"),
            "slip_disabled_message": c(updates.get("slip_disabled_message"), "ขออภัย ระบบตรวจสอบสลิปถูกปิดการใช้งานชั่วคราว"),
            "system_disabled_message": c(updates.get("system_disabled_message"), "ขออภัย ระบบกำลังปิดปรับปรุง กรุณาติดต่อใหม่ภายหลัง"),
        }

        # toggles
        for key in ("thunder_enabled", "ai_enabled", "slip_enabled", "kbank_enabled"):
            if key in updates:
                cleaned[key] = bool(updates.get(key))

        # webhook_path (optional; ต้องไม่ชน)
        if "webhook_path" in updates:
            cleaned["webhook_path"] = c(updates.get("webhook_path")) or self._generate_webhook_path()

        cleaned["updated_at"] = datetime.utcnow()
        cleaned.pop("_id", None)
        cleaned.pop("id", None)

        await self._ensure_indexes()
        res = await self.accounts_collection.update_one(
            {"_id": ObjectId(account_id)},
            {"$set": cleaned},
        )
        return res.modified_count > 0

    async def delete_account(self, account_id: str) -> bool:
        if not account_id:
            return False
        await self._ensure_indexes()
        res = await self.accounts_collection.delete_one({"_id": ObjectId(account_id)})
        return res.deleted_count > 0

    # ------------------------- System messages -------------------------

    async def get_system_messages(self, account_id: str) -> Dict[str, str]:
        """
        คืนข้อความระบบแบบมี default เสมอ และรองรับ key ทั้งแบบ *_message และคีย์สั้น
        """
        defaults = {
            "ai_disabled": "ขออภัย ระบบ AI ถูกปิดการใช้งานชั่วคราว",
            "slip_disabled": "ขออภัย ระบบตรวจสอบสลิปถูกปิดการใช้งานชั่วคราว",
            "system_disabled": "ขออภัย ระบบกำลังปิดปรับปรุง กรุณาติดต่อใหม่ภายหลัง",
        }
        try:
            doc = await self.accounts_collection.find_one({"_id": ObjectId(account_id)})
            if not doc:
                return defaults

            def pick(*keys) -> Optional[str]:
                for k in keys:
                    if k in doc and isinstance(doc[k], str):
                        s = doc[k].strip()
                        if s and s.lower() not in {"undefined", "null", "none"}:
                            return s
                return None

            return {
                "ai_disabled": pick("ai_disabled", "ai_disabled_message") or defaults["ai_disabled"],
                "slip_disabled": pick("slip_disabled", "slip_disabled_message") or defaults["slip_disabled"],
                "system_disabled": pick("system_disabled", "system_disabled_message") or defaults["system_disabled"],
            }
        except Exception:
            return defaults

    # ----------------------------- Helpers -----------------------------

    @staticmethod
    def _serialize(doc: Dict[str, Any]) -> Dict[str, Any]:
        if not doc:
            return {}
        d = dict(doc)
        if "_id" in d:
            d["id"] = str(d["_id"])
            del d["_id"]
        return d
