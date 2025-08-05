
import logging
import re
import time
# เพิ่มในบรรทัดแรกของ services/enhanced_slip_checker.py
from services.enhanced_slip_checker import get_detailed_api_status
from typing import Dict, Any, Optional, List, Tuple
from utils.config_manager import config_manager

logger = logging.getLogger("enhanced_slip_checker")

# Cache สำหรับเก็บสถานะ API ที่ล้มเหลว
API_FAILURE_CACHE = {
    "thunder": {"last_failure": 0, "failure_count": 0},
    "kbank": {"last_failure": 0, "failure_count": 0}
}

def is_api_recently_failed(api_name: str, cooldown_minutes: int = 2) -> bool:
    """ตรวจสอบว่า API นี้เพิ่งล้มเหลวไปหรือไม่"""
    current_time = time.time()
    cache = API_FAILURE_CACHE.get(api_name, {"last_failure": 0, "failure_count": 0})
    
    # เพิ่ม cooldown ตามจำนวนครั้งที่ล้มเหลว
    if cache["failure_count"] >= 10:
        cooldown_minutes = 30
    elif cache["failure_count"] >= 5:
        cooldown_minutes = 10
    elif cache["failure_count"] >= 3:
        cooldown_minutes = 5
    
    return (current_time - cache["last_failure"]) < (cooldown_minutes * 60)

def mark_api_failure(api_name: str):
    """บันทึกว่า API นี้ล้มเหลว"""
    current_time = time.time()
    if api_name not in API_FAILURE_CACHE:
        API_FAILURE_CACHE[api_name] = {"last_failure": 0, "failure_count": 0}
    
    API_FAILURE_CACHE[api_name]["last_failure"] = current_time
    API_FAILURE_CACHE[api_name]["failure_count"] += 1
    logger.warning(f"🚨 {api_name} API failed (count: {API_FAILURE_CACHE[api_name]['failure_count']})")

def mark_api_success(api_name: str):
    """บันทึกว่า API นี้ใช้งานได้แล้ว"""
    if api_name in API_FAILURE_CACHE:
        API_FAILURE_CACHE[api_name]["failure_count"] = 0
        logger.info(f"✅ {api_name} API working normally")

def reset_api_failure_cache():
    """รีเซ็ต failure cache ทั้งหมด"""
    global API_FAILURE_CACHE
    API_FAILURE_CACHE = {
        "thunder": {"last_failure": 0, "failure_count": 0},
        "kbank": {"last_failure": 0, "failure_count": 0}
    }
    logger.info("🔄 API failure cache reset")

def verify_slip_multiple_providers(message_id: str = None, 
                                 test_image_data: Optional[bytes] = None,
                                 bank_code: str = None,
                                 trans_ref: str = None) -> Dict[str, Any]:
    """ระบบตรวจสอบสลิปแบบหลายช่องทาง (Enhanced Debug Version)"""
    
    logger.info(f"🔍 === SLIP VERIFICATION START ===")
    logger.info(f"📊 Input parameters:")
    logger.info(f"   - message_id: {bool(message_id)} ({'SET' if message_id else 'NOT SET'})")
    logger.info(f"   - test_image_data: {bool(test_image_data)} ({len(test_image_data) if test_image_data else 0} bytes)")
    logger.info(f"   - bank_code: {bank_code}")
    logger.info(f"   - trans_ref: {trans_ref}")
    
    # ตรวจสอบการตั้งค่าระบบ
    slip_enabled = config_manager.get("slip_enabled", False)
    logger.info(f"🔧 System configuration:")
    logger.info(f"   - slip_enabled: {slip_enabled}")
    
    if not slip_enabled:
        logger.error("❌ Slip system disabled")
        return {
            "status": "error",
            "message": "ระบบตรวจสอบสลิปถูกปิดใช้งาน",
            "suggestions": ["เปิดใช้งานระบบตรวจสอบสลิปในหน้า Settings"]
        }
    
    # ตรวจสอบ API ที่มีอยู่
    thunder_enabled = config_manager.get("thunder_enabled", True)
    thunder_token = config_manager.get("thunder_api_token", "").strip()
    kbank_enabled = config_manager.get("kbank_enabled", False)
    kbank_consumer_id = config_manager.get("kbank_consumer_id", "").strip()
    kbank_consumer_secret = config_manager.get("kbank_consumer_secret", "").strip()
    
    logger.info(f"🔧 API configuration:")
    logger.info(f"   - thunder_enabled: {thunder_enabled}")
    logger.info(f"   - thunder_token: {'SET (' + thunder_token[:10] + '...)' if thunder_token else 'NOT SET'}")
    logger.info(f"   - kbank_enabled: {kbank_enabled}")
    logger.info(f"   - kbank_consumer_id: {'SET (' + kbank_consumer_id[:10] + '...)' if kbank_consumer_id else 'NOT SET'}")
    logger.info(f"   - kbank_consumer_secret: {'SET (' + kbank_consumer_secret[:10] + '...)' if kbank_consumer_secret else 'NOT SET'}")
    
    # เช็ค API failures
    logger.info(f"🔧 API failure status:")
    logger.info(f"   - thunder_recently_failed: {is_api_recently_failed('thunder')}")
    logger.info(f"   - kbank_recently_failed: {is_api_recently_failed('kbank')}")
    
    # รายการ API ที่จะลอง (ตามลำดับความสำคัญ)
    api_list = []
    
    # 1. Thunder API (สำหรับรูปภาพ)
    if thunder_enabled and thunder_token and (message_id or test_image_data):
        if not is_api_recently_failed("thunder"):
            api_list.append(("thunder", "Thunder API"))
            logger.info("✅ Thunder API will be attempted")
        else:
            logger.warning("⚠️ Thunder API skipped due to recent failures")
    elif not thunder_enabled:
        logger.info("❌ Thunder API disabled by user")
    elif not thunder_token:
        logger.info("❌ Thunder API token not configured")
    else:
        logger.info("❌ Thunder API requires image data")
    
    # 2. KBank API (สำหรับข้อมูลธนาคาร)
    if kbank_enabled and kbank_consumer_id and kbank_consumer_secret:
        if not is_api_recently_failed("kbank"):
            api_list.append(("kbank", "KBank API"))
            logger.info("✅ KBank API will be attempted")
        else:
            logger.warning("⚠️ KBank API skipped due to recent failures")
    elif not kbank_enabled:
        logger.info("❌ KBank API disabled by user")
    else:
        logger.info("❌ KBank API credentials not configured")
    
    # ตรวจสอบว่ามี API ให้ใช้หรือไม่
    if not api_list:
        available_apis = []
        if thunder_token:
            available_apis.append("Thunder API (มี Token)")
        if kbank_consumer_id and kbank_consumer_secret:
            available_apis.append("KBank API (มี Credentials)")
            
        logger.error("❌ No APIs available for processing")
        return {
            "status": "error",
            "message": "ไม่มี API ที่พร้อมใช้งาน",
            "available_apis": available_apis,
            "suggestions": [
                "ตรวจสอบการตั้งค่า API tokens",
                "เปิดใช้งาน API ที่ต้องการในหน้า Settings",
                "รอให้ API ที่ล้มเหลวกลับมาใช้งานได้"
            ]
        }
    
    logger.info(f"📋 Will attempt APIs: {[name for _, name in api_list]}")
    
    # ลอง API ตามลำดับ
    last_error = None
    
    for api_name, api_display_name in api_list:
        logger.info(f"🔄 Attempting {api_display_name}...")
        
        try:
            result = None
            
            if api_name == "thunder":
                # ใช้ Thunder API
                logger.info("⚡ Calling Thunder API...")
                from services.slip_checker import verify_slip_with_thunder
                result = verify_slip_with_thunder(message_id, test_image_data)
                logger.info(f"⚡ Thunder API result: {result.get('status') if result else 'None'}")
                
            elif api_name == "kbank":
                # ใช้ KBank API
                logger.info("🏦 Calling KBank API...")
                from services.kbank_checker import kbank_checker
                
                # ถ้ามีข้อมูลธนาคารแล้วใช้เลย
                if bank_code and trans_ref:
                    logger.info(f"🏦 Using provided bank data: {bank_code}, {trans_ref}")
                    result = kbank_checker.verify_slip(bank_code, trans_ref)
                else:
                    # ลองดึงข้อมูลจาก Thunder ก่อน
                    logger.info("🔍 Extracting bank data for KBank API...")
                    if message_id or test_image_data:
                        try:
                            from services.slip_checker import verify_slip_with_thunder
                            thunder_result = verify_slip_with_thunder(message_id, test_image_data)
                            
                            if thunder_result and thunder_result.get("status") == "success":
                                extracted_data = thunder_result.get("data", {})
                                extracted_bank = extracted_data.get("sender_bank_id", "")
                                extracted_ref = extracted_data.get("reference", "")
                                
                                logger.info(f"🔍 Extracted: bank={extracted_bank}, ref={extracted_ref}")
                                
                                if extracted_bank and extracted_ref:
                                    result = kbank_checker.verify_slip(extracted_bank, extracted_ref)
                                else:
                                    logger.warning("⚠️ Could not extract bank data for KBank")
                                    continue
                            else:
                                logger.warning("⚠️ Thunder extraction failed for KBank")
                                continue
                        except Exception as e:
                            logger.error(f"❌ Bank data extraction failed: {e}")
                            continue
                    else:
                        logger.info("⏭️ KBank API requires bank data or image")
                        continue
                
                logger.info(f"🏦 KBank API result: {result.get('status') if result else 'None'}")
            
            # ตรวจสอบผลลัพธ์
            if result and result.get("status") in ["success", "duplicate"]:
                logger.info(f"✅ {api_display_name} succeeded!")
                mark_api_success(api_name)
                
                # เพิ่มข้อมูลการตรวจสอบ
                result["verified_by"] = api_display_name
                result["verification_time"] = time.time()
                
                logger.info(f"🎉 === SLIP VERIFICATION SUCCESS ===")
                return result
            else:
                # API ส่งผลลัพธ์แต่ไม่สำเร็จ
                error_msg = result.get("message", "Unknown error") if result else "No response"
                logger.warning(f"⚠️ {api_display_name} failed: {error_msg}")
                
                # ตรวจสอบว่าเป็น error จริงหรือไม่
                if result and result.get("status") in ["not_found", "invalid", "error"]:
                    mark_api_failure(api_name)
                    last_error = error_msg
                
        except Exception as e:
            logger.exception(f"❌ {api_display_name} exception: {e}")
            mark_api_failure(api_name)
            last_error = str(e)
    
    # ถ้าทุก API ล้มเหลว
    logger.error("🚫 === SLIP VERIFICATION FAILED ===")
    logger.error("🚫 All available APIs failed")
    return {
        "status": "error",
        "message": f"ไม่สามารถตรวจสอบสลิปได้ จากทุก API ที่มี",
        "last_error": last_error,
        "attempted_apis": [name for _, name in api_list],
        "suggestions": [
            "ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต",
            "ตรวจสอบความถูกต้องของ API credentials",
            "ลองส่งสลิปใหม่อีกครั้งในภายหลัง",
            "ติดต่อผู้ดูแลระบบหากปัญหายังคงอยู่"
        ]
    }

def extract_slip_info_from_text(text: str) -> Dict[str, Optional[str]]:
    """ดึงรหัสธนาคารและหมายเลขอ้างอิงจากข้อความ"""
    
    if not text or not isinstance(text, str):
        return {"bank_code": None, "trans_ref": None}
    
    # รูปแบบธนาคารไทยที่พบบ่อย
    bank_patterns = {
        "002": ["กรุงเทพ", "bbl", "bangkok bank", "ธนาคารกรุงเทพ", "bangkok"],
        "004": ["กสิกร", "kbank", "kasikorn", "k-bank", "กสิกรไทย", "kasikornbank"],
        "006": ["กรุงไทย", "ktb", "krung thai", "ธนาคารกรุงไทย", "krungthai"],
        "011": ["ทหารไทย", "tmb", "tmb bank", "ธนาคารทหารไทย", "ทีเอ็มบี", "tmbbank"],
        "014": ["ไทยพาณิชย์", "scb", "siam commercial", "ธนาคารไทยพาณิชย์", "scbbank"],
        "025": ["กรุงศรี", "bay", "bank of ayudhya", "ธนาคารกรุงศรีอยุธยา", "krungsri"],
        "017": ["ธกส", "baac", "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร"],
        "030": ["ออมสิน", "gsb", "government savings bank", "ธนาคารออมสิน"],
    }
    
    # ดึงรหัสธนาคาร
    bank_code = None
    text_lower = text.lower().replace(" ", "").replace("-", "").replace("_", "")
    
    for code, keywords in bank_patterns.items():
        for keyword in keywords:
            keyword_clean = keyword.replace(" ", "").replace("-", "").lower()
            if keyword_clean in text_lower:
                bank_code = code
                break
        if bank_code:
            break
    
    # ดึงหมายเลขอ้างอิง
    trans_ref = None
    ref_patterns = [
        r'(?:ref|reference|อ้างอิง|เลขอ้างอิง|หมายเลขอ้างอิง|รหัสอ้างอิง)[:\s]*([A-Z0-9]{8,20})',
        r'(?:trans|transaction)[:\s]*([A-Z0-9]{8,20})',
        r'\b([A-Z0-9]{12,20})\b',  # รูปแบบทั่วไป 12-20 ตัวอักษร
        r'\b([0-9]{10,16})\b',     # ตัวเลขเพียงอย่างเดียว 10-16 หลัก
    ]
    
    for pattern in ref_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            # เลือก match ที่ยาวที่สุดและดูเหมือน reference มากที่สุด
            trans_ref = max(matches, key=len)
            if len(trans_ref) >= 8:  # อย่างน้อย 8 ตัวอักษร
                break
    
    logger.info(f"📝 Text analysis: bank_code={bank_code}, trans_ref={trans_ref}")
    return {"bank_code": bank_code, "trans_ref": trans_ref}

def get_api_status_summary() -> Dict[str, Any]:
    """ดึงสรุปสถานะ API สำหรับ dashboard"""
    status = {}
    
    # Thunder API
    thunder_enabled = config_manager.get("thunder_enabled", True)
    thunder_token = config_manager.get("thunder_api_token", "").strip()
    thunder_configured = bool(thunder_token)
    thunder_cache = API_FAILURE_CACHE.get("thunder", {"failure_count": 0, "last_failure": 0})
    
    status["thunder"] = {
        "name": "Thunder API",
        "enabled": thunder_enabled,
        "configured": thunder_configured,
        "connected": thunder_configured and not is_api_recently_failed("thunder"),
        "recent_failures": thunder_cache["failure_count"],
        "last_failure": thunder_cache["last_failure"],
        "recently_failed": is_api_recently_failed("thunder")
    }
    
    # KBank API
    kbank_enabled = config_manager.get("kbank_enabled", False)
    kbank_consumer_id = config_manager.get("kbank_consumer_id", "").strip()
    kbank_consumer_secret = config_manager.get("kbank_consumer_secret", "").strip()
    kbank_configured = bool(kbank_consumer_id and kbank_consumer_secret)
    kbank_cache = API_FAILURE_CACHE.get("kbank", {"failure_count": 0, "last_failure": 0})
    
    status["kbank"] = {
        "name": "KBank API",
        "enabled": kbank_enabled,
        "configured": kbank_configured,
        "connected": kbank_configured and not is_api_recently_failed("kbank"),
        "recent_failures": kbank_cache["failure_count"],
        "last_failure": kbank_cache["last_failure"],
        "recently_failed": is_api_recently_failed("kbank")
    }
    
    # LINE API status
    line_token = config_manager.get("line_channel_access_token", "").strip()
    line_secret = config_manager.get("line_channel_secret", "").strip()
    line_configured = bool(line_token and line_secret)
    
    status["line"] = {
        "name": "LINE API",
        "enabled": True,  # LINE API always enabled if configured
        "configured": line_configured,
        "connected": line_configured,
        "recent_failures": 0,
        "last_failure": 0,
        "recently_failed": False
    }
    
    # System status
    slip_enabled = config_manager.get("slip_enabled", False)
    any_api_available = any(api["configured"] and api["enabled"] for api in [status["thunder"], status["kbank"]])
    
    status["system_status"] = {
        "system_enabled": slip_enabled,
        "any_api_available": any_api_available
    }
    
    return status

def get_detailed_api_status() -> Dict[str, Any]:
    """ดึงข้อมูลสถานะ API แบบละเอียดสำหรับ debugging"""
    return {
        "api_status": get_api_status_summary(),
        "failure_cache": API_FAILURE_CACHE.copy(),
        "config_status": {
            "slip_system_enabled": config_manager.get("slip_enabled", False),
            "thunder_enabled": config_manager.get("thunder_enabled", True),
            "thunder_token_configured": bool(config_manager.get("thunder_api_token")),
            "kbank_enabled": config_manager.get("kbank_enabled", False),
            "kbank_credentials_configured": bool(
                config_manager.get("kbank_consumer_id") and 
                config_manager.get("kbank_consumer_secret")
            )
        },
        "config_values": {
            "thunder_token": config_manager.get("thunder_api_token", "")[:20] + "..." if config_manager.get("thunder_api_token") else "",
            "kbank_consumer_id": config_manager.get("kbank_consumer_id", "")[:20] + "..." if config_manager.get("kbank_consumer_id") else "",
            "kbank_consumer_secret": config_manager.get("kbank_consumer_secret", "")[:20] + "..." if config_manager.get("kbank_consumer_secret") else "",
            "line_token": config_manager.get("line_channel_access_token", "")[:20] + "..." if config_manager.get("line_channel_access_token") else "",
            "line_secret": config_manager.get("line_channel_secret", "")[:20] + "..." if config_manager.get("line_channel_secret") else "",
        }
    }
