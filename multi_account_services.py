# services/multi_account_services.py
import logging
import httpx
from typing import Dict, Any, Optional
import openai

logger = logging.getLogger("multi_account_services")

async def get_ai_response_with_key(
    text: str, 
    user_id: str,
    api_key: str,
    ai_prompt: str,
    account_id: str
) -> str:
    """Get AI response using specific API key"""
    try:
        # ดึงประวัติแชทของ user กับ account นี้
        from models.database import get_user_chat_history_by_account
        chat_history = await get_user_chat_history_by_account(user_id, account_id, limit=5)
        
        # เตรียม messages
        messages = [{"role": "system", "content": ai_prompt}]
        
        # เพิ่มประวัติแชท
        for msg in chat_history:
            if isinstance(msg, dict) and 'role' in msg and 'content' in msg:
                messages.append(msg)
        
        messages.append({"role": "user", "content": text})
        
        # เรียก OpenAI API
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": "gpt-3.5-turbo",
            "messages": messages,
            "max_tokens": 150,
            "temperature": 0.7
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                return data["choices"][0]["message"]["content"].strip()
            elif response.status_code == 401:
                return "ขออภัย API Key ไม่ถูกต้อง"
            else:
                return "ขออภัย ระบบ AI ไม่สามารถตอบได้ในขณะนี้"
                
    except Exception as e:
        logger.error(f"❌ AI error for account {account_id}: {e}")
        return "ขออภัย เกิดข้อผิดพลาดในระบบ AI"

async def verify_slip_with_account_config(
    account_config: Dict[str, Any],
    message_id: Optional[str] = None,
    slip_info: Optional[Dict] = None
) -> Dict[str, Any]:
    """Verify slip using account-specific API keys"""
    try:
        thunder_token = account_config.get("thunder_api_token", "")
        thunder_enabled = account_config.get("thunder_enabled", True)
        
        kbank_id = account_config.get("kbank_consumer_id", "")
        kbank_secret = account_config.get("kbank_consumer_secret", "")
        kbank_enabled = account_config.get("kbank_enabled", False)
        
        # ลอง Thunder API ก่อน
        if thunder_enabled and thunder_token and message_id:
            result = await verify_with_thunder(message_id, thunder_token, account_config)
            if result.get("status") in ["success", "duplicate"]:
                return result
        
        # ลอง KBank API
        if kbank_enabled and kbank_id and kbank_secret and slip_info:
            result = await verify_with_kbank(
                slip_info.get("bank_code"),
                slip_info.get("trans_ref"),
                kbank_id,
                kbank_secret
            )
            if result.get("status") in ["success", "duplicate"]:
                return result
        
        return {
            "status": "error",
            "message": "ไม่สามารถตรวจสอบสลิปได้"
        }
        
    except Exception as e:
        logger.error(f"❌ Slip verification error: {e}")
        return {"status": "error", "message": str(e)}

async def verify_with_thunder(message_id: str, api_token: str, account_config: Dict) -> Dict:
    """Verify slip with Thunder API using account token"""
    try:
        # ดาวน์โหลดรูปจาก LINE
        line_token = account_config.get("line_channel_access_token")
        
        url = f"https://api-data.line.me/v2/bot/message/{message_id}/content"
        headers = {"Authorization": f"Bearer {line_token}"}
        
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, timeout=30)
            if resp.status_code != 200:
                return {"status": "error", "message": "ไม่สามารถดาวน์โหลดรูปได้"}
            
            image_data = resp.content
        
        # ส่งไปยัง Thunder API
        thunder_url = "https://api.thunder.in.th/v1/verify"
        headers = {"Authorization": f"Bearer {api_token}"}
        files = {"file": ("slip.jpg", image_data, "image/jpeg")}
        data = {"checkDuplicate": "true"}
        
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                thunder_url,
                headers=headers,
                files=files,
                data=data,
                timeout=60
            )
            
            if resp.status_code == 200:
                result = resp.json()
                if result.get("status") == 200:
                    return {
                        "status": "success",
                        "data": result.get("data", {}),
                        "verified_by": "Thunder API"
                    }
            elif resp.status_code == 400:
                result = resp.json()
                if result.get("message") == "duplicate_slip":
                    return {
                        "status": "duplicate",
                        "data": result.get("data", {}),
                        "message": "สลิปนี้เคยถูกใช้แล้ว"
                    }
        
        return {"status": "error", "message": "ตรวจสอบสลิปไม่สำเร็จ"}
        
    except Exception as e:
        logger.error(f"❌ Thunder API error: {e}")
        return {"status": "error", "message": str(e)}

async def verify_with_kbank(bank_code: str, trans_ref: str, consumer_id: str, consumer_secret: str) -> Dict:
    """Verify slip with KBank API using account credentials"""
    try:
        import base64
        
        # Get OAuth token
        oauth_url = "https://openapi-sandbox.kasikornbank.com/v2/oauth/token"
        credentials = f"{consumer_id}:{consumer_secret}"
        encoded = base64.b64encode(credentials.encode()).decode()
        
        headers = {
            "Authorization": f"Basic {encoded}",
            "Content-Type": "application/x-www-form-urlencoded"
        }
        data = "grant_type=client_credentials"
        
        async with httpx.AsyncClient() as client:
            resp = await client.post(oauth_url, headers=headers, data=data, timeout=30)
            if resp.status_code != 200:
                return {"status": "error", "message": "ไม่สามารถขอ OAuth token ได้"}
            
            access_token = resp.json().get("access_token")
        
        # Verify slip
        verify_url = "https://openapi-sandbox.kasikornbank.com/v1/verslip/kbank/verify"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        payload = {
            "rqUID": f"req_{trans_ref}",
            "rqDt": datetime.now().isoformat(),
            "data": {
                "sendingBank": bank_code,
                "transRef": trans_ref
            }
        }
        
        async with httpx.AsyncClient() as client:
            resp = await client.post(verify_url, headers=headers, json=payload, timeout=30)
            
            if resp.status_code == 200:
                result = resp.json()
                return {
                    "status": "success",
                    "data": result.get("data", {}),
                    "verified_by": "KBank API"
                }
        
        return {"status": "error", "message": "ตรวจสอบสลิปไม่สำเร็จ"}
        
    except Exception as e:
        logger.error(f"❌ KBank API error: {e}")
        return {"status": "error", "message": str(e)}

async def check_slip_text(text: str, account_config: Dict) -> Dict:
    """Extract slip info from text"""
    import re
    
    trans_ref_patterns = [
        r'ref[\s:]*([0-9A-Za-z]{10,})',
        r'([0-9A-Za-z]{12,})'
    ]
    
    bank_patterns = [
        r'bank[\s:]*([0-9]{3})',
        r'([0-9]{3})[\s]*ธนาคาร'
    ]
    
    trans_ref = None
    bank_code = None
    
    text_lower = text.lower()
    
    for pattern in trans_ref_patterns:
        match = re.search(pattern, text_lower)
        if match:
            trans_ref = match.group(1)
            break
    
    for pattern in bank_patterns:
        match = re.search(pattern, text_lower)
        if match:
            bank_code = match.group(1)
            break
    
    if not bank_code and trans_ref:
        bank_code = "004"  # Default KBank
    
    return {
        "bank_code": bank_code,
        "trans_ref": trans_ref
    }

async def send_line_push_flex_with_account(user_id: str, messages: list, account_config: Dict):
    """Send flex message with account token"""
    try:
        access_token = account_config.get("line_channel_access_token")
        if not access_token:
            return False
            
        url = "https://api.line.me/v2/bot/message/push"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        payload = {
            "to": user_id,
            "messages": messages[:5]
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, json=payload)
            return response.status_code == 200
            
    except Exception as e:
        logger.error(f"❌ Push flex error: {e}")
        return False
