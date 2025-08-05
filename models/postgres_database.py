# models/postgres_database.py
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from dataclasses import dataclass
from models.postgres_models import db_manager, ChatHistoryModel, APILogModel

logger = logging.getLogger("postgres_database")

@dataclass
class ChatHistory:
    id: int
    user_id: str
    direction: str
    message_type: str
    message_text: str
    sender: str
    created_at: datetime

def init_database() -> None:
    """Initialize PostgreSQL database with proper schema"""
    try:
        db_manager.create_tables()
        logger.info("✅ PostgreSQL database initialized successfully")
    except Exception as e:
        logger.error(f"❌ Database initialization failed: {e}")

def save_chat_history(user_id: str, direction: str, message: Dict[str, Any], sender: str) -> None:
    """Save chat history to PostgreSQL with improved handling"""
    try:
        db = db_manager.get_session()
        
        # Extract message info
        message_type = message.get("type", "text")
        message_text = ""
        
        if message_type == "text":
            message_text = message.get("text", "")
        elif message_type == "image":
            message_text = "ส่งรูปภาพ (สลิป)"
        else:
            message_text = f"ส่งข้อความประเภท {message_type}"
        
        # สร้าง record ใหม่
        chat_record = ChatHistoryModel(
            user_id=user_id,
            direction=direction,
            message_type=message_type,
            message_text=message_text,
            message_data=message,  # เก็บ JSON ดิบไว้ด้วย
            sender=sender
        )
        
        db.add(chat_record)
        db.commit()
        logger.debug(f"💬 Chat history saved: {user_id} ({direction}) - {sender}")
        
    except Exception as e:
        logger.error(f"❌ Error saving chat history: {e}")
        if 'db' in locals():
            db.rollback()
    finally:
        if 'db' in locals():
            db.close()

def get_user_chat_history(user_id: str, limit: int = 10) -> List[Dict[str, str]]:
    """Get user chat history for AI context from PostgreSQL"""
    try:
        db = db_manager.get_session()
        
        # Query recent messages for this user
        messages = db.query(ChatHistoryModel)\
            .filter(ChatHistoryModel.user_id == user_id)\
            .filter(ChatHistoryModel.message_type == 'text')\
            .filter(ChatHistoryModel.message_text.isnot(None))\
            .order_by(ChatHistoryModel.created_at.desc())\
            .limit(limit)\
            .all()
        
        result = []
        # Process messages in reverse order (oldest first for AI context)
        for message in reversed(messages):
            role = "user" if message.direction == "in" else "assistant"
            if message.message_text and message.message_text.strip():
                result.append({
                    "role": role,
                    "content": message.message_text.strip()
                })
        
        db.close()
        logger.debug(f"📚 Retrieved {len(result)} chat history for user {user_id[:8]}...")
        return result
        
    except Exception as e:
        logger.error(f"❌ Error getting user chat history: {e}")
        if 'db' in locals():
            db.close()
        return []

def get_chat_history_count() -> int:
    """Get total message count from PostgreSQL"""
    try:
        db = db_manager.get_session()
        count = db.query(ChatHistoryModel).count()
        db.close()
        return count
    except Exception as e:
        logger.error(f"❌ Error getting chat count: {e}")
        if 'db' in locals():
            db.close()
        return 0

def get_recent_chat_history(limit: int = 50) -> List[ChatHistory]:
    """Get recent chat history for admin display from PostgreSQL"""
    try:
        db = db_manager.get_session()
        
        messages = db.query(ChatHistoryModel)\
            .order_by(ChatHistoryModel.created_at.desc())\
            .limit(limit)\
            .all()
        
        result = []
        for msg in reversed(messages):  # Return in chronological order
            result.append(ChatHistory(
                id=msg.id,
                user_id=msg.user_id,
                direction=msg.direction,
                message_type=msg.message_type,
                message_text=msg.message_text or "",
                sender=msg.sender,
                created_at=msg.created_at
            ))
        
        db.close()
        logger.debug(f"📋 Retrieved {len(result)} recent chat messages")
        return result
        
    except Exception as e:
        logger.error(f"❌ Error getting recent chat history: {e}")
        if 'db' in locals():
            db.close()
        return []

def log_api_call(api_name: str, endpoint: str, method: str, status_code: int, 
                response_time: int, error_message: str = None) -> None:
    """Log API call to database"""
    try:
        db = db_manager.get_session()
        
        log_record = APILogModel(
            api_name=api_name,
            endpoint=endpoint,
            method=method,
            status_code=status_code,
            response_time=response_time,
            error_message=error_message
        )
        
        db.add(log_record)
        db.commit()
        
    except Exception as e:
        logger.error(f"❌ Error logging API call: {e}")
        if 'db' in locals():
            db.rollback()
    finally:
        if 'db' in locals():
            db.close()

def get_api_statistics(hours: int = 24) -> Dict[str, Any]:
    """Get API usage statistics"""
    try:
        db = db_manager.get_session()
        
        from datetime import datetime, timedelta
        since = datetime.utcnow() - timedelta(hours=hours)
        
        # Total calls
        total_calls = db.query(APILogModel)\
            .filter(APILogModel.created_at >= since)\
            .count()
        
        # Success rate
        success_calls = db.query(APILogModel)\
            .filter(APILogModel.created_at >= since)\
            .filter(APILogModel.status_code < 400)\
            .count()
        
        success_rate = (success_calls / total_calls * 100) if total_calls > 0 else 0
        
        # Average response time
        avg_response_time = db.query(APILogModel.response_time)\
            .filter(APILogModel.created_at >= since)\
            .filter(APILogModel.response_time.isnot(None))\
            .all()
        
        avg_time = sum(t[0] for t in avg_response_time) / len(avg_response_time) if avg_response_time else 0
        
        result = {
            "total_calls": total_calls,
            "success_calls": success_calls,
            "success_rate": round(success_rate, 2),
            "average_response_time": round(avg_time, 2),
            "period_hours": hours
        }
        
        db.close()
        return result
        
    except Exception as e:
        logger.error(f"❌ Error getting API statistics: {e}")
        if 'db' in locals():
            db.close()
        return {}

def cleanup_old_data(days: int = 30) -> Dict[str, int]:
    """Clean up old data"""
    try:
        db = db_manager.get_session()
        
        from datetime import datetime, timedelta
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        # Delete old chat history
        deleted_chats = db.query(ChatHistoryModel)\
            .filter(ChatHistoryModel.created_at < cutoff_date)\
            .delete()
        
        # Delete old API logs
        deleted_logs = db.query(APILogModel)\
            .filter(APILogModel.created_at < cutoff_date)\
            .delete()
        
        db.commit()
        
        result = {
            "deleted_chats": deleted_chats,
            "deleted_logs": deleted_logs,
            "days": days
        }
        
        logger.info(f"🧹 Cleanup completed: {deleted_chats} chats, {deleted_logs} logs")
        db.close()
        return result
        
    except Exception as e:
        logger.error(f"❌ Error during cleanup: {e}")
        if 'db' in locals():
            db.rollback()
            db.close()
        return {}
