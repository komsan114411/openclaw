# models/line_account_db.py
from typing import Dict, List, Optional
from bson import ObjectId
from datetime import datetime
import logging

logger = logging.getLogger("line_account_db")

class LineAccountManager:
    def __init__(self, db):
        self.db = db

    async def create_account(self, data: Dict) -> str:
        """สร้างบัญชี LINE OA ใหม่"""
        data["created_at"] = datetime.utcnow()
        data["updated_at"] = datetime.utcnow()
        
        # ตั้งค่าเริ่มต้น
        data.setdefault("ai_enabled", False)
        data.setdefault("slip_enabled", False)
        data.setdefault("thunder_enabled", True)
        data.setdefault("kbank_enabled", False)
        
        result = await self.db.line_accounts.insert_one(data)
        logger.info(f"✅ Created LINE account: {result.inserted_id}")
        return str(result.inserted_id)

    async def list_accounts(self) -> List[Dict]:
        """แสดงรายการบัญชีทั้งหมด"""
        accounts = []
        async for doc in self.db.line_accounts.find({}).sort("created_at", -1):
            doc["id"] = str(doc["_id"])
            doc.pop("_id", None)
            accounts.append(doc)
        return accounts

    async def get_account(self, account_id: str) -> Optional[Dict]:
        """ดึงข้อมูลบัญชีตาม ID"""
        try:
            doc = await self.db.line_accounts.find_one({"_id": ObjectId(account_id)})
            if doc:
                doc["id"] = str(doc["_id"])
                doc.pop("_id", None)
                return doc
            return None
        except Exception as e:
            logger.error(f"Error getting account {account_id}: {e}")
            return None

    async def get_account_by_webhook_path(self, webhook_path: str) -> Optional[Dict]:
        """ดึงข้อมูลบัญชีจาก webhook path"""
        doc = await self.db.line_accounts.find_one({"webhook_path": webhook_path})
        if doc:
            doc["id"] = str(doc["_id"])
            doc.pop("_id", None)
            return doc
        return None

    async def update_account(self, account_id: str, updates: Dict) -> bool:
        """อัปเดตข้อมูลบัญชี"""
        updates["updated_at"] = datetime.utcnow()
        updates.pop("_id", None)  # ป้องกันการแก้ไข _id
        
        result = await self.db.line_accounts.update_one(
            {"_id": ObjectId(account_id)}, 
            {"$set": updates}
        )
        return result.modified_count > 0

    async def delete_account(self, account_id: str) -> bool:
        """ลบบัญชี"""
        result = await self.db.line_accounts.delete_one({"_id": ObjectId(account_id)})
        return result.deleted_count > 0

    async def create_indexes(self):
        """สร้าง indexes สำหรับ performance"""
        await self.db.line_accounts.create_index([("webhook_path", 1)], unique=True)
        await self.db.line_accounts.create_index([("display_name", 1)])
        await self.db.line_accounts.create_index([("created_at", -1)])
