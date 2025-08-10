import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from datetime import datetime

async def migrate_data():
    """Migrate existing data to multi-account structure"""
    
    # Connect to MongoDB
    client = AsyncIOMotorClient(os.getenv('MONGODB_URI'))
    db = client.lineoa
    
    print("Starting migration...")
    
    # 1. Create default account from existing config
    existing_config = await db.config_store.find_one({})
    
    if existing_config:
        default_account = {
            "display_name": "Default Account (Migrated)",
            "channel_secret": existing_config.get("line_channel_secret"),
            "channel_access_token": existing_config.get("line_channel_access_token"),
            "thunder_api_token": existing_config.get("thunder_api_token"),
            "openai_api_key": existing_config.get("openai_api_key"),
            "kbank_consumer_id": existing_config.get("kbank_consumer_id"),
            "kbank_consumer_secret": existing_config.get("kbank_consumer_secret"),
            "ai_prompt": existing_config.get("ai_prompt", "คุณเป็นผู้ช่วยที่เป็นมิตร"),
            "ai_enabled": existing_config.get("ai_enabled", False),
            "slip_enabled": existing_config.get("slip_enabled", False),
            "thunder_enabled": existing_config.get("thunder_enabled", True),
            "kbank_enabled": existing_config.get("kbank_enabled", False),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        result = await db.line_accounts.insert_one(default_account)
        default_account_id = str(result.inserted_id)
        print(f"Created default account: {default_account_id}")
        
        # 2. Update all chat history with default account_id
        update_result = await db.chat_history.update_many(
            {"account_id": {"$exists": False}},
            {"$set": {"account_id": default_account_id}}
        )
        print(f"Updated {update_result.modified_count} chat history records")
        
        # 3. Update all users with default account_id
        update_result = await db.users.update_many(
            {"account_id": {"$exists": False}},
            {"$set": {"account_id": default_account_id}}
        )
        print(f"Updated {update_result.modified_count} user records")
    
    print("Migration completed!")
    
if __name__ == "__main__":
    asyncio.run(migrate_data())
