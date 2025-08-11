# services/slip_formatter_beautiful.py
import logging
from typing import Dict, Any
from datetime import datetime
import pytz

logger = logging.getLogger("slip_formatter")

# Bank logos mapping
BANK_LOGOS = {
    "002": "https://www.hood11.com/uploads/กรุงเทพ.png",  # BBL - Bangkok Bank
    "004": "https://www.hood11.com/uploads/กสิกร.png",  # KBANK - Kasikorn Bank
    "006": "https://www.hood11.com/uploads/กรุงไทย.png",  # KTB - Krung Thai Bank
    "011": "https://www.hood11.com/uploads/ttb.png",  # TMB/TTB
    "014": "https://www.hood11.com/uploads/ไทยพาณิชย์%20SCB.png",  # SCB
    "025": "https://www.hood11.com/uploads/กรุงศรี%202.png",  # BAY - Bank of Ayudhya
    "030": "https://www.hood11.com/uploads/ออมสิน.png",  # GSB
    "034": "https://www.hood11.com/uploads/ธนาคาร%20ธกส.png",  # BAAC
    "065": "https://www.hood11.com/uploads/ธนาคาร%20ธนชาติ.png",  # TBANK
    "066": "https://www.hood11.com/uploads/ธนาคารอิสลาม.png",  # ISBT
    "067": "https://www.hood11.com/uploads/ทิสโก้.png",  # TISCO
    "069": "https://www.hood11.com/uploads/เกียรตินาคิน.png",  # KKP
    "070": "https://www.hood11.com/uploads/ICBC.png",  # ICBC
    "071": "https://www.hood11.com/uploads/ธอส.png",  # GHB
    "073": "https://www.hood11.com/uploads/แลนด์แลนด์เฮ้าท์%20.png",  # LHBANK
    "024": "https://www.hood11.com/uploads/UOB.png",  # UOB
}

def get_bank_logo(bank_code: str = None, bank_name: str = None) -> str:
    """Get bank logo URL from bank code or name"""
    if bank_code and bank_code in BANK_LOGOS:
        return BANK_LOGOS[bank_code]
    
    # Fallback to name matching
    if bank_name:
        bank_name_lower = bank_name.lower()
        if "กสิกร" in bank_name_lower or "kbank" in bank_name_lower:
            return BANK_LOGOS["004"]
        elif "กรุงเทพ" in bank_name_lower or "bbl" in bank_name_lower:
            return BANK_LOGOS["002"]
        elif "กรุงไทย" in bank_name_lower or "ktb" in bank_name_lower:
            return BANK_LOGOS["006"]
        elif "ไทยพาณิชย์" in bank_name_lower or "scb" in bank_name_lower:
            return BANK_LOGOS["014"]
        elif "กรุงศรี" in bank_name_lower or "bay" in bank_name_lower:
            return BANK_LOGOS["025"]
        elif "ttb" in bank_name_lower or "ทหารไทย" in bank_name_lower:
            return BANK_LOGOS["011"]
        elif "ออมสิน" in bank_name_lower or "gsb" in bank_name_lower:
            return BANK_LOGOS["030"]
    
    # Default bank icon
    return "https://www.hood11.com/uploads/logo.webp"

def create_beautiful_slip_flex_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """สร้าง Flex Message แบบสวยงามพร้อมโลโก้ธนาคาร"""
    try:
        status = result.get("status")
        data = result.get("data", {})
        
        if not data:
            return create_error_flex_message(result.get("message", "ไม่สามารถดึงข้อมูลสลิปได้"))
        
        # ดึงข้อมูลจากผลลัพธ์
        amount = data.get("amount", "0")
        try:
            amount_float = float(amount)
            amount_display = f"฿{amount_float:,.0f}"
        except:
            amount_display = f"฿{amount}"
            
        # วันที่และเวลา
        date = data.get("date", data.get("trans_date", ""))
        time_str = data.get("time", data.get("trans_time", ""))
        
        # เวลาไทย
        thai_tz = pytz.timezone('Asia/Bangkok')
        current_time = datetime.now(thai_tz)
        verification_time = current_time.strftime("%d %b %y, %H:%M น.")
        
        # Reference
        trans_ref = data.get("reference", data.get("transRef", "N/A"))
        
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
        
        # ธนาคาร
        sender_bank_code = data.get("sender_bank_id", "")
        sender_bank_name = data.get("sender_bank_short", data.get("sender_bank", ""))
        receiver_bank_code = data.get("receiver_bank_id", "")
        receiver_bank_name = data.get("receiver_bank_short", data.get("receiver_bank", ""))
        
        # Get bank logos
        sender_logo = get_bank_logo(sender_bank_code, sender_bank_name)
        receiver_logo = get_bank_logo(receiver_bank_code, receiver_bank_name)
        
        # ปิดบังเลขอ้างอิงบางส่วน
        if len(trans_ref) > 10:
            masked_ref = f"xxx-x-x{trans_ref[-4:]}-x"
        else:
            masked_ref = trans_ref
        
        # กำหนดสีและข้อความตามสถานะ
        if status == "success":
            header_color = "#FF6B35"
            status_text = "สลิปถูกต้อง"
            status_icon = "✅"
        elif status == "duplicate":
            header_color = "#FFA500"
            status_text = "สลิปซ้ำ"
            status_icon = "🔄"
        else:
            header_color = "#FF4444"
            status_text = "ตรวจสอบไม่ผ่าน"
            status_icon = "❌"
        
        # Flex Message
        flex_message = {
            "type": "flex",
            "altText": f"{status_icon} {status_text} {amount_display}",
            "contents": {
                "type": "bubble",
                "size": "kilo",
                "body": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        # Header with gradient effect
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                # Status icon
                                {
                                    "type": "box",
                                    "layout": "vertical",
                                    "contents": [
                                        {
                                            "type": "text",
                                            "text": status_icon,
                                            "size": "xxl",
                                            "align": "center"
                                        }
                                    ],
                                    "backgroundColor": "#FFFFFF",
                                    "cornerRadius": "50px",
                                    "width": "50px",
                                    "height": "50px",
                                    "justifyContent": "center"
                                },
                                # Status text
                                {
                                    "type": "text",
                                    "text": status_text,
                                    "size": "lg",
                                    "color": "#FFFFFF",
                                    "weight": "bold",
                                    "margin": "lg",
                                    "gravity": "center"
                                },
                                {
                                    "type": "spacer"
                                },
                                # Logo
                                {
                                    "type": "image",
                                    "url": "https://www.hood11.com/uploads/logo.webp",
                                    "size": "60px",
                                    "aspectRatio": "1:1"
                                }
                            ],
                            "paddingAll": "15px",
                            "backgroundColor": header_color,
                            "background": {
                                "type": "linearGradient",
                                "angle": "90deg",
                                "startColor": header_color,
                                "endColor": "#F7931E"
                            }
                        },
                        
                        # Amount section
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
                                    "text": f"{date} {time_str}",
                                    "size": "xs",
                                    "color": "#999999",
                                    "align": "center",
                                    "margin": "xs"
                                }
                            ],
                            "backgroundColor": "#F8F9FA",
                            "cornerRadius": "8px",
                            "paddingAll": "12px",
                            "margin": "md"
                        },
                        
                        # Separator
                        {
                            "type": "separator",
                            "margin": "md"
                        },
                        
                        # Sender section
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                # Bank logo
                                {
                                    "type": "image",
                                    "url": sender_logo,
                                    "size": "40px",
                                    "aspectRatio": "1:1",
                                    "flex": 0
                                },
                                # Sender info
                                {
                                    "type": "box",
                                    "layout": "vertical",
                                    "contents": [
                                        {
                                            "type": "text",
                                            "text": "ผู้โอน",
                                            "size": "xxs",
                                            "color": "#999999"
                                        },
                                        {
                                            "type": "text",
                                            "text": sender_name[:25] + ("..." if len(sender_name) > 25 else ""),
                                            "size": "sm",
                                            "weight": "bold",
                                            "color": "#333333",
                                            "wrap": False
                                        }
                                    ],
                                    "margin": "md",
                                    "spacing": "xs"
                                }
                            ],
                            "margin": "lg"
                        },
                        
                        # Arrow
                        {
                            "type": "text",
                            "text": "⬇",
                            "align": "center",
                            "color": "#CCCCCC",
                            "margin": "sm"
                        },
                        
                        # Receiver section
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                # Bank logo
                                {
                                    "type": "image",
                                    "url": receiver_logo,
                                    "size": "40px",
                                    "aspectRatio": "1:1",
                                    "flex": 0
                                },
                                # Receiver info
                                {
                                    "type": "box",
                                    "layout": "vertical",
                                    "contents": [
                                        {
                                            "type": "text",
                                            "text": "ผู้รับ",
                                            "size": "xxs",
                                            "color": "#999999"
                                        },
                                        {
                                            "type": "text",
                                            "text": receiver_name[:25] + ("..." if len(receiver_name) > 25 else ""),
                                            "size": "sm",
                                            "weight": "bold",
                                            "color": "#333333",
                                            "wrap": False
                                        },
                                        {
                                            "type": "text",
                                            "text": masked_ref,
                                            "size": "xxs",
                                            "color": "#999999"
                                        }
                                    ],
                                    "margin": "md",
                                    "spacing": "xs"
                                }
                            ],
                            "margin": "sm"
                        },
                        
                        # Footer
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "image",
                                    "url": "https://www.hood11.com/uploads/ttb.png",
                                    "size": "50px",
                                    "aspectRatio": "3:1",
                                    "flex": 0
                                },
                                {
                                    "type": "text",
                                    "text": "รับทรัพย์ รับโชค เงินทองมาเต็ม!",
                                    "size": "xxs",
                                    "color": "#999999",
                                    "align": "end",
                                    "gravity": "center"
                                }
                            ],
                            "margin": "lg",
                            "paddingTop": "sm",
                            "borderWidth": "1px",
                            "borderColor": "#EEEEEE"
                        }
                    ],
                    "paddingAll": "lg"
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
    
    if status == "success":
        message = f"""✅ สลิปถูกต้อง

💰 จำนวน: ฿{data.get('amount', 'N/A')}
📅 วันที่: {data.get('date', 'N/A')} {data.get('time', '')}
🔢 เลขอ้างอิง: {data.get('reference', 'N/A')}
👤 ผู้โอน: {data.get('sender', 'N/A')}
🎯 ผู้รับ: {data.get('receiver_name', 'N/A')}

✓ ตรวจสอบโดย Thunder API"""
    elif status == "duplicate":
        message = f"""🔄 สลิปนี้เคยถูกใช้แล้ว

💰 จำนวน: ฿{data.get('amount', 'N/A')}
🔢 เลขอ้างอิง: {data.get('reference', 'N/A')}

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
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    # Error header
                    {
                        "type": "box",
                        "layout": "horizontal",
                        "contents": [
                            {
                                "type": "text",
                                "text": "❌",
                                "size": "xl"
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
                        "paddingAll": "md",
                        "cornerRadius": "8px"
                    },
                    
                    # Error message
                    {
                        "type": "text",
                        "text": error_message,
                        "size": "sm",
                        "color": "#666666",
                        "wrap": True,
                        "margin": "lg"
                    },
                    
                    # Suggestions
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
                                "margin": "xs"
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
                            }
                        ],
                        "backgroundColor": "#FFF9E6",
                        "paddingAll": "md",
                        "cornerRadius": "8px",
                        "margin": "lg"
                    }
                ]
            }
        }
    }
