# utils/stable_config_manager.py - Production Config Manager
import logging
from typing import Dict, Any, Optional
from models.stable_db_manager import db_manager, ConfigModel

logger = logging.getLogger("stable_config_manager")

class ProductionConfigManager:
    """Production-ready configuration manager with PostgreSQL persistence"""
    
    def __init__(self):
        self._cache: Dict[str, Any] = {}
        self._load_cache()
    
    def _load_cache(self):
        """Load all configurations into memory cache"""
        try:
            with db_manager.get_session() as session:
                configs = session.query(ConfigModel).all()
                
                self._cache = {}
                for config in configs:
                    # Parse value based on type
                    if config.value_type == 'boolean':
                        self._cache[config.key] = self._parse_bool(config.value)
                    elif config.value_type == 'json':
                        import json
                        try:
                            self._cache[config.key] = json.loads(config.value) if config.value else {}
                        except:
                            self._cache[config.key] = {}
                    elif config.value_type == 'number':
                        try:
                            self._cache[config.key] = float(config.value) if config.value else 0
                        except:
                            self._cache[config.key] = 0
                    else:
                        self._cache[config.key] = config.value or ''
                
                logger.info(f"📊 Loaded {len(self._cache)} configurations from database")
                
        except Exception as e:
            logger.error(f"❌ Failed to load configuration cache: {e}")
            self._cache = {}
    
    def _parse_bool(self, value: Any) -> bool:
        """Parse boolean values safely"""
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.lower().strip() in ["true", "1", "yes", "on", "enabled"]
        return bool(value)
    
    def get(self, key: str, default=None):
        """Get configuration value with caching"""
        value = self._cache.get(key)
        if value is None:
            # Try to reload from database if key not found
            self._load_single_config(key)
            value = self._cache.get(key)
        
        return value if value is not None else default
    
    def _load_single_config(self, key: str):
        """Load single configuration from database"""
        try:
            with db_manager.get_session() as session:
                config = session.query(ConfigModel).filter(ConfigModel.key == key).first()
                if config:
                    if config.value_type == 'boolean':
                        self._cache[key] = self._parse_bool(config.value)
                    else:
                        self._cache[key] = config.value or ''
        except Exception as e:
            logger.error(f"❌ Failed to load single config {key}: {e}")
    
    def update(self, key: str, value: Any) -> bool:
        """Update single configuration"""
        try:
            with db_manager.get_session() as session:
                config = session.query(ConfigModel).filter(ConfigModel.key == key).first()
                
                if config:
                    # Update existing
                    if config.value_type == 'boolean':
                        config.value = str(self._parse_bool(value))
                        self._cache[key] = self._parse_bool(value)
                    else:
                        config.value = str(value) if value is not None else ''
                        self._cache[key] = str(value) if value is not None else ''
                    
                    config.updated_at = datetime.utcnow() if 'datetime' in globals() else None
                else:
                    # Create new
                    value_type = 'boolean' if isinstance(value, bool) else 'string'
                    
                    config = ConfigModel(
                        key=key,
                        value=str(value) if value is not None else '',
                        value_type=value_type,
                        description=f'Configuration for {key}'
                    )
                    session.add(config)
                    self._cache[key] = value
                
                session.commit()
                logger.info(f"✅ Updated configuration: {key}")
                return True
                
        except Exception as e:
            logger.error(f"❌ Failed to update configuration {key}: {e}")
            return False
    
    def update_multiple(self, updates: Dict[str, Any]) -> bool:
        """Update multiple configurations in a single transaction"""
        try:
            with db_manager.get_session() as session:
                updated_count = 0
                
                for key, value in updates.items():
                    config = session.query(ConfigModel).filter(ConfigModel.key == key).first()
                    
                    if config:
                        # Update existing
                        if config.value_type == 'boolean':
                            config.value = str(self._parse_bool(value))
                            self._cache[key] = self._parse_bool(value)
                        else:
                            config.value = str(value) if value is not None else ''
                            self._cache[key] = str(value) if value is not None else ''
                        
                        config.updated_at = datetime.utcnow() if 'datetime' in globals() else None
                        updated_count += 1
                    else:
                        # Create new
                        value_type = 'boolean' if isinstance(value, bool) else 'string'
                        
                        config = ConfigModel(
                            key=key,
                            value=str(value) if value is not None else '',
                            value_type=value_type,
                            description=f'Configuration for {key}'
                        )
                        session.add(config)
                        self._cache[key] = value
                        updated_count += 1
                
                session.commit()
                logger.info(f"✅ Updated {updated_count} configurations")
                return True
                
        except Exception as e:
            logger.error(f"❌ Failed to update multiple configurations: {e}")
            return False
    
    def get_all(self) -> Dict[str, Any]:
        """Get all configurations"""
        return self._cache.copy()
    
    def reload(self):
        """Reload all configurations from database"""
        self._load_cache()
        logger.info("🔄 Configuration cache reloaded")

# Global instance
config_manager = ProductionConfigManager()
