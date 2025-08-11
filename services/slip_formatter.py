# services/slip_formatter.py
import logging
from typing import Dict, Any
from datetime import datetime
import pytz

logger = logging.getLogger("slip_formatter")

# เพิ่ม Dictionary สำหรับเก็บ URL โลโก้ธนาคาร (อัปเดตจากข้อมูลที่คุณให้)
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
    "ไทยพาณิชย์": "https://www.hood11.com/uploads/ไทยพาณิชย์ SCB.png"
}

def create_slip_flex_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """สร้าง Flex Message สำหรับแสดงผลสลิปแบบการ์ดสวยงามและครบถ้วนยิ่งขึ้น"""
    try:
        status = result.get("status")
        data = result.get("data", {})
        
        if not data:
            return create_error_flex_message(result.get("message", "ไม่สามารถดึงข้อมูลสลิปได้"))
        
        # ดึงข้อมูลจากผลลัพธ์
        amount = data.get("amount", "0")
        try:
            amount_float = float(amount)
            amount_display = f"฿{amount_float:,.2f}" # เพิ่มทศนิยม 2 ตำแหน่ง
        except (ValueError, TypeError):
            amount_display = f"฿{amount}"
        
        date = data.get("date", data.get("trans_date", "N/A"))
        time_str = data.get("time", data.get("trans_time", "N/A"))
        trans_ref = data.get("reference", data.get("transRef", "N/A"))
        sender_bank = data.get("sender_bank", "ไม่ระบุ")
        receiver_bank = data.get("receiver_bank", "ไม่ระบุ")
        
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
        
        # ค้นหาโลโก้ธนาคารจาก Dictionary
        sender_logo = BANK_LOGOS.get(sender_bank.replace("ธนาคาร", "").strip(), None)
        receiver_logo = BANK_LOGOS.get(receiver_bank.replace("ธนาคาร", "").strip(), None)

        # สร้าง Flex Message ที่ปรับปรุงดีไซน์
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
                            "type": "box",
                            "layout": "vertical",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": "สถานะการโอนเงิน",
                                    "color": "#666666",
                                    "size": "sm"
                                },
                                {
                                    "type": "text",
                                    "text": "✅ โอนสำเร็จ" if status == "success" else "🔄 สลิปซ้ำ",
                                    "weight": "bold",
                                    "size": "xl",
                                    "color": "#1DB446" if status == "success" else "#FF6B35",
                                    "margin": "sm"
                                }
                            ]
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
                                    sender_logo
                                ),
                                # Receiver
                                create_info_box(
                                    "ผู้รับ", 
                                    receiver_name, 
                                    receiver_bank, 
                                    receiver_logo
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
                                create_detail_row("เลขที่อ้างอิง", trans_ref),
                            ]
                        }
                    ]
                }
            }
        }
        
        return flex_message
        
    except Exception as e:
        logger.error(f"❌ Error creating flex message: {e}")
        return create_simple_text_message(result)
        
def create_info_box(label: str, name: str, bank: str, logo_url: str = None) -> Dict[str, Any]:
    """สร้าง Box สำหรับแสดงข้อมูลผู้โอน/ผู้รับ"""
    contents = [
        {
            "type": "text",
            "text": label,
            "color": "#666666",
            "size": "xs",
            "flex": 0
        },
        {
            "type": "text",
            "text": name,
            "color": "#111111",
            "size": "sm",
            "weight": "bold",
            "flex": 1,
            "margin": "md"
        }
    ]
    
    if logo_url:
        contents.insert(0, {
            "type": "image",
            "url": logo_url,
            "size": "xxs",
            "flex": 0,
            "margin": "none"
        })
    
    contents.append({
        "type": "text",
        "text": bank,
        "color": "#666666",
        "size": "xs",
        "flex": 1,
        "align": "end"
    })

    return {
        "type": "box",
        "layout": "horizontal",
        "contents": contents,
        "spacing": "sm"
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
    """สร้าง Flex Message สำหรับแสดงข้อผิดพลาด - แบบเรียบง่าย"""
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
                        "type": "text",
                        "text": "❌ ไม่สามารถตรวจสอบสลิปได้",
                        "weight": "bold",
                        "size": "lg",
                        "color": "#FF4444"
                    },
                    {
                        "type": "separator",
                        "margin": "md"
                    },
                    {
                        "type": "text",
                        "text": error_message,
                        "size": "sm",
                        "color": "#666666",
                        "wrap": True,
                        "margin": "md"
                    },
                    {
                        "type": "text",
                        "text": "💡 คำแนะนำ:",
                        "size": "sm",
                        "weight": "bold",
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
                ]
            }
        }
    }

def create_simple_text_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """Fallback to simple text message"""
    status = result.get("status")
    data = result.get("data", {})
    
    # เวลาปัจจุบัน
    thai_tz = pytz.timezone('Asia/Bangkok')
    current_time = datetime.now(thai_tz)
    verification_time = current_time.strftime("%d/%m/%Y %H:%M:%S")
    
    if status == "success":
        message = f"""✅ สลิปถูกต้อง

💰 จำนวน: ฿{data.get('amount', 'N/A')}
📅 วันที่: {data.get('date', 'N/A')}
🔢 เลขอ้างอิง: {data.get('reference', 'N/A')}
👤 ผู้โอน: {data.get('sender', 'N/A')}
🎯 ผู้รับ: {data.get('receiver_name', 'N/A')}

ตรวจสอบเมื่อ {verification_time} น."""
    elif status == "duplicate":
        message = f"""🔄 สลิปนี้เคยถูกใช้แล้ว

💰 จำนวน: ฿{data.get('amount', 'N/A')}
🔢 เลขอ้างอิง: {data.get('reference', 'N/A')}

ตรวจสอบเมื่อ {verification_time} น."""
    else:
        message = f"""❌ ไม่สามารถตรวจสอบสลิปได้

{result.get('message', '')}

ตรวจสอบเมื่อ {verification_time} น."""
    
    return {
        "type": "text",
        "text": message
    }
