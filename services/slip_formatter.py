# services/slip_formatter.py - ฉบับปรับปรุงใหม่
import logging
from typing import Dict, Any
from datetime import datetime
import pytz

logger = logging.getLogger("slip_formatter")

# =========================
#  Brand & Asset Settings
# =========================

ASSETS = {
    "LOGO_DEFAULT": "https://www.hood11.com/uploads/logo.webp",
    "LOGO_FALLBACK": "https://www.hood11.com/uploads/logo.webp",
    "THUNDER_LOGO": "https://www.hood11.com/uploads/logo.webp",
}

# โลโก้ธนาคาร - ครบทุกธนาคารหลัก
BANK_LOGOS = {
    "002": "https://www.hood11.com/uploads/khungefl.png",          # BBL กรุงเทพ
    "004": "https://www.hood11.com/uploads/kikh.png",               # KBANK กสิกร
    "006": "https://www.hood11.com/uploads/khungaifs.png",          # KTB กรุงไทย
    "011": "https://www.hood11.com/uploads/ttb.png",                # TTB (เดิม TMB)
    "014": "https://www.hood11.com/uploads/aifslanichsscb.png",     # SCB ไทยพาณิชย์
    "025": "https://www.hood11.com/uploads/khunghhi2.png",          # BAY กรุงศรี
    "030": "https://www.hood11.com/uploads/sif.png",                # GSB ออมสิน
    "034": "https://www.hood11.com/uploads/phfakhahphk.png",        # BAAC ธกส.
    "069": "https://www.hood11.com/uploads/ekishpifakhif.png",      # KKP เกียรตินาคิน
    "070": "https://www.hood11.com/uploads/icbc.png",               # ICBC
    "071": "https://www.hood11.com/uploads/uob.png",                # UOB
    "073": "https://www.hood11.com/uploads/phfakhahphfchapi.png",   # Thanachart
    "076": "https://www.hood11.com/uploads/fiok.png",               # TISCO
    "080": "https://www.hood11.com/uploads/ph.png",                 # GHB ธอส.
    "081": "https://www.hood11.com/uploads/aelfbaelfbeaf.png",      # LH Bank
    "084": "https://www.hood11.com/uploads/phfakhahilas.png",       # Islamic Bank
}

# ชื่อธนาคารภาษาไทยเต็ม
BANK_NAMES_TH = {
    "002": "ธนาคารกรุงเทพ",
    "004": "ธนาคารกสิกรไทย", 
    "006": "ธนาคารกรุงไทย",
    "011": "ธนาคารทหารไทยธนชาต",
    "014": "ธนาคารไทยพาณิชย์",
    "025": "ธนาคารกรุงศรีอยุธยา",
    "030": "ธนาคารออมสิน",
    "034": "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร",
    "069": "ธนาคารเกียรตินาคินภัทร",
    "070": "ธนาคารไอซีบีซี (ไทย)",
    "071": "ธนาคารยูโอบี",
    "073": "ธนาคารธนชาต",
    "076": "ธนาคารทิสโก้",
    "080": "ธนาคารอาคารสงเคราะห์",
    "081": "ธนาคารแลนด์ แอนด์ เฮ้าส์",
    "084": "ธนาคารอิสลามแห่งประเทศไทย"
}

def get_bank_logo(bank_code: str = None, bank_name: str = None) -> str:
    """คืนค่า URL โลโก้ธนาคารจากรหัสหรือชื่อ"""
    if bank_code and bank_code in BANK_LOGOS:
        return BANK_LOGOS[bank_code]
    
    if bank_name:
        name = bank_name.upper()
        keymap = {
            "KTB": "006", "กรุงไทย": "006",
            "GSB": "030", "ออมสิน": "030",
            "KBANK": "004", "กสิกร": "004",
            "SCB": "014", "ไทยพาณิชย์": "014",
            "BBL": "002", "กรุงเทพ": "002",
            "BAY": "025", "กรุงศรี": "025",
            "TTB": "011", "TMB": "011", "ธนชาต": "011",
            "UOB": "071", "ยูโอบี": "071",
            "GHB": "080", "ธอส": "080",
            "TISCO": "076", "ทิสโก้": "076",
            "BAAC": "034", "ธกส": "034",
            "KKP": "069", "เกียรตินาคิน": "069",
            "LH": "081", "แลนด์": "081",
            "ISLAMIC": "084", "อิสลาม": "084",
            "ICBC": "070"
        }
        
        for key, code in keymap.items():
            if key in name:
                return BANK_LOGOS.get(code, ASSETS["LOGO_DEFAULT"])
    
    return ASSETS["LOGO_DEFAULT"]

def get_bank_full_name(bank_code: str = None, bank_short: str = None) -> str:
    """คืนค่าชื่อธนาคารภาษาไทยเต็ม"""
    if bank_code and bank_code in BANK_NAMES_TH:
        return BANK_NAMES_TH[bank_code]
    
    if bank_short:
        short_map = {
            "BBL": "ธนาคารกรุงเทพ",
            "KBANK": "ธนาคารกสิกรไทย",
            "KTB": "ธนาคารกรุงไทย",
            "SCB": "ธนาคารไทยพาณิชย์",
            "BAY": "ธนาคารกรุงศรีอยุธยา",
            "TTB": "ธนาคารทหารไทยธนชาต",
            "TMB": "ธนาคารทหารไทยธนชาต",
            "GSB": "ธนาคารออมสิน",
            "GHB": "ธนาคารอาคารสงเคราะห์"
        }
        return short_map.get(bank_short.upper(), bank_short)
    
    return "ธนาคาร"

def format_currency(amount: Any) -> str:
    """ฟอร์แมตราคาแบบไทย"""
    try:
        if isinstance(amount, (int, float)):
            return f"฿{amount:,.0f}" if float(amount).is_integer() else f"฿{amount:,.2f}"
        if isinstance(amount, str):
            v = float(amount.replace(",", ""))
            return f"฿{v:,.0f}" if v.is_integer() else f"฿{v:,.2f}"
    except:
        pass
    return f"฿{amount}"

def format_account_number(account: str) -> str:
    """แสดงเลขบัญชีทั้งหมด (ไม่ปิดบัง)"""
    if not account:
        return ""
    # แสดงเลขบัญชีเต็มตามที่ระบบส่งมา
    return account

def create_beautiful_slip_flex_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """สร้าง Flex Message แบบสวยงามพร้อมโลโก้ธนาคาร"""
    try:
        status = result.get("status", "error")
        data = result.get("data", {}) or {}
        
        # ดึงข้อมูลหลัก
        amount = data.get("amount", "0")
        amount_display = format_currency(amount)
        
        date = data.get("date", data.get("trans_date", ""))
        time_str = data.get("time", data.get("trans_time", ""))
        
        # Format datetime
        thai_tz = pytz.timezone('Asia/Bangkok')
        verification_time = datetime.now(thai_tz).strftime("%d/%m/%y, %H:%M น.")
        
        trans_ref = data.get("transRef", data.get("reference", "N/A"))
        
        # ข้อมูลผู้โอน
        sender_name = data.get("sender_name_th") or data.get("sender_name_en") or data.get("sender", "ไม่ระบุชื่อ")
        sender_acct = data.get("sender_account_number", "")
        sender_bank_code = data.get("sender_bank_id", "")
        sender_bank_short = data.get("sender_bank_short", data.get("sender_bank", ""))
        sender_logo = get_bank_logo(sender_bank_code, sender_bank_short)
        sender_bank_name = get_bank_full_name(sender_bank_code, sender_bank_short)
        
        # ข้อมูลผู้รับ
        receiver_name = data.get("receiver_name_th") or data.get("receiver_name_en") or data.get("receiver_name") or data.get("receiver", "ไม่ระบุชื่อ")
        receiver_acct = data.get("receiver_account_number", "")
        receiver_bank_code = data.get("receiver_bank_id", "")
        receiver_bank_short = data.get("receiver_bank_short", data.get("receiver_bank", ""))
        receiver_logo = get_bank_logo(receiver_bank_code, receiver_bank_short)
        receiver_bank_name = get_bank_full_name(receiver_bank_code, receiver_bank_short)
        
        # Header style ตาม status
        if status == "success":
            header_text = "✅ สลิปถูกต้อง"
            header_color = "#22c55e"
            header_bg = "#f0fdf4"
            status_icon = "✅"
        elif status == "duplicate":
            header_text = "🔄 สลิปซ้ำ"
            header_color = "#f59e0b"
            header_bg = "#fef3c7"
            status_icon = "🔄"
            # นับจำนวนครั้งที่ส่งสลิปซ้ำ (ถ้ามีข้อมูล)
            duplicate_count = data.get("duplicate_count", 2)
        else:
            header_text = "❌ ตรวจสอบไม่ผ่าน"
            header_color = "#ef4444"
            header_bg = "#fef2f2"
            status_icon = "❌"
        
        # สร้าง body contents
        contents_body = [
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
                        "align": "center",
                        "color": "#1f2937"
                    },
                    {
                        "type": "text",
                        "text": f"{date} {time_str}",
                        "size": "sm",
                        "align": "center",
                        "color": "#6b7280",
                        "margin": "xs"
                    }
                ],
                "backgroundColor": "#ffffff",
                "cornerRadius": "12px",
                "paddingAll": "20px",
                "borderWidth": "1px",
                "borderColor": "#e5e7eb"
            },
            
            {"type": "separator", "margin": "lg", "color": "#e5e7eb"},
            
            # ผู้โอน Section
            {
                "type": "text",
                "text": "ผู้โอน",
                "size": "sm",
                "color": "#9ca3af",
                "margin": "lg",
                "weight": "bold"
            },
            {
                "type": "box",
                "layout": "horizontal",
                "contents": [
                    # โลโก้ธนาคาร
                    {
                        "type": "image",
                        "url": sender_logo,
                        "size": "50px",
                        "aspectRatio": "1:1",
                        "flex": 0
                    },
                    # ข้อมูลผู้โอน
                    {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {
                                "type": "text",
                                "text": sender_name[:40],
                                "size": "sm",
                                "weight": "bold",
                                "color": "#111827",
                                "wrap": True
                            },
                            {
                                "type": "text",
                                "text": sender_bank_name,
                                "size": "xs",
                                "color": "#4b5563",
                                "margin": "xxs"
                            },
                            {
                                "type": "text",
                                "text": f"บัญชี: {format_account_number(sender_acct)}" if sender_acct else "ไม่ระบุเลขบัญชี",
                                "size": "xs",
                                "color": "#6b7280",
                                "margin": "xxs"
                            }
                        ],
                        "margin": "md",
                        "spacing": "xs",
                        "flex": 1
                    }
                ],
                "margin": "sm",
                "paddingAll": "10px",
                "backgroundColor": "#f9fafb",
                "cornerRadius": "8px"
            },
            
            # Arrow
            {
                "type": "text",
                "text": "⬇️",
                "align": "center",
                "color": "#9ca3af",
                "margin": "md",
                "size": "lg"
            },
            
            # ผู้รับ Section
            {
                "type": "text",
                "text": "ผู้รับ",
                "size": "sm",
                "color": "#9ca3af",
                "weight": "bold"
            },
            {
                "type": "box",
                "layout": "horizontal",
                "contents": [
                    # โลโก้ธนาคาร
                    {
                        "type": "image",
                        "url": receiver_logo,
                        "size": "50px",
                        "aspectRatio": "1:1",
                        "flex": 0
                    },
                    # ข้อมูลผู้รับ
                    {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {
                                "type": "text",
                                "text": receiver_name[:40],
                                "size": "sm",
                                "weight": "bold",
                                "color": "#111827",
                                "wrap": True
                            },
                            {
                                "type": "text",
                                "text": receiver_bank_name,
                                "size": "xs",
                                "color": "#4b5563",
                                "margin": "xxs"
                            },
                            {
                                "type": "text",
                                "text": f"บัญชี: {format_account_number(receiver_acct)}" if receiver_acct else "ไม่ระบุเลขบัญชี",
                                "size": "xs",
                                "color": "#6b7280",
                                "margin": "xxs"
                            }
                        ],
                        "margin": "md",
                        "spacing": "xs",
                        "flex": 1
                    }
                ],
                "margin": "sm",
                "paddingAll": "10px",
                "backgroundColor": "#f9fafb",
                "cornerRadius": "8px"
            },
            
            {"type": "separator", "margin": "lg", "color": "#e5e7eb"},
            
            # Reference
            {
                "type": "box",
                "layout": "horizontal",
                "contents": [
                    {
                        "type": "text",
                        "text": "เลขอ้างอิง",
                        "size": "xs",
                        "color": "#6b7280",
                        "flex": 3
                    },
                    {
                        "type": "text",
                        "text": str(trans_ref),
                        "size": "xs",
                        "color": "#111827",
                        "flex": 7,
                        "wrap": True,
                        "weight": "bold"
                    }
                ],
                "margin": "md"
            }
        ]
        
        # เพิ่มข้อความแจ้งเตือนสำหรับสลิปซ้ำ
        if status == "duplicate":
            duplicate_count = data.get("duplicate_count", 2)
            contents_body.append({
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "text",
                        "text": f"⚠️ สลิปนี้ถูกใช้แล้ว {duplicate_count} ครั้ง",
                        "size": "sm",
                        "weight": "bold",
                        "align": "center",
                        "color": "#dc2626"
                    }
                ],
                "backgroundColor": "#fef2f2",
                "cornerRadius": "8px",
                "paddingAll": "12px",
                "margin": "lg",
                "borderWidth": "1px",
                "borderColor": "#fca5a5"
            })
        
        # สร้าง Flex Message
        flex_message = {
            "type": "flex",
            "altText": f"{status_icon} {header_text} {amount_display}",
            "contents": {
                "type": "bubble",
                "size": "mega",
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
                                    "text": header_text,
                                    "size": "lg",
                                    "weight": "bold",
                                    "color": header_color
                                }
                            ]
                        },
                        {
                            "type": "text",
                            "text": "ตรวจสอบโดย Thunder API",
                            "size": "xxs",
                            "color": "#6b7280",
                            "margin": "xs"
                        }
                    ],
                    "backgroundColor": header_bg,
                    "paddingAll": "20px"
                },
                "body": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": contents_body,
                    "backgroundColor": "#ffffff",
                    "paddingAll": "20px",
                    "spacing": "sm"
                },
                "footer": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "image",
                                    "url": ASSETS["THUNDER_LOGO"],
                                    "size": "xs",
                                    "flex": 0,
                                    "aspectRatio": "3:1"
                                },
                                {
                                    "type": "text",
                                    "text": f"ตรวจสอบเมื่อ {verification_time}",
                                    "size": "xxs",
                                    "color": "#9ca3af",
                                    "align": "end",
                                    "gravity": "center"
                                }
                            ]
                        }
                    ],
                    "backgroundColor": "#f9fafb",
                    "paddingAll": "12px"
                }
            }
        }
        
        return flex_message
        
    except Exception as e:
        logger.error(f"❌ Error creating flex message: {e}", exc_info=True)
        return create_simple_text_message(result)

def create_simple_text_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """สร้างข้อความ text ธรรมดา (fallback)"""
    try:
        status = result.get("status", "error")
        data = result.get("data", {})
        
        if status == "success":
            text = f"✅ สลิปถูกต้อง\n\n"
        elif status == "duplicate":
            text = f"🔄 สลิปซ้ำ\n\n"
        else:
            text = f"❌ ตรวจสอบไม่ผ่าน\n\n"
        
        if data:
            text += f"💰 จำนวน: {format_currency(data.get('amount', 0))}\n"
            text += f"📅 วันที่: {data.get('date', 'N/A')} {data.get('time', '')}\n"
            text += f"🔢 อ้างอิง: {data.get('reference', 'N/A')}\n"
            text += f"👤 ผู้โอน: {data.get('sender_name_th', data.get('sender', 'N/A'))}\n"
            text += f"🎯 ผู้รับ: {data.get('receiver_name_th', data.get('receiver_name', 'N/A'))}"
        else:
            text += result.get("message", "ไม่มีข้อมูล")
        
        return {
            "type": "text",
            "text": text
        }
    except Exception as e:
        logger.error(f"❌ Error creating text message: {e}")
        return {
            "type": "text",
            "text": "❌ เกิดข้อผิดพลาดในการแสดงผล"
        }

def create_error_flex_message(error_msg: str) -> Dict[str, Any]:
    """สร้าง Flex Message สำหรับแสดง error"""
    try:
        return {
            "type": "flex",
            "altText": f"❌ {error_msg}",
            "contents": {
                "type": "bubble",
                "body": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {
                            "type": "text",
                            "text": "❌ เกิดข้อผิดพลาด",
                            "weight": "bold",
                            "size": "lg",
                            "color": "#ef4444",
                            "align": "center"
                        },
                        {
                            "type": "text",
                            "text": error_msg,
                            "size": "sm",
                            "color": "#6b7280",
                            "align": "center",
                            "margin": "lg",
                            "wrap": True
                        }
                    ],
                    "paddingAll": "20px"
                }
            }
        }
    except:
        return create_simple_text_message({"status": "error", "message": error_msg})
