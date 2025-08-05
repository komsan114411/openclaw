# services/kbank_checker.py - แก้ไขปัญหา token และรองรับการตั้งค่าจากหลังบ้าน
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
            self.base_url = "https://openapi-sandbox.kasikornbank.com"
            logger.info("🧪 Using KBank Sandbox Environment")
        else:
            self.base_url = "https://openapi.kasikornbank.com"
            logger.info("🏦 Using KBank Production Environment")
            
        self.oauth_url = f"{self.base_url}/v2/oauth/token"
        self.verify_url = f"{self.base_url}/v1/verslip/kbank/verify"
        self._access_token = None
        self._token_expires_at = 0
        
    def _safe_int(self, value: Union[str, int, float], default: int = 1740) -> int:
        """แปลงค่าเป็น int อย่างปลอดภัย"""
        try:
            if isinstance(value, str):
                # ลบ whitespace และตรวจสอบว่าเป็นตัวเลข
                value = value.strip()
                if value.isdigit():
                    return int(value)
                elif '.' in value:
                    return int(float(value))
                else:
                    logger.warning(f"⚠️ Invalid expires_in format: {value}, using default: {default}")
                    return default
            elif isinstance(value, (int, float)):
                return int(value)
            else:
                logger.warning(f"⚠️ Unexpected expires_in type: {type(value)}, using default: {default}")
                return default
        except (ValueError, TypeError) as e:
            logger.warning(f"⚠️ Error parsing expires_in: {e}, using default: {default}")
            return default
    
    def get_credentials(self) -> tuple[str, str]:
        """ดึง credentials จาก config หรือใช้ default สำหรับ sandbox"""
        consumer_id = config_manager.get("kbank_consumer_id", "").strip()
        consumer_secret = config_manager.get("kbank_consumer_secret", "").strip()
        
        # ถ้าเป็น sandbox และไม่มี credentials ให้ใช้ example credentials
        if self.is_sandbox and (not consumer_id or not consumer_secret):
            consumer_id = "suDxvMLTLYsQwL1R0L9UL1m8Ceoibmcr"
            consumer_secret = "goOfPtGLoGxYP3DG"
            logger.info("🧪 Using KBank Sandbox example credentials")
        
        return consumer_id, consumer_secret
    
    def update_credentials(self, consumer_id: str, consumer_secret: str, save_to_config: bool = True):
        """อัปเดต credentials และบันทึกลง config (ถ้าต้องการ)"""
        if save_to_config:
            success = config_manager.update_multiple({
                "kbank_consumer_id": consumer_id.strip(),
                "kbank_consumer_secret": consumer_secret.strip()
            })
            if success:
                logger.info("✅ KBank credentials updated in config")
            else:
                logger.error("❌ Failed to save KBank credentials to config")
        
        # ล้าง token cache เพื่อใช้ credentials ใหม่
        self.clear_token_cache()
        
    def set_environment(self, is_sandbox: bool = True, save_to_config: bool = True):
        """เปลี่ยน environment (sandbox/production)"""
        self.is_sandbox = is_sandbox
        
        if is_sandbox:
            self.base_url = "https://openapi-sandbox.kasikornbank.com"
            logger.info("🧪 Switched to KBank Sandbox Environment")
        else:
            self.base_url = "https://openapi.kasikornbank.com"
            logger.info("🏦 Switched to KBank Production Environment")
            
        self.oauth_url = f"{self.base_url}/v2/oauth/token"
        self.verify_url = f"{self.base_url}/v1/verslip/kbank/verify"
        
        if save_to_config:
            config_manager.update("kbank_sandbox_mode", is_sandbox)
        
        # ล้าง token cache เมื่อเปลี่ยน environment
        self.clear_token_cache()
        
    def _get_access_token(self) -> Optional[str]:
        """ขอ OAuth 2.0 access token ตาม KBank Documentation"""
        try:
            # ตรวจสอบว่า token ยังไม่หมดอายุ (เหลือเวลาอย่างน้อย 2 นาที)
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
            logger.info(f"🔑 Consumer Secret: {consumer_secret[:10]}...")
            logger.info(f"🔑 URL: {self.oauth_url}")
                
            # สร้าง Basic Auth header ตาม KBank specification
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
            
            response = requests.post(
                self.oauth_url,
                headers=headers,
                data=data,
                timeout=30
            )
            
            logger.info(f"🔑 OAuth response status: {response.status_code}")
            logger.info(f"🔑 OAuth response body: {response.text}")
            
            if response.status_code != 200:
                logger.error(f"❌ KBank OAuth failed: HTTP {response.status_code}")
                logger.error(f"❌ Response: {response.text}")
                return None
            
            try:
                token_data = response.json()
                logger.info(f"🔑 Token response parsed successfully")
            except ValueError as e:
                logger.error(f"❌ KBank OAuth response is not valid JSON: {response.text}")
                return None
            
            access_token = token_data.get("access_token")
            
            if not access_token:
                logger.error(f"❌ No access_token in response")
                logger.error(f"❌ Available fields: {list(token_data.keys()) if isinstance(token_data, dict) else 'Not a dict'}")
                return None
            
            # แก้ไขปัญหา expires_in ที่อาจเป็น string
            expires_in_raw = token_data.get("expires_in", 1740)
            expires_in = self._safe_int(expires_in_raw, 1740)
            
            logger.info(f"🔑 Raw expires_in: {expires_in_raw} (type: {type(expires_in_raw)})")
            logger.info(f"🔑 Parsed expires_in: {expires_in} seconds")
            
            self._access_token = access_token
            self._token_expires_at = time.time() + expires_in - 120  # ลบ 2 นาทีเพื่อ safety margin
            
            logger.info(f"✅ KBank OAuth Success!")
            logger.info(f"✅ Token type: {token_data.get('token_type', 'N/A')}")
            logger.info(f"✅ Expires in: {expires_in} seconds ({expires_in/60:.1f} minutes)")
            logger.info(f"✅ Token preview: {access_token[:50]}...")
            logger.info(f"✅ Token will be refreshed at: {datetime.fromtimestamp(self._token_expires_at).strftime('%Y-%m-%d %H:%M:%S')}")
            
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
            
            logger.info(f"🔍 Sending verify request to {self.verify_url}")
            
            response = requests.post(
                self.verify_url,
                headers=headers,
                json=payload,
                timeout=30
            )
            
            logger.info(f"🔍 Verify response status: {response.status_code}")
            logger.info(f"🔍 Verify response: {response.text}")
            
            if response.status_code != 200:
                error_msg = f"KBank API HTTP {response.status_code}"
                if response.status_code == 401:
                    error_msg = "Access token หมดอายุหรือไม่ถูกต้อง"
                    self.clear_token_cache()  # ล้าง token เก่า
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
                    
                    # ข้อมูลผู้ส่ง
                    "sender": data.get("senderName", data.get("senderAccount", "ผู้ส่ง")),
                    "sender_name_th": data.get("senderName", ""),
                    "sender_bank": self._get_bank_short(sending_bank_id),
                    "sender_bank_short": self._get_bank_short(sending_bank_id),
                    
                    # ข้อมูลผู้รับ
                    "receiver_name": data.get("receiverName", data.get("receiverAccount", "ผู้รับ")),
                    "receiver_name_th": data.get("receiverName", ""),
                    "receiver_bank": "KBANK",
                    "receiver_bank_short": "KBANK",
                    
                    # ข้อมูลการตรวจสอบ
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
            
            return {
                "status": "success",
                "message": f"KBank {'Sandbox' if self.is_sandbox else 'Production'} API connection test successful",
                "environment": "Sandbox" if self.is_sandbox else "Production",
                "oauth_test": True,
                "token_preview": access_token[:30] + "..." if access_token else None,
                "credentials_from": "config" if config_manager.get("kbank_consumer_id") else "sandbox_example"
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
            "credentials_source": "config" if config_manager.get("kbank_consumer_id") else "sandbox_example",
            "has_cached_token": bool(self._access_token),
            "token_expires_at": datetime.fromtimestamp(self._token_expires_at).isoformat() if self._token_expires_at > 0 else None,
            "token_valid": time.time() < (self._token_expires_at - 120) if self._token_expires_at > 0 else False
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

# ฟังก์ชันสำหรับใช้งานจาก API endpoints
def update_kbank_credentials(consumer_id: str, consumer_secret: str, 
                           is_sandbox: bool = True, enabled: bool = True) -> Dict[str, Any]:
    """อัปเดต KBank credentials จาก admin interface"""
    try:
        # อัปเดต credentials
        kbank_checker.update_credentials(consumer_id, consumer_secret, save_to_config=True)
        
        # ตั้งค่า environment
        kbank_checker.set_environment(is_sandbox, save_to_config=True)
        
        # เปิด/ปิดการใช้งาน
        config_manager.update("kbank_enabled", enabled)
        
        # ทดสอบการเชื่อมต่อ
        test_result = kbank_checker.test_connection()
        
        return {
            "status": "success",
            "message": "อัปเดต KBank credentials สำเร็จ",
            "connection_test": test_result,
            "current_status": kbank_checker.get_status()
        }
        
    except Exception as e:
        logger.exception(f"❌ Error updating KBank credentials: {e}")
        return {
            "status": "error",
            "message": f"เกิดข้อผิดพลาดในการอัปเดต credentials: {str(e)}"
        }

def test_kbank_with_credentials(consumer_id: str, consumer_secret: str, 
                              is_sandbox: bool = True) -> Dict[str, Any]:
    """ทดสอบ KBank API ด้วย credentials ที่กำหนด (ไม่บันทึกลง config)"""
    try:
        # สำรองค่าเดิม
        original_status = kbank_checker.get_status()
        
        # ตั้งค่าชั่วคราว
        kbank_checker.set_environment(is_sandbox, save_to_config=False)
        kbank_checker.update_credentials(consumer_id, consumer_secret, save_to_config=False)
        
        # ทดสอบ
        test_result = kbank_checker.test_connection()
        
        # คืนค่าเดิม (ถ้าจำเป็น)
        if original_status["credentials_source"] == "config":
            original_id = config_manager.get("kbank_consumer_id", "")
            original_secret = config_manager.get("kbank_consumer_secret", "")
            kbank_checker.update_credentials(original_id, original_secret, save_to_config=False)
        
        kbank_checker.set_environment(original_status["environment"] == "Sandbox", save_to_config=False)
        
        return test_result
        
    except Exception as e:
        logger.exception(f"❌ Error testing KBank credentials: {e}")
        return {
            "status": "error",
            "message": f"เกิดข้อผิดพลาดในการทดสอบ: {str(e)}"
        }
