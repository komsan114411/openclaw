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
            
        # จัดการวันที่และเวลา
        date = data.get("date", data.get("trans_date", ""))
        time_str = data.get("time", data.get("trans_time", ""))
        
        # แปลงเป็นเวลาไทย
        thai_tz = pytz.timezone('Asia/Bangkok')
        current_time = datetime.now(thai_tz)
        verification_time = f"{current_time.strftime('%d ส.ค. %y, %H:%M')} น."
        
        trans_ref = data.get("reference", data.get("transRef", "N/A"))
        
        # ชื่อผู้ส่งและผู้รับ
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
        
        # ปิดบังข้อมูลส่วนตัว (แสดงเฉพาะบางส่วน)
        if len(sender_name) > 10:
            sender_display = f"{sender_name[:8]}..."
        else:
            sender_display = sender_name
            
        if len(receiver_name) > 10:
            receiver_display = f"{receiver_name[:8]}..."
        else:
            receiver_display = receiver_name
            
        # ปิดบังเลขบัญชี
        if len(trans_ref) > 10:
            ref_display = f"xxx-x-x{trans_ref[-4:]}-x"
        else:
            ref_display = trans_ref
        
        # ธนาคาร
        sender_bank = data.get("sender_bank_short", data.get("sender_bank", ""))
        receiver_bank = data.get("receiver_bank_short", data.get("receiver_bank", ""))
        
        # กำหนดสีและไอคอนตามสถานะ
        if status == "success":
            header_gradient = "https://i.imgur.com/YourOrangeGradient.png"  # ใส่ URL รูป gradient สีส้ม
            status_text = "สลิปถูกต้อง"
            status_icon = "✅"
        elif status == "duplicate":
            header_gradient = "https://i.imgur.com/YourYellowGradient.png"  
            status_text = "สลิปซ้ำ"
            status_icon = "🔄"
        else:
            header_gradient = "https://i.imgur.com/YourRedGradient.png"
            status_text = "ตรวจสอบไม่ผ่าน"
            status_icon = "❌"
        
        # สร้าง Flex Message แบบการ์ดสวยงาม
        flex_message = {
            "type": "flex",
            "altText": f"ผลการตรวจสอบสลิป: {amount_display}",
            "contents": {
                "type": "bubble",
                "size": "mega",
                "body": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        # Background Image Container
                        {
                            "type": "box",
                            "layout": "absolute",
                            "contents": [
                                # Background gradient
                                {
                                    "type": "box",
                                    "layout": "vertical",
                                    "contents": [],
                                    "backgroundColor": "#FF6B35",
                                    "background": {
                                        "type": "linearGradient",
                                        "angle": "135deg",
                                        "startColor": "#FF6B35",
                                        "endColor": "#F7931E"
                                    },
                                    "position": "absolute",
                                    "width": "100%",
                                    "height": "100%"
                                },
                                # Content Container
                                {
                                    "type": "box",
                                    "layout": "vertical",
                                    "contents": [
                                        # Header Section
                                        {
                                            "type": "box",
                                            "layout": "horizontal",
                                            "contents": [
                                                {
                                                    "type": "box",
                                                    "layout": "vertical",
                                                    "contents": [
                                                        {
                                                            "type": "text",
                                                            "text": status_icon,
                                                            "size": "xl",
                                                            "align": "center"
                                                        }
                                                    ],
                                                    "width": "35px",
                                                    "height": "35px",
                                                    "backgroundColor": "#FFFFFF",
                                                    "cornerRadius": "18px",
                                                    "justifyContent": "center",
                                                    "alignItems": "center"
                                                },
                                                {
                                                    "type": "text",
                                                    "text": status_text,
                                                    "size": "lg",
                                                    "color": "#FFFFFF",
                                                    "weight": "bold",
                                                    "margin": "md"
                                                },
                                                {
                                                    "type": "spacer"
                                                },
                                                # Decorative icon on right
                                                {
                                                    "type": "image",
                                                    "url": "https://i.imgur.com/CnyParticle.png",  # รูปกราฟิกประดับ
                                                    "size": "60px",
                                                    "aspectRatio": "1:1",
                                                    "position": "relative"
                                                }
                                            ],
                                            "alignItems": "center",
                                            "paddingAll": "20px"
                                        },
                                        
                                        # White Card Section
                                        {
                                            "type": "box",
                                            "layout": "vertical",
                                            "contents": [
                                                # Amount Display
                                                {
                                                    "type": "text",
                                                    "text": amount_display,
                                                    "size": "4xl",
                                                    "weight": "bold",
                                                    "color": "#1A237E",
                                                    "align": "start",
                                                    "margin": "none"
                                                },
                                                {
                                                    "type": "text",
                                                    "text": verification_time,
                                                    "size": "sm",
                                                    "color": "#999999",
                                                    "margin": "sm"
                                                },
                                                
                                                # Divider
                                                {
                                                    "type": "separator",
                                                    "margin": "lg"
                                                },
                                                
                                                # Transaction Details Grid
                                                {
                                                    "type": "box",
                                                    "layout": "vertical",
                                                    "contents": [
                                                        # Sender Row
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
                                                                            "url": "https://img.icons8.com/fluency/48/user-male-circle.png",
                                                                            "size": "35px",
                                                                            "aspectRatio": "1:1"
                                                                        }
                                                                    ],
                                                                    "width": "35px",
                                                                    "height": "35px",
                                                                    "backgroundColor": "#E8F5E9",
                                                                    "cornerRadius": "18px",
                                                                    "justifyContent": "center",
                                                                    "alignItems": "center"
                                                                },
                                                                {
                                                                    "type": "box",
                                                                    "layout": "vertical",
                                                                    "contents": [
                                                                        {
                                                                            "type": "text",
                                                                            "text": "ผู้โอน",
                                                                            "size": "xs",
                                                                            "color": "#999999"
                                                                        },
                                                                        {
                                                                            "type": "text",
                                                                            "text": sender_display,
                                                                            "size": "sm",
                                                                            "color": "#333333",
                                                                            "weight": "bold"
                                                                        }
                                                                    ],
                                                                    "margin": "md",
                                                                    "flex": 1
                                                                }
                                                            ],
                                                            "alignItems": "center"
                                                        },
                                                        
                                                        # Receiver Row
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
                                                                            "url": "https://img.icons8.com/fluency/48/money-bag.png",
                                                                            "size": "35px",
                                                                            "aspectRatio": "1:1"
                                                                        }
                                                                    ],
                                                                    "width": "35px",
                                                                    "height": "35px",
                                                                    "backgroundColor": "#FFE0E0",
                                                                    "cornerRadius": "18px",
                                                                    "justifyContent": "center",
                                                                    "alignItems": "center"
                                                                },
                                                                {
                                                                    "type": "box",
                                                                    "layout": "vertical",
                                                                    "contents": [
                                                                        {
                                                                            "type": "text",
                                                                            "text": "ผู้รับ",
                                                                            "size": "xs",
                                                                            "color": "#999999"
                                                                        },
                                                                        {
                                                                            "type": "text",
                                                                            "text": receiver_display,
                                                                            "size": "sm",
                                                                            "color": "#333333",
                                                                            "weight": "bold"
                                                                        },
                                                                        {
                                                                            "type": "text",
                                                                            "text": ref_display,
                                                                            "size": "xs",
                                                                            "color": "#999999"
                                                                        }
                                                                    ],
                                                                    "margin": "md",
                                                                    "flex": 1
                                                                }
                                                            ],
                                                            "alignItems": "center",
                                                            "margin": "lg"
                                                        }
                                                    ],
                                                    "margin": "lg"
                                                },
                                                
                                                # Footer with QR Code and Logo
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
                                                                    "url": "https://api.qrserver.com/v1/create-qr-code/?size=60x60&data=THUNDER",
                                                                    "size": "50px",
                                                                    "aspectRatio": "1:1"
                                                                },
                                                                {
                                                                    "type": "text",
                                                                    "text": "THUNDER",
                                                                    "size": "xxs",
                                                                    "color": "#666666",
                                                                    "align": "center",
                                                                    "margin": "xs"
                                                                }
                                                            ]
                                                        },
                                                        {
                                                            "type": "spacer"
                                                        },
                                                        {
                                                            "type": "text",
                                                            "text": "รับทรัพย์ รับโชค เงินทองมาเต็ม!",
                                                            "size": "xs",
                                                            "color": "#999999",
                                                            "align": "center",
                                                            "wrap": True
                                                        },
                                                        {
                                                            "type": "spacer"
                                                        },
                                                        {
                                                            "type": "image",
                                                            "url": "https://i.imgur.com/MoneyBagIcon.png",  # ไอคอนถุงเงิน
                                                            "size": "50px",
                                                            "aspectRatio": "1:1"
                                                        }
                                                    ],
                                                    "margin": "xl",
                                                    "paddingTop": "md",
                                                    "borderWidth": "1px",
                                                    "borderColor": "#EEEEEE",
                                                    "alignItems": "center"
                                                }
                                            ],
                                            "backgroundColor": "#FFFFFF",
                                            "cornerRadius": "20px",
                                            "paddingAll": "20px",
                                            "margin": "none"
                                        }
                                    ],
                                    "paddingBottom": "20px",
                                    "paddingStart": "20px",
                                    "paddingEnd": "20px"
                                }
                            ]
                        }
                    ],
                    "paddingAll": "0px",
                    "backgroundColor": "#FF6B35"
                }
            }
        }
        
        return flex_message
        
    except Exception as e:
        logger.error(f"❌ Error creating flex message: {e}")
        logger.exception(e)
        return create_simple_text_message(result)

def create_error_flex_message(error_message: str) -> Dict[str, Any]:
    """สร้าง Flex Message สำหรับแสดงข้อผิดพลาด"""
    
    # เวลาปัจจุบัน
    thai_tz = pytz.timezone('Asia/Bangkok')
    current_time = datetime.now(thai_tz)
    verification_time = f"{current_time.strftime('%d ส.ค. %y, %H:%M')} น."
    
    return {
        "type": "flex",
        "altText": "ไม่สามารถตรวจสอบสลิปได้",
        "contents": {
            "type": "bubble",
            "size": "mega",
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "box",
                        "layout": "absolute",
                        "contents": [
                            # Red gradient background
                            {
                                "type": "box",
                                "layout": "vertical",
                                "contents": [],
                                "backgroundColor": "#FF4444",
                                "background": {
                                    "type": "linearGradient",
                                    "angle": "135deg",
                                    "startColor": "#FF6B6B",
                                    "endColor": "#FF4444"
                                },
                                "position": "absolute",
                                "width": "100%",
                                "height": "100%"
                            },
                            # Content
                            {
                                "type": "box",
                                "layout": "vertical",
                                "contents": [
                                    # Header
                                    {
                                        "type": "box",
                                        "layout": "horizontal",
                                        "contents": [
                                            {
                                                "type": "box",
                                                "layout": "vertical",
                                                "contents": [
                                                    {
                                                        "type": "text",
                                                        "text": "❌",
                                                        "size": "xl",
                                                        "align": "center"
                                                    }
                                                ],
                                                "width": "35px",
                                                "height": "35px",
                                                "backgroundColor": "#FFFFFF",
                                                "cornerRadius": "18px",
                                                "justifyContent": "center",
                                                "alignItems": "center"
                                            },
                                            {
                                                "type": "text",
                                                "text": "ไม่สามารถตรวจสอบสลิปได้",
                                                "size": "lg",
                                                "color": "#FFFFFF",
                                                "weight": "bold",
                                                "margin": "md"
                                            }
                                        ],
                                        "alignItems": "center",
                                        "paddingAll": "20px"
                                    },
                                    
                                    # White Card
                                    {
                                        "type": "box",
                                        "layout": "vertical",
                                        "contents": [
                                            {
                                                "type": "text",
                                                "text": "⚠️ เกิดข้อผิดพลาด",
                                                "size": "lg",
                                                "weight": "bold",
                                                "color": "#FF4444"
                                            },
                                            {
                                                "type": "text",
                                                "text": error_message,
                                                "size": "md",
                                                "color": "#666666",
                                                "wrap": True,
                                                "margin": "md"
                                            },
                                            {
                                                "type": "box",
                                                "layout": "vertical",
                                                "contents": [
                                                    {
                                                        "type": "text",
                                                        "text": "💡 คำแนะนำ",
                                                        "size": "sm",
                                                        "weight": "bold",
                                                        "color": "#333333"
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
                                                "backgroundColor": "#FFF3E0",
                                                "cornerRadius": "8px",
                                                "paddingAll": "12px",
                                                "margin": "lg"
                                            },
                                            {
                                                "type": "text",
                                                "text": verification_time,
                                                "size": "xs",
                                                "color": "#999999",
                                                "align": "center",
                                                "margin": "lg"
                                            }
                                        ],
                                        "backgroundColor": "#FFFFFF",
                                        "cornerRadius": "20px",
                                        "paddingAll": "20px"
                                    }
                                ],
                                "paddingBottom": "20px",
                                "paddingStart": "20px",
                                "paddingEnd": "20px"
                            }
                        ]
                    }
                ],
                "paddingAll": "0px",
                "backgroundColor": "#FF4444"
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
