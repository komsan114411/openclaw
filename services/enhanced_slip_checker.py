# services/kbank_checker.py (แก้ไขส่วน OAuth)
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
        # ใช้ Production URL
        self.base_url = "https://openapi.kasikornbank.com"
        self.oauth_url = f"{self.base_url}/v2/oauth/token"
        self.verify_url = f"{self.base_url}/v1/verslip/kbank/verify"
        self._access_token = None
        self._token_expires_at = 0
        
    def _get_access_token(self) -> Optional[str]:
        """ขอ OAuth 2.0 access token ด้วย Client Credentials flow (Fixed format)"""
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
            
            logger.info(f"🔑 === KBANK OAUTH START ===")
            logger.info(f"🔑 Consumer ID: {consumer_id}")
            logger.info(f"🔑 Consumer Secret: {consumer_secret[:10]}***")
            logger.info(f"🔑 URL: {self.oauth_url}")
                
            # สร้าง Basic Auth header ตาม KBank OAuth 2.0 spec
            credentials = f"{consumer_id}:{consumer_secret}"
            encoded_credentials = base64.b64encode(credentials.encode('utf-8')).decode('utf-8')
            
            logger.info(f"🔑 Credentials (raw): {consumer_id}:{consumer_secret[:10]}***")
            logger.info(f"🔑 Credentials (base64): {encoded_credentials}")
            
            # Headers ตาม KBank specification
            headers = {
                "Authorization": f"Basic {encoded_credentials}",
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
                "User-Agent": "KBank-Client/1.0",
                "Cache-Control": "no-cache"
            }
            
            # Body data - ต้องเป็น form-urlencoded
            form_data = "grant_type=client_credentials"
            
            logger.info(f"🔑 Headers:")
            for key, value in headers.items():
                if key == "Authorization":
                    logger.info(f"    {key}: Basic {encoded_credentials[:20]}...")
                else:
                    logger.info(f"    {key}: {value}")
            
            logger.info(f"🔑 Form data: {form_data}")
            logger.info(f"🔑 Sending OAuth request...")
            
            # ส่ง request
            response = requests.post(
                self.oauth_url,
                headers=headers,
                data=form_data,  # ใช้ data ไม่ใช่ json
                timeout=30,
                allow_redirects=False
            )
            
            logger.info(f"🔑 === OAUTH RESPONSE ===")
            logger.info(f"🔑 Status Code: {response.status_code}")
            logger.info(f"🔑 Response Headers:")
            for key, value in response.headers.items():
                logger.info(f"    {key}: {value}")
            
            response_text = response.text
            logger.info(f"🔑 Response Body: {response_text}")
            
            # ตรวจสอบสถานะ
            if response.status_code == 200:
                try:
                    token_data = response.json()
                    logger.info(f"🔑 Parsed JSON: {json.dumps(token_data, indent=2)}")
                    
                    access_token = token_data.get("access_token")
                    if access_token:
                        expires_in = token_data.get("expires_in", 1800)
                        token_type = token_data.get("token_type", "Bearer")
                        
                        # Cache token
                        self._access_token = access_token
                        self._token_expires_at = time.time() + expires_in - 60
                        
                        logger.info(f"✅ === OAUTH SUCCESS ===")
                        logger.info(f"✅ Token Type: {token_type}")
                        logger.info(f"✅ Expires In: {expires_in} seconds")
                        logger.info(f"✅ Token: {access_token[:30]}...")
                        
                        return access_token
                    else:
                        logger.error("❌ No access_token in response")
                        return None
                        
                except json.JSONDecodeError as e:
                    logger.error(f"❌ Invalid JSON response: {e}")
                    return None
                    
            elif response.status_code == 400:
                logger.error(f"❌ OAuth 400 Bad Request")
                logger.error(f"❌ Request format may be incorrect")
                logger.error(f"❌ Response: {response_text}")
                
                # ลองแปลง response ดู
                try:
                    error_data = response.json()
                    error_msg = error_data.get("error_description", error_data.get("error", "Bad Request"))
                    logger.error(f"❌ Error: {error_msg}")
                except:
                    pass
                return None
                
            elif response.status_code == 401:
                logger.error(f"❌ OAuth 401 Unauthorized")
                logger.error(f"❌ Consumer ID หรือ Secret ไม่ถูกต้อง")
                logger.error(f"❌ ตรวจสอบ credentials ในหน้า Settings")
                return None
                
            elif response.status_code == 403:
                logger.error(f"❌ OAuth 403 Forbidden")
                logger.error(f"❌ บัญชีถูกระงับหรือไม่มีสิทธิ์")
                return None
                
            else:
                logger.error(f"❌ OAuth failed with status {response.status_code}")
                logger.error(f"❌ Response: {response_text}")
                return None
            
        except requests.exceptions.Timeout:
            logger.error(f"❌ KBank OAuth timeout")
            return None
        except requests.exceptions.ConnectionError:
            logger.error(f"❌ Cannot connect to KBank OAuth")
            return None
        except Exception as e:
            logger.exception(f"❌ OAuth exception: {e}")
            return None
    
    def verify_slip(self, sending_bank_id: str, trans_ref: str) -> Dict[str, Any]:
        """ตรวจสอบสลิปด้วย KBank API"""
        try:
            if not config_manager.get("kbank_enabled", False):
                return {"status": "error", "message": "ระบบตรวจสอบสลิป KBank ถูกปิดใช้งาน"}
                
            logger.info(f"🏦 === KBANK SLIP VERIFICATION START ===")
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
                "User-Agent": "KBank-Client/1.0"
            }
            
            # สร้าง request payload
            request_id = uuid.uuid4().hex
            request_time = datetime.now(timezone.utc).isoformat()
            
            payload = {
                "rqUID": request_id,
                "rqDt": request_time,
                "data": {
                    "sendingBank": str(sending_bank_id).zfill(3),  # ให้เป็น 3 หลัก
                    "transRef": str(trans_ref)
                }
            }
            
            logger.info(f"🔍 Verify request:")
            logger.info(f"🔍 URL: {self.verify_url}")
            logger.info(f"🔍 Payload: {json.dumps(payload, indent=2)}")
            
            response = requests.post(
                self.verify_url,
                headers=headers,
                json=payload,
                timeout=30
            )
            
            logger.info(f"🔍 Verify response: {response.status_code}")
            logger.info(f"🔍 Response: {response.text}")
            
            if response.status_code == 200:
                try:
                    result = response.json()
                    status_code = result.get("status_code")
                    status_message = result.get("status_message", "")
                    
                    if status_code == "200" and status_message == "SUCCESS":
                        data = result.get("data", {})
                        
                        return {
                            "status": "success",
                            "type": "kbank",
                            "data": {
                                "amount": str(data.get("amount", "0")),
                                "amount_display": f"฿{float(data.get('amount', 0)):,.0f}",
                                "reference": trans_ref,
                                "date": data.get("transDate", ""),
                                "time": data.get("transTime", ""),
                                "sender": data.get("senderAccount", ""),
                                "receiver_name": data.get("receiverAccount", ""),
                                "sender_bank": self._get_bank_short(sending_bank_id), 
                                "receiver_bank": "KBANK",
                                "verified_by": "KBank API",
                                "raw_data": data
                            }
                        }
                    else:
                        return {"status": "error", "message": f"KBank: {status_message}"}
                        
                except json.JSONDecodeError:
                    return {"status": "error", "message": "KBank response is not valid JSON"}
            else:
                return {"status": "error", "message": f"KBank API HTTP {response.status_code}"}
                
        except Exception as e:
            logger.exception(f"❌ KBank verify error: {e}")
            return {"status": "error", "message": f"KBank verification failed: {str(e)}"}
    
    def _get_bank_short(self, bank_id: str) -> str:
        """แปลงรหัสธนาคารเป็นชื่อย่อ"""
        bank_shorts = {
            "002": "BBL", "004": "KBANK", "006": "KTB", "011": "TMB",
            "014": "SCB", "025": "BAY", "030": "GSB", "017": "BAAC"
        }
        return bank_shorts.get(str(bank_id).zfill(3), bank_id)

# สร้าง instance
kbank_checker = KBankSlipChecker()
