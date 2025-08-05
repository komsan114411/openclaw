# utils/config_manager.py
import logging
import os
from typing import Dict, Any, Optional
from models.postgres_models import db_manager, ConfigModel

logger = logging.getLogger("config_manager")

class PostgreSQLConfigManager:
    """Configuration Manager ที่ใช้ PostgreSQL เป็นหลัก"""
    
    def __init__(self):
        self._cache = {}
        self._load_from_database()
    
    def _load_from_database(self):
        """โหลดค่า config จาก PostgreSQL"""
        try:
            db = db_manager.get_session()
            configs = db.query(ConfigModel).all()
            
            self._cache = {}
            for config in configs:
                if config.value_type == 'boolean':
                    self._cache[config.key] = self._str_to_bool(config.value)
                elif config.value_type == 'json':
                    import json
                    try:
                        self._cache[config.key] = json.loads(config.value) if config.value else {}
                    except:
                        self._cache[config.key] = {}
                else:
                    self._cache[config.key] = config.value or ''
            
            logger.info(f"✅ Loaded {len(self._cache)} configurations from PostgreSQL")
            db.close()
            
            # ถ้าไม่มี config ให้สร้างค่าเริ่มต้น
            if len(self._cache) == 0:
                self._create_default_configs()
                
        except Exception as e:
            logger.error(f"❌ Failed to load from PostgreSQL: {e}")
            self._cache = {}
    
    def _create_default_configs(self):
        """สร้างค่า config เริ่มต้นจาก environment variables (ครั้งแรกเท่านั้น)"""
        try:
            db = db_manager.get_session()
            
            default_configs = [
                # LINE Configuration
                ('line_channel_secret', os.getenv('LINE_CHANNEL_SECRET', ''), 'string', 'LINE Channel Secret'),
                ('line_channel_access_token', os.getenv('LINE_CHANNEL_ACCESS_TOKEN', ''), 'string', 'LINE Channel Access Token'),
                
                # Thunder API Configuration
                ('thunder_api_token', os.getenv('THUNDER_API_TOKEN', ''), 'string', 'Thunder API Token'),
                ('thunder_enabled', 'true', 'boolean', 'Enable Thunder API'),
                
                # OpenAI Configuration
                ('openai_api_key', os.getenv('OPENAI_API_KEY', ''), 'string', 'OpenAI API Key'),
                ('ai_enabled', 'true', 'boolean', 'Enable AI Chat'),
                ('ai_prompt', 'คุณเป็นผู้ช่วยระบบชำระเงินที่เชี่ยวชาญเรื่องการโอนเงินและตรวจสอบสลิป ตอบเฉพาะเรื่องที่เกี่ยวข้องกับธุรกิจเท่านั้น กรุณาตอบด้วยภาษาไทยที่สุภาพและเป็นกันเอง', 'string', 'AI System Prompt'),
                
                # System Configuration
                ('slip_enabled', 'true', 'boolean', 'Enable Slip Verification System'),
                ('system_name', 'LINE OA Middleware', 'string', 'System Name'),
                ('timezone', 'Asia/Bangkok', 'string', 'System Timezone'),
                ('default_language', 'th', 'string', 'Default Language'),
            ]
            
            created_count = 0
            for key, value, value_type, description in default_configs:
                # ตรวจสอบว่ามีอยู่แล้วหรือไม่
                existing = db.query(ConfigModel).filter(ConfigModel.key == key).first()
                if not existing:
                    config = ConfigModel(
                        key=key,
                        value=value,
                        value_type=value_type,
                        description=description
                    )
                    db.add(config)
                    created_count += 1
            
            db.commit()
            db.close()
            
            logger.info(f"✅ Created {created_count} default configurations")
            
            # โหลดใหม่หลังจากสร้าง
            self._load_from_database()
            
        except Exception as e:
            logger.error(f"❌ Failed to create default configs: {e}")
            if 'db' in locals():
                db.rollback()
                db.close()
    
    def _str_to_bool(self, value: str) -> bool:
        """แปลง string เป็น boolean"""
        if isinstance(value, bool):
            return value
        return str(value).lower() in ['true', '1', 'yes', 'on', 'enabled']
    
    def get(self, key: str, default=None):
        """ดึงค่า configuration"""
        return self._cache.get(key, default)
    
    def get_all(self) -> Dict[str, Any]:
        """ดึงค่า configuration ทั้งหมด"""
        return self._cache.copy()
    
    def update(self, key: str, value: Any) -> bool:
        """อัปเดตค่า configuration เดียว"""
        try:
            db = db_manager.get_session()
            
            config = db.query(ConfigModel).filter(ConfigModel.key == key).first()
            
            if config:
                # อัปเดตค่าเดิม
                if config.value_type == 'boolean':
                    config.value = str(self._str_to_bool(value))
                    self._cache[key] = self._str_to_bool(value)
                else:
                    config.value = str(value) if value else ''
                    self._cache[key] = str(value) if value else ''
                
                from datetime import datetime
                config.updated_at = datetime.utcnow()
            else:
                # สร้างใหม่
                value_type = 'boolean' if isinstance(value, bool) else 'string'
                config = ConfigModel(
                    key=key,
                    value=str(value) if value else '',
                    value_type=value_type,
                    description=f'Configuration for {key}'
                )
                db.add(config)
                self._cache[key] = value
            
            db.commit()
            db.close()
            
            logger.info(f"✅ Updated config: {key}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to update config {key}: {e}")
            if 'db' in locals():
                db.rollback()
                db.close()
            return False
    
    def update_multiple(self, updates: Dict[str, Any]) -> bool:
        """อัปเดตหลายค่าพร้อมกัน"""
        try:
            db = db_manager.get_session()
            
            updated_count = 0
            for key, value in updates.items():
                config = db.query(ConfigModel).filter(ConfigModel.key == key).first()
                
                if config:
                    # อัปเดตค่าเดิม
                    if config.value_type == 'boolean':
                        config.value = str(self._str_to_bool(value))
                        self._cache[key] = self._str_to_bool(value)
                    else:
                        config.value = str(value) if value else ''
                        self._cache[key] = str(value) if value else ''
                    
                    from datetime import datetime
                    config.updated_at = datetime.utcnow()
                    updated_count += 1
                else:
                    # สร้างใหม่
                    value_type = 'boolean' if isinstance(value, bool) else 'string'
                    config = ConfigModel(
                        key=key,
                        value=str(value) if value else '',
                        value_type=value_type,
                        description=f'Configuration for {key}'
                    )
                    db.add(config)
                    self._cache[key] = value
                    updated_count += 1
            
            db.commit()
            db.close()
            
            logger.info(f"✅ Updated {updated_count} configurations")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to update multiple configs: {e}")
            if 'db' in locals():
                db.rollback()
                db.close()
            return False
    
    def delete(self, key: str) -> bool:
        """ลบค่า configuration"""
        try:
            db = db_manager.get_session()
            config = db.query(ConfigModel).filter(ConfigModel.key == key).first()
            
            if config:
                db.delete(config)
                db.commit()
                
                if key in self._cache:
                    del self._cache[key]
                
                logger.info(f"✅ Deleted config: {key}")
                db.close()
                return True
            else:
                db.close()
                return False
                
        except Exception as e:
            logger.error(f"❌ Failed to delete config {key}: {e}")
            if 'db' in locals():
                db.rollback()
                db.close()
            return False
    
    def reload(self):
        """รีโหลดค่า configuration จากฐานข้อมูล"""
        self._load_from_database()
        logger.info("🔄 Configuration reloaded from PostgreSQL")

# สร้าง instance เดียว
config_manager = PostgreSQLConfigManager()
