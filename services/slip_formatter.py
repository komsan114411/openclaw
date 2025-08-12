# services/slip_formatter.py
import logging
from typing import Dict, Any
from datetime import datetime
import pytz

logger = logging.getLogger("slip_formatter")

# Updated Bank logos mapping with normalized filenames
BANK_LOGOS = {
    "002": "https://www.hood11.com/uploads/khungefl.png",  # BBL (กรุงเทพ)
    "004": "https://www.hood11.com/uploads/kikh.png",  # KBANK (กสิกร)
    "006": "https://www.hood11.com/uploads/khungaifs.png",  # KTB (กรุงไทย)
    "011": "https://www.hood11.com/uploads/ttb.png",  # TMB/TTB
    "014": "https://www.hood11.com/uploads/aifslanichsscb.png",  # SCB (ไทยพาณิชย์ SCB)
    "025": "https://www.hood11.com/uploads/khunghhi2.png",  # BAY (กรุงศรี 2)
    "030": "https://www.hood11.com/uploads/sif.png",  # GSB (ออมสิน)
    "034": "https://www.hood11.com/uploads/phfakhahphk.png",  # BAAC (ธนาคาร ธกส)
    "069": "https://www.hood11.com/uploads/ekishpifakhif.png",  # KKP (เกียรตินาคิน)
    "070": "https://www.hood11.com/uploads/icbc.png",  # ICBC
    "071": "https://www.hood11.com/uploads/ph.png", # GHB (ธอส)
    "073": "https://www.hood11.com/uploads/uob.png", # UOB
    "074": "https://www.hood11.com/uploads/aelfbaelfbeaf.png", # LH Bank (แลนด์แอนด์เฮ้าส์)
    "075": "https://www.hood11.com/uploads/fiok.png", # TISCO
    "098": "https://www.hood11.com/uploads/phfakhahphfchapi.png", # Thanachart (ธนชาติ)
    "099": "https://www.hood11.com/uploads/phfakhahilas.png" # Islamic Bank (ธนาคารอิสลาม)
}

def get_bank_logo(bank_code: str = None, bank_name: str = None) -> str:
    """Get bank logo URL from bank code or name"""
    # Prefer bank code first
    if bank_code and bank_code in BANK_LOGOS:
        return BANK_LOGOS[bank_code]
    
    # Fallback to name matching (more robust)
    if bank_name:
        bank_name_lower = bank_name.lower()
        if "ktb" in bank_name_lower or "กรุงไทย" in bank_name_lower:
            return BANK_LOGOS["006"]
        elif "gsb" in bank_name_lower or "ออมสิน" in bank_name_lower:
            return BANK_LOGOS["030"]
        elif "kbank" in bank_name_lower or "กสิกร" in bank_name_lower:
            return BANK_LOGOS["004"]
        elif "scb" in bank_name_lower or "ไทยพาณิชย์" in bank_name_lower:
            return BANK_LOGOS["014"]
        elif "bbl" in bank_name_lower or "กรุงเทพ" in bank_name_lower:
            return BANK_LOGOS["002"]
        elif "bay" in bank_name_lower or "กรุงศรี" in bank_name_lower:
            return BANK_LOGOS["025"]
        elif "ttb" in bank_name_lower or "ทหารไทยธนชาต" in bank_name_lower:
            return BANK_LOGOS["011"]
        elif "tisco" in bank_name_lower or "ทิสโก้" in bank_name_lower:
            return BANK_LOGOS["075"]
        elif "ghb" in bank_name_lower or "ธอส" in bank_name_lower:
            return BANK_LOGOS["071"]
        elif "kkp" in bank_name_lower or "เกียรตินาคิน" in bank_name_lower:
            return BANK_LOGOS["069"]
        elif "uob" in bank_name_lower:
            return BANK_LOGOS["073"]
        elif "lh bank" in bank_name_lower or "แลนด์" in bank_name_lower:
            return BANK_LOGOS["074"]
        elif "baac" in bank_name_lower or "ธกส" in bank_name_lower:
            return BANK_LOGOS["034"]
        elif "isla" in bank_name_lower or "อิสลาม" in bank_name_lower:
            return BANK_LOGOS["099"]
        elif "icbc" in bank_name_lower:
            return BANK_LOGOS["070"]
        
    # Default logo if no match is found
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
    """สร้าง Flex Message แบบสวยงามพร้อมโลโก้ธนาคาร"""
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
        
        # เลขบัญชี
        sender_account = data.get("sender_account_number", "")
        receiver_account = data.get("receiver_account_number", "")
        
        # ธนาคาร
        sender_bank_code = data.get("sender_bank_id", "")
        sender_bank_name = data.get("sender_bank_short", data.get("sender_bank", ""))
        receiver_bank_code = data.get("receiver_bank_id", "")
        receiver_bank_name = data.get("receiver_bank_short", data.get("receiver_bank", ""))
        
        # Get bank logos
        sender_logo = get_bank_logo(sender_bank_code, sender_bank_name)
        receiver_logo = get_bank_logo(receiver_bank_code, receiver_bank_name)
        
        # Fee (ถ้ามี)
        fee = data.get("fee", 0)
        
        # กำหนดสีและข้อความตามสถานะ
        if status == "success":
            header_color = "#00B900"
            status_text = "สลิปถูกต้อง"
            status_icon = "✅"
            header_bg = "#D4EDDA"
        elif status == "duplicate":
            header_color = "#FFA500"
            status_text = "สลิปซ้ำ"
            status_icon = "🔄"
            header_bg = "#FFF3CD"
        else:
            header_color = "#FF4444"
            status_text = "ตรวจสอบไม่ผ่าน"
            status_icon = "❌"
            header_bg = "#F8D7DA"
        
        # Flex Message
        flex_message = {
            "type": "flex",
            "altText": f"{status_icon} {status_text} {amount_display}",
            "contents": {
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
                                            "size": "lg",
                                            "weight": "bold",
                                            "color": header_color,
                                            "margin": "sm",
                                            "gravity": "center"
                                        }
                                    ]
                                },
                                {
                                    "type": "text",
                                    "text": f"ตรวจสอบโดย Thunder API",
                                    "size": "xxs",
                                    "color": "#888888",
                                    "margin": "xs"
                                }
                            ]
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
                            "text": "ผู้โอน",
                            "size": "sm",
                            "color": "#888888",
                            "margin": "lg"
                        },
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "image",
                                    "url": sender_logo,
                                    "size": "40px",
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
                                            "wrap": False
                                        },
                                        {
                                            "type": "text",
                                            "text": f"{sender_bank_name} {mask_account(sender_account) if sender_account else ''}",
                                            "size": "xs",
                                            "color": "#666666"
                                        }
                                    ],
                                    "margin": "md",
                                    "spacing": "xs"
                                }
                            ],
                            "margin": "sm"
                        },
                        
                        # Arrow
                        {
                            "type": "text",
                            "text": "⬇",
                            "align": "center",
                            "color": "#CCCCCC",
                            "margin": "md"
                        },
                        
                        # ข้อมูลผู้รับ
                        {
                            "type": "text",
                            "text": "ผู้รับ",
                            "size": "sm",
                            "color": "#888888"
                        },
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "image",
                                    "url": receiver_logo,
                                    "size": "40px",
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
                                            "wrap": False
                                        },
                                        {
                                            "type": "text",
                                            "text": f"{receiver_bank_name} {mask_account(receiver_account) if receiver_account else ''}",
                                            "size": "xs",
                                            "color": "#666666"
                                        }
                                    ],
                                    "margin": "md",
                                    "spacing": "xs"
                                }
                            ],
                            "margin": "sm"
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
                                            "text": "เลขอ้างอิง:",
                                            "size": "xs",
                                            "color": "#666666",
                                            "flex": 3
                                        },
                                        {
                                            "type": "text",
                                            "text": trans_ref,
                                            "size": "xs",
                                            "color": "#333333",
                                            "flex": 7,
                                            "wrap": True
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
                    "backgroundColor": "#F8F9FA"
                }
            }
        }
        
        # ถ้าเป็นสลิปซ้ำ เพิ่มข้อความเตือน
        if status == "duplicate":
            flex_message["contents"]["body"]["contents"].append({
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "text",
                        "text": "⚠️ สลิปนี้เคยถูกใช้แล้ว",
                        "size": "sm",
                        "color": "#FF6B35",
                        "weight": "bold",
                        "align": "center"
                    }
                ],
                "backgroundColor": "#FFF3CD",
                "cornerRadius": "8px",
                "paddingAll": "10px",
                "margin": "lg"
            })
        
        # ถ้ามีค่าธรรมเนียม
        if fee and float(fee) > 0:
            flex_message["contents"]["body"]["contents"].insert(-1, {
                "type": "box",
                "layout": "horizontal",
                "contents": [
                    {
                        "type": "text",
                        "text": "ค่าธรรมเนียม:",
                        "size": "xs",
                        "color": "#666666",
                        "flex": 3
                    },
                    {
                        "type": "text",
                        "text": format_currency(fee),
                        "size": "xs",
                        "color": "#FF6B35",
                        "flex": 7
                    }
                ],
                "margin": "sm"
            })
        
        return flex_message
        
    except Exception as e:
        logger.error(f"❌ Error creating beautiful flex message: {e}")
        logger.exception(e)
        return create_simple_text_message(result)

def create_simple_text_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """Fallback to simple text message"""
    status = result.get("status")
    data = result.get("data", {})
    
    if status == "success":
        amount = format_currency(data.get('amount', 0))
        message = f"""✅ สลิปถูกต้อง ตรวจสอบสำเร็จ
━━━━━━━━━━━━━━━━━━━━
💰 จำนวนเงิน: {amount}
📅 วันที่: {data.get('date', 'N/A')} เวลา {data.get('time', '')}
🔢 เลขอ้างอิง: {data.get('transRef', data.get('reference', 'N/A'))}

👤 ผู้โอน: {data.get('sender', 'N/A')}
🏦 ธนาคาร: {data.get('sender_bank', '')}

🎯 ผู้รับ: {data.get('receiver_name', 'N/A')}
🏦 ธนาคาร: {data.get('receiver_bank', '')}
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
    # เวลาปัจจุบัน
    thai_tz = pytz.timezone('Asia/Bangkok')
    current_time = datetime.now(thai_tz)
    verification_time = current_time.strftime("%d/%m/%Y %H:%M น.")

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
                "backgroundColor": "#F8F9FA"
            }
        }
    }
}
