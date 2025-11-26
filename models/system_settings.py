"""System Settings model for centralized configuration"""
from datetime import datetime
from typing import Optional, Dict, Any, List
from bson import ObjectId
import json


class SystemSettingsModel:
    def __init__(self, db):
        self.db = db
        self.collection = db.system_settings
        
        # Initialize default settings if not exists
        self._initialize_defaults()
    
    def _initialize_defaults(self):
        """Create default settings document if it doesn't exist"""
        if self.collection.count_documents({}) == 0:
            default_settings = {
                # Slip API Configuration
                "slip_api_provider": "thunder",  # thunder, kbank, or both
                "slip_api_key": "",
                "slip_api_key_secondary": "",  # สำหรับ fallback
                "slip_api_provider_secondary": "",  # kbank หรือ thunder (ถ้าใช้ทั้งสอง)
                "slip_api_fallback_enabled": False,  # เปิดใช้ fallback หรือไม่
                "slip_api_quota_warning": True,  # แจ้งเตือนเมื่อหมดโควต้า
                
                # AI Configuration
                "ai_api_key": "",
                "ai_model": "gpt-4-mini",
                "ai_system_prompt": "คุณเป็นผู้ช่วยที่เป็นมิตรและให้ข้อมูลที่เป็นประโยชน์",
                "ai_temperature": 0.7,
                
                # Payment Bank Accounts (for slip verification)
                "payment_bank_accounts": [
                    # Example: {"bank_code": "004", "bank_name": "KBANK", "account_no": "1234567890", "account_name": "บริษัท ABC"}
                ],
                
                # USDT Wallet Configuration
                "usdt_wallet_address": "",
                "usdt_network": "TRC20",  # TRC20, ERC20, etc.
                "usdt_qr_image": "",  # Base64 or URL of QR code image
                
                # Quota Exceeded Response Template
                "quota_exceeded_response_type": "text",  # "text" or "flex"
                "quota_exceeded_message": "❌ โควต้าของคุณหมดแล้ว\n\nกรุณาติดต่อผู้ดูแลระบบเพื่ออัปเกรดแพ็คเกจ",
                "quota_exceeded_flex_title": "โควต้าหมด",
                "quota_exceeded_flex_body": "โควต้าการตรวจสอบสลิปของคุณหมดแล้ว กรุณาอัปเกรดแพ็คเกจเพื่อใช้งานต่อ",
                "quota_exceeded_flex_button_text": "อัปเกรดแพ็คเกจ",
                "quota_exceeded_flex_button_url": "",
                "quota_exceeded_flex_image_url": "",
                
                # Quota Warning Thresholds
                "quota_warning_slip_threshold": 50,  # Warn when < 50 slips remain
                "quota_warning_days_threshold": 7,    # Warn when < 7 days remain
                
                # Expiry Messages (Admin defined)
                "message_quota_exceeded": "สลิปของคุณเต็มแล้ว กรุณาอัปเกรดแพ็คเกจ",
                "message_subscription_expired": "แพ็คเกจของคุณหมดอายุแล้ว กรุณาต่ออายุ",
                "message_near_quota": "สลิปคงเหลือน้อย กรุณาเตรียมต่ออายุ",
                "message_near_expiry": "แพ็คเกจใกล้หมดอายุ กรุณาต่ออายุ",
                
                # Contact Admin
                "contact_admin_line": "",
                "contact_admin_email": "",
                "contact_admin_url": "",
                
                # System Status
                "system_active": True,
                "maintenance_mode": False,
                "maintenance_message": "ระบบอยู่ระหว่างปรับปรุง กรุณาลองใหม่ภายหลัง",
                
                # Metadata
                "created_at": datetime.now(),
                "updated_at": datetime.now(),
                "updated_by": None
            }
            
            self.collection.insert_one(default_settings)
    
    def get_settings(self) -> Dict[str, Any]:
        """Get current system settings"""
        settings = self.collection.find_one({})
        
        if settings:
            settings["_id"] = str(settings["_id"])
        
        return settings or {}
    
    def update_settings(self, update_data: Dict[str, Any], admin_id: str) -> bool:
        """Update system settings"""
        try:
            update_data["updated_at"] = datetime.now()
            update_data["updated_by"] = admin_id
            
            result = self.collection.update_one(
                {},
                {"$set": update_data}
            )
            
            return result.modified_count > 0 or result.matched_count > 0
        except:
            return False
    
    # Convenience methods for specific settings
    
    def get_slip_api_config(self) -> Dict[str, str]:
        """Get slip API configuration"""
        settings = self.get_settings()
        return {
            "provider": settings.get("slip_api_provider", "thunder"),
            "api_key": settings.get("slip_api_key", "")
        }
    
    def get_ai_api_config(self) -> Dict[str, Any]:
        """Get AI API configuration"""
        settings = self.get_settings()
        return {
            "api_key": settings.get("ai_api_key", ""),
            "model": settings.get("ai_model", "gpt-4-mini"),
            "system_prompt": settings.get("ai_system_prompt", ""),
            "temperature": settings.get("ai_temperature", 0.7)
        }
    
    def get_payment_bank_accounts(self) -> List[Dict[str, str]]:
        """Get payment bank accounts for verification"""
        settings = self.get_settings()
        return settings.get("payment_bank_accounts", [])
    
    def add_payment_bank_account(
        self,
        bank_code: str,
        bank_name: str,
        account_no: str,
        account_name: str,
        admin_id: str
    ) -> bool:
        """Add a payment bank account"""
        settings = self.get_settings()
        accounts = settings.get("payment_bank_accounts", [])
        
        # Prevent duplicates
        if any(acc["account_no"] == account_no for acc in accounts):
            return False
        
        accounts.append({
            "bank_code": bank_code,
            "bank_name": bank_name,
            "account_no": account_no,
            "account_name": account_name
        })
        
        return self.update_settings({"payment_bank_accounts": accounts}, admin_id)
    
    def remove_payment_bank_account(self, account_no: str, admin_id: str) -> bool:
        """Remove a payment bank account"""
        settings = self.get_settings()
        accounts = settings.get("payment_bank_accounts", [])
        
        accounts = [acc for acc in accounts if acc["account_no"] != account_no]
        
        return self.update_settings({"payment_bank_accounts": accounts}, admin_id)
    
    def get_usdt_wallet_config(self) -> Dict[str, str]:
        """Get USDT wallet configuration"""
        settings = self.get_settings()
        return {
            "address": settings.get("usdt_wallet_address", ""),
            "network": settings.get("usdt_network", "TRC20")
        }
    
    def get_warning_thresholds(self) -> Dict[str, int]:
        """Get quota warning thresholds"""
        settings = self.get_settings()
        return {
            "slip_threshold": settings.get("quota_warning_slip_threshold", 50),
            "days_threshold": settings.get("quota_warning_days_threshold", 7)
        }
    
    def get_expiry_messages(self) -> Dict[str, str]:
        """Get expiry and quota messages"""
        settings = self.get_settings()
        return {
            "quota_exceeded": settings.get("message_quota_exceeded", ""),
            "subscription_expired": settings.get("message_subscription_expired", ""),
            "near_quota": settings.get("message_near_quota", ""),
            "near_expiry": settings.get("message_near_expiry", "")
        }
    
    def get_contact_info(self) -> Dict[str, str]:
        """Get admin contact information"""
        settings = self.get_settings()
        return {
            "line": settings.get("contact_admin_line", ""),
            "email": settings.get("contact_admin_email", ""),
            "url": settings.get("contact_admin_url", "")
        }
    
    def is_system_active(self) -> bool:
        """Check if system is active (not in maintenance)"""
        settings = self.get_settings()
        return settings.get("system_active", True) and not settings.get("maintenance_mode", False)
    
    def set_maintenance_mode(self, enabled: bool, message: str, admin_id: str) -> bool:
        """Enable or disable maintenance mode"""
        return self.update_settings({
            "maintenance_mode": enabled,
            "maintenance_message": message
        }, admin_id)
