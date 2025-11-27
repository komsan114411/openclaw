"""
Session Extension Utilities
Fixes Bug #17: Session expiration check
"""
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

logger = logging.getLogger("session")

class SessionManager:
    """Enhanced session management with expiration"""
    
    def __init__(self, db, session_duration_hours: int = 24):
        self.db = db
        self.collection = db.sessions
        self.session_duration = timedelta(hours=session_duration_hours)
        logger.info(f"✅ Session manager initialized (duration: {session_duration_hours}h)")
    
    def create_session(self, user_id: str, username: str, role: str) -> str:
        """
        Create a new session with expiration time
        
        Returns:
            session_id
        """
        import secrets
        
        session_id = secrets.token_urlsafe(32)
        expires_at = datetime.utcnow() + self.session_duration
        
        session_data = {
            "session_id": session_id,
            "user_id": user_id,
            "username": username,
            "role": role,
            "created_at": datetime.utcnow(),
            "expires_at": expires_at,
            "last_activity": datetime.utcnow()
        }
        
        self.collection.insert_one(session_data)
        logger.info(f"✅ Created session for {username} (expires: {expires_at})")
        
        return session_id
    
    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Get session and check expiration
        
        Returns:
            Session data or None if expired/not found
        """
        if not session_id:
            return None
        
        session = self.collection.find_one({"session_id": session_id})
        
        if not session:
            return None
        
        # Check expiration
        expires_at = session.get("expires_at")
        if expires_at:
            if datetime.utcnow() > expires_at:
                logger.info(f"⏰ Session expired: {session_id}")
                self.delete_session(session_id)
                return None
        
        # Update last activity
        self.collection.update_one(
            {"session_id": session_id},
            {"$set": {"last_activity": datetime.utcnow()}}
        )
        
        return session
    
    def delete_session(self, session_id: str) -> bool:
        """Delete a session"""
        result = self.collection.delete_one({"session_id": session_id})
        return result.deleted_count > 0
    
    def cleanup_expired_sessions(self) -> int:
        """
        Clean up expired sessions
        
        Returns:
            Number of sessions deleted
        """
        result = self.collection.delete_many({
            "expires_at": {"$lt": datetime.utcnow()}
        })
        
        if result.deleted_count > 0:
            logger.info(f"🧹 Cleaned up {result.deleted_count} expired sessions")
        
        return result.deleted_count
    
    def extend_session(self, session_id: str) -> bool:
        """Extend session expiration time"""
        new_expires_at = datetime.utcnow() + self.session_duration
        
        result = self.collection.update_one(
            {"session_id": session_id},
            {"$set": {"expires_at": new_expires_at}}
        )
        
        return result.modified_count > 0
