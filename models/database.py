import os
import sqlite3
import json
from datetime import datetime
from typing import Any, Dict, List

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "storage.db")

def init_database() -> None:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # สร้างตารางเก็บประวัติแชทรายบุคคล
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            user_id TEXT NOT NULL,
            direction TEXT NOT NULL,
            message_data TEXT NOT NULL,
            sender TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

def save_chat_history(user_id: str, direction: str, message: Dict[str, Any], sender: str) -> None:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO chat_history (timestamp, user_id, direction, message_data, sender)
        VALUES (?, ?, ?, ?, ?)
    ''', (datetime.utcnow().isoformat(), user_id, direction, json.dumps(message), sender))
    conn.commit()
    conn.close()

def get_user_chat_history(user_id: str, limit: int = 5) -> List[Dict[str, Any]]:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        'SELECT direction, message_data FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
        (user_id, limit)
    )
    messages = []
    for direction, msg_json in reversed(cursor.fetchall()):
        role = "user" if direction == "in" else "assistant"
        content = json.loads(msg_json).get("text", "")
        messages.append({"role": role, "content": content})
    conn.close()
    return messages
