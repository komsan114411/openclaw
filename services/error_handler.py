# services/error_handler.py
"""
Error Handler Service - ระบบจัดการ Error อัตโนมัติ
บันทึก Error และแจ้งเตือนอัตโนมัติ
"""
import logging
import traceback
from datetime import datetime
from typing import Dict, Any, Optional, Callable
from functools import wraps
import pytz
import asyncio

logger = logging.getLogger("error_handler")

class ErrorHandler:
    """
    Error Handler - จัดการ Error และบันทึกอัตโนมัติ
    """
    
    def __init__(self, db=None):
        self.db = db
        self.error_counts = {}
        self.recent_errors = []
        self.max_recent_errors = 100
        logger.info("✅ ErrorHandler initialized")
    
    def set_database(self, db):
        """Set database connection"""
        self.db = db
        # Create index for errors collection
        try:
            self.db.system_errors.create_index([("timestamp", -1)])
            self.db.system_errors.create_index([("component", 1)])
            self.db.system_errors.create_index([("severity", 1)])
        except Exception as e:
            logger.warning(f"⚠️ Could not create error indexes: {e}")
    
    def log_error(
        self,
        component: str,
        error: Exception,
        context: Optional[Dict[str, Any]] = None,
        severity: str = "error"
    ) -> str:
        """
        บันทึก Error
        
        Args:
            component: ส่วนของระบบที่เกิด error (e.g., "webhook", "slip_verification")
            error: Exception object
            context: ข้อมูลเพิ่มเติม
            severity: ระดับความรุนแรง (debug, info, warning, error, critical)
        
        Returns:
            Error ID
        """
        bangkok_tz = pytz.timezone('Asia/Bangkok')
        
        error_doc = {
            "component": component,
            "error_type": type(error).__name__,
            "error_message": str(error),
            "traceback": traceback.format_exc(),
            "context": context or {},
            "severity": severity,
            "timestamp": datetime.now(bangkok_tz),
            "resolved": False
        }
        
        # Log to standard logger
        log_message = f"[{component}] {type(error).__name__}: {error}"
        if severity == "critical":
            logger.critical(f"🚨 {log_message}")
        elif severity == "error":
            logger.error(f"❌ {log_message}")
        elif severity == "warning":
            logger.warning(f"⚠️ {log_message}")
        else:
            logger.info(f"ℹ️ {log_message}")
        
        # Update error counts
        self.error_counts[component] = self.error_counts.get(component, 0) + 1
        
        # Add to recent errors
        self.recent_errors.append({
            "component": component,
            "error_type": error_doc["error_type"],
            "message": error_doc["error_message"],
            "severity": severity,
            "timestamp": error_doc["timestamp"].isoformat()
        })
        self.recent_errors = self.recent_errors[-self.max_recent_errors:]
        
        # Save to database
        error_id = None
        if self.db is not None:
            try:
                result = self.db.system_errors.insert_one(error_doc)
                error_id = str(result.inserted_id)
            except Exception as db_error:
                logger.warning(f"⚠️ Could not save error to database: {db_error}")
        
        return error_id
    
    def get_error_stats(self) -> Dict[str, Any]:
        """Get error statistics"""
        bangkok_tz = pytz.timezone('Asia/Bangkok')
        
        stats = {
            "error_counts": self.error_counts,
            "recent_errors": self.recent_errors[-10:],
            "timestamp": datetime.now(bangkok_tz).isoformat()
        }
        
        # Get database stats if available
        if self.db is not None:
            try:
                # Count by severity in last 24 hours
                from datetime import timedelta
                cutoff = datetime.now(bangkok_tz) - timedelta(hours=24)
                
                severity_counts = {}
                for severity in ["debug", "info", "warning", "error", "critical"]:
                    count = self.db.system_errors.count_documents({
                        "severity": severity,
                        "timestamp": {"$gte": cutoff}
                    })
                    if count > 0:
                        severity_counts[severity] = count
                
                stats["last_24h_by_severity"] = severity_counts
                
                # Total unresolved errors
                stats["unresolved_count"] = self.db.system_errors.count_documents({
                    "resolved": False
                })
                
            except Exception as e:
                logger.warning(f"⚠️ Could not get database stats: {e}")
        
        return stats
    
    def get_recent_errors(
        self,
        limit: int = 50,
        component: Optional[str] = None,
        severity: Optional[str] = None
    ) -> list:
        """Get recent errors from database"""
        if self.db is None:
            return self.recent_errors[-limit:]
        
        try:
            query = {}
            if component:
                query["component"] = component
            if severity:
                query["severity"] = severity
            
            errors = list(
                self.db.system_errors.find(query)
                .sort("timestamp", -1)
                .limit(limit)
            )
            
            # Convert ObjectId to string
            for error in errors:
                error["_id"] = str(error["_id"])
                if error.get("timestamp"):
                    error["timestamp"] = error["timestamp"].isoformat()
            
            return errors
            
        except Exception as e:
            logger.warning(f"⚠️ Could not get errors from database: {e}")
            return self.recent_errors[-limit:]
    
    def mark_resolved(self, error_id: str) -> bool:
        """Mark an error as resolved"""
        if self.db is None:
            return False
        
        try:
            from bson import ObjectId
            result = self.db.system_errors.update_one(
                {"_id": ObjectId(error_id)},
                {"$set": {"resolved": True, "resolved_at": datetime.now(pytz.timezone('Asia/Bangkok'))}}
            )
            return result.modified_count > 0
        except Exception as e:
            logger.warning(f"⚠️ Could not mark error as resolved: {e}")
            return False
    
    def clear_old_errors(self, days: int = 30) -> int:
        """Delete errors older than specified days"""
        if self.db is None:
            return 0
        
        try:
            from datetime import timedelta
            cutoff = datetime.now(pytz.timezone('Asia/Bangkok')) - timedelta(days=days)
            result = self.db.system_errors.delete_many({
                "timestamp": {"$lt": cutoff}
            })
            logger.info(f"✅ Cleared {result.deleted_count} old errors")
            return result.deleted_count
        except Exception as e:
            logger.warning(f"⚠️ Could not clear old errors: {e}")
            return 0


# Global instance
error_handler = ErrorHandler()


def get_error_handler() -> ErrorHandler:
    """Get global error handler instance"""
    return error_handler


def init_error_handler(db) -> ErrorHandler:
    """Initialize error handler with database"""
    error_handler.set_database(db)
    return error_handler


# Decorator for automatic error logging
def log_errors(component: str, severity: str = "error"):
    """
    Decorator to automatically log errors from functions
    
    Usage:
        @log_errors("webhook")
        async def process_webhook(data):
            ...
    """
    def decorator(func: Callable):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            try:
                return await func(*args, **kwargs)
            except Exception as e:
                error_handler.log_error(
                    component=component,
                    error=e,
                    context={"function": func.__name__, "args": str(args)[:200]},
                    severity=severity
                )
                raise
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                error_handler.log_error(
                    component=component,
                    error=e,
                    context={"function": func.__name__, "args": str(args)[:200]},
                    severity=severity
                )
                raise
        
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    
    return decorator
