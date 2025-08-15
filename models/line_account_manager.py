# models/line_account_manager.py
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
        """สร้างบัญชี LINE OA ใหม่พร้อมการตั้งค่าข้อความปิดระบบ"""
        try:
            # เพิ่มข้อมูลพื้นฐานและข้อความปิดระบบ
            account_data = {
                # ข้อมูลพื้นฐาน
                "display_name": data.get("display_name", ""),
                "description": data.get("description", ""),
                
                # LINE Credentials
                "channel_secret": data.get("channel_secret", ""),
                "channel_access_token": data.get("channel_access_token", ""),
                
                # API Keys
                "thunder_api_token": data.get("thunder_api_token", ""),
                "openai_api_key": data.get("openai_api_key", ""),
                "kbank_consumer_id": data.get("kbank_consumer_id", ""),
                "kbank_consumer_secret": data.get("kbank_consumer_secret", ""),
                
                # AI Settings
                "ai_prompt": data.get("ai_prompt", "คุณเป็นผู้ช่วยที่เป็นมิตรและให้ความช่วยเหลือ"),
                
                # Feature Toggles
                "ai_enabled": data.get("ai_enabled", False),
                "slip_enabled": data.get("slip_enabled", False),
                "thunder_enabled": data.get("thunder_enabled", True),
                "kbank_enabled": data.get("kbank_enabled", False),
                "system_enabled": data.get("system_enabled", True),
                
                # ข้อความเมื่อระบบถูกปิด
                "ai_disabled_message": data.get("ai_disabled_message", 
                    "ขออภัย ระบบ AI ถูกปิดการใช้งานชั่วคราว กรุณาติดต่อเจ้าหน้าที่"),
                
                "slip_disabled_message": data.get("slip_disabled_message", 
                    "ขออภัย ระบบตรวจสอบสลิปถูกปิดการใช้งานชั่วคราว กรุณาติดต่อเจ้าหน้าที่"),
                
                "system_disabled_message": data.get("system_disabled_message", 
                    "ขออภัย ระบบกำลังปิดปรับปรุง กรุณาติดต่อใหม่ภายหลัง"),
                
                # ข้อความเมื่อไม่เข้าใจคำถาม
                "unknown_message": data.get("unknown_message",
                    "ขออภัย ไม่เข้าใจคำถามของคุณ กรุณาลองใหม่อีกครั้ง"),
                
                # ข้อความต้อนรับ
                "welcome_message": data.get("welcome_message",
                    "สวัสดีครับ ยินดีต้อนรับ มีอะไรให้ช่วยไหมครับ"),
                
                # ข้อความเมื่อ user follow
                "follow_message": data.get("follow_message",
                    "ขอบคุณที่เพิ่มเราเป็นเพื่อน! มีอะไรให้ช่วยเหลือติดต่อได้เลยครับ"),
                
                # การตั้งค่าการแจ้งเตือน
                "notify_on_new_message": data.get("notify_on_new_message", True),
                "notify_on_error": data.get("notify_on_error", True),
                "admin_line_user_id": data.get("admin_line_user_id", ""),
                
                # Webhook Path (unique for each account)
                "webhook_path": self._generate_webhook_path(),
                
                # การตั้งค่าขั้นสูง
                "max_ai_tokens": data.get("max_ai_tokens", 150),
                "ai_temperature": data.get("ai_temperature", 0.7),
                "ai_model": data.get("ai_model", "gpt-3.5-turbo"),
                
                # Rate limiting
                "rate_limit_enabled": data.get("rate_limit_enabled", False),
                "rate_limit_messages": data.get("rate_limit_messages", 100),
                "rate_limit_message": data.get("rate_limit_message",
                    "ขออภัย คุณส่งข้อความเร็วเกินไป กรุณารอสักครู่"),
                
                # Business hours
                "business_hours_enabled": data.get("business_hours_enabled", False),
                "business_hours_start": data.get("business_hours_start", "09:00"),
                "business_hours_end": data.get("business_hours_end", "18:00"),
                "business_hours_days": data.get("business_hours_days", [1, 2, 3, 4, 5]),
                "outside_hours_message": data.get("outside_hours_message",
                    "ขออภัย ขณะนี้อยู่นอกเวลาทำการ (จันทร์-ศุกร์ 9:00-18:00) "
                    "กรุณาติดต่อใหม่ในเวลาทำการ"),
                
                # Auto reply settings
                "auto_reply_enabled": data.get("auto_reply_enabled", False),
                "auto_reply_keywords": data.get("auto_reply_keywords", {}),
                
                # Logging preferences
                "log_all_messages": data.get("log_all_messages", True),
                "log_errors_only": data.get("log_errors_only", False),
                
                # Privacy settings
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
                
                # Tags for organization
                "tags": data.get("tags", []),
                
                # Custom fields
                "custom_fields": data.get("custom_fields", {})
            }
            
            # Validate required fields
            if not account_data["display_name"]:
                raise ValueError("Display name is required")
            
            if not account_data["channel_secret"] or not account_data["channel_access_token"]:
                raise ValueError("LINE credentials are required")
            
            # ตรวจสอบว่า webhook_path ไม่ซ้ำ
            existing = await self.accounts_collection.find_one({
                "webhook_path": account_data["webhook_path"]
            })
            
            if existing:
                # ถ้าซ้ำให้สร้างใหม่
                account_data["webhook_path"] = self._generate_webhook_path()
            
            # บันทึกลง MongoDB
            result = await self.accounts_collection.insert_one(account_data)
            account_id = str(result.inserted_id)
            
            # สร้าง indexes สำหรับ performance
            await self._ensure_indexes()
            
            # สร้าง collections แยกสำหรับ account นี้ (optional)
            await self._create_account_collections(account_id)
            
            # ส่ง notification ถ้าตั้งค่าไว้
            if account_data.get("notify_on_new_message") and account_data.get("admin_line_user_id"):
                await self._notify_admin(
                    account_data["admin_line_user_id"],
                    f"✅ สร้างบัญชี {account_data['display_name']} เรียบร้อยแล้ว\n"
                    f"Account ID: {account_id}"
                )
            
            logger.info(f"✅ Created LINE account: {account_id} - {account_data['display_name']}")
            
            # Return account_id
            return account_id
            
        except ValueError as ve:
            logger.error(f"❌ Validation error creating account: {ve}")
            raise
        except Exception as e:
            logger.error(f"❌ Error creating account: {e}")
            raise
    
    async def _create_account_collections(self, account_id: str):
        """สร้าง collections แยกสำหรับแต่ละ account (optional)"""
        try:
            # สร้าง collection สำหรับเก็บ chat history ของ account นี้โดยเฉพาะ
            collection_name = f"chat_history_{account_id}"
            
            # สร้าง indexes
            await self.db[collection_name].create_index([("user_id", 1)])
            await self.db[collection_name].create_index([("created_at", -1)])
            await self.db[collection_name].create_index([("message_type", 1)])
            
            logger.info(f"✅ Created collections for account {account_id}")
            
        except Exception as e:
            logger.warning(f"⚠️ Could not create account collections: {e}")
    
    async def _notify_admin(self, admin_user_id: str, message: str):
        """ส่งการแจ้งเตือนไปยัง admin ผ่าน LINE"""
        try:
            # ใช้ default LINE credentials สำหรับส่งการแจ้งเตือน
            from utils.config_manager import config_manager
            import httpx
            
            access_token = config_manager.get("line_channel_access_token")
            if not access_token or not admin_user_id:
                return
            
            url = "https://api.line.me/v2/bot/message/push"
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
            payload = {
                "to": admin_user_id,
                "messages": [{
                    "type": "text",
                    "text": message
                }]
            }
            
            async with httpx.AsyncClient() as client:
                await client.post(url, headers=headers, json=payload)
                
        except Exception as e:
            logger.warning(f"⚠️ Could not send admin notification: {e}")

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
            if doc:
                account = dict(doc)
                account["id"] = str(doc["_id"])
                account.pop("_id", None)
                return account
            return None
        except Exception as e:
            logger.error(f"❌ Error getting account {account_id}: {e}")
            return None

    async def get_account_by_webhook_path(self, webhook_path: str) -> Optional[Dict]:
        """ดึงข้อมูลบัญชีจาก webhook path"""
        try:
            doc = await self.accounts_collection.find_one({"webhook_path": webhook_path})
            if doc:
                account = dict(doc)
                account["id"] = str(doc["_id"])
                account.pop("_id", None)
                return account
            return None
        except Exception as e:
            logger.error(f"❌ Error getting account by webhook path: {e}")
            return None

    async def update_account(self, account_id: str, updates: Dict) -> bool:
        """อัปเดตข้อมูลบัญชี"""
        try:
            updates["updated_at"] = datetime.utcnow()
            updates.pop("_id", None)
            updates.pop("id", None)
            
            result = await self.accounts_collection.update_one(
                {"_id": ObjectId(account_id)}, 
                {"$set": updates}
            )
            
            success = result.modified_count > 0
            if success:
                logger.info(f"✅ Updated account: {account_id}")
            
            return success
        except Exception as e:
            logger.error(f"❌ Error updating account {account_id}: {e}")
            return False

    async def delete_account(self, account_id: str) -> bool:
        """ลบบัญชี"""
        try:
            # ลบประวัติแชทที่เกี่ยวข้อง
            await self.db.chat_history.delete_many({"account_id": account_id})
            
            # ลบบัญชี
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
            # นับจำนวนข้อความ
            message_count = await self.db.chat_history.count_documents({"account_id": account_id})
            
            # นับผู้ใช้ที่ไม่ซ้ำ
            pipeline = [
                {"$match": {"account_id": account_id}},
                {"$group": {"_id": "$user_id"}},
                {"$count": "unique_users"}
            ]
            
            result = await self.db.chat_history.aggregate(pipeline).to_list(1)
            unique_users = result[0]["unique_users"] if result else 0
            
            return {
                "total_messages": message_count,
                "unique_users": unique_users
            }
        except Exception as e:
            logger.error(f"❌ Error getting account stats: {e}")
            return {"total_messages": 0, "unique_users": 0}
