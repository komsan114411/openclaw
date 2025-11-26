"""Subscription model for user package subscriptions"""
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from bson import ObjectId


class SubscriptionModel:
    def __init__(self, db):
        self.db = db
        self.collection = db.subscriptions
        
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
            "status": "active",
            "payment_id": payment_id,
            "created_at": now,
            "updated_at": now
        }
        
        result = self.collection.insert_one(subscription)
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
        """Check remaining quota for a user across all active subscriptions"""
        active_subs = self.get_active_subscriptions(user_id)
        
        if not active_subs:
            return {
                "status": "no_active_subscription",
                "total_slips": 0,              # Renamed from total_quota
                "total_used": 0,
                "remaining_slips": 0,          # Renamed from remaining
                "expiry_date": None,           # Renamed from earliest_expiry
                "days_remaining": 0
            }
        
        # Calculate total quota across all active subscriptions
        total_quota = sum(sub["slips_quota"] for sub in active_subs)
        total_used = sum(sub["slips_used"] for sub in active_subs)
        remaining = total_quota - total_used
        
        # Find earliest expiry date
        earliest_expiry = min(sub["end_date"] for sub in active_subs)
        days_remaining = (earliest_expiry - datetime.now()).days
        
        # Determine status
        if remaining <= 0:
            status = "quota_exceeded"
        elif days_remaining <= 0:
            status = "expired"
        else:
            status = "ok"
        
        return {
            "status": status,
            "total_slips": total_quota,        # Renamed from total_quota
            "total_used": total_used,
            "remaining_slips": remaining,      # Renamed from remaining
            "expiry_date": earliest_expiry,    # Renamed from earliest_expiry
            "days_remaining": max(0, days_remaining),
            "active_subscriptions_count": len(active_subs)
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
