import logging
from typing import Dict, Any
from datetime import datetime
import pytz

logger = logging.getLogger("slip_formatter")

# Bank logos mapping - อัปเดตด้วยโลโก้ที่สวยงามขึ้น
BANK_LOGOS = {
    "002": "https://cdn-icons-png.flaticon.com/128/825/825454.png",  # BBL (กรุงเทพ)
    "004": "https://cdn-icons-png.flaticon.com/128/825/825500.png",  # KBANK (กสิกร)
    "006": "https://cdn-icons-png.flaticon.com/128/825/825499.png",  # KTB (กรุงไทย)
    "011": "https://cdn-icons-png.flaticon.com/128/825/825498.png",  # TMB/TTB
    "014": "https://cdn-icons-png.flaticon.com/128/825/825497.png",  # SCB (ไทยพาณิชย์)
    "025": "https://cdn-icons-png.flaticon.com/128/825/825496.png",  # BAY (กรุงศรี)
    "030": "https://cdn-icons-png.flaticon.com/128/825/825495.png",  # GSB (ออมสิน)
    "034": "https://cdn-icons-png.flaticon.com/128/825/825494.png",  # BAAC (ธกส.)
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
        elif "TMB" in bank_name_upper or "TTB" in bank_name:
            return BANK_LOGOS["011"]
    
    # Default bank icon
    return "https://cdn-icons-png.flaticon.com/128/2830/2830284.png"

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

def format_account_number(account: str) -> str:
    """Format account number to show first 3 and last 4 digits"""
    if not account or len(account) < 7:
        return account
    
    # แสดงเลข 3 ตัวแรกและ 4 ตัวท้าย
    if len(account) <= 10:
        return f"{account[:3]}-xxx-{account[-4:]}"
    else:
        return f"{account[:3]}-xxxx-{account[-4:]}"

def create_beautiful_slip_flex_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """สร้าง Flex Message แบบสวยงามสำหรับสลิปการโอนเงิน"""
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
        
        # เลขบัญชี - ปรับปรุงการแสดงผล
        sender_account = format_account_number(data.get("sender_account_number", ""))
        receiver_account = format_account_number(data.get("receiver_account_number", ""))
        
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
            header_color = "#00C851"
            status_text = "✅ สลิปถูกต้อง"
            status_icon = "🟢"
            header_bg = "#E8F5E8"
            border_color = "#00C851"
        elif status == "duplicate":
            header_color = "#FF8800"
            status_text = "🔄 สลิปซ้ำ"
            status_icon = "🟡"
            header_bg = "#FFF3E0"
            border_color = "#FF8800"
        else:
            header_color = "#FF4444"
            status_text = "❌ ตรวจสอบไม่ผ่าน"
            status_icon = "🔴"
            header_bg = "#FFEBEE"
            border_color = "#FF4444"
        
        # Flex Message ที่ปรับปรุงแล้ว
        flex_message = {
            "type": "flex",
            "altText": f"{status_text} {amount_display}",
            "contents": {
                "type": "bubble",
                "size": "kilo",
                "styles": {
                    "body": {
                        "separator": True,
                        "separatorColor": "#E0E0E0"
                    }
                },
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
                                    "text": status_icon,
                                    "size": "xxl",
                                    "flex": 0
                                },
                                {
                                    "type": "box",
                                    "layout": "vertical",
                                    "contents": [
                                        {
                                            "type": "text",
                                            "text": status_text,
                                            "size": "lg",
                                            "weight": "bold",
                                            "color": header_color
                                        },
                                        {
                                            "type": "text",
                                            "text": "ผลการตรวจสอบสลิปการโอนเงิน",
                                            "size": "xs",
                                            "color": "#888888",
                                            "margin": "xs"
                                        }
                                    ],
                                    "margin": "md"
                                }
                            ]
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
                        # จำนวนเงินใหญ่
                        {
                            "type": "box",
                            "layout": "vertical",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": amount_display,
                                    "size": "4xl",
                                    "weight": "bold",
                                    "color": "#333333",
                                    "align": "center"
                                },
                                {
                                    "type": "text",
                                    "text": f"📅 {date} ⏰ {time_str}",
                                    "size": "sm",
                                    "color": "#666666",
                                    "align": "center",
                                    "margin": "sm"
                                }
                            ],
                            "backgroundColor": "#F8F9FA",
                            "cornerRadius": "12px",
                            "paddingAll": "20px",
                            "margin": "lg"
                        },
                        
                        # เลขอ้างอิง
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": "🔢 เลขอ้างอิง",
                                    "size": "sm",
                                    "color": "#666666",
                                    "flex": 3
                                },
                                {
                                    "type": "text",
                                    "text": trans_ref,
                                    "size": "sm",
                                    "color": "#333333",
                                    "flex": 7,
                                    "wrap": True,
                                    "weight": "bold"
                                }
                            ],
                            "margin": "lg",
                            "spacing": "sm"
                        },
                        
                        # ผู้โอน
                        {
                            "type": "box",
                            "layout": "vertical",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": "👤 ผู้โอนเงิน",
                                    "size": "md",
                                    "weight": "bold",
                                    "color": "#333333",
                                    "margin": "lg"
                                },
                                {
                                    "type": "box",
                                    "layout": "horizontal",
                                    "contents": [
                                        {
                                            "type": "image",
                                            "url": sender_logo,
                                            "size": "48px",
                                            "aspectRatio": "1:1",
                                            "flex": 0,
                                            "backgroundColor": "#F0F0F0",
                                            "cornerRadius": "24px"
                                        },
                                        {
                                            "type": "box",
                                            "layout": "vertical",
                                            "contents": [
                                                {
                                                    "type": "text",
                                                    "text": sender_name[:30],
                                                    "size": "md",
                                                    "weight": "bold",
                                                    "color": "#333333",
                                                    "wrap": True
                                                },
                                                {
                                                    "type": "text",
                                                    "text": f"🏦 {sender_bank_name}",
                                                    "size": "sm",
                                                    "color": "#666666",
                                                    "margin": "xs"
                                                },
                                                {
                                                    "type": "text",
                                                    "text": f"💳 {sender_account}" if sender_account else "",
                                                    "size": "xs",
                                                    "color": "#888888",
                                                    "margin": "xs"
                                                } if sender_account else None
                                            ],
                                            "margin": "md",
                                            "spacing": "xs"
                                        }
                                    ],
                                    "margin": "sm",
                                    "spacing": "md"
                                }
                            ]
                        },
                        
                        # ลูกศรลง
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": "⬇️",
                                    "align": "center",
                                    "size": "xl",
                                    "color": "#00C851"
                                }
                            ],
                            "margin": "md"
                        },
                        
                        # ผู้รับ
                        {
                            "type": "box",
                            "layout": "vertical",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": "🎯 ผู้รับเงิน",
                                    "size": "md",
                                    "weight": "bold",
                                    "color": "#333333"
                                },
                                {
                                    "type": "box",
                                    "layout": "horizontal",
                                    "contents": [
                                        {
                                            "type": "image",
                                            "url": receiver_logo,
                                            "size": "48px",
                                            "aspectRatio": "1:1",
                                            "flex": 0,
                                            "backgroundColor": "#F0F0F0",
                                            "cornerRadius": "24px"
                                        },
                                        {
                                            "type": "box",
                                            "layout": "vertical",
                                            "contents": [
                                                {
                                                    "type": "text",
                                                    "text": receiver_name[:30],
                                                    "size": "md",
                                                    "weight": "bold",
                                                    "color": "#333333",
                                                    "wrap": True
                                                },
                                                {
                                                    "type": "text",
                                                    "text": f"🏦 {receiver_bank_name}",
                                                    "size": "sm",
                                                    "color": "#666666",
                                                    "margin": "xs"
                                                },
                                                {
                                                    "type": "text",
                                                    "text": f"💳 {receiver_account}" if receiver_account else "",
                                                    "size": "xs",
                                                    "color": "#888888",
                                                    "margin": "xs"
                                                } if receiver_account else None
                                            ],
                                            "margin": "md",
                                            "spacing": "xs"
                                        }
                                    ],
                                    "margin": "sm",
                                    "spacing": "md"
                                }
                            ]
                        }
                    ]
                },
                "footer": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {
                            "type": "separator",
                            "margin": "lg"
                        },
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": "🔍 ตรวจสอบโดย Thunder API",
                                    "size": "xs",
                                    "color": "#666666",
                                    "flex": 1
                                },
                                {
                                    "type": "text",
                                    "text": verification_time,
                                    "size": "xs",
                                    "color": "#888888",
                                    "align": "end"
                                }
                            ],
                            "margin": "md"
                        }
                    ],
                    "backgroundColor": "#FAFAFA",
                    "paddingAll": "12px"
                }
            }
        }
        
        # เพิ่มข้อความเตือนสำหรับสลิปซ้ำ
        if status == "duplicate":
            # เพิ่มกล่องเตือนในส่วน body
            warning_box = {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "text",
                        "text": "⚠️ คำเตือน",
                        "size": "sm",
                        "weight": "bold",
                        "color": "#FF8800"
                    },
                    {
                        "type": "text",
                        "text": "สลิปนี้เคยถูกใช้งานแล้ว กรุณาตรวจสอบให้แน่ใจก่อนดำเนินการ",
                        "size": "xs",
                        "color": "#666666",
                        "wrap": True,
                        "margin": "xs"
                    }
                ],
                "backgroundColor": "#FFF3E0",
                "cornerRadius": "8px",
                "paddingAll": "12px",
                "margin": "lg",
                "borderWidth": "1px",
                "borderColor": "#FFB74D"
            }
            
            flex_message["contents"]["body"]["contents"].append(warning_box)
        
        # เพิ่มค่าธรรมเนียม (ถ้ามี)
        if fee and float(fee) > 0:
            fee_box = {
                "type": "box",
                "layout": "horizontal",
                "contents": [
                    {
                        "type": "text",
                        "text": "💸 ค่าธรรมเนียม",
                        "size": "sm",
                        "color": "#666666",
                        "flex": 3
                    },
                    {
                        "type": "text",
                        "text": format_currency(fee),
                        "size": "sm",
                        "color": "#FF6B35",
                        "flex": 7,
                        "weight": "bold"
                    }
                ],
                "margin": "md"
            }
            
            # เพิ่มก่อน footer
            flex_message["contents"]["body"]["contents"].append(fee_box)
        
        # ลบ None values ออกจาก contents
        def clean_none_values(obj):
            if isinstance(obj, dict):
                return {k: clean_none_values(v) for k, v in obj.items() if v is not None}
            elif isinstance(obj, list):
                return [clean_none_values(item) for item in obj if item is not None]
            return obj
        
        flex_message = clean_none_values(flex_message)
        
        return flex_message
        
    except Exception as e:
        logger.error(f"❌ Error creating beautiful flex message: {e}")
        logger.exception(e)
        return create_simple_text_message(result)

def create_simple_text_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """Fallback to simple text message พร้อมเลขบัญชี"""
    status = result.get("status")
    data = result.get("data", {})
    
    if status == "success":
        amount = format_currency(data.get('amount', 0))
        sender_account = format_account_number(data.get('sender_account_number', ''))
        receiver_account = format_account_number(data.get('receiver_account_number', ''))
        
        message = f"""✅ สลิปถูกต้อง ตรวจสอบสำเร็จ
━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 จำนวนเงิน: {amount}
📅 วันที่: {data.get('date', 'N/A')} {data.get('time', '')}
🔢 เลขอ้างอิง: {data.get('transRef', data.get('reference', 'N/A'))}

👤 ผู้โอน: {data.get('sender', 'N/A')}
🏦 ธนาคาร: {data.get('sender_bank', '')}
💳 บัญชี: {sender_account if sender_account else 'ไม่ระบุ'}

🎯 ผู้รับ: {data.get('receiver_name', 'N/A')}
🏦 ธนาคาร: {data.get('receiver_bank', '')}
💳 บัญชี: {receiver_account if receiver_account else 'ไม่ระบุ'}
━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ ตรวจสอบโดย Thunder API"""
    elif status == "duplicate":
        amount = format_currency(data.get('amount', 0))
        message = f"""🔄 สลิปนี้เคยถูกใช้แล้ว
━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 จำนวน: {amount}
🔢 เลขอ้างอิง: {data.get('transRef', 'N/A')}
📅 วันที่: {data.get('date', 'N/A')}
━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ กรุณาใช้สลิปใหม่"""
    else:
        message = f"""❌ ไม่สามารถตรวจสอบสลิปได้

{result.get('message', 'เกิดข้อผิดพลาด')}

💡 คำแนะนำ:
- รูปสลิปชัดเจน
- เป็นสลิปจริง
- มี QR Code ครบถ้วน
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
                                "text": "• ตรวจสอบให้แน่ใจว่าสลิปชัดเจน\n• ตรวจสอบว่าเป็นสลิปจริง\n• ลองถ่ายรูปใหม่หากไม่ชัด\n• ตรวจสอบว่ามี QR Code ในสลิป\n• ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต",
                                "size": "xs",
                                "color": "#666666",
                                "margin": "sm",
                                "wrap": True
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
