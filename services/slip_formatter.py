import logging
from typing import Dict, Any
from datetime import datetime
import pytz

logger = logging.getLogger("slip_formatter")

def get_bank_logo_url(bank_code: str) -> str:
    """Get bank logo URL from bank code"""
    bank_logos = {
        "002": "https://www.hood11.com/uploads/khungefl.png",  # BBL
        "004": "https://www.hood11.com/uploads/kikh.png",  # KBANK
        "006": "https://www.hood11.com/uploads/khungaifs.png",  # KTB
        "011": "https://www.hood11.com/uploads/ttb.png",  # TMB/TTB
        "014": "https://www.hood11.com/uploads/aifslanichsscb.png",  # SCB
        "025": "https://www.hood11.com/uploads/khunghhi2.png",  # BAY
        "030": "https://www.hood11.com/uploads/sif.png",  # GSB
        "034": "https://www.hood11.com/uploads/phfakhahphk.png",  # BAAC
        "069": "https://www.hood11.com/uploads/ekishpifakhif.png",  # KKP
        "070": "https://www.hood11.com/uploads/icbc.png",  # ICBC
        "071": "https://www.hood11.com/uploads/uob.png",  # UOB
        "065": "https://www.hood11.com/uploads/phfakhahphfchapi.png", # ธนชาต
        "073": "https://www.hood11.com/uploads/aelfbaelfbeaf.png",  # LHBANK
        "076": "https://www.hood11.com/uploads/fiok.png",  # TISCO
        "080": "https://www.hood11.com/uploads/ph.png",  # ธอส.
        "084": "https://www.hood11.com/uploads/phfakhahilas.png",  # ธนาคารอิสลาม
    }
    
    # Default bank logo if not found
    default_logo = "https://www.hood11.com/uploads/logo.webp"
    
    return bank_logos.get(bank_code, default_logo)

def get_bank_name(bank_code: str) -> str:
    """Get bank name from bank code"""
    bank_names = {
        "002": "ธนาคารกรุงเทพ",
        "004": "ธนาคารกสิกรไทย", 
        "006": "ธนาคารกรุงไทย",
        "011": "ธนาคารทหารไทยธนชาต",
        "014": "ธนาคารไทยพาณิชย์",
        "025": "ธนาคารกรุงศรีอยุธยา",
        "030": "ธนาคารออมสิน",
        "034": "ธ.ก.ส.",
        "065": "ธนาคารธนชาต",
        "069": "ธนาคารเกียรตินาคินภัทร",
        "070": "ธนาคารไอซีบีซี",
        "071": "ธนาคารยูโอบี",
        "073": "ธนาคารแลนด์ แอนด์ เฮ้าส์",
        "076": "ธนาคารทิสโก้",
        "080": "ธนาคารอาคารสงเคราะห์",
        "084": "ธนาคารอิสลามแห่งประเทศไทย",
    }
    
    return bank_names.get(bank_code, "ธนาคาร")

def create_slip_flex_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """สร้าง Flex Message สำหรับแสดงผลสลิปแบบการ์ดสวยงาม พร้อมโลโก้ธนาคาร"""
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
        
        # ข้อมูลผู้โอน
        sender_name = (
            data.get("sender_name_th") or 
            data.get("sender_name_en") or 
            data.get("sender", "ไม่พบชื่อผู้โอน")
        )
        
        # ข้อมูลผู้รับ
        receiver_name = (
            data.get("receiver_name_th") or 
            data.get("receiver_name_en") or 
            data.get("receiver_name", data.get("receiver", "ไม่พบชื่อผู้รับ"))
        )
        
        # ข้อมูลธนาคาร
        sender_bank_id = data.get("sender_bank_id", "")
        receiver_bank_id = data.get("receiver_bank_id", "004")  # Default to KBANK
        
        sender_bank_short = data.get("sender_bank_short", data.get("sender_bank", ""))
        receiver_bank_short = data.get("receiver_bank_short", data.get("receiver_bank", ""))
        
        # ดึง URL โลโก้ธนาคาร
        sender_bank_logo = get_bank_logo_url(sender_bank_id)
        receiver_bank_logo = get_bank_logo_url(receiver_bank_id)
        
        # ดึงชื่อธนาคาร
        sender_bank_name = get_bank_name(sender_bank_id)
        receiver_bank_name = get_bank_name(receiver_bank_id)
        
        # กำหนดสีตามสถานะ
        header_color = "#00B900" if status == "success" else "#FFA500"
        status_text = "✅ ตรวจสอบสลิปสำเร็จ" if status == "success" else "🔄 สลิปนี้เคยถูกใช้แล้ว"
        
        # สร้าง Enhanced Flex Message with Bank Logos
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
                            "layout": "vertical",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": status_text,
                                    "color": "#ffffff",
                                    "size": "lg",
                                    "weight": "bold",
                                    "align": "center"
                                }
                            ],
                            "backgroundColor": header_color,
                            "paddingAll": "20px",
                            "paddingTop": "20px"
                        }
                    ],
                    "paddingAll": "0px"
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
                                    "text": "จำนวนเงิน",
                                    "size": "sm",
                                    "color": "#999999",
                                    "align": "center"
                                },
                                {
                                    "type": "text",
                                    "text": amount_display,
                                    "size": "4xl",
                                    "weight": "bold",
                                    "color": "#333333",
                                    "align": "center",
                                    "margin": "sm"
                                }
                            ],
                            "backgroundColor": "#F5F5F5",
                            "cornerRadius": "12px",
                            "paddingAll": "15px",
                            "margin": "md"
                        },
                        
                        # วันที่และเวลา
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
                                            "text": "📅 วันที่",
                                            "size": "xs",
                                            "color": "#999999"
                                        },
                                        {
                                            "type": "text",
                                            "text": date,
                                            "size": "sm",
                                            "color": "#333333",
                                            "weight": "bold",
                                            "margin": "xs"
                                        }
                                    ],
                                    "flex": 1
                                },
                                {
                                    "type": "separator",
                                    "margin": "sm"
                                },
                                {
                                    "type": "box",
                                    "layout": "vertical",
                                    "contents": [
                                        {
                                            "type": "text",
                                            "text": "⏰ เวลา",
                                            "size": "xs",
                                            "color": "#999999"
                                        },
                                        {
                                            "type": "text",
                                            "text": time_str or "N/A",
                                            "size": "sm",
                                            "color": "#333333",
                                            "weight": "bold",
                                            "margin": "xs"
                                        }
                                    ],
                                    "flex": 1,
                                    "paddingStart": "md"
                                }
                            ],
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
                                    "flex": 0
                                },
                                {
                                    "type": "text",
                                    "text": trans_ref,
                                    "size": "sm",
                                    "color": "#333333",
                                    "weight": "bold",
                                    "align": "end",
                                    "wrap": True
                                }
                            ],
                            "margin": "lg"
                        },
                        
                        # เส้นแบ่ง
                        {
                            "type": "separator",
                            "margin": "lg"
                        },
                        
                        # ข้อมูลผู้โอน พร้อมโลโก้ธนาคาร
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
                                            "url": sender_bank_logo,
                                            "size": "40px",
                                            "aspectMode": "fit",
                                            "flex": 0
                                        },
                                        {
                                            "type": "box",
                                            "layout": "vertical",
                                            "contents": [
                                                {
                                                    "type": "text",
                                                    "text": "ผู้โอนเงิน",
                                                    "size": "xs",
                                                    "color": "#999999"
                                                },
                                                {
                                                    "type": "text",
                                                    "text": sender_name,
                                                    "size": "sm",
                                                    "color": "#333333",
                                                    "weight": "bold",
                                                    "margin": "xs",
                                                    "wrap": True
                                                },
                                                {
                                                    "type": "text",
                                                    "text": sender_bank_name,
                                                    "size": "xs",
                                                    "color": "#666666",
                                                    "margin": "xs"
                                                }
                                            ],
                                            "paddingStart": "md",
                                            "flex": 1
                                        }
                                    ],
                                    "alignItems": "center"
                                }
                            ],
                            "margin": "lg",
                            "backgroundColor": "#FFF8E1",
                            "cornerRadius": "8px",
                            "paddingAll": "12px"
                        },
                        
                        # ลูกศรแสดงการโอน
                        {
                            "type": "text",
                            "text": "⬇️",
                            "align": "center",
                            "size": "xl",
                            "margin": "md"
                        },
                        
                        # ข้อมูลผู้รับ พร้อมโลโก้ธนาคาร
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
                                            "url": receiver_bank_logo,
                                            "size": "40px",
                                            "aspectMode": "fit",
                                            "flex": 0
                                        },
                                        {
                                            "type": "box",
                                            "layout": "vertical",
                                            "contents": [
                                                {
                                                    "type": "text",
                                                    "text": "ผู้รับเงิน",
                                                    "size": "xs",
                                                    "color": "#999999"
                                                },
                                                {
                                                    "type": "text",
                                                    "text": receiver_name,
                                                    "size": "sm",
                                                    "color": "#333333",
                                                    "weight": "bold",
                                                    "margin": "xs",
                                                    "wrap": True
                                                },
                                                {
                                                    "type": "text",
                                                    "text": receiver_bank_name,
                                                    "size": "xs",
                                                    "color": "#666666",
                                                    "margin": "xs"
                                                }
                                            ],
                                            "paddingStart": "md",
                                            "flex": 1
                                        }
                                    ],
                                    "alignItems": "center"
                                }
                            ],
                            "backgroundColor": "#E8F5E9",
                            "cornerRadius": "8px",
                            "paddingAll": "12px"
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
                            "text": "ตรวจสอบโดย Thunder Solution",
                            "size": "xs",
                            "color": "#999999",
                            "align": "center"
                        },
                        {
                            "type": "text",
                            "text": datetime.now(pytz.timezone('Asia/Bangkok')).strftime("%d/%m/%Y %H:%M:%S"),
                            "size": "xs",
                            "color": "#999999",
                            "align": "center",
                            "margin": "xs"
                        }
                    ],
                    "backgroundColor": "#F5F5F5",
                    "paddingAll": "10px"
                },
                "styles": {
                    "header": {
                        "backgroundColor": header_color
                    },
                    "body": {
                        "backgroundColor": "#FFFFFF"
                    },
                    "footer": {
                        "backgroundColor": "#F5F5F5"
                    }
                }
            }
        }
        
        return flex_message
        
    except Exception as e:
        logger.error(f"❌ Error creating flex message: {e}")
        return create_simple_text_message(result)


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
                        "color": "#ffffff",
                        "size": "lg",
                        "weight": "bold",
                        "align": "center"
                    }
                ],
                "backgroundColor": "#FF3333",
                "paddingAll": "20px"
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
                        "wrap": True,
                        "margin": "md"
                    },
                    {
                        "type": "separator",
                        "margin": "xl"
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
                            }
                        ],
                        "margin": "lg",
                        "backgroundColor": "#FFF3E0",
                        "cornerRadius": "8px",
                        "paddingAll": "12px"
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
🏦 ธนาคารผู้โอน: {data.get('sender_bank', 'N/A')}
🎯 ผู้รับ: {data.get('receiver_name', 'N/A')}
🏦 ธนาคารผู้รับ: {data.get('receiver_bank', 'N/A')}

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
