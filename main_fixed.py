# main_fixed.py - แก้ไขปัญหาการบันทึกแชท
import json
import logging
import os
import sys
import asyncio
from datetime import datetime
from typing import Dict, Any, List
from contextlib import asynccontextmanager

# ตั้งค่า logging ที่ชัดเจน
logging.basicConfig(
    level=logging.DEBUG,  # เปลี่ยนเป็น DEBUG เพื่อดู error detail
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('app.log', encoding='utf-8') if os.path.exists('.') else logging.StreamHandler()
    ]
)
logger = logging.getLogger("main_app")

from fastapi import FastAPI, Request, BackgroundTasks
from fastapi.responses import JSONResponse

# Global state
IS_READY = False
database_functions = {}

async def safe_import_modules():
    """Safely import all required modules"""
    global IS_READY, database_functions
    
    logger.info("🔄 Starting module imports...")
    
    try:
        # Import database functions
        try:
            from models.database import (
                init_database, save_chat_history, get_chat_history_count, 
                get_recent_chat_history, get_user_chat_history, test_connection
            )
            
            # เรียก init_database และรอให้เสร็จ
            logger.info("📊 Initializing MongoDB...")
            init_result = await init_database()
            
            if init_result:
                logger.info("✅ MongoDB initialized successfully")
                
                # ทดสอบการเชื่อมต่อ
                test_result = await test_connection()
                logger.info(f"🧪 Database test: {test_result}")
                
                if test_result.get('status') == 'connected':
                    database_functions = {
                        'init_database': init_database,
                        'save_chat_history': save_chat_history,
                        'get_chat_history_count': get_chat_history_count,
                        'get_recent_chat_history': get_recent_chat_history,
                        'get_user_chat_history': get_user_chat_history,
                        'test_connection': test_connection
                    }
                    logger.info("✅ Database functions imported and tested")
                else:
                    logger.error(f"❌ Database test failed: {test_result}")
                    return False
            else:
                logger.error("❌ Database initialization failed")
                return False
                
        except Exception as e:
            logger.error(f"❌ Database import failed: {e}")
            logger.exception("Database import details:")
            return False
        
        IS_READY = True
        logger.info("✅ All modules loaded successfully - System READY")
        return True
        
    except Exception as e:
        logger.error(f"❌ Critical import error: {e}")
        logger.exception("Import error details:")
        IS_READY = False
        return False

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    success = await safe_import_modules()
    if not success:
        logger.error("❌ Failed to initialize system")
    else:
        logger.info("🚀 System ready for chat history saving")
    
    yield
    
    # Shutdown
    logger.info("🛑 System shutting down...")

app = FastAPI(title="LINE OA Chat Saver", lifespan=lifespan)

async def save_incoming_message(user_id: str, direction: str, message: Dict[str, Any], sender: str):
    """บันทึกข้อความขาเข้าอย่างปลอดภัย"""
    try:
        if not IS_READY or 'save_chat_history' not in database_functions:
            logger.error("❌ Database not ready for saving chat")
            return False
            
        logger.info(f"💾 Attempting to save chat from {user_id[:8]}... ({message.get('type', 'text')})")
        
        # เรียก save_chat_history อย่างถูกต้อง
        await database_functions['save_chat_history'](user_id, direction, message, sender)
        
        logger.info(f"✅ Successfully saved chat from {user_id[:8]}...")
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to save chat from {user_id[:8] if user_id else 'unknown'}: {e}")
        logger.exception("Save chat error details:")
        return False

async def handle_message_event(event: Dict[str, Any]) -> None:
    """Handle message event with better error handling"""
    try:
        message = event.get("message", {})
        user_id = event.get("source", {}).get("userId")
        message_type = message.get("type")
        
        if not user_id:
            logger.error("❌ Missing user ID in message event")
            return
        
        logger.info(f"📨 Processing {message_type} message from {user_id[:8]}...")
        
        # บันทึกข้อความขาเข้าทันที
        save_success = await save_incoming_message(user_id, "in", message, "user")
        
        if save_success:
            logger.info(f"✅ Message from {user_id[:8]}... saved successfully")
        else:
            logger.error(f"❌ Failed to save message from {user_id[:8]}...")
        
        # ประมวลผลข้อความ (AI, slip verification ฯลฯ)
        if message_type == "text":
            user_text = message.get("text", "")
            logger.info(f"📝 Text message: {user_text[:50]}...")
            
            # ตัวอย่าง: ส่งข้อความตอบกลับ
            reply_message = {
                "type": "text", 
                "text": f"รับข้อความแล้ว: {user_text[:100]}"
            }
            
            # บันทึกข้อความตอบกลับ
            await save_incoming_message(user_id, "out", reply_message, "system")
        
        elif message_type == "image":
            logger.info(f"🖼️ Image message from {user_id[:8]}...")
            
            # ตัวอย่าง: ตอบกลับรูปภาพ
            reply_message = {
                "type": "text",
                "text": "ได้รับรูปภาพแล้ว ขอบคุณครับ"
            }
            await save_incoming_message(user_id, "out", reply_message, "system")
        
        else:
            logger.info(f"📄 {message_type} message from {user_id[:8]}...")
            
    except Exception as e:
        logger.error(f"❌ Error handling message event: {e}")
        logger.exception("Message event error details:")

async def dispatch_event_async(event: Dict[str, Any]) -> None:
    """Process LINE event with comprehensive logging"""
    if not IS_READY:
        logger.error("❌ System not ready - rejecting event")
        return
        
    try:
        event_type = event.get("type")
        logger.info(f"🎯 Processing event: {event_type}")
        
        if event_type == "message":
            await handle_message_event(event)
        else:
            logger.info(f"📋 Received {event_type} event - not processing")
            
    except Exception as e:
        logger.error(f"❌ Event processing error: {e}")
        logger.exception("Event processing details:")

@app.post("/line/webhook")
async def line_webhook(request: Request, background_tasks: BackgroundTasks) -> JSONResponse:
    """LINE webhook endpoint with enhanced logging"""
    if not IS_READY:
        logger.error("❌ System not ready")
        return JSONResponse(
            content={"status": "error", "message": "System not ready"}, 
            status_code=503
        )

    try:
        body = await request.body()
        payload = json.loads(body.decode("utf-8"))
        events = payload.get("events", [])
        
        logger.info(f"🔔 Webhook received {len(events)} events")
        
        # Process events
        for i, event in enumerate(events):
            logger.info(f"📋 Processing event {i+1}/{len(events)}")
            background_tasks.add_task(dispatch_event_async, event)
            
        return JSONResponse(
            content={"status": "ok", "message": f"{len(events)} events queued"}
        )
        
    except json.JSONDecodeError as e:
        logger.error(f"❌ JSON decode error: {e}")
        return JSONResponse(
            content={"status": "error", "message": "Invalid JSON"}, 
            status_code=400
        )
    except Exception as e:
        logger.error(f"❌ Webhook error: {e}")
        logger.exception("Webhook error details:")
        return JSONResponse(
            content={"status": "error", "message": "Internal error"}, 
            status_code=500
        )

@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "LINE OA Chat Saver", "ready": IS_READY}

@app.get("/health")
async def health_check():
    """Health check with database status"""
    try:
        db_status = "disconnected"
        if IS_READY and 'test_connection' in database_functions:
            test_result = await database_functions['test_connection']()
            db_status = test_result.get('status', 'error')
            
        return {
            "status": "ok" if IS_READY else "not_ready",
            "database": db_status,
            "ready": IS_READY,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "ready": False,
            "timestamp": datetime.now().isoformat()
        }

@app.get("/admin/chat-count")
async def get_chat_count():
    """Get total chat messages count"""
    try:
        if 'get_chat_history_count' in database_functions:
            count = await database_functions['get_chat_history_count']()
            return {"status": "success", "count": count}
        else:
            return {"status": "error", "message": "Database not ready"}
    except Exception as e:
        logger.error(f"❌ Get chat count error: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/admin/recent-chats")
async def get_recent_chats(limit: int = 10):
    """Get recent chat history"""
    try:
        if 'get_recent_chat_history' in database_functions:
            chats = await database_functions['get_recent_chat_history'](limit)
            
            # Convert to serializable format
            chat_list = []
            for chat in chats:
                chat_data = {
                    "user_id": getattr(chat, 'user_id', None),
                    "direction": getattr(chat, 'direction', None),
                    "message_type": getattr(chat, 'message_type', None),
                    "message_text": getattr(chat, 'message_text', None),
                    "sender": getattr(chat, 'sender', None),
                    "created_at": getattr(chat, 'created_at', None).isoformat() if getattr(chat, 'created_at', None) else None
                }
                chat_list.append(chat_data)
            
            return {"status": "success", "chats": chat_list, "count": len(chat_list)}
        else:
            return {"status": "error", "message": "Database not ready"}
    except Exception as e:
        logger.error(f"❌ Get recent chats error: {e}")
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    import uvicorn
    
    print("🚀 Starting LINE OA Chat Saver...")
    print("🔗 Health Check: http://localhost:8000/health")
    print("🔗 Chat Count: http://localhost:8000/admin/chat-count")
    print("🔗 Recent Chats: http://localhost:8000/admin/recent-chats")
    
    try:
        uvicorn.run(
            "main_fixed:app",
            host="0.0.0.0",
            port=int(os.getenv("PORT", 8000)),
            workers=1,
            reload=False,
            log_level="info",
            access_log=True
        )
    except Exception as e:
        logger.error(f"❌ Server startup failed: {e}")
        sys.exit(1)
