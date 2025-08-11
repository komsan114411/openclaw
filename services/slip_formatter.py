# services/slip_formatter.py
import logging
from typing import Dict, Any
from datetime import datetime
import pytz

logger = logging.getLogger("slip_formatter")

# เพิ่ม Dictionary สำหรับเก็บ URL โลโก้ธนาคาร
BANK_LOGOS = {
    "ICBC": "https://www.hood11.com/uploads/ICBC.png",
    "UOB": "https://www.hood11.com/uploads/UOB.png",
    "ttb": "https://www.hood11.com/uploads/ttb.png",
    "กรุงศรี": "https://www.hood11.com/uploads/กรุงศรี 2.png",
    "กรุงเทพ": "https://www.hood11.com/uploads/กรุงเทพ.png",
    "กรุงไทย": "https://www.hood11.com/uploads/กรุงไทย.png",
    "กสิกร": "https://www.hood11.com/uploads/กสิกร.png",
    "ทิสโก้": "https://www.hood11.com/uploads/ทิสโก้.png",
    "ธกส": "https://www.hood11.com/uploads/ธนาคาร ธกส.png",
    "ธนชาติ": "https://www.hood11.com/uploads/ธนาคาร ธนชาติ.png",
    "ธนาคารอิสลาม": "https://www.hood11.com/uploads/ธนาคารอิสลาม.png",
    "ธอส": "https://www.hood11.com/uploads/ธอส.png",
    "ออมสิน": "https://www.hood11.com/uploads/ออมสิน.png",
    "เกียรตินาคิน": "https://www.hood11.com/uploads/เกียรตินาคิน.png",
    "แลนด์แลนด์เฮ้าท์": "https://www.hood11.com/uploads/แลนด์แลนด์เฮ้าท์ .png",
    "ไทยพาณิชย์": "https://www.hood11.com/uploads/ไทยพาณิชย์ SCB.png",
    "KTB": "https://www.hood11.com/uploads/กรุงไทย.png", # เพิ่มชื่อย่อธนาคาร
    "SCB": "https://www.hood11.com/uploads/ไทยพาณิชย์ SCB.png" # เพิ่มชื่อย่อธนาคาร
}

def create_slip_flex_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """สร้าง Flex Message สำหรับแสดงผลสลิปตามรูปแบบที่คุณต้องการ"""
    try:
        status = result.get("status")
        data = result.get("data", {})
        
        # Fallback to error message if data is not available
        if not data:
            return create_error_flex_message(result.get("message", "ไม่สามารถดึงข้อมูลสลิปได้"))
        
        amount = data.get("amount", "0")
        try:
            amount_float = float(amount)
            amount_display = f"฿{amount_float:,.2f}"
        except (ValueError, TypeError):
            amount_display = f"฿{amount}"
        
        date = data.get("date", data.get("trans_date", "N/A"))
        time_str = data.get("time", data.get("trans_time", "N/A"))
        trans_ref = data.get("reference", data.get("transRef", "N/A"))
        
        sender_bank = data.get("sender_bank_code", data.get("sender_bank", "ไม่ระบุ"))
        receiver_bank = data.get("receiver_bank_code", data.get("receiver_bank", "ไม่ระบุ"))
        
        sender_name = (
            data.get("sender_name_th") or 
            data.get("sender_name_en") or 
            data.get("sender", "ไม่พบชื่อผู้โอน")
        )
        
        receiver_name = (
            data.get("receiver_name_th") or 
            data.get("receiver_name_en") or 
            data.get("receiver_name", data.get("receiver", "ไม่พบชื่อผู้รับ"))
        )
        
        sender_logo_url = BANK_LOGOS.get(sender_bank.upper(), None)
        receiver_logo_url = BANK_LOGOS.get(receiver_bank.upper(), None)

        # Flex Message Body
        flex_message = {
            "type": "flex",
            "altText": f"ผลการตรวจสอบสลิป: {amount_display}",
            "contents": {
                "type": "bubble",
                "styles": {
                    "body": {
                        "backgroundColor": "#F0F2F5"
                    }
                },
                "body": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        # Header
                        {
                            "type": "text",
                            "text": "สถานะการโอนเงิน",
                            "color": "#666666",
                            "size": "sm"
                        },
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": "✅ โอนสำเร็จ" if status == "success" else "🔄 สลิปซ้ำ",
                                    "weight": "bold",
                                    "size": "lg",
                                    "color": "#1DB446" if status == "success" else "#FF6B35"
                                }
                            ],
                            "margin": "md"
                        },
                        {
                            "type": "separator",
                            "margin": "md",
                            "color": "#DDDDDD"
                        },
                        # Sender & Receiver Info
                        {
                            "type": "box",
                            "layout": "vertical",
                            "margin": "lg",
                            "spacing": "sm",
                            "contents": [
                                # Sender
                                create_info_box(
                                    "ผู้โอน", 
                                    sender_name, 
                                    sender_bank, 
                                    sender_logo_url
                                ),
                                # Receiver
                                create_info_box(
                                    "ผู้รับ", 
                                    receiver_name, 
                                    receiver_bank, 
                                    receiver_logo_url
                                )
                            ]
                        },
                        {
                            "type": "separator",
                            "margin": "lg",
                            "color": "#DDDDDD"
                        },
                        # Transaction Details
                        {
                            "type": "box",
                            "layout": "vertical",
                            "margin": "lg",
                            "spacing": "sm",
                            "contents": [
                                create_detail_row("จำนวนเงิน", amount_display, color="#111111", weight="bold", size="xl"),
                                create_detail_row("วันที่", date),
                                create_detail_row("เวลา", time_str),
                                create_detail_row("เลขที่อ้างอิง", trans_ref)
                            ]
                        }
                    ]
                }
            }
        }
        
        return flex_message
        
    except Exception as e:
        logger.error(f"❌ Error creating flex message: {e}")
        return create_error_flex_message(result.get("message", "เกิดข้อผิดพลาดในการสร้าง Flex Message"))

def create_info_box(label: str, name: str, bank_code: str, logo_url: str = None) -> Dict[str, Any]:
    """สร้าง Box สำหรับแสดงข้อมูลผู้โอน/ผู้รับพร้อมโลโก้ธนาคาร"""
    contents = []
    
    if logo_url:
        contents.append({
            "type": "image",
            "url": logo_url,
            "size": "xxs",
            "flex": 0,
            "margin": "none"
        })
    
    contents.append({
        "type": "text",
        "text": f"{label} {name}",
        "color": "#111111",
        "size": "sm",
        "weight": "regular",
        "flex": 1,
        "margin": "md" if logo_url else "none"
    })
    
    contents.append({
        "type": "text",
        "text": bank_code,
        "color": "#666666",
        "size": "sm",
        "flex": 0,
        "align": "end",
        "margin": "sm"
    })

    return {
        "type": "box",
        "layout": "horizontal",
        "contents": contents,
        "spacing": "sm",
        "gravity": "center"
    }

def create_detail_row(label: str, value: str, **kwargs) -> Dict[str, Any]:
    """สร้าง Box สำหรับแสดงรายละเอียดเป็นคู่ (label, value)"""
    return {
        "type": "box",
        "layout": "horizontal",
        "contents": [
            {
                "type": "text",
                "text": label,
                "size": "sm",
                "color": "#888888",
                "flex": 0
            },
            {
                "type": "text",
                "text": value,
                "size": "sm",
                "color": "#111111",
                "align": "end",
                "flex": 1,
                **kwargs
            }
        ]
    }
    
def create_error_flex_message(error_message: str) -> Dict[str, Any]:
    """สร้าง Flex Message สำหรับแสดงข้อผิดพลาดตามภาพที่คุณให้มา"""
    # เวลาปัจจุบัน
    thai_tz = pytz.timezone('Asia/Bangkok')
    current_time = datetime.now(thai_tz)
    verification_time = current_time.strftime("%d/%m/%Y %H:%M:%S")

    return {
        "type": "flex",
        "altText": "ไม่สามารถตรวจสอบสลิปได้",
        "contents": {
            "type": "bubble",
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "box",
                        "layout": "horizontal",
                        "backgroundColor": "#FF4444",
                        "cornerRadius": "md",
                        "contents": [
                            {
                                "type": "text",
                                "text": "❌ ไม่สามารถตรวจ...",
                                "weight": "bold",
                                "color": "#FFFFFF",
                                "size": "lg",
                                "margin": "lg"
                            }
                        ],
                        "paddingAll": "15px"
                    },
                    {
                        "type": "text",
                        "text": error_message,
                        "size": "sm",
                        "color": "#666666",
                        "wrap": True,
                        "margin": "lg"
                    },
                    {
                        "type": "box",
                        "layout": "vertical",
                        "backgroundColor": "#E8E8E8",
                        "cornerRadius": "md",
                        "contents": [
                            {
                                "type": "text",
                                "text": "💡 คำแนะนำ",
                                "weight": "bold",
                                "size": "sm",
                                "color": "#333333",
                                "margin": "lg"
                            },
                            {
                                "type": "text",
                                "text": "• ตรวจสอบให้แน่ใจว่าสลิปชัดเจน\n• ตรวจสอบว่าเป็นสลิปจริง\n• ลองถ่ายรูปใหม่หากไม่ชัด",
                                "size": "xs",
                                "color": "#666666",
                                "wrap": True,
                                "margin": "sm"
                            }
                        ],
                        "margin": "lg",
                        "paddingAll": "15px"
                    },
                    {
                        "type": "text",
                        "text": f"ตรวจสอบเมื่อ {verification_time} น.",
                        "size": "xs",
                        "color": "#AAAAAA",
                        "align": "center",
                        "margin": "lg"
                    }
                ]
            }
        }
    }
