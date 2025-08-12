import logging
from typing import Dict, Any, Union
from datetime import datetime
import pytz
import re

logger = logging.getLogger("slip_formatter")

# -----------------------------
# Bank logos mapping
# -----------------------------
BANK_LOGOS = {
    "002": "https://www.hood11.com/uploads/khungefl.png",   # BBL
    "004": "https://www.hood11.com/uploads/kikh.png",        # KBANK
    "006": "https://www.hood11.com/uploads/khungaifs.png",   # KTB
    "011": "https://www.hood11.com/uploads/ttb.png",         # TTB
    "014": "https://www.hood11.com/uploads/aifslanichsscb.png",  # SCB
    "025": "https://www.hood11.com/uploads/khunghhi2.png",   # BAY
    "030": "https://www.hood11.com/uploads/sif.png",         # GSB
    "034": "https://www.hood11.com/uploads/phfakhahphk.png", # BAAC
    "069": "https://www.hood11.com/uploads/ekishpifakhif.png", # KKP
    "070": "https://www.hood11.com/uploads/icbc.png",        # ICBC
    "071": "https://www.hood11.com/uploads/uob.png",         # UOB
    "073": "https://www.hood11.com/uploads/phfakhahphfchapi.png", # Thanachart
    "076": "https://www.hood11.com/uploads/fiok.png",        # TISCO
    "080": "https://www.hood11.com/uploads/ph.png",          # GHB
    "081": "https://www.hood11.com/uploads/aelfbaelfbeaf.png", # LH Bank
    "084": "https://www.hood11.com/uploads/phfakhahilas.png",  # Islamic
}

THUNDER_LOGO = "https://www.hood11.com/uploads/logo.webp"  # สำรองใช้โลโก้ของคุณได้

# -----------------------------
# Helpers
# -----------------------------
def get_bank_logo(bank_code: str = None, bank_name: str = None) -> str:
    """Get bank logo URL from bank code or name (fallback by name)."""
    if bank_code and bank_code in BANK_LOGOS:
        return BANK_LOGOS[bank_code]

    if bank_name:
        bn = bank_name.upper()
        pairs = [
            ("KTB", "006"), ("กรุงไทย", "006"),
            ("GSB", "030"), ("ออมสิน", "030"),
            ("KBANK", "004"), ("กสิกร", "004"),
            ("SCB", "014"), ("ไทยพาณิชย์", "014"),
            ("BBL", "002"), ("กรุงเทพ", "002"),
            ("BAY", "025"), ("กรุงศรี", "025"),
            ("TMB", "011"), ("TTB", "011"), ("ทีเอ็มบีธนชาต", "011"),
            ("UOB", "071"), ("ยูโอบี", "071"),
            ("GHB", "080"), ("ธอส", "080"),
            ("TISCO", "076"), ("ทิสโก้", "076"),
            ("BAAC", "034"), ("ธกส", "034"),
            ("KKP", "069"), ("เกียรตินาคิน", "069"),
            ("LAND AND HOUSES", "081"), ("แลนด์แอนด์เฮ้าส์", "081"),
            ("ISLAMIC", "084"), ("อิสลาม", "084"),
        ]
        for key, code in pairs:
            if key in bn or key in bank_name:
                return BANK_LOGOS.get(code, "https://www.hood11.com/uploads/logo.webp")

    return "https://www.hood11.com/uploads/logo.webp"

def format_currency(amount: Union[str, int, float]) -> str:
    """Format amount as Thai currency."""
    try:
        if isinstance(amount, (int, float)):
            return f"฿{amount:,.2f}"
        if isinstance(amount, str):
            amt = float(amount.replace(",", ""))
            return f"฿{amt:,.2f}"
    except Exception:
        pass
    return f"฿{amount}"

def _only_digits(s: str) -> str:
    return re.sub(r"\D", "", s or "")

def format_account_with_dashes(acc: str) -> str:
    """
    จัดรูปแบบเลขบัญชีไทยให้มีขีด:
      - ยอดนิยม: 10 หลัก -> xxx-x-xxxxx-x
      - 9 หลัก  -> xxx-x-xxxx-x
      - อย่างอื่น: แบ่ง 3-1-ส่วนกลาง-1 ตามความยาว
    """
    digits = _only_digits(acc)
    n = len(digits)
    if n == 10:  # 3-1-5-1
        return f"{digits[0:3]}-{digits[3]}-{digits[4:9]}-{digits[9]}"
    if n == 9:   # 3-1-4-1
        return f"{digits[0:3]}-{digits[3]}-{digits[4:8]}-{digits[8]}"
    if n >= 7:
        # สร้างรูปแบบทั่วไป: 3-1-(กลาง)-1
        mid = digits[4:-1]
        return f"{digits[0:3]}-{digits[3]}-{mid}-{digits[-1]}"
    # น้อยกว่านี้แสดงตามเดิม
    return acc or ""

def mask_account_formatted(acc: str, visible_tail: int = 4) -> str:
    """
    มาสก์เลขบัญชี แต่ยังคงรูปแบบขีด:
      - เหลือท้ายไว้ visible_tail หลัก
      - ตัวที่เหลือแทนด้วย 'x'
    """
    formatted = format_account_with_dashes(acc)
    # มาสก์เฉพาะตัวเลข ไม่มาสก์ขีด
    digits = [c for c in formatted if c.isdigit()]
    if not digits:
        return formatted
    keep = max(1, min(len(digits), visible_tail))
    to_mask = len(digits) - keep

    result = []
    masked_count = 0
    kept_count = 0
    for ch in formatted:
        if ch.isdigit():
            if masked_count < to_mask:
                result.append("x")
                masked_count += 1
            else:
                result.append(digits[to_mask + kept_count])
                kept_count += 1
        else:
            result.append(ch)
    return "".join(result)

# -----------------------------
# Flex builders
# -----------------------------
def create_beautiful_slip_flex_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """สร้าง Flex Message แบบสวยงามพร้อมโลโก้ธนาคาร + แสดงเลขบัญชี (มาสก์)"""
    try:
        status = (result or {}).get("status")
        data = (result or {}).get("data", {}) or {}
        if not data:
            return create_error_flex_message(result.get("message", "ไม่สามารถดึงข้อมูลสลิปได้"))

        amount = data.get("amount", "0")
        amount_display = format_currency(amount)

        # วันที่/เวลาในสลิป
        date = data.get("date", data.get("trans_date", "")) or ""
        time_str = data.get("time", data.get("trans_time", "")) or ""

        # เวลาตรวจสอบปัจจุบัน
        thai_tz = pytz.timezone("Asia/Bangkok")
        verification_time = datetime.now(thai_tz).strftime("%d %b %y, %H:%M น.")

        # อ้างอิง
        trans_ref = data.get("transRef") or data.get("reference") or "-"

        # ชื่อ/บัญชี/ธนาคาร
        sender_name = data.get("sender_name_th") or data.get("sender_name_en") or data.get("sender") or "ไม่ระบุชื่อ"
        receiver_name = data.get("receiver_name_th") or data.get("receiver_name_en") or data.get("receiver_name") or data.get("receiver") or "ไม่ระบุชื่อ"

        sender_acc = data.get("sender_account_number", "") or data.get("sender_account", "")
        receiver_acc = data.get("receiver_account_number", "") or data.get("receiver_account", "")

        sender_bank_code = data.get("sender_bank_id", "")
        sender_bank_name = data.get("sender_bank_short", data.get("sender_bank", "")) or ""
        receiver_bank_code = data.get("receiver_bank_id", "")
        receiver_bank_name = data.get("receiver_bank_short", data.get("receiver_bank", "")) or ""

        sender_logo = get_bank_logo(sender_bank_code, sender_bank_name)
        receiver_logo = get_bank_logo(receiver_bank_code, receiver_bank_name)

        # มาสก์พร้อมขีด
        sender_acc_masked = mask_account_formatted(sender_acc, visible_tail=4) if sender_acc else ""
        receiver_acc_masked = mask_account_formatted(receiver_acc, visible_tail=4) if receiver_acc else ""

        # สีหัวข้อ/สถานะ
        if status == "success":
            header_color = "#00B900"
            status_text = "สลิปถูกต้อง"
            header_bg = "#FFF4EE"  # ไล่เฉดอุ่นๆ ใกล้ภาพตัวอย่าง
            status_icon = "✅"
        elif status == "duplicate":
            header_color = "#FFA500"
            status_text = "สลิปซ้ำ"
            header_bg = "#FFF8E6"
            status_icon = "🔄"
        else:
            header_color = "#FF4444"
            status_text = "ตรวจสอบไม่ผ่าน"
            header_bg = "#FFECEC"
            status_icon = "❌"

        # เนื้อหา Flex
        bubble = {
            "type": "bubble",
            "size": "mega",
            "header": {
                "type": "box",
                "layout": "horizontal",
                "contents": [
                    {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {
                                "type": "box",
                                "layout": "horizontal",
                                "contents": [
                                    {"type": "text", "text": status_icon, "size": "xl", "flex": 0},
                                    {
                                        "type": "text",
                                        "text": status_text,
                                        "size": "lg",
                                        "weight": "bold",
                                        "color": header_color,
                                        "margin": "sm",
                                        "gravity": "center",
                                    },
                                ],
                            },
                            {
                                "type": "text",
                                "text": "ตรวจสอบโดย Thunder",
                                "size": "xxs",
                                "color": "#8E8E93",
                                "margin": "xs",
                            },
                        ],
                    }
                ],
                "backgroundColor": header_bg,
                "paddingAll": "16px",
            },
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    # Amount + slip time
                    {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {"type": "text", "text": amount_display, "size": "3xl", "weight": "bold", "align": "start"},
                            {
                                "type": "text",
                                "text": f"{date} เวลา {time_str}".strip(),
                                "size": "sm",
                                "color": "#666666",
                                "margin": "xs",
                            },
                        ],
                    },
                    {"type": "separator", "margin": "lg"},

                    # Sender
                    {"type": "text", "text": "ผู้โอน", "size": "sm", "color": "#8E8E93", "margin": "lg"},
                    {
                        "type": "box",
                        "layout": "horizontal",
                        "contents": [
                            {"type": "image", "url": sender_logo, "size": "40px", "aspectRatio": "1:1", "flex": 0},
                            {
                                "type": "box",
                                "layout": "vertical",
                                "contents": [
                                    {
                                        "type": "text",
                                        "text": sender_name[:36],
                                        "size": "sm",
                                        "weight": "bold",
                                        "wrap": True,
                                    },
                                    {
                                        "type": "text",
                                        "text": f"{sender_bank_name}  {sender_acc_masked}".strip(),
                                        "size": "xs",
                                        "color": "#666666",
                                        "wrap": True,
                                    },
                                ],
                                "margin": "md",
                                "spacing": "xs",
                            },
                        ],
                        "margin": "sm",
                    },

                    # Arrow
                    {"type": "text", "text": "⬇", "align": "center", "color": "#C7C7CC", "margin": "md"},

                    # Receiver
                    {"type": "text", "text": "ผู้รับ", "size": "sm", "color": "#8E8E93"},
                    {
                        "type": "box",
                        "layout": "horizontal",
                        "contents": [
                            {"type": "image", "url": receiver_logo, "size": "40px", "aspectRatio": "1:1", "flex": 0},
                            {
                                "type": "box",
                                "layout": "vertical",
                                "contents": [
                                    {
                                        "type": "text",
                                        "text": receiver_name[:36],
                                        "size": "sm",
                                        "weight": "bold",
                                        "wrap": True,
                                    },
                                    {
                                        "type": "text",
                                        "text": f"{receiver_bank_name}  {receiver_acc_masked}".strip(),
                                        "size": "xs",
                                        "color": "#666666",
                                        "wrap": True,
                                    },
                                ],
                                "margin": "md",
                                "spacing": "xs",
                            },
                        ],
                        "margin": "sm",
                    },

                    {"type": "separator", "margin": "lg"},

                    # Reference
                    {
                        "type": "box",
                        "layout": "horizontal",
                        "contents": [
                            {"type": "text", "text": "เลขอ้างอิง", "size": "xs", "color": "#666666", "flex": 3},
                            {"type": "text", "text": trans_ref, "size": "xs", "flex": 7, "wrap": True},
                        ],
                        "margin": "md",
                    },
                ],
            },
            "footer": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "box",
                        "layout": "horizontal",
                        "contents": [
                            {"type": "image", "url": THUNDER_LOGO, "size": "20px", "flex": 0},
                            {
                                "type": "text",
                                "text": f"ตรวจสอบเมื่อ {verification_time}",
                                "size": "xxs",
                                "color": "#8E8E93",
                                "margin": "sm",
                            },
                        ],
                        "spacing": "sm",
                        "alignItems": "center",
                        "justifyContent": "center",
                    }
                ],
                "backgroundColor": "#F8F9FA",
            },
        }

        # ข้อความเตือนกรณีสลิปซ้ำ
        if status == "duplicate":
            bubble["body"]["contents"].append(
                {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {
                            "type": "text",
                            "text": "สลิปนี้เคยถูกใช้แล้ว",
                            "size": "sm",
                            "color": "#B26A00",
                            "weight": "bold",
                            "align": "center",
                        }
                    ],
                    "backgroundColor": "#FFF3CD",
                    "cornerRadius": "10px",
                    "paddingAll": "10px",
                    "margin": "lg",
                }
            )

        return {
            "type": "flex",
            "altText": f"{status_text} {amount_display}",
            "contents": bubble,
        }

    except Exception as e:
        logger.error(f"❌ Error creating flex message: {e}", exc_info=True)
        return create_simple_text_message(result)

# -----------------------------
# Fallbacks
# -----------------------------
def create_simple_text_message(result: Dict[str, Any]) -> Dict[str, Any]:
    status = (result or {}).get("status")
    data = (result or {}).get("data", {}) or {}

    if status == "success":
        amount = format_currency(data.get("amount", 0))
        sender_acc = mask_account_formatted(data.get("sender_account_number", "") or data.get("sender_account", ""))
        receiver_acc = mask_account_formatted(data.get("receiver_account_number", "") or data.get("receiver_account", ""))

        txt = (
            "✅ สลิปถูกต้อง ตรวจสอบสำเร็จ\n"
            "━━━━━━━━━━━━━━━━━━━━\n"
            f"💰 จำนวนเงิน: {amount}\n"
            f"📅 วันที่: {data.get('date', 'N/A')} {data.get('time', '')}\n"
            f"🔢 เลขอ้างอิง: {data.get('transRef', data.get('reference', 'N/A'))}\n\n"
            f"👤 ผู้โอน: {data.get('sender', data.get('sender_name_th', 'N/A'))}\n"
            f"🏦 {data.get('sender_bank', data.get('sender_bank_short', ''))} {sender_acc}\n\n"
            f"🎯 ผู้รับ: {data.get('receiver_name', data.get('receiver_name_th', 'N/A'))}\n"
            f"🏦 {data.get('receiver_bank', data.get('receiver_bank_short', ''))} {receiver_acc}\n"
            "━━━━━━━━━━━━━━━━━━━━\n"
            "✓ ตรวจสอบโดย Thunder"
        )
    elif status == "duplicate":
        amount = format_currency(data.get("amount", 0))
        txt = (
            "🔄 สลิปนี้เคยถูกใช้แล้ว\n"
            "━━━━━━━━━━━━━━━━━━━━\n"
            f"💰 จำนวน: {amount}\n"
            f"🔢 เลขอ้างอิง: {data.get('transRef', data.get('reference', 'N/A'))}\n"
            "━━━━━━━━━━━━━━━━━━━━\n"
            "⚠️ กรุณาใช้สลิปใหม่"
        )
    else:
        txt = (
            "❌ ไม่สามารถตรวจสอบสลิปได้\n\n"
            f"{(result or {}).get('message', 'เกิดข้อผิดพลาด')}\n\n"
            "💡 กรุณาตรวจสอบ:\n"
            "• รูปสลิปชัดเจน\n"
            "• เป็นสลิปจริง\n"
            "• ลองถ่ายใหม่"
        )

    return {"type": "text", "text": txt}

def create_error_flex_message(error_message: str) -> Dict[str, Any]:
    return {
        "type": "flex",
        "altText": "❌ ไม่สามารถตรวจสอบสลิปได้",
        "contents": {
            "type": "bubble",
            "size": "kilo",
            "header": {
                "type": "box",
                "layout": "horizontal",
                "contents": [
                    {"type": "text", "text": "❌", "size": "xl", "flex": 0},
                    {
                        "type": "text",
                        "text": "ไม่สามารถตรวจสอบสลิปได้",
                        "weight": "bold",
                        "size": "md",
                        "color": "#CC0000",
                        "margin": "md",
                        "gravity": "center",
                    },
                ],
                "backgroundColor": "#FFE5E5",
                "paddingAll": "15px",
            },
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {"type": "text", "text": error_message, "size": "sm", "color": "#666666", "wrap": True},
                    {"type": "separator", "margin": "lg"},
                    {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {"type": "text", "text": "💡 คำแนะนำ:", "size": "sm", "weight": "bold", "color": "#333333"},
                            {"type": "text", "text": "• ตรวจสอบให้แน่ใจว่าสลิปชัดเจน", "size": "xs", "color": "#666666", "margin": "sm"},
                            {"type": "text", "text": "• ตรวจสอบว่าเป็นสลิปจริง", "size": "xs", "color": "#666666", "margin": "xs"},
                            {"type": "text", "text": "• ลองถ่ายรูปใหม่หากไม่ชัด", "size": "xs", "color": "#666666", "margin": "xs"},
                            {"type": "text", "text": "• ตรวจสอบว่ามี QR Code ในสลิป", "size": "xs", "color": "#666666", "margin": "xs"},
                        ],
                        "backgroundColor": "#FFF9E6",
                        "paddingAll": "12px",
                        "cornerRadius": "8px",
                        "margin": "lg",
                    },
                ],
            },
        },
    }
