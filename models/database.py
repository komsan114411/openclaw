import os
import sqlite3
import json
from datetime import datetime
from typing import Any, Dict, List
from dataclasses import dataclass

# Database path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "storage.db")

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
    """Initialize database with proper schema"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Use CREATE TABLE IF NOT EXISTS to prevent data loss on restarts
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            direction TEXT NOT NULL,
            message_type TEXT NOT NULL DEFAULT 'text',
            message_text TEXT,
            sender TEXT NOT NULL DEFAULT 'unknown',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create index for better performance
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_chat_history_user_id 
        ON chat_history(user_id)
    """)
    
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_chat_history_created_at 
        ON chat_history(created_at)
    """)
    
    conn.commit()
    conn.close()
    print("✅ Database initialized successfully")

def save_chat_history(user_id: str, direction: str, message: Dict[str, Any], sender: str) -> None:
    """Save chat history with improved handling"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Extract message info
        message_type = message.get("type", "text")
        message_text = ""
        
        if message_type == "text":
            message_text = message.get("text", "")
        elif message_type == "image":
            message_text = "ส่งรูปภาพ (สลิป)"
        else:
            message_text = f"ส่งข้อความประเภท {message_type}"
        
        cursor.execute("""
            INSERT INTO chat_history (user_id, direction, message_type, message_text, sender)
            VALUES (?, ?, ?, ?, ?)
        """, (user_id, direction, message_type, message_text, sender))
        
        conn.commit()
        conn.close()
        
    except Exception as e:
        print(f"❌ Error saving chat history: {e}")

def get_user_chat_history(user_id: str, limit: int = 10) -> List[Dict[str, str]]:
    """Get user chat history for AI context"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT direction, message_text FROM chat_history 
            WHERE user_id = ? AND message_type = 'text' AND message_text IS NOT NULL
            ORDER BY created_at DESC LIMIT ?
        """, (user_id, limit))
        
        messages = []
        for direction, text in reversed(cursor.fetchall()):
            role = "user" if direction == "in" else "assistant"
            if text and text.strip():
                messages.append({"role": role, "content": text.strip()})
        
        conn.close()
        return messages
        
    except Exception as e:
        print(f"❌ Error getting chat history: {e}")
        return []

def get_chat_history_count() -> int:
    """Get total message count"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM chat_history")
        count = cursor.fetchone()[0]
        conn.close()
        return count
    except Exception as e:
        print(f"❌ Error getting chat count: {e}")
        return 0

def get_recent_chat_history(limit: int = 50) -> List[ChatHistory]:
    """Get recent chat history for admin display"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT id, user_id, direction, message_type, message_text, sender, created_at
            FROM chat_history 
            ORDER BY created_at DESC 
            LIMIT ?
        """, (limit,))
        
        history = []
        for row in cursor.fetchall():
            history.append(ChatHistory(
                id=row[0],
                user_id=row[1],
                direction=row[2],
                message_type=row[3],
                message_text=row[4] or "",
                sender=row[5],
                created_at=datetime.fromisoformat(row[6]) if row[6] else datetime.now()
            ))
        
        conn.close()
        return list(reversed(history))  # Return in chronological order
        
    except Exception as e:
        print(f"❌ Error getting recent chat history: {e}")
        return []
