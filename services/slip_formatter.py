# services/slip_formatter.py
import logging
from typing import Dict, Any
from datetime import datetime
import pytz

logger = logging.getLogger("slip_formatter")

def create_slip_flex_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """สร้าง Flex Message สำหรับแสดงผลสลิปแบบสวยงามตามรูปที่ให้มา"""
    try:
        status = result.get("status")
        data = result.get("data", {})
        
        if not data:
            return create_error_flex_message(result.get("message", "ไม่สามารถดึงข้อมูลสลิปได้"))
        
        # ดึงข้อมูลจากผลลัพธ์
        amount = data.get("amount", "0")
        try:
            amount_float = float(amount)
            amount_display = f"฿{amount_float:,.0f}" # Remove decimal places for integer amounts, matching the image.
        except (ValueError, TypeError):
            amount_display = f"฿{amount}"
        
        date = data.get("date", data.get("trans_date", ""))
        time_str = data.get("time", data.get("trans_time", ""))
        
        # แปลงเป็นเวลาไทย
        thai_tz = pytz.timezone('Asia/Bangkok')
        current_time = datetime.now(thai_tz)
        
        # ชื่อผู้ส่งและผู้รับ
        sender_name = data.get("sender_name_th") or data.get("sender_name_en") or data.get("sender", "ไม่พบชื่อผู้โอน")
        sender_account_masked = data.get("sender_acc_masked", "xxx-x-x6819-x") # Placeholder for the image
        
        receiver_name = data.get("receiver_name_th") or data.get("receiver_name_en") or data.get("receiver_name", data.get("receiver", "ไม่พบชื่อผู้รับ"))
        receiver_account_masked = data.get("receiver_acc_masked", "xxx-x-x5840-xxx") # Placeholder for the image
        
        # ธนาคาร
        sender_bank_logo = "https://i.imgur.com/kFmKj8M.png" # Placeholder for K-Bank logo
        receiver_bank_logo = "https://i.imgur.com/yvS1L3X.png" # Placeholder for GSB logo
        
        # กำหนดสีและสถานะตามผลการตรวจสอบ
        if status == "success":
            header_text = "สลิปถูกต้อง"
            header_color = "#E85647" # A custom color for the gradient, starting point
            header_color_end = "#F87A6C" # A custom color for the gradient, end point
            header_icon = "https://i.imgur.com/8Qp492j.png" # Icon for correct slip
            header_gradient = "linear-gradient(45deg, #E85647, #F87A6C)" # Gradient color
            bottom_logo = "https://i.imgur.com/39wJ0hD.png" # Thunder Solution logo
            bottom_text = "รับทรัพย์ รับโชค เงินทองทวีคูณ!"
        elif status == "duplicate":
            header_text = "สลิปซ้ำ"
            header_color = "#FFB833"
            header_icon = "https://i.imgur.com/VDuCpZD.png"
            header_gradient = None # Fallback to solid color
            bottom_logo = None
            bottom_text = "สลิปนี้เคยใช้แล้ว"
        else:
            header_text = "ตรวจสอบไม่ผ่าน"
            header_color = "#FF4444"
            header_icon = "https://i.imgur.com/dwsOWfx.png"
            header_gradient = None
            bottom_logo = None
            bottom_text = "ตรวจสอบไม่สำเร็จ"
        
        # สร้าง Flex Message
        flex_message = {
            "type": "flex",
            "altText": f"ผลการตรวจสอบสลิป: {amount_display}",
            "contents": {
                "type": "bubble",
                "size": "giga",
                "body": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        # Header with gradient background
                        {
                            "type": "box",
                            "layout": "vertical",
                            "contents": [
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
                                                    "url": "https://i.imgur.com/U1h6g8x.png", # Checkmark icon
                                                    "size": "20px",
                                                    "aspectRatio": "1:1",
                                                    "position": "absolute"
                                                }
                                            ],
                                            "width": "25px",
                                            "height": "25px",
                                            "backgroundColor": "#FFFFFF",
                                            "cornerRadius": "13px",
                                            "justifyContent": "center",
                                            "alignItems": "center"
                                        },
                                        {
                                            "type": "text",
                                            "text": header_text,
                                            "size": "lg",
                                            "color": "#FFFFFF",
                                            "weight": "bold",
                                            "margin": "md",
                                            "position": "absolute",
                                            "offsetStart": "50px"
                                        },
                                        {
                                            "type": "image",
                                            "url": "https://i.imgur.com/8Qp492j.png", # Chinese god of wealth image
                                            "size": "80px",
                                            "aspectRatio": "1:1",
                                            "position": "absolute",
                                            "offsetEnd": "0px"
                                        }
                                    ],
                                    "paddingAll": "15px",
                                    "alignItems": "center"
                                },
                                {
                                    "type": "box",
                                    "layout": "vertical",
                                    "contents": [
                                        {
                                            "type": "text",
                                            "text": amount_display,
                                            "size": "3xl",
                                            "weight": "bold",
                                            "color": "#FFFFFF"
                                        },
                                        {
                                            "type": "text",
                                            "text": f"{date} {time_str} น.",
                                            "size": "md",
                                            "color": "#FFFFFF",
                                            "margin": "md"
                                        }
                                    ],
                                    "paddingAll": "20px",
                                    "alignItems": "center"
                                },
                                {
                                    "type": "box",
                                    "layout": "horizontal",
                                    "contents": [
                                        # Sender Info
                                        {
                                            "type": "box",
                                            "layout": "vertical",
                                            "contents": [
                                                {
                                                    "type": "image",
                                                    "url": sender_bank_logo,
                                                    "size": "30px",
                                                    "aspectRatio": "1:1",
                                                    "margin": "sm"
                                                },
                                                {
                                                    "type": "text",
                                                    "text": "ผู้โอน",
                                                    "color": "#FFFFFF",
                                                    "size": "sm",
                                                    "margin": "sm"
                                                }
                                            ],
                                            "flex": 1,
                                            "alignItems": "center"
                                        },
                                        # Receiver Info
                                        {
                                            "type": "box",
                                            "layout": "vertical",
                                            "contents": [
                                                {
                                                    "type": "image",
                                                    "url": receiver_bank_logo,
                                                    "size": "30px",
                                                    "aspectRatio": "1:1",
                                                    "margin": "sm"
                                                },
                                                {
                                                    "type": "text",
                                                    "text": "ผู้รับ",
                                                    "color": "#FFFFFF",
                                                    "size": "sm",
                                                    "margin": "sm"
                                                }
                                            ],
                                            "flex": 1,
                                            "alignItems": "center"
                                        }
                                    ],
                                    "paddingAll": "15px"
                                },
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
                                                    "text": sender_name,
                                                    "size": "md",
                                                    "color": "#FFFFFF",
                                                    "align": "start"
                                                },
                                                {
                                                    "type": "text",
                                                    "text": sender_account_masked,
                                                    "size": "sm",
                                                    "color": "#FFFFFF",
                                                    "align": "start"
                                                }
                                            ],
                                            "flex": 1
                                        },
                                        {
                                            "type": "box",
                                            "layout": "vertical",
                                            "contents": [
                                                {
                                                    "type": "text",
                                                    "text": receiver_name,
                                                    "size": "md",
                                                    "color": "#FFFFFF",
                                                    "align": "end"
                                                },
                                                {
                                                    "type": "text",
                                                    "text": receiver_account_masked,
                                                    "size": "sm",
                                                    "color": "#FFFFFF",
                                                    "align": "end"
                                                }
                                            ],
                                            "flex": 1
                                        }
                                    ],
                                    "paddingAll": "15px"
                                }
                            ],
                            "backgroundColor": "#F76F62", # A custom color for the gradient, end point
                            "backgroundImage": {
                                "type": "url",
                                "url": "https://i.imgur.com/z69R5jA.png", # Background image from the provided image
                                "size": "full",
                                "aspectMode": "cover"
                            },
                            "cornerRadius": "15px",
                            "paddingAll": "0px"
                        },
                        
                        # Footer with custom text and logo
                        {
                            "type": "box",
                            "layout": "vertical",
                            "contents": [
                                {
                                    "type": "image",
                                    "url": "https://i.imgur.com/39wJ0hD.png", # Thunder Solution logo
                                    "size": "sm",
                                    "aspectRatio": "1:1",
                                    "margin": "md"
                                },
                                {
                                    "type": "text",
                                    "text": bottom_text,
                                    "size": "xs",
                                    "color": "#666666",
                                    "align": "center",
                                    "wrap": True,
                                    "margin": "sm"
                                }
                            ],
                            "alignItems": "center",
                            "margin": "xl"
                        }
                    ],
                    "paddingAll": "20px"
                }
            }
        }
        
        return flex_message
        
    except Exception as e:
        logger.error(f"❌ Error creating flex message: {e}")
        return create_simple_text_message(result)

def create_error_flex_message(error_message: str) -> Dict[str, Any]:
    """สร้าง Flex Message สำหรับแสดงข้อผิดพลาด"""
    
    # เวลาปัจจุบัน
    thai_tz = pytz.timezone('Asia/Bangkok')
    current_time = datetime.now(thai_tz)
    verification_time = current_time.strftime("%d/%m/%Y %H:%M:%S")
    
    return {
        "type": "flex",
        "altText": "ไม่สามารถตรวจสอบสลิปได้",
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
                                "type": "box",
                                "layout": "vertical",
                                "contents": [
                                    {
                                        "type": "text",
                                        "text": "❌",
                                        "size": "sm",
                                        "align": "center"
                                    }
                                ],
                                "width": "25px",
                                "height": "25px",
                                "backgroundColor": "#FFFFFF",
                                "cornerRadius": "13px",
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
                        "backgroundColor": "#FF4444",
                        "paddingAll": "15px",
                        "cornerRadius": "12px",
                        "alignItems": "center"
                    },
                    
                    # Error message
                    {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {
                                "type": "text",
                                "text": error_message,
                                "color": "#666666",
                                "size": "md",
                                "wrap": True
                            }
                        ],
                        "margin": "lg",
                        "paddingAll": "12px",
                        "backgroundColor": "#FFF3E0",
                        "cornerRadius": "8px"
                    },
                    
                    # Suggestions
                    {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {
                                "type": "text",
                                "text": "💡 คำแนะนำ",
                                "color": "#111111",
                                "size": "sm",
                                "weight": "bold"
                            },
                            {
                                "type": "text",
                                "text": "• ตรวจสอบให้แน่ใจว่าสลิปชัดเจน\n• ตรวจสอบว่าเป็นสลิปจริง\n• ลองถ่ายรูปใหม่หากไม่ชัด",
                                "color": "#666666",
                                "size": "xs",
                                "wrap": True,
                                "margin": "sm"
                            }
                        ],
                        "margin": "lg",
                        "paddingAll": "12px",
                        "backgroundColor": "#FAFAFA",
                        "cornerRadius": "8px"
                    },
                    
                    # Footer timestamp
                    {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {
                                "type": "text",
                                "text": f"ตรวจสอบเมื่อ {verification_time} น.",
                                "color": "#999999",
                                "size": "xs",
                                "align": "center"
                            }
                        ],
                        "margin": "lg",
                        "paddingTop": "8px",
                        "borderWidth": "1px",
                        "borderColor": "#EEEEEE"
                    }
                ],
                "paddingAll": "20px"
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
