# models/line_account_manager.py - ใช้ไฟล์นี้แทนไฟล์เดิมทั้งหมด
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
            # เพิ่มข้อมูลพื้นฐาน
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
                
                # AI Settings
                "ai_prompt": data.get("ai_prompt", "คุณเป็นผู้ช่วยที่เป็นมิตรและให้ความช่วยเหลือ"),
                
                # Feature Toggles
                "ai_enabled": data.get("ai_enabled", False),
                "slip_enabled": data.get("slip_enabled", False),
                "thunder_enabled": data.get("thunder_enabled", True),
                "kbank_enabled": data.get("kbank_enabled", False),
                
                # System Messages
                "ai_disabled_message": data.get("ai_disabled_message", "ขออภัย ระบบ AI ถูกปิดการใช้งานชั่วคราว"),
                "slip_disabled_message": data.get("slip_disabled_message", "ขออภัย ระบบตรวจสอบสลิปถูกปิดการใช้งานชั่วคราว"),
                "system_disabled_message": data.get("system_disabled_message", "ขออภัย ระบบกำลังปิดปรับปรุง กรุณาติดต่อใหม่ภายหลัง"),
                
                # Webhook Path (unique for each account)
                "webhook_path": self._generate_webhook_path(),
                
                # Status
                "status": "active",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            
            result = await self.accounts_collection.insert_one(account_data)
            account_id = str(result.inserted_id)
            
            # สร้าง indexes
            await self._ensure_indexes()
            
            logger.info(f"✅ Created LINE account: {account_id}")
            return account_id
            
        except Exception as e:
            logger.error(f"❌ Error creating account: {e}")
            raise

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

    async def update_account(self, account_id: str, updates: Dict) -> bool:
        """อัปเดตข้อมูลบัญชี"""
        try:
            updates["updated_at"] = datetime.utcnow()
            updates.pop("_id", None)  # ป้องกันการแก้ไข _id
            updates.pop("id", None)   # ป้องกันการแก้ไข id
            
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
