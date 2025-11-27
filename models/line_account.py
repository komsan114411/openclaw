"""
LINE Official Account Model
"""
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List
from bson import ObjectId
from utils.security import get_secure_storage

logger = logging.getLogger("line_account_model")

class LineAccount:
    """LINE Official Account Management"""
    
    def __init__(self, db):
        self.db = db
        self.collection = db.line_accounts
        self.secure_storage = get_secure_storage()
        self._ensure_indexes()
    
    def _ensure_indexes(self):
        """Create necessary indexes"""
        try:
            self.collection.create_index("account_name", unique=True)
            self.collection.create_index("channel_id", unique=True)
            self.collection.create_index("owner_id")
            logger.info("LINE Account indexes created")
        except Exception as e:
            logger.error(f"❌ Error creating LINE account indexes: {e}")
            
    def _encrypt_sensitive_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Encrypt sensitive fields in data dict"""
        sensitive_fields = ["channel_secret", "channel_access_token"]
        settings_sensitive = ["ai_api_key", "slip_api_key"]
        
        # Encrypt top-level fields
        for field in sensitive_fields:
            if field in data and data[field]:
                data[field] = self.secure_storage.encrypt(data[field])
                
        # Encrypt settings fields
        if "settings" in data and isinstance(data["settings"], dict):
            for field in settings_sensitive:
                if field in data["settings"] and data["settings"][field]:
                    data["settings"][field] = self.secure_storage.encrypt(data["settings"][field])
                    
        return data

    def _decrypt_sensitive_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Decrypt sensitive fields in data dict"""
        if not data:
            return data
            
        sensitive_fields = ["channel_secret", "channel_access_token"]
        settings_sensitive = ["ai_api_key", "slip_api_key"]
        
        # Decrypt top-level fields
        for field in sensitive_fields:
            if field in data and data[field]:
                try:
                    data[field] = self.secure_storage.decrypt(data[field])
                except Exception:
                    # If decryption fails, assume it's legacy plain text
                    pass
                
        # Decrypt settings fields
        if "settings" in data and isinstance(data["settings"], dict):
            for field in settings_sensitive:
                if field in data["settings"] and data["settings"][field]:
                    try:
                        data["settings"][field] = self.secure_storage.decrypt(data["settings"][field])
                    except Exception:
                        pass
                    
        return data
    
    def create_account(
        self,
        account_name: str,
        channel_id: str,
        channel_secret: str,
        channel_access_token: str,
        owner_id: str,
        description: Optional[str] = None,
        settings: Optional[Dict[str, Any]] = None
    ) -> Optional[str]:
        """Create new LINE account"""
        try:
            # Check if account already exists
            if self.collection.find_one({"channel_id": channel_id}):
                logger.warning(f"LINE account with channel_id '{channel_id}' already exists")
                return None
            
            # Encrypt sensitive data
            encrypted_secret = self.secure_storage.encrypt(channel_secret)
            encrypted_token = self.secure_storage.encrypt(channel_access_token)
            
            # Prepare settings
            default_settings = {
                # Bot Control Settings
                "bot_enabled": True,
                
                # AI Chat Settings
                "ai_enabled": False,
                "ai_response_mode": "immediate",
                "ai_immediate_message": "กำลังประมวลผล กรุณารอสักครู่...",
                "ai_custom_response": "",
                "ai_api_key": None,
                "ai_model": "gpt-4-mini",
                "ai_system_prompt": "คุณเป็นผู้ช่วยที่เป็นมิตรและให้ข้อมูลที่เป็นประโยชน์",
                "ai_temperature": 0.7,
                "ai_fallback_message": "ขอบคุณสำหรับข้อความของคุณ",
                
                # Slip Verification Settings
                "slip_verification_enabled": True,
                "slip_response_mode": "immediate",
                "slip_immediate_message": "ขอบคุณสำหรับสลิป กำลังตรวจสอบ...",
                "slip_api_provider": "thunder",
                "slip_api_key": None,
                "slip_template_id": None,
                
                # General Settings
                "auto_reply_enabled": True,
                "webhook_enabled": True
            }
            
            final_settings = settings or default_settings
            
            # Encrypt settings if provided
            if settings:
                if settings.get("ai_api_key"):
                    final_settings["ai_api_key"] = self.secure_storage.encrypt(settings["ai_api_key"])
                if settings.get("slip_api_key"):
                    final_settings["slip_api_key"] = self.secure_storage.encrypt(settings["slip_api_key"])
            
            account_doc = {
                "account_name": account_name,
                "channel_id": channel_id,
                "channel_secret": encrypted_secret,
                "channel_access_token": encrypted_token,
                "owner_id": owner_id,
                "description": description,
                "settings": final_settings,
                "is_active": True,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "last_webhook_received": None,
                "statistics": {
                    "total_messages": 0,
                    "total_users": 0,
                    "total_slips_verified": 0
                }
            }
            
            result = self.collection.insert_one(account_doc)
            logger.info(f"✅ LINE account created: {account_name}")
            return str(result.inserted_id)
            
        except Exception as e:
            logger.error(f"❌ Error creating LINE account: {e}")
            return None
    
    def get_account_by_id(self, account_id: str) -> Optional[Dict[str, Any]]:
        """Get LINE account by ID"""
        try:
            account = self.collection.find_one({"_id": ObjectId(account_id)})
            if account:
                account["_id"] = str(account["_id"])
                return self._decrypt_sensitive_data(account)
            return None
        except Exception as e:
            logger.error(f"❌ Error getting LINE account: {e}")
            return None
    
    def get_account_by_channel_id(self, channel_id: str) -> Optional[Dict[str, Any]]:
        """Get LINE account by channel ID"""
        try:
            account = self.collection.find_one({"channel_id": channel_id})
            if account:
                account["_id"] = str(account["_id"])
                return self._decrypt_sensitive_data(account)
            return None
        except Exception as e:
            logger.error(f"❌ Error getting LINE account: {e}")
            return None
    
    def get_accounts_by_owner(self, owner_id: str) -> List[Dict[str, Any]]:
        """Get all LINE accounts owned by user"""
        try:
            accounts = list(self.collection.find({"owner_id": owner_id, "is_active": True}))
            decrypted_accounts = []
            for account in accounts:
                account["_id"] = str(account["_id"])
                decrypted_accounts.append(self._decrypt_sensitive_data(account))
            return decrypted_accounts
        except Exception as e:
            logger.error(f"❌ Error getting LINE accounts: {e}")
            return []
    
    def get_all_accounts(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """Get all LINE accounts"""
        try:
            query = {} if include_inactive else {"is_active": True}
            accounts = list(self.collection.find(query))
            decrypted_accounts = []
            for account in accounts:
                account["_id"] = str(account["_id"])
                decrypted_accounts.append(self._decrypt_sensitive_data(account))
            return decrypted_accounts
        except Exception as e:
            logger.error(f"❌ Error getting all LINE accounts: {e}")
            return []
    
    def update_account(self, account_id: str, update_data: Dict[str, Any]) -> bool:
        """Update LINE account"""
        try:
            update_data["updated_at"] = datetime.utcnow()
            update_data.pop("_id", None)
            
            # Encrypt sensitive fields if present
            update_data = self._encrypt_sensitive_data(update_data)
            
            result = self.collection.update_one(
                {"_id": ObjectId(account_id)},
                {"$set": update_data}
            )
            
            return result.modified_count > 0
            
        except Exception as e:
            logger.error(f"❌ Error updating LINE account: {e}")
            return False
    
    def update_settings(self, account_id: str, settings: Dict[str, Any]) -> bool:
        """Update LINE account settings"""
        try:
            # Encrypt sensitive settings
            if "ai_api_key" in settings and settings["ai_api_key"]:
                settings["ai_api_key"] = self.secure_storage.encrypt(settings["ai_api_key"])
            if "slip_api_key" in settings and settings["slip_api_key"]:
                settings["slip_api_key"] = self.secure_storage.encrypt(settings["slip_api_key"])
                
            result = self.collection.update_one(
                {"_id": ObjectId(account_id)},
                {
                    "$set": {
                        "settings": settings,
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"❌ Error updating LINE account settings: {e}")
            return False
    
    def delete_account(self, account_id: str) -> bool:
        """Delete LINE account (soft delete)"""
        try:
            result = self.collection.update_one(
                {"_id": ObjectId(account_id)},
                {
                    "$set": {
                        "is_active": False,
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"❌ Error deleting LINE account: {e}")
            return False
    
    def update_webhook_timestamp(self, account_id: str) -> bool:
        """Update last webhook received timestamp"""
        try:
            result = self.collection.update_one(
                {"_id": ObjectId(account_id)},
                {"$set": {"last_webhook_received": datetime.utcnow()}}
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"❌ Error updating webhook timestamp: {e}")
            return False
    
    def increment_statistics(
        self,
        account_id: str,
        field: str,
        increment: int = 1
    ) -> bool:
        """Increment statistics counter"""
        try:
            result = self.collection.update_one(
                {"_id": ObjectId(account_id)},
                {"$inc": {f"statistics.{field}": increment}}
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"❌ Error incrementing statistics: {e}")
            return False

    def increment_message_count(self, account_id: str) -> bool:
        """Increment total messages count"""
        return self.increment_statistics(account_id, "total_messages")
    
    def increment_user_count(self, account_id: str) -> bool:
        """Increment total users count"""
        return self.increment_statistics(account_id, "total_users")
    
    def increment_slip_count(self, account_id: str) -> bool:
        """Increment total slips verified count"""
        return self.increment_statistics(account_id, "total_slips_verified")
