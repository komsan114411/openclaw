# services/slip_formatter.py
import logging
from typing import Dict, Any
from datetime import datetime
import pytz

logger = logging.getLogger("slip_formatter")

def create_slip_flex_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """สร้าง Flex Message สำหรับแสดงผลสลิปแบบสวยงาม"""
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
        # ดึงข้อมูลวันที่และเวลาจาก ISO datetime ที่มีอยู่
        iso_datetime = data.get("datetime_full", datetime.now(pytz.timezone('Asia/Bangkok')).isoformat())
        try:
            dt_object = datetime.fromisoformat(iso_datetime.replace('Z', '+00:00'))
            thai_tz = pytz.timezone('Asia/Bangkok')
            thai_dt = dt_object.astimezone(thai_tz)
            date = thai_dt.strftime("%d %b. %y") # 12 ส.ค. 68
            time_str = thai_dt.strftime("%H:%M น.") # 02:46 น.
        except Exception as e:
            logger.warning(f"Error parsing date: {e}. Using fallback.")
            date = data.get("date", "N/A")
            time_str = data.get("time", "N/A")
        
        verification_time = datetime.now(pytz.timezone('Asia/Bangkok')).strftime("%d/%m/%Y %H:%M:%S")
        
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

        # กำหนดสีและสถานะตามผลการตรวจสอบ
        if status == "success":
            header_color = "#EB5757" # สีแดง
            header_text = "สลิปถูกต้อง"
            header_icon = "https://www.flaticon.com/svg/static/icons/svg/561/561189.svg" # ไอคอนเช็ค
            bottom_text = "รับทรัพย์ รับโชค เงินทองทวีคูณ!"
            bottom_color = "#333333"
        elif status == "duplicate":
            header_color = "#FFB833" # สีส้ม
            header_text = "สลิปซ้ำ"
            header_icon = "https://i.imgur.com/VDuCpZD.png" # ไอคอนเตือน
            bottom_text = "สลิปนี้เคยใช้แล้ว"
            bottom_color = "#FFB833"
        else:
            header_color = "#FF4444" # สีแดง
            header_text = "ตรวจสอบไม่ผ่าน"
            header_icon = "https://i.imgur.com/dwsOWfx.png" # ไอคอนผิด
            bottom_text = "ตรวจสอบไม่สำเร็จ"
            bottom_color = "#FF4444"
        
        # สร้าง Flex Message แบบสวยงาม
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
                        # Background image
                        {
                            "type": "image",
                            "url": "https://i.imgur.com/zW3Bv1b.png",  # ภาพพื้นหลัง
                            "size": "full",
                            "aspectMode": "cover",
                            "aspectRatio": "20:23",
                            "position": "absolute",
                            "gravity": "top"
                        },
                        # Header with gradient background
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
                                            "url": "https://i.imgur.com/QXhSKqq.png",
                                            "size": "sm",
                                            "aspectRatio": "1:1"
                                        }
                                    ],
                                    "width": "30px",
                                    "height": "30px",
                                    "backgroundColor": "#FFFFFF",
                                    "cornerRadius": "15px",
                                    "justifyContent": "center",
                                    "alignItems": "center"
                                },
                                {
                                    "type": "text",
                                    "text": "สลิปถูกต้อง",
                                    "size": "lg",
                                    "color": "#FFFFFF",
                                    "weight": "bold",
                                    "margin": "md",
                                    "align": "start"
                                }
                            ],
                            "backgroundColor": "#EB5757",
                            "paddingAll": "15px",
                            "cornerRadius": "12px",
                            "alignItems": "center",
                            "height": "60px",
                            "position": "absolute",
                            "width": "100%",
                            "offsetStart": "0px"
                        },
                        {
                          "type": "box",
                          "layout": "horizontal",
                          "contents": [
                            {
                              "type": "image",
                              "url": "https://i.imgur.com/rW8yB8y.png",
                              "size": "sm",
                              "flex": 0
                            }
                          ],
                          "position": "absolute",
                          "offsetEnd": "10px",
                          "offsetTop": "10px"
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
                                    "text": f"12 ส.ค. 68, 02:46 น.",
                                    "size": "sm",
                                    "color": "#666666",
                                    "align": "center"
                                }
                            ],
                            "paddingAll": "12px",
                            "margin": "xxl",
                            "justifyContent": "center",
                            "alignItems": "center"
                        },
                        
                        # Transaction details
                        {
                            "type": "box",
                            "layout": "vertical",
                            "contents": [
                                # Sender
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
                                                    "url": "https://i.imgur.com/E0l0o6P.png", # KBank logo
                                                    "size": "xxs",
                                                    "aspectRatio": "1:1",
                                                    "aspectMode": "cover"
                                                },
                                                {
                                                    "type": "text",
                                                    "text": "ผู้โอน",
                                                    "size": "xxs",
                                                    "color": "#666666",
                                                    "align": "center",
                                                    "margin": "sm"
                                                }
                                            ],
                                            "flex": 0,
                                            "alignItems": "center"
                                        },
                                        {
                                            "type": "text",
                                            "text": "MR. Todsporn N",
                                            "size": "md",
                                            "color": "#333333",
                                            "weight": "bold",
                                            "align": "end"
                                        }
                                    ],
                                    "alignItems": "center"
                                },
                                {
                                  "type": "box",
                                  "layout": "horizontal",
                                  "contents": [
                                    {
                                      "type": "spacer"
                                    },
                                    {
                                      "type": "text",
                                      "text": "xxx-x-x6819-x",
                                      "size": "sm",
                                      "color": "#666666"
                                    }
                                  ]
                                },
                                {
                                    "type": "separator",
                                    "margin": "xl",
                                    "color": "#EEEEEE"
                                },
                                # Receiver
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
                                                    "url": "https://i.imgur.com/h5T2J9u.png", # Omsin logo
                                                    "size": "xxs",
                                                    "aspectRatio": "1:1",
                                                    "aspectMode": "cover"
                                                },
                                                {
                                                    "type": "text",
                                                    "text": "ผู้รับ",
                                                    "size": "xxs",
                                                    "color": "#666666",
                                                    "align": "center",
                                                    "margin": "sm"
                                                }
                                            ],
                                            "flex": 0,
                                            "alignItems": "center"
                                        },
                                        {
                                            "type": "text",
                                            "text": "นางสาว นิรมาดา ใจ...",
                                            "size": "md",
                                            "color": "#333333",
                                            "weight": "bold",
                                            "align": "end"
                                        }
                                    ],
                                    "margin": "xl",
                                    "alignItems": "center"
                                },
                                {
                                  "type": "box",
                                  "layout": "horizontal",
                                  "contents": [
                                    {
                                      "type": "spacer"
                                    },
                                    {
                                      "type": "text",
                                      "text": "xxx-x-x5840-xxx",
                                      "size": "sm",
                                      "color": "#666666"
                                    }
                                  ]
                                }
                            ],
                            "paddingAll": "12px",
                            "margin": "xxl"
                        },
                        
                        # Footer
                        {
                            "type": "box",
                            "layout": "vertical",
                            "contents": [
                                {
                                  "type": "box",
                                  "layout": "horizontal",
                                  "contents": [
                                    {
                                      "type": "image",
                                      "url": "https://i.imgur.com/c1i4pE3.png", # Thunder Solution logo
                                      "size": "sm",
                                      "flex": 0,
                                      "aspectMode": "fit"
                                    },
                                    {
                                      "type": "spacer"
                                    },
                                    {
                                      "type": "text",
                                      "text": "รับทรัพย์ รับโชค เงินทองทวีคูณ!",
                                      "size": "sm",
                                      "color": "#999999",
                                      "align": "end"
                                    }
                                  ]
                                },
                            ],
                            "paddingAll": "12px",
                            "margin": "xxl",
                            "paddingTop": "150px"
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
