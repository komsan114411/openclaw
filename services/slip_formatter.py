import logging
from typing import Dict, Any
from datetime import datetime
import pytz

logger = logging.getLogger("slip_formatter")

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
    "071": "https://www.hood11.com/uploads/uob.png",  # UOB
    "073": "https://www.hood11.com/uploads/phfakhahphfchapi.png",  # ธนชาต (รวมเข้ากับ TTB)
    "076": "https://www.hood11.com/uploads/fiok.png",  # TISCO (ทิสโก้)
    "080": "https://www.hood11.com/uploads/ph.png",  # GHB (ธอส.)
    "081": "https://www.hood11.com/uploads/aelfbaelfbeaf.png",  # LH Bank (แลนด์แอนด์เฮ้าส์)
    "084": "https://www.hood11.com/uploads/phfakhahilas.png",  # Islamic Bank (ธนาคารอิสลาม)
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
        elif "TMB" in bank_name_upper or "TTB" in bank_name or "ทีเอ็มบีธนชาต" in bank_name:
            return BANK_LOGOS["011"]
        elif "UOB" in bank_name_upper or "ยูโอบี" in bank_name:
            return BANK_LOGOS["071"]
        elif "GHB" in bank_name_upper or "ธอส" in bank_name:
            return BANK_LOGOS["080"]
        elif "TISCO" in bank_name_upper or "ทิสโก้" in bank_name:
            return BANK_LOGOS["076"]
        elif "BAAC" in bank_name_upper or "ธกส" in bank_name:
            return BANK_LOGOS["034"]
        elif "KKP" in bank_name_upper or "เกียรตินาคิน" in bank_name:
            return BANK_LOGOS["069"]
        elif "LAND AND HOUSES" in bank_name_upper or "แลนด์แอนด์เฮ้าส์" in bank_name:
            return BANK_LOGOS["081"]
        elif "ISLAMIC" in bank_name_upper or "อิสลาม" in bank_name:
            return BANK_LOGOS["084"]
    
    # Default logo
    return "https://www.hood11.com/uploads/logo.webp"

def format_currency(amount: Any) -> str:
    """Format amount as Thai currency"""
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

def mask_account(account: str) -> str:
    """Mask account number for privacy"""
    if not account or len(account) < 7:
        return account
    return f"xxx-x-xx{account[-4:]}-x"

def create_beautiful_slip_flex_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """สร้าง Flex Message แบบสวยงามพร้อมโลโก้ธนาคารและข้อมูลเลขบัญชี"""
    try:
        status = result.get("status")
        data = result.get("data", {})
        
        if not data:
            return create_error_flex_message(result.get("message", "ไม่สามารถดึงข้อมูลสลิปได้"))
        
        amount = data.get("amount", "0")
        amount_display = format_currency(amount)
        
        date = data.get("date", data.get("trans_date", ""))
        time_str = data.get("time", data.get("trans_time", ""))
        
        thai_tz = pytz.timezone('Asia/Bangkok')
        current_time = datetime.now(thai_tz)
        verification_time = current_time.strftime("%d/%m/%Y %H:%M น.")
        
        trans_ref = data.get("transRef", data.get("reference", "N/A"))
        
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
        
        sender_account = data.get("sender_account_number", "")
        receiver_account = data.get("receiver_account_number", "")
        
        sender_bank_code = data.get("sender_bank_id", "")
        sender_bank_name = data.get("sender_bank_short", data.get("sender_bank", ""))
        receiver_bank_code = data.get("receiver_bank_id", "")
        receiver_bank_name = data.get("receiver_bank_short", data.get("receiver_bank", ""))
        
        sender_logo = get_bank_logo(sender_bank_code, sender_bank_name)
        receiver_logo = get_bank_logo(receiver_bank_code, receiver_bank_name)
        
        fee = data.get("fee", 0)
        
        if status == "success":
            header_color = "#4CAF50"
            status_text = "✅ สลิปถูกต้อง"
        elif status == "duplicate":
            header_color = "#FFC107"
            status_text = "🔄 สลิปซ้ำ"
        else:
            header_color = "#F44336"
            status_text = "❌ ตรวจสอบไม่ผ่าน"
        
        # Flex Message Structure
        flex_message = {
            "type": "flex",
            "altText": f"{status_text} - {amount_display}",
            "contents": {
                "type": "bubble",
                "size": "kilo",
                "body": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {
                            "type": "box",
                            "layout": "vertical",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": status_text,
                                    "color": "#FFFFFF",
                                    "weight": "bold",
                                    "size": "md"
                                }
                            ],
                            "backgroundColor": header_color,
                            "cornerRadius": "md",
                            "paddingAll": "10px",
                            "paddingStart": "15px"
                        },
                        {
                            "type": "box",
                            "layout": "vertical",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": amount_display,
                                    "weight": "bold",
                                    "size": "3xl",
                                    "margin": "sm"
                                },
                                {
                                    "type": "text",
                                    "text": f"วันที่ {date} เวลา {time_str}",
                                    "size": "sm",
                                    "color": "#888888",
                                    "margin": "xs"
                                }
                            ],
                            "paddingAll": "15px"
                        },
                        {
                            "type": "separator",
                            "margin": "md"
                        },
                        # Sender Information
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "image",
                                    "url": sender_logo,
                                    "size": "40px",
                                    "flex": 0
                                },
                                {
                                    "type": "box",
                                    "layout": "vertical",
                                    "contents": [
                                        {
                                            "type": "text",
                                            "text": sender_name,
                                            "size": "sm",
                                            "weight": "bold"
                                        },
                                        {
                                            "type": "text",
                                            "text": f"{sender_bank_name} {mask_account(sender_account) if sender_account else ''}",
                                            "size": "xs",
                                            "color": "#666666"
                                        }
                                    ],
                                    "margin": "md"
                                }
                            ],
                            "spacing": "sm",
                            "margin": "md"
                        },
                        # Receiver Information
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "image",
                                    "url": receiver_logo,
                                    "size": "40px",
                                    "flex": 0
                                },
                                {
                                    "type": "box",
                                    "layout": "vertical",
                                    "contents": [
                                        {
                                            "type": "text",
                                            "text": receiver_name,
                                            "size": "sm",
                                            "weight": "bold"
                                        },
                                        {
                                            "type": "text",
                                            "text": f"{receiver_bank_name} {mask_account(receiver_account) if receiver_account else ''}",
                                            "size": "xs",
                                            "color": "#666666"
                                        }
                                    ],
                                    "margin": "md"
                                }
                            ],
                            "spacing": "sm",
                            "margin": "md"
                        },
                        {
                            "type": "separator",
                            "margin": "md"
                        },
                        # Reference Number
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": "เลขอ้างอิง:",
                                    "size": "xs",
                                    "color": "#888888",
                                    "flex": 0
                                },
                                {
                                    "type": "text",
                                    "text": trans_ref,
                                    "size": "xs",
                                    "align": "end",
                                    "color": "#333333",
                                    "weight": "bold"
                                }
                            ],
                            "margin": "md"
                        }
                    ],
                    "spacing": "sm",
                    "paddingAll": "10px"
                },
                "footer": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {
                            "type": "text",
                            "text": f"ตรวจสอบเมื่อ {verification_time}",
                            "size": "xxs",
                            "color": "#AAAAAA",
                            "align": "center"
                        }
                    ],
                    "paddingTop": "10px"
                }
            }
        }
        
        return flex_message
        
    except Exception as e:
        logger.error(f"❌ Error creating beautiful flex message: {e}")
        logger.exception(e)
        return create_simple_text_message(result)

def create_simple_text_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """Fallback to simple text message"""
    status = result.get("status")
    data = result.get("data", {})
    
    thai_tz = pytz.timezone('Asia/Bangkok')
    current_time = datetime.now(thai_tz)
    verification_time = current_time.strftime("%d/%m/%Y %H:%M น.")
    
    if status == "success":
        amount = format_currency(data.get('amount', 0))
        message = f"""✅ สลิปถูกต้อง ตรวจสอบสำเร็จ
━━━━━━━━━━━━━━━━━━━━
💰 จำนวนเงิน: {amount}
📅 วันที่: {data.get('date', 'N/A')} {data.get('time', '')}
🔢 เลขอ้างอิง: {data.get('transRef', data.get('reference', 'N/A'))}

👤 ผู้โอน: {data.get('sender', 'N/A')}
🏦 ธนาคาร: {data.get('sender_bank', '')}
เลขบัญชี: {data.get('sender_account_number', 'N/A')}

🎯 ผู้รับ: {data.get('receiver_name', 'N/A')}
🏦 ธนาคาร: {data.get('receiver_bank', '')}
เลขบัญชี: {data.get('receiver_account_number', 'N/A')}
━━━━━━━━━━━━━━━━━━━━
✓ ตรวจสอบโดย Thunder API"""
    elif status == "duplicate":
        amount = format_currency(data.get('amount', 0))
        message = f"""🔄 สลิปนี้เคยถูกใช้แล้ว
━━━━━━━━━━━━━━━━━━━━
💰 จำนวน: {amount}
🔢 เลขอ้างอิง: {data.get('transRef', 'N/A')}
━━━━━━━━━━━━━━━━━━━━
⚠️ กรุณาใช้สลิปใหม่"""
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
                        "text": "❌",
                        "size": "xl",
                        "flex": 0
                    },
                    {
                        "type": "text",
                        "text": "ไม่สามารถตรวจสอบสลิปได้",
                        "weight": "bold",
                        "size": "md",
                        "color": "#CC0000",
                        "margin": "md",
                        "gravity": "center"
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
