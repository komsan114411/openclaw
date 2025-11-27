"""
Verification Script for Phase 4
Tests ApiQuotaMonitor and ChatMessage Pagination
"""
import sys
import os
import asyncio
from datetime import datetime
from bson import ObjectId

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import init_database
from models.chat_message import ChatMessage
from utils.api_monitor import ApiQuotaMonitor

async def test_api_monitor(db):
    print("\n[TEST] Testing ApiQuotaMonitor...")
    monitor = ApiQuotaMonitor(db)
    
    # Test recording
    account_id = str(ObjectId())
    success = monitor.record_api_call(
        provider="thunder",
        success=True,
        account_id=account_id,
        response_time_ms=150
    )
    print(f"Record success: {success}")
    
    monitor.record_api_call("thunder", False, account_id, response_time_ms=50)
    
    # Test getting usage
    usage = monitor.get_daily_usage("thunder", account_id)
    print(f"Daily usage: {usage}")
    
    assert usage["total_calls"] >= 2
    assert usage["successful_calls"] >= 1
    assert usage["failed_calls"] >= 1
    
    # Test quota status
    status = monitor.check_quota_status("thunder", limit=100)
    print(f"Quota status: {status}")
    assert status["used"] >= 2
    
    print("[PASS] ApiQuotaMonitor passed")

async def test_chat_pagination(db):
    print("\n[TEST] Testing ChatMessage Pagination...")
    chat_model = ChatMessage(db)
    
    account_id = str(ObjectId())
    user_id = "user123"
    
    # Create test messages
    msg_ids = []
    for i in range(10):
        msg_id = chat_model.save_message(
            account_id=account_id,
            user_id=user_id,
            message_type="text",
            content=f"Message {i}",
            sender="user"
        )
        msg_ids.append(msg_id)
        # Sleep slightly to ensure timestamp diff (though we sort by _id which is time-based)
        await asyncio.sleep(0.01)
    
    print(f"Created {len(msg_ids)} messages")
    
    # Test Page 1 (Limit 5)
    page1 = chat_model.get_messages_paginated(account_id, limit=5)
    print(f"Page 1 count: {len(page1)}")
    assert len(page1) == 5
    print(f"Page 1 first: {page1[0]['content']}") # Should be Message 9 (newest)
    print(f"Page 1 last: {page1[-1]['content']}") # Should be Message 5
    
    last_cursor = page1[-1]["_id"]
    print(f"Cursor: {last_cursor}")
    
    # Test Page 2 (Limit 5, Cursor)
    page2 = chat_model.get_messages_paginated(account_id, cursor=last_cursor, limit=5)
    print(f"Page 2 count: {len(page2)}")
    assert len(page2) == 5
    print(f"Page 2 first: {page2[0]['content']}") # Should be Message 4
    print(f"Page 2 last: {page2[-1]['content']}") # Should be Message 0
    
    # Cleanup
    chat_model.delete_messages_by_account(account_id)
    print("[PASS] ChatMessage Pagination passed")

async def main():
    try:
        db_manager = init_database()
        db = db_manager.get_db()
        
        await test_api_monitor(db)
        await test_chat_pagination(db)
        
        print("\n[SUCCESS] All Phase 4 tests passed!")
    except Exception as e:
        print(f"\n[FAIL] Tests failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
