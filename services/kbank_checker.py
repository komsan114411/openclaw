# services/kbank_checker.py - อัปเดตให้ใช้งานได้จริง
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
        # ใช้ Sandbox เป็นหลัก (ไม่ต้องใช้ SSL Certificate)
        self.is_sandbox = config_manager.get("kbank_sandbox_mode", True)
        
        if self.is_sandbox:
            # Sandbox URLs (ไม่ต้องใช้ Two-way SSL)
            self.base_url = "https://openapi-sandbox.kasikornbank.com"
            self.oauth_url = f"{self.base_url}/v2/oauth/token"
            self.verify_url = f"{self.base_url}/v1/verslip/kbank/verify"
            logger.info("🧪 Using KBank Sandbox Environment (No SSL required)")
        else:
            # Production URLs (ต้องใช้ Two-way SSL)
            self.base_url = "https://openapi.kasikornbank.com"
            self.oauth_url = f"{self.base_url}/v2/oauth/token"
            self.verify_url = f"{self.base_url}/v1/verslip/kbank/verify"
            logger.info("🏦 Using KBank Production Environment (SSL required)")
            
        self._access_token = None
        self._token_expires_at = 0
        
        # Default sandbox credentials (ทำงานได้ทันที)
        self.default_sandbox_credentials = {
            "consumer_id": "suDxvMLTLYsQwL1R0L9UL1m8Ceoibmcr",
            "consumer_secret": "goOfPtGLoGxYP3DG"
        }
    
    def get_credentials(self) -> tuple[str, str]:
        """ดึง credentials พร้อม fallback ไปยัง sandbox credentials"""
        consumer_id = config_manager.get("kbank_consumer_id", "").strip()
        consumer_secret = config_manager.get("kbank_consumer_secret", "").strip()
        
        # ถ้าไม่มี credentials ใน config ให้ใช้ sandbox default
        if not consumer_id or not consumer_secret:
            if self.is_sandbox:
                consumer_id = self.default_sandbox_credentials["consumer_id"]
                consumer_secret = self.default_sandbox_credentials["consumer_secret"]
                logger.info("🧪 Using default KBank Sandbox credentials")
            else:
                logger.error("❌ Production requires valid credentials")
                return "", ""
        
        return consumer_id, consumer_secret
    
    def _safe_int(self, value: Union[str, int, float], default: int = 1740) -> int:
        """แปลงค่าเป็น int อย่างปลอดภัย"""
        try:
            if isinstance(value, str):
                value = value.strip()
                if value.isdigit():
                    return int(value)
                elif '.' in value:
                    return int(float(value))
            elif isinstance(value, (int, float)):
                return int(value)
            return default
        except (ValueError, TypeError):
            return default
    
    def _get_access_token(self) -> Optional[str]:
        """ขอ OAuth 2.0 access token"""
        try:
            # ตรวจสอบ token cache
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
            
            # Headers สำหรับ OAuth
            headers = {
                "Authorization": f"Basic {encoded_credentials}",
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
                "User-Agent": "LINE-OA-Middleware/2.0"
            }
            
            # เพิ่ม sandbox headers ถ้าจำเป็น
            if self.is_sandbox:
                headers["x-test-mode"] = "true"
                headers["env-id"] = "OAUTH2"
                logger.info("🧪 Added sandbox headers")
            
            data = "grant_type=client_credentials"
            
            logger.info(f"🔑 Sending OAuth request...")
            
            # ส่ง request (ไม่ต้องใช้ SSL certificate สำหรับ sandbox)
            response = requests.post(
                self.oauth_url,
                headers=headers,
                data=data,
                timeout=30,
                verify=True  # ตรวจสอบ SSL ของเซิร์ฟเวอร์ปกติ
            )
            
            logger.info(f"🔑 OAuth response status: {response.status_code}")
            
            if response.status_code != 200:
                logger.error(f"❌ KBank OAuth failed: HTTP {response.status_code}")
                logger.error(f"❌ Response: {response.text}")
                return None
            
            try:
                token_data = response.json()
                logger.info(f"🔑 Token response parsed successfully")
            except ValueError as e:
                logger.error(f"❌ Invalid JSON response: {response.text}")
                return None
            
            access_token = token_data.get("access_token")
            
            if not access_token:
                logger.error(f"❌ No access_token in response")
                logger.error(f"❌ Available fields: {list(token_data.keys())}")
                return None
            
            # จัดการ expires_in
            expires_in_raw = token_data.get("expires_in", 1740)
            expires_in = self._safe_int(expires_in_raw, 1740)
            
            self._access_token = access_token
            self._token_expires_at = time.time() + expires_in - 120
            
            logger.info(f"✅ KBank OAuth Success!")
            logger.info(f"✅ Token type: {token_data.get('token_type', 'Bearer')}")
            logger.info(f"✅ Expires in: {expires_in} seconds ({expires_in/60:.1f} minutes)")
            logger.info(f"✅ Token preview: {access_token[:50]}...")
            
            return access_token
            
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Request error: {e}")
            return None
        except Exception as e:
            logger.exception(f"❌ Unexpected error: {e}")
            return None
    
    def verify_slip(self, sending_bank_id: str, trans_ref: str) -> Dict[str, Any]:
        """ตรวจสอบสลิปด้วย KBank API"""
        try:
            if not config_manager.get("kbank_enabled", False):
                return {"status": "error", "message": "ระบบตรวจสอบสลิป KBank ถูกปิดใช้งาน"}
            
            # เตือนถ้าใช้ Production โดยไม่มี SSL
            if not self.is_sandbox:
                return {
                    "status": "error", 
                    "message": "Production environment ต้องการ SSL Certificate\nกรุณาเปลี่ยนเป็น Sandbox mode สำหรับการทดสอบ"
                }
                
            logger.info(f"🏦 === KBANK SLIP VERIFICATION START ===")
            logger.info(f"🏦 Environment: {'Sandbox' if self.is_sandbox else 'Production'}")
            logger.info(f"🏦 Bank ID: {sending_bank_id}")
            logger.info(f"🏦 Trans Ref: {trans_ref}")
            
            # ขอ access token
            access_token = self._get_access_token()
            if not access_token:
                return {"status": "error", "message": "ไม่สามารถขอ OAuth token จาก KBank ได้"}
                
            # Headers สำหรับ API call
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "LINE-OA-Middleware/2.0"
            }
            
            # เพิ่ม sandbox headers
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
            logger.info(f"🔍 Payload: {json.dumps(payload, indent=2)}")
            
            # ส่ง request
            response = requests.post(
                self.verify_url,
                headers=headers,
                json=payload,
                timeout=30,
                verify=True
            )
            
            logger.info(f"🔍 Verify response status: {response.status_code}")
            logger.info(f"🔍 Verify response: {response.text}")
            
            # จัดการ response
            if response.status_code != 200:
                error_msg = self._handle_http_error(response.status_code, response.text)
                return {"status": "error", "message": error_msg}
            
            try:
                result = response.json()
            except ValueError:
                return {"status": "error", "message": "KBank API ตอบกลับข้อมูลที่ไม่ใช่ JSON"}
            
            # ประมวลผลผลลัพธ์
            return self._process_slip_response(result, trans_ref, sending_bank_id, request_id)
                
        except Exception as e:
            logger.exception(f"❌ KBank verification error: {e}")
            return {"status": "error", "message": f"เกิดข้อผิดพลาดไม่คาดคิด: {str(e)}"}
    
    def _handle_http_error(self, status_code: int, response_text: str) -> str:
        """จัดการ HTTP error codes"""
        if status_code == 401:
            self.clear_token_cache()  # ล้าง token cache
            return "Access token หมดอายุหรือไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง"
        elif status_code == 403:
            return "ไม่มีสิทธิ์เข้าถึง KBank API หรือต้องการ SSL Certificate"
        elif status_code == 404:
            return "ไม่พบข้อมูลสลิปในระบบธนาคาร"
        elif status_code == 429:
            return "เรียก API เกินจำนวนที่กำหนด กรุณารอสักครู่แล้วลองใหม่"
        elif status_code >= 500:
            return "เซิร์ฟเวอร์ KBank มีปัญหา กรุณาลองใหม่ในภายหลัง"
        else:
            return f"KBank API HTTP {status_code}: {response_text[:100]}"
    
    def _process_slip_response(self, result: dict, trans_ref: str, 
                             sending_bank_id: str, request_id: str) -> Dict[str, Any]:
        """ประมวลผลการตอบกลับจาก slip verification API"""
        status_code = result.get("status_code") or result.get("statusCode")
        status_message = result.get("status_message") or result.get("message", "")
        
        logger.info(f"🔍 API Status Code: {status_code}")
        logger.info(f"🔍 API Status Message: {status_message}")
        
        if status_code == "200" or status_code == 200 or status_message == "SUCCESS":
            data = result.get("data", {})
            
            # สร้างข้อมูลสลิปมาตรฐาน
            slip_data = {
                "amount": str(data.get("amount", "1000")),
                "amount_display": f"฿{float(data.get('amount', 1000)):,.0f}",
                "reference": trans_ref,
                "trans_ref": trans_ref,
                "date": data.get("transDate", datetime.now().strftime("%d/%m/%Y")),
                "time": data.get("transTime", datetime.now().strftime("%H:%M:%S")),
                
                # ข้อมูลผู้ส่ง
                "sender": data.get("senderName", data.get("senderAccount", "ผู้ส่งทดสอบ")),
                "sender_name_th": data.get("senderName", "ผู้ส่งทดสอบ"),
                "sender_bank": self._get_bank_short(sending_bank_id),
                "sender_bank_short": self._get_bank_short(sending_bank_id),
                
                # ข้อมูลผู้รับ
                "receiver_name": data.get("receiverName", data.get("receiverAccount", "ผู้รับทดสอบ")),
                "receiver_name_th": data.get("receiverName", "ผู้รับทดสอบ"),
                "receiver_bank": "KBANK",
                "receiver_bank_short": "KBANK",
                
                # ข้อมูลการตรวจสอบ
                "verified_by": f"KBank {'Sandbox' if self.is_sandbox else 'Production'} API",
                "verification_time": datetime.now().isoformat(),
                "request_id": request_id,
                
                # Raw data สำหรับ debug
                "raw_data": data
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
                "message": "ไม่พบข้อมูลสลิปในระบบธนาคาร",
                "suggestions": [
                    "ตรวจสอบหมายเลขอ้างอิงให้ถูกต้อง",
                    "ตรวจสอบรหัสธนาคารผู้ส่ง", 
                    "สลิปอาจยังไม่อัปเดตในระบบธนาคาร"
                ]
            }
        else:
            return {
                "status": "error",
                "message": f"KBank API Error: {status_message or 'Unknown error'}",
                "status_code": status_code
            }
    
    def test_connection(self) -> Dict[str, Any]:
        """ทดสอบการเชื่อมต่อ KBank API"""
        try:
            logger.info("🧪 Testing KBank API connection...")
            
            # ทดสอบ OAuth
            access_token = self._get_access_token()
            if not access_token:
                return {
                    "status": "error",
                    "message": "ไม่สามารถขอ OAuth token ได้",
                    "oauth_test": False
                }
            
            # ทดสอบ API call ด้วยข้อมูลตัวอย่าง
            if self.is_sandbox:
                test_result = self.verify_slip("004", "TEST123456789")
                api_test_success = test_result.get("status") in ["success", "not_found"]
            else:
                api_test_success = "skipped"  # ข้าม API test สำหรับ production
            
            return {
                "status": "success",
                "message": f"KBank {'Sandbox' if self.is_sandbox else 'Production'} API connection successful",
                "environment": "Sandbox" if self.is_sandbox else "Production",
                "oauth_test": True,
                "api_test": api_test_success,
                "token_preview": access_token[:30] + "..." if access_token else None,
                "credentials_used": "default_sandbox" if self.is_sandbox and not config_manager.get("kbank_consumer_id") else "config"
            }
                
        except Exception as e:
            logger.exception(f"❌ KBank connection test error: {e}")
            return {
                "status": "error",
                "message": f"Connection test failed: {str(e)}",
                "oauth_test": False,
                "api_test": False
            }
    
    def get_status(self) -> Dict[str, Any]:
        """ดึงสถานะปัจจุบันของ KBank checker"""
        consumer_id, consumer_secret = self.get_credentials()
        
        return {
            "environment": "Sandbox" if self.is_sandbox else "Production",
            "base_url": self.base_url,
            "enabled": config_manager.get("kbank_enabled", False),
            "configured": bool(consumer_id and consumer_secret),
            "credentials_source": "config" if config_manager.get("kbank_consumer_id") else "default_sandbox",
            "has_cached_token": bool(self._access_token),
            "token_expires_at": datetime.fromtimestamp(self._token_expires_at).isoformat() if self._token_expires_at > 0 else None,
            "token_valid": time.time() < (self._token_expires_at - 120) if self._token_expires_at > 0 else False,
            "ssl_required": not self.is_sandbox
        }
    
    def _get_bank_short(self, bank_id: str) -> str:
        """แปลงรหัสธนาคารเป็นชื่อย่อ"""
        bank_shorts = {
            "002": "BBL", "004": "KBANK", "006": "KTB", "011": "TMB",
            "014": "SCB", "025": "BAY", "030": "GSB", "017": "BAAC"
        }
        return bank_shorts.get(bank_id, bank_id)
    
    def clear_token_cache(self):
        """ล้าง token cache"""
        self._access_token = None
        self._token_expires_at = 0
        logger.info("🔄 KBank token cache cleared")

# สร้าง instance สำหรับใช้งานทั่วระบบ
kbank_checker = KBankSlipChecker()
