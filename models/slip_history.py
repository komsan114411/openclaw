# models/slip_history.py
"""
Slip History Model - สำหรับติดตามประวัติการตรวจสอบสลิปและนับจำนวนสลิปซ้ำ

การตรวจสอบซ้ำแบบ per-LINE-user:
- LINE user 1 ส่งสลิป A → ไม่ซ้ำ (ครั้งแรกของ user 1)
- LINE user 2 ส่งสลิปใบเดียวกัน → ไม่ซ้ำ (ครั้งแรกของ user 2)
- LINE user 1 ส่งสลิป A อีกครั้ง → ซ้ำ! (user 1 ส่งซ้ำ)
"""
import logging
from datetime import datetime
import pytz
from typing import Dict, Any, Optional, List
from bson import ObjectId

logger = logging.getLogger("slip_history_model")

class SlipHistory:
    """Slip History Model"""
    
    def __init__(self, db):
        self.db = db
        self.collection = db["slip_history"]
        # Create indexes for efficient querying
        self._ensure_indexes()
    
    def _ensure_indexes(self):
        """Create indexes for efficient duplicate checking"""
        try:
            # Index for per-user duplicate check (account + user + trans_ref)
            self.collection.create_index([
                ("account_id", 1), 
                ("user_id", 1), 
                ("trans_ref", 1)
            ], name="account_user_trans_ref_idx")
            
            # Index for per-account duplicate check (legacy)
            self.collection.create_index([
                ("account_id", 1), 
                ("trans_ref", 1)
            ], name="account_trans_ref_idx")
            
            # Index for global duplicate check
            self.collection.create_index([("trans_ref", 1)], name="trans_ref_idx")
            
            # Index for timestamp queries
            self.collection.create_index([("timestamp", -1)], name="timestamp_idx")
            
            logger.info("✅ Slip history indexes created/verified")
        except Exception as e:
            logger.warning(f"Index creation warning: {e}")
    
    def record_slip(
        self,
        account_id: str,
        user_id: str,
        trans_ref: str,
        amount: float,
        status: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Optional[str]:
        """บันทึกประวัติการตรวจสอบสลิป"""
        try:
            bangkok_tz = pytz.timezone('Asia/Bangkok')
            now = datetime.now(bangkok_tz)
            
            doc = {
                "account_id": account_id,
                "user_id": user_id,
                "trans_ref": trans_ref,
                "amount": amount,
                "status": status,  # success, duplicate, error
                "timestamp": now,
                "metadata": metadata or {},
                "created_at": now
            }
            
            result = self.collection.insert_one(doc)
            logger.info(f"✅ Slip history recorded: {result.inserted_id}")
            return str(result.inserted_id)
        except Exception as e:
            logger.error(f"❌ Error recording slip history: {e}")
            return None
    
    def get_duplicate_count(self, trans_ref: str, account_id: Optional[str] = None) -> int:
        """นับจำนวนครั้งที่สลิปนี้ถูกตรวจสอบ (per-account)"""
        try:
            query = {"trans_ref": trans_ref}
            if account_id:
                query["account_id"] = account_id
            
            count = self.collection.count_documents(query)
            return count
        except Exception as e:
            logger.error(f"❌ Error getting duplicate count: {e}")
            return 0
    
    def get_user_duplicate_count(self, trans_ref: str, account_id: str, user_id: str) -> int:
        """
        นับจำนวนครั้งที่ LINE user นี้ส่งสลิปใบเดียวกันมา (per-user)
        
        ตัวอย่าง:
        - LINE user A ส่งสลิป X → return 0 (ไม่ซ้ำ)
        - LINE user B ส่งสลิป X → return 0 (ไม่ซ้ำ เพราะคนละ user)
        - LINE user A ส่งสลิป X อีก → return 1 (ซ้ำ! user A ส่งมาแล้ว 1 ครั้ง)
        """
        try:
            query = {
                "trans_ref": trans_ref,
                "account_id": account_id,
                "user_id": user_id
            }
            count = self.collection.count_documents(query)
            logger.info(f"📊 User duplicate check: trans_ref={trans_ref}, user={user_id}, count={count}")
            return count
        except Exception as e:
            logger.error(f"❌ Error getting user duplicate count: {e}")
            return 0
    
    def is_duplicate_for_user(self, trans_ref: str, account_id: str, user_id: str) -> Dict[str, Any]:
        """
        ตรวจสอบว่าสลิปนี้ซ้ำสำหรับ LINE user นี้หรือไม่
        
        Returns:
            {
                "is_duplicate": bool,
                "user_count": int,  # จำนวนครั้งที่ user นี้ส่ง
                "total_account_count": int,  # จำนวนครั้งทั้งหมดในร้าน
                "first_used_by": str,  # user_id ที่ใช้คนแรก (ถ้ามี)
                "first_used_at": datetime  # เวลาที่ใช้ครั้งแรก
            }
        """
        try:
            # Count for this specific user
            user_count = self.get_user_duplicate_count(trans_ref, account_id, user_id)
            
            # Count total in account
            total_count = self.get_duplicate_count(trans_ref, account_id)
            
            # Get first usage info
            first_usage = self.collection.find_one(
                {"trans_ref": trans_ref, "account_id": account_id},
                sort=[("timestamp", 1)]
            )
            
            return {
                "is_duplicate": user_count > 0,  # ซ้ำถ้า user นี้เคยส่งมาแล้ว
                "user_count": user_count,
                "total_account_count": total_count,
                "first_used_by": first_usage.get("user_id") if first_usage else None,
                "first_used_at": first_usage.get("timestamp") if first_usage else None
            }
        except Exception as e:
            logger.error(f"❌ Error checking user duplicate: {e}")
            return {
                "is_duplicate": False,
                "user_count": 0,
                "total_account_count": 0,
                "first_used_by": None,
                "first_used_at": None
            }
    
    def get_slip_usage_info(self, trans_ref: str, account_id: str) -> List[Dict[str, Any]]:
        """
        ดึงข้อมูลการใช้งานสลิปทั้งหมดในร้านค้านี้
        (สำหรับแสดงว่าใครเคยใช้สลิปนี้บ้าง)
        """
        try:
            usages = list(
                self.collection.find(
                    {"trans_ref": trans_ref, "account_id": account_id}
                ).sort("timestamp", 1)
            )
            
            for usage in usages:
                usage["_id"] = str(usage["_id"])
                if usage.get("timestamp"):
                    usage["timestamp"] = usage["timestamp"].isoformat()
            
            return usages
        except Exception as e:
            logger.error(f"❌ Error getting slip usage info: {e}")
            return []
    
    def get_slip_history(
        self,
        account_id: str,
        limit: int = 50,
        skip: int = 0
    ) -> list:
        """ดึงประวัติการตรวจสอบสลิป"""
        try:
            slips = list(
                self.collection.find({"account_id": account_id})
                .sort("timestamp", -1)
                .skip(skip)
                .limit(limit)
            )
            
            # Convert ObjectId to string
            for slip in slips:
                slip["_id"] = str(slip["_id"])
                slip["timestamp"] = slip["timestamp"].isoformat()
            
            return slips
        except Exception as e:
            logger.error(f"❌ Error getting slip history: {e}")
            return []
