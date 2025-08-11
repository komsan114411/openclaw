# services/slip_formatter.py
import logging
from typing import Dict, Any
from datetime import datetime
import pytz

logger = logging.getLogger("slip_formatter")

TH_BANK_ICONS = {
    # ย่อธนาคาร -> ไอคอนวงกลมพื้นหลังโปร่ง
    "KBank": "https://i.imgur.com/5zj7mC8.png",      # กสิกร
    "SCB":   "https://i.imgur.com/3y7N8fC.png",      # ไทยพาณิชย์
    "BBL":   "https://i.imgur.com/6z3Y1qY.png",      # กรุงเทพ
    "GSB":   "https://i.imgur.com/Tv2xq3U.png",      # ออมสิน
    "Krungthai": "https://i.imgur.com/DWw8tJX.png",  # กรุงไทย
    "BAAC":  "https://i.imgur.com/6F9G0zZ.png",      # ธกส.
    "TTB":   "https://i.imgur.com/1wq0QW1.png",
    "CIMB":  "https://i.imgur.com/5pQ2Pih.png",
    "UOB":   "https://i.imgur.com/X6ZC8kW.png",
    "KTB":   "https://i.imgur.com/DWw8tJX.png",
}

CHECK_OK = "https://i.imgur.com/04pB3z8.png"   # ไอคอนติ๊กถูก
WARN_ICON = "https://i.imgur.com/E2m3w4Y.png"
ERROR_ICON = "https://i.imgur.com/hwV1O9V.png"
MASCOT_BG = "https://i.imgur.com/5xZx1eS.png"  # มาสคอต/แพทเทิร์นมุมขวา
THUNDER_LOGO = "https://i.imgur.com/7lq0mGd.png"
RIBBON = "https://i.imgur.com/0o6mO9H.png"

def thai_date_str(date_str: str, time_str: str) -> str:
    """รับวันที่/เวลา (อาจว่าง) แล้วคืนรูปแบบ '12 ส.ค. 68, 02:46 น.'"""
    if not date_str and not time_str:
        return ""
    months = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."]
    # พยายาม parse แบบยืดหยุ่น
    dt = None
    for fmt in ["%d/%m/%Y %H:%M", "%Y-%m-%d %H:%M", "%d-%m-%Y %H:%M",
                "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"]:
        try:
            s = (date_str or "").strip()
            if time_str:
                s = f"{s} {time_str.strip()}"
            dt = datetime.strptime(s, fmt)
            break
        except Exception:
            continue
    if dt is None:
        return f"{date_str} {time_str}".strip()

    th = pytz.timezone("Asia/Bangkok")
    dt = th.localize(dt) if dt.tzinfo is None else dt.astimezone(th)
    d = dt.day
    m = months[dt.month-1]
    yy = (dt.year + 543) % 100  # พ.ศ. 2 หลัก
    return f"{d} {m} {yy}, {dt.strftime('%H:%M')} น."

def mask_acct(acct: str) -> str:
    """คืนรูปแบบ xxx-x-1234-xxx ถ้าเป็นเลขยาว"""
    if not acct:
        return "xxx-x-xxxx-xxx"
    digits = "".join([c for c in acct if c.isdigit()])
    if len(digits) < 4:
        return "xxx-x-xxxx-xxx"
    mid = digits[-4:]
    return f"xxx-x-{mid}-xxx"

def bank_badge(short_name: str) -> str:
    return TH_BANK_ICONS.get(short_name or "", "https://i.imgur.com/9m8c2iU.png")

def create_slip_flex_message(result: Dict[str, Any]) -> Dict[str, Any]:
    """สร้าง Flex Message สไตล์การ์ดหรูแบบตัวอย่างรูป"""
    try:
        status = (result.get("status") or "").lower()
        data = result.get("data", {}) or {}
        if not data:
            return create_error_flex_message(result.get("message", "ไม่สามารถดึงข้อมูลสลิปได้"))

        # จำนวนเงิน
        amount = str(data.get("amount", "0")).replace(",", "")
        try:
            amount_display = f"฿{float(amount):,.0f}" if float(amount).is_integer() else f"฿{float(amount):,.2f}"
        except Exception:
            amount_display = f"฿{data.get('amount','0')}"

        # วันที่เวลา (ไทย)
        date_tx = data.get("date", data.get("trans_date", ""))
        time_tx = data.get("time", data.get("trans_time", ""))
        date_display = thai_date_str(date_tx, time_tx)

        # อ้างอิง / ชื่อ / ธนาคาร / เลขบัญชี
        trans_ref = data.get("reference", data.get("transRef", "—"))
        sender_name = data.get("sender_name_th") or data.get("sender_name_en") or data.get("sender", "ไม่พบชื่อผู้โอน")
        receiver_name = data.get("receiver_name_th") or data.get("receiver_name_en") or data.get("receiver_name") or data.get("receiver", "ไม่พบชื่อผู้รับ")
        sender_bank = data.get("sender_bank_short", data.get("sender_bank", ""))
        receiver_bank = data.get("receiver_bank_short", data.get("receiver_bank", ""))
        sender_acct = mask_acct(data.get("sender_acct", data.get("sender_account", "")))
        receiver_acct = mask_acct(data.get("receiver_acct", data.get("receiver_account", "")))

        # สีตามสถานะ
        if status == "success":
            head_color = "#FF6A36"   # ส้มหลัก
            pill_color = "#06C755"
            head_text = "สลิปถูกต้อง"
            head_icon = CHECK_OK
            status_text = "ตรวจสอบสำเร็จ"
            status_color = "#06C755"
        elif status == "duplicate":
            head_color = "#FFB833"
            pill_color = "#FFB833"
            head_text = "สลิปซ้ำ"
            head_icon = WARN_ICON
            status_text = "สลิปนี้เคยใช้แล้ว"
            status_color = "#FF8F00"
        else:
            head_color = "#FF4D4D"
            pill_color = "#FF4D4D"
            head_text = "ตรวจสอบไม่ผ่าน"
            head_icon = ERROR_ICON
            status_text = "ตรวจสอบไม่สำเร็จ"
            status_color = "#FF4D4D"

        # เวลาตรวจสอบ
        th = pytz.timezone("Asia/Bangkok")
        verification_time = datetime.now(th).strftime("%d/%m/%Y %H:%M:%S")

        # การ์ด
        return {
            "type": "flex",
            "altText": f"{head_text}: {amount_display}",
            "contents": {
                "type": "bubble",
                "size": "kilo",
                "body": {
                    "type": "box",
                    "layout": "vertical",
                    "paddingAll": "18px",
                    "backgroundColor": "#FFFFFF",
                    "contents": [
                        # Header (แถบส้ม + ติ๊กถูก + มาสคอตมุมขวา)
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "paddingAll": "14px",
                            "cornerRadius": "16px",
                            "backgroundColor": head_color,
                            "contents": [
                                {
                                    "type": "box",
                                    "layout": "baseline",
                                    "contents": [
                                        {
                                            "type": "image",
                                            "url": head_icon,
                                            "size": "26px",
                                            "aspectRatio": "1:1"
                                        },
                                        {
                                            "type": "text",
                                            "text": head_text,
                                            "weight": "bold",
                                            "color": "#FFFFFF",
                                            "size": "lg",
                                            "margin": "md"
                                        }
                                    ]
                                },
                                {
                                    "type": "image",
                                    "url": MASCOT_BG,
                                    "size": "60px",
                                    "position": "absolute",
                                    "offsetEnd": "8px",
                                    "offsetTop": "0px"
                                }
                            ]
                        },

                        # Amount
                        {
                            "type": "box",
                            "layout": "vertical",
                            "margin": "md",
                            "paddingAll": "14px",
                            "cornerRadius": "12px",
                            "backgroundColor": "#FFF1EA",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": amount_display,
                                    "align": "start",
                                    "size": "4xl",
                                    "weight": "bold",
                                    "color": "#1A1A1A"
                                },
                                {
                                    "type": "text",
                                    "text": date_display or "—",
                                    "size": "sm",
                                    "color": "#7A7A7A",
                                    "margin": "sm"
                                }
                            ]
                        },

                        # ผู้โอน
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "margin": "md",
                            "contents": [
                                {
                                    "type": "image",
                                    "url": bank_badge(sender_bank),
                                    "size": "28px"
                                },
                                {
                                    "type": "box",
                                    "layout": "vertical",
                                    "margin": "md",
                                    "contents": [
                                        {
                                            "type": "text",
                                            "text": "ผู้โอน",
                                            "size": "xs",
                                            "color": "#999999"
                                        },
                                        {
                                            "type": "text",
                                            "text": sender_name,
                                            "size": "sm",
                                            "wrap": True,
                                            "color": "#222222"
                                        },
                                        {
                                            "type": "text",
                                            "text": f"{sender_acct}",
                                            "size": "xs",
                                            "color": "#777777",
                                            "margin": "xs"
                                        }
                                    ]
                                }
                            ]
                        },

                        # ผู้รับ
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "margin": "sm",
                            "contents": [
                                {
                                    "type": "image",
                                    "url": bank_badge(receiver_bank),
                                    "size": "28px"
                                },
                                {
                                    "type": "box",
                                    "layout": "vertical",
                                    "margin": "md",
                                    "contents": [
                                        {
                                            "type": "text",
                                            "text": "ผู้รับ",
                                            "size": "xs",
                                            "color": "#999999"
                                        },
                                        {
                                            "type": "text",
                                            "text": receiver_name,
                                            "size": "sm",
                                            "wrap": True,
                                            "color": "#222222"
                                        },
                                        {
                                            "type": "text",
                                            "text": f"{receiver_acct}",
                                            "size": "xs",
                                            "color": "#777777",
                                            "margin": "xs"
                                        }
                                    ]
                                }
                            ]
                        },

                        # เลขอ้างอิง + สถานะ
                        {
                            "type": "box",
                            "layout": "vertical",
                            "margin": "md",
                            "paddingAll": "12px",
                            "cornerRadius": "12px",
                            "backgroundColor": "#FAFAFA",
                            "contents": [
                                {
                                    "type": "box",
                                    "layout": "horizontal",
                                    "contents": [
                                        {"type": "text", "text": "เลขอ้างอิง", "size": "sm", "color": "#666666"},
                                        {"type": "text", "text": trans_ref, "size": "sm", "align": "end", "wrap": True}
                                    ]
                                },
                                {
                                    "type": "box",
                                    "layout": "horizontal",
                                    "margin": "md",
                                    "contents": [
                                        {"type": "text", "text": "สถานะ", "size": "sm", "color": "#666666"},
                                        {"type": "text", "text": status_text, "size": "sm", "align": "end", "weight": "bold", "color": status_color}
                                    ]
                                }
                            ]
                        },

                        # Footer: เวลาตรวจสอบ + โลโก้
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "margin": "lg",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": f"รับทรัพย์ รับโชค เวินทองกวักคุณ!",
                                    "size": "xs",
                                    "color": "#B26A00",
                                    "flex": 0
                                },
                                {"type": "image", "url": RIBBON, "size": "28px", "position": "absolute", "offsetEnd": "10px"}
                            ]
                        },
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "margin": "sm",
                            "contents": [
                                {"type": "text", "text": f"ตรวจสอบเมื่อ {verification_time} น.", "size": "xs", "color": "#9A9A9A"},
                                {"type": "image", "url": THUNDER_LOGO, "size": "28px", "align": "end"}
                            ]
                        }
                    ]
                }
            }
        }

    except Exception as e:
        logger.error(f"❌ Error creating flex message: {e}")
        return create_simple_text_message(result)

def create_error_flex_message(error_message: str) -> Dict[str, Any]:
    th = pytz.timezone('Asia/Bangkok')
    verification_time = datetime.now(th).strftime("%d/%m/%Y %H:%M:%S")
    return {
        "type": "flex",
        "altText": "ไม่สามารถตรวจสอบสลิปได้",
        "contents": {
            "type": "bubble",
            "size": "kilo",
            "body": {
                "type": "box",
                "layout": "vertical",
                "paddingAll": "18px",
                "contents": [
                    {
                        "type": "box",
                        "layout": "horizontal",
                        "paddingAll": "14px",
                        "cornerRadius": "16px",
                        "backgroundColor": "#FF4D4D",
                        "contents": [
                            {"type": "image", "url": ERROR_ICON, "size": "26px"},
                            {"type": "text", "text": "ไม่สามารถตรวจสอบสลิปได้", "weight": "bold", "color": "#FFFFFF", "size": "lg", "margin": "md"}
                        ]
                    },
                    {"type": "text", "text": error_message, "wrap": True, "margin": "lg", "color": "#444444"},
                    {
                        "type": "box",
                        "layout": "vertical",
                        "margin": "md",
                        "paddingAll": "12px",
                        "cornerRadius": "12px",
                        "backgroundColor": "#FFF7E6",
                        "contents": [
                            {"type": "text", "text": "คำแนะนำ", "weight": "bold", "size": "sm"},
                            {"type": "text", "text": "• สลิปต้องชัดเจน\n• เป็นสลิปจริงจากแอปธนาคาร\n• ลองถ่ายใหม่หากพร่ามัว", "size": "xs", "color": "#6B6B6B", "wrap": True}
                        ]
                    },
                    {"type": "text", "text": f"ตรวจสอบเมื่อ {verification_time} น.", "size": "xs", "color": "#9A9A9A", "margin": "lg", "align": "center"}
                ]
            }
        }
    }

def create_simple_text_message(result: Dict[str, Any]) -> Dict[str, Any]:
    status = result.get("status")
    data = result.get("data", {})
    th = pytz.timezone('Asia/Bangkok')
    verification_time = datetime.now(th).strftime("%d/%m/%Y %H:%M:%S")

    if status == "success":
        msg = (f"✅ สลิปถูกต้อง\n\n"
               f"💰 จำนวน: {data.get('amount','N/A')}\n"
               f"📅 วันที่: {data.get('date','N/A')} {data.get('time','')}\n"
               f"🔢 อ้างอิง: {data.get('reference','N/A')}\n"
               f"ตรวจสอบเมื่อ {verification_time} น.")
    elif status == "duplicate":
        msg = (f"🔄 สลิปนี้เคยใช้แล้ว\n\n"
               f"💰 จำนวน: {data.get('amount','N/A')}\n"
               f"🔢 อ้างอิง: {data.get('reference','N/A')}\n"
               f"ตรวจสอบเมื่อ {verification_time} น.")
    else:
        msg = (f"❌ ตรวจสอบไม่สำเร็จ\n{result.get('message','')}\n"
               f"ตรวจสอบเมื่อ {verification_time} น.")

    return {"type": "text", "text": msg}
