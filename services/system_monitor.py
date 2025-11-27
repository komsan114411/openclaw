# services/system_monitor.py
"""
System Monitor Service - ระบบตรวจสอบสถานะและ Auto-Recovery
สำหรับจัดการปัญหาระบบอัตโนมัติ
"""
import logging
import asyncio
from datetime import datetime
from typing import Dict, Any, Optional
import pytz

logger = logging.getLogger("system_monitor")

class SystemMonitor:
    """
    System Monitor - ตรวจสอบสถานะระบบและ Auto-Recovery
    """
    
    def __init__(self, db=None):
        self.db = db
        self.last_health_check = None
        self.is_running = False
        self.health_status = {
            "database": "unknown",
            "line_api": "unknown",
            "thunder_api": "unknown",
            "last_check": None,
            "errors": []
        }
        self._task = None
        logger.info("✅ SystemMonitor initialized")
    
    def set_database(self, db):
        """Set database connection"""
        self.db = db
        logger.info("✅ Database connection set for SystemMonitor")
    
    async def check_database_health(self) -> Dict[str, Any]:
        """ตรวจสอบสถานะ Database"""
        try:
            if self.db is None:
                return {"status": "error", "message": "Database not initialized"}
            
            # Test database connection with ping
            result = self.db.client.admin.command('ping')
            
            # Get database stats
            stats = {
                "status": "healthy",
                "message": "Database connection is working",
                "collections": self.db.list_collection_names() if self.db else [],
                "timestamp": datetime.now(pytz.timezone('Asia/Bangkok')).isoformat()
            }
            
            logger.debug("✅ Database health check passed")
            return stats
            
        except Exception as e:
            logger.error(f"❌ Database health check failed: {e}")
            return {
                "status": "error",
                "message": str(e),
                "timestamp": datetime.now(pytz.timezone('Asia/Bangkok')).isoformat()
            }
    
    async def check_system_health(self) -> Dict[str, Any]:
        """ตรวจสอบสถานะระบบทั้งหมด"""
        try:
            bangkok_tz = pytz.timezone('Asia/Bangkok')
            
            # Check database
            db_health = await self.check_database_health()
            
            # Update health status
            self.health_status = {
                "database": db_health.get("status", "unknown"),
                "last_check": datetime.now(bangkok_tz).isoformat(),
                "timestamp": datetime.now(bangkok_tz).isoformat(),
                "details": {
                    "database": db_health
                }
            }
            
            # Determine overall status
            if db_health.get("status") == "healthy":
                self.health_status["overall"] = "healthy"
            else:
                self.health_status["overall"] = "degraded"
            
            self.last_health_check = datetime.now(bangkok_tz)
            
            return self.health_status
            
        except Exception as e:
            logger.error(f"❌ System health check error: {e}")
            return {
                "overall": "error",
                "message": str(e),
                "timestamp": datetime.now(pytz.timezone('Asia/Bangkok')).isoformat()
            }
    
    async def auto_recovery(self) -> Dict[str, Any]:
        """พยายามกู้คืนระบบอัตโนมัติ"""
        recovery_results = {
            "timestamp": datetime.now(pytz.timezone('Asia/Bangkok')).isoformat(),
            "actions": []
        }
        
        try:
            # Check and recover database connection
            if self.db is not None:
                try:
                    self.db.client.admin.command('ping')
                    recovery_results["actions"].append({
                        "component": "database",
                        "action": "check",
                        "status": "ok"
                    })
                except Exception as e:
                    logger.warning(f"⚠️ Database connection lost, attempting reconnect...")
                    try:
                        from models.database import init_database, get_database
                        new_db = init_database()
                        self.db = new_db.get_db()
                        recovery_results["actions"].append({
                            "component": "database",
                            "action": "reconnect",
                            "status": "recovered"
                        })
                        logger.info("✅ Database connection recovered")
                    except Exception as reconnect_error:
                        recovery_results["actions"].append({
                            "component": "database",
                            "action": "reconnect",
                            "status": "failed",
                            "error": str(reconnect_error)
                        })
                        logger.error(f"❌ Database reconnection failed: {reconnect_error}")
            
            return recovery_results
            
        except Exception as e:
            logger.error(f"❌ Auto-recovery error: {e}")
            return {
                "status": "error",
                "message": str(e),
                "timestamp": datetime.now(pytz.timezone('Asia/Bangkok')).isoformat()
            }
    
    async def _background_monitor(self, interval: int = 60):
        """Background task for continuous monitoring"""
        logger.info(f"🔄 Starting background monitor (interval: {interval}s)")
        
        while self.is_running:
            try:
                # Perform health check
                health = await self.check_system_health()
                
                # If unhealthy, try auto-recovery
                if health.get("overall") != "healthy":
                    logger.warning("⚠️ System unhealthy, attempting auto-recovery...")
                    await self.auto_recovery()
                
                await asyncio.sleep(interval)
                
            except asyncio.CancelledError:
                logger.info("🛑 Background monitor stopped")
                break
            except Exception as e:
                logger.error(f"❌ Background monitor error: {e}")
                await asyncio.sleep(interval)
    
    def start_monitoring(self, interval: int = 60):
        """Start background monitoring"""
        if not self.is_running:
            self.is_running = True
            self._task = asyncio.create_task(self._background_monitor(interval))
            logger.info("✅ Background monitoring started")
    
    def stop_monitoring(self):
        """Stop background monitoring"""
        self.is_running = False
        if self._task:
            self._task.cancel()
            logger.info("🛑 Background monitoring stopped")
    
    def get_status(self) -> Dict[str, Any]:
        """Get current system status"""
        return {
            "monitoring_active": self.is_running,
            "last_check": self.last_health_check.isoformat() if self.last_health_check else None,
            "health_status": self.health_status
        }
    
    def log_error(self, component: str, error: str, severity: str = "error"):
        """Log error to system"""
        error_entry = {
            "component": component,
            "error": error,
            "severity": severity,
            "timestamp": datetime.now(pytz.timezone('Asia/Bangkok')).isoformat()
        }
        
        # Keep only last 100 errors
        self.health_status.setdefault("errors", [])
        self.health_status["errors"].append(error_entry)
        self.health_status["errors"] = self.health_status["errors"][-100:]
        
        # Log to standard logger
        if severity == "critical":
            logger.critical(f"🚨 [{component}] {error}")
        elif severity == "error":
            logger.error(f"❌ [{component}] {error}")
        elif severity == "warning":
            logger.warning(f"⚠️ [{component}] {error}")
        else:
            logger.info(f"ℹ️ [{component}] {error}")
        
        # Save to database if available
        if self.db is not None:
            try:
                self.db.system_errors.insert_one(error_entry)
            except Exception as e:
                logger.warning(f"Could not save error to database: {e}")


# Global instance
system_monitor = SystemMonitor()


def get_system_monitor() -> SystemMonitor:
    """Get global system monitor instance"""
    return system_monitor


def init_system_monitor(db) -> SystemMonitor:
    """Initialize system monitor with database"""
    system_monitor.set_database(db)
    return system_monitor
