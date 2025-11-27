"""
Slip Verification Utilities
Fixes Bug #8: Race condition prevention with unique index
Fixes Bug #11: Improved quota flow
"""
import logging
from datetime import datetime
from typing import Dict, Any, Optional
from bson import ObjectId

logger = logging.getLogger("slip_utils")

class SlipVerificationManager:
    """Manage slip verification with race condition prevention"""
    
    def __init__(self, db):
        self.db = db
        self.slip_history = db.slip_history
        self._ensure_unique_index()
    
    def _ensure_unique_index(self):
        """
        Create unique index to prevent duplicate slip entries
        Bug #8 Fix: Prevents race conditions
        """
        try:
            # Create unique compound index on account_id + trans_ref
            self.slip_history.create_index(
                [("account_id", 1), ("trans_ref", 1)],
                unique=True,
                name="unique_slip_per_account"
            )
            logger.info("✅ Unique slip index ensured")
        except Exception as e:
            logger.warning(f"⚠️ Could not create unique index (may already exist): {e}")
    
    def record_slip_atomic(
        self,
        account_id: str,
        user_id: str,
        trans_ref: str,
        amount: float,
        status: str,
        metadata: Optional[Dict] = None
    ) -> Tuple[bool, str]:
        """
        Record slip using atomic upsert to prevent race conditions
        
        Returns:
            (is_new, message)
        """
        try:
            # Use upsert with $setOnInsert to handle race conditions
            result = self.slip_history.update_one(
                {
                    "account_id": account_id,
                    "trans_ref": trans_ref
                },
                {
                    "$setOnInsert": {
                        "account_id": account_id,
                        "user_id": user_id,
                        "trans_ref": trans_ref,
                        "amount": amount,
                        "status": status,
                        "metadata": metadata or {},
                        "created_at": datetime.utcnow(),
                        "is_duplicate": False,
                        "verification_count": 1
                    },
                    "$inc": {
                        "verification_count": 1  # Increment on every attempt
                    }
                },
                upsert=True
            )
            
            if result.upserted_id:
                # New slip
                logger.info(f"✅ New slip recorded: {trans_ref}")
                return True, "new_slip"
            else:
                # Duplicate slip
                # Mark as duplicate
                self.slip_history.update_one(
                    {"account_id": account_id, "trans_ref": trans_ref},
                    {"$set": {"is_duplicate": True}}
                )
                
                # Get verification count
                slip = self.slip_history.find_one(
                    {"account_id": account_id, "trans_ref": trans_ref}
                )
                count = slip.get("verification_count", 1) - 1  # -1 because we just incremented
                
                logger.warning(f"⚠️ Duplicate slip detected: {trans_ref} (count: {count})")
                return False, f"duplicate_slip_count_{count}"
                
        except Exception as e:
            logger.error(f"❌ Error recording slip: {e}")
            return False, "error"

class QuotaManager:
    """
    Manage slip verification quota with reserve/confirm pattern
    Bug #11 Fix: Prevents quota loss on failed verifications
    """
    
    def __init__(self, subscription_model):
        self.subscription_model = subscription_model
    
    def reserve_quota(self, user_id: str) -> Optional[str]:
        """
        Reserve a quota slot without committing
        
        Returns:
            reservation_id or None if no quota available
        """
        try:
            # Check if quota available
            quota_status = self.subscription_model.check_quota(user_id)
            
            if quota_status.get("remaining_slips", 0) <= 0:
                logger.warning(f"⚠️ No quota available for user {user_id}")
                return None
            
            # Create reservation (temporary deduction)
            import secrets
            reservation_id = secrets.token_hex(16)
            
            # Deduct quota temporarily
            success = self.subscription_model.use_slip_quota(user_id)
            
            if success:
                logger.info(f"✅ Reserved quota for user {user_id} (reservation: {reservation_id})")
                return reservation_id
            else:
                return None
                
        except Exception as e:
            logger.error(f"❌ Error reserving quota: {e}")
            return None
    
    def confirm_quota(self, user_id: str, reservation_id: str):
        """Confirm quota usage (already deducted in reserve)"""
        logger.info(f"✅ Confirmed quota usage for {user_id} (reservation: {reservation_id})")
        # Quota already deducted, just log
    
    def rollback_quota(self, user_id: str, reservation_id: str):
        """
        Rollback quota reservation (refund)
        
        Bug #11 Fix: Refund quota if verification fails
        """
        try:
            # Refund the quota
            success = self.subscription_model.refund_slip_quota(user_id)
            
            if success:
                logger.info(f"🔄 Rolled back quota for user {user_id} (reservation: {reservation_id})")
            else:
                logger.error(f"❌ Failed to rollback quota for {user_id}")
                
        except Exception as e:
            logger.error(f"❌ Error rolling back quota: {e}")
