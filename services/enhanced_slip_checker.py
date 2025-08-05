# services/enhanced_slip_checker.py
import logging
import re
from typing import Dict, Any, Optional
from utils.config_manager import config_manager

logger = logging.getLogger("enhanced_slip_checker")

# API failure tracking
api_failure_cache = {
    "thunder": {"failures": 0, "last_failure": 0},
    "kbank": {"failures": 0, "last_failure": 0}
}

def get_api_status_summary():
    """ดึงสรุปสถานะ API"""
    try:
        thunder_token = config_manager.get("thunder_api_token", "").strip()
        thunder_enabled = config_manager.get("thunder_enabled", True)
        
        kbank_id = config_manager.get("kbank_consumer_id", "").strip()
        kbank_secret = config_manager.get("kbank_consumer_secret", "").strip()
        kbank_enabled = config_manager.get("kbank_enabled", False)
        
        return {
            "thunder": {
                "name": "Thunder API",
                "enabled": thunder_enabled,
                "configured": bool(thunder_token),
                "connected": bool(thunder_token and thunder_enabled),
                "recent_failures": api_failure_cache["thunder"]["failures"],
                "last_failure": api_failure_cache["thunder"]["last_failure"],
                "recently_failed": api_failure_cache["thunder"]["failures"] > 0
            },
            "kbank": {
                "name": "KBank API",
                "enabled": kbank_enabled,
                "configured": bool(kbank_id and kbank_secret),
                "connected": bool(kbank_id and kbank_secret and kbank_enabled),
                "recent_failures": api_failure_cache["kbank"]["failures"],
                "last_failure": api_failure_cache["kbank"]["last_failure"],
                "recently_failed": api_failure_cache["kbank"]["failures"] > 0
            }
        }
    except Exception as e:
        logger.error(f"❌ Error in get_api_status_summary: {e}")
        return {
            "thunder": {"enabled": False, "configured": False, "connected": False, "recent_failures": 0},
            "kbank": {"enabled": False, "configured": False, "connected": False, "recent_failures": 0}
        }

def reset_api_failure_cache():
    """รีเซ็ต API failure cache"""
    global api_failure_cache
    api_failure_cache = {
        "thunder": {"failures": 0, "last_failure": 0},
        "kbank": {"failures": 0, "last_failure": 0}
    }
    logger.info("🔄 API failure cache reset")
    return True

def extract_slip_info_from_text(text: str) -> Dict[str, Optional[str]]:
    """ดึงข้อมูลสลิปจากข้อความ"""
    try:
        # ตรวจหา transaction reference patterns
        trans_ref_patterns = [
            r'ref[\s:]*([0-9A-Za-z]{10,})',
            r'reference[\s:]*([0-9A-Za-z]{10,})',
            r'เลขที่อ้างอิง[\s:]*([0-9A-Za-z]{10,})',
            r'หมายเลขอ้างอิง[\s:]*([0-9A-Za-z]{10,})',
            r'([0-9A-Za-z]{12,})'  # Generic long alphanumeric
        ]
        
        # ตรวจหา bank code patterns
        bank_patterns = [
            r'bank[\s:]*([0-9]{3})',
            r'ธนาคาร[\s:]*([0-9]{3})',
            r'([0-9]{3})[\s]*ธนาคาร'
        ]
        
        trans_ref = None
        bank_code = None
        
        text_lower = text.lower()
        
        # หา transaction reference
        for pattern in trans_ref_patterns:
            match = re.search(pattern, text_lower)
            if match:
                trans_ref = match.group(1)
                break
        
        # หา bank code
        for pattern in bank_patterns:
            match = re.search(pattern, text_lower)
            if match:
                bank_code = match.group(1)
                break
        
        # Default bank codes if not found
        if not bank_code and trans_ref:
            # ถ้าไม่เจอ bank code แต่เจอ trans_ref ให้ลอง default banks
            bank_code = "004"  # Default to KBank
        
        logger.info(f"📝 Extracted slip info: bank_code={bank_code}, trans_ref={trans_ref}")
        
        return {
            "bank_code": bank_code,
            "trans_ref": trans_ref
        }
        
    except Exception as e:
        logger.error(f"❌ Error extracting slip info: {e}")
        return {"bank_code": None, "trans_ref": None}

def verify_slip_multiple_providers(message_id: str = None, test_image_data: bytes = None, 
                                 bank_code: str = None, trans_ref: str = None) -> Dict[str, Any]:
    """ตรวจสอบสลิปด้วย API หลายตัว"""
    try:
        logger.info("🔍 Starting slip verification with multiple providers")
        
        # ตรวจสอบว่าระบบเปิดอยู่
        if not config_manager.get("slip_enabled", False):
            return {"status": "error", "message": "ระบบตรวจสอบสลิปถูกปิดใช้งาน"}
        
        results = []
        
        # ลอง Thunder API ก่อน (สำหรับรูปภาพ)
        if message_id or test_image_data:
            thunder_enabled = config_manager.get("thunder_enabled", True)
            thunder_token = config_manager.get("thunder_api_token", "").strip()
            
            if thunder_enabled and thunder_token:
                try:
                    from services.slip_checker import verify_slip_with_thunder
                    logger.info("⚡ Trying Thunder API...")
                    result = verify_slip_with_thunder(message_id, test_image_data)
                    if result and result.get("status") in ["success", "duplicate"]:
                        logger.info("✅ Thunder API verification successful")
                        return result
                    else:
                        logger.warning(f"⚠️ Thunder API failed: {result.get('message', 'Unknown error')}")
                        results.append(("Thunder", result))
                except Exception as e:
                    logger.error(f"❌ Thunder API error: {e}")
                    api_failure_cache["thunder"]["failures"] += 1
                    results.append(("Thunder", {"status": "error", "message": str(e)}))
        
        # ลอง KBank API (สำหรับข้อมูลธนาคาร)
        if bank_code and trans_ref:
            kbank_enabled = config_manager.get("kbank_enabled", False)
            kbank_configured = bool(config_manager.get("kbank_consumer_id") and config_manager.get("kbank_consumer_secret"))
            
            if kbank_enabled and kbank_configured:
                try:
                    from services.kbank_checker import kbank_checker
                    logger.info("🏦 Trying KBank API...")
                    result = kbank_checker.verify_slip(bank_code, trans_ref)
                    if result and result.get("status") in ["success", "duplicate"]:
                        logger.info("✅ KBank API verification successful")
                        return result
                    else:
                        logger.warning(f"⚠️ KBank API failed: {result.get('message', 'Unknown error')}")
                        results.append(("KBank", result))
                except Exception as e:
                    logger.error(f"❌ KBank API error: {e}")
                    api_failure_cache["kbank"]["failures"] += 1
                    results.append(("KBank", {"status": "error", "message": str(e)}))
        
        # ถ้าทุก API ล้มเหลว
        if results:
            error_messages = [f"{api}: {result.get('message', 'Unknown error')}" for api, result in results]
            return {
                "status": "error",
                "message": "ไม่สามารถตรวจสอบสลิปได้จากทุก API",
                "details": error_messages,
                "suggestions": [
                    "ตรวจสอบว่ารูปสลิปชัดเจน",
                    "ตรวจสอบการตั้งค่า API",
                    "ลองใหม่อีกครั้ง"
                ]
            }
        else:
            return {
                "status": "error",
                "message": "ไม่มี API ที่พร้อมใช้งาน",
                "suggestions": [
                    "ตรวจสอบการตั้งค่า Thunder API",
                    "ตรวจสอบการตั้งค่า KBank API",
                    "เปิดใช้งานระบบตรวจสอบสลิป"
                ]
            }
        
    except Exception as e:
        logger.exception(f"❌ Critical error in verify_slip_multiple_providers: {e}")
        return {
            "status": "error",
            "message": f"เกิดข้อผิดพลาดร้ายแรง: {str(e)}"
        }
