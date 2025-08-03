from utils.config_manager import config_manager

# ใช้ config_manager แทน
config_store = config_manager.config

def get_config():
    """ฟังก์ชันสำหรับดึง config ล่าสุด"""
    return config_manager.config
