import logging
from typing import Dict, List, Optional
from bson import ObjectId
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorCollection
import secrets
import string

"""
This module provides a ``LineAccountManager`` class for managing LINE OA account
records in a MongoDB database.  The manager encapsulates common CRUD
operations such as creating, listing, updating and deleting accounts, as well
as a few convenience helpers for generating unique webhook paths and building
indices.  All methods are implemented using ``async`` APIs from Motor so
they integrate cleanly with FastAPI's asynchronous request handling.

The original version of this file contained several indentation issues where
docstrings and method bodies were not indented relative to their function
definitions.  Those errors caused Python to raise ``IndentationError`` at
import time and prevented the application from starting.  This version fixes
those issues by properly indenting docstrings and method bodies, and by
aligning helper methods at the class level rather than nesting them inside
other methods.
"""

logger = logging.getLogger("line_account_manager")


class LineAccountManager:
    """Helper for creating and managing LINE OA accounts in MongoDB."""

    def __init__(self, db):
        """
        Initialise a ``LineAccountManager`` bound to a given Motor database.

        Args:
            db: An instance of ``motor.motor_asyncio.AsyncIOMotorDatabase`` with
                collections for storing account metadata and chat history.
        """
        self.db = db
        # The primary collection where account documents are stored
        self.accounts_collection: AsyncIOMotorCollection = db.line_accounts

    async def create_account(self, data: Dict) -> str:
        """
        Create a new LINE OA account document.

        This helper constructs a dictionary of account metadata from the
        provided ``data`` dictionary, validates required fields, ensures a
        unique webhook path, inserts the document into MongoDB, builds
        appropriate indices and account-specific collections, optionally
        notifies an administrator, and returns the inserted account's ID.

        Args:
            data: A mapping of field names to values used to populate the
                account document.  Values that are missing will be filled with
                sensible defaults.

        Returns:
            The string representation of the newly created account's ObjectId.

        Raises:
            ValueError: If the ``display_name`` or required LINE credentials
                are missing.
            Exception: Propagated if MongoDB operations fail.
        """
        try:
            # Compose the account document with defaults for many optional fields
            account_data = {
                # Basic information
                "display_name": data.get("display_name", ""),
                "description": data.get("description", ""),

                # LINE credentials
                "channel_secret": data.get("channel_secret", ""),
                "channel_access_token": data.get("channel_access_token", ""),

                # API keys
                "thunder_api_token": data.get("thunder_api_token", ""),
                "openai_api_key": data.get("openai_api_key", ""),
                "kbank_consumer_id": data.get("kbank_consumer_id", ""),
                "kbank_consumer_secret": data.get("kbank_consumer_secret", ""),

                # AI settings
                "ai_prompt": data.get(
                    "ai_prompt", "คุณเป็นผู้ช่วยที่เป็นมิตรและให้ความช่วยเหลือ"
                ),

                # Feature toggles
                "ai_enabled": data.get("ai_enabled", False),
                "slip_enabled": data.get("slip_enabled", False),
                "thunder_enabled": data.get("thunder_enabled", True),
                "kbank_enabled": data.get("kbank_enabled", False),
                "system_enabled": data.get("system_enabled", True),

                # Messages shown when subsystems are disabled
                "ai_disabled_message": data.get(
                    "ai_disabled_message",
                    "ขออภัย ระบบ AI ถูกปิดการใช้งานชั่วคราว กรุณาติดต่อเจ้าหน้าที่",
                ),
                "slip_disabled_message": data.get(
                    "slip_disabled_message",
                    "ขออภัย ระบบตรวจสอบสลิปถูกปิดการใช้งานชั่วคราว กรุณาติดต่อเจ้าหน้าที่",
                ),
                "system_disabled_message": data.get(
                    "system_disabled_message",
                    "ขออภัย ระบบกำลังปิดปรับปรุง กรุณาติดต่อใหม่ภายหลัง",
                ),

                # Generic fallback messages
                "unknown_message": data.get(
                    "unknown_message",
                    "ขออภัย ไม่เข้าใจคำถามของคุณ กรุณาลองใหม่อีกครั้ง",
                ),
                "welcome_message": data.get(
                    "welcome_message",
                    "สวัสดีครับ ยินดีต้อนรับ มีอะไรให้ช่วยไหมครับ",
                ),
                "follow_message": data.get(
                    "follow_message",
                    "ขอบคุณที่เพิ่มเราเป็นเพื่อน! มีอะไรให้ช่วยเหลือติดต่อได้เลยครับ",
                ),

                # Notification settings
                "notify_on_new_message": data.get("notify_on_new_message", True),
                "notify_on_error": data.get("notify_on_error", True),
                "admin_line_user_id": data.get("admin_line_user_id", ""),

                # Unique webhook path
                "webhook_path": self._generate_webhook_path(),

                # Advanced AI configuration
                "max_ai_tokens": data.get("max_ai_tokens", 150),
                "ai_temperature": data.get("ai_temperature", 0.7),
                "ai_model": data.get("ai_model", "gpt-3.5-turbo"),

                # Rate limiting
                "rate_limit_enabled": data.get("rate_limit_enabled", False),
                "rate_limit_messages": data.get("rate_limit_messages", 100),
                "rate_limit_message": data.get(
                    "rate_limit_message",
                    "ขออภัย คุณส่งข้อความเร็วเกินไป กรุณารอสักครู่",
                ),

                # Business hours
                "business_hours_enabled": data.get("business_hours_enabled", False),
                "business_hours_start": data.get("business_hours_start", "09:00"),
                "business_hours_end": data.get("business_hours_end", "18:00"),
                "business_hours_days": data.get("business_hours_days", [1, 2, 3, 4, 5]),
                "outside_hours_message": data.get(
                    "outside_hours_message",
                    "ขออภัย ขณะนี้อยู่นอกเวลาทำการ (จันทร์-ศุกร์ 9:00-18:00) "
                    "กรุณาติดต่อใหม่ในเวลาทำการ",
                ),

                # Auto-reply settings
                "auto_reply_enabled": data.get("auto_reply_enabled", False),
                "auto_reply_keywords": data.get("auto_reply_keywords", {}),

                # Logging preferences
                "log_all_messages": data.get("log_all_messages", True),
                "log_errors_only": data.get("log_errors_only", False),

                # Privacy and retention
                "mask_sensitive_data": data.get("mask_sensitive_data", True),
                "delete_messages_after_days": data.get("delete_messages_after_days", 0),

                # Status and metadata
                "status": "active",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "created_by": data.get("created_by", "system"),
                "last_activity": None,
                "total_messages": 0,
                "total_users": 0,

                # Organisational tagging
                "tags": data.get("tags", []),
                # Custom fields for extensibility
                "custom_fields": data.get("custom_fields", {}),
            }

            # Validate required fields
            if not account_data["display_name"]:
                raise ValueError("Display name is required")
            if (not account_data["channel_secret"] or
                    not account_data["channel_access_token"]):
                raise ValueError("LINE credentials are required")

            # Ensure the webhook path is unique by regenerating if necessary
            existing = await self.accounts_collection.find_one(
                {"webhook_path": account_data["webhook_path"]}
            )
            if existing:
                account_data["webhook_path"] = self._generate_webhook_path()

            # Insert the document into MongoDB
            result = await self.accounts_collection.insert_one(account_data)
            account_id = str(result.inserted_id)

            # Build indices and account-specific collections to improve performance
            await self._ensure_indexes()
            await self._create_account_collections(account_id)

            # Optionally notify an admin on success
            if (account_data.get("notify_on_new_message") and
                    account_data.get("admin_line_user_id")):
                await self._notify_admin(
                    account_data["admin_line_user_id"],
                    f"✅ สร้างบัญชี {account_data['display_name']} เรียบร้อยแล้ว\n"
                    f"Account ID: {account_id}",
                )

            logger.info(
                f"✅ Created LINE account: {account_id} - {account_data['display_name']}"
            )

            return account_id
        except ValueError:
            # Propagate validation errors upward; they will be logged by callers
            logger.error(
                "❌ Validation error creating account:", exc_info=True
            )
            raise
        except Exception:
            # Log and propagate unexpected exceptions
            logger.error(
                "❌ Error creating account:", exc_info=True
            )
            raise

    async def _create_account_collections(self, account_id: str) -> None:
        """Create per-account collections such as chat history indexes."""
        try:
            # Use a separate collection for each account's chat history
            collection_name = f"chat_history_{account_id}"
            await self.db[collection_name].create_index([("user_id", 1)])
            await self.db[collection_name].create_index([("created_at", -1)])
            await self.db[collection_name].create_index([("message_type", 1)])
            logger.info(f"✅ Created collections for account {account_id}")
        except Exception:
            # Log but do not re-raise; collection creation is optional
            logger.warning(
                f"⚠️ Could not create account collections for {account_id}",
                exc_info=True,
            )

    async def _notify_admin(self, admin_user_id: str, message: str) -> None:
        """Send a notification message to the admin via the LINE messaging API."""
        try:
            # Lazily import config and http client to avoid circular imports
            from utils.config_manager import config_manager
            import httpx

            access_token = config_manager.get("line_channel_access_token")
            if not access_token or not admin_user_id:
                return

            url = "https://api.line.me/v2/bot/message/push"
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            }
            payload = {
                "to": admin_user_id,
                "messages": [
                    {
                        "type": "text",
                        "text": message,
                    }
                ],
            }
            async with httpx.AsyncClient() as client:
                await client.post(url, headers=headers, json=payload)
        except Exception:
            # Log but swallow errors to avoid cascading failures
            logger.warning(
                f"⚠️ Could not send admin notification to {admin_user_id}",
                exc_info=True,
            )

    async def list_accounts(self) -> List[Dict]:
        """Return a list of all account documents, sorted by creation time."""
        try:
            accounts: List[Dict] = []
            cursor = self.accounts_collection.find({}).sort("created_at", -1)
            async for doc in cursor:
                account = dict(doc)
                account["id"] = str(doc["_id"])
                account.pop("_id", None)
                accounts.append(account)
            return accounts
        except Exception:
            logger.error("❌ Error listing accounts", exc_info=True)
            return []

    async def get_account(self, account_id: str) -> Optional[Dict]:
        """Retrieve a single account document by its ObjectId string."""
        try:
            doc = await self.accounts_collection.find_one({"_id": ObjectId(account_id)})
            if doc:
                account = dict(doc)
                account["id"] = str(doc["_id"])
                account.pop("_id", None)
                return account
            return None
        except Exception:
            logger.error(
                f"❌ Error getting account {account_id}", exc_info=True
            )
            return None

    async def get_account_by_webhook_path(self, webhook_path: str) -> Optional[Dict]:
        """Retrieve an account document by its unique webhook path."""
        try:
            doc = await self.accounts_collection.find_one({"webhook_path": webhook_path})
            if doc:
                account = dict(doc)
                account["id"] = str(doc["_id"])
                account.pop("_id", None)
                return account
            return None
        except Exception:
            logger.error(
                f"❌ Error getting account by webhook path {webhook_path}",
                exc_info=True,
            )
            return None

    async def update_account(self, account_id: str, updates: Dict) -> bool:
        """Update fields of an account document by its ID."""
        try:
            updates = updates.copy()
            updates["updated_at"] = datetime.utcnow()
            updates.pop("_id", None)  # prevent changing the primary key
            updates.pop("id", None)

            result = await self.accounts_collection.update_one(
                {"_id": ObjectId(account_id)}, {"$set": updates}
            )
            success = result.modified_count > 0
            if success:
                logger.info(f"✅ Updated account: {account_id}")
            return success
        except Exception:
            logger.error(
                f"❌ Error updating account {account_id}", exc_info=True
            )
            return False

    async def delete_account(self, account_id: str) -> bool:
        """Delete an account document and associated chat history."""
        try:
            # Remove chat history documents associated with this account
            await self.db.chat_history.delete_many({"account_id": account_id})
            # Remove the account document itself
            result = await self.accounts_collection.delete_one(
                {"_id": ObjectId(account_id)}
            )
            success = result.deleted_count > 0
            if success:
                logger.info(f"✅ Deleted account: {account_id}")
            return success
        except Exception:
            logger.error(
                f"❌ Error deleting account {account_id}", exc_info=True
            )
            return False

    def _generate_webhook_path(self) -> str:
        """Generate a new 12-character alphanumeric webhook path."""
        alphabet = string.ascii_lowercase + string.digits
        return "".join(secrets.choice(alphabet) for _ in range(12))

    async def _ensure_indexes(self) -> None:
        """Create indices on frequently queried fields to improve performance."""
        try:
            await self.accounts_collection.create_index(
                [("webhook_path", 1)], unique=True
            )
            await self.accounts_collection.create_index([("display_name", 1)])
            await self.accounts_collection.create_index([("created_at", -1)])
        except Exception:
            logger.warning(
                "⚠️ Index creation warning", exc_info=True
            )

    async def get_account_stats(self, account_id: str) -> Dict:
        """Return aggregate statistics about a single account's chat history."""
        try:
            message_count = await self.db.chat_history.count_documents(
                {"account_id": account_id}
            )
            pipeline = [
                {"$match": {"account_id": account_id}},
                {"$group": {"_id": "$user_id"}},
                {"$count": "unique_users"},
            ]
            result = await self.db.chat_history.aggregate(pipeline).to_list(1)
            unique_users = result[0]["unique_users"] if result else 0
            return {
                "total_messages": message_count,
                "unique_users": unique_users,
            }
        except Exception:
            logger.error(
                f"❌ Error getting account stats for {account_id}",
                exc_info=True,
            )
            return {"total_messages": 0, "unique_users": 0}
