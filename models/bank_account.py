"""
Bank Account Model
จัดการบัญชีธนาคารสำหรับการตรวจสอบสลิป
"""
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List
from bson import ObjectId

logger = logging.getLogger("bank_account_model")

class BankAccount:
    """Bank Account Management"""
    
    def __init__(self, db):
        self.db = db
        self.collection = db.bank_accounts
        self._ensure_indexes()
    
    def _ensure_indexes(self):
        """Create necessary indexes"""
        try:
            self.collection.create_index("account_number")
            self.collection.create_index("owner_id")
            self.collection.create_index("line_account_id")
            logger.info("Bank Account indexes created")
        except Exception as e:
            logger.error(f"❌ Error creating bank account indexes: {e}")
    
    def create_account(
        self,
        account_name: str,
        bank_name: str,
        account_number: str,
        owner_id: str,
        line_account_id: Optional[str] = None,
        description: Optional[str] = None
    ) -> Optional[str]:
        """Create new bank account"""
        try:
            # Check if account already exists
            if self.collection.find_one({
                "account_number": account_number,
                "owner_id": owner_id
            }):
                logger.warning(f"Bank account '{account_number}' already exists for owner '{owner_id}'")
                return None
            
            account_doc = {
                "account_name": account_name,
                "bank_name": bank_name,
                "account_number": account_number,
                "owner_id": owner_id,
                "line_account_id": line_account_id,
                "description": description,
                "is_active": True,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            
            result = self.collection.insert_one(account_doc)
            logger.info(f"✅ Bank account created: {account_name}")
            return str(result.inserted_id)
            
        except Exception as e:
            logger.error(f"❌ Error creating bank account: {e}")
            return None
    
    def get_account_by_id(self, account_id: str) -> Optional[Dict[str, Any]]:
        """Get bank account by ID"""
        try:
            account = self.collection.find_one({"_id": ObjectId(account_id)})
            if account:
                account["_id"] = str(account["_id"])
            return account
        except Exception as e:
            logger.error(f"❌ Error getting bank account: {e}")
            return None
    
    def get_accounts_by_owner(self, owner_id: str) -> List[Dict[str, Any]]:
        """Get all bank accounts owned by user"""
        try:
            accounts = list(self.collection.find({
                "owner_id": owner_id,
                "is_active": True
            }))
            for account in accounts:
                account["_id"] = str(account["_id"])
            return accounts
        except Exception as e:
            logger.error(f"❌ Error getting bank accounts: {e}")
            return []
    
    def get_accounts_by_line_account(self, line_account_id: str) -> List[Dict[str, Any]]:
        """Get all bank accounts linked to a LINE account"""
        try:
            accounts = list(self.collection.find({
                "line_account_id": line_account_id,
                "is_active": True
            }))
            for account in accounts:
                account["_id"] = str(account["_id"])
            return accounts
        except Exception as e:
            logger.error(f"❌ Error getting bank accounts by LINE account: {e}")
            return []
    
    def get_all_accounts(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """Get all bank accounts"""
        try:
            query = {} if include_inactive else {"is_active": True}
            accounts = list(self.collection.find(query))
            for account in accounts:
                account["_id"] = str(account["_id"])
            return accounts
        except Exception as e:
            logger.error(f"❌ Error getting all bank accounts: {e}")
            return []
    
    def update_account(self, account_id: str, update_data: Dict[str, Any]) -> bool:
        """Update bank account"""
        try:
            update_data["updated_at"] = datetime.utcnow()
            update_data.pop("_id", None)
            
            result = self.collection.update_one(
                {"_id": ObjectId(account_id)},
                {"$set": update_data}
            )
            
            return result.modified_count > 0
            
        except Exception as e:
            logger.error(f"❌ Error updating bank account: {e}")
            return False
    
    def delete_account(self, account_id: str) -> bool:
        """Delete bank account (soft delete)"""
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
            logger.error(f"❌ Error deleting bank account: {e}")
            return False
    
    def link_to_line_account(self, account_id: str, line_account_id: str) -> bool:
        """Link bank account to LINE account"""
        try:
            result = self.collection.update_one(
                {"_id": ObjectId(account_id)},
                {
                    "$set": {
                        "line_account_id": line_account_id,
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"❌ Error linking bank account to LINE account: {e}")
            return False
    
    def unlink_from_line_account(self, account_id: str) -> bool:
        """Unlink bank account from LINE account"""
        try:
            result = self.collection.update_one(
                {"_id": ObjectId(account_id)},
                {
                    "$set": {
                        "line_account_id": None,
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"❌ Error unlinking bank account from LINE account: {e}")
            return False
