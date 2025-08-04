# services/enhanced_slip_checker.py
import logging
import re
from typing import Dict, Any, Optional
from utils.config_manager import config_manager
from services.slip_checker import verify_slip_with_thunder
from services.kbank_checker import kbank_checker

logger = logging.getLogger("enhanced_slip_checker")

def verify_slip_multiple_providers(message_id: str, 
                                 test_image_data: Optional[bytes] = None,
                                 bank_code: str = None,
                                 trans_ref: str = None) -> Dict[str, Any]:
    """
    ระบบตรวจสอบสลิปแบบหลายช่องทาง:
    1. KBank API (ถ้ามี bank_code และ trans_ref)
    2. Thunder API (สำหรับตรวจสอบจากรูปภาพ)
    
    Args:
        message_id: LINE message ID สำหรับรูปภาพ
        test_image_data: ข้อมูลรูปภาพทดสอบ (ถ้ามี)
        bank_code: รหัสธนาคารสำหรับ KBank API (เช่น "004")
        trans_ref: หมายเลขอ้างอิงสำหรับ KBank API
        
    Returns:
        Dict ที่มีผลการตรวจสอบ
    """
    
    # ลอง KBank API ก่อนถ้ามีข้อมูลที่จำเป็น
    if bank_code and trans_ref and config_manager.get("kbank_enabled", False):
        logger.info("🏦 กำลังตรวจสอบด้วย KBank API")
        kbank_result = kbank_checker.verify_slip(bank_code, trans_ref)
        
        if kbank_result["status"] == "success":
            logger.info("✅ ตรวจสอบด้วย KBank สำเร็จ")
            return kbank_result
        else:
            logger.warning(f"⚠️ ตรวจสอบด้วย KBank ล้มเหลว: {kbank_result.get('message')}")
    
    # สำรองด้วย Thunder API สำหรับตรวจสอบจากรูปภาพ
    if config_manager.get("slip_enabled", False):
        logger.info("⚡ กำลังตรวจสอบด้วย Thunder API")
        thunder_result = verify_slip_with_thunder(message_id, test_image_data)
        
        if thunder_result["status"] == "success":
            logger.info("✅ ตรวจสอบด้วย Thunder สำเร็จ")
            return thunder_result
        else:
            logger.warning(f"⚠️ ตรวจสอบด้วย Thunder ล้มเหลว: {thunder_result.get('message')}")
    
    # ถ้าทั้งสองล้มเหลวหรือถูกปิดใช้งาน
    return {
        "status": "error", 
        "message": "ไม่สามารถตรวจสอบสลิปได้ กรุณาตรวจสอบการตั้งค่าระบบ"
    }

def extract_slip_info_from_text(text: str) -> Dict[str, Optional[str]]:
    """
    ดึงรหัสธนาคารและหมายเลขอ้างอิงจากข้อความ
    ระบบนี้เป็นแบบพื้นฐาน - อาจจะต้องปรับปรุงเพิ่มเติม
    """
    
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
    
    return {"bank_code": bank_code, "trans_ref": trans_ref}

def get_bank_name_thai(bank_code: str) -> str:
    """แปลงรหัสธนาคารเป็นชื่อไทย"""
    bank_names = {
        "004": "ธนาคารกสิกรไทย",
        "002": "ธนาคารกรุงเทพ",
        "006": "ธนาคารกรุงไทย",
        "011": "ธนาคารทหารไทยธนชาต",
        "014": "ธนาคารไทยพาณิชย์",
        "025": "ธนาคารกรุงศรีอยุธยา",
        "017": "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร",
        "034": "ธนาคารเพื่อการส่งออกและนำเข้าแห่งประเทศไทย",
    }
    return bank_names.get(bank_code, f"ธนาคาร {bank_code}")
