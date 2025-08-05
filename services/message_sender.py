# services/message_sender.py
import logging
import httpx
from datetime import datetime
from typing import Dict, Any, List, Optional
from models.postgres_models import db_manager, UserModel, ChatHistoryModel

logger = logging.getLogger("message_sender")

class MessageSender:
    def __init__(self):
        self.line_token = None
    
    def set_line_token(self, token: str):
        """ตั้งค่า LINE access token"""
        self.line_token = token
    
    async def send_message_to_user(self, user_id: str, message: str, message_type: str = "text") -> Dict[str, Any]:
        """ส่งข้อความไปหาผู้ใช้"""
        if not self.line_token:
            return {"status": "error", "message": "LINE token not configured"}
        
        try:
            url = "https://api.line.me/v2/bot/message/push"
            headers = {
                "Authorization": f"Bearer {self.line_token}",
                "Content-Type": "application/json"
            }
            
            payload = {
                "to": user_id,
                "messages": [{"type": message_type, "text": message}]
            }
            
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(url, headers=headers, json=payload)
                
                if response.status_code == 200:
                    # บันทึกประวัติการส่งข้อความ
                    await self._save_outgoing_message(user_id, message, message_type, "admin")
                    
                    logger.info(f"✅ Message sent to {user_id}")
                    return {"status": "success", "message": "ส่งข้อความสำเร็จ"}
                else:
                    logger.error(f"❌ LINE API error: {response.status_code} - {response.text}")
                    return {"status": "error", "message": f"LINE API Error: {response.status_code}"}
        
        except Exception as e:
            logger.error(f"❌ Error sending message: {e}")
            return {"status": "error", "message": str(e)}
    
    async def broadcast_message(self, user_ids: List[str], message: str, message_type: str = "text") -> Dict[str, Any]:
        """ส่งข้อความแบบ broadcast ไปหลายคน"""
        if not self.line_token:
            return {"status": "error", "message": "LINE token not configured"}
        
        if len(user_ids) > 500:  # LINE API limit
            return {"status": "error", "message": "Cannot send to more than 500 users at once"}
        
        try:
            url = "https://api.line.me/v2/bot/message/multicast"
            headers = {
                "Authorization": f"Bearer {self.line_token}",
                "Content-Type": "application/json"
            }
            
            payload = {
                "to": user_ids,
                "messages": [{"type": message_type, "text": message}]
            }
            
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(url, headers=headers, json=payload)
                
                if response.status_code == 200:
                    # บันทึกประวัติการส่งข้อความสำหรับทุกคน
                    for user_id in user_ids:
                        await self._save_outgoing_message(user_id, message, message_type, "admin_broadcast")
                    
                    logger.info(f"✅ Broadcast sent to {len(user_ids)} users")
                    return {"status": "success", "message": f"ส่งข้อความไปยัง {len(user_ids)} คนสำเร็จ"}
                else:
                    logger.error(f"❌ LINE API error: {response.status_code} - {response.text}")
                    return {"status": "error", "message": f"LINE API Error: {response.status_code}"}
        
        except Exception as e:
            logger.error(f"❌ Error broadcasting message: {e}")
            return {"status": "error", "message": str(e)}
    
    async def _save_outgoing_message(self, user_id: str, message: str, message_type: str, sender: str):
        """บันทึกข้อความที่ส่งออก"""
        try:
            db = db_manager.get_session()
            
            chat_record = ChatHistoryModel(
                user_id=user_id,
                direction="out",
                message_type=message_type,
                message_text=message,
                sender=sender,
                read_status=True  # ข้อความที่เราส่งถือว่าอ่านแล้ว
            )
            
            db.add(chat_record)
            db.commit()
            db.close()
            
        except Exception as e:
            logger.error(f"❌ Error saving outgoing message: {e}")
            if 'db' in locals():
                db.rollback()
                db.close()

# สร้าง instance
message_sender = MessageSender()
