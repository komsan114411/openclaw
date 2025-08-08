# check_chat_history.py
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
import certifi
from datetime import datetime, timedelta

async def check_chat_history():
    """Check saved chat history"""
    mongodb_uri = os.getenv('MONGODB_URI')
    
    if not mongodb_uri:
        print("❌ MONGODB_URI not set")
        return
    
    try:
        client = AsyncIOMotorClient(
            mongodb_uri,
            tlsCAFile=certifi.where(),
            serverSelectionTimeoutMS=10000
        )
        
        await client.admin.command('ping')
        print("✅ Connected to MongoDB")
        
        db = client.lineoa
        
        # Count total messages
        total = await db.chat_history.count_documents({})
        print(f"\n📊 Total messages: {total}")
        
        # Get recent messages
        print("\n📝 Recent messages (last 10):")
        cursor = db.chat_history.find().sort("created_at", -1).limit(10)
        
        async for doc in cursor:
            print(f"\n  User: {doc.get('user_id', 'Unknown')[:10]}...")
            print(f"  Direction: {doc.get('direction')}")
            print(f"  Type: {doc.get('message_type')}")
            print(f"  Text: {doc.get('message_text', '')[:50]}...")
            print(f"  Sender: {doc.get('sender')}")
            print(f"  Time: {doc.get('created_at')}")
            print("  " + "-" * 40)
        
        # Count by sender
        print("\n📊 Messages by sender:")
        pipeline = [
            {"$group": {"_id": "$sender", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}}
        ]
        
        async for doc in db.chat_history.aggregate(pipeline):
            print(f"  {doc['_id']}: {doc['count']} messages")
        
        # Count today's messages
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        today_count = await db.chat_history.count_documents({
            "created_at": {"$gte": today}
        })
        print(f"\n📊 Today's messages: {today_count}")
        
        client.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    # Load .env
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except:
        pass
    
    asyncio.run(check_chat_history())
