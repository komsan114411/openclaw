"""
API Quota Monitoring Utility
Fixes Bug #10: No Slip API Quota Monitoring
"""
import logging
from datetime import datetime
from typing import Dict, Any, Optional

logger = logging.getLogger("api_monitor")

class ApiQuotaMonitor:
    """Monitor external API usage and quotas"""
    
    def __init__(self, db):
        self.db = db
        self.collection = db.api_quota_usage
        self._ensure_indexes()
        logger.info("✅ API Quota Monitor initialized")
    
    def _ensure_indexes(self):
        """Create necessary indexes"""
        try:
            # Index for querying usage by date and provider
            self.collection.create_index([
                ("date", 1),
                ("provider", 1),
                ("account_id", 1)
            ])
        except Exception as e:
            logger.error(f"❌ Error creating API quota indexes: {e}")
    
    def record_api_call(
        self,
        provider: str,
        success: bool,
        account_id: str,
        endpoint: str = "verify_slip",
        response_time_ms: int = 0
    ) -> bool:
        """
        Record an API call to external provider
        """
        try:
            today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            
            update_data = {
                "$inc": {
                    "total_calls": 1,
                    "successful_calls": 1 if success else 0,
                    "failed_calls": 0 if success else 1,
                    "total_response_time_ms": response_time_ms
                },
                "$set": {
                    "last_updated": datetime.utcnow()
                }
            }
            
            self.collection.update_one(
                {
                    "date": today,
                    "provider": provider,
                    "account_id": account_id
                },
                update_data,
                upsert=True
            )
            return True
        except Exception as e:
            logger.error(f"❌ Error recording API call: {e}")
            return False
    
    def get_daily_usage(self, provider: str, account_id: str = None) -> Dict[str, Any]:
        """Get API usage for today"""
        try:
            today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            query = {"date": today, "provider": provider}
            
            if account_id:
                query["account_id"] = account_id
                
            # Aggregate if no account_id (get total for provider)
            if not account_id:
                pipeline = [
                    {"$match": query},
                    {"$group": {
                        "_id": None,
                        "total_calls": {"$sum": "$total_calls"},
                        "successful_calls": {"$sum": "$successful_calls"},
                        "failed_calls": {"$sum": "$failed_calls"}
                    }}
                ]
                result = list(self.collection.aggregate(pipeline))
                if result:
                    return result[0]
                return {"total_calls": 0, "successful_calls": 0, "failed_calls": 0}
            
            # Single account query
            result = self.collection.find_one(query)
            if result:
                return {
                    "total_calls": result.get("total_calls", 0),
                    "successful_calls": result.get("successful_calls", 0),
                    "failed_calls": result.get("failed_calls", 0)
                }
            return {"total_calls": 0, "successful_calls": 0, "failed_calls": 0}
            
        except Exception as e:
            logger.error(f"❌ Error getting daily usage: {e}")
            return {"total_calls": 0, "successful_calls": 0, "failed_calls": 0}

    def check_quota_status(self, provider: str, limit: int = 1000) -> Dict[str, Any]:
        """Check if global quota is nearing limit"""
        usage = self.get_daily_usage(provider)
        total = usage.get("total_calls", 0)
        
        return {
            "provider": provider,
            "used": total,
            "limit": limit,
            "remaining": max(0, limit - total),
            "percent_used": (total / limit) * 100 if limit > 0 else 0,
            "is_critical": total >= (limit * 0.9)
        }
