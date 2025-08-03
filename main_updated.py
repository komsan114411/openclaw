import os
import json
import hmac
import hashlib
import base64
import threading
import logging
from datetime import datetime
from typing import Dict, Any

import requests
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates

from utils.config_manager import config_manager
from services.slip_checker import verify_slip_with_thunder
from services.chat_bot import get_chat_response
from models.database import (
    init_database,
    save_chat_history,
    get_chat_history_count,
    get_recent_chat_history,
)

logger = logging.getLogger("main_app")
logger.setLevel(logging.INFO)

app = FastAPI(title="LINE OA Middleware (Improved)")
templates = Jinja2Templates(directory="templates")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"status": "error",
                 "message": "เกิดข้อผิดพลาดภายในระบบ",
                 "detail": str(exc)},
    )


# Initialize database
try:
    init_database()
    logger.info("Database initialized")
except Exception as e:
    logger.exception("Database failed to init: %s", e)
    raise SystemExit("Database init failed")


@app.get("/admin/api-status")
async def api_status_check():
    """
    API สำหรับตรวจสอบสถานะ Thunder / LINE / OpenAI
    ส่งคืน JSON พร้อม configured, connected, error (human‑friendly message)
    และ balance / bot_name ถ้ามี
    """
    result = {
        "thunder": {"configured": False, "connected": False, "error": None, "balance": None},
        "line": {"configured": False, "connected": False, "error": None, "bot_name": None},
        "openai": {"configured": False, "connected": False, "error": None},
    }

    # --- Thunder
    token_thunder = config_manager.get("thunder_api_token", "").strip()
    if token_thunder:
        result["thunder"]["configured"] = True
        try:
            resp = requests.get(
                "https://api.thunder.in.th/v1/user",
                headers={"Authorization": f"Bearer {token_thunder}"},
                timeout=5,
            )
            resp.raise_for_status()
            user_data = resp.json()
            result["thunder"].update({
                "connected": True,
                "balance": user_data.get("balance")
            })
        except requests.exceptions.HTTPError:
            msg = resp.text or f"HTTP {resp.status_code}"
            if resp.status_code == 401:
                msg = "Token ไม่ถูกต้องหรือหมดอายุ"
            result["thunder"]["error"] = msg
            logger.warning("Thunder failed: %s", msg)
        except requests.exceptions.Timeout:
            result["thunder"]["error"] = "เชื่อมต่อล้มเหลว (timeout)"
            logger.warning("Thunder timeout")
        except requests.exceptions.RequestException as e:
            se = str(e)
            msg = "DNS ไม่พบโดเมน Thunder" if "ENOTFOUND" in se.upper() else se
            result["thunder"]["error"] = msg
            logger.warning("Thunder request exception: %s", se)

    # --- LINE
    token_line = config_manager.get("line_channel_access_token", "").strip()
    if token_line:
        result["line"]["configured"] = True
        try:
            resp = requests.get(
                "https://api.line.me/v2/bot/profile/me",
                headers={"Authorization": f"Bearer {token_line}"},
                timeout=5,
            )
            resp.raise_for_status()
            bot_info = resp.json()
            result["line"].update({
                "connected": True,
                "bot_name": bot_info.get("displayName")
            })
        except requests.exceptions.HTTPError:
            msg = "LINE Token ไม่ถูกต้อง" if resp.status_code == 401 else resp.text
            result["line"]["error"] = msg
            logger.warning("LINE failed: %s", msg)
        except requests.exceptions.Timeout:
            result["line"]["error"] = "เชื่อมต่อล้มเหลว (timeout)"
            logger.warning("LINE timeout")
        except requests.exceptions.RequestException as e:
            se = str(e)
            msg = "DNS ไม่พบ LINE API" if "ENOTFOUND" in se.upper() else se
            result["line"]["error"] = msg
            logger.warning("LINE request exception: %s", se)

    # --- OpenAI
    openai_key = config_manager.get("openai_api_key", "").strip()
    if openai_key:
        result["openai"]["configured"] = True
        try:
            from openai import OpenAI
            client = OpenAI(api_key=openai_key)
            client.models.list()
            result["openai"]["connected"] = True
        except ImportError:
            result["openai"]["error"] = "ห้องสมุด OpenAI ยังไม่ได้ติดตั้ง"
            logger.warning("OpenAI lib missing")
        except Exception as e:
            se = str(e)
            msg = "API Key OpenAI ไม่ถูกต้อง" if "401" in se or "Invalid" in se else se
            result["openai"]["error"] = msg
            logger.warning("OpenAI failed: %s", se)

    return JSONResponse(content=result)


@app.post("/admin/test-slip-upload")
async def test_slip_upload(request: Request):
    """
    ทดสอบส่งสลิปจากหน้า Admin
    รับไฟล์ image, ส่งไปตรวจสอบกับ Thunder,
    ส่งคืน status, message หรือ data
    """
    try:
        form = await request.form()
        file = form.get("file")
        if not file:
            return JSONResponse({"status": "error", "message": "ไม่พบไฟล์สลิป"})
        image_data = await file.read()
        # สั่งตรวจสอบ
        result = verify_slip_with_thunder(message_id="admin_test", test_image_data=image_data)
        return JSONResponse({
            "status": result.get("status", "error"),
            "message": result.get("message", ""),
            "response": result
        })
    except Exception as e:
        logger.exception("Test slip upload error: %s", e)
        return JSONResponse({"status": "error", "message": str(e)})


@app.post("/admin/test-thunder")
async def test_thunder_api():
    """
    ตรวจสอบการเชื่อมต่อ Thunder API เอง
    """
    api_token = config_manager.get("thunder_api_token", "").strip()
    if not api_token:
        return JSONResponse({"status": "error", "message": "ยังไม่ได้ตั้งค่า Thunder API Token"})
    try:
        resp = requests.get(
            "https://api.thunder.in.th/v1/user",
            headers={"Authorization": f"Bearer {api_token}"},
            timeout=10,
        )
        resp.raise_for_status()
        user_data = resp.json()
        return JSONResponse({
            "status": "success",
            "message": "เชื่อมต่อ Thunder API สำเร็จ",
            "user": user_data.get("name", "Unknown"),
            "balance": user_data.get("balance"),
        })
    except Exception as e:
        logger.warning("Thunder test failed: %s", e)
        return JSONResponse({
            "status": "error",
            "message": f"Thunder API Error: {e}",
            "details": str(e),
        })


def verify_line_signature(body: bytes, signature: str, channel_secret: str) -> bool:
    if not channel_secret:
        return True
    h = hmac.new(channel_secret.encode(), body, hashlib.sha256).digest()
    signature_calc = base64.b64encode(h).decode()
    return hmac.compare_digest(signature_calc, signature)


def build_slip_flex_contents(slip: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "type": "bubble",
        "size": "mega",
        "body": {"type": "box", "layout": "vertical", "spacing": "md",
                 "contents": [
                     {"type": "text", "text": "สลิปถูกต้อง ✅", "weight": "bold", "size": "lg", "color": "#00B900"},
                     {"type": "text", "text": f"฿{slip.get('amount')}", "weight": "bold", "size": "xxl", "margin": "md"},
                     {"type": "text", "text": slip.get("date", ""), "size": "sm", "color": "#999999", "margin": "sm"},
                     {"type": "separator", "margin": "md"},
                     {"type": "box", "layout": "vertical", "margin": "md", "contents": [
                         {"type": "text", "text": f"ผู้โอน: {slip.get('sender', slip.get('sender_bank', ''))}", "size": "sm"},
                         {"type": "text", "text": f"ผู้รับ: {slip.get('receiver_name', slip.get('receiver_bank', ''))}", "size": "sm"},
                         {"type": "text", "text": f"เบอร์ผู้รับ: {slip.get('receiver_phone', '')}", "size": "sm", "color": "#666666"},
                     ]},
                 ]},
        "footer": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {"type": "text", "text": "ตรวจสอบโดย Thunder", "size": "xs", "color": "#AAAAAA", "align": "center"}
            ],
        },
    }


def send_line_reply(reply_token: str, text: str) -> None:
    access_token = config_manager.get("line_channel_access_token", "").strip()
    if not access_token:
        logger.error("Missing LINE_ACCESS_TOKEN")
        return
    r = requests.post(
        "https://api.line.me/v2/bot/message/reply",
        headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
        json={"replyToken": reply_token, "messages": [{"type": "text", "text": text}]},
        timeout=10,
    )


def send_line_flex_reply(reply_token: str, slip_data: Dict[str, Any]) -> None:
    access_token = config_manager.get("line_channel_access_token", "").strip()
    if not access_token:
        logger.error("Missing LINE_ACCESS_TOKEN")
        return
    contents = build_slip_flex_contents(slip_data)
    requests.post(
        "https://api.line.me/v2/bot/message/reply",
        headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
        json={"replyToken": reply_token,
              "messages": [{"type": "flex", "altText": "ผลการตรวจสอบสลิป", "contents": contents}]},
        timeout=10,
    )


def dispatch_event(event: Dict[str, Any]) -> None:
    try:
        if event.get("type") != "message":
            return
        msg = event["message"]
        src = event["source"]
        user_id = src.get("userId")
        reply_token = event.get("replyToken")

        save_chat_history(user_id, "in", msg, sender="user")

        if msg.get("type") == "image":
            result = verify_slip_with_thunder(message_id=msg.get("id"))
            if result["status"] == "success":
                save_chat_history(user_id, "out", {"type": "flex", "content": result["data"]}, sender="slip_bot")
                send_line_flex_reply(reply_token, result["data"])
            else:
                save_chat_history(user_id, "out", {"type": "text", "text": result["message"]}, sender="slip_bot")
                send_line_reply(reply_token, result["message"])

        elif msg.get("type") == "text":
            txt = msg.get("text", "")
            reply = get_chat_response(txt, user_id)
            save_chat_history(user_id, "out", {"type": "text", "text": reply}, sender="bot")
            send_line_reply(reply_token, reply)
    except Exception as e:
        logger.exception("dispatch_event failed: %s", e)


@app.post("/line/webhook")
async def line_webhook(request: Request):
    body = await request.body()
    sig = request.headers.get("x-line-signature", "")
    ch_secret = config_manager.get("line_channel_secret", "").strip()
    if not verify_line_signature(body, sig, ch_secret):
        raise HTTPException(status_code=403, detail="Invalid signature")
    try:
        payload = json.loads(body.decode())
        for ev in payload.get("events", []):
            threading.Thread(target=dispatch_event, args=(ev,), daemon=True).start()
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    return JSONResponse({"status": "ok"})
