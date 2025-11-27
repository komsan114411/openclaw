# models/quota_reservation.py
"""
Quota Reservation Model - Two-Phase Commit System
ระบบจองโควต้าก่อนใช้งานจริง เพื่อความแม่นยำในการตัด/คืนเครดิต
"""
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from bson import ObjectId
import uuid

logger = logging.getLogger("quota_reservation_model")


class QuotaReservationModel:
    """
    Two-Phase Commit Quota Management
    
    Flow:
    1. reserve_quota() - จองโควต้าชั่วคราว
    2. confirm_reservation() - ยืนยันการใช้โควต้า (ตัดจริง)
    3. rollback_reservation() - ยกเลิกการจอง (คืนเครดิต)
    """
    
    # Reservation statuses
    STATUS_RESERVED = "reserved"
    STATUS_CONFIRMED = "confirmed"
    STATUS_ROLLED_BACK = "rolled_back"
    STATUS_EXPIRED = "expired"
    
    # Purposes
    PURPOSE_SLIP_VERIFICATION = "slip_verification"
    
    # Default expiry time (5 minutes)
    DEFAULT_EXPIRY_MINUTES = 5
    
    def __init__(self, db):
        self.db = db
        self.collection = db.quota_reservations
        self.subscription_collection = db.subscriptions
        self._ensure_indexes()
    
    def _ensure_indexes(self):
        """Create necessary indexes"""
        try:
            self.collection.create_index("reservation_id", unique=True)
            self.collection.create_index("user_id")
            self.collection.create_index("status")
            self.collection.create_index("expires_at")
            self.collection.create_index([("status", 1), ("expires_at", 1)])
            logger.info("✅ QuotaReservation indexes created")
        except Exception as e:
            logger.error(f"❌ Error creating indexes: {e}")
    
    def reserve_quota(
        self,
        user_id: str,
        purpose: str = PURPOSE_SLIP_VERIFICATION,
        message_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        expiry_minutes: int = DEFAULT_EXPIRY_MINUTES
    ) -> Optional[Dict[str, Any]]:
        """
        PHASE 1: Reserve quota (จองก่อน)
        
        Args:
            user_id: Owner ID of LINE account
            purpose: Purpose of reservation (e.g., slip_verification)
            message_id: LINE message ID for tracking
            metadata: Additional data (account_id, line_user_id, etc.)
            expiry_minutes: Auto-rollback after this many minutes
            
        Returns:
            { reservation_id, status, subscription_id } or None if no quota
        """
        try:
            now = datetime.utcnow()
            
            # 1. Find active subscription with available quota
            # Available = slips_quota - slips_reserved - slips_used
            subscription = self.subscription_collection.find_one({
                "user_id": user_id,
                "status": "active",
                "end_date": {"$gt": now}
            })
            
            if not subscription:
                logger.warning(f"⚠️ No active subscription for user {user_id}")
                return None
            
            # ✅ FIX: Ensure slips_reserved field exists and is not negative
            slips_quota = subscription.get("slips_quota", 0)
            slips_reserved = max(0, subscription.get("slips_reserved", 0))  # Ensure non-negative
            slips_used = max(0, subscription.get("slips_used", 0))  # Ensure non-negative
            
            # ✅ FIX: Initialize slips_reserved if missing
            if "slips_reserved" not in subscription:
                self.subscription_collection.update_one(
                    {"_id": subscription["_id"]},
                    {"$set": {"slips_reserved": 0}}
                )
                slips_reserved = 0
                logger.info(f"🔧 Initialized slips_reserved for subscription {subscription['_id']}")
            
            # ✅ FIX: Reset slips_reserved if it's negative (data corruption fix)
            if subscription.get("slips_reserved", 0) < 0:
                self.subscription_collection.update_one(
                    {"_id": subscription["_id"]},
                    {"$set": {"slips_reserved": 0}}
                )
                slips_reserved = 0
                logger.warning(f"🔧 Reset negative slips_reserved for subscription {subscription['_id']}")
            
            available = slips_quota - slips_reserved - slips_used
            
            logger.info(f"📊 Quota check for user {user_id}: quota={slips_quota}, reserved={slips_reserved}, used={slips_used}, available={available}")
            
            if available <= 0:
                logger.warning(f"⚠️ No quota available for user {user_id} (quota={slips_quota}, reserved={slips_reserved}, used={slips_used})")
                return None
            
            # 2. Generate unique reservation ID
            reservation_id = f"res_{uuid.uuid4().hex[:16]}"
            
            # 3. ✅ FIX: Simpler atomic increment with retry logic
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    # Simple increment - trust the earlier check
                    result = self.subscription_collection.update_one(
                        {
                            "_id": subscription["_id"],
                            "status": "active"
                        },
                        {
                            "$inc": {"slips_reserved": 1},
                            "$set": {"updated_at": now}
                        }
                    )
                    
                    if result.modified_count > 0:
                        break
                    
                    if attempt < max_retries - 1:
                        logger.warning(f"⚠️ Retry {attempt + 1} - reservation failed for user {user_id}")
                        import time
                        time.sleep(0.1)  # Small delay before retry
                except Exception as update_error:
                    logger.error(f"❌ Update error attempt {attempt + 1}: {update_error}")
                    if attempt == max_retries - 1:
                        raise
            
            if result.modified_count == 0:
                logger.warning(f"⚠️ Failed to reserve quota for user {user_id} after {max_retries} attempts")
                return None
            
            # 4. Create reservation document
            reservation = {
                "reservation_id": reservation_id,
                "user_id": user_id,
                "subscription_id": str(subscription["_id"]),
                "amount": 1,
                "status": self.STATUS_RESERVED,
                "purpose": purpose,
                "message_id": message_id,
                "created_at": now,
                "expires_at": now + timedelta(minutes=expiry_minutes),
                "confirmed_at": None,
                "rolled_back_at": None,
                "rollback_reason": None,
                "metadata": metadata or {}
            }
            
            self.collection.insert_one(reservation)
            
            logger.info(f"✅ Quota reserved: {reservation_id} for user {user_id} (available after: {available - 1})")
            
            return {
                "reservation_id": reservation_id,
                "status": self.STATUS_RESERVED,
                "subscription_id": str(subscription["_id"]),
                "available_after": available - 1
            }
            
        except Exception as e:
            logger.error(f"❌ Error reserving quota: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def confirm_reservation(self, reservation_id: str) -> bool:
        """
        PHASE 2a: Confirm reservation (ตัดจริง)
        Move from reserved to used
        
        Args:
            reservation_id: The reservation to confirm
            
        Returns:
            True if confirmed successfully
        """
        try:
            now = datetime.utcnow()
            
            # 1. Find reservation
            reservation = self.collection.find_one({
                "reservation_id": reservation_id,
                "status": self.STATUS_RESERVED
            })
            
            if not reservation:
                logger.warning(f"⚠️ Reservation not found or not in reserved status: {reservation_id}")
                return False
            
            # 2. Check if expired
            if reservation.get("expires_at") and reservation["expires_at"] < now:
                logger.warning(f"⚠️ Reservation expired: {reservation_id}")
                # Auto rollback expired reservation
                self.rollback_reservation(reservation_id, "expired")
                return False
            
            # 3. Atomic: decrement reserved, increment used
            result = self.subscription_collection.update_one(
                {"_id": ObjectId(reservation["subscription_id"])},
                {
                    "$inc": {
                        "slips_reserved": -1,
                        "slips_used": 1
                    },
                    "$set": {"updated_at": now}
                }
            )
            
            if result.modified_count == 0:
                logger.error(f"❌ Failed to update subscription for reservation: {reservation_id}")
                return False
            
            # 4. Update reservation status
            self.collection.update_one(
                {"reservation_id": reservation_id},
                {
                    "$set": {
                        "status": self.STATUS_CONFIRMED,
                        "confirmed_at": now
                    }
                }
            )
            
            logger.info(f"✅ Reservation confirmed: {reservation_id}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Error confirming reservation: {e}")
            return False
    
    def rollback_reservation(
        self,
        reservation_id: str,
        reason: Optional[str] = None
    ) -> bool:
        """
        PHASE 2b: Rollback reservation (คืนเครดิต)
        
        Args:
            reservation_id: The reservation to rollback
            reason: Reason for rollback (duplicate, error, expired, etc.)
            
        Returns:
            True if rolled back successfully
        """
        try:
            now = datetime.utcnow()
            
            # 1. Find reservation
            reservation = self.collection.find_one({
                "reservation_id": reservation_id,
                "status": self.STATUS_RESERVED
            })
            
            if not reservation:
                logger.warning(f"⚠️ Reservation not found or not in reserved status: {reservation_id}")
                return False
            
            # 2. Decrement reserved count (return to available)
            result = self.subscription_collection.update_one(
                {"_id": ObjectId(reservation["subscription_id"])},
                {
                    "$inc": {"slips_reserved": -1},
                    "$set": {"updated_at": now}
                }
            )
            
            if result.modified_count == 0:
                logger.error(f"❌ Failed to update subscription for rollback: {reservation_id}")
                return False
            
            # 3. Update reservation status
            self.collection.update_one(
                {"reservation_id": reservation_id},
                {
                    "$set": {
                        "status": self.STATUS_ROLLED_BACK,
                        "rolled_back_at": now,
                        "rollback_reason": reason
                    }
                }
            )
            
            logger.info(f"🔄 Reservation rolled back: {reservation_id} (reason: {reason})")
            return True
            
        except Exception as e:
            logger.error(f"❌ Error rolling back reservation: {e}")
            return False
    
    def get_reservation(self, reservation_id: str) -> Optional[Dict[str, Any]]:
        """Get reservation by ID"""
        try:
            reservation = self.collection.find_one({"reservation_id": reservation_id})
            if reservation:
                reservation["_id"] = str(reservation["_id"])
            return reservation
        except Exception as e:
            logger.error(f"❌ Error getting reservation: {e}")
            return None
    
    def get_user_reservations(
        self,
        user_id: str,
        status: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get reservations for a user"""
        try:
            query = {"user_id": user_id}
            if status:
                query["status"] = status
            
            reservations = list(
                self.collection.find(query)
                .sort("created_at", -1)
                .limit(limit)
            )
            
            for res in reservations:
                res["_id"] = str(res["_id"])
            
            return reservations
        except Exception as e:
            logger.error(f"❌ Error getting user reservations: {e}")
            return []
    
    def cleanup_expired_reservations(self) -> int:
        """
        Background job: Auto-rollback expired reservations
        Should be run periodically (e.g., every minute)
        
        Returns:
            Number of reservations rolled back
        """
        try:
            now = datetime.utcnow()
            
            # Find expired reservations
            expired = self.collection.find({
                "status": self.STATUS_RESERVED,
                "expires_at": {"$lt": now}
            })
            
            count = 0
            for reservation in expired:
                if self.rollback_reservation(
                    reservation["reservation_id"],
                    reason="expired"
                ):
                    count += 1
            
            if count > 0:
                logger.info(f"🧹 Cleaned up {count} expired reservations")
            
            return count
            
        except Exception as e:
            logger.error(f"❌ Error cleaning up expired reservations: {e}")
            return 0
    
    def get_statistics(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """Get reservation statistics"""
        try:
            query = {}
            if user_id:
                query["user_id"] = user_id
            
            total = self.collection.count_documents(query)
            
            reserved = self.collection.count_documents({**query, "status": self.STATUS_RESERVED})
            confirmed = self.collection.count_documents({**query, "status": self.STATUS_CONFIRMED})
            rolled_back = self.collection.count_documents({**query, "status": self.STATUS_ROLLED_BACK})
            
            return {
                "total": total,
                "reserved": reserved,
                "confirmed": confirmed,
                "rolled_back": rolled_back,
                "confirmation_rate": (confirmed / total * 100) if total > 0 else 0
            }
        except Exception as e:
            logger.error(f"❌ Error getting statistics: {e}")
            return {}
    
    def fix_stuck_reservations(self, user_id: str) -> Dict[str, Any]:
        """
        🔧 Fix stuck reservations and sync subscription quota
        
        ปัญหา: slips_reserved อาจติดค้างจากการ reservation ที่ไม่สมบูรณ์
        แก้ไข: นับจำนวน reserved จริงจาก reservations collection และ sync กับ subscription
        
        Args:
            user_id: User ID to fix
            
        Returns:
            { fixed: bool, message: str, details: dict }
        """
        try:
            now = datetime.utcnow()
            
            # 1. Find active subscription
            subscription = self.subscription_collection.find_one({
                "user_id": user_id,
                "status": "active"
            })
            
            if not subscription:
                return {
                    "fixed": False,
                    "message": "No active subscription found",
                    "details": {}
                }
            
            # 2. Count actual reserved from reservations collection
            actual_reserved = self.collection.count_documents({
                "user_id": user_id,
                "status": self.STATUS_RESERVED,
                "expires_at": {"$gt": now}  # Only count non-expired
            })
            
            current_reserved = subscription.get("slips_reserved", 0)
            
            # 3. If mismatch, sync the values
            if current_reserved != actual_reserved:
                logger.warning(f"🔧 Fixing stuck reservations for user {user_id}: stored={current_reserved}, actual={actual_reserved}")
                
                self.subscription_collection.update_one(
                    {"_id": subscription["_id"]},
                    {"$set": {"slips_reserved": actual_reserved, "updated_at": now}}
                )
                
                return {
                    "fixed": True,
                    "message": f"Fixed quota: {current_reserved} -> {actual_reserved}",
                    "details": {
                        "subscription_id": str(subscription["_id"]),
                        "old_reserved": current_reserved,
                        "new_reserved": actual_reserved,
                        "slips_quota": subscription.get("slips_quota", 0),
                        "slips_used": subscription.get("slips_used", 0)
                    }
                }
            
            return {
                "fixed": False,
                "message": "No fix needed, quota is synced",
                "details": {
                    "slips_reserved": current_reserved,
                    "slips_quota": subscription.get("slips_quota", 0),
                    "slips_used": subscription.get("slips_used", 0)
                }
            }
            
        except Exception as e:
            logger.error(f"❌ Error fixing stuck reservations: {e}")
            return {
                "fixed": False,
                "message": f"Error: {str(e)}",
                "details": {}
            }
    
    def reset_all_reservations(self, user_id: str) -> Dict[str, Any]:
        """
        🔧 Emergency reset: Set slips_reserved to 0 and cancel all pending reservations
        
        ใช้เมื่อระบบมีปัญหาและต้องการรีเซ็ตโควต้าที่จอง
        
        Args:
            user_id: User ID to reset
            
        Returns:
            { success: bool, message: str, cancelled_count: int }
        """
        try:
            now = datetime.utcnow()
            
            # 1. Cancel all pending reservations
            result = self.collection.update_many(
                {
                    "user_id": user_id,
                    "status": self.STATUS_RESERVED
                },
                {
                    "$set": {
                        "status": self.STATUS_ROLLED_BACK,
                        "rolled_back_at": now,
                        "rollback_reason": "emergency_reset"
                    }
                }
            )
            
            cancelled_count = result.modified_count
            
            # 2. Reset slips_reserved in subscription
            sub_result = self.subscription_collection.update_many(
                {"user_id": user_id, "status": "active"},
                {"$set": {"slips_reserved": 0, "updated_at": now}}
            )
            
            logger.info(f"🔧 Emergency reset for user {user_id}: cancelled {cancelled_count} reservations")
            
            return {
                "success": True,
                "message": f"Reset complete: cancelled {cancelled_count} reservations",
                "cancelled_count": cancelled_count,
                "subscriptions_reset": sub_result.modified_count
            }
            
        except Exception as e:
            logger.error(f"❌ Error resetting reservations: {e}")
            return {
                "success": False,
                "message": f"Error: {str(e)}",
                "cancelled_count": 0
            }
