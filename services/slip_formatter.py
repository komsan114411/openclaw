import logging
from typing import Dict, Any, Union
from datetime import datetime
import pytz, re

logger = logging.getLogger("slip_formatter")

# -----------------------------
# LOGOS
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
    "081": "https://www.hood11.com/uploads/aelfbaelfbeaf.png", # LH
    "084": "https://www.hood11.com/uploads/phfakhahilas.png",  # Islamic
}
DEFAULT_LOGO = "https://www.hood11.com/uploads/logo.webp"

# -----------------------------
# HELPERS : รูปแบบตัวเลข/บัญชี/สกุลเงิน
# -----------------------------
def get_bank_logo(bank_code: str = None, bank_name: str = None) -> str:
    if bank_code and bank_code in BANK_LOGOS:
        return BANK_LOGOS[bank_code]
    if bank_name:
        bn = bank_name.upper()
        pairs = [
            ("KTB","006"),("กรุงไทย","006"),
            ("GSB","030"),("ออมสิน","030"),
            ("KBANK","004"),("กสิกร","004"),
            ("SCB","014"),("ไทยพาณิชย์","014"),
            ("BBL","002"),("กรุงเทพ","002"),
            ("BAY","025"),("กรุงศรี","025"),
            ("TMB","011"),("TTB","011"),("ทีเอ็มบีธนชาต","011"),
            ("UOB","071"),("ยูโอบี","071"),
            ("GHB","080"),("ธอส","080"),
            ("TISCO","076"),("ทิสโก้","076"),
            ("BAAC","034"),("ธกส","034"),
            ("KKP","069"),("เกียรตินาคิน","069"),
            ("LAND AND HOUSES","081"),("แลนด์แอนด์เฮ้าส์","081"),
            ("ISLAMIC","084"),("อิสลาม","084"),
        ]
        for key, code in pairs:
            if key in bn or key in bank_name:
                return BANK_LOGOS.get(code, DEFAULT_LOGO)
    return DEFAULT_LOGO

def format_currency(amount: Union[str,int,float]) -> str:
    try:
        if isinstance(amount, (int, float)): return f"฿{amount:,.2f}"
        if isinstance(amount, str): return f"฿{float(amount.replace(',','')):,.2f}"
    except: pass
    return f"฿{amount}"

def _digits(s: str) -> str:
    return re.sub(r"\D", "", s or "")

def format_account_with_dashes(acc: str) -> str:
    d = _digits(acc)
    n = len(d)
    if n == 10:  # 3-1-5-1
        return f"{d[0:3]}-{d[3]}-{d[4:9]}-{d[9]}"
    if n == 9:   # 3-1-4-1
        return f"{d[0:3]}-{d[3]}-{d[4:8]}-{d[8]}"
    if n >= 7:
        mid = d[4:-1]
        return f"{d[0:3]}-{d[3]}-{mid}-{d[-1]}"
    return acc or ""

def mask_account_formatted(acc: str, visible_tail: int = 4) -> str:
    f = format_account_with_dashes(acc)
    digits = [c for c in f if c.isdigit()]
    if not digits: return f
    keep = max(1, min(len(digits), visible_tail))
    to_mask = len(digits) - keep
    out, m, k = [], 0, 0
    for ch in f:
        if ch.isdigit():
            if m < to_mask: out.append("x"); m += 1
            else: out.append(digits[to_mask+k]); k += 1
        else:
            out.append(ch)
    return "".join(out)

# -----------------------------
# HELPERS : วันที่ไทย (พ.ศ.)
# -----------------------------
THAI_MONTHS_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."]

def format_thai_datetime(date_str: str = "", time_str: str = "") -> str:
    """
    รับรูปแบบวันที่/เวลาได้หลายแบบ แล้วคืนเป็น: '13 ส.ค. 68, 02:50 น.'
    พ.ศ. = ค.ศ. + 543 และใช้เลขปี 2 หลักตามตัวอย่าง
    """
    if not date_str and not time_str:
        return ""
    raw = (date_str or "").strip() + " " + (time_str or "").strip()
    raw = raw.strip()

    candidates = [
        "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S",
        "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M",
        "%d-%m-%Y %H:%M:%S", "%d-%m-%Y %H:%M",
        "%Y/%m/%d %H:%M:%S", "%Y/%m/%d %H:%M",
        "%d/%m/%y %H:%M:%S", "%d/%m/%y %H:%M",
        "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"
    ]
    dt = None
    for fmt in candidates:
        try:
            dt = datetime.strptime(raw, fmt); break
        except: pass
    if not dt:
        # บางกรณี date,time มาแยกแล้ว time มีวินาที
        if date_str:
            for df in ["%Y-%m-%d","%d/%m/%Y","%Y/%m/%d","%d-%m-%Y"]:
                try:
                    d = datetime.strptime(date_str, df)
                    if time_str:
                        for tf in ["%H:%M:%S","%H:%M"]:
                            try:
                                t = datetime.strptime(time_str, tf)
                                dt = d.replace(hour=t.hour, minute=t.minute, second=getattr(t, "second", 0))
                                break
                            except: pass
                    else:
                        dt = d
                    break
                except: pass
    if not dt:
        # ถ้าพาร์สไม่ได้ ให้คืนเดิม
        merged = " ".join([i for i in [date_str, time_str] if i]).strip()
        return merged

    y_th = dt.year + 543
    y2 = f"{y_th % 100:02d}"
    month_th = THAI_MONTHS_SHORT[dt.month - 1]
    time_txt = dt.strftime("%H:%M")
    return f"{dt.day} {month_th} {y2}, {time_txt} น."

# -----------------------------
# FLEX
# -----------------------------
def create_beautiful_slip_flex_message(result: Dict[str, Any]) -> Dict[str, Any]:
    try:
        status = (result or {}).get("status")
        data = (result or {}).get("data", {}) or {}
        if not data:
            return create_error_flex_message(result.get("message", "ไม่สามารถดึงข้อมูลสลิปได้"))

        # --- เงิน/เวลาไทย
        amount_display = format_currency(data.get("amount", "0"))
        date_th = format_thai_datetime(
            data.get("date", data.get("trans_date", "")) or "",
            data.get("time", data.get("trans_time", "")) or "",
        )
        thai_tz = pytz.timezone("Asia/Bangkok")
        verified_th = datetime.now(thai_tz).strftime("%d %b %y, %H:%M น.") \
            .replace("Jan","ม.ค.").replace("Feb","ก.พ.").replace("Mar","มี.ค.") \
            .replace("Apr","เม.ย.").replace("May","พ.ค.").replace("Jun","มิ.ย.") \
            .replace("Jul","ก.ค.").replace("Aug","ส.ค.").replace("Sep","ก.ย.") \
            .replace("Oct","ต.ค.").replace("Nov","พ.ย.").replace("Dec","ธ.ค.")

        # --- คน/ธนาคาร/บัญชี
        s_name = data.get("sender_name_th") or data.get("sender_name_en") or data.get("sender") or "ไม่ระบุชื่อ"
        r_name = data.get("receiver_name_th") or data.get("receiver_name_en") or data.get("receiver_name") or data.get("receiver") or "ไม่ระบุชื่อ"
        s_acc = mask_account_formatted(data.get("sender_account_number", "") or data.get("sender_account", ""))
        r_acc = mask_account_formatted(data.get("receiver_account_number", "") or data.get("receiver_account", ""))
        s_bank = data.get("sender_bank_short", data.get("sender_bank", "")) or ""
        r_bank = data.get("receiver_bank_short", data.get("receiver_bank", "")) or ""
        s_logo = get_bank_logo(data.get("sender_bank_id", ""), s_bank)
        r_logo = get_bank_logo(data.get("receiver_bank_id", ""), r_bank)
        ref_no = data.get("transRef") or data.get("reference") or "-"

        # --- โทนสีตามสถานะ (ชิปสถานะ)
        if status == "success":
            badge_bg, badge_fg, badge_txt, badge_emoji = "#FFEBDD", "#F07B1E", "สลิปถูกต้อง", "✅"
        elif status == "duplicate":
            badge_bg, badge_fg, badge_txt, badge_emoji = "#FFF4D9", "#B47A00", "สลิปซ้ำ", "🔄"
        else:
            badge_bg, badge_fg, badge_txt, badge_emoji = "#FFE5E5", "#C53A3A", "ตรวจสอบไม่ผ่าน", "❌"

        # --- บล็อคคน/ธนาคาร (reuse)
        def person_row(logo_url: str, title: str, name: str, bank: str, acc: str) -> Dict[str, Any]:
            return {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {"type": "text", "text": title, "size": "xs", "color": "#8E8E93"},
                    {
                        "type": "box",
                        "layout": "horizontal",
                        "contents": [
                            {"type": "image", "url": logo_url, "size": "44px", "aspectRatio": "1:1", "flex": 0},
                            {
                                "type": "box",
                                "layout": "vertical",
                                "contents": [
                                    {"type": "text", "text": name[:48], "size": "sm", "weight": "bold", "wrap": True, "color": "#1C1C1E"},
                                    {"type": "text", "text": bank, "size": "xs", "color": "#636366"}
                                ],
                                "spacing": "xs", "margin": "md"
                            },
                            {
                                "type": "text",
                                "text": acc,
                                "size": "xs",
                                "align": "end",
                                "color": "#4A4A4A",
                                "gravity": "center",
                                "wrap": True
                            }
                        ],
                        "margin": "sm"
                    }
                ]
            }

        # --- การ์ด Flex
        bubble = {
            "type": "bubble",
            "size": "mega",
            "header": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "box",
                        "layout": "baseline",
                        "contents": [
                            {
                                "type": "box",
                                "layout": "horizontal",
                                "contents": [
                                    {"type": "text", "text": badge_emoji, "size": "md", "flex": 0},
                                    {"type": "text", "text": badge_txt, "size": "md", "weight": "bold", "color": badge_fg, "margin": "sm"}
                                ],
                                "backgroundColor": badge_bg,
                                "cornerRadius": "999px",
                                "paddingAll": "8px"
                            },
                        ],
                    },
                    {"type": "text", "text": "ตรวจสอบโดย Thunder", "size": "xxs", "color": "#8E8E93", "margin": "xs"}
                ],
                "backgroundColor": "#FFF4EE",
                "paddingAll": "18px"
            },
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {"type": "text", "text": amount_display, "size": "3xl", "weight": "bold", "color": "#101010"},
                            {"type": "text", "text": date_th, "size": "sm", "color": "#666666", "margin": "xs"}
                        ],
                        "backgroundColor": "#FAFAFB",
                        "cornerRadius": "14px",
                        "paddingAll": "14px"
                    },

                    {"type": "separator", "margin": "lg"},

                    person_row(s_logo, "ผู้โอน", s_name, s_bank, s_acc),

                    {"type": "text", "text": "⬇", "align": "center", "color": "#C7C7CC", "margin": "md"},

                    person_row(r_logo, "ผู้รับ", r_name, r_bank, r_acc),

                    {"type": "separator", "margin": "lg"},

                    {
                        "type": "box",
                        "layout": "horizontal",
                        "contents": [
                            {"type": "text", "text": "เลขอ้างอิง", "size": "xs", "color": "#666666", "flex": 3},
                            {"type": "text", "text": ref_no, "size": "xs", "flex": 7, "wrap": True}
                        ],
                        "margin": "md"
                    }
                ],
                "spacing": "sm"
            },
            "footer": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {"type": "text", "text": "รับทรัพย์ รับโชค เงินทองวิ่งฉิว!", "size": "xs", "align": "center", "color": "#8E8E93"}
                        ],
                        "backgroundColor": "#FFF7F0",
                        "cornerRadius": "12px",
                        "paddingAll": "10px",
                        "margin": "sm"
                    },
                    {"type": "text", "text": f"ตรวจสอบเมื่อ {verified_th}", "size": "xxs", "color": "#8E8E93", "align": "center", "margin": "sm"}
                ],
                "backgroundColor": "#F5F5F7"
            }
        }

        # ชิปเตือน “สลิปซ้ำ”
        if status == "duplicate":
            bubble["body"]["contents"].append({
                "type": "box",
                "layout": "horizontal",
                "contents": [
                    {"type": "text", "text": "สลิปนี้เคยถูกใช้แล้ว", "size": "sm", "weight": "bold", "color": "#B47A00", "align": "center", "flex": 1}
                ],
                "backgroundColor": "#FFF4D9",
                "cornerRadius": "12px",
                "paddingAll": "12px",
                "margin": "lg"
            })

        return {"type": "flex", "altText": f"{badge_txt} {amount_display}", "contents": bubble}

    except Exception as e:
        logger.error(f"❌ Error creating flex message: {e}", exc_info=True)
        return create_simple_text_message(result)


# -----------------------------
# FALLBACK
# -----------------------------
def create_simple_text_message(result: Dict[str, Any]) -> Dict[str, Any]:
    status = (result or {}).get("status")
    data = (result or {}).get("data", {}) or {}

    if status == "success":
        amount = format_currency(data.get("amount", 0))
        s_acc = mask_account_formatted(data.get("sender_account_number", "") or data.get("sender_account", ""))
        r_acc = mask_account_formatted(data.get("receiver_account_number", "") or data.get("receiver_account", ""))
        msg = (
            "✅ สลิปถูกต้อง\n"
            f"💰 {amount}\n"
            f"🕒 {format_thai_datetime(data.get('date',''), data.get('time',''))}\n"
            f"🔢 อ้างอิง: {data.get('transRef', data.get('reference','-'))}\n"
            f"👤 ผู้โอน: {data.get('sender', data.get('sender_name_th','-'))} ({s_acc})\n"
            f"🎯 ผู้รับ: {data.get('receiver', data.get('receiver_name_th','-'))} ({r_acc})"
        )
    elif status == "duplicate":
        msg = "🔄 สลิปนี้เคยถูกใช้แล้ว"
    else:
        msg = f"❌ ไม่สามารถตรวจสอบสลิปได้\n{(result or {}).get('message','เกิดข้อผิดพลาด')}"
    return {"type": "text", "text": msg}

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
                    {"type": "text", "text": "ไม่สามารถตรวจสอบสลิปได้", "weight": "bold", "size": "md", "color": "#CC0000", "margin": "md"}
                ],
                "backgroundColor": "#FFE5E5",
                "paddingAll": "15px"
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
                            {"type": "text", "text": "💡 คำแนะนำ:", "size": "sm", "weight": "bold"},
                            {"type": "text", "text": "• ตรวจสอบให้แน่ใจว่าสลิปชัดเจน", "size": "xs", "color": "#666666", "margin": "sm"},
                            {"type": "text", "text": "• ตรวจสอบว่าเป็นสลิปจริง", "size": "xs", "color": "#666666"},
                            {"type": "text", "text": "• ลองถ่ายรูปใหม่หากไม่ชัด", "size": "xs", "color": "#666666"},
                        ],
                        "backgroundColor": "#FFF9E6",
                        "paddingAll": "12px",
                        "cornerRadius": "8px",
                        "margin": "lg"
                    }
                ]
            }
        }
    }
