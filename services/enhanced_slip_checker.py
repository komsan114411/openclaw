# services/enhanced_slip_checker.py
import logging
import re
import time
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
    
    # ถ้าล้มเหลวเกิน 5 ครั้ง ให้ cooldown นานขึ้น
    if cache["failure_count"] >= 5:
        cooldown_minutes = 10
    elif cache["failure_count"] >= 3:
        cooldown_minutes = 5
    
    if current_time - cache["last_failure"] < (cooldown_minutes * 60):
        return True
    return False

def mark_api_failure(api_name: str):
    """บันทึกว่า API นี้ล้มเหลว"""
    current_time = time.time()
    if api_name not in API_FAILURE_CACHE:
        API_FAILURE_CACHE[api_name] = {"last_failure": 0, "failure_count": 0}
    
    API_FAILURE_CACHE[api_name]["last_failure"] = current_time
    API_FAILURE_CACHE[api_name]["failure_count"] += 1
    logger.warning(f"🚨 Marked {api_name} API as failed (count: {API_FAILURE_CACHE[api_name]['failure_count']})")

def mark_api_success(api_name: str):
    """บันทึกว่า API นี้ใช้งานได้แล้ว"""
    if api_name in API_FAILURE_CACHE:
        API_FAILURE_CACHE[api_name]["failure_count"] = 0
        logger.info(f"✅ Reset failure count for {api_name} API")

def reset_api_failure_cache():
    """รีเซ็ต failure cache ทั้งหมด"""
    global API_FAILURE_CACHE
    API_FAILURE_CACHE = {
        "thunder": {"last_failure": 0, "failure_count": 0},
        "kbank": {"last_failure": 0, "failure_count": 0}
    }
    logger.info("🔄 Reset API failure cache")

def get_available_apis() -> List[Tuple[str, Dict[str, Any]]]:
    """ดึงรายการ API ที่เปิดใช้งานตามลำดับความสำคัญ"""
    available_apis = []
    
    # 1. Thunder API (ลำดับแรก)
    thunder_enabled = config_manager.get("slip_enabled", False)
    thunder_has_token = config_manager.get("thunder_api_token", "").strip()
    
    if thunder_enabled and thunder_has_token:
        available_apis.append(("thunder", {
            "name": "Thunder API",
            "enabled": thunder_enabled,
            "configured": bool(thunder_has_token),
            "priority": 1,
            "requires_image": True,
            "requires_bank_data": False
        }))
    
    # 2. KBank API (ลำดับที่ 2)
    kbank_enabled = config_manager.get("kbank_enabled", False)
    kbank_consumer_id = config_manager.get("kbank_consumer_id", "").strip()
    kbank_consumer_secret = config_manager.get("kbank_consumer_secret", "").strip()
    kbank_has_credentials = kbank_consumer_id and kbank_consumer_secret
    
    if kbank_enabled and kbank_has_credentials:
        available_apis.append(("kbank", {
            "name": "KBank API",
            "enabled": kbank_enabled,
            "configured": kbank_has_credentials,
            "priority": 2,
            "requires_image": False,
            "requires_bank_data": True
        }))
    
    # เรียงตามลำดับความสำคัญ
    available_apis.sort(key=lambda x: x[1]["priority"])
    
    logger.info(f"📋 Available APIs: {[api[0] for api in available_apis]}")
    return available_apis

def verify_slip_multiple_providers(message_id: str = None, 
                                 test_image_data: Optional[bytes] = None,
                                 bank_code: str = None,
                                 trans_ref: str = None) -> Dict[str, Any]:
    """ระบบตรวจสอบสลิปแบบหลายช่องทาง (ปรับปรุงใหม่ - เลือกตาม priority)"""
    
    logger.info(f"🔍 Starting slip verification with priority system")
    logger.info(f"📊 Input data: message_id={bool(message_id)}, image_data={bool(test_image_data)}, bank_code={bank_code}, trans_ref={trans_ref}")
    
    # ดึงรายการ API ที่พร้อมใช้งาน
    available_apis = get_available_apis()
    
    if not available_apis:
        logger.error("❌ No APIs are enabled or configured")
        return {
            "status": "error",
            "message": "ไม่มี API ที่พร้อมใช้งาน กรุณาตั้งค่า Thunder API หรือ KBank API",
            "suggestions": [
                "เปิดใช้งาน Thunder API และตั้งค่า API Token",
                "หรือเปิดใช้งาน KBank API และใส่ Consumer ID/Secret",
                "ตรวจสอบการตั้งค่าในหน้า Settings"
            ]
        }
    
    results = []
    attempted_apis = []
    
    # ลองแต่ละ API ตามลำดับความสำคัญ
    for api_name, api_info in available_apis:
        logger.info(f"🔄 Attempting {api_info['name']} (Priority: {api_info['priority']})")
        attempted_apis.append(api_name)
        
        # ตรวจสอบว่า API นี้เหมาะสมกับข้อมูลที่มีหรือไม่
        can_use_api = False
        skip_reason = ""
        
        if api_name == "thunder":
            # Thunder API ต้องการรูปภาพ
            if message_id or test_image_data:
                can_use_api = True
            else:
                skip_reason = "ไม่มีรูปภาพสำหรับ Thunder API"
                
        elif api_name == "kbank":
            # KBank API ต้องการ bank_code และ trans_ref
            if bank_code and trans_ref:
                can_use_api = True
            elif message_id or test_image_data:
                # ลองดึงข้อมูล bank จากรูปภาพด้วย Thunder API ก่อน
                logger.info("🔍 Attempting to extract bank data for KBank API")
                bank_data = extract_bank_data_from_image(message_id, test_image_data)
                if bank_data["bank_code"] and bank_data["trans_ref"]:
                    bank_code = bank_data["bank_code"]
                    trans_ref = bank_data["trans_ref"]
                    can_use_api = True
                    logger.info(f"✅ Extracted bank data: {bank_code}, {trans_ref}")
                else:
                    skip_reason = "ไม่สามารถดึงข้อมูลธนาคารจากรูปภาพได้"
            else:
                skip_reason = "ไม่มีข้อมูล bank_code/trans_ref สำหรับ KBank API"
        
        if not can_use_api:
            logger.info(f"⏭️ Skipping {api_info['name']}: {skip_reason}")
            results.append(f"{api_info['name']}: ข้าม - {skip_reason}")
            continue
        
        # ตรวจสอบว่า API นี้เพิ่งล้มเหลวหรือไม่
        if is_api_recently_failed(api_name):
            failure_count = API_FAILURE_CACHE.get(api_name, {}).get("failure_count", 0)
            logger.info(f"⏭️ Skipping {api_info['name']}: recently failed ({failure_count} times)")
            results.append(f"{api_info['name']}: ข้าม - เพิ่งล้มเหลว ({failure_count} ครั้ง)")
            continue
        
        # เรียกใช้ API
        try:
            logger.info(f"🚀 Calling {api_info['name']}")
            result = None
            
            if api_name == "thunder":
                result = call_thunder_api(message_id, test_image_data)
            elif api_name == "kbank":
                result = call_kbank_api(bank_code, trans_ref)
            
            if result and result.get("status") == "success":
                logger.info(f"✅ {api_info['name']} succeeded!")
                mark_api_success(api_name)
                result["type"] = api_name
                result["verified_by"] = api_info['name']
                return result
            else:
                error_msg = result.get("message", "Unknown error") if result else "No response"
                logger.warning(f"⚠️ {api_info['name']} failed: {error_msg}")
                
                # ไม่ mark failure ถ้าเป็น duplicate หรือ validation error
                if not is_non_critical_error(error_msg):
                    mark_api_failure(api_name)
                
                results.append(f"{api_info['name']}: {error_msg}")
                
        except Exception as e:
            logger.error(f"❌ {api_info['name']} exception: {e}")
            mark_api_failure(api_name)
            results.append(f"{api_info['name']}: เกิดข้อผิดพลาด - {str(e)}")
    
    # ถ้าทุก API ล้มเหลว
    logger.error("🚫 All available APIs failed")
    
    error_summary = f"ไม่สามารถตรวจสอบสลิปได้จาก API ที่เปิดใช้งาน ({len(attempted_apis)} APIs):\n"
    error_summary += "\n".join([f"• {result}" for result in results])
    
    return {
        "status": "error",
        "message": error_summary,
        "attempted_apis": attempted_apis,
        "available_apis": [api[0] for api in available_apis],
        "suggestions": get_troubleshooting_suggestions(attempted_apis)
    }

def extract_bank_data_from_image(message_id: str = None, test_image_data: Optional[bytes] = None) -> Dict[str, Optional[str]]:
    """ดึงข้อมูลธนาคารจากรูปภาพโดยใช้ Thunder API (สำหรับ KBank API)"""
    try:
        # ถ้า Thunder API ไม่พร้อม ให้ return ข้อมูลว่าง
        if not config_manager.get("slip_enabled") or not config_manager.get("thunder_api_token"):
            return {"bank_code": None, "trans_ref": None}
        
        thunder_result = call_thunder_api(message_id, test_image_data)
        if thunder_result and thunder_result.get("status") == "success":
            data = thunder_result.get("data", {})
            
            # แปลงข้อมูลธนาคารเป็นรหัส
            sender_bank = data.get("sender_bank", "")
            bank_code = convert_bank_name_to_code(sender_bank)
            trans_ref = data.get("reference", "") or data.get("transRef", "")
            
            return {"bank_code": bank_code, "trans_ref": trans_ref}
    except Exception as e:
        logger.warning(f"⚠️ Failed to extract bank data from image: {e}")
    
    return {"bank_code": None, "trans_ref": None}

def convert_bank_name_to_code(bank_name: str) -> Optional[str]:
    """แปลงชื่อธนาคารเป็นรหัส"""
    if not bank_name:
        return None
    
    bank_name_lower = bank_name.lower()
    bank_mapping = {
        "bbl": "002", "bangkok": "002", "กรุงเทพ": "002",
        "kbank": "004", "kasikorn": "004", "กสิกร": "004",
        "ktb": "006", "krungthai": "006", "กรุงไทย": "006",
        "tmb": "011", "tmbbank": "011", "ทหารไทย": "011",
        "scb": "014", "scbbank": "014", "ไทยพาณิชย์": "014",
        "bay": "025", "krungsri": "025", "กรุงศรี": "025",
        "gsb": "030", "ออมสิน": "030",
        "baac": "017", "ธกส": "017"
    }
    
    for key, code in bank_mapping.items():
        if key in bank_name_lower:
            return code
    
    return None

def call_thunder_api(message_id: str = None, test_image_data: Optional[bytes] = None) -> Dict[str, Any]:
    """เรียกใช้ Thunder API"""
    try:
        from services.slip_checker import verify_slip_with_thunder
        return verify_slip_with_thunder(message_id, test_image_data)
    except ImportError:
        return {"status": "error", "message": "Thunder API module not available"}
    except Exception as e:
        return {"status": "error", "message": f"Thunder API error: {str(e)}"}

def call_kbank_api(bank_code: str, trans_ref: str) -> Dict[str, Any]:
    """เรียกใช้ KBank API"""
    try:
        from services.kbank_checker import kbank_checker
        return kbank_checker.verify_slip(bank_code, trans_ref)
    except ImportError:
        return {"status": "error", "message": "KBank API module not available"}
    except Exception as e:
        return {"status": "error", "message": f"KBank API error: {str(e)}"}

def is_non_critical_error(error_message: str) -> bool:
    """ตรวจสอบว่าเป็น error ที่ไม่ใช่ความผิดพลาดของ API"""
    if not error_message:
        return False
    
    error_lower = error_message.lower()
    non_critical_keywords = [
        "duplicate", "ซ้ำ", "invalid slip", "สลิปไม่ถูกต้อง",
        "not found", "ไม่พบ", "validation", "format"
    ]
    
    return any(keyword in error_lower for keyword in non_critical_keywords)

def get_troubleshooting_suggestions(attempted_apis: List[str]) -> List[str]:
    """ให้คำแนะนำในการแก้ไขปัญหาตาม API ที่ลอง"""
    suggestions = []
    
    if "thunder" in attempted_apis:
        thunder_token = config_manager.get("thunder_api_token")
        if not thunder_token:
            suggestions.append("🔧 ตั้งค่า Thunder API Token ในหน้า Settings")
        else:
            suggestions.extend([
                "⚡ ตรวจสอบว่า Thunder API Token ยังไม่หมดอายุ",
                "📸 ลองถ่ายรูปสลิปใหม่ให้ชัดเจนขึ้น"
            ])
    
    if "kbank" in attempted_apis:
        if not (config_manager.get("kbank_consumer_id") and config_manager.get("kbank_consumer_secret")):
            suggestions.append("🏦 ตั้งค่า KBank Consumer ID และ Secret")
        else:
            suggestions.extend([
                "🔑 ตรวจสอบ KBank credentials ให้ถูกต้อง",
                "🌐 ตรวจสอบการเชื่อมต่อกับ KBank API"
            ])
    
    # คำแนะนำทั่วไป
    suggestions.extend([
        "🔄 รอสักครู่แล้วลองส่งสลิปใหม่อีกครั้ง",
        "📞 ติดต่อแอดมินหากปัญหายังคงอยู่"
    ])
    
    return suggestions

def extract_slip_info_from_text(text: str) -> Dict[str, Optional[str]]:
    """ดึงรหัสธนาคารและหมายเลขอ้างอิงจากข้อความ"""
    
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
        "034": ["เพื่อการส่งออกและนำเข้าแห่งประเทศไทย", "exim", "export import"],
    }
    
    # ดึงรหัสธนาคาร
    bank_code = None
    text_lower = text.lower().replace(" ", "")
    for code, keywords in bank_patterns.items():
        if any(keyword.replace(" ", "").lower() in text_lower for keyword in keywords):
            bank_code = code
            break
    
    # ดึงหมายเลขอ้างอิง
    trans_ref = None
    ref_patterns = [
        r'ref[:\s]*([A-Z0-9]{6,20})',
        r'อ้างอิง[:\s]*([A-Z0-9]{6,20})',
        r'reference[:\s]*([A-Z0-9]{6,20})',
        r'เลขอ้างอิง[:\s]*([A-Z0-9]{6,20})',
        r'หมายเลขอ้างอิง[:\s]*([A-Z0-9]{6,20})',
        r'รหัสอ้างอิง[:\s]*([A-Z0-9]{6,20})',
        r'trans[:\s]*([A-Z0-9]{6,20})',
        r'transaction[:\s]*([A-Z0-9]{6,20})',
        r'([A-Z0-9]{10,20})',  # รูปแบบทั่วไป
    ]
    
    for pattern in ref_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            trans_ref = match.group(1)
            break
    
    logger.info(f"📝 Text analysis: bank_code={bank_code}, trans_ref={trans_ref}")
    return {"bank_code": bank_code, "trans_ref": trans_ref}

def get_api_status_summary() -> Dict[str, Any]:
    """ดึงสรุปสถานะ API สำหรับ monitoring"""
    available_apis = get_available_apis()
    
    status = {}
    for api_name, api_info in available_apis:
        failure_cache = API_FAILURE_CACHE.get(api_name, {"failure_count": 0, "last_failure": 0})
        status[api_name] = {
            "name": api_info["name"],
            "enabled": api_info["enabled"],
            "configured": api_info["configured"],
            "priority": api_info["priority"],
            "recent_failures": failure_cache["failure_count"],
            "last_failure": failure_cache["last_failure"],
            "recently_failed": is_api_recently_failed(api_name)
        }
    
    # เพิ่มข้อมูล API ที่ปิดใช้งาน
    all_possible_apis = ["thunder", "kbank"]
    for api_name in all_possible_apis:
        if api_name not in status:
            if api_name == "thunder":
                enabled = config_manager.get("slip_enabled", False)
                configured = bool(config_manager.get("thunder_api_token"))
            elif api_name == "kbank":
                enabled = config_manager.get("kbank_enabled", False)
                configured = bool(config_manager.get("kbank_consumer_id") and config_manager.get("kbank_consumer_secret"))
            
            status[api_name] = {
                "name": f"{api_name.title()} API",
                "enabled": enabled,
                "configured": configured,
                "priority": 99,  # ไม่มีความสำคัญ
                "recent_failures": 0,
                "last_failure": 0,
                "recently_failed": False,
                "status": "disabled"
            }
    
    return status

# ฟังก์ชันสำหรับ admin debugging
def get_detailed_api_status() -> Dict[str, Any]:
    """ดึงข้อมุลสถานะ API แบบละเอียดสำหรับ debugging"""
    return {
        "available_apis": [(name, info) for name, info in get_available_apis()],
        "failure_cache": API_FAILURE_CACHE.copy(),
        "config_status": {
            "thunder_enabled": config_manager.get("slip_enabled", False),
            "thunder_token_configured": bool(config_manager.get("thunder_api_token")),
            "kbank_enabled": config_manager.get("kbank_enabled", False),
            "kbank_credentials_configured": bool(config_manager.get("kbank_consumer_id") and config_manager.get("kbank_consumer_secret"))
        }
    }
