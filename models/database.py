# models/database.py
import os
import sqlite3
import json
from datetime import datetime
from typing import Any, Dict, List

# กำหนดพาธฐานข้อมูลให้ชัดเจน (โฟลเดอร์โปรเจ็กต์ระดับบน)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "storage.db")

def init_database() -> None:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            user_id TEXT NOT NULL,
            direction TEXT NOT NULL,
            message_data TEXT NOT NULL,
            sender TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

def save_chat_history(user_id: str, direction: str, message: Dict[str, Any], sender: str) -> None:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO chat_history (timestamp, user_id, direction, message_data, sender)
        VALUES (?, ?, ?, ?, ?)
    """, (datetime.utcnow().isoformat(), user_id, direction, json.dumps(message), sender))
    conn.commit()
    conn.close()

def get_user_chat_history(user_id: str, limit: int = 5) -> List[Dict[str, Any]]:
    """ดึงประวัติแชทของ user_id นั้น ๆ โดยเอาเฉพาะข้อความ text"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT direction, message_data FROM chat_history WHERE user_id = ? "
        "ORDER BY created_at DESC LIMIT ?", (user_id, limit)
    )
    messages: List[Dict[str, str]] = []
    for direction, msg_json in reversed(cursor.fetchall()):
        role = "user" if direction == "in" else "assistant"
        content = json.loads(msg_json).get("text", "")
        messages.append({"role": role, "content": content})
    conn.close()
    return messages

def get_chat_history_count() -> int:
    """คืนจำนวนข้อความทั้งหมดในฐานข้อมูล"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM chat_history")
    count = cursor.fetchone()[0]
    conn.close()
    return count

def get_recent_chat_history(limit: int = 50) -> List[Dict[str, Any]]:
    """คืนประวัติการสนทนาล่าสุดทุกคน (ใช้ในหน้า admin แสดงตาราง)"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT user_id, direction, message_data, sender, created_at "
        "FROM chat_history ORDER BY created_at DESC LIMIT ?", (limit,)
    )
    messages: List[Dict[str, Any]] = []
    for user_id, direction, msg_json, sender, created_at in reversed(cursor.fetchall()):
        msg = json.loads(msg_json)
        messages.append({
            "user_id": user_id,
            "direction": direction,
            "message": msg.get("text", ""),
            "sender": sender,
            "created_at": created_at
        })
    conn.close()
    return messages
