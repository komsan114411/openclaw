# models/chat_message.py
"""
Chat Message Model - สำหรับบันทึกข้อความและสื่อจาก LINE
"""
import logging
from datetime import datetime
import pytz
from typing import Dict, Any, Optional, List
from bson import ObjectId

logger = logging.getLogger("chat_message_model")

class ChatMessage:
    """Chat Message Model"""
    
    def __init__(self, db):
        self.db = db
        self.collection = db["chat_messages"]
        # Create indexes
        self.collection.create_index([("account_id", 1), ("timestamp", -1)])
        self.collection.create_index([("user_id", 1), ("account_id", 1)])
        self.collection.create_index([("message_id", 1)], unique=True)
    
    def save_message(
        self,
        account_id: str,
        user_id: str,
        message_type: str,
        content: str,
        message_id: Optional[str] = None,
        media_url: Optional[str] = None,
        media_type: Optional[str] = None,
        sender: str = "user",
        metadata: Optional[Dict[str, Any]] = None
    ) -> Optional[str]:
        """บันทึกข้อความใหม่"""
        try:
            doc = {
                "account_id": account_id,
                "user_id": user_id,
                "message_type": message_type,  # text, image, video, audio, file
                "content": content,
                "message_id": message_id or f"{account_id}_{user_id}_{datetime.utcnow().timestamp()}",
                "media_url": media_url,
                "media_type": media_type,  # image/jpeg, video/mp4, etc.
                "sender": sender,  # user, bot, system
                "timestamp": datetime.now(pytz.timezone('Asia/Bangkok')),
                "metadata": metadata or {},
                "created_at": datetime.now(pytz.timezone('Asia/Bangkok'))
            }
            
            result = self.collection.insert_one(doc)
            logger.info(f"✅ Chat message saved: {result.inserted_id}")
            return str(result.inserted_id)
        except Exception as e:
            logger.error(f"❌ Error saving chat message: {e}")
            return None
    
    def get_messages(
        self,
        account_id: str,
        user_id: Optional[str] = None,
        limit: int = 50,
        skip: int = 0
    ) -> List[Dict[str, Any]]:
        """ดึงข้อความจากบัญชี LINE"""
        try:
            query = {"account_id": account_id}
            if user_id:
                query["user_id"] = user_id
            
            messages = list(
                self.collection.find(query)
                .sort("timestamp", -1)
                .skip(skip)
                .limit(limit)
            )
            
            # Convert ObjectId to string
            for msg in messages:
                msg["_id"] = str(msg["_id"])
                msg["timestamp"] = msg["timestamp"].isoformat()
            
            return messages
        except Exception as e:
            logger.error(f"❌ Error getting messages: {e}")
            return []
    
    def get_messages_by_date_range(
        self,
        account_id: str,
        start_date: datetime,
        end_date: datetime,
        user_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """ดึงข้อความในช่วงวันที่"""
        try:
            query = {
                "account_id": account_id,
                "timestamp": {
                    "$gte": start_date,
                    "$lte": end_date
                }
            }
            if user_id:
                query["user_id"] = user_id
            
            messages = list(
                self.collection.find(query)
                .sort("timestamp", 1)
            )
            
            # Convert ObjectId to string
            for msg in messages:
                msg["_id"] = str(msg["_id"])
                msg["timestamp"] = msg["timestamp"].isoformat()
            
            return messages
        except Exception as e:
            logger.error(f"❌ Error getting messages by date range: {e}")
            return []
    
    def get_conversation(
        self,
        account_id: str,
        user_id: str,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """ดึงการสนทนากับผู้ใช้คนหนึ่ง"""
        try:
            messages = list(
                self.collection.find({
                    "account_id": account_id,
                    "user_id": user_id
                })
                .sort("timestamp", 1)
                .limit(limit)
            )
            
            # Convert ObjectId to string
            for msg in messages:
                msg["_id"] = str(msg["_id"])
                msg["timestamp"] = msg["timestamp"].isoformat()
            
            return messages
        except Exception as e:
            logger.error(f"❌ Error getting conversation: {e}")
            return []
    
    def get_media_messages(
        self,
        account_id: str,
        message_type: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """ดึงข้อความที่มีสื่อ (รูป/วิดีโอ)"""
        try:
            query = {
                "account_id": account_id,
                "media_url": {"$ne": None}
            }
            if message_type:
                query["message_type"] = message_type
            
            messages = list(
                self.collection.find(query)
                .sort("timestamp", -1)
                .limit(limit)
            )
            
            # Convert ObjectId to string
            for msg in messages:
                msg["_id"] = str(msg["_id"])
                msg["timestamp"] = msg["timestamp"].isoformat()
            
            return messages
        except Exception as e:
            logger.error(f"❌ Error getting media messages: {e}")
            return []
    
    def get_message_count(
        self,
        account_id: str,
        user_id: Optional[str] = None
    ) -> int:
        """นับจำนวนข้อความ"""
        try:
            query = {"account_id": account_id}
            if user_id:
                query["user_id"] = user_id
            
            count = self.collection.count_documents(query)
            return count
        except Exception as e:
            logger.error(f"❌ Error counting messages: {e}")
            return 0
    
    def get_unique_users(
        self,
        account_id: str
    ) -> List[str]:
        """ดึงรายชื่อผู้ใช้ที่มีการสนทนา"""
        try:
            users = self.collection.distinct("user_id", {"account_id": account_id})
            return users
        except Exception as e:
            logger.error(f"❌ Error getting unique users: {e}")
            return []
    
    def delete_message(self, message_id: str) -> bool:
        """ลบข้อความ"""
        try:
            result = self.collection.delete_one({"_id": ObjectId(message_id)})
            if result.deleted_count > 0:
                logger.info(f"✅ Message deleted: {message_id}")
                return True
            else:
                logger.warning(f"⚠️ Message not found: {message_id}")
                return False
        except Exception as e:
            logger.error(f"❌ Error deleting message: {e}")
            return False
    
    def delete_messages_by_account(self, account_id: str) -> bool:
        """ลบข้อความทั้งหมดของบัญชี LINE"""
        try:
            result = self.collection.delete_many({"account_id": account_id})
            logger.info(f"✅ Deleted {result.deleted_count} messages for account {account_id}")
            return True
        except Exception as e:
            logger.error(f"❌ Error deleting messages: {e}")
            return False
    
    def get_statistics(self, account_id: str) -> Dict[str, Any]:
        """ดึงสถิติข้อความ"""
        try:
            total_messages = self.collection.count_documents({"account_id": account_id})
            total_users = len(self.collection.distinct("user_id", {"account_id": account_id}))
            
            # Count by message type
            message_types = {}
            for msg_type in ["text", "image", "video", "audio", "file"]:
                count = self.collection.count_documents({
                    "account_id": account_id,
                    "message_type": msg_type
                })
                if count > 0:
                    message_types[msg_type] = count
            
            # Count by sender
            user_messages = self.collection.count_documents({
                "account_id": account_id,
                "sender": "user"
            })
            bot_messages = self.collection.count_documents({
                "account_id": account_id,
                "sender": "bot"
            })
            
            return {
                "total_messages": total_messages,
                "total_users": total_users,
                "message_types": message_types,
                "user_messages": user_messages,
                "bot_messages": bot_messages
            }
        except Exception as e:
            logger.error(f"❌ Error getting statistics: {e}")
            return {}
