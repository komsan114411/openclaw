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
    "THUNDER_LOGO": "https://www.hood11.com/uploads/logo.webp",  # ปรับได้ตามของจริง
}

# โลโก้ธนาคาร (อ้างอิง URL ที่ให้มา)
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
    "073": "https://www.hood11.com/uploads/phfakhahphfchapi.png",   # Thanachart (ประวัติ)
    "076": "https://www.hood11.com/uploads/fiok.png",               # TISCO
    "080": "https://www.hood11.com/uploads/ph.png",                 # GHB ธอส.
    "081": "https://www.hood11.com/uploads/aelfbaelfbeaf.png",      # LH Bank
    "084": "https://www.hood11.com/uploads/phfakhahilas.png",       # Islamic Bank
}

def get_bank_logo(bank_code: str = None, bank_name: str = None) -> str:
    """คืนค่า URL โลโก้ธนาคารจากรหัสหรือชื่อ (มี fallback)"""
    if bank_code and bank_code in BANK_LOGOS:
        return BANK_LOGOS[bank_code]

    if bank_name:
        name = bank_name.upper()
        keymap = [
            (["KTB", "กรุงไทย"], "006"),
            (["GSB", "ออมสิน"], "030"),
            (["KBANK", "กสิกร"], "004"),
            (["SCB", "ไทยพาณิชย์"], "014"),
            (["BBL", "กรุงเทพ"], "002"),
            (["BAY", "กรุงศรี"], "025"),
            (["TTB", "TMB", "ทีเอ็มบีธนชาต"], "011"),
            (["UOB", "ยูโอบี"], "071"),
            (["GHB", "ธอส"], "080"),
            (["TISCO", "ทิสโก้"], "076"),
            (["BAAC", "ธกส"], "034"),
            (["KKP", "เกียรตินาคิน"], "069"),
            (["LAND", "LH", "แลนด์แอนด์เฮ้าส์"], "081"),
            (["ISLAMIC", "อิสลาม"], "084"),
        ]
        for keys, code in keymap:
            if any(k in name for k in keys):
                return BANK_LOGOS.get(code, ASSETS["LOGO_DEFAULT"])

    return ASSETS["LOGO_DEFAULT"]

def format_currency(amount: Any) -> str:
    """ฟอร์แมตราคาแบบไทย"""
    try:
        if isinstance(amount, (int, float)):
            return f"฿{amount:,.0f}" if float(amount).is_integer() else f"฿{amount:,.2f}"
        if isinstance(amount, str):
            v = float(amount.replace(",", ""))
            return f"฿{v:,.0f}" if v.is_integer() else f"฿{v:,.2f}"
    except Exception:
        pass
    return f"฿{amount}"

def mask_account_thai_style(acct: str) -> str:
    """
    ปิดบังเลขบัญชีรูปแบบ: XXX-X-XX####-# (โชว์ท้าย 5 ตัวแบบภาพตัวอย่าง)
    ถ้าสั้นเกินไปจะคืนค่าตามเดิม
    """
    if not acct or len(acct) < 7:
        return acct
    tail5 = acct[-5:]
    return f"XXX-X-XX{tail5[:-1]}-{tail5[-1]}"

def th_datetime_label(date_str: str, time_str: str) -> str:
    """แปลงเป็นรูปแบบ '13 ส.ค. 68, 00:06 น.' หากข้อมูลไม่ครบจะคืนตามที่มี"""
    try:
        # รองรับทั้งรูปแบบ 'YYYY-MM-DD' หรือ 'DD/MM/YYYY' เท่าที่พบทั่วไป
        # ถ้า parse ไม่ได้จะคืนข้อความเดิม
        month_th = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
                    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
        d, m, y = None, None, None

        if "/" in date_str:  # DD/MM/YYYY
            d_s, m_s, y_s = date_str.split("/")
            d, m, y = int(d_s), int(m_s), int(y_s)
        elif "-" in date_str:  # YYYY-MM-DD
            y_s, m_s, d_s = date_str.split("-")
            d, m, y = int(d_s), int(m_s), int(y_s)
        else:
            return f"{date_str} {time_str}".strip()

        y = (y - 2000) if y > 2000 else (y % 100)
        label = f"{d} {month_th[m-1]} {y:02d}"
        t = time_str.strip().replace(".", ":")
        t = t if t else ""
        return f"{label}, {t} น." if t else label
    except Exception:
        return f"{date_str} {time_str}".strip()

def create_beautiful_slip_flex_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """Flex Message โฉมใหม่ โทนการ์ดสลิปแบบตัวอย่าง"""
    try:
        status = (result or {}).get("status", "error")
        data = (result or {}).get("data", {}) or {}

        # Core fields
        amount = data.get("amount", "0")
        amount_display = format_currency(amount)

        date = data.get("date", data.get("trans_date", "")) or ""
        time_str = data.get("time", data.get("trans_time", "")) or ""
        date_label = th_datetime_label(date, time_str)

        thai_tz = pytz.timezone('Asia/Bangkok')
        verification_time = datetime.now(thai_tz).strftime("%d/%m/%y, %H:%M น.")

        trans_ref = data.get("transRef", data.get("reference", "N/A"))

        sender_name = data.get("sender_name_th") or data.get("sender_name_en") or data.get("sender", "ไม่ระบุชื่อ")
        receiver_name = data.get("receiver_name_th") or data.get("receiver_name_en") or data.get("receiver_name") or data.get("receiver", "ไม่ระบุชื่อ")

        sender_acct = data.get("sender_account_number", "")
        receiver_acct = data.get("receiver_account_number", "")
        sender_bank_code = data.get("sender_bank_id", "")
        receiver_bank_code = data.get("receiver_bank_id", "")
        sender_bank_name = data.get("sender_bank_short", data.get("sender_bank", ""))
        receiver_bank_name = data.get("receiver_bank_short", data.get("receiver_bank", ""))

        sender_logo = get_bank_logo(sender_bank_code, sender_bank_name)
        receiver_logo = get_bank_logo(receiver_bank_code, receiver_bank_name)

        fee = data.get("fee", 0)

        # Header style by status
        if status == "success":
            header_text = "สลิปถูกต้อง"
            header_color = "#13B36B"
            header_bg = "#FFF2E7"   # โทนส้มอ่อนคล้ายตัวอย่าง
            status_icon = "✅"
        elif status == "duplicate":
            header_text = "สลิปซ้ำ"
            header_color = "#D48600"
            header_bg = "#FFF3CD"
            status_icon = "🔄"
        else:
            header_text = "ตรวจสอบไม่ผ่าน"
            header_color = "#C0392B"
            header_bg = "#FDECEA"
            status_icon = "❌"

        contents_body = [
            # Amount card
            {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {"type": "text", "text": amount_display, "size": "4xl", "weight": "bold", "align": "center", "color": "#222222"},
                    {"type": "text", "text": date_label, "size": "sm", "align": "center", "color": "#6B7280", "margin": "xs"},
                ],
                "backgroundColor": "#FFFFFF",
                "cornerRadius": "16px",
                "paddingAll": "16px"
            },
            {"type": "separator", "margin": "lg"},

            # Sender
            {"type": "text", "text": "ผู้โอน", "size": "sm", "color": "#9CA3AF", "margin": "lg"},
            {
                "type": "box",
                "layout": "horizontal",
                "contents": [
                    {"type": "image", "url": sender_logo, "size": "40px", "aspectRatio": "1:1", "flex": 0},
                    {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {"type": "text", "text": sender_name[:40], "size": "sm", "weight": "bold", "color": "#111827"},
                            {"type": "text", "text": f"{sender_bank_name} {mask_account_thai_style(sender_acct) if sender_acct else ''}", "size": "xs", "color": "#6B7280"}
                        ],
                        "margin": "md", "spacing": "xs"
                    }
                ],
                "margin": "sm"
            },

            # Arrow
            {"type": "text", "text": "⬇", "align": "center", "color": "#D1D5DB", "margin": "md"},

            # Receiver
            {"type": "text", "text": "ผู้รับ", "size": "sm", "color": "#9CA3AF"},
            {
                "type": "box",
                "layout": "horizontal",
                "contents": [
                    {"type": "image", "url": receiver_logo, "size": "40px", "aspectRatio": "1:1", "flex": 0},
                    {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {"type": "text", "text": receiver_name[:40], "size": "sm", "weight": "bold", "color": "#111827"},
                            {"type": "text", "text": f"{receiver_bank_name} {mask_account_thai_style(receiver_acct) if receiver_acct else ''}", "size": "xs", "color": "#6B7280"}
                        ],
                        "margin": "md", "spacing": "xs"
                    }
                ],
                "margin": "sm"
            },

            {"type": "separator", "margin": "lg"},

            # Reference + (optional) Fee
            {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "box",
                        "layout": "horizontal",
                        "contents": [
                            {"type": "text", "text": "เลขอ้างอิง", "size": "xs", "color": "#6B7280", "flex": 3},
                            {"type": "text", "text": str(trans_ref), "size": "xs", "color": "#111827", "flex": 7, "wrap": True},
                        ]
                    }
                ],
                "margin": "md"
            },
        ]

        if fee and float(fee or 0) > 0:
            contents_body.append({
                "type": "box",
                "layout": "horizontal",
                "contents": [
                    {"type": "text", "text": "ค่าธรรมเนียม", "size": "xs", "color": "#6B7280", "flex": 3},
                    {"type": "text", "text": format_currency(fee), "size": "xs", "color": "#EF6C00", "flex": 7}
                ],
                "margin": "sm"
            })

        if status == "duplicate":
            contents_body.append({
                "type": "box",
                "layout": "vertical",
                "contents": [{"type": "text", "text": "⚠️ สลิปนี้เคยถูกใช้แล้ว", "size": "sm", "weight": "bold", "align": "center", "color": "#B45309"}],
                "backgroundColor": "#FFF7E6",
                "cornerRadius": "12px",
                "paddingAll": "10px",
                "margin": "lg"
            })

        flex_message = {
            "type": "flex",
            "altText": f"{status_icon} {header_text} {amount_display}",
            "contents": {
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
                                        {"type": "text", "text": header_text, "size": "lg", "weight": "bold", "color": header_color, "margin": "sm", "gravity": "center"}
                                    ]
                                },
                                {"type": "text", "text": "ตรวจสลิปโดย Thunder API", "size": "xxs", "color": "#6B7280", "margin": "xs"}
                            ]
                        }
                    ],
                    "backgroundColor": header_bg,
                    "paddingAll": "16px"
                },
                "hero": {
                    # ใช้ hero เป็นแถบสีส้มเล็กๆ ให้ฟีลการ์ด (ปิดได้ถ้าไม่ชอบ)
                    "type": "image",
                    "url": "https://singlecolorimage.com/get/f97316/1200x12",  # แถบสีส้มบางๆ
                    "size": "full",
                    "aspectRatio": "1200:12",
                    "aspectMode": "cover"
                },
                "body": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": contents_body,
                    "backgroundColor": "#FAFAFA",
                    "paddingAll": "16px",
                    "spacing": "sm"
                },
                "footer": {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                        {"type": "image", "url": ASSETS["THUNDER_LOGO"], "size": "xs", "flex": 0},
                        {"type": "text", "text": "รับทรัพย์ รับโชค เว็บเกมของคุณ!", "size": "xxs", "color": "#6B7280", "margin": "md"},
                        {"type": "text", "text": f"ตรวจสอบเมื่อ {verification_time}", "size": "xxs", "color": "#9CA3AF", "align": "end"}
                    ],
                    "backgroundColor": "#FFFFFF",
                    "paddingAll": "12px"
                }
            },
            # ปรับ theme ปลีกย่อยของ bubble
            "styles": {
                "body": {"backgroundColor": "#FAFAFA"},
                "footer": {"separator": False}
            }
        }

        return flex_message

    except Exception as e:
        logger.error(f"❌ Error creating beautiful flex message: {e}", exc_info=True)
        return create_simple_text_message(result)
