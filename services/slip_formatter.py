# services/slip_formatter.py
import logging
from typing import Dict, Any
from datetime import datetime
import pytz

logger = logging.getLogger("slip_formatter")

def create_beautiful_slip_flex_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """สร้าง Flex Message แบบสวยงามสำหรับแสดงผลสลิป"""
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
        sender_bank = data.get("sender_bank_short", data.get("sender_bank", ""))
        receiver_bank = data.get("receiver_bank_short", data.get("receiver_bank", ""))
        
        # กำหนดสีและข้อความตามสถานะ
        if status == "success":
            header_color = "#00B900"
            status_text = "✅ สลิปถูกต้อง"
            status_icon = "✅"
        elif status == "duplicate":
            header_color = "#FFA500"
            status_text = "🔄 สลิปซ้ำ"
            status_icon = "🔄"
        else:
            header_color = "#FF4444"
            status_text = "❌ ตรวจสอบไม่ผ่าน"
            status_icon = "❌"
        
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
                                    "size": "lg",
                                    "weight": "bold",
                                    "color": header_color
                                }
                            ],
                            "backgroundColor": "#F0F0F0",
                            "paddingAll": "md"
                        },
                        {
                            "type": "separator",
                            "margin": "md"
                        },
                        {
                            "type": "box",
                            "layout": "vertical",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": amount_display,
                                    "size": "xxl",
                                    "weight": "bold",
                                    "align": "center",
                                    "color": "#333333"
                                },
                                {
                                    "type": "text",
                                    "text": f"{date} {time_str}",
                                    "size": "sm",
                                    "align": "center",
                                    "color": "#999999",
                                    "margin": "sm"
                                }
                            ],
                            "margin": "lg"
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
                                    "type": "box",
                                    "layout": "horizontal",
                                    "contents": [
                                        {
                                            "type": "text",
                                            "text": "ผู้โอน:",
                                            "flex": 2,
                                            "color": "#666666"
                                        },
                                        {
                                            "type": "text",
                                            "text": sender_name[:25],
                                            "flex": 5,
                                            "wrap": True
                                        }
                                    ]
                                },
                                {
                                    "type": "box",
                                    "layout": "horizontal",
                                    "contents": [
                                        {
                                            "type": "text",
                                            "text": "ธนาคาร:",
                                            "flex": 2,
                                            "color": "#666666"
                                        },
                                        {
                                            "type": "text",
                                            "text": sender_bank,
                                            "flex": 5
                                        }
                                    ],
                                    "margin": "sm"
                                }
                            ],
                            "margin": "lg"
                        },
                        {
                            "type": "separator",
                            "margin": "md"
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
                                            "text": "ผู้รับ:",
                                            "flex": 2,
                                            "color": "#666666"
                                        },
                                        {
                                            "type": "text",
                                            "text": receiver_name[:25],
                                            "flex": 5,
                                            "wrap": True
                                        }
                                    ]
                                },
                                {
                                    "type": "box",
                                    "layout": "horizontal",
                                    "contents": [
                                        {
                                            "type": "text",
                                            "text": "ธนาคาร:",
                                            "flex": 2,
                                            "color": "#666666"
                                        },
                                        {
                                            "type": "text",
                                            "text": receiver_bank,
                                            "flex": 5
                                        }
                                    ],
                                    "margin": "sm"
                                },
                                {
                                    "type": "box",
                                    "layout": "horizontal",
                                    "contents": [
                                        {
                                            "type": "text",
                                            "text": "เลขอ้างอิง:",
                                            "flex": 2,
                                            "color": "#666666"
                                        },
                                        {
                                            "type": "text",
                                            "text": trans_ref,
                                            "flex": 5,
                                            "wrap": True
                                        }
                                    ],
                                    "margin": "sm"
                                }
                            ],
                            "margin": "md"
                        }
                    ],
                    "paddingAll": "lg"
                }
            }
        }
        
        return flex_message
        
    except Exception as e:
        logger.error(f"❌ Error creating beautiful flex message: {e}")
        return create_simple_text_message(result)

def create_simple_text_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """Fallback to simple text message"""
    status = result.get("status")
    data = result.get("data", {})
    
    if status == "success":
        message = f"""✅ สลิปถูกต้อง

💰 จำนวน: ฿{data.get('amount', 'N/A')}
📅 วันที่: {data.get('date', 'N/A')} {data.get('time', '')}
🔢 เลขอ้างอิง: {data.get('reference', data.get('transRef', 'N/A'))}
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
    """สร้าง Error Flex Message"""
    return {
        "type": "flex",
        "altText": "❌ ไม่สามารถตรวจสอบสลิปได้",
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
                        "color": "#FF0000"
                    },
                    {
                        "type": "separator",
                        "margin": "md"
                    },
                    {
                        "type": "text",
                        "text": error_message,
                        "wrap": True,
                        "margin": "md",
                        "color": "#666666"
                    },
                    {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {
                                "type": "text",
                                "text": "💡 คำแนะนำ:",
                                "weight": "bold",
                                "margin": "lg"
                            },
                            {
                                "type": "text",
                                "text": "• ตรวจสอบให้แน่ใจว่าสลิปชัดเจน",
                                "size": "sm",
                                "color": "#666666",
                                "margin": "sm"
                            },
                            {
                                "type": "text",
                                "text": "• ตรวจสอบว่าเป็นสลิปจริง",
                                "size": "sm",
                                "color": "#666666",
                                "margin": "sm"
                            },
                            {
                                "type": "text",
                                "text": "• ลองถ่ายรูปใหม่หากไม่ชัด",
                                "size": "sm",
                                "color": "#666666",
                                "margin": "sm"
                            }
                        ],
                        "margin": "lg",
                        "backgroundColor": "#F0F0F0",
                        "paddingAll": "md",
                        "cornerRadius": "md"
                    }
                ]
            }
        }
    }
