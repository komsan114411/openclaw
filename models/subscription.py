"""Subscription model for user package subscriptions"""
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from bson import ObjectId
import logging

logger = logging.getLogger("subscription_model")


class SubscriptionModel:
    def __init__(self, db):
        self.db = db
        self.collection = db.subscriptions
        self._ensure_indexes()
    
    def _ensure_indexes(self):
        """Create necessary indexes"""
        try:
            self.collection.create_index("user_id")
            self.collection.create_index("status")
            self.collection.create_index([("user_id", 1), ("status", 1), ("end_date", -1)])
            logger.info("✅ Subscription indexes created")
        except Exception as e:
            logger.error(f"❌ Error creating indexes: {e}")
    
    def _migrate_subscription(self, subscription: Dict) -> Dict:
        """Migrate old subscription format to new format with slips_reserved"""
        if "slips_reserved" not in subscription:
            # Add slips_reserved field if missing
            self.collection.update_one(
                {"_id": subscription["_id"]},
                {"$set": {"slips_reserved": 0}}
            )
            subscription["slips_reserved"] = 0
        return subscription
        
    def create_subscription(
        self,
        user_id: str,
        package_id: str,
        slips_quota: int,
        duration_days: int,
        payment_id: Optional[str] = None
    ) -> str:
        """Create a new subscription"""
        now = datetime.now()
        end_date = now + timedelta(days=duration_days)
        
        subscription = {
            "user_id": user_id,
            "package_id": package_id,
            "start_date": now,
            "end_date": end_date,
            "slips_quota": int(slips_quota),
            "slips_used": 0,
            "slips_reserved": 0,  # NEW: Track reserved quota for two-phase commit
            "status": "active",
            "payment_id": payment_id,
            "created_at": now,
            "updated_at": now
        }
        
        result = self.collection.insert_one(subscription)
        logger.info(f"✅ Subscription created for user {user_id}: {result.inserted_id}")
        return str(result.inserted_id)
    
    def get_active_subscriptions(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all active subscriptions for a user"""
        subscriptions = list(self.collection.find({
            "user_id": user_id,
            "status": "active",
            "end_date": {"$gt": datetime.now()}
        }).sort("end_date", -1))
        
        for sub in subscriptions:
            sub["_id"] = str(sub["_id"])
            # Migrate old subscriptions to new format
            sub = self._migrate_subscription(sub)
            
        return subscriptions
    
    def get_subscription_by_id(self, subscription_id: str) -> Optional[Dict[str, Any]]:
        """Get subscription by ID"""
        try:
            sub = self.collection.find_one({"_id": ObjectId(subscription_id)})
            if sub:
                sub["_id"] = str(sub["_id"])
            return sub
        except:
            return None
    
    def get_user_subscriptions(self, user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Get all subscriptions for a user (active and expired)"""
        subscriptions = list(self.collection.find({
            "user_id": user_id
        }).sort("created_at", -1).limit(limit))
        
        for sub in subscriptions:
            sub["_id"] = str(sub["_id"])
            
        return subscriptions
    
    def check_quota(self, user_id: str) -> Dict[str, Any]:
        """
        Check remaining quota for a user across all active subscriptions
        
        Available = total_quota - total_used - total_reserved
        """
        active_subs = self.get_active_subscriptions(user_id)
        
        if not active_subs:
            return {
                "status": "no_active_subscription",
                "total_slips": 0,
                "total_used": 0,
                "total_reserved": 0,
                "remaining_slips": 0,
                "available_slips": 0,  # NEW: Available for new reservations
                "expiry_date": None,
                "days_remaining": 0,
                "has_quota": False
            }
        
        # Calculate total quota across all active subscriptions
        total_quota = sum(sub.get("slips_quota", 0) for sub in active_subs)
        total_used = sum(sub.get("slips_used", 0) for sub in active_subs)
        total_reserved = sum(sub.get("slips_reserved", 0) for sub in active_subs)
        
        # Remaining = quota - used (for display)
        remaining = total_quota - total_used
        
        # Available = quota - used - reserved (for new reservations)
        available = total_quota - total_used - total_reserved
        
        # Find earliest expiry date
        earliest_expiry = min(sub["end_date"] for sub in active_subs)
        days_remaining = (earliest_expiry - datetime.now()).days
        
        # Determine status
        if available <= 0:
            status = "quota_exceeded"
        elif days_remaining <= 0:
            status = "expired"
        else:
            status = "ok"
        
        return {
            "status": status,
            "total_slips": total_quota,
            "total_used": total_used,
            "total_reserved": total_reserved,
            "remaining_slips": remaining,
            "available_slips": max(0, available),  # NEW: Available for new reservations
            "expiry_date": earliest_expiry,
            "days_remaining": max(0, days_remaining),
            "active_subscriptions_count": len(active_subs),
            "has_quota": available > 0
        }
    
    def use_slip_quota(self, user_id: str) -> bool:
        """Deduct one slip from user's quota (from oldest active subscription first)"""
        active_subs = self.get_active_subscriptions(user_id)
        
        if not active_subs:
            return False
        
        # Find subscription with available quota (oldest first)
        for sub in reversed(active_subs):  # Oldest first
            if sub["slips_used"] < sub["slips_quota"]:
                # Increment usage
                self.collection.update_one(
                    {"_id": ObjectId(sub["_id"])},
                    {
                        "$inc": {"slips_used": 1},
                        "$set": {"updated_at": datetime.now()}
                    }
                )
                return True
        
        return False
    
    def extend_subscription(
        self,
        user_id: str,
        additional_slips: int,
        additional_days: int
    ) -> bool:
        """Extend an existing active subscription or create new one"""
        active_subs = self.get_active_subscriptions(user_id)
        
        if active_subs:
            # Extend the newest active subscription
            newest_sub = active_subs[0]
            
            new_end_date = newest_sub["end_date"] + timedelta(days=additional_days)
            new_quota = newest_sub["slips_quota"] + additional_slips
            
            self.collection.update_one(
                {"_id": ObjectId(newest_sub["_id"])},
                {
                    "$set": {
                        "end_date": new_end_date,
                        "slips_quota": new_quota,
                        "updated_at": datetime.now()
                    }
                }
            )
            return True
        
        return False
    
    def expire_old_subscriptions(self):
        """Mark expired subscriptions as expired (run as cron job)"""
        result = self.collection.update_many(
            {
                "status": "active",
                "end_date": {"$lt": datetime.now()}
            },
            {
                "$set": {
                    "status": "expired",
                    "updated_at": datetime.now()
                }
            }
        )
        
        return result.modified_count
    
    def cancel_subscription(self, subscription_id: str) -> bool:
        """Cancel a subscription"""
        try:
            result = self.collection.update_one(
                {"_id": ObjectId(subscription_id)},
                {
                    "$set": {
                        "status": "cancelled",
                        "updated_at": datetime.now()
                    }
                }
            )
            return result.modified_count > 0
        except:
            return False
    
    def add_subscription(
        self,
        user_id: str,
        package_id: str,
        payment_id: Optional[str] = None,
        package_model=None
    ) -> bool:
        """
        เพิ่ม subscription ให้ user โดยใช้ข้อมูลจาก package
        - ถ้ามี subscription ที่ active อยู่ จะเพิ่ม quota และขยายวันหมดอายุ
        - ถ้าไม่มี จะสร้าง subscription ใหม่
        
        Returns:
            True if successful, False otherwise
        """
        try:
            # Get package details
            package = None
            if package_model:
                package = package_model.get_package_by_id(package_id)
            else:
                # Try to get from db directly
                try:
                    package = self.db.packages.find_one({"_id": ObjectId(package_id)})
                    if package:
                        package["_id"] = str(package["_id"])
                except:
                    pass
            
            if not package:
                logger.error(f"❌ Package not found: {package_id}")
                return False
            
            slips_quota = package.get("slip_quota", 0)
            duration_days = package.get("duration_days", 30)
            
            if slips_quota <= 0:
                logger.error(f"❌ Invalid slip_quota in package: {slips_quota}")
                return False
            
            # Check for active subscriptions
            active_subs = self.get_active_subscriptions(user_id)
            
            if active_subs:
                # Extend existing subscription
                newest_sub = active_subs[0]
                
                new_end_date = newest_sub["end_date"] + timedelta(days=duration_days)
                new_quota = newest_sub["slips_quota"] + slips_quota
                
                result = self.collection.update_one(
                    {"_id": ObjectId(newest_sub["_id"])},
                    {
                        "$set": {
                            "end_date": new_end_date,
                            "slips_quota": new_quota,
                            "updated_at": datetime.now()
                        },
                        "$push": {
                            "package_history": {
                                "package_id": package_id,
                                "payment_id": payment_id,
                                "added_quota": slips_quota,
                                "added_days": duration_days,
                                "added_at": datetime.now()
                            }
                        }
                    }
                )
                
                if result.modified_count > 0:
                    logger.info(f"✅ Extended subscription for user {user_id}: +{slips_quota} slips, +{duration_days} days")
                    return True
                else:
                    logger.error(f"❌ Failed to extend subscription for user {user_id}")
                    return False
            else:
                # Create new subscription
                subscription_id = self.create_subscription(
                    user_id=user_id,
                    package_id=package_id,
                    slips_quota=slips_quota,
                    duration_days=duration_days,
                    payment_id=payment_id
                )
                
                if subscription_id:
                    logger.info(f"✅ Created new subscription for user {user_id}: {subscription_id}")
                    return True
                else:
                    logger.error(f"❌ Failed to create subscription for user {user_id}")
                    return False
                    
        except Exception as e:
            logger.error(f"❌ Error adding subscription: {e}")
            return False
