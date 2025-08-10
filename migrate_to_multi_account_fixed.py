import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from datetime import datetime
from bson import ObjectId

async def migrate_data():
    """Migrate existing data to multi-account structure"""
    
    # Connect to MongoDB
    client = AsyncIOMotorClient(os.getenv('MONGODB_URI'))
    db = client.lineoa
    
    print("Starting migration...")
    
    # 1. Check if default account exists
    default_account = await db.line_accounts.find_one({"display_name": "Default Account (Migrated)"})
    
    if not default_account:
        # Create default account from existing config
        existing_config = await db.config_store.find({}).to_list(None)
        
        config_dict = {}
        for doc in existing_config:
            config_dict[doc.get("config_key")] = doc.get("config_value")
        
        default_account_doc = {
            "display_name": "Default Account (Migrated)",
            "channel_secret": config_dict.get("line_channel_secret"),
            "channel_access_token": config_dict.get("line_channel_access_token"),
            "thunder_api_token": config_dict.get("thunder_api_token"),
            "openai_api_key": config_dict.get("openai_api_key"),
            "kbank_consumer_id": config_dict.get("kbank_consumer_id"),
            "kbank_consumer_secret": config_dict.get("kbank_consumer_secret"),
            "ai_prompt": config_dict.get("ai_prompt", "คุณเป็นผู้ช่วยที่เป็นมิตร"),
            "ai_enabled": config_dict.get("ai_enabled", False),
            "slip_enabled": config_dict.get("slip_enabled", False),
            "thunder_enabled": config_dict.get("thunder_enabled", True),
            "kbank_enabled": config_dict.get("kbank_enabled", False),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        result = await db.line_accounts.insert_one(default_account_doc)
        default_account_id = str(result.inserted_id)
        print(f"Created default account: {default_account_id}")
    else:
        default_account_id = str(default_account["_id"])
        print(f"Using existing default account: {default_account_id}")
    
    # 2. Update chat history without account_id
    update_result = await db.chat_history.update_many(
        {"account_id": {"$exists": False}},
        {"$set": {"account_id": default_account_id}}
    )
    print(f"Updated {update_result.modified_count} chat history records")
    
    # 3. Update users collection
    update_result = await db.users.update_many(
        {"account_ids": {"$exists": False}},
        {
            "$set": {"last_account_id": default_account_id},
            "$addToSet": {"account_ids": default_account_id}
        }
    )
    print(f"Updated {update_result.modified_count} user records")
    
    # 4. Create indexes
    await db.chat_history.create_index([("account_id", 1)])
    await db.line_accounts.create_index([("display_name", 1)])
    print("Created indexes")
    
    print("Migration completed!")
    
if __name__ == "__main__":
    asyncio.run(migrate_data())
