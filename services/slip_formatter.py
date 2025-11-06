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
# FLEX (Improved)
# -----------------------------
def create_beautiful_slip_flex_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """
    สร้าง Flex Message ที่ดูทันสมัยและสวยงามยิ่งขึ้น
    - ใช้สีและ gradient ที่น่าสนใจ
    - จัดวาง layout ให้ดูมีมิติ
    - เน้นตัวเลขและข้อมูลสำคัญให้เด่นชัด
    """
    try:
        status = (result or {}).get("status")
        data = (result or {}).get("data", {}) or {}
        if not data:
            return create_error_flex_message(result.get("message", "ไม่สามารถดึงข้อมูลสลิปได้"))

        # ดึงจำนวนเงินจาก Thunder API
        amount_obj = data.get("amount", {})
        if isinstance(amount_obj, dict):
            amount = amount_obj.get("amount", 0)
        else:
            amount = amount_obj
        amount_display = format_currency(amount)

        date_th = format_thai_datetime(
            data.get("date", data.get("trans_date", "")) or "",
            data.get("time", data.get("trans_time", "")) or "",
        )

        thai_tz = pytz.timezone("Asia/Bangkok")
        verified_th = datetime.now(thai_tz).strftime("%d %b %y, %H:%M น.").replace("Jan","ม.ค.").replace("Feb","ก.พ.").replace("Mar","มี.ค.").replace("Apr","เม.ย.").replace("May","พ.ค.").replace("Jun","มิ.ย.").replace("Jul","ก.ค.").replace("Aug","ส.ค.").replace("Sep","ก.ย.").replace("Oct","ต.ค.").replace("Nov","พ.ย.").replace("Dec","ธ.ค.")

        ref_no = data.get("transRef") or data.get("reference") or "-"

        # ดึงข้อมูลผู้โอนและผู้รับจาก Thunder API response
        sender = data.get("sender", {})
        receiver = data.get("receiver", {})
        
        # ชื่อผู้โอน
        sender_name = sender.get("account", {}).get("name", {})
        s_name = sender_name.get("th", "") or sender_name.get("en", "") or "ไม่ระบุชื่อ"
        
        # ชื่อผู้รับ
        receiver_name = receiver.get("account", {}).get("name", {})
        r_name = receiver_name.get("th", "") or receiver_name.get("en", "") or "ไม่ระบุชื่อ"
        
        # เลขบัญชีผู้โอน
        s_acc = sender.get("account", {}).get("bank", {}).get("account", "")
        s_acc_mask = mask_account_formatted(s_acc) if s_acc else ""
        
        # เลขบัญชีผู้รับ
        r_acc = receiver.get("account", {}).get("bank", {}).get("account", "")
        r_acc_mask = mask_account_formatted(r_acc) if r_acc else ""
        
        # ธนาคารผู้โอน
        s_code = sender.get("bank", {}).get("id", "")
        s_bank = sender.get("bank", {}).get("short", "") or sender.get("bank", {}).get("name", "")
        
        # ธนาคารผู้รับ
        r_code = receiver.get("bank", {}).get("id", "")
        r_bank = receiver.get("bank", {}).get("short", "") or receiver.get("bank", {}).get("name", "")

        s_logo = get_bank_logo(s_code, s_bank)
        r_logo = get_bank_logo(r_code, r_bank)

        if status == "success":
            badge_text = "สลิปถูกต้อง"
            badge_color = "#FFFFFF"
            header_bg = "#22C55E"
            icon = "✅"
        elif status == "duplicate":
            badge_text = "สลิปถูกต้อง"
            badge_color = "#FFFFFF"
            header_bg = "#22C55E"
            icon = "✅"
        else:
            badge_text = "ตรวจสอบไม่ผ่าน"
            badge_color = "#FFFFFF"
            header_bg = "#EF4444"
            icon = "❌"

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
                                "layout": "vertical",
                                "contents": [
                                    {"type": "text", "text": icon, "size": "xl", "align": "center", "color": "#22C55E" if status != "error" else "#EF4444"}
                                ],
                                "width": "48px",
                                "height": "48px",
                                "backgroundColor": "#FFFFFF",
                                "cornerRadius": "24px",
                                "justifyContent": "center",
                                "alignItems": "center"
                            }
                        ],
                        "flex": 0
                    },
                    {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {
                                "type": "text",
                                "text": badge_text,
                                "size": "xxl",
                                "weight": "bold",
                                "color": "#FFFFFF"
                            }
                        ],
                        "margin": "md",
                        "justifyContent": "center"
                    }
                ],
                "backgroundColor": header_bg,
                "paddingAll": "20px",
                "spacing": "md"
            },
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {"type": "text", "text": amount_display, "size": "5xl", "weight": "bold", "color": "#1E3A8A"},
                            {"type": "text", "text": date_th, "size": "sm", "color": "#9CA3AF", "margin": "sm"}
                        ],
                        "margin": "lg",
                        "spacing": "sm"
                    },

                    {"type": "text", "text": "ผู้โอน", "size": "xs", "color": "#6C757D", "margin": "xl", "weight": "bold"},
                    {
                        "type": "box",
                        "layout": "horizontal",
                        "contents": [
                            {"type": "image", "url": s_logo, "size": "56px", "aspectRatio": "1:1", "flex": 0},
                            {
                                "type": "box",
                                "layout": "vertical",
                                "contents": [
                                    {"type": "text", "text": s_name[:40], "size": "md", "weight": "bold", "wrap": True, "color": "#1F2937"},
                                    {"type": "text", "text": f"{s_bank}  {s_acc_mask}", "size": "sm", "color": "#6B7280", "wrap": True, "margin": "xs"}
                                ],
                                "margin": "md", "spacing": "xs", "justifyContent": "center"
                            }
                        ],
                        "margin": "sm",
                        "spacing": "md"
                    },

                    {"type": "text", "text": "ผู้รับ", "size": "xs", "color": "#9CA3AF", "weight": "bold", "margin": "xl"},
                    {
                        "type": "box",
                        "layout": "horizontal",
                        "contents": [
                            {"type": "image", "url": r_logo, "size": "56px", "aspectRatio": "1:1", "flex": 0},
                            {
                                "type": "box",
                                "layout": "vertical",
                                "contents": [
                                    {"type": "text", "text": r_name[:40], "size": "md", "weight": "bold", "wrap": True, "color": "#1F2937"},
                                    {"type": "text", "text": f"{r_bank}  {r_acc_mask}", "size": "sm", "color": "#6B7280", "wrap": True, "margin": "xs"}
                                ],
                                "margin": "md", "spacing": "xs", "justifyContent": "center"
                            }
                        ],
                        "margin": "sm",
                        "spacing": "md"
                    },


                    {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {"type": "text", "text": "เลขอ้างอิง", "size": "xs", "color": "#9CA3AF", "margin": "md"},
                            {"type": "text", "text": ref_no, "size": "sm", "wrap": True, "color": "#374151", "margin": "xs"}
                        ],
                        "spacing": "xs"
                    }
                ],
                "backgroundColor": "#F5F5F0",
                "paddingAll": "20px"
            },
            "footer": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "box",
                        "layout": "horizontal",
                        "contents": [
                            {"type": "text", "text": "🔍", "size": "xs", "flex": 0},
                            {
                                "type": "text",
                                "text": f"สลิปจริงตรวจสอบโดย ธันเดอร์ โมบายแอพ",
                                "size": "xxs",
                                "color": "#3B82F6",
                                "margin": "xs",
                                "weight": "bold",
                                "flex": 1
                            }
                        ],
                        "spacing": "xs",
                        "justifyContent": "center"
                    },
                    {
                        "type": "text",
                        "text": "ผู้ให้บริการเช็คสลิปอันดับ 1",
                        "size": "xxs",
                        "color": "#9CA3AF",
                        "align": "center",
                        "margin": "xs"
                    }
                ],
                "backgroundColor": "#F9FAFB",
                "paddingAll": "16px",
                "spacing": "xs"
            }
        }

        # No need to add duplicate warning in flex message
        # It will be sent as a separate text message
        
        return {"type": "flex", "altText": f"{badge_text} {amount_display}", "contents": bubble}

    except Exception as e:
        logger.error(f"❌ Error creating flex message: {e}", exc_info=True)
        return create_simple_text_message(result)

# -----------------------------
# FALLBACK (Improved)
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
                    {"type": "text", "text": "ไม่สามารถตรวจสอบสลิปได้", "weight": "bold", "size": "md", "color": "#DC3545", "margin": "md"}
                ],
                "backgroundColor": "#F8D7DA",
                "paddingAll": "15px"
            },
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {"type": "text", "text": error_message, "size": "sm", "color": "#343A40", "wrap": True},
                    {"type": "separator", "margin": "lg", "color": "#E9ECEF"},
                    {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {"type": "text", "text": "💡 คำแนะนำ:", "size": "sm", "weight": "bold", "color": "#007BFF"},
                            {"type": "text", "text": "• ตรวจสอบให้แน่ใจว่าสลิปชัดเจน", "size": "xs", "color": "#6C757D", "margin": "sm"},
                            {"type": "text", "text": "• ตรวจสอบว่าเป็นสลิปจริง", "size": "xs", "color": "#6C757D"},
                            {"type": "text", "text": "• ลองถ่ายรูปใหม่หากไม่ชัด", "size": "xs", "color": "#6C757D"},
                        ],
                        "backgroundColor": "#E7F3FF",
                        "paddingAll": "12px",
                        "cornerRadius": "8px",
                        "margin": "lg"
                    }
                ]
            }
        }
    }
