"""
Configuration module for LINE OA application
Provides centralized configuration management
"""

from utils.config_manager import config_manager

# Export config_store for backward compatibility
config_store = config_manager.config

def get_config():
    """Get current configuration"""
    return config_manager.config

def load_config():
    """Load configuration (for backward compatibility)"""
    return config_manager.config

def update_config(key: str, value):
    """Update a single configuration value"""
    return config_manager.update(key, value)

def update_multiple_configs(updates: dict):
    """Update multiple configuration values"""
    return config_manager.update_multiple(updates)

__all__ = [
    'config_store',
    'get_config',
    'load_config',
    'update_config',
    'update_multiple_configs',
    'config_manager'
]

