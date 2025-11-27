# models/slip_history.py
"""
Slip History Model - สำหรับติดตามประวัติการตรวจสอบสลิปและนับจำนวนสลิปซ้ำ
"""
import logging
from datetime import datetime
import pytz
from typing import Dict, Any, Optional
from bson import ObjectId

logger = logging.getLogger("slip_history_model")

class SlipHistory:
    """Slip History Model"""
    
    def __init__(self, db):
        self.db = db
        self.collection = db["slip_history"]
        # Create indexes
        self.collection.create_index([("account_id", 1), ("trans_ref", 1)])
        self.collection.create_index([("trans_ref", 1)])
        self.collection.create_index([("timestamp", -1)])
    
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
        """นับจำนวนครั้งที่สลิปนี้ถูกตรวจสอบ"""
        try:
            query = {"trans_ref": trans_ref}
            if account_id:
                query["account_id"] = account_id
            
            count = self.collection.count_documents(query)
            return count
        except Exception as e:
            logger.error(f"❌ Error getting duplicate count: {e}")
            return 0
    
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
