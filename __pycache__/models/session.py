"""
Session Management for User Authentication
"""
import logging
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from bson import ObjectId

logger = logging.getLogger("session_model")

class Session:
    """Session management for authenticated users"""
    
    def __init__(self, db):
        self.db = db
        self.collection = db.sessions
        self._ensure_indexes()
    
    def _ensure_indexes(self):
        """Create necessary indexes"""
        try:
            self.collection.create_index("session_id", unique=True)
            self.collection.create_index("user_id")
            self.collection.create_index("expires_at", expireAfterSeconds=0)  # TTL index
            logger.info("✅ Session indexes created")
        except Exception as e:
            logger.error(f"❌ Error creating session indexes: {e}")
    
    def create_session(
        self,
        user_id: str,
        username: str,
        role: str,
        duration_hours: int = 24
    ) -> Optional[str]:
        """Create new session"""
        try:
            session_id = secrets.token_urlsafe(32)
            expires_at = datetime.utcnow() + timedelta(hours=duration_hours)
            
            session_doc = {
                "session_id": session_id,
                "user_id": user_id,
                "username": username,
                "role": role,
                "created_at": datetime.utcnow(),
                "expires_at": expires_at,
                "last_activity": datetime.utcnow()
            }
            
            self.collection.insert_one(session_doc)
            logger.info(f"✅ Session created for user: {username}")
            return session_id
            
        except Exception as e:
            logger.error(f"❌ Error creating session: {e}")
            return None
    
    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session by ID"""
        try:
            session = self.collection.find_one({"session_id": session_id})
            
            if not session:
                return None
            
            # Check if session is expired
            if session["expires_at"] < datetime.utcnow():
                self.delete_session(session_id)
                return None
            
            # Update last activity
            self.collection.update_one(
                {"session_id": session_id},
                {"$set": {"last_activity": datetime.utcnow()}}
            )
            
            session["_id"] = str(session["_id"])
            return session
            
        except Exception as e:
            logger.error(f"❌ Error getting session: {e}")
            return None
    
    def delete_session(self, session_id: str) -> bool:
        """Delete session"""
        try:
            result = self.collection.delete_one({"session_id": session_id})
            return result.deleted_count > 0
        except Exception as e:
            logger.error(f"❌ Error deleting session: {e}")
            return False
    
    def delete_user_sessions(self, user_id: str) -> int:
        """Delete all sessions for a user"""
        try:
            result = self.collection.delete_many({"user_id": user_id})
            return result.deleted_count
        except Exception as e:
            logger.error(f"❌ Error deleting user sessions: {e}")
            return 0
    
    def cleanup_expired_sessions(self) -> int:
        """Clean up expired sessions (manual cleanup)"""
        try:
            result = self.collection.delete_many({
                "expires_at": {"$lt": datetime.utcnow()}
            })
            return result.deleted_count
        except Exception as e:
            logger.error(f"❌ Error cleaning up sessions: {e}")
            return 0

