# services/slip_formatter.py (ไฟล์ใหม่)
import logging
from typing import Dict, Any
from datetime import datetime

logger = logging.getLogger("slip_formatter")

def create_slip_flex_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """สร้าง Flex Message สำหรับแสดงผลสลิป"""
    try:
        status = result.get("status")
        data = result.get("data", {})
        
        if not data:
            return create_error_flex_message(result.get("message", "ไม่สามารถดึงข้อมูลสลิปได้"))
        
        # ดึงข้อมูลจากผลลัพธ์
        amount = data.get("amount", "0")
        try:
            amount_float = float(amount)
            amount_display = f"฿{amount_float:,.2f}"
        except:
            amount_display = f"฿{amount}"
            
        date = data.get("date", data.get("trans_date", ""))
        time_str = data.get("time", data.get("trans_time", ""))
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
        
        # ธนาคาร
        sender_bank = data.get("sender_bank_short", data.get("sender_bank", ""))
        receiver_bank = data.get("receiver_bank_short", data.get("receiver_bank", ""))
        
        # กำหนดสีและไอคอนตามสถานะ
        if status == "success":
            header_color = "#06C755"  # สีเขียว LINE
            header_text = "สลิปถูกต้อง"
            status_icon = "https://img.icons8.com/fluency/96/checked.png"
            status_text = "ตรวจสอบสำเร็จ"
        elif status == "duplicate":
            header_color = "#FFB400"  # สีเหลือง
            header_text = "สลิปซ้ำ"
            status_icon = "https://img.icons8.com/fluency/96/refresh.png"
            status_text = "เคยใช้แล้ว"
        else:
            header_color = "#FF3333"  # สีแดง
            header_text = "ตรวจสอบไม่ผ่าน"
            status_icon = "https://img.icons8.com/fluency/96/cancel.png"
            status_text = "ไม่สำเร็จ"
        
        # สร้าง Flex Message
        flex_message = {
            "type": "flex",
            "altText": f"ผลการตรวจสอบสลิป: {amount_display}",
            "contents": {
                "type": "bubble",
                "size": "kilo",
                "header": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "image",
                                    "url": status_icon,
                                    "size": "30px",
                                    "flex": 0,
                                    "aspectRatio": "1:1"
                                },
                                {
                                    "type": "text",
                                    "text": header_text,
                                    "size": "lg",
                                    "color": "#FFFFFF",
                                    "weight": "bold",
                                    "margin": "md",
                                    "flex": 1
                                }
                            ],
                            "alignItems": "center"
                        }
                    ],
                    "backgroundColor": header_color,
                    "paddingAll": "15px"
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
                                    "color": "#1DB446",
                                    "align": "center"
                                }
                            ],
                            "margin": "md",
                            "backgroundColor": "#F0FFF4",
                            "cornerRadius": "8px",
                            "paddingAll": "15px"
                        },
                        
                        # ข้อมูลธุรกรรม
                        {
                            "type": "box",
                            "layout": "vertical",
                            "contents": [
                                # วันที่และเวลา
                                create_info_row("📅 วันที่", f"{date} {time_str}".strip()),
                                
                                # เลขอ้างอิง
                                create_info_row("🔢 เลขอ้างอิง", trans_ref),
                                
                                # Separator
                                {
                                    "type": "separator",
                                    "margin": "md"
                                },
                                
                                # ผู้โอน
                                create_info_row("👤 ผู้โอน", sender_name),
                                create_info_row("🏦 ธนาคาร", f"ธ.{sender_bank}" if sender_bank else "N/A"),
                                
                                # Separator
                                {
                                    "type": "separator",
                                    "margin": "md"
                                },
                                
                                # ผู้รับ
                                create_info_row("🎯 ผู้รับ", receiver_name),
                                create_info_row("🏦 ธนาคาร", f"ธ.{receiver_bank}" if receiver_bank else "N/A"),
                            ],
                            "margin": "lg",
                            "spacing": "sm"
                        },
                        
                        # สถานะ
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": "สถานะ:",
                                    "size": "sm",
                                    "color": "#555555",
                                    "flex": 0
                                },
                                {
                                    "type": "text",
                                    "text": status_text,
                                    "size": "sm",
                                    "color": header_color,
                                    "weight": "bold",
                                    "align": "end",
                                    "flex": 1
                                }
                            ],
                            "margin": "lg"
                        }
                    ],
                    "paddingAll": "20px"
                },
                "footer": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {
                            "type": "text",
                            "text": f"ตรวจสอบเมื่อ {datetime.now().strftime('%H:%M น.')}",
                            "size": "xs",
                            "color": "#999999",
                            "align": "center"
                        }
                    ],
                    "paddingAll": "10px"
                }
            }
        }
        
        return flex_message
        
    except Exception as e:
        logger.error(f"❌ Error creating flex message: {e}")
        return create_simple_text_message(result)

def create_info_row(label: str, value: str) -> Dict[str, Any]:
    """สร้างแถวข้อมูล"""
    return {
        "type": "box",
        "layout": "horizontal",
        "contents": [
            {
                "type": "text",
                "text": label,
                "size": "sm",
                "color": "#555555",
                "flex": 0,
                "gravity": "top"
            },
            {
                "type": "text",
                "text": value or "N/A",
                "size": "sm",
                "color": "#111111",
                "align": "end",
                "flex": 1,
                "wrap": True
            }
        ],
        "spacing": "md"
    }

def create_error_flex_message(error_message: str) -> Dict[str, Any]:
    """สร้าง Flex Message สำหรับแสดงข้อผิดพลาด"""
    return {
        "type": "flex",
        "altText": "ไม่สามารถตรวจสอบสลิปได้",
        "contents": {
            "type": "bubble",
            "size": "kilo",
            "header": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "text",
                        "text": "❌ ไม่สามารถตรวจสอบสลิปได้",
                        "size": "lg",
                        "color": "#FFFFFF",
                        "weight": "bold"
                    }
                ],
                "backgroundColor": "#FF3333",
                "paddingAll": "15px"
            },
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "text",
                        "text": error_message,
                        "size": "md",
                        "color": "#666666",
                        "wrap": True
                    },
                    {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {
                                "type": "text",
                                "text": "💡 คำแนะนำ:",
                                "size": "sm",
                                "color": "#111111",
                                "weight": "bold",
                                "margin": "md"
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
                        "backgroundColor": "#FFF3E0",
                        "cornerRadius": "8px",
                        "paddingAll": "10px"
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
    
    if status == "success":
        message = f"✅ สลิปถูกต้อง\n\n💰 จำนวน: ฿{data.get('amount', 'N/A')}\n📅 วันที่: {data.get('date', 'N/A')}"
    elif status == "duplicate":
        message = "🔄 สลิปนี้เคยถูกใช้แล้ว"
    else:
        message = f"❌ ไม่สามารถตรวจสอบสลิปได้\n\n{result.get('message', '')}"
    
    return {
        "type": "text",
        "text": message
    }
