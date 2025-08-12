# services/slip_formatter.py
import logging
from typing import Dict, Any
from datetime import datetime
import pytz

logger = logging.getLogger("slip_formatter")

# Bank logos mapping
BANK_LOGOS = {
    "002": "https://www.hood11.com/uploads/khungefl.png",  # BBL (กรุงเทพ)
    "004": "https://www.hood11.com/uploads/kikh.png",  # KBANK (กสิกร)
    "006": "https://www.hood11.com/uploads/khungaifs.png",  # KTB (กรุงไทย)
    "011": "https://www.hood11.com/uploads/ttb.png",  # TMB/TTB
    "014": "https://www.hood11.com/uploads/aifslanichsscb.png",  # SCB (ไทยพาณิชย์)
    "025": "https://www.hood11.com/uploads/khunghhi2.png",  # BAY (กรุงศรี)
    "030": "https://www.hood11.com/uploads/sif.png",  # GSB (ออมสิน)
    "034": "https://www.hood11.com/uploads/phfakhahphk.png",  # BAAC (ธกส.)
    "069": "https://www.hood11.com/uploads/ekishpifakhif.png",  # KKP (เกียรตินาคิน)
    "070": "https://www.hood11.com/uploads/icbc.png",  # ICBC
    "071": "https://www.hood11.com/uploads/uob.png", # UOB
    "073": "https://www.hood11.com/uploads/phfakhahphfchapi.png", # ธนชาต (รวมเข้ากับ TTB แล้ว แต่ยังเก็บไว้เพื่อความสมบูรณ์)
    "076": "https://www.hood11.com/uploads/fiok.png", # TISCO (ทิสโก้)
    "080": "https://www.hood11.com/uploads/ph.png", # GHB (ธอส.)
    "081": "https://www.hood11.com/uploads/aelfbaelfbeaf.png", # LH Bank (แลนด์แอนด์เฮ้าส์)
    "084": "https://www.hood11.com/uploads/phfakhahilas.png", # Islamic Bank (ธนาคารอิสลาม)
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
            return f"B{int(amount):,.0f}"
        elif isinstance(amount, str):
            amount_float = float(amount.replace(",", ""))
            return f"B{int(amount_float):,.0f}"
        else:
            return f"B{amount}"
    except:
        return f"B{amount}"

def mask_account(account: str) -> str:
    """Mask account number for privacy, showing last 4 digits"""
    if not account or len(account) < 4:
        return account
    return f"xxxx-xx{account[-4:]}"

def create_beautiful_slip_flex_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """สร้าง Flex Message ให้สวยงามเหมือนในรูป"""
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
        
        # Reference (ใช้เป็น N/A ถ้าไม่มี)
        trans_ref = data.get("transRef", data.get("reference", "N/A"))
        
        # ชื่อผู้ส่งและผู้รับ
        sender_name = (data.get("sender_name_th") or data.get("sender", "ไม่ระบุชื่อ"))[:15] + "..."
        receiver_name = (data.get("receiver_name_th") or data.get("receiver_name", "ไม่ระบุชื่อ"))[:15] + "..."
        
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
        
        # กำหนดสีและข้อความตามสถานะ
        if status == "success":
            header_color = "#FF4444"
            status_text = "สลิปถูกต้อง"
            status_icon = "✅"
            header_bg_url = "https://www.hood11.com/uploads/red-bg-image.png"
        elif status == "duplicate":
            header_color = "#FFA500"
            status_text = "สลิปซ้ำ"
            status_icon = "🔄"
            header_bg_url = "https://www.hood11.com/uploads/orange-bg-image.png"
        else:
            header_color = "#CC0000"
            status_text = "ตรวจสอบไม่ผ่าน"
            status_icon = "❌"
            header_bg_url = "https://www.hood11.com/uploads/red-bg-image.png"
        
        # Flex Message
        flex_message = {
            "type": "flex",
            "altText": f"{status_icon} {status_text} {amount_display}",
            "contents": {
                "type": "bubble",
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
                                    "size": "md",
                                    "align": "center"
                                }
                            ],
                            "position": "absolute",
                            "backgroundColor": header_color,
                            "cornerRadius": "20px",
                            "paddingAll": "10px",
                            "top": "20px",
                            "left": "20px",
                            "zIndex": 100
                        },
                        {
                            "type": "image",
                            "url": "https://www.hood11.com/uploads/slip-bg.png",
                            "size": "full",
                            "aspectMode": "cover",
                            "aspectRatio": "1:1.6"
                        },
                        {
                            "type": "box",
                            "layout": "vertical",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": amount_display,
                                    "size": "xl",
                                    "weight": "bold",
                                    "color": "#333333"
                                },
                                {
                                    "type": "text",
                                    "text": f"{date}, {time_str} น.",
                                    "size": "xs",
                                    "color": "#999999",
                                    "margin": "xs"
                                },
                                {
                                    "type": "separator",
                                    "margin": "lg"
                                },
                                {
                                    "type": "box",
                                    "layout": "horizontal",
                                    "contents": [
                                        {
                                            "type": "image",
                                            "url": sender_logo,
                                            "size": "30px",
                                            "aspectRatio": "1:1",
                                            "flex": 0,
                                            "margin": "xs",
                                            "gravity": "center"
                                        },
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
                                                    "text": sender_name,
                                                    "size": "sm",
                                                    "weight": "bold",
                                                    "color": "#333333",
                                                    "margin": "xs"
                                                },
                                                {
                                                    "type": "text",
                                                    "text": mask_account(sender_account) if sender_account else 'ไม่ระบุเลขบัญชี',
                                                    "size": "xs",
                                                    "color": "#666666"
                                                }
                                            ],
                                            "spacing": "xs"
                                        }
                                    ],
                                    "margin": "lg"
                                },
                                # ข้อมูลผู้รับ
                                {
                                    "type": "box",
                                    "layout": "horizontal",
                                    "contents": [
                                        {
                                            "type": "image",
                                            "url": receiver_logo,
                                            "size": "30px",
                                            "aspectRatio": "1:1",
                                            "flex": 0,
                                            "margin": "xs",
                                            "gravity": "center"
                                        },
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
                                                    "text": receiver_name,
                                                    "size": "sm",
                                                    "weight": "bold",
                                                    "color": "#333333",
                                                    "margin": "xs"
                                                },
                                                {
                                                    "type": "text",
                                                    "text": mask_account(receiver_account) if receiver_account else 'ไม่ระบุเลขบัญชี',
                                                    "size": "xs",
                                                    "color": "#666666"
                                                }
                                            ],
                                            "spacing": "xs"
                                        }
                                    ],
                                    "margin": "lg"
                                },
                                # Logo
                                {
                                    "type": "box",
                                    "layout": "horizontal",
                                    "contents": [
                                        {
                                            "type": "image",
                                            "url": "https://www.hood11.com/uploads/thunder-logo.png",
                                            "size": "30px",
                                            "aspectRatio": "1:1"
                                        },
                                        {
                                            "type": "text",
                                            "text": "รับทรัพย์ รับโชค เงินทองทวีคูณ!",
                                            "size": "xxs",
                                            "color": "#666666",
                                            "margin": "xs",
                                            "gravity": "center"
                                        }
                                    ],
                                    "margin": "xl"
                                }
                            ],
                            "position": "absolute",
                            "top": "0px",
                            "left": "0px",
                            "right": "0px",
                            "bottom": "0px",
                            "paddingAll": "20px"
                        }
                    ],
                    "paddingAll": "0px"
                }
            }
        }
        return flex_message
    
    except Exception as e:
        logger.error(f"❌ Error creating beautiful flex message: {e}")
        logger.exception(e)
        return create_simple_text_message(result)

def create_simple_text_message(result: Dict[str, Any]) -> Dict[str, Any]:
    # ... (ฟังก์ชันเดิม, ไม่ได้แก้ไข)
    status = result.get("status")
    data = result.get("data", {})
    
    if status == "success":
        amount = format_currency(data.get('amount', 0))
        message = f"""✅ สลิปถูกต้อง ตรวจสอบสำเร็จ
━━━━━━━━━━━━━━━━━━━━
💰 จำนวนเงิน: {amount}
📅 วันที่: {data.get('date', 'N/A')} {data.get('time', '')}
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
    # ... (ฟังก์ชันเดิม, ไม่ได้แก้ไข)
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
