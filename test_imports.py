#!/usr/bin/env python3
"""
Test script to verify all imports work correctly
"""

import sys
import os

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_imports():
    """Test all critical imports"""
    errors = []
    
    print("🧪 Testing imports...")
    
    # Test config
    try:
        from config import config_manager, get_config
        print("✅ config module OK")
    except Exception as e:
        errors.append(f"❌ config: {e}")
        print(errors[-1])
    
    # Test utils
    try:
        from utils import config_manager
        print("✅ utils package OK")
    except Exception as e:
        errors.append(f"❌ utils: {e}")
        print(errors[-1])
    
    # Test models
    try:
        from models import (
            init_database, save_chat_history, 
            get_chat_history_count, LineAccountManager
        )
        print("✅ models package OK")
    except Exception as e:
        errors.append(f"❌ models: {e}")
        print(errors[-1])
    
    # Test services (may fail if dependencies not installed)
    try:
        from services.chat_bot import get_chat_response
        print("✅ services.chat_bot OK")
    except Exception as e:
        print(f"⚠️  services.chat_bot: {e} (may need dependencies)")
    
    try:
        from services.slip_checker import test_thunder_api_connection
        print("✅ services.slip_checker OK")
    except Exception as e:
        print(f"⚠️  services.slip_checker: {e} (may need dependencies)")
    
    try:
        from services.slip_formatter import create_beautiful_slip_flex_message
        print("✅ services.slip_formatter OK")
    except Exception as e:
        print(f"⚠️  services.slip_formatter: {e} (may need dependencies)")
    
    # Summary
    print("\n" + "="*50)
    if errors:
        print(f"❌ {len(errors)} critical errors found:")
        for err in errors:
            print(f"  {err}")
        return False
    else:
        print("✅ All critical imports successful!")
        return True

if __name__ == "__main__":
    success = test_imports()
    sys.exit(0 if success else 1)

