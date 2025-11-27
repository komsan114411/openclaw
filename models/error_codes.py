"""
Error Codes and Response Messages Model
จัดการ Error Codes และข้อความตอบกลับต่างๆ
"""
from datetime import datetime
from typing import Optional, Dict, Any, List
from bson import ObjectId

class ErrorCode:
    """Error Code Management"""
    
    # Error Code Definitions
    ERROR_CODES = {
        "404": {
            "code": "404",
            "name": "ไม่พบข้อมูล",
            "description": "ไม่พบข้อมูลที่ต้องการ เช่น API Key หมดอายุ หรือแพ็คเกจหมดอายุ",
            "default_message": "ขออภัย ไม่พบข้อมูลที่ต้องการ กรุณาติดต่อผู้ดูแลระบบ [404]",
            "reasons": [
                "API Key หมดอายุ",
                "แพ็คเกจหมดอายุ",
                "ไม่พบข้อมูลในระบบ"
            ]
        },
        "405": {
            "code": "405",
            "name": "เกินจำนวนที่กำหนด",
            "description": "เกินจำนวนการใช้งานที่กำหนด เช่น เกิน quota หรือ rate limit",
            "default_message": "ขออภัย คุณใช้งานเกินจำนวนที่กำหนด กรุณารอสักครู่หรือติดต่อผู้ดูแลระบบ [405]",
            "reasons": [
                "เกิน API Quota",
                "เกิน Rate Limit",
                "เกินจำนวนข้อความต่อวัน"
            ]
        },
        "409": {
            "code": "409",
            "name": "ข้อมูลซ้ำซ้อน",
            "description": "มีข้อมูลซ้ำซ้อนในระบบ",
            "default_message": "ขออภัย พบข้อมูลซ้ำซ้อนในระบบ [409]",
            "reasons": [
                "ข้อมูลซ้ำ",
                "มีการทำรายการซ้ำ"
            ]
        },
        "500": {
            "code": "500",
            "name": "ระบบขัดข้อง",
            "description": "เกิดข้อผิดพลาดภายในระบบ",
            "default_message": "ขออภัย ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง [500]",
            "reasons": [
                "ระบบขัดข้อง",
                "เกิดข้อผิดพลาดที่ไม่คาดคิด"
            ]
        },
        "503": {
            "code": "503",
            "name": "ระบบปิดปรับปรุง",
            "description": "ระบบปิดปรับปรุงชั่วคราว",
            "default_message": "ขออภัย ระบบปิดปรับปรุงชั่วคราว กรุณาลองใหม่ภายหลัง [503]",
            "reasons": [
                "ระบบปิดปรับปรุง",
                "บำรุงรักษาระบบ"
            ]
        }
    }
    
    def __init__(self, db):
        self.db = db
        self.collection = db.error_codes
        self._ensure_indexes()
    
    def _ensure_indexes(self):
        """สร้าง indexes"""
        self.collection.create_index("account_id")
        self.collection.create_index("error_code")
    
    def get_error_code_info(self, code: str) -> Optional[Dict[str, Any]]:
        """ดูข้อมูล Error Code"""
        return self.ERROR_CODES.get(code)
    
    def get_all_error_codes(self) -> List[Dict[str, Any]]:
        """ดู Error Codes ทั้งหมด"""
        return list(self.ERROR_CODES.values())
    
    def set_custom_message(self, account_id: str, error_code: str, message: str, reason: Optional[str] = None) -> bool:
        """ตั้งค่าข้อความ Error แบบกำหนดเอง"""
        try:
            data = {
                "account_id": account_id,
                "error_code": error_code,
                "custom_message": message,
                "reason": reason,
                "updated_at": datetime.utcnow()
            }
            
            self.collection.update_one(
                {"account_id": account_id, "error_code": error_code},
                {"$set": data},
                upsert=True
            )
            return True
        except Exception as e:
            print(f"Error setting custom message: {e}")
            return False
    
    def get_custom_message(self, account_id: str, error_code: str) -> Optional[str]:
        """ดูข้อความ Error แบบกำหนดเอง"""
        doc = self.collection.find_one({
            "account_id": account_id,
            "error_code": error_code
        })
        return doc.get("custom_message") if doc else None
    
    def get_message(self, account_id: str, error_code: str) -> str:
        """ดูข้อความ Error (custom หรือ default)"""
        custom = self.get_custom_message(account_id, error_code)
        if custom:
            return custom
        
        error_info = self.get_error_code_info(error_code)
        if error_info:
            return error_info["default_message"]
        
        return f"เกิดข้อผิดพลาด [{error_code}]"


class ResponseMessage:
    """Response Message Management"""
    
    def __init__(self, db):
        self.db = db
        self.collection = db.response_messages
        self._ensure_indexes()
    
    def _ensure_indexes(self):
        """สร้าง indexes"""
        self.collection.create_index("account_id")
        self.collection.create_index("message_type")
    
    def set_message(self, account_id: str, message_type: str, message: str, enabled: bool = True) -> bool:
        """ตั้งค่าข้อความตอบกลับ
        
        message_type:
        - system_closed: ระบบปิด
        - welcome: ข้อความต้อนรับ
        - fallback: ข้อความเมื่อไม่เข้าใจ
        - no_reply: ไม่ตอบกลับ (ใส่ "0" หรือ "")
        """
        try:
            data = {
                "account_id": account_id,
                "message_type": message_type,
                "message": message,
                "enabled": enabled,
                "updated_at": datetime.utcnow()
            }
            
            self.collection.update_one(
                {"account_id": account_id, "message_type": message_type},
                {"$set": data},
                upsert=True
            )
            return True
        except Exception as e:
            print(f"Error setting message: {e}")
            return False
    
    def get_message(self, account_id: str, message_type: str) -> Optional[Dict[str, Any]]:
        """ดูข้อความตอบกลับ"""
        return self.collection.find_one({
            "account_id": account_id,
            "message_type": message_type
        })
    
    def should_reply(self, account_id: str, message_type: str) -> bool:
        """ตรวจสอบว่าควรตอบกลับหรือไม่"""
        msg = self.get_message(account_id, message_type)
        if not msg:
            return True
        
        if not msg.get("enabled", True):
            return False
        
        message = msg.get("message", "")
        # ถ้าใส่ "0" หรือ "" = ไม่ตอบกลับ
        if message == "0" or message == "":
            return False
        
        return True
    
    def get_reply_text(self, account_id: str, message_type: str, default: str = "") -> str:
        """ดูข้อความที่จะตอบกลับ"""
        msg = self.get_message(account_id, message_type)
        if not msg:
            return default
        
        if not msg.get("enabled", True):
            return ""
        
        message = msg.get("message", "")
        if message == "0" or message == "":
            return ""
        
        return message
    
    def get_all_messages(self, account_id: str) -> List[Dict[str, Any]]:
        """ดูข้อความตอบกลับทั้งหมดของบัญชี"""
        return list(self.collection.find({"account_id": account_id}))

