# services/kbank_checker.py
import logging
import requests
import base64
import json
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from utils.config_manager import config_manager

logger = logging.getLogger("kbank_checker_service")

class KBankSlipChecker:
    def __init__(self):
        # ใช้ Production URL แทน Sandbox
        self.base_url = "https://openapi.kasikornbank.com"  # Production
        self.oauth_url = f"{self.base_url}/v2/oauth/token"
        
    def _get_access_token(self) -> Optional[str]:
        """ขอ OAuth 2.0 access token ด้วย Client Credentials flow"""
        try:
            consumer_id = config_manager.get("kbank_consumer_id", "").strip()
            consumer_secret = config_manager.get("kbank_consumer_secret", "").strip()
            
            if not consumer_id or not consumer_secret:
                logger.error("❌ ไม่พบ KBank Consumer ID หรือ Secret")
                return None
            
            # ตรวจสอบว่าค่าไม่ใช่ "undefined" หรือค่าเริ่มต้น
            if consumer_id in ["undefined", "your_consumer_id", ""] or consumer_secret in ["undefined", "your_consumer_secret", ""]:
                logger.error("❌ KBank credentials ยังไม่ได้ตั้งค่าหรือมีค่า placeholder")
                return None
                
            # สร้าง Basic Auth header
            credentials = f"{consumer_id}:{consumer_secret}"
            encoded_credentials = base64.b64encode(credentials.encode()).decode()
            
            headers = {
                "Authorization": f"Basic {encoded_credentials}",
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
                "User-Agent": "Python-KBank-Client/1.0"
            }
            
            data = "grant_type=client_credentials"
            
            logger.info(f"🔑 Requesting KBank OAuth token from {self.oauth_url}")
            response = requests.post(
                self.oauth_url,
                headers=headers,
                data=data,
                timeout=30
            )
            
            logger.info(f"🔑 KBank OAuth response: {response.status_code}")
            
            if response.status_code == 401:
                logger.error(f"❌ KBank OAuth 401 Unauthorized - ตรวจสอบ Consumer ID และ Secret")
                return None
            elif response.status_code == 403:
                logger.error(f"❌ KBank OAuth 403 Forbidden - บัญชีอาจถูกระงับหรือไม่มีสิทธิ์")
                return None
            elif response.status_code != 200:
                logger.error(f"❌ KBank OAuth failed: {response.status_code} - {response.text}")
                return None
            
            token_data = response.json()
            access_token = token_data.get("access_token")
            
            if not access_token:
                logger.error(f"❌ No access token in response: {token_data}")
                return None
            
            expires_in = token_data.get("expires_in", 1800)
            token_type = token_data.get("token_type", "Bearer")
            logger.info(f"✅ ได้รับ KBank {token_type} access token แล้ว หมดอายุใน {expires_in} วินาที")
            return access_token
            
        except requests.exceptions.Timeout:
            logger.error(f"❌ KBank OAuth timeout")
            return None
        except requests.exceptions.ConnectionError:
            logger.error(f"❌ ไม่สามารถเชื่อมต่อกับ KBank OAuth ได้")
            return None
        except Exception as e:
            logger.error(f"❌ เกิดข้อผิดพลาดในการขอ KBank token: {e}")
            return None
    
    def verify_slip(self, sending_bank_id: str, trans_ref: str) -> Dict[str, Any]:
        """ตรวจสอบสลิปด้วย KBank API"""
        try:
            if not config_manager.get("kbank_enabled", False):
                return {"status": "error", "message": "ระบบตรวจสอบสลิป KBank ถูกปิดใช้งาน"}
                
            # ขอ access token
            access_token = self._get_access_token()
            if not access_token:
                return {"status": "error", "message": "ไม่สามารถยืนยันตัวตนกับ KBank API ได้"}
                
            # เตรียมข้อมูลส่ง request
            verify_url = f"{self.base_url}/v1/verslip/kbank/verify"
            
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "Python-KBank-Client/1.0"
            }
            
            # สร้าง request ID และ timestamp ที่ไม่ซ้ำ
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
            
            logger.info(f"🔍 กำลังตรวจสอบสลิปด้วย KBank API: Bank {sending_bank_id}, Ref {trans_ref}")
            logger.info(f"📋 Request URL: {verify_url}")
            logger.info(f"📋 Request ID: {request_id}")
            
            response = requests.post(
                verify_url,
                headers=headers,
                json=payload,
                timeout=30
            )
            
            logger.info(f"📋 KBank API response: {response.status_code}")
            response_preview = response.text[:200] + "..." if len(response.text) > 200 else response.text
            logger.info(f"📋 Response preview: {response_preview}")
            
            if response.status_code == 401:
                return {"status": "error", "message": "KBank API: ไม่มีสิทธิ์เข้าถึง (401)"}
            elif response.status_code == 403:
                return {"status": "error", "message": "KBank API: การเข้าถึงถูกปฏิเสธ (403)"}
            elif response.status_code == 404:
                return {"status": "error", "message": "KBank API: ไม่พบ endpoint (404)"}
            elif response.status_code != 200:
                return {"status": "error", "message": f"KBank API HTTP {response.status_code}: {response.text[:100]}"}
            
            try:
                result = response.json()
            except ValueError:
                return {"status": "error", "message": "KBank API ตอบกลับข้อมูลที่ไม่ใช่ JSON"}
            
            # แปลงผล response จาก KBank
            status_code = result.get("status_code")
            status_message = result.get("status_message", "")
            
            logger.info(f"📊 KBank response: status_code={status_code}, message={status_message}")
            
            if status_code == "200" and status_message == "SUCCESS":
                data = result.get("data", {})
                return {
                    "status": "success",
                    "type": "kbank",
                    "data": {
                        "amount": str(data.get("amount", "0")),
                        "sender_account": data.get("senderAccount", ""),
                        "receiver_account": data.get("receiverAccount", ""),
                        "trans_date": data.get("transDate", ""),
                        "trans_time": data.get("transTime", ""),
                        "bank_code": sending_bank_id,
                        "reference": trans_ref,
                        "verified_by": "KBank API"
                    }
                }
            else:
                # จัดการข้อผิดพลาดเฉพาะ
                if "INVALID" in status_message.upper():
                    error_msg = "ข้อมูลสลิปไม่ถูกต้องหรือไม่พบในระบบ KBank"
                elif "NOT_FOUND" in status_message.upper():
                    error_msg = "ไม่พบรายการโอนเงินนี้ในระบบ KBank"
                elif "TIMEOUT" in status_message.upper():
                    error_msg = "KBank API ตอบสนองช้า กรุณาลองใหม่"
                else:
                    error_msg = f"KBank API: {status_message}"
                    
                return {"status": "error", "message": error_msg}
                
        except requests.exceptions.Timeout:
            logger.error(f"❌ KBank API timeout")
            return {"status": "error", "message": "KBank API ตอบสนองช้าเกินไป กรุณาลองใหม่"}
        except requests.exceptions.ConnectionError:
            logger.error(f"❌ KBank API connection error")
            return {"status": "error", "message": "ไม่สามารถเชื่อมต่อกับ KBank API ได้"}
        except Exception as e:
            logger.error(f"❌ เกิดข้อผิดพลาดในการตรวจสอบสลิป KBank: {e}")
            return {"status": "error", "message": f"การตรวจสอบสลิป KBank ล้มเหลว: {str(e)}"}

# สร้าง instance สำหรับใช้งานทั่วระบบ
kbank_checker = KBankSlipChecker()
