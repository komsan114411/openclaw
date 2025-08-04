# services/enhanced_slip_checker.py
import logging
import re
import time
from typing import Dict, Any, Optional
from utils.config_manager import config_manager

logger = logging.getLogger("enhanced_slip_checker")

# Cache สำหรับเก็บสถานะ API ที่ล้มเหลว
API_FAILURE_CACHE = {
    "thunder": {"last_failure": 0, "failure_count": 0},
    "kbank": {"last_failure": 0, "failure_count": 0}
}

def is_api_recently_failed(api_name: str, cooldown_minutes: int = 2) -> bool:
    """ตรวจสอบว่า API นี้เพิ่งล้มเหลวไปหรือไม่ (ลด cooldown เป็น 2 นาที)"""
    current_time = time.time()
    cache = API_FAILURE_CACHE.get(api_name, {"last_failure": 0, "failure_count": 0})
    
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

def verify_slip_multiple_providers(message_id: str = None, 
                                 test_image_data: Optional[bytes] = None,
                                 bank_code: str = None,
                                 trans_ref: str = None) -> Dict[str, Any]:
    """ระบบตรวจสอบสลิปแบบหลายช่องทางพร้อม Auto-Fallback"""
    
    logger.info(f"🔍 Starting slip verification - message_id: {message_id}, bank_code: {bank_code}, trans_ref: {trans_ref}, image_data: {'Present' if test_image_data else 'None'}")
    
    results = []  # เก็บผลลัพธ์การลองแต่ละ API
    
    # === ลอง Thunder API ก่อน (เนื่องจากเป็นหลัก) ===
    thunder_enabled = config_manager.get("slip_enabled", False)
    thunder_has_token = config_manager.get("thunder_api_token")
    
    logger.info(f"⚡ Thunder API - Enabled: {thunder_enabled}, Has Token: {bool(thunder_has_token)}")
    
    if thunder_enabled and thunder_has_token and (message_id or test_image_data):
        if not is_api_recently_failed("thunder"):
            logger.info("⚡ Trying Thunder API first")
            try:
                from services.slip_checker import verify_slip_with_thunder
                thunder_result = verify_slip_with_thunder(message_id, test_image_data)
                
                logger.info(f"⚡ Thunder API result: {thunder_result.get('status')} - {thunder_result.get('message', '')[:100]}")
                
                if thunder_result["status"] == "success":
                    logger.info("✅ Thunder API successful!")
                    mark_api_success("thunder")
                    return thunder_result
                else:
                    logger.warning(f"⚠️ Thunder API failed: {thunder_result.get('message')}")
                    mark_api_failure("thunder")
                    results.append(f"Thunder API: {thunder_result.get('message', 'Unknown error')}")
                    
            except Exception as e:
                logger.error(f"❌ Thunder API error: {e}")
                mark_api_failure("thunder")
                results.append(f"Thunder API: {str(e)}")
        else:
            logger.info("⏭️ Skipping Thunder API (recently failed)")
            results.append("Thunder API: ข้ามเนื่องจากเพิ่งล้มเหลว")
    else:
        # บันทึกเหตุผลที่ไม่ได้ใช้ Thunder
        reasons = []
        if not thunder_enabled:
            reasons.append("ปิดใช้งาน")
        if not thunder_has_token:
            reasons.append("ไม่มี API token")
        if not (message_id or test_image_data):
            reasons.append("ไม่มีรูปภาพ")
        
        if reasons:
            results.append(f"Thunder API: ไม่ได้ใช้ ({', '.join(reasons)})")

    # === ลอง KBank API (ถ้าเงื่อนไขครบ) ===
    kbank_enabled = config_manager.get("kbank_enabled", False)
    kbank_has_credentials = config_manager.get("kbank_consumer_id") and config_manager.get("kbank_consumer_secret")
    
    logger.info(f"🏦 KBank API - Enabled: {kbank_enabled}, Has Credentials: {kbank_has_credentials}")
    
    if bank_code and trans_ref and kbank_enabled and kbank_has_credentials:
        if not is_api_recently_failed("kbank"):
            logger.info("🏦 Trying KBank API as fallback")
            try:
                from services.kbank_checker import kbank_checker
                kbank_result = kbank_checker.verify_slip(bank_code, trans_ref)
                
                logger.info(f"🏦 KBank API result: {kbank_result.get('status')} - {kbank_result.get('message', '')[:100]}")
                
                if kbank_result["status"] == "success":
                    logger.info("✅ KBank API successful!")
                    mark_api_success("kbank")
                    kbank_result["type"] = "kbank"
                    return kbank_result
                else:
                    logger.warning(f"⚠️ KBank API failed: {kbank_result.get('message')}")
                    mark_api_failure("kbank")
                    results.append(f"KBank API: {kbank_result.get('message', 'Unknown error')}")
                    
            except ImportError:
                logger.warning("⚠️ KBank checker not available")
                results.append("KBank API: ไม่พร้อมใช้งาน (missing module)")
            except Exception as e:
                logger.error(f"❌ KBank API error: {e}")
                mark_api_failure("kbank")
                results.append(f"KBank API: {str(e)}")
        else:
            logger.info("⏭️ Skipping KBank API (recently failed)")
            results.append("KBank API: ข้ามเนื่องจากเพิ่งล้มเหลว")
    else:
        # บันทึกเหตุผลที่ไม่ได้ใช้ KBank
        reasons = []
        if not kbank_enabled:
            reasons.append("ปิดใช้งาน")
        if not kbank_has_credentials:
            reasons.append("ไม่มี credentials")
        if not (bank_code and trans_ref):
            reasons.append("ไม่มีข้อมูล bank_code/trans_ref")
        
        if reasons:
            results.append(f"KBank API: ไม่ได้ใช้ ({', '.join(reasons)})")

    # === กรณีที่ทุก API ล้มเหลวหรือไม่พร้อมใช้งาน ===
    error_summary = "ไม่สามารถตรวจสอบสลิปได้จากทุกช่องทาง:\n• " + "\n• ".join(results)
    
    logger.error("🚫 All APIs failed or unavailable")
    logger.error(f"📋 Summary: {results}")
    
    return {
        "status": "error", 
        "message": error_summary,
        "attempted_apis": results,
        "suggestions": get_troubleshooting_suggestions()
    }

def get_troubleshooting_suggestions() -> list:
    """ให้คำแนะนำในการแก้ไขปัญหา"""
    suggestions = []
    
    # ตรวจสอบการตั้งค่า Thunder
    if not config_manager.get("thunder_api_token"):
        suggestions.append("ตั้งค่า Thunder API Token ในหน้า Settings")
    elif not config_manager.get("slip_enabled"):
        suggestions.append("เปิดใช้งาน Thunder API ในหน้า Settings")
    else:
        suggestions.append("ตรวจสอบว่า Thunder API Token ถูกต้องและยังไม่หมดอายุ")
    
    # ตรวจสอบการตั้งค่า KBank
    if not (config_manager.get("kbank_consumer_id") and config_manager.get("kbank_consumer_secret")):
        suggestions.append("ตั้งค่า KBank Consumer ID และ Secret สำหรับ fallback")
    elif not config_manager.get("kbank_enabled"):
        suggestions.append("เปิดใช้งาน KBank API สำหรับ fallback")
    
    # คำแนะนำทั่วไป
    suggestions.append("ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต")
    suggestions.append("ลองส่งรูปสลิปที่ชัดเจนขึ้น")
    suggestions.append("ลองใหม่อีกครั้งในอีกสักครู่")
    
    return suggestions

def extract_slip_info_from_text(text: str) -> Dict[str, Optional[str]]:
    """ดึงรหัสธนาคารและหมายเลขอ้างอิงจากข้อความ"""
    
    # รูปแบบธนาคารไทยที่พบบ่อย
    bank_patterns = {
        "004": ["กสิกร", "kbank", "kasikorn", "k-bank", "กสิกรไทย"],
        "002": ["กรุงเทพ", "bbl", "bangkok bank", "ธนาคารกรุงเทพ"],
        "006": ["กรุงไทย", "ktb", "krung thai", "ธนาคารกรุงไทย"],
        "011": ["ทหารไทย", "tmb", "tmb bank", "ธนาคารทหารไทย", "ทีเอ็มบี"],
        "014": ["ไทยพาณิชย์", "scb", "siam commercial", "ธนาคารไทยพาณิชย์"],
        "025": ["กรุงศรี", "bay", "bank of ayudhya", "ธนาคารกรุงศรีอยุธยา"],
        "017": ["ธกส", "baac", "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร"],
        "034": ["เพื่อการส่งออกและนำเข้าแห่งประเทศไทย", "exim", "export import"],
    }
    
    # ดึงรหัสธนาคาร
    bank_code = None
    text_lower = text.lower()
    for code, keywords in bank_patterns.items():
        if any(keyword in text_lower for keyword in keywords):
            bank_code = code
            break
    
    # ดึงหมายเลขอ้างอิง (รูปแบบพื้นฐาน)
    trans_ref = None
    ref_patterns = [
        r'ref[:\s]*([A-Z0-9]{6,20})',
        r'อ้างอิง[:\s]*([A-Z0-9]{6,20})',
        r'reference[:\s]*([A-Z0-9]{6,20})',
        r'เลขอ้างอิง[:\s]*([A-Z0-9]{6,20})',
        r'หมายเลขอ้างอิง[:\s]*([A-Z0-9]{6,20})',
        r'รหัสอ้างอิง[:\s]*([A-Z0-9]{6,20})',
    ]
    
    for pattern in ref_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            trans_ref = match.group(1)
            break
    
    logger.info(f"📝 Text analysis result: bank_code={bank_code}, trans_ref={trans_ref}")
    return {"bank_code": bank_code, "trans_ref": trans_ref}

def get_api_status_summary() -> Dict[str, Any]:
    """ดึงสรุปสถานะ API สำหรับ monitoring"""
    return {
        "thunder": {
            "enabled": config_manager.get("slip_enabled", False),
            "configured": bool(config_manager.get("thunder_api_token")),
            "recent_failures": API_FAILURE_CACHE.get("thunder", {}).get("failure_count", 0),
            "last_failure": API_FAILURE_CACHE.get("thunder", {}).get("last_failure", 0)
        },
        "kbank": {
            "enabled": config_manager.get("kbank_enabled", False),
            "configured": bool(config_manager.get("kbank_consumer_id") and config_manager.get("kbank_consumer_secret")),
            "recent_failures": API_FAILURE_CACHE.get("kbank", {}).get("failure_count", 0),
            "last_failure": API_FAILURE_CACHE.get("kbank", {}).get("last_failure", 0)
        }
    }
