import os
import sqlite3
from typing import Any, Dict, List

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "storage.db")

def init_database() -> None:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # เพิ่มตารางเพื่อเก็บ chat history รายบุคคล
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
    
    # เพิ่มตารางสำหรับ config (สามารถใช้ใน main ได้)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS config_store (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    ''')
    
    conn.commit()
    conn.close()

def save_chat_history(user_id: str, direction: str, message: Dict[str, Any], sender: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO chat_history (timestamp, user_id, direction, message_data, sender)
        VALUES (?, ?, ?, ?, ?)
    ''', (datetime.utcnow().isoformat(), user_id, direction, json.dumps(message), sender))
    conn.commit()
    conn.close()

def get_user_chat_history(user_id: str, limit: int = 10) -> List[Dict[str, Any]]:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('SELECT direction, message_data FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', (user_id, limit))
    history = []
    for row in reversed(cursor.fetchall()):
        history.append({"role": "user" if row[0] == "in" else "assistant", "content": json.loads(row[1]).get("text", "")})
    conn.close()
    return history
