# services/slip_formatter_compact.py
"""
Compact Slip Formatter - แบบกระชับสวยงามตามตัวอย่าง
แสดงเลขบัญชีเต็ม พร้อมโลโก้ธนาคารและการจัดวางที่สวยงาม
"""

import logging
from typing import Dict, Any
from datetime import datetime
import pytz

logger = logging.getLogger("slip_formatter_compact")

# Bank logos mapping (จาก hood11.com)
BANK_LOGOS = {
    "002": "https://www.hood11.com/uploads/khungefl.png",  # BBL
    "004": "https://www.hood11.com/uploads/kikh.png",  # KBANK
    "006": "https://www.hood11.com/uploads/khungaifs.png",  # KTB
    "011": "https://www.hood11.com/uploads/ttb.png",  # TTB
    "014": "https://www.hood11.com/uploads/aifslanichsscb.png",  # SCB
    "025": "https://www.hood11.com/uploads/khunghhi2.png",  # BAY
    "030": "https://www.hood11.com/uploads/sif.png",  # GSB
    "034": "https://www.hood11.com/uploads/phfakhahphk.png",  # BAAC
    "069": "https://www.hood11.com/uploads/ekishpifakhif.png",  # KKP
    "071": "https://www.hood11.com/uploads/uob.png", # UOB
    "076": "https://www.hood11.com/uploads/fiok.png", # TISCO
    "080": "https://www.hood11.com/uploads/ph.png", # GHB
}

# ชื่อธนาคารภาษาไทยแบบย่อ (สำหรับแสดงผล)
BANK_SHORT_NAMES = {
    "002": "กรุงเทพ",
    "004": "กสิกรไทย",
    "006": "กรุงไทย",
    "011": "ทหารไทยธนชาต",
    "014": "ไทยพาณิชย์",
    "025": "กรุงศรี",
    "030": "ออมสิน",
    "034": "ธ.ก.ส.",
    "069": "เกียรตินาคิน",
    "071": "ยูโอบี",
    "076": "ทิสโก้",
    "080": "ธอส."
}

def get_bank_logo(bank_code: str = None, bank_name: str = None) -> str:
    """Get bank logo URL"""
    if bank_code and bank_code in BANK_LOGOS:
        return BANK_LOGOS[bank_code]
    
    # Default logo ถ้าไม่พบ
    return "https://www.hood11.com/uploads/logo.webp"

def get_bank_name(bank_code: str = None, bank_short: str = None) -> str:
    """Get bank display name"""
    if bank_code and bank_code in BANK_SHORT_NAMES:
        return BANK_SHORT_NAMES[bank_code]
    
    # Fallback to short name
    if bank_short:
        return bank_short
    
    return "ธนาคาร"

def format_account_number(account: str) -> str:
    """Format account number for display"""
    if not account:
        return ""
    
    # Remove existing formatting
    account_clean = account.replace("-", "").replace(" ", "")
    
    # Format as XXX-X-XXXXX-X for 10 digits
    if len(account_clean) == 10 and account_clean.isdigit():
        return f"XXX-X-XX{account_clean[-4:-1]}-{account_clean[-1]}"
    
    # Show last 4 digits for other formats
    if len(account_clean) >= 4:
        return f"XXX-X-XX{account_clean[-4:]}"
    
    return account

def format_currency(amount: Any) -> str:
    """Format amount as currency"""
    try:
        if isinstance(amount, str):
            amount = float(amount.replace(",", ""))
        else:
            amount = float(amount)
        
        # Format without decimals if whole number
        if amount == int(amount):
            return f"฿{int(amount):,}"
        else:
            return f"฿{amount:,.2f}"
    except:
        return f"฿{amount}"

def create_beautiful_slip_flex_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """สร้าง Flex Message แบบกระชับและสวยงามตามตัวอย่าง"""
    try:
        status = result.get("status")
        data = result.get("data", {})
        
        if not data:
            return create_error_flex_message(result.get("message", "ไม่สามารถดึงข้อมูลสลิปได้"))
        
        # ดึงข้อมูลหลัก
        amount = data.get("amount", "0")
        amount_display = format_currency(amount)
        
        # วันที่และเวลา
        date = data.get("date", data.get("trans_date", ""))
        time_str = data.get("time", data.get("trans_time", ""))
        
        # Format datetime แบบไทย
        thai_tz = pytz.timezone('Asia/Bangkok')
        current_time = datetime.now(thai_tz)
        
        # Reference
        trans_ref = data.get("transRef", data.get("reference", ""))
        
        # ข้อมูลผู้โอนและผู้รับ
        sender_name = (
            data.get("sender_name_th") or 
            data.get("sender_name_en") or 
            data.get("sender", "")
        )[:25]  # จำกัดความยาว
        
        receiver_name = (
            data.get("receiver_name_th") or 
            data.get("receiver_name_en") or 
            data.get("receiver_name", data.get("receiver", ""))
        )[:25]  # จำกัดความยาว
        
        # เลขบัญชี
        sender_account = data.get("sender_account_number", "")
        receiver_account = data.get("receiver_account_number", "")
        
        # ธนาคาร
        sender_bank_code = data.get("sender_bank_id", "")
        sender_bank_short = data.get("sender_bank_short", data.get("sender_bank", ""))
        receiver_bank_code = data.get("receiver_bank_id", "")
        receiver_bank_short = data.get("receiver_bank_short", data.get("receiver_bank", ""))
        
        # Get bank names and logos
        sender_bank_name = get_bank_name(sender_bank_code, sender_bank_short)
        receiver_bank_name = get_bank_name(receiver_bank_code, receiver_bank_short)
        sender_logo = get_bank_logo(sender_bank_code, sender_bank_short)
        receiver_logo = get_bank_logo(receiver_bank_code, receiver_bank_short)
        
        # กำหนดสีและสถานะ
        if status == "success":
            status_color = "#00B900"
            status_text = "สลิปถูกต้อง"
            status_icon = "✅"
            header_bg = "#E8F5E9"
            verified_by = "Thunder API"
        elif status == "duplicate":
            status_color = "#FF9800"
            status_text = "สลิปนี้เคยถูกใช้แล้ว"
            status_icon = "⚠️"
            header_bg = "#FFF3E0"
            verified_by = "Thunder API"
        else:
            return create_error_flex_message(result.get("message", "ตรวจสอบไม่ผ่าน"))
        
        # Flex Message Structure (แบบกระชับ)
        flex_message = {
            "type": "flex",
            "altText": f"{status_icon} {status_text} {amount_display}",
            "contents": {
                "type": "bubble",
                "size": "kilo",
                "header": {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                        {
                            "type": "text",
                            "text": status_icon,
                            "size": "xl",
                            "flex": 0
                        },
                        {
                            "type": "text",
                            "text": status_text,
                            "size": "md",
                            "weight": "bold",
                            "color": status_color,
                            "margin": "sm",
                            "gravity": "center",
                            "flex": 1
                        }
                    ],
                    "backgroundColor": header_bg,
                    "paddingAll": "15px"
                },
                "body": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        # Footer text at top
                        {
                            "type": "text",
                            "text": f"ตรวจสอบโดย {verified_by}",
                            "size": "xxs",
                            "color": "#AAAAAA",
                            "align": "center"
                        },
                        
                        # Amount box
                        {
                            "type": "box",
                            "layout": "vertical",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": amount_display,
                                    "size": "xxl",
                                    "weight": "bold",
                                    "color": "#1A1A1A",
                                    "align": "center"
                                },
                                {
                                    "type": "text",
                                    "text": f"{date} เวลา {time_str}",
                                    "size": "xs",
                                    "color": "#666666",
                                    "align": "center",
                                    "margin": "xs"
                                }
                            ],
                            "backgroundColor": "#F5F5F5",
                            "cornerRadius": "8px",
                            "paddingAll": "12px",
                            "margin": "md"
                        },
                        
                        # Sender section
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "box",
                                    "layout": "vertical",
                                    "contents": [
                                        {
                                            "type": "image",
                                            "url": sender_logo,
                                            "size": "40px",
                                            "aspectRatio": "1:1"
                                        }
                                    ],
                                    "width": "40px",
                                    "height": "40px"
                                },
                                {
                                    "type": "box",
                                    "layout": "vertical",
                                    "contents": [
                                        {
                                            "type": "text",
                                            "text": "ผู้โอน",
                                            "size": "xxs",
                                            "color": "#666666"
                                        },
                                        {
                                            "type": "text",
                                            "text": f"{sender_name} {sender_bank_name[0] if sender_bank_name else ''}",
                                            "size": "sm",
                                            "weight": "bold",
                                            "color": "#1A1A1A",
                                            "wrap": False
                                        },
                                        {
                                            "type": "text",
                                            "text": sender_bank_name,
                                            "size": "xxs",
                                            "color": "#666666"
                                        }
                                    ] + ([
                                        {
                                            "type": "text",
                                            "text": format_account_number(sender_account),
                                            "size": "xxs",
                                            "color": "#999999"
                                        }
                                    ] if sender_account else []),
                                    "margin": "md"
                                }
                            ],
                            "margin": "lg"
                        },
                        
                        # Arrow
                        {
                            "type": "text",
                            "text": "↓",
                            "align": "center",
                            "color": "#CCCCCC",
                            "size": "md",
                            "margin": "sm"
                        },
                        
                        # Receiver section
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "box",
                                    "layout": "vertical",
                                    "contents": [
                                        {
                                            "type": "image",
                                            "url": receiver_logo,
                                            "size": "40px",
                                            "aspectRatio": "1:1"
                                        }
                                    ],
                                    "width": "40px",
                                    "height": "40px"
                                },
                                {
                                    "type": "box",
                                    "layout": "vertical",
                                    "contents": [
                                        {
                                            "type": "text",
                                            "text": "ผู้รับ",
                                            "size": "xxs",
                                            "color": "#666666"
                                        },
                                        {
                                            "type": "text",
                                            "text": f"{receiver_name} {receiver_bank_name[0] if receiver_bank_name else ''}",
                                            "size": "sm",
                                            "weight": "bold",
                                            "color": "#1A1A1A",
                                            "wrap": False
                                        },
                                        {
                                            "type": "text",
                                            "text": receiver_bank_name,
                                            "size": "xxs",
                                            "color": "#666666"
                                        }
                                    ] + ([
                                        {
                                            "type": "text",
                                            "text": format_account_number(receiver_account),
                                            "size": "xxs",
                                            "color": "#999999"
                                        }
                                    ] if receiver_account else []),
                                    "margin": "md"
                                }
                            ],
                            "margin": "sm"
                        },
                        
                        # Reference
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": "เลขอ้างอิง:",
                                    "size": "xxs",
                                    "color": "#666666",
                                    "flex": 0
                                },
                                {
                                    "type": "text",
                                    "text": trans_ref,
                                    "size": "xxs",
                                    "color": "#1A1A1A",
                                    "weight": "bold",
                                    "margin": "sm",
                                    "wrap": True
                                }
                            ],
                            "margin": "lg"
                        }
                    ],
                    "paddingAll": "15px"
                },
                "footer": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {
                            "type": "text",
                            "text": f"ตรวจสอบเมื่อ {current_time.strftime('%d/%m/%Y %H:%M')} น.",
                            "size": "xxs",
                            "color": "#AAAAAA",
                            "align": "center"
                        }
                    ],
                    "backgroundColor": "#FAFAFA",
                    "paddingAll": "8px"
                }
            }
        }
        
        # ถ้าเป็นสลิปซ้ำ เพิ่ม warning box
        if status == "duplicate":
            duplicate_count = data.get("duplicate_count", 0) or data.get("usage_count", 0)
            warning_text = "สลิปนี้เคยถูกใช้แล้ว"
            if duplicate_count > 0:
                warning_text += f" ({duplicate_count} ครั้ง)"
            
            # Insert warning before reference
            warning_box = {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "text",
                        "text": f"⚠️ {warning_text}",
                        "size": "xs",
                        "color": "#FF6B35",
                        "weight": "bold",
                        "align": "center"
                    },
                    {
                        "type": "text",
                        "text": "กรุณาใช้สลิปใหม่ที่ยังไม่เคยใช้งาน",
                        "size": "xxs",
                        "color": "#999999",
                        "align": "center",
                        "margin": "xs"
                    }
                ],
                "backgroundColor": "#FFF3E0",
                "cornerRadius": "6px",
                "paddingAll": "8px",
                "margin": "lg"
            }
            
            # Insert before reference
            body_contents = flex_message["contents"]["body"]["contents"]
            body_contents.insert(-1, warning_box)
        
        return flex_message
        
    except Exception as e:
        logger.error(f"❌ Error creating flex message: {e}")
        logger.exception(e)
        return create_simple_text_message(result)

def create_simple_text_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """Fallback text message"""
    status = result.get("status")
    data = result.get("data", {})
    
    if status == "success":
        amount = format_currency(data.get('amount', 0))
        
        # Get bank names
        sender_bank = get_bank_name(
            data.get("sender_bank_id"), 
            data.get("sender_bank_short", data.get("sender_bank"))
        )
        receiver_bank = get_bank_name(
            data.get("receiver_bank_id"),
            data.get("receiver_bank_short", data.get("receiver_bank"))
        )
        
        # Get account numbers (partially hidden)
        sender_account = format_account_number(data.get("sender_account_number", ""))
        receiver_account = format_account_number(data.get("receiver_account_number", ""))
        
        message = f"""✅ สลิปถูกต้อง
━━━━━━━━━━━━━━━
💰 {amount}
📅 {data.get('date', '')} {data.get('time', '')}

ผู้โอน: {data.get('sender', 'N/A')}
ธนาคาร{sender_bank}
{f'บัญชี {sender_account}' if sender_account else ''}

ผู้รับ: {data.get('receiver_name', 'N/A')}
ธนาคาร{receiver_bank}
{f'บัญชี {receiver_account}' if receiver_account else ''}

เลขอ้างอิง: {data.get('transRef', data.get('reference', ''))}
━━━━━━━━━━━━━━━
ตรวจสอบโดย Thunder API"""
        
    elif status == "duplicate":
        duplicate_count = data.get("duplicate_count", 0)
        amount = format_currency(data.get('amount', 0))
        
        message = f"""⚠️ สลิปนี้เคยถูกใช้แล้ว{f' ({duplicate_count} ครั้ง)' if duplicate_count > 0 else ''}
━━━━━━━━━━━━━━━
💰 {amount}
🔢 {data.get('transRef', 'N/A')}
━━━━━━━━━━━━━━━
กรุณาใช้สลิปใหม่"""
        
    else:
        message = f"""❌ ไม่สามารถตรวจสอบสลิปได้

{result.get('message', 'เกิดข้อผิดพลาด')}

💡 กรุณาตรวจสอบ:
- รูปสลิปชัดเจน
- เป็นสลิปจริง
- ลองถ่ายใหม่"""
    
    return {"type": "text", "text": message}

def create_error_flex_message(error_message: str) -> Dict[str, Any]:
    """Error Flex Message"""
    return {
        "type": "flex",
        "altText": "❌ ไม่สามารถตรวจสอบสลิปได้",
        "contents": {
            "type": "bubble",
            "size": "kilo",
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "text",
                        "text": "❌ ไม่สามารถตรวจสอบสลิปได้",
                        "weight": "bold",
                        "size": "md",
                        "color": "#CC0000",
                        "align": "center"
                    },
                    {
                        "type": "text",
                        "text": error_message,
                        "size": "sm",
                        "color": "#666666",
                        "wrap": True,
                        "margin": "lg",
                        "align": "center"
                    },
                    {
                        "type": "separator",
                        "margin": "lg"
                    },
                    {
                        "type": "text",
                        "text": "💡 กรุณาตรวจสอบ:",
                        "size": "sm",
                        "weight": "bold",
                        "color": "#333333",
                        "margin": "lg"
                    },
                    {
                        "type": "text",
                        "text": "• รูปสลิปชัดเจน\n• เป็นสลิปจริง\n• มี QR Code ในสลิป\n• ลองถ่ายใหม่",
                        "size": "xs",
                        "color": "#666666",
                        "margin": "sm",
                        "wrap": True
                    }
                ],
                "paddingAll": "20px"
            }
        }
    }

# Export functions
__all__ = [
    'create_beautiful_slip_flex_message',
    'create_simple_text_message',
    'create_error_flex_message'
]
