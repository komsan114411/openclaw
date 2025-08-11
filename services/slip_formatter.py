# services/slip_formatter.py
import logging
from typing import Dict, Any
from datetime import datetime
import pytz

logger = logging.getLogger("slip_formatter")

def create_slip_flex_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """สร้าง Flex Message สำหรับแสดงผลสลิปแบบการ์ดสวยงาม"""
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
            
        date = data.get("date", data.get("trans_date", ""))
        time_str = data.get("time", data.get("trans_time", ""))
        trans_ref = data.get("reference", data.get("transRef", "N/A"))
        
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
        
        # สร้าง Simple Flex Message ที่ไม่ซับซ้อน
        flex_message = {
            "type": "flex",
            "altText": f"ผลการตรวจสอบสลิป: {amount_display}",
            "contents": {
                "type": "bubble",
                "body": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        # Header
                        {
                            "type": "text",
                            "text": "✅ สลิปถูกต้อง" if status == "success" else "🔄 สลิปซ้ำ",
                            "weight": "bold",
                            "size": "lg",
                            "color": "#1DB446" if status == "success" else "#FF6B35"
                        },
                        {
                            "type": "separator",
                            "margin": "md"
                        },
                        # Amount
                        {
                            "type": "text",
                            "text": amount_display,
                            "weight": "bold",
                            "size": "3xl",
                            "margin": "md",
                            "color": "#111111"
                        },
                        # Date Time
                        {
                            "type": "text",
                            "text": f"📅 {date} {time_str}",
                            "size": "sm",
                            "color": "#555555",
                            "margin": "sm"
                        },
                        # Reference
                        {
                            "type": "text",
                            "text": f"🔢 อ้างอิง: {trans_ref}",
                            "size": "sm",
                            "color": "#555555",
                            "margin": "sm"
                        },
                        {
                            "type": "separator",
                            "margin": "md"
                        },
                        # Sender
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": "ผู้โอน:",
                                    "size": "sm",
                                    "color": "#888888",
                                    "flex": 0
                                },
                                {
                                    "type": "text",
                                    "text": sender_name,
                                    "size": "sm",
                                    "color": "#111111",
                                    "align": "end"
                                }
                            ],
                            "margin": "md"
                        },
                        # Receiver
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": "ผู้รับ:",
                                    "size": "sm",
                                    "color": "#888888",
                                    "flex": 0
                                },
                                {
                                    "type": "text",
                                    "text": receiver_name,
                                    "size": "sm",
                                    "color": "#111111",
                                    "align": "end"
                                }
                            ],
                            "margin": "sm"
                        }
                    ]
                }
            }
        }
        
        return flex_message
        
    except Exception as e:
        logger.error(f"❌ Error creating flex message: {e}")
        return create_simple_text_message(result)
        
        
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
