# services/kbank_checker.py (แก้ไขใหม่สำหรับ Sandbox)
import logging
import requests
import base64
import json
import uuid
import time
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from utils.config_manager import config_manager

logger = logging.getLogger("kbank_checker_service")

class KBankSlipChecker:
    def __init__(self):
        # ใช้ Sandbox URL สำหรับทดสอบ
        self.base_url = "https://openapi-sandbox.kasikornbank.com"
        self.oauth_url = f"{self.base_url}/v2/oauth/token"
        self.verify_url = f"{self.base_url}/v1/verslip/kbank/verify"
        self._access_token = None
        self._token_expires_at = 0
        
    def _get_access_token(self) -> Optional[str]:
    """ขอ OAuth 2.0 access token สำหรับ Sandbox Environment"""
    try:
        # ตรวจสอบว่า token ยังไม่หมดอายุ
        if self._access_token and time.time() < self._token_expires_at:
            logger.info("🔑 Using cached access token")
            return self._access_token
        
        consumer_id = config_manager.get("kbank_consumer_id", "").strip()
        consumer_secret = config_manager.get("kbank_consumer_secret", "").strip()
        
        if not consumer_id or not consumer_secret:
            logger.error("❌ ไม่พบ KBank Consumer ID หรือ Secret")
            return None
            
        logger.info(f"🔑 === KBANK SANDBOX OAUTH START ===")
        logger.info(f"🔑 Consumer ID: {consumer_id}")
        logger.info(f"🔑 Consumer Secret: {consumer_secret[:10]}...")
        logger.info(f"🔑 URL: {self.oauth_url}")
            
        # สร้าง Basic Auth header ตาม KBank Sandbox specification
        credentials = f"{consumer_id}:{consumer_secret}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()
        
        # Headers สำหรับ Sandbox Environment
        headers = {
            "Authorization": f"Basic {encoded_credentials}",
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "User-Agent": "LINE-OA-Middleware/2.0",
            # Sandbox specific headers
            "x-test-mode": "true",
            "env-id": "OAUTH2"
        }
        
        data = "grant_type=client_credentials"
        
        logger.info(f"🔑 Sending OAuth request to Sandbox...")
        
        response = requests.post(
            self.oauth_url,
            headers=headers,
            data=data,
            timeout=30
        )
        
        logger.info(f"🔑 OAuth response status: {response.status_code}")
        logger.info(f"🔑 OAuth response body: {response.text}")
        
        if response.status_code != 200:
            logger.error(f"❌ KBank OAuth failed: {response.status_code}")
            logger.error(f"❌ Response: {response.text}")
            return None
        
        try:
            token_data = response.json()
            logger.info(f"🔑 Token response parsed: {json.dumps(token_data, indent=2)}")
        except ValueError:
            logger.error(f"❌ KBank OAuth response is not valid JSON: {response.text}")
            return None
        
        access_token = token_data.get("access_token")
        
        if not access_token:
            logger.error(f"❌ No access token in response")
            return None
        
        expires_in = token_data.get("expires_in", 1800)
        self._access_token = access_token
        self._token_expires_at = time.time() + expires_in - 60
        
        logger.info(f"✅ KBank Sandbox OAuth Success!")
        logger.info(f"✅ Token preview: {access_token[:30]}...")
        
        return access_token
        
    except Exception as e:
        logger.exception(f"❌ เกิดข้อผิดพลาดในการขอ KBank token: {e}")
        return None
    
    def verify_slip(self, sending_bank_id: str, trans_ref: str) -> Dict[str, Any]:
        """ตรวจสอบสลิปด้วย KBank Sandbox API"""
        try:
            if not config_manager.get("kbank_enabled", False):
                return {"status": "error", "message": "ระบบตรวจสอบสลิป KBank ถูกปิดใช้งาน"}
                
            logger.info(f"🏦 === KBANK SANDBOX SLIP VERIFICATION START ===")
            logger.info(f"🏦 Bank ID: {sending_bank_id}")
            logger.info(f"🏦 Trans Ref: {trans_ref}")
            
            # ขอ access token
            access_token = self._get_access_token()
            if not access_token:
                return {"status": "error", "message": "ไม่สามารถขอ OAuth token จาก KBank Sandbox ได้"}
                
            # เตรียมข้อมูลส่ง request สำหรับ Sandbox
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "LINE-OA-Middleware/2.0",
                # Sandbox specific headers
                "x-test-mode": "true",
                "env-id": "VERSLIP"
            }
            
            # สร้าง request payload
            request_id = uuid.uuid4().hex
            request_time = datetime.now(timezone.utc).isoformat()
            
            payload = {
                "rqUID": request_id,
                "rqDt": request_time,
                "data": {
                    "sendingBank": sending_bank_id,
                    "transRef": trans_ref
                }
            }
            
            logger.info(f"🔍 Sending verify request to Sandbox...")
            logger.info(f"🔍 Payload: {json.dumps(payload, indent=2)}")
            
            response = requests.post(
                self.verify_url,
                headers=headers,
                json=payload,
                timeout=30
            )
            
            logger.info(f"🔍 Verify response status: {response.status_code}")
            logger.info(f"🔍 Verify response: {response.text}")
            
            if response.status_code != 200:
                return {"status": "error", "message": f"KBank Sandbox API HTTP {response.status_code}"}
            
            try:
                result = response.json()
            except ValueError:
                return {"status": "error", "message": "KBank API ตอบกลับข้อมูลที่ไม่ใช่ JSON"}
            
            # ประมวลผลผลลัพธ์
            status_code = result.get("status_code") or result.get("statusCode")
            status_message = result.get("status_message") or result.get("message", "")
            
            if status_code == "200" or status_code == 200 or status_message == "SUCCESS":
                data = result.get("data", {})
                
                return {
                    "status": "success",
                    "type": "kbank_sandbox",
                    "data": {
                        "amount": str(data.get("amount", "1000")),
                        "amount_display": f"฿{float(data.get('amount', 1000)):,.0f}",
                        "reference": trans_ref,
                        "date": data.get("transDate", datetime.now().strftime("%d/%m/%Y")),
                        "time": data.get("transTime", datetime.now().strftime("%H:%M:%S")),
                        "sender": data.get("senderAccount", "TEST SENDER"),
                        "receiver_name": data.get("receiverAccount", "TEST RECEIVER"),
                        "sender_bank": self._get_bank_short(sending_bank_id),
                        "receiver_bank": "KBANK",
                        "verified_by": "KBank Sandbox API"
                    }
                }
            else:
                return {"status": "error", "message": f"KBank Sandbox API Error: {status_message}"}
                
        except Exception as e:
            logger.exception(f"❌ KBank Sandbox verification error: {e}")
            return {"status": "error", "message": f"KBank Sandbox verification failed: {str(e)}"}
    
    def _get_bank_short(self, bank_id: str) -> str:
        """แปลงรหัสธนาคารเป็นชื่อย่อ"""
        bank_shorts = {
            "002": "BBL", "004": "KBANK", "006": "KTB", "011": "TMB",
            "014": "SCB", "025": "BAY", "030": "GSB", "017": "BAAC"
        }
        return bank_shorts.get(bank_id, bank_id)

# สร้าง instance สำหรับใช้งานทั่วระบบ
kbank_checker = KBankSlipChecker()
