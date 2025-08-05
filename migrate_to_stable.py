#!/usr/bin/env python3
"""
Migration script to move from old system to stable PostgreSQL system
"""
import os
import sys
import json
import logging
from datetime import datetime

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from models.stable_db_manager import db_manager, ConfigModel
from utils.stable_config_manager import config_manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("migration")

def migrate_from_json():
    """Migrate configurations from JSON file if exists"""
    try:
        json_file = "storage.json"
        if os.path.exists(json_file):
            logger.info("📁 Found storage.json, migrating...")
            
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            config_store = data.get('config_store', {})
            if config_store:
                success = config_manager.update_multiple(config_store)
                if success:
                    logger.info(f"✅ Migrated {len(config_store)} configurations from JSON")
                else:
                    logger.error("❌ Failed to migrate configurations")
            
            return True
    except Exception as e:
        logger.error(f"❌ JSON migration failed: {e}")
        return False

def migrate_from_env():
    """Migrate configurations from environment variables"""
    try:
        env_configs = {
            'line_channel_secret': os.getenv('LINE_CHANNEL_SECRET', ''),
            'line_channel_access_token': os.getenv('LINE_CHANNEL_ACCESS_TOKEN', ''),
            'thunder_api_token': os.getenv('THUNDER_API_TOKEN', ''),
            'openai_api_key': os.getenv('OPENAI_API_KEY', ''),
            'ai_enabled': os.getenv('AI_ENABLED', 'true'),
            'slip_enabled': os.getenv('SLIP_ENABLED', 'true'),
            'thunder_enabled': os.getenv('THUNDER_ENABLED', 'true'),
        }
        
        # Filter out empty values
       filtered_configs = {k: v for k, v in env_configs.items() if v}
       
       if filtered_configs:
           success = config_manager.update_multiple(filtered_configs)
           if success:
               logger.info(f"✅ Migrated {len(filtered_configs)} configurations from environment")
           else:
               logger.error("❌ Failed to migrate environment configurations")
       
       return True
   except Exception as e:
       logger.error(f"❌ Environment migration failed: {e}")
       return False

def main():
   """Main migration function"""
   logger.info("🚀 Starting migration to stable PostgreSQL system...")
   
   try:
       # Initialize database
       logger.info("📊 Initializing database...")
       db_manager.create_tables()
       
       # Check current config count
       with db_manager.get_session() as session:
           current_count = session.query(ConfigModel).count()
           logger.info(f"📊 Current configuration count: {current_count}")
       
       # Migrate from JSON if needed
       if current_count == 0:
           migrate_from_json()
           migrate_from_env()
       
       # Final check
       with db_manager.get_session() as session:
           final_count = session.query(ConfigModel).count()
           logger.info(f"📊 Final configuration count: {final_count}")
       
       # Test configuration manager
       logger.info("🧪 Testing configuration manager...")
       test_configs = config_manager.get_all()
       logger.info(f"✅ Configuration manager working: {len(test_configs)} configs loaded")
       
       # Database health check
       logger.info("🏥 Running database health check...")
       health = db_manager.health_check()
       if health["status"] == "healthy":
           logger.info("✅ Database health check passed")
       else:
           logger.error(f"❌ Database health check failed: {health}")
       
       logger.info("🎉 Migration completed successfully!")
       
   except Exception as e:
       logger.error(f"❌ Migration failed: {e}")
       sys.exit(1)

if __name__ == "__main__":
   main()
