# services/kbank_checker.py - อัปเดตเพื่อข้าม Two-way SSL
import logging
import requests
import base64
import json
import uuid
import time
from datetime import datetime, timezone
from typing import Dict, Any, Optional, Union
from utils.config_manager import config_manager

logger = logging.getLogger("kbank_checker_service")

class KBankSlipChecker:
    def __init__(self):
        # ตั้งค่า environment จาก config (default เป็น sandbox)
        self.is_sandbox = config_manager.get("kbank_sandbox_mode", True)
        
        if self.is_sandbox:
            # ใช้ Sandbox URL ที่ไม่ต้องใช้ Two-way SSL
            self.base_url = "https://openapi-sandbox.kasikornbank.com"
            logger.info("🧪 Using KBank Sandbox Environment (No SSL required)")
        else:
            # สำหรับ Production ต้องมี SSL Certificate
            self.base_url = "https://openapi.kasikornbank.com"
            logger.info("🏦 Using KBank Production Environment (SSL required)")
            
        self.oauth_url = f"{self.base_url}/v2/oauth/token"
        
        # เปลี่ยน verify URL เป็น endpoint ที่ใช้งานได้
        if self.is_sandbox:
            # ใช้ API endpoint ที่ไม่ต้องการ Two-way SSL
            self.verify_url = f"{self.base_url}/v1/verslip/kbank/verify"
        else:
            # Production ต้องใช้ SSL
            self.verify_url = f"{self.base_url}/v1/verslip/kbank/verify"
            
        self._access_token = None
        self._token_expires_at = 0
    
    def _create_session_with_ssl(self):
        """สร้าง requests session พร้อม SSL configuration"""
        session = requests.Session()
        
        # สำหรับ Sandbox ไม่ต้องใช้ SSL certificate
        if self.is_sandbox:
            session.verify = True  # ยังคงตรวจสอบ SSL ของเซิร์ฟเวอร์
            logger.info("🧪 Using standard SSL verification for Sandbox")
            return session
        
        # สำหรับ Production ต้องมี SSL certificate
        ssl_cert_path = config_manager.get("kbank_ssl_cert_path", "")
        ssl_key_path = config_manager.get("kbank_ssl_key_path", "")
        
        if ssl_cert_path and ssl_key_path:
            try:
                session.cert = (ssl_cert_path, ssl_key_path)
                session.verify = True
                logger.info("🔒 Using Two-way SSL authentication")
            except Exception as e:
                logger.error(f"❌ SSL certificate error: {e}")
                raise Exception("SSL certificate configuration failed")
        else:
            logger.warning("⚠️ Production mode requires SSL certificate")
            raise Exception("SSL certificate required for Production")
        
        return session
    
    def _get_access_token(self) -> Optional[str]:
        """ขอ OAuth 2.0 access token"""
        try:
            # ตรวจสอบว่า token ยังไม่หมดอายุ
            if self._access_token and time.time() < (self._token_expires_at - 120):
                logger.info("🔑 Using cached access token")
                return self._access_token
            
            consumer_id, consumer_secret = self.get_credentials()
            
            if not consumer_id or not consumer_secret:
                logger.error("❌ ไม่พบ KBank Consumer ID หรือ Secret")
                return None
                
            logger.info(f"🔑 === KBANK OAUTH START ===")
            logger.info(f"🔑 Environment: {'Sandbox' if self.is_sandbox else 'Production'}")
            logger.info(f"🔑 Consumer ID: {consumer_id}")
            logger.info(f"🔑 URL: {self.oauth_url}")
                
            # สร้าง Basic Auth header
            credentials = f"{consumer_id}:{consumer_secret}"
            encoded_credentials = base64.b64encode(credentials.encode('utf-8')).decode('utf-8')
            
            # Headers
            headers = {
                "Authorization": f"Basic {encoded_credentials}",
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
                "User-Agent": "LINE-OA-Middleware/2.0"
            }
            
            # เพิ่ม sandbox specific headers
            if self.is_sandbox:
                headers["x-test-mode"] = "true"
                headers["env-id"] = "OAUTH2"
            
            data = "grant_type=client_credentials"
            
            # สร้าง session (มี SSL หรือไม่ก็ได้)
            session = self._create_session_with_ssl()
            
            logger.info(f"🔑 Sending OAuth request...")
            
            response = session.post(
                self.oauth_url,
                headers=headers,
                data=data,
                timeout=30
            )
            
            session.close()
            
            logger.info(f"🔑 OAuth response status: {response.status_code}")
            
            if response.status_code != 200:
                logger.error(f"❌ KBank OAuth failed: HTTP {response.status_code}")
                logger.error(f"❌ Response: {response.text}")
                return None
            
            try:
                token_data = response.json()
            except ValueError as e:
                logger.error(f"❌ Invalid JSON response: {response.text}")
                return None
            
            access_token = token_data.get("access_token")
            
            if not access_token:
                logger.error(f"❌ No access_token in response")
                return None
            
            # แก้ไขปัญหา expires_in
            expires_in_raw = token_data.get("expires_in", 1740)
            expires_in = self._safe_int(expires_in_raw, 1740)
            
            self._access_token = access_token
            self._token_expires_at = time.time() + expires_in - 120
            
            logger.info(f"✅ KBank OAuth Success!")
            logger.info(f"✅ Token preview: {access_token[:50]}...")
            
            return access_token
            
        except Exception as e:
            logger.exception(f"❌ เกิดข้อผิดพลาดในการขอ KBank token: {e}")
            return None
    
    def verify_slip(self, sending_bank_id: str, trans_ref: str) -> Dict[str, Any]:
        """ตรวจสอบสลิปด้วย KBank API"""
        try:
            if not config_manager.get("kbank_enabled", False):
                return {"status": "error", "message": "ระบบตรวจสอบสลิป KBank ถูกปิดใช้งาน"}
            
            # ตรวจสอบว่าเป็น Production และไม่มี SSL certificate
            if not self.is_sandbox:
                ssl_cert = config_manager.get("kbank_ssl_cert_path", "")
                ssl_key = config_manager.get("kbank_ssl_key_path", "")
                
                if not ssl_cert or not ssl_key:
                    return {
                        "status": "error", 
                        "message": "Production environment ต้องการ SSL Certificate\nกรุณาใช้ Sandbox mode สำหรับการทดสอบ"
                    }
                
            logger.info(f"🏦 === KBANK SLIP VERIFICATION START ===")
            logger.info(f"🏦 Environment: {'Sandbox' if self.is_sandbox else 'Production'}")
            logger.info(f"🏦 Bank ID: {sending_bank_id}")
            logger.info(f"🏦 Trans Ref: {trans_ref}")
            
            # ขอ access token
            access_token = self._get_access_token()
            if not access_token:
                return {"status": "error", "message": "ไม่สามารถขอ OAuth token จาก KBank ได้"}
                
            # เตรียมข้อมูลส่ง request
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "LINE-OA-Middleware/2.0"
            }
            
            # เพิ่ม sandbox specific headers
            if self.is_sandbox:
                headers["x-test-mode"] = "true"
                headers["env-id"] = "VERSLIP"
            
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
            
            logger.info(f"🔍 Sending verify request to {self.verify_url}")
            
            # สร้าง session พร้อม SSL (ถ้าจำเป็น)
            session = self._create_session_with_ssl()
            
            response = session.post(
                self.verify_url,
                headers=headers,
                json=payload,
                timeout=30
            )
            
            session.close()
            
            logger.info(f"🔍 Verify response status: {response.status_code}")
            logger.info(f"🔍 Verify response: {response.text}")
            
            if response.status_code != 200:
                error_msg = f"KBank API HTTP {response.status_code}"
                if response.status_code == 401:
                    error_msg = "Access token หมดอายุหรือไม่ถูกต้อง"
                    self.clear_token_cache()
                elif response.status_code == 403:
                    error_msg = "ไม่มีสิทธิ์เข้าถึง KBank API หรือต้องการ SSL Certificate"
                elif response.status_code == 404:
                    error_msg = "ไม่พบข้อมูลสลิปในระบบธนาคาร"
                elif response.status_code == 429:
                    error_msg = "เรียก API เกินจำนวนที่กำหนด"
                elif response.status_code >= 500:
                    error_msg = "เซิร์ฟเวอร์ KBank มีปัญหา"
                    
                return {"status": "error", "message": error_msg}
            
            try:
                result = response.json()
            except ValueError:
                return {"status": "error", "message": "KBank API ตอบกลับข้อมูลที่ไม่ใช่ JSON"}
            
            # ประมวลผลผลลัพธ์
            status_code = result.get("status_code") or result.get("statusCode")
            status_message = result.get("status_message") or result.get("message", "")
            
            if status_code == "200" or status_code == 200 or status_message == "SUCCESS":
                data = result.get("data", {})
                
                slip_data = {
                    "amount": str(data.get("amount", "0")),
                    "amount_display": f"฿{float(data.get('amount', 0)):,.0f}",
                    "reference": trans_ref,
                    "trans_ref": trans_ref,
                    "date": data.get("transDate", datetime.now().strftime("%d/%m/%Y")),
                    "time": data.get("transTime", datetime.now().strftime("%H:%M:%S")),
                    
                    "sender": data.get("senderName", data.get("senderAccount", "ผู้ส่ง")),
                    "sender_name_th": data.get("senderName", ""),
                    "sender_bank": self._get_bank_short(sending_bank_id),
                    "sender_bank_short": self._get_bank_short(sending_bank_id),
                    
                    "receiver_name": data.get("receiverName", data.get("receiverAccount", "ผู้รับ")),
                    "receiver_name_th": data.get("receiverName", ""),
                    "receiver_bank": "KBANK",
                    "receiver_bank_short": "KBANK",
                    
                    "verified_by": f"KBank {'Sandbox' if self.is_sandbox else 'Production'} API",
                    "verification_time": datetime.now().isoformat(),
                    "request_id": request_id,
                }
                
                return {
                    "status": "success",
                    "type": f"kbank_{'sandbox' if self.is_sandbox else 'production'}",
                    "data": slip_data,
                    "message": "ตรวจสอบสลิปสำเร็จ"
                }
                
            elif status_code == "404" or status_message == "NOT_FOUND":
                return {
                    "status": "not_found",
                    "message": "ไม่พบข้อมูลสลิปในระบบธนาคาร"
                }
            else:
                return {
                    "status": "error",
                    "message": f"KBank API Error: {status_message or 'Unknown error'}"
                }
                
        except Exception as e:
            logger.exception(f"❌ KBank verification error: {e}")
            return {"status": "error", "message": f"เกิดข้อผิดพลาดไม่คาดคิด: {str(e)}"}
    
    # เหลือ methods อื่นๆ เหมือนเดิม...
    def get_credentials(self) -> tuple[str, str]:
        consumer_id = config_manager.get("kbank_consumer_id", "").strip()
        consumer_secret = config_manager.get("kbank_consumer_secret", "").strip()
        
        if self.is_sandbox and (not consumer_id or not consumer_secret):
            consumer_id = "suDxvMLTLYsQwL1R0L9UL1m8Ceoibmcr"
            consumer_secret = "goOfPtGLoGxYP3DG"
            logger.info("🧪 Using KBank Sandbox example credentials")
        
        return consumer_id, consumer_secret
    
    def _safe_int(self, value: Union[str, int, float], default: int = 1740) -> int:
        try:
            if isinstance(value, str):
                value = value.strip()
                if value.isdigit():
                    return int(value)
                elif '.' in value:
                    return int(float(value))
                else:
                    return default
            elif isinstance(value, (int, float)):
                return int(value)
            else:
                return default
        except (ValueError, TypeError):
            return default
    
    def _get_bank_short(self, bank_id: str) -> str:
        bank_shorts = {
            "002": "BBL", "004": "KBANK", "006": "KTB", "011": "TMB",
            "014": "SCB", "025": "BAY", "030": "GSB", "017": "BAAC"
        }
        return bank_shorts.get(bank_id, bank_id)
    
    def clear_token_cache(self):
        self._access_token = None
        self._token_expires_at = 0
        logger.info("🔄 KBank token cache cleared")

# สร้าง instance สำหรับใช้งานทั่วระบบ
kbank_checker = KBankSlipChecker()
