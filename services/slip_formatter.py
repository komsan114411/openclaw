# services/slip_formatter_enhanced.py
"""
Enhanced Slip Formatter with Full Bank Names and Account Numbers
แสดงชื่อธนาคารเต็ม, เลขบัญชีเต็ม, และจำนวนครั้งสลิปซ้ำ
"""

import logging
from typing import Dict, Any
from datetime import datetime
import pytz

logger = logging.getLogger("slip_formatter_enhanced")

# Bank logos mapping
BANK_LOGOS = {
    "002": "https://www.hood11.com/uploads/khungefl.png",  # BBL (กรุงเทพ)
    "004": "https://www.hood11.com/uploads/kikh.png",  # KBANK (กสิกร)
    "006": "https://www.hood11.com/uploads/khungaifs.png",  # KTB (กรุงไทย)
    "011": "https://www.hood11.com/uploads/ttb.png",  # TMB/TTB
    "014": "https://www.hood11.com/uploads/aifslanichsscb.png",  # SCB (ไทยพาณิชย์)
    "025": "https://www.hood11.com/uploads/khunghhi2.png",  # BAY (กรุงศรี)
    "030": "https://www.hood11.com/uploads/sif.png",  # GSB (ออมสิน)
    "034": "https://www.hood11.com/uploads/phfakhahphk.png",  # BAAC (ธกส.)
    "069": "https://www.hood11.com/uploads/ekishpifakhif.png",  # KKP (เกียรตินาคิน)
    "070": "https://www.hood11.com/uploads/icbc.png",  # ICBC
    "071": "https://www.hood11.com/uploads/uob.png", # UOB
    "073": "https://www.hood11.com/uploads/phfakhahphfchapi.png", # ธนชาต
    "076": "https://www.hood11.com/uploads/fiok.png", # TISCO (ทิสโก้)
    "080": "https://www.hood11.com/uploads/ph.png", # GHB (ธอส.)
    "081": "https://www.hood11.com/uploads/aelfbaelfbeaf.png", # LH Bank (แลนด์แอนด์เฮ้าส์)
    "084": "https://www.hood11.com/uploads/phfakhahilas.png", # Islamic Bank (ธนาคารอิสลาม)
}

# Full bank names in Thai
BANK_FULL_NAMES = {
    "002": "ธนาคารกรุงเทพ",
    "004": "ธนาคารกสิกรไทย",
    "006": "ธนาคารกรุงไทย",
    "011": "ธนาคารทหารไทยธนชาต",
    "014": "ธนาคารไทยพาณิชย์",
    "025": "ธนาคารกรุงศรีอยุธยา",
    "030": "ธนาคารออมสิน",
    "034": "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร",
    "069": "ธนาคารเกียรตินาคินภัทร",
    "070": "ธนาคารไอซีบีซี (ไทย)",
    "071": "ธนาคารยูโอบี",
    "073": "ธนาคารธนชาต",
    "076": "ธนาคารทิสโก้",
    "080": "ธนาคารอาคารสงเคราะห์",
    "081": "ธนาคารแลนด์ แอนด์ เฮ้าส์",
    "084": "ธนาคารอิสลามแห่งประเทศไทย"
}

# Short code to full name mapping
SHORT_TO_FULL_NAME = {
    "BBL": "ธนาคารกรุงเทพ",
    "KBANK": "ธนาคารกสิกรไทย",
    "KTB": "ธนาคารกรุงไทย",
    "TTB": "ธนาคารทหารไทยธนชาต",
    "TMB": "ธนาคารทหารไทยธนชาต",
    "SCB": "ธนาคารไทยพาณิชย์",
    "BAY": "ธนาคารกรุงศรีอยุธยา",
    "GSB": "ธนาคารออมสิน",
    "BAAC": "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร",
    "KKP": "ธนาคารเกียรตินาคินภัทร",
    "ICBC": "ธนาคารไอซีบีซี (ไทย)",
    "UOB": "ธนาคารยูโอบี",
    "TISCO": "ธนาคารทิสโก้",
    "GHB": "ธนาคารอาคารสงเคราะห์",
    "LHB": "ธนาคารแลนด์ แอนด์ เฮ้าส์",
    "ISBT": "ธนาคารอิสลามแห่งประเทศไทย"
}

def get_bank_logo(bank_code: str = None, bank_name: str = None) -> str:
    """Get bank logo URL from bank code or name"""
    if bank_code and bank_code in BANK_LOGOS:
        return BANK_LOGOS[bank_code]
    
    # Fallback to name matching
    if bank_name:
        bank_name_upper = bank_name.upper()
        if "KTB" in bank_name_upper or "กรุงไทย" in bank_name:
            return BANK_LOGOS["006"]
        elif "GSB" in bank_name_upper or "ออมสิน" in bank_name:
            return BANK_LOGOS["030"]
        elif "KBANK" in bank_name_upper or "กสิกร" in bank_name:
            return BANK_LOGOS["004"]
        elif "SCB" in bank_name_upper or "ไทยพาณิชย์" in bank_name:
            return BANK_LOGOS["014"]
        elif "BBL" in bank_name_upper or "กรุงเทพ" in bank_name:
            return BANK_LOGOS["002"]
        elif "BAY" in bank_name_upper or "กรุงศรี" in bank_name:
            return BANK_LOGOS["025"]
        elif "TMB" in bank_name_upper or "TTB" in bank_name or "ทีเอ็มบีธนชาต" in bank_name or "ทหารไทย" in bank_name:
            return BANK_LOGOS["011"]
        elif "UOB" in bank_name_upper or "ยูโอบี" in bank_name:
            return BANK_LOGOS["071"]
        elif "GHB" in bank_name_upper or "ธอส" in bank_name or "อาคารสงเคราะห์" in bank_name:
            return BANK_LOGOS["080"]
        elif "TISCO" in bank_name_upper or "ทิสโก้" in bank_name:
            return BANK_LOGOS["076"]
        elif "BAAC" in bank_name_upper or "ธกส" in bank_name or "เกษตร" in bank_name:
            return BANK_LOGOS["034"]
        elif "KKP" in bank_name_upper or "เกียรตินาคิน" in bank_name:
            return BANK_LOGOS["069"]
        elif "LAND AND HOUSES" in bank_name_upper or "แลนด์แอนด์เฮ้าส์" in bank_name or "LHB" in bank_name_upper:
            return BANK_LOGOS["081"]
        elif "ISLAMIC" in bank_name_upper or "อิสลาม" in bank_name:
            return BANK_LOGOS["084"]
        elif "ICBC" in bank_name_upper or "ไอซีบีซี" in bank_name:
            return BANK_LOGOS["070"]
    
    # Default logo
    return "https://www.hood11.com/uploads/logo.webp"

def get_bank_full_name(bank_code: str = None, bank_short: str = None) -> str:
    """Get full bank name in Thai"""
    # Try bank code first
    if bank_code and bank_code in BANK_FULL_NAMES:
        return BANK_FULL_NAMES[bank_code]
    
    # Try short name
    if bank_short:
        bank_short_upper = bank_short.upper()
        if bank_short_upper in SHORT_TO_FULL_NAME:
            return SHORT_TO_FULL_NAME[bank_short_upper]
        
        # Direct mapping for some variations
        if bank_short == "กสิกร":
            return "ธนาคารกสิกรไทย"
        elif bank_short == "ไทยพาณิชย์":
            return "ธนาคารไทยพาณิชย์"
        elif bank_short == "กรุงเทพ":
            return "ธนาคารกรุงเทพ"
        elif bank_short == "กรุงไทย":
            return "ธนาคารกรุงไทย"
        elif bank_short == "กรุงศรี":
            return "ธนาคารกรุงศรีอยุธยา"
        elif bank_short == "ออมสิน":
            return "ธนาคารออมสิน"
        elif bank_short in ["ทหารไทย", "ธนชาต", "ทีเอ็มบี"]:
            return "ธนาคารทหารไทยธนชาต"
    
    # Return original if no match
    return bank_short or bank_code or "ไม่ระบุธนาคาร"

def format_account_number(account: str) -> str:
    """Format account number for full display (no masking)"""
    if not account:
        return ""
    
    # Remove any existing formatting
    account_clean = account.replace("-", "").replace(" ", "")
    
    # Format as xxx-x-xxxxx-x pattern if it's a standard 10-digit Thai account
    if len(account_clean) == 10 and account_clean.isdigit():
        return f"{account_clean[:3]}-{account_clean[3]}-{account_clean[4:9]}-{account_clean[9]}"
    
    # Format as xxxx-xxxx-xxxx-xxxx pattern if it's a 16-digit number
    elif len(account_clean) == 16 and account_clean.isdigit():
        return f"{account_clean[:4]}-{account_clean[4:8]}-{account_clean[8:12]}-{account_clean[12:]}"
    
    # Format as xxx-xxx-xxxx pattern if it's a different format
    elif len(account_clean) == 10:
        return f"{account_clean[:3]}-{account_clean[3:6]}-{account_clean[6:]}"
    
    return account  # Return as-is for other formats

def format_currency(amount: Any) -> str:
    """Format amount as Thai currency with proper formatting"""
    try:
        if isinstance(amount, (int, float)):
            return f"฿{amount:,.2f}"
        elif isinstance(amount, str):
            amount_float = float(amount.replace(",", ""))
            return f"฿{amount_float:,.2f}"
        else:
            return f"฿{amount}"
    except:
        return f"฿{amount}"

def create_beautiful_slip_flex_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """สร้าง Flex Message แบบสวยงามพร้อมโลโก้ธนาคารและข้อมูลครบถ้วน"""
    try:
        status = result.get("status")
        data = result.get("data", {})
        
        if not data:
            return create_error_flex_message(result.get("message", "ไม่สามารถดึงข้อมูลสลิปได้"))
        
        # ดึงข้อมูลจากผลลัพธ์
        amount = data.get("amount", "0")
        amount_display = format_currency(amount)
        
        # วันที่และเวลา
        date = data.get("date", data.get("trans_date", ""))
        time_str = data.get("time", data.get("trans_time", ""))
        
        # เวลาปัจจุบัน
        thai_tz = pytz.timezone('Asia/Bangkok')
        current_time = datetime.now(thai_tz)
        verification_time = current_time.strftime("%d/%m/%Y %H:%M น.")
        
        # Reference
        trans_ref = data.get("transRef", data.get("reference", "N/A"))
        
        # ชื่อผู้ส่งและผู้รับ
        sender_name = (
            data.get("sender_name_th") or 
            data.get("sender_name_en") or 
            data.get("sender", "ไม่ระบุชื่อ")
        )
        
        receiver_name = (
            data.get("receiver_name_th") or 
            data.get("receiver_name_en") or 
            data.get("receiver_name", data.get("receiver", "ไม่ระบุชื่อ"))
        )
        
        # เลขบัญชี (แสดงเต็ม ไม่ปิดบัง)
        sender_account = data.get("sender_account_number", "")
        receiver_account = data.get("receiver_account_number", "")
        
        # Format account numbers
        sender_account_formatted = format_account_number(sender_account) if sender_account else ""
        receiver_account_formatted = format_account_number(receiver_account) if receiver_account else ""
        
        # ธนาคาร
        sender_bank_code = data.get("sender_bank_id", "")
        sender_bank_short = data.get("sender_bank_short", data.get("sender_bank", ""))
        receiver_bank_code = data.get("receiver_bank_id", "")
        receiver_bank_short = data.get("receiver_bank_short", data.get("receiver_bank", ""))
        
        # Get full bank names
        sender_bank_full = get_bank_full_name(sender_bank_code, sender_bank_short)
        receiver_bank_full = get_bank_full_name(receiver_bank_code, receiver_bank_short)
        
        # Get bank logos
        sender_logo = get_bank_logo(sender_bank_code, sender_bank_short)
        receiver_logo = get_bank_logo(receiver_bank_code, receiver_bank_short)
        
        # Fee (ถ้ามี)
        fee = data.get("fee", 0)
        
        # จำนวนครั้งสลิปซ้ำ (สำหรับ duplicate)
        duplicate_count = data.get("duplicate_count", 0) or data.get("usage_count", 0)
        
        # กำหนดสีและข้อความตามสถานะ
        if status == "success":
            header_color = "#00B900"
            status_text = "✅ สลิปถูกต้อง"
            status_icon = "✅"
            header_bg = "#D4EDDA"
        elif status == "duplicate":
            header_color = "#FFA500"
            status_text = "🔄 สลิปซ้ำ"
            status_icon = "🔄"
            header_bg = "#FFF3CD"
        else:
            header_color = "#FF4444"
            status_text = "❌ ตรวจสอบไม่ผ่าน"
            status_icon = "❌"
            header_bg = "#F8D7DA"
        
        # Flex Message Structure
        flex_message = {
            "type": "flex",
            "altText": f"{status_icon} {status_text} {amount_display}",
            "contents": {
                "type": "bubble",
                "size": "mega",
                "header": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": status_text,
                                    "size": "lg",
                                    "weight": "bold",
                                    "color": header_color,
                                    "align": "center"
                                }
                            ]
                        },
                        {
                            "type": "text",
                            "text": f"ตรวจสอบโดย Thunder API",
                            "size": "xxs",
                            "color": "#888888",
                            "align": "center",
                            "margin": "xs"
                        }
                    ],
                    "backgroundColor": header_bg,
                    "paddingAll": "20px"
                },
                "body": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        # จำนวนเงิน
                        {
                            "type": "box",
                            "layout": "vertical",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": amount_display,
                                    "size": "3xl",
                                    "weight": "bold",
                                    "color": "#333333",
                                    "align": "center"
                                },
                                {
                                    "type": "text",
                                    "text": f"{date} เวลา {time_str}",
                                    "size": "sm",
                                    "color": "#666666",
                                    "align": "center",
                                    "margin": "xs"
                                }
                            ],
                            "backgroundColor": "#F8F9FA",
                            "cornerRadius": "12px",
                            "paddingAll": "15px"
                        },
                        
                        # Separator
                        {
                            "type": "separator",
                            "margin": "lg"
                        },
                        
                        # ข้อมูลผู้โอน
                        {
                            "type": "text",
                            "text": "💳 ผู้โอน",
                            "size": "sm",
                            "color": "#888888",
                            "margin": "lg",
                            "weight": "bold"
                        },
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "image",
                                    "url": sender_logo,
                                    "size": "50px",
                                    "aspectRatio": "1:1",
                                    "flex": 0
                                },
                                {
                                    "type": "box",
                                    "layout": "vertical",
                                    "contents": [
                                        {
                                            "type": "text",
                                            "text": sender_name[:30],
                                            "size": "sm",
                                            "weight": "bold",
                                            "color": "#333333",
                                            "wrap": True
                                        },
                                        {
                                            "type": "text",
                                            "text": sender_bank_full,
                                            "size": "xs",
                                            "color": "#666666",
                                            "margin": "xs"
                                        }
                                    ] + ([
                                        {
                                            "type": "text",
                                            "text": f"บัญชี: {sender_account_formatted}",
                                            "size": "xs",
                                            "color": "#666666"
                                        }
                                    ] if sender_account_formatted else []),
                                    "margin": "md",
                                    "spacing": "xs"
                                }
                            ],
                            "margin": "sm",
                            "backgroundColor": "#F8F9FA",
                            "cornerRadius": "8px",
                            "paddingAll": "10px"
                        },
                        
                        # Arrow
                        {
                            "type": "text",
                            "text": "⬇",
                            "align": "center",
                            "color": "#CCCCCC",
                            "margin": "md",
                            "size": "lg"
                        },
                        
                        # ข้อมูลผู้รับ
                        {
                            "type": "text",
                            "text": "🎯 ผู้รับ",
                            "size": "sm",
                            "color": "#888888",
                            "weight": "bold"
                        },
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "image",
                                    "url": receiver_logo,
                                    "size": "50px",
                                    "aspectRatio": "1:1",
                                    "flex": 0
                                },
                                {
                                    "type": "box",
                                    "layout": "vertical",
                                    "contents": [
                                        {
                                            "type": "text",
                                            "text": receiver_name[:30],
                                            "size": "sm",
                                            "weight": "bold",
                                            "color": "#333333",
                                            "wrap": True
                                        },
                                        {
                                            "type": "text",
                                            "text": receiver_bank_full,
                                            "size": "xs",
                                            "color": "#666666",
                                            "margin": "xs"
                                        }
                                    ] + ([
                                        {
                                            "type": "text",
                                            "text": f"บัญชี: {receiver_account_formatted}",
                                            "size": "xs",
                                            "color": "#666666"
                                        }
                                    ] if receiver_account_formatted else []),
                                    "margin": "md",
                                    "spacing": "xs"
                                }
                            ],
                            "margin": "sm",
                            "backgroundColor": "#F8F9FA",
                            "cornerRadius": "8px",
                            "paddingAll": "10px"
                        },
                        
                        # รายละเอียดเพิ่มเติม
                        {
                            "type": "separator",
                            "margin": "lg"
                        },
                        {
                            "type": "box",
                            "layout": "vertical",
                            "contents": [
                                {
                                    "type": "box",
                                    "layout": "horizontal",
                                    "contents": [
                                        {
                                            "type": "text",
                                            "text": "🔢 เลขอ้างอิง:",
                                            "size": "xs",
                                            "color": "#666666",
                                            "flex": 4
                                        },
                                        {
                                            "type": "text",
                                            "text": trans_ref,
                                            "size": "xs",
                                            "color": "#333333",
                                            "flex": 6,
                                            "wrap": True,
                                            "weight": "bold"
                                        }
                                    ]
                                }
                            ],
                            "margin": "md"
                        }
                    ]
                },
                "footer": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {
                            "type": "text",
                            "text": f"ตรวจสอบเมื่อ {verification_time}",
                            "size": "xxs",
                            "color": "#888888",
                            "align": "center"
                        }
                    ],
                    "backgroundColor": "#F8F9FA",
                    "paddingAll": "10px"
                }
            }
        }
        
        # ถ้าเป็นสลิปซ้ำ เพิ่มข้อความเตือนพร้อมจำนวนครั้ง
        if status == "duplicate":
            warning_text = "⚠️ สลิปนี้เคยถูกใช้แล้ว"
            if duplicate_count and duplicate_count > 0:
                warning_text += f" (ใช้ไปแล้ว {duplicate_count} ครั้ง)"
            
            # Insert warning box before footer
            flex_message["contents"]["body"]["contents"].append({
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "text",
                        "text": warning_text,
                        "size": "sm",
                        "color": "#FF6B35",
                        "weight": "bold",
                        "align": "center",
                        "wrap": True
                    },
                    {
                        "type": "text",
                        "text": "กรุณาใช้สลิปใหม่ที่ยังไม่เคยใช้งาน",
                        "size": "xs",
                        "color": "#666666",
                        "align": "center",
                        "margin": "xs"
                    }
                ],
                "backgroundColor": "#FFF3CD",
                "cornerRadius": "8px",
                "paddingAll": "12px",
                "margin": "lg"
            })
        
        # ถ้ามีค่าธรรมเนียม
        if fee and float(fee) > 0:
            fee_box = {
                "type": "box",
                "layout": "horizontal",
                "contents": [
                    {
                        "type": "text",
                        "text": "💰 ค่าธรรมเนียม:",
                        "size": "xs",
                        "color": "#666666",
                        "flex": 4
                    },
                    {
                        "type": "text",
                        "text": format_currency(fee),
                        "size": "xs",
                        "color": "#FF6B35",
                        "flex": 6,
                        "weight": "bold"
                    }
                ],
                "margin": "sm"
            }
            
            # Find the separator index and insert after it
            for i, item in enumerate(flex_message["contents"]["body"]["contents"]):
                if item.get("type") == "separator" and i == len(flex_message["contents"]["body"]["contents"]) - 2:
                    flex_message["contents"]["body"]["contents"].insert(i + 2, fee_box)
                    break
        
        return flex_message
        
    except Exception as e:
        logger.error(f"❌ Error creating beautiful flex message: {e}")
        logger.exception(e)
        return create_simple_text_message(result)

def create_simple_text_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """Fallback to simple text message with full details"""
    status = result.get("status")
    data = result.get("data", {})
    
    if status == "success":
        # Get bank full names
        sender_bank_code = data.get("sender_bank_id", "")
        sender_bank_short = data.get("sender_bank_short", data.get("sender_bank", ""))
        receiver_bank_code = data.get("receiver_bank_id", "")
        receiver_bank_short = data.get("receiver_bank_short", data.get("receiver_bank", ""))
        
        sender_bank = get_bank_full_name(sender_bank_code, sender_bank_short)
        receiver_bank = get_bank_full_name(receiver_bank_code, receiver_bank_short)
        
        # Format account numbers
        sender_account = format_account_number(data.get("sender_account_number", ""))
        receiver_account = format_account_number(data.get("receiver_account_number", ""))
        
        amount = format_currency(data.get('amount', 0))
        message = f"""✅ สลิปถูกต้อง ตรวจสอบสำเร็จ
━━━━━━━━━━━━━━━━━━━━
💰 จำนวนเงิน: {amount}
📅 วันที่: {data.get('date', 'N/A')} {data.get('time', '')}
🔢 เลขอ้างอิง: {data.get('transRef', data.get('reference', 'N/A'))}

👤 ผู้โอน: {data.get('sender', 'N/A')}
🏦 {sender_bank}
{f'📱 บัญชี: {sender_account}' if sender_account else ''}

🎯 ผู้รับ: {data.get('receiver_name', 'N/A')}
🏦 {receiver_bank}
{f'📱 บัญชี: {receiver_account}' if receiver_account else ''}
━━━━━━━━━━━━━━━━━━━━
✓ ตรวจสอบโดย Thunder API"""
        
    elif status == "duplicate":
        duplicate_count = data.get("duplicate_count", 0) or data.get("usage_count", 0)
        amount = format_currency(data.get('amount', 0))
        
        duplicate_text = ""
        if duplicate_count and duplicate_count > 0:
            duplicate_text = f"\n📊 ใช้ไปแล้ว: {duplicate_count} ครั้ง"
        
        message = f"""🔄 สลิปนี้เคยถูกใช้แล้ว
━━━━━━━━━━━━━━━━━━━━
💰 จำนวน: {amount}
🔢 เลขอ้างอิง: {data.get('transRef', 'N/A')}{duplicate_text}
━━━━━━━━━━━━━━━━━━━━
⚠️ กรุณาใช้สลิปใหม่ที่ยังไม่เคยใช้งาน"""
        
    else:
        message = f"""❌ ไม่สามารถตรวจสอบสลิปได้

{result.get('message', 'เกิดข้อผิดพลาด')}

💡 กรุณาตรวจสอบ:
- รูปสลิปชัดเจน
- เป็นสลิปจริง
- ลองถ่ายใหม่"""
    
    return {"type": "text", "text": message}

def create_error_flex_message(error_message: str) -> Dict[str, Any]:
    """สร้าง Error Flex Message แบบสวยงาม"""
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
                    {
                        "type": "text",
                        "text": "❌ ไม่สามารถตรวจสอบสลิปได้",
                        "weight": "bold",
                        "size": "md",
                        "color": "#CC0000",
                        "align": "center"
                    }
                ],
                "backgroundColor": "#FFE5E5",
                "paddingAll": "15px"
            },
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "text",
                        "text": error_message,
                        "size": "sm",
                        "color": "#666666",
                        "wrap": True
                    },
                    {
                        "type": "separator",
                        "margin": "lg"
                    },
                    {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {
                                "type": "text",
                                "text": "💡 คำแนะนำ:",
                                "size": "sm",
                                "weight": "bold",
                                "color": "#333333"
                            },
                            {
                                "type": "text",
                                "text": "• ตรวจสอบให้แน่ใจว่าสลิปชัดเจน",
                                "size": "xs",
                                "color": "#666666",
                                "margin": "sm"
                            },
                            {
                                "type": "text",
                                "text": "• ตรวจสอบว่าเป็นสลิปจริง",
                                "size": "xs",
                                "color": "#666666",
                                "margin": "xs"
                            },
                            {
                                "type": "text",
                                "text": "• ลองถ่ายรูปใหม่หากไม่ชัด",
                                "size": "xs",
                                "color": "#666666",
                                "margin": "xs"
                            },
                            {
                                "type": "text",
                                "text": "• ตรวจสอบว่ามี QR Code ในสลิป",
                                "size": "xs",
                                "color": "#666666",
                                "margin": "xs"
                            }
                        ],
                        "backgroundColor": "#FFF9E6",
                        "paddingAll": "12px",
                        "cornerRadius": "8px",
                        "margin": "lg"
                    }
                ]
            }
        }
    }

# Export functions for backward compatibility
__all__ = [
    'create_beautiful_slip_flex_message',
    'create_simple_text_message',
    'create_error_flex_message',
    'get_bank_logo',
    'get_bank_full_name',
    'format_account_number',
    'format_currency'
]
