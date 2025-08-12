import logging
from typing import Dict, Any, Union
from datetime import datetime
import pytz, re

logger = logging.getLogger("slip_formatter")

# -----------------------------
# LOGOS
# -----------------------------
BANK_LOGOS = {
    "002": "https://www.hood11.com/uploads/khungefl.png",    # BBL
    "004": "https://www.hood11.com/uploads/kikh.png",         # KBANK
    "006": "https://www.hood11.com/uploads/khungaifs.png",    # KTB
    "011": "https://www.hood11.com/uploads/ttb.png",          # TTB
    "014": "https://www.hood11.com/uploads/aifslanichsscb.png",  # SCB
    "025": "https://www.hood11.com/uploads/khunghhi2.png",    # BAY
    "030": "https://www.hood11.com/uploads/sif.png",          # GSB
    "034": "https://www.hood11.com/uploads/phfakhahphk.png", # BAAC
    "069": "https://www.hood11.com/uploads/ekishpifakhif.png", # KKP
    "070": "https://www.hood11.com/uploads/icbc.png",         # ICBC
    "071": "https://www.hood11.com/uploads/uob.png",          # UOB
    "073": "https://www.hood11.com/uploads/phfakhahphfchapi.png", # Thanachart
    "076": "https://www.hood11.com/uploads/fiok.png",         # TISCO
    "080": "https://www.hood11.com/uploads/ph.png",           # GHB
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
        merged = " ".join([i for i in [date_str, time_str] if i]).strip()
        return merged

    y_th = dt.year + 543
    y2 = f"{y_th % 100:02d}"
    month_th = THAI_MONTHS_SHORT[dt.month - 1]
    time_txt = dt.strftime("%H:%M")
    return f"{dt.day} {month_th} {y2}, {time_txt} น."

# -----------------------------
# FLEX (Refined to match image)
# -----------------------------
def create_beautiful_slip_flex_message(result: Dict[str, Any]) -> Dict[str, Any]:
    try:
        status = (result or {}).get("status")
        data = (result or {}).get("data", {}) or {}
        if not data:
            return create_error_flex_message(result.get("message", "ไม่สามารถดึงข้อมูลสลิปได้"))

        amount = data.get("amount", "0")
        amount_display = format_currency(amount)
        date_th = format_thai_datetime(data.get("date", ""), data.get("time", ""))
        ref_no = data.get("transRef") or data.get("reference") or "-"

        s_name = (data.get("sender_name_th") or data.get("sender_name_en") or "ไม่ระบุชื่อ")[:15] + "..."
        r_name = (data.get("receiver_name_th") or data.get("receiver_name_en") or "ไม่ระบุชื่อ")[:15] + "..."

        s_acc = data.get("sender_account_number", "") or data.get("sender_account", "")
        r_acc = data.get("receiver_account_number", "") or data.get("receiver_account", "")
        s_acc_mask = mask_account_formatted(s_acc)
        r_acc_mask = mask_account_formatted(r_acc)

        s_code = data.get("sender_bank_id", "")
        r_code = data.get("receiver_bank_id", "")
        s_logo = get_bank_logo(s_code)
        r_logo = get_bank_logo(r_code)

        if status == "success":
            header_bg = "#FF715E"
            header_text = "สลิปถูกต้อง"
            header_icon = "✅"
            header_image = "https://www.hood11.com/uploads/kngok.png"
            body_bg_image = "https://www.hood11.com/uploads/khkhkh.png"
        else: # simplified for other statuses
            header_bg = "#FF715E"
            header_text = "ตรวจสอบไม่ผ่าน"
            header_icon = "❌"
            header_image = "https://www.hood11.com/uploads/kngok.png"
            body_bg_image = "https://www.hood11.com/uploads/khkhkh.png"

        return {
            "type": "flex",
            "altText": f"{header_text} {amount_display}",
            "contents": {
                "type": "bubble",
                "size": "kilo",
                "styles": {
                    "header": {"backgroundColor": header_bg, "separator": True},
                    "body": {"backgroundColor": "#FFFFFF"}
                },
                "header": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "box",
                                    "layout": "horizontal",
                                    "contents": [
                                        {"type": "text", "text": header_icon, "size": "xl", "color": "#FFFFFF", "flex": 0},
                                        {"type": "text", "text": header_text, "size": "md", "weight": "bold", "color": "#FFFFFF", "margin": "sm", "flex": 0}
                                    ],
                                    "alignItems": "center"
                                },
                                {"type": "image", "url": header_image, "size": "xl", "aspectMode": "cover", "position": "absolute", "offsetEnd": "0px", "offsetBottom": "0px", "flex": 0, "align": "end", "gravity": "top"}
                            ],
                        }
                    ],
                    "paddingAll": "12px"
                },
                "body": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {"type": "box", "layout": "vertical", "contents": [], "background": {"type": "image", "url": body_bg_image, "size": "full", "aspectMode": "cover"}},
                        {"type": "text", "text": amount_display, "size": "3xl", "weight": "bold", "margin": "sm"},
                        {"type": "text", "text": date_th, "size": "sm", "color": "#666666", "margin": "xs"},
                        {"type": "separator", "margin": "md"},
                        
                        {"type": "box", "layout": "horizontal", "contents": [
                            {"type": "image", "url": s_logo, "size": "42px", "aspectRatio": "1:1", "flex": 0},
                            {"type": "box", "layout": "vertical", "contents": [
                                {"type": "text", "text": "ผู้โอน", "size": "sm", "color": "#666666"},
                                {"type": "text", "text": s_name, "size": "sm", "weight": "bold", "wrap": True, "color": "#333333"},
                                {"type": "text", "text": s_acc_mask, "size": "xs", "color": "#999999", "wrap": True}
                            ], "margin": "md", "spacing": "xs"}
                        ], "margin": "lg"},

                        {"type": "box", "layout": "horizontal", "contents": [
                            {"type": "image", "url": r_logo, "size": "42px", "aspectRatio": "1:1", "flex": 0},
                            {"type": "box", "layout": "vertical", "contents": [
                                {"type": "text", "text": "ผู้รับ", "size": "sm", "color": "#666666"},
                                {"type": "text", "text": r_name, "size": "sm", "weight": "bold", "wrap": True, "color": "#333333"},
                                {"type": "text", "text": r_acc_mask, "size": "xs", "color": "#999999", "wrap": True}
                            ], "margin": "md", "spacing": "xs"}
                        ], "margin": "md"},

                        {"type": "separator", "margin": "md"},
                        {"type": "box", "layout": "horizontal", "contents": [
                            {"type": "text", "text": "เลขอ้างอิง", "size": "xs", "color": "#666666"},
                            {"type": "text", "text": ref_no, "size": "xs", "align": "end", "wrap": True, "color": "#333333"}
                        ], "margin": "md"}
                    ],
                    "paddingAll": "16px"
                }
            }
        }
    except Exception as e:
        logging.error(f"❌ Error creating flex message: {e}", exc_info=True)
        return create_simple_text_message(result)

def create_error_flex_message(error_message: str) -> Dict[str, Any]:
    # Simplified error message to match the new style and size
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
                    {"type": "text", "text": "❌", "size": "xl", "flex": 0, "color": "#FFFFFF"},
                    {"type": "text", "text": "ไม่สามารถตรวจสอบสลิปได้", "weight": "bold", "size": "md", "color": "#FFFFFF", "margin": "md"}
                ],
                "backgroundColor": "#FF715E",
                "paddingAll": "15px"
            },
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {"type": "text", "text": error_message, "size": "sm", "color": "#333333", "wrap": True},
                    {"type": "separator", "margin": "md"},
                    {
                        "type": "text", "text": "คำแนะนำ: ตรวจสอบความชัดเจนของสลิป", "size": "xs", "color": "#666666"
                    }
                ],
                "paddingAll": "16px"
            }
        }
    }

# -----------------------------
# FALLBACK (Unchanged)
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
            f"💰 ยอดเงิน: {amount}\n"
            f"🕒 เวลา: {format_thai_datetime(data.get('date',''), data.get('time',''))}\n"
            f"🔢 เลขอ้างอิง: {data.get('transRef', data.get('reference','-'))}\n"
            f"👤 ผู้โอน: {data.get('sender', data.get('sender_name_th','-'))} ({s_acc})\n"
            f"🎯 ผู้รับ: {data.get('receiver', data.get('receiver_name_th','-'))} ({r_acc})"
        )
    elif status == "duplicate":
        msg = "⚠️ สลิปนี้เคยถูกใช้แล้ว\n" + f"💰 ยอดเงิน: {format_currency(data.get('amount', 0))}"
    else:
        msg = f"❌ ไม่สามารถตรวจสอบสลิปได้\n\n**ข้อความจากระบบ:**\n{(result or {}).get('message','เกิดข้อผิดพลาด')}\n\n**คำแนะนำ:**\n• ตรวจสอบให้แน่ใจว่าสลิปชัดเจน\n• ลองถ่ายรูปใหม่หากไม่ชัด"
    return {"type": "text", "text": msg}
