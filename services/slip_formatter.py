import logging
from typing import Dict, Any, Union
from datetime import datetime
import pytz, re

logger = logging.getLogger("slip_formatter")

# -----------------------------
# LOGOS
# -----------------------------
BANK_LOGOS = {
    "002": "https://www.hood11.com/uploads/khungefl.png",    # BBL
    "004": "https://www.hood11.com/uploads/kikh.png",         # KBANK
    "006": "https://www.hood11.com/uploads/khungaifs.png",    # KTB
    "011": "https://www.hood11.com/uploads/ttb.png",          # TTB
    "014": "https://www.hood11.com/uploads/aifslanichsscb.png",  # SCB
    "025": "https://www.hood11.com/uploads/khunghhi2.png",    # BAY
    "030": "https://www.hood11.com/uploads/sif.png",          # GSB
    "034": "https://www.hood11.com/uploads/phfakhahphk.png", # BAAC
    "069": "https://www.hood11.com/uploads/ekishpifakhif.png", # KKP
    "070": "https://www.hood11.com/uploads/icbc.png",         # ICBC
    "071": "https://www.hood11.com/uploads/uob.png",          # UOB
    "073": "https://www.hood11.com/uploads/phfakhahphfchapi.png", # Thanachart
    "076": "https://www.hood11.com/uploads/fiok.png",         # TISCO
    "080": "https://www.hood11.com/uploads/ph.png",           # GHB
    "081": "https://www.hood11.com/uploads/aelfbaelfbeaf.png", # LH
    "084": "https://www.hood11.com/uploads/phfakhahilas.png",  # Islamic
}
DEFAULT_LOGO = "https://www.hood11.com/uploads/logo.webp"

# -----------------------------
# HELPERS : รูปแบบตัวเลข/บัญชี/สกุลเงิน
# -----------------------------
def get_bank_logo(bank_code: str = None, bank_name: str = None, db=None) -> str:
    """
    ดึง logo ธนาคารจาก database ก่อน ถ้าไม่มีค่อยใช้ hardcoded
    Returns data URI format: data:image/png;base64,...
    
    Args:
        bank_code: รหัสธนาคาร (เช่น "002", "004")
        bank_name: ชื่อธนาคาร (เช่น "กรุงเทพ", "กสิกรไทย")
        db: MongoDB database instance (required, should not be None)
    """
    error_info = None
    
    # If db is None, skip database lookup and use fallback
    if db is None:
        logger.warning(f"⚠️ get_bank_logo called without db parameter for bank_code={bank_code}, bank_name={bank_name}")
        # Don't try to create connection, just use fallback
        error_info = "Database connection not provided"
        
    # Try to get logo from database if db is provided
    if db is not None:
        try:
            banks_collection = db.banks
            
            # ลองหาจาก code ก่อน
            if bank_code:
                try:
                    bank = banks_collection.find_one({"code": bank_code, "is_active": True})
                    if bank:
                        logger.info(f"🔍 Found bank in database: {bank.get('name')} (code: {bank_code})")
                        logo_base64 = bank.get("logo_base64")
                        
                        # ✅ NEW APPROACH: Generate HTTP URL to our API endpoint
                        # This converts base64 from database to HTTP URL that LINE API accepts
                        if logo_base64 and isinstance(logo_base64, str) and logo_base64.strip():
                            if logo_base64.startswith('http'):
                                # Already HTTP URL - use it directly
                                logger.info(f"✅ Bank {bank_code} has HTTP URL logo in DB: {logo_base64[:80]}...")
                                return logo_base64
                            else:
                                # Generate API URL to serve this logo
                                # Get base URL from environment or use default
                                import os
                                base_url = os.getenv('APP_BASE_URL', 'https://testpy-5374535a2971.herokuapp.com')
                                api_url = f"{base_url}/api/bank-logo/{bank_code}"
                                logger.info(f"✅ Generated API URL for bank {bank_code}: {api_url}")
                                return api_url
                        else:
                            logger.warning(f"⚠️ Bank {bank_code} found but logo_base64 is empty or invalid")
                    else:
                        logger.warning(f"⚠️ Bank code {bank_code} not found in database")
                except Exception as query_error:
                    error_info = f"Query error for bank_code {bank_code}: {str(query_error)}"
                    logger.warning(f"⚠️ {error_info}")
            
            # ถ้าไม่มี code ลองหาจากชื่อ
            if bank_name:
                try:
                    bank = banks_collection.find_one({"name": {"$regex": bank_name, "$options": "i"}, "is_active": True})
                    if bank and bank.get("logo_base64"):
                        logo_base64 = bank.get("logo_base64")
                        # Validate logo_base64
                        if logo_base64 and isinstance(logo_base64, str) and logo_base64.strip():
                            # ถ้ามี base64 ให้ return เป็น data URI
                            if logo_base64.startswith('data:'):
                                logger.info(f"✅ Found logo for bank {bank_name} (data URI format)")
                                return logo_base64
                            else:
                                logger.info(f"✅ Found logo for bank {bank_name} (base64 format, length: {len(logo_base64)})")
                                return f"data:image/png;base64,{logo_base64}"
                except Exception as query_error:
                    error_info = f"Query error for bank_name {bank_name}: {str(query_error)}"
                    logger.warning(f"⚠️ {error_info}")
        except Exception as e:
            if not error_info:
                error_info = f"Database error: {str(e)}"
            logger.warning(f"⚠️ Cannot load bank logo from database: {error_info}")
            # Log error to admin dashboard (will be handled by error logging system)
            try:
                if db:
                    error_collection = db.get_collection("system_errors")
                    error_collection.insert_one({
                        "type": "bank_logo_error",
                        "bank_code": bank_code,
                        "bank_name": bank_name,
                        "error_message": error_info,
                        "timestamp": datetime.utcnow()
                    })
            except:
                pass
    
    # Fallback to hardcoded logos
    if bank_code and bank_code in BANK_LOGOS:
        logger.info(f"📦 Using hardcoded logo for bank code {bank_code}")
        return BANK_LOGOS[bank_code]
    if bank_name:
        bn = bank_name.upper()
        pairs = [
            ("KTB","006"),("กรุงไทย","006"),
            ("GSB","030"),("ออมสิน","030"),
            ("KBANK","004"),("กสิกร","004"),
            ("SCB","014"),("ไทยพาณิชย์","014"),
            ("BBL","002"),("กรุงเทพ","002"),
            ("BAY","025"),("กรุงศรี","025"),
            ("TMB","011"),("TTB","011"),("ทีเอ็มบีธนชาต","011"),
            ("UOB","071"),("ยูโอบี","071"),
            ("GHB","080"),("ธอส","080"),
            ("TISCO","076"),("ทิสโก้","076"),
            ("BAAC","034"),("ธกส","034"),
            ("KKP","069"),("เกียรตินาคิน","069"),
            ("LAND AND HOUSES","081"),("แลนด์แอนด์เฮ้าส์","081"),
            ("ISLAMIC","084"),("อิสลาม","084"),
        ]
        for key, code in pairs:
            if key in bn or key in bank_name:
                return BANK_LOGOS.get(code, DEFAULT_LOGO)
    return DEFAULT_LOGO

def format_currency(amount: Union[str,int,float]) -> str:
    try:
        if isinstance(amount, (int, float)): return f"฿{amount:,.2f}"
        if isinstance(amount, str): return f"฿{float(amount.replace(',','')):,.2f}"
    except: pass
    return f"฿{amount}"

def _digits(s: str) -> str:
    return re.sub(r"\D", "", s or "")

def format_account_with_dashes(acc: str) -> str:
    d = _digits(acc)
    n = len(d)
    if n == 10:  # 3-1-5-1
        return f"{d[0:3]}-{d[3]}-{d[4:9]}-{d[9]}"
    if n == 9:   # 3-1-4-1
        return f"{d[0:3]}-{d[3]}-{d[4:8]}-{d[8]}"
    if n >= 7:
        mid = d[4:-1]
        return f"{d[0:3]}-{d[3]}-{mid}-{d[-1]}"
    return acc or ""

def mask_account_formatted(acc: str, visible_tail: int = 4) -> str:
    f = format_account_with_dashes(acc)
    digits = [c for c in f if c.isdigit()]
    if not digits: return f
    keep = max(1, min(len(digits), visible_tail))
    to_mask = len(digits) - keep
    out, m, k = [], 0, 0
    for ch in f:
        if ch.isdigit():
            if m < to_mask: out.append("x"); m += 1
            else: out.append(digits[to_mask+k]); k += 1
        else:
            out.append(ch)
    return "".join(out)

# -----------------------------
# HELPERS : วันที่ไทย (พ.ศ.)
# -----------------------------
THAI_MONTHS_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."]

def format_thai_datetime(date_str: str = "", time_str: str = "") -> str:
    """
    รับรูปแบบวันที่/เวลาได้หลายแบบ แล้วคืนเป็น: '13 ส.ค. 68, 02:50 น.'
    พ.ศ. = ค.ศ. + 543 และใช้เลขปี 2 หลักตามตัวอย่าง
    """
    if not date_str and not time_str:
        return ""
    raw = (date_str or "").strip() + " " + (time_str or "").strip()
    raw = raw.strip()

    candidates = [
        "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S",
        "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M",
        "%d-%m-%Y %H:%M:%S", "%d-%m-%Y %H:%M",
        "%Y/%m/%d %H:%M:%S", "%Y/%m/%d %H:%M",
        "%d/%m/%y %H:%M:%S", "%d/%m/%y %H:%M",
        "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"
    ]
    dt = None
    for fmt in candidates:
        try:
            dt = datetime.strptime(raw, fmt); break
        except: pass
    if not dt:
        # บางกรณี date,time มาแยกแล้ว time มีวินาที
        if date_str:
            for df in ["%Y-%m-%d","%d/%m/%Y","%Y/%m/%d","%d-%m-%Y"]:
                try:
                    d = datetime.strptime(date_str, df)
                    if time_str:
                        for tf in ["%H:%M:%S","%H:%M"]:
                            try:
                                t = datetime.strptime(time_str, tf)
                                dt = d.replace(hour=t.hour, minute=t.minute, second=getattr(t, "second", 0))
                                break
                            except: pass
                    else:
                        dt = d
                    break
                except: pass
    if not dt:
        # ถ้าพาร์สไม่ได้ ให้คืนเดิม
        merged = " ".join([i for i in [date_str, time_str] if i]).strip()
        return merged

    y_th = dt.year + 543
    y2 = f"{y_th % 100:02d}"
    month_th = THAI_MONTHS_SHORT[dt.month - 1]
    time_txt = dt.strftime("%H:%M")
    return f"{dt.day} {month_th} {y2}, {time_txt} น."

# -----------------------------
# FLEX (Improved)
# -----------------------------
def render_flex_template_with_data(flex_template: Dict[str, Any], result: Dict[str, Any], db=None) -> Dict[str, Any]:
    """Render flex message template with result data
    
    Args:
        flex_template: Flex message template
        result: Slip verification result data
        db: MongoDB database instance (required for bank logo lookup)
    """
    try:
        import json
        import copy
        
        # Validate inputs
        if not flex_template:
            logger.error(f"❌ flex_template is None or empty")
            return None
        
        if not result:
            logger.error(f"❌ result is None or empty")
            return None
        
        logger.info(f"🎨 Rendering flex template with data (db={'provided' if db else 'NOT PROVIDED'})")
        
        data = result.get("data", {}) or {}
        
        # Extract amount
        amount_obj = data.get("amount", {})
        if isinstance(amount_obj, dict):
            amount = amount_obj.get("amount", 0)
        else:
            amount = amount_obj
        amount_display = format_currency(amount)
        amount_number = f"{amount:,.2f}" if isinstance(amount, (int, float)) else str(amount)
        
        # Format datetime
        datetime_str = format_thai_datetime(
            data.get("date", data.get("trans_date", "")) or "",
            data.get("time", data.get("trans_time", "")) or ""
        )
        
        # Get reference
        reference = data.get("transRef", data.get("reference", "-"))
        
        # Get sender/receiver info
        sender = data.get("sender", {})
        receiver = data.get("receiver", {})
        
        # Extract sender info
        if isinstance(sender, str):
            sender_name = sender
            sender_account = ""
            sender_bank_code = ""
            sender_bank = ""
        else:
            sender_name_dict = sender.get("account", {}).get("name", {})
            sender_name = sender_name_dict.get("th", "") or sender_name_dict.get("en", "") or "ไม่ระบุชื่อ"
            sender_acc = sender.get("account", {}).get("bank", {}).get("account", "")
            sender_account = mask_account_formatted(sender_acc) if sender_acc else ""
            sender_bank_code = sender.get("bank", {}).get("id", "")
            sender_bank = sender.get("bank", {}).get("short", "") or sender.get("bank", {}).get("name", "")
        
        # Extract receiver info
        if isinstance(receiver, str):
            receiver_name = receiver
            receiver_account = ""
            receiver_bank_code = ""
            receiver_bank = ""
        else:
            receiver_name_dict = receiver.get("account", {}).get("name", {})
            receiver_name = receiver_name_dict.get("th", "") or receiver_name_dict.get("en", "") or "ไม่ระบุชื่อ"
            receiver_acc = receiver.get("account", {}).get("bank", {}).get("account", "")
            receiver_account = mask_account_formatted(receiver_acc) if receiver_acc else ""
            receiver_bank_code = receiver.get("bank", {}).get("id", "")
            receiver_bank = receiver.get("bank", {}).get("short", "") or receiver.get("bank", {}).get("name", "")
        
        # Get bank logos (pass db parameter for database lookup)
        logger.info(f"🏛️ Getting bank logos for sender '{sender_bank}' (code: {sender_bank_code}) and receiver '{receiver_bank}' (code: {receiver_bank_code})")
        sender_bank_logo = get_bank_logo(sender_bank_code, sender_bank, db=db)
        receiver_bank_logo = get_bank_logo(receiver_bank_code, receiver_bank, db=db)
        
        # ✅ Validate that we got logos
        if sender_bank_logo:
            logger.info(f"✅ Sender bank logo retrieved: {sender_bank_logo[:80]}...")
        else:
            logger.error(f"❌ Sender bank logo is None!")
            
        if receiver_bank_logo:
            logger.info(f"✅ Receiver bank logo retrieved: {receiver_bank_logo[:80]}...")
        else:
            logger.error(f"❌ Receiver bank logo is None!")
        
        # Get verified time
        import pytz
        from datetime import datetime
        thai_tz = pytz.timezone("Asia/Bangkok")
        verified_time = datetime.now(thai_tz).strftime("%d %b %y, %H:%M น.").replace("Jan","ม.ค.").replace("Feb","ก.พ.").replace("Mar","มี.ค.").replace("Apr","เม.ย.").replace("May","พ.ค.").replace("Jun","มิ.ย.").replace("Jul","ก.ค.").replace("Aug","ส.ค.").replace("Sep","ก.ย.").replace("Oct","ต.ค.").replace("Nov","พ.ย.").replace("Dec","ธ.ค.")
        
        # Prepare replacement data
        replacement_data = {
            "{{amount}}": amount_display,
            "{{amount_number}}": amount_number,
            "{{datetime}}": datetime_str,
            "{{reference}}": reference,
            "{{sender_name}}": sender_name,
            "{{sender_account}}": sender_account,
            "{{sender_bank}}": sender_bank,
            "{{sender_bank_logo}}": sender_bank_logo,
            "{{receiver_name}}": receiver_name,
            "{{receiver_account}}": receiver_account,
            "{{receiver_bank}}": receiver_bank,
            "{{receiver_bank_logo}}": receiver_bank_logo,
            "{{verified_time}}": verified_time
        }
        
        # Deep copy template to avoid modifying original
        flex_copy = copy.deepcopy(flex_template)
        
        # Convert to JSON string, replace, and convert back
        flex_json = json.dumps(flex_copy)
        for key, value in replacement_data.items():
            flex_json = flex_json.replace(key, str(value))
        
        rendered_flex = json.loads(flex_json)
        
        # Add duplicate warning if status is duplicate
        status = result.get("status", "")
        if status == "duplicate":
            # Insert duplicate warning block after amount
            body_contents = rendered_flex.get("contents", {}).get("body", {}).get("contents", [])
            if len(body_contents) > 1:
                # Create duplicate warning block - สีเหลือง
                duplicate_count = result.get("duplicate_count", 1)
                is_user_duplicate = result.get("is_user_duplicate", True)
                
                warning_text = "⚠️ สลิปซ้ำ"
                if is_user_duplicate:
                    warning_detail = f"คุณใช้สลิปนี้ไปแล้ว {duplicate_count} ครั้ง"
                else:
                    warning_detail = "สลิปนี้เคยถูกตรวจสอบไปแล้ว กรุณาตรวจสอบกับผู้โอนอีกครั้ง"
                
                duplicate_warning = {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": "⚠️",
                                    "size": "xl",
                                    "flex": 0,
                                    "color": "#D97706"
                                },
                                {
                                    "type": "box",
                                    "layout": "vertical",
                                    "contents": [
                                        {
                                            "type": "text",
                                            "text": warning_text,
                                            "size": "md",
                                            "weight": "bold",
                                            "color": "#92400E"
                                        },
                                        {
                                            "type": "text",
                                            "text": warning_detail,
                                            "size": "sm",
                                            "color": "#78350F",
                                            "wrap": True,
                                            "margin": "xs"
                                        }
                                    ],
                                    "margin": "md",
                                    "flex": 1
                                }
                            ],
                            "spacing": "sm"
                        }
                    ],
                    "backgroundColor": "#FEF3C7",
                    "cornerRadius": "12px",
                    "paddingAll": "16px",
                    "margin": "lg",
                    "borderColor": "#FCD34D",
                    "borderWidth": "2px"
                }
                # Insert after amount box (index 1)
                body_contents.insert(1, duplicate_warning)
                logger.info(f"⚠️ Added duplicate warning to flex message")
        
        # ✅ FINAL STEP: Remove invalid 'size' from non-text/image components before returning
        # LINE API rejects flex messages with 'size' on box/separator/etc
        def quick_sanitize(obj):
            """Quick sanitize to remove 'size' from invalid components"""
            # Components that CANNOT have 'size' property
            INVALID_SIZE_COMPONENTS = {'box', 'separator', 'spacer', 'button', 'filler'}
            # Valid sizes
            VALID_TEXT_SIZES = {'xxs', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl', '3xl', '4xl', '5xl', 'full'}
            VALID_IMAGE_SIZES = {'xxs', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl', '3xl', '4xl', '5xl', 'full'}
            VALID_BUBBLE_SIZES = {'nano', 'micro', 'kilo', 'mega', 'giga'}
            
            if isinstance(obj, dict):
                cleaned = {}
                comp_type = obj.get('type', '').lower()
                for key, value in obj.items():
                    if key == 'size':
                        # Check if component type explicitly cannot have 'size'
                        if comp_type in INVALID_SIZE_COMPONENTS:
                            # Remove size for invalid components
                            logger.warning(f"⚠️ Removing invalid 'size' from {comp_type} component in quick_sanitize")
                            continue  # Skip adding this key
                        elif comp_type == 'text':
                            # Validate text size
                            if isinstance(value, str) and value.lower() in VALID_TEXT_SIZES:
                                cleaned[key] = value
                            else:
                                logger.warning(f"⚠️ Removing invalid text size: {value}")
                                continue
                        elif comp_type == 'image':
                            # Validate image size
                            if isinstance(value, str) and value.lower() in VALID_IMAGE_SIZES:
                                cleaned[key] = value
                            else:
                                logger.warning(f"⚠️ Removing invalid image size: {value}")
                                continue
                        elif comp_type == 'bubble':
                            # Validate bubble size
                            if isinstance(value, str) and value.lower() in VALID_BUBBLE_SIZES:
                                cleaned[key] = value
                            else:
                                logger.warning(f"⚠️ Invalid bubble size: {value}, using 'mega'")
                                cleaned[key] = 'mega'
                        elif not comp_type:
                            # Component without type - remove size
                            logger.warning(f"⚠️ Removing 'size' from component without type")
                            continue
                        else:
                            # Unknown type - remove size to be safe
                            logger.warning(f"⚠️ Removing 'size' from unknown type: {comp_type}")
                            continue
                    else:
                        cleaned[key] = quick_sanitize(value)
                return cleaned
            elif isinstance(obj, list):
                return [quick_sanitize(item) for item in obj]
            return obj
        
        # Apply iterative sanitization to ensure deeply nested structures are cleaned efficiently
        # Continue sanitizing until no changes are detected (max 5 iterations)
        import json as json_module
        previous = None
        iterations = 0
        max_iterations = 5
        
        while iterations < max_iterations:
            rendered_flex = quick_sanitize(rendered_flex)
            
            # Check if anything changed
            try:
                current_json = json_module.dumps(rendered_flex, sort_keys=True)
                if previous == current_json:
                    logger.info(f"✅ Sanitization converged after {iterations + 1} iteration(s)")
                    break
                previous = current_json
            except (TypeError, ValueError):
                # If we can't serialize, just do max iterations
                pass
            
            iterations += 1
        
        if iterations >= max_iterations:
            logger.warning(f"⚠️ Sanitization stopped after {max_iterations} iterations (max reached)")
        
        logger.info(f"✅ Flex template rendered and sanitized successfully")
        return {"type": "flex", "altText": f"ยืนยันการชำระเงิน {amount_display}", "contents": rendered_flex}
    except Exception as e:
        logger.error(f"❌ Error rendering flex template: {e}", exc_info=True)
        return None

def create_beautiful_slip_flex_message(result: Dict[str, Any], template_id: str = None, db = None) -> Dict[str, Any]:
    """
    สร้าง Flex Message ที่ดูทันสมัยและสวยงามยิ่งขึ้น
    - ใช้สีและ gradient ที่น่าสนใจ
    - จัดวาง layout ให้ดูมีมิติ
    - เน้นตัวเลขและข้อมูลสำคัญให้เด่นชัด
    - รองรับ custom template จาก database
    - แสดงรายละเอียดครบถ้วนทั้ง success และ duplicate
    """
    try:
        # ถ้ามี template_id และ db ให้ดึง custom template
        if template_id and db is not None:
            try:
                from bson import ObjectId
                logger.info(f"🔍 Looking for template ID: {template_id}")
                template = db.slip_templates.find_one({"_id": ObjectId(template_id)})
                if template and template.get("template_flex"):
                    logger.info(f"🎯 Using custom template: {template.get('template_name')}")
                    rendered = render_flex_template_with_data(template["template_flex"], result, db=db)
                    if rendered:
                        logger.info(f"✅ Template rendered successfully: {template.get('template_name')}")
                        return rendered
                    logger.warning(f"⚠️ Template rendering failed, using default template")
                elif template:
                    logger.warning(f"⚠️ Template {template_id} found but has no flex data, using default")
                else:
                    logger.warning(f"⚠️ Template {template_id} not found in database, using default")
            except Exception as e:
                logger.error(f"❌ Error loading template {template_id}: {e}")
                import traceback
                traceback.print_exc()
        
        # ใช้ default template
        status = (result or {}).get("status")
        data = (result or {}).get("data", {}) or {}
        
        logger.info(f"🔍 Creating Flex Message - Status: {status}")
        logger.info(f"🔍 Data keys: {list(data.keys()) if data else 'No data'}")
        
        # ✅ แสดงข้อมูลครบถ้วนทั้ง success และ duplicate
        if not data and status not in ["success", "duplicate"]:
            logger.warning("⚠️ No data in result, returning error flex message")
            return create_error_flex_message(result.get("message", "ไม่สามารถดึงข้อมูลสลิปได้"))

        # ดึงจำนวนเงินจาก Thunder API
        try:
            amount_obj = data.get("amount", {})
            if isinstance(amount_obj, dict):
                amount = amount_obj.get("amount", 0)
            else:
                amount = amount_obj
            amount_display = format_currency(amount)
            logger.info(f"💰 Amount: {amount} -> {amount_display}")
        except Exception as e:
            logger.error(f"❌ Error parsing amount: {e}")
            amount = 0
            amount_display = "0.00 บาท"

        date_th = format_thai_datetime(
            data.get("date", data.get("trans_date", "")) or "",
            data.get("time", data.get("trans_time", "")) or "",
        )

        thai_tz = pytz.timezone("Asia/Bangkok")
        verified_th = datetime.now(thai_tz).strftime("%d %b %y, %H:%M น.").replace("Jan","ม.ค.").replace("Feb","ก.พ.").replace("Mar","มี.ค.").replace("Apr","เม.ย.").replace("May","พ.ค.").replace("Jun","มิ.ย.").replace("Jul","ก.ค.").replace("Aug","ส.ค.").replace("Sep","ก.ย.").replace("Oct","ต.ค.").replace("Nov","พ.ย.").replace("Dec","ธ.ค.")

        ref_no = data.get("transRef") or data.get("reference") or "-"

        # ดึงข้อมูลผู้โอนและผู้รับจาก Thunder API response
        sender = data.get("sender", {})
        receiver = data.get("receiver", {})
        
        # ตรวจสอบว่า sender/receiver เป็น string หรือ dict
        # Thunder API บางครั้งส่งมาเป็น string แทน dict
        if isinstance(sender, str):
            s_name = sender
            s_acc_mask = ""
            s_bank = data.get("sender_bank", "")
            s_code = ""
        else:
            # ชื่อผู้โอน
            sender_name = sender.get("account", {}).get("name", {})
            s_name = sender_name.get("th", "") or sender_name.get("en", "") or "ไม่ระบุชื่อ"
            # เลขบัญชีผู้โอน
            s_acc = sender.get("account", {}).get("bank", {}).get("account", "")
            s_acc_mask = mask_account_formatted(s_acc) if s_acc else ""
            # ธนาคารผู้โอน
            s_code = sender.get("bank", {}).get("id", "")
            s_bank = sender.get("bank", {}).get("short", "") or sender.get("bank", {}).get("name", "")
        
        if isinstance(receiver, str):
            r_name = receiver
            r_acc_mask = ""
            r_bank = data.get("receiver_bank", "")
            r_code = ""
        else:
            # ชื่อผู้รับ
            receiver_name = receiver.get("account", {}).get("name", {})
            r_name = receiver_name.get("th", "") or receiver_name.get("en", "") or "ไม่ระบุชื่อ"
            # เลขบัญชีผู้รับ
            r_acc = receiver.get("account", {}).get("bank", {}).get("account", "")
            r_acc_mask = mask_account_formatted(r_acc) if r_acc else ""
            # ธนาคารผู้รับ
            r_code = receiver.get("bank", {}).get("id", "")
            r_bank = receiver.get("bank", {}).get("short", "") or receiver.get("bank", {}).get("name", "")
        
        # Fallback ถ้าไม่มีข้อมูล ให้ใช้จาก data ตรงๆ
        if not s_name or s_name == "ไม่ระบุชื่อ":
            s_name = data.get("sender_name", data.get("sender_name_th", "ไม่ระบุชื่อ"))
        if not r_name or r_name == "ไม่ระบุชื่อ":
            r_name = data.get("receiver_name", data.get("receiver_name_th", "ไม่ระบุชื่อ"))
        if not s_bank:
            s_bank = data.get("sender_bank_name", data.get("sender_bank_short", ""))
        if not r_bank:
            r_bank = data.get("receiver_bank_name", data.get("receiver_bank_short", ""))

        try:
            s_logo = get_bank_logo(s_code, s_bank, db=db)
            logger.info(f"🏦 Sender bank logo: {s_code} -> {s_logo[:50] if s_logo else 'None'}...")
        except Exception as e:
            logger.error(f"❌ Error getting sender bank logo: {e}")
            s_logo = DEFAULT_LOGO
        
        try:
            r_logo = get_bank_logo(r_code, r_bank, db=db)
            logger.info(f"🏦 Receiver bank logo: {r_code} -> {r_logo[:50] if r_logo else 'None'}...")
        except Exception as e:
            logger.error(f"❌ Error getting receiver bank logo: {e}")
            r_logo = DEFAULT_LOGO

        if status == "success":
            badge_text = "สลิปถูกต้อง"
            badge_color = "#FFFFFF"
            header_bg = "#22C55E"
            icon = "✅"
        elif status == "duplicate":
            badge_text = "สลิปถูกต้อง"
            badge_color = "#FFFFFF"
            header_bg = "#22C55E"
            icon = "✅"
        else:
            badge_text = "ตรวจสอบไม่ผ่าน"
            badge_color = "#FFFFFF"
            header_bg = "#EF4444"
            icon = "❌"

        bubble = {
            "type": "bubble",
            "size": "mega",
            "header": {
                "type": "box",
                "layout": "horizontal",
                "contents": [
                    {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {
                                "type": "box",
                                "layout": "vertical",
                                "contents": [
                                    {"type": "text", "text": icon, "size": "xl", "align": "center", "color": "#22C55E" if status != "error" else "#EF4444"}
                                ],
                                "width": "48px",
                                "height": "48px",
                                "backgroundColor": "#FFFFFF",
                                "cornerRadius": "24px",
                                "justifyContent": "center",
                                "alignItems": "center"
                            }
                        ],
                        "flex": 0
                    },
                    {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {
                                "type": "text",
                                "text": badge_text,
                                "size": "xxl",
                                "weight": "bold",
                                "color": "#FFFFFF"
                            }
                        ],
                        "margin": "md",
                        "justifyContent": "center"
                    }
                ],
                "backgroundColor": header_bg,
                "paddingAll": "20px",
                "spacing": "md"
            },
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    # แถบเตือนสลิปซ้ำ (ถ้าเป็น duplicate) - สีเหลือง
                    *([{
                        "type": "box",
                        "layout": "horizontal",
                        "contents": [
                            {"type": "text", "text": "⚠️", "size": "lg", "flex": 0, "color": "#D97706"},
                            {
                                "type": "box",
                                "layout": "vertical",
                                "contents": [
                                    {"type": "text", "text": "สลิปซ้ำ", "size": "md", "weight": "bold", "color": "#92400E"},
                                    {"type": "text", "text": f"สลิปนี้เคยถูกใช้แล้ว +{result.get('duplicate_count', 1)}", "size": "xs", "color": "#78350F", "wrap": True}
                                ],
                                "margin": "md"
                            }
                        ],
                        "backgroundColor": "#FEF3C7",
                        "cornerRadius": "12px",
                        "paddingAll": "16px",
                        "spacing": "md",
                        "borderColor": "#FCD34D",
                        "borderWidth": "2px"
                    }] if status == "duplicate" else []),
                    
                    {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {"type": "text", "text": amount_display, "size": "5xl", "weight": "bold", "color": "#1E3A8A"},
                            {"type": "text", "text": date_th, "size": "sm", "color": "#9CA3AF", "margin": "sm"}
                        ],
                        "margin": "lg" if status != "duplicate" else "md",
                        "spacing": "sm"
                    },

                    {"type": "text", "text": "ผู้โอน", "size": "xs", "color": "#6C757D", "margin": "xl", "weight": "bold"},
                    {
                        "type": "box",
                        "layout": "horizontal",
                        "contents": [
                            {"type": "image", "url": s_logo, "size": "sm", "aspectRatio": "1:1", "flex": 0},
                            {
                                "type": "box",
                                "layout": "vertical",
                                "contents": [
                                    {"type": "text", "text": s_name[:40], "size": "md", "weight": "bold", "wrap": True, "color": "#1F2937"},
                                    {"type": "text", "text": f"{s_bank}  {s_acc_mask}", "size": "sm", "color": "#6B7280", "wrap": True, "margin": "xs"}
                                ],
                                "margin": "md", "spacing": "xs", "justifyContent": "center"
                            }
                        ],
                        "margin": "sm",
                        "spacing": "md"
                    },

                    {"type": "text", "text": "ผู้รับ", "size": "xs", "color": "#9CA3AF", "weight": "bold", "margin": "xl"},
                    {
                        "type": "box",
                        "layout": "horizontal",
                        "contents": [
                            {"type": "image", "url": r_logo, "size": "sm", "aspectRatio": "1:1", "flex": 0},
                            {
                                "type": "box",
                                "layout": "vertical",
                                "contents": [
                                    {"type": "text", "text": r_name[:40], "size": "md", "weight": "bold", "wrap": True, "color": "#1F2937"},
                                    {"type": "text", "text": f"{r_bank}  {r_acc_mask}", "size": "sm", "color": "#6B7280", "wrap": True, "margin": "xs"}
                                ],
                                "margin": "md", "spacing": "xs", "justifyContent": "center"
                            }
                        ],
                        "margin": "sm",
                        "spacing": "md"
                    },


                    {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {"type": "text", "text": "เลขอ้างอิง", "size": "xs", "color": "#9CA3AF", "margin": "md"},
                            {"type": "text", "text": ref_no, "size": "sm", "wrap": True, "color": "#374151", "margin": "xs"}
                        ],
                        "spacing": "xs"
                    },

                    # ค่าธรรมเนียม (ถ้ามี)
                    *([{
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {"type": "text", "text": "ค่าธรรมเนียม", "size": "xs", "color": "#9CA3AF", "margin": "md"},
                            {"type": "text", "text": format_currency(data.get("fee", 0)), "size": "sm", "wrap": True, "color": "#374151", "margin": "xs"}
                        ],
                        "spacing": "xs"
                    }] if data.get("fee") else []),

                    # บันทึก/ข้อความ (ถ้ามี)
                    *([{
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {"type": "text", "text": "บันทึก", "size": "xs", "color": "#9CA3AF", "margin": "md"},
                            {"type": "text", "text": data.get("note", data.get("memo", ""))[:100], "size": "sm", "wrap": True, "color": "#374151", "margin": "xs"}
                        ],
                        "spacing": "xs"
                    }] if data.get("note") or data.get("memo") else [])
                ],
                "backgroundColor": "#F5F5F0",
                "paddingAll": "20px"
            },
            "footer": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "box",
                        "layout": "horizontal",
                        "contents": [
                            {"type": "text", "text": "🔍", "size": "xs", "flex": 0},
                            {
                                "type": "text",
                                "text": f"สลิปจริงตรวจสอบโดย ธันเดอร์ โมบายแอพ",
                                "size": "xxs",
                                "color": "#3B82F6",
                                "margin": "xs",
                                "weight": "bold",
                                "flex": 1
                            }
                        ],
                        "spacing": "xs",
                        "justifyContent": "center"
                    },
                    {
                        "type": "text",
                        "text": "ผู้ให้บริการเช็คสลิปอันดับ 1",
                        "size": "xxs",
                        "color": "#9CA3AF",
                        "align": "center",
                        "margin": "xs"
                    }
                ],
                "backgroundColor": "#F9FAFB",
                "paddingAll": "16px",
                "spacing": "xs"
            }
        }

        # No need to add duplicate warning in flex message
        # It will be sent as a separate text message
        
        logger.info(f"✅ Flex Message created successfully for status: {status}")
        return {"type": "flex", "altText": f"{badge_text} {amount_display}", "contents": bubble}

    except Exception as e:
        logger.error(f"❌ Error creating flex message: {e}", exc_info=True)
        return create_simple_text_message(result)

# -----------------------------
# FALLBACK (Improved)
# -----------------------------
def create_simple_text_message(result: Dict[str, Any]) -> Dict[str, Any]:
    status = (result or {}).get("status")
    data = (result or {}).get("data", {}) or {}

    if status == "success":
        amount = format_currency(data.get("amount", 0))
        s_acc = mask_account_formatted(data.get("sender_account_number", "") or data.get("sender_account", ""))
        r_acc = mask_account_formatted(data.get("receiver_account_number", "") or data.get("receiver_account", ""))
        msg = (
            "✅ สลิปถูกต้อง\n"
            f"💰 ยอดเงิน: {amount}\n"
            f"🕒 เวลา: {format_thai_datetime(data.get('date',''), data.get('time',''))}\n"
            f"🔢 เลขอ้างอิง: {data.get('transRef', data.get('reference','-'))}\n"
            f"👤 ผู้โอน: {data.get('sender', data.get('sender_name_th','-'))} ({s_acc})\n"
            f"🎯 ผู้รับ: {data.get('receiver', data.get('receiver_name_th','-'))} ({r_acc})"
        )
    elif status == "duplicate":
        msg = "⚠️ สลิปนี้เคยถูกใช้แล้ว\n" + f"💰 ยอดเงิน: {format_currency(data.get('amount', 0))}"
    else:
        msg = f"❌ ไม่สามารถตรวจสอบสลิปได้\n\n**ข้อความจากระบบ:**\n{(result or {}).get('message','เกิดข้อผิดพลาด')}\n\n**คำแนะนำ:**\n• ตรวจสอบให้แน่ใจว่าสลิปชัดเจน\n• ลองถ่ายรูปใหม่หากไม่ชัด"
    return {"type": "text", "text": msg}

def create_error_flex_message(error_message: str) -> Dict[str, Any]:
    return {
        "type": "flex",
        "altText": "❌ ไม่สามารถตรวจสอบสลิปได้",
        "contents": {
            "type": "bubble",
            "size": "kilo",
            "header": {
                "type": "box",
                "layout": "horizontal",
                "contents": [
                    {"type": "text", "text": "❌", "size": "xl", "flex": 0},
                    {"type": "text", "text": "ไม่สามารถตรวจสอบสลิปได้", "weight": "bold", "size": "md", "color": "#DC3545", "margin": "md"}
                ],
                "backgroundColor": "#F8D7DA",
                "paddingAll": "15px"
            },
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {"type": "text", "text": error_message, "size": "sm", "color": "#343A40", "wrap": True},
                    {"type": "separator", "margin": "lg", "color": "#E9ECEF"},
                    {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {"type": "text", "text": "💡 คำแนะนำ:", "size": "sm", "weight": "bold", "color": "#007BFF"},
                            {"type": "text", "text": "• ตรวจสอบให้แน่ใจว่าสลิปชัดเจน", "size": "xs", "color": "#6C757D", "margin": "sm"},
                            {"type": "text", "text": "• ตรวจสอบว่าเป็นสลิปจริง", "size": "xs", "color": "#6C757D"},
                            {"type": "text", "text": "• ลองถ่ายรูปใหม่หากไม่ชัด", "size": "xs", "color": "#6C757D"},
                        ],
                        "backgroundColor": "#E7F3FF",
                        "paddingAll": "12px",
                        "cornerRadius": "8px",
                        "margin": "lg"
                    }
                ]
            }
        }
    }
