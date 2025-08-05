# services/kbank_checker.py - ปรับปรุงสำหรับ KBank Production API
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
        # ใช้ Production URL หรือ Sandbox URL
        self.is_sandbox = config_manager.get("kbank_sandbox_mode", True)  # เปลี่ยนเป็น False สำหรับ Production
        
        if self.is_sandbox:
            self.base_url = "https://openapi-sandbox.kasikornbank.com"
            logger.info("🧪 Using KBank Sandbox Environment")
        else:
            self.base_url = "https://openapi.kasikornbank.com"
            logger.info("🏦 Using KBank Production Environment")
            
        self.oauth_url = f"{self.base_url}/v2/oauth/token"
        self.verify_url = f"{self.base_url}/v1/verslip/kbank/verify"
        self._access_token = None
        self._token_expires_at = 0
        
    def _get_access_token(self) -> Optional[str]:
        """ขอ OAuth 2.0 access token ตาม KBank Documentation"""
        try:
            # ตรวจสอบว่า token ยังไม่หมดอายุ (เหลือเวลาอย่างน้อย 2 นาที)
            if self._access_token and time.time() < (self._token_expires_at - 120):
                logger.info("🔑 Using cached access token")
                return self._access_token
            
            consumer_id = config_manager.get("kbank_consumer_id", "").strip()
            consumer_secret = config_manager.get("kbank_consumer_secret", "").strip()
            
            # ถ้าเป็น sandbox ให้ใช้ example credentials
            if self.is_sandbox and (not consumer_id or not consumer_secret):
                consumer_id = "suDxvMLTLYsQwL1R0L9UL1m8Ceoibmcr"
                consumer_secret = "goOfPtGLoGxYP3DG"
                logger.info("🧪 Using KBank Sandbox example credentials")
            
            if not consumer_id or not consumer_secret:
                logger.error("❌ ไม่พบ KBank Consumer ID หรือ Secret")
                return None
                
            logger.info(f"🔑 === KBANK OAUTH START ===")
            logger.info(f"🔑 Environment: {'Sandbox' if self.is_sandbox else 'Production'}")
            logger.info(f"🔑 Consumer ID: {consumer_id}")
            logger.info(f"🔑 Consumer Secret: {consumer_secret[:10]}...")
            logger.info(f"🔑 URL: {self.oauth_url}")
                
            # สร้าง Basic Auth header ตาม KBank specification
            # Format: <Consumer ID>:<Consumer Secret>
            credentials = f"{consumer_id}:{consumer_secret}"
            encoded_credentials = base64.b64encode(credentials.encode('utf-8')).decode('utf-8')
            
            logger.info(f"🔑 Base64 Credentials: {encoded_credentials[:30]}...")
            
            # Headers ตาม KBank OAuth Documentation
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
                logger.info("🧪 Added sandbox headers")
            
            # Body ตาม KBank specification
            data = "grant_type=client_credentials"
            
            logger.info(f"🔑 Sending OAuth request...")
            logger.info(f"🔑 Headers: {json.dumps({k: v for k, v in headers.items() if k != 'Authorization'}, indent=2)}")
            
            response = requests.post(
                self.oauth_url,
                headers=headers,
                data=data,
                timeout=30
            )
            
            logger.info(f"🔑 OAuth response status: {response.status_code}")
            logger.info(f"🔑 OAuth response headers: {dict(response.headers)}")
            logger.info(f"🔑 OAuth response body: {response.text}")
            
            if response.status_code != 200:
                logger.error(f"❌ KBank OAuth failed: HTTP {response.status_code}")
                logger.error(f"❌ Response: {response.text}")
                return None
            
            try:
                token_data = response.json()
                logger.info(f"🔑 Token response parsed: {json.dumps(token_data, indent=2)}")
            except ValueError as e:
                logger.error(f"❌ KBank OAuth response is not valid JSON: {response.text}")
                return None
            
            access_token = token_data.get("access_token")
            
            if not access_token:
                logger.error(f"❌ No access token in response")
                logger.error(f"❌ Available fields: {list(token_data.keys()) if isinstance(token_data, dict) else 'Not a dict'}")
                return None
            
            # อายุของ token (default 1740 วินาที = 29 นาที)
            expires_in = token_data.get("expires_in", 1740)
            self._access_token = access_token
            self._token_expires_at = time.time() + expires_in - 120  # ลบ 2 นาทีเพื่อ safety margin
            
            logger.info(f"✅ KBank OAuth Success!")
            logger.info(f"✅ Token type: {token_data.get('token_type', 'N/A')}")
            logger.info(f"✅ Expires in: {expires_in} seconds ({expires_in/60:.1f} minutes)")
            logger.info(f"✅ Token preview: {access_token[:50]}...")
            
            return access_token
            
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ KBank OAuth request error: {e}")
            return None
        except Exception as e:
            logger.exception(f"❌ เกิดข้อผิดพลาดในการขอ KBank token: {e}")
            return None
    
    def verify_slip(self, sending_bank_id: str, trans_ref: str) -> Dict[str, Any]:
        """ตรวจสอบสลิปด้วย KBank API"""
        try:
            if not config_manager.get("kbank_enabled", False):
                return {"status": "error", "message": "ระบบตรวจสอบสลิป KBank ถูกปิดใช้งาน"}
                
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
            
            # สร้าง request payload ตาม KBank API specification
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
            
            logger.info(f"🔍 Sending verify request...")
            logger.info(f"🔍 URL: {self.verify_url}")
            logger.info(f"🔍 Headers: {json.dumps({k: v for k, v in headers.items() if k != 'Authorization'}, indent=2)}")
            logger.info(f"🔍 Payload: {json.dumps(payload, indent=2)}")
            
            response = requests.post(
                self.verify_url,
                headers=headers,
                json=payload,
                timeout=30
            )
            
            logger.info(f"🔍 Verify response status: {response.status_code}")
            logger.info(f"🔍 Verify response headers: {dict(response.headers)}")
            logger.info(f"🔍 Verify response: {response.text}")
            
            if response.status_code != 200:
                error_msg = f"KBank API HTTP {response.status_code}"
                if response.status_code == 401:
                    error_msg = "Access token หมดอายุหรือไม่ถูกต้อง"
                    # ลบ token เก่าให้ขอใหม่ครั้งต่อไป
                    self._access_token = None
                    self._token_expires_at = 0
                elif response.status_code == 403:
                    error_msg = "ไม่มีสิทธิ์เข้าถึง KBank API"
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
            
            # ประมวลผลผลลัพธ์ตาม KBank API response structure
            status_code = result.get("status_code") or result.get("statusCode")
            status_message = result.get("status_message") or result.get("message", "")
            
            logger.info(f"🔍 API Status Code: {status_code}")
            logger.info(f"🔍 API Status Message: {status_message}")
            
            if status_code == "200" or status_code == 200 or status_message == "SUCCESS":
                data = result.get("data", {})
                
                # แปลงข้อมูลเป็นรูปแบบมาตรฐาน
                slip_data = {
                    "amount": str(data.get("amount", "0")),
                    "amount_display": f"฿{float(data.get('amount', 0)):,.0f}",
                    "reference": trans_ref,
                    "trans_ref": trans_ref,
                    "date": data.get("transDate", datetime.now().strftime("%d/%m/%Y")),
                    "time": data.get("transTime", datetime.now().strftime("%H:%M:%S")),
                    "trans_date": data.get("transDate", ""),
                    "trans_time": data.get("transTime", ""),
                    
                    # ข้อมูลผู้ส่ง
                    "sender": data.get("senderName", data.get("senderAccount", "ผู้ส่ง")),
                    "sender_name_th": data.get("senderName", ""),
                    "sender_name_en": data.get("senderNameEn", ""),
                    "sender_account": data.get("senderAccount", ""),
                    "sender_bank": self._get_bank_short(sending_bank_id),
                    "sender_bank_id": sending_bank_id,
                    "sender_bank_name": self._get_bank_name(sending_bank_id),
                    "sender_bank_short": self._get_bank_short(sending_bank_id),
                    
                    # ข้อมูลผู้รับ
                    "receiver": data.get("receiverName", data.get("receiverAccount", "ผู้รับ")),
                    "receiver_name": data.get("receiverName", data.get("receiverAccount", "ผู้รับ")),
                    "receiver_name_th": data.get("receiverName", ""),
                    "receiver_name_en": data.get("receiverNameEn", ""),
                    "receiver_account": data.get("receiverAccount", ""),
                    "receiver_bank": "KBANK",
                    "receiver_bank_id": "004",
                    "receiver_bank_name": "ธนาคารกสิกรไทย",
                    "receiver_bank_short": "KBANK",
                    
                    # ข้อมูลเพิ่มเติม
                    "fee": data.get("fee", 0),
                    "channel": data.get("channel", ""),
                    "location": data.get("location", ""),
                    
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
            elif status_code == "400" or status_message == "BAD_REQUEST":
                return {
                    "status": "error",
                    "message": "ข้อมูลที่ส่งไม่ถูกต้อง",
                    "details": result.get("details", [])
                }
            elif status_code == "401" or status_message == "UNAUTHORIZED":
                return {
                    "status": "error",
                    "message": "Access token หมดอายุ กรุณาลองใหม่อีกครั้ง"
                }
            elif status_code == "403" or status_message == "FORBIDDEN":
                return {
                    "status": "error",
                    "message": "ไม่มีสิทธิ์เข้าถึง KBank API"
                }
            elif status_code == "429" or status_message == "TOO_MANY_REQUESTS":
                return {
                    "status": "error",
                    "message": "เรียก API เกินจำนวนที่กำหนด กรุณารอสักครู่"
                }
            else:
                return {
                    "status": "error",
                    "message": f"KBank API Error: {status_message or 'Unknown error'}",
                    "status_code": status_code
                }
                
        except requests.exceptions.Timeout:
            logger.error(f"❌ KBank API timeout")
            return {"status": "error", "message": "KBank API ตอบสนองช้าเกินไป"}
        except requests.exceptions.ConnectionError:
            logger.error(f"❌ KBank API connection error")
            return {"status": "error", "message": "ไม่สามารถเชื่อมต่อกับ KBank API ได้"}
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ KBank API request error: {e}")
            return {"status": "error", "message": f"เกิดข้อผิดพลาดในการเชื่อมต่อ: {str(e)}"}
        except Exception as e:
            logger.exception(f"❌ KBank verification error: {e}")
            return {"status": "error", "message": f"เกิดข้อผิดพลาดไม่คาดคิด: {str(e)}"}
    
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
                    "oauth_test": False,
                    "api_test": False
                }
            
            # ทดสอบ API call ด้วยข้อมูลตัวอย่าง
            if self.is_sandbox:
                # ใช้ข้อมูล test สำหรับ sandbox
                test_result = self.verify_slip("004", "TEST123456789")
                
                return {
                    "status": "success",
                    "message": "KBank API connection test successful",
                    "environment": "Sandbox",
                    "oauth_test": True,
                    "api_test": test_result.get("status") in ["success", "not_found"],  # not_found ก็ถือว่า API ทำงาน
                    "test_result": test_result
                }
            else:
                # Production - เพียงทดสอบ OAuth
                return {
                    "status": "success",
                    "message": "KBank OAuth test successful",
                    "environment": "Production",
                    "oauth_test": True,
                    "api_test": "not_tested",
                    "note": "API test skipped in production environment"
                }
                
        except Exception as e:
            logger.exception(f"❌ KBank connection test error: {e}")
            return {
                "status": "error",
                "message": f"Connection test failed: {str(e)}",
                "oauth_test": False,
                "api_test": False
            }
    
    def _get_bank_name(self, bank_id: str) -> str:
        """แปลงรหัสธนาคารเป็นชื่อเต็ม"""
        bank_names = {
            "002": "ธนาคารกรุงเทพ", 
            "004": "ธนาคารกสิกรไทย", 
            "006": "ธนาคารกรุงไทย", 
            "011": "ธนาคารทหารไทยธนชาต",
            "014": "ธนาคารไทยพาณิชย์", 
            "025": "ธนาคารกรุงศรีอยุธยา", 
            "030": "ธนาคารออมสิน", 
            "017": "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร"
        }
        return bank_names.get(bank_id, f"ธนาคารรหัส {bank_id}")
    
    def _get_bank_short(self, bank_id: str) -> str:
        """แปลงรหัสธนาคารเป็นชื่อย่อ"""
        bank_shorts = {
            "002": "BBL", 
            "004": "KBANK", 
            "006": "KTB", 
            "011": "TMB",
            "014": "SCB", 
            "025": "BAY", 
            "030": "GSB", 
            "017": "BAAC"
        }
        return bank_shorts.get(bank_id, bank_id)
    
    def clear_token_cache(self):
        """ล้าง token cache"""
        self._access_token = None
        self._token_expires_at = 0
        logger.info("🔄 KBank token cache cleared")

# สร้าง instance สำหรับใช้งานทั่วระบบ
kbank_checker = KBankSlipChecker()

# ฟังก์ชันสำหรับทดสอบ
def test_kbank_oauth(consumer_id: str = None, consumer_secret: str = None) -> Dict[str, Any]:
    """ทดสอบ KBank OAuth โดยตรง"""
    try:
        # ใช้ credentials ที่ส่งมาหรือใช้จาก config
        if consumer_id and consumer_secret:
            original_id = config_manager.get("kbank_consumer_id")
            original_secret = config_manager.get("kbank_consumer_secret")
            
            config_manager.config["kbank_consumer_id"] = consumer_id
            config_manager.config["kbank_consumer_secret"] = consumer_secret
            
            try:
                # ล้าง token cache
                kbank_checker.clear_token_cache()
                
                # ทดสอบ OAuth
                token = kbank_checker._get_access_token()
                
                if token:
                    return {
                        "status": "success",
                        "message": "KBank OAuth test successful",
                        "token_preview": token[:50] + "...",
                        "token_length": len(token)
                    }
                else:
                    return {
                        "status": "error",
                        "message": "Failed to get OAuth token"
                    }
            finally:
                # คืนค่า config เดิม
                config_manager.config["kbank_consumer_id"] = original_id
                config_manager.config["kbank_consumer_secret"] = original_secret
                kbank_checker.clear_token_cache()
        else:
            return kbank_checker.test_connection()
            
    except Exception as e:
        logger.exception(f"❌ KBank OAuth test error: {e}")
        return {
            "status": "error",
            "message": f"OAuth test failed: {str(e)}"
        }

def test_kbank_slip_verification(consumer_id: str, consumer_secret: str, 
                                bank_id: str, trans_ref: str) -> Dict[str, Any]:
    """ทดสอบ KBank Slip Verification โดยตรง"""
    try:
        original_id = config_manager.get("kbank_consumer_id")
        original_secret = config_manager.get("kbank_consumer_secret")
        original_enabled = config_manager.get("kbank_enabled")
        
        config_manager.config["kbank_consumer_id"] = consumer_id
        config_manager.config["kbank_consumer_secret"] = consumer_secret
        config_manager.config["kbank_enabled"] = True
        
        try:
            # ล้าง token cache
            kbank_checker.clear_token_cache()
            
            # ทดสอบ Slip Verification
            result = kbank_checker.verify_slip(bank_id, trans_ref)
            
            return result
            
        finally:
            # คืนค่า config เดิม
            config_manager.config["kbank_consumer_id"] = original_id
            config_manager.config["kbank_consumer_secret"] = original_secret
            config_manager.config["kbank_enabled"] = original_enabled
            kbank_checker.clear_token_cache()
            
    except Exception as e:
        logger.exception(f"❌ KBank slip verification test error: {e}")
        return {
            "status": "error",
            "message": f"Slip verification test failed: {str(e)}"
        }
