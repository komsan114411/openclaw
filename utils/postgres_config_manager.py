# utils/postgres_config_manager.py
import logging
from typing import Dict, Any, Optional, Union, List
from models.postgres_models import db_manager, ConfigModel

logger = logging.getLogger("postgres_config_manager")

class PostgreSQLConfigManager:
    """Configuration Manager ที่ใช้ PostgreSQL เป็น backend"""
    
    def __init__(self):
        self._cache = {}
        self._load_cache()
    
    def _load_cache(self):
        """โหลดการตั้งค่าทั้งหมดมาไว้ใน memory cache"""
        try:
            db = db_manager.get_session()
            configs = db.query(ConfigModel).all()
            
            self._cache = {}
            for config in configs:
                # แปลงค่าตาม type
                if config.value_type == 'boolean':
                    self._cache[config.key] = self._parse_bool(config.value)
                elif config.value_type == 'json':
                    import json
                    try:
                        self._cache[config.key] = json.loads(config.value) if config.value else {}
                    except:
                        self._cache[config.key] = {}
                else:
                    self._cache[config.key] = config.value or ''
            
            logger.info(f"📊 Loaded {len(self._cache)} configurations from database")
            db.close()
            
        except Exception as e:
            logger.error(f"❌ Failed to load cache: {e}")
            self._cache = {}
    
    def _parse_bool(self, value: Any) -> bool:
        """แปลง string เป็น boolean อย่างถูกต้อง"""
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            value_lower = value.lower().strip()
            return value_lower in ["true", "1", "yes", "on", "enabled"]
        return bool(value)
    
    def get(self, key: str, default=None):
        """ดึงค่า configuration"""
        value = self._cache.get(key)
        return value if value is not None else default
    
    def update(self, key: str, value: Any) -> bool:
        """อัปเดตค่า configuration เดียว"""
        try:
            db = db_manager.get_session()
            
            # หาการตั้งค่าที่มีอยู่
            config = db.query(ConfigModel).filter(ConfigModel.key == key).first()
            
            if config:
                # อัปเดตค่าเดิม
                if config.value_type == 'boolean':
                    config.value = str(self._parse_bool(value))
                    self._cache[key] = self._parse_bool(value)
                elif config.value_type == 'json':
                    import json
                    config.value = json.dumps(value) if value else '{}'
                    self._cache[key] = value
                else:
                    config.value = str(value) if value else ''
                    self._cache[key] = str(value) if value else ''
                
                from datetime import datetime
                config.updated_at = datetime.utcnow()
            else:
                # สร้างใหม่
                value_type = 'boolean' if isinstance(value, bool) else 'string'
                if value_type == 'boolean':
                    stored_value = str(self._parse_bool(value))
                    cached_value = self._parse_bool(value)
                else:
                    stored_value = str(value) if value else ''
                    cached_value = str(value) if value else ''
                
                config = ConfigModel(
                    key=key,
                    value=stored_value,
                    value_type=value_type,
                    description=f'Auto-created config for {key}'
                )
                db.add(config)
                self._cache[key] = cached_value
            
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
                        config.value = str(self._parse_bool(value))
                        self._cache[key] = self._parse_bool(value)
                    elif config.value_type == 'json':
                        import json
                        config.value = json.dumps(value) if value else '{}'
                        self._cache[key] = value
                    else:
                        config.value = str(value) if value else ''
                        self._cache[key] = str(value) if value else ''
                    
                    from datetime import datetime
                    config.updated_at = datetime.utcnow()
                    updated_count += 1
                else:
                    # สร้างใหม่
                    value_type = 'boolean' if isinstance(value, bool) else 'string'
                    if value_type == 'boolean':
                        stored_value = str(self._parse_bool(value))
                        cached_value = self._parse_bool(value)
                    else:
                        stored_value = str(value) if value else ''
                        cached_value = str(value) if value else ''
                    
                    config = ConfigModel(
                        key=key,
                        value=stored_value,
                        value_type=value_type,
                        description=f'Auto-created config for {key}'
                    )
                    db.add(config)
                    self._cache[key] = cached_value
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
        """ลบการตั้งค่า"""
        try:
            db = db_manager.get_session()
            config = db.query(ConfigModel).filter(ConfigModel.key == key).first()
            
            if config:
                db.delete(config)
                db.commit()
                
                # ลบจาก cache
                if key in self._cache:
                    del self._cache[key]
                
                logger.info(f"✅ Deleted config: {key}")
                db.close()
                return True
            else:
                logger.warning(f"⚠️ Config not found: {key}")
                db.close()
                return False
                
        except Exception as e:
            logger.error(f"❌ Failed to delete config {key}: {e}")
            if 'db' in locals():
                db.rollback()
                db.close()
            return False
    
    def get_all(self) -> Dict[str, Any]:
        """ดึงการตั้งค่าทั้งหมด"""
        return self._cache.copy()
    
    def reload_cache(self):
        """รีโหลด cache จากฐานข้อมูล"""
        self._load_cache()
        logger.info("🔄 Configuration cache reloaded")

# สร้าง instance เดียวใช้ทั่วระบบ
config_manager = PostgreSQLConfigManager()
